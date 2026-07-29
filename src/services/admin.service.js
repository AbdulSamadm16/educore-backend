const crypto = require('crypto');
const User = require('../models/user.model');
const Enrollment = require('../models/enrollment.model');
const Payment = require('../models/payment.model');
const InstitutionMembership = require('../models/institutionMembership.model');
const { ApiError } = require('../utils/errors');
const { toPublicUser } = require('../utils/userPresenter');
const auditService = require('./audit.service');
const { revokeAllUserSessions } = require('./session.service');
const emailService = require('./email.service');
const institutionService = require('./institution.service');
const razorpay = require('../config/razorpay');
const { hashPassword } = require('../utils/password');
const { normalizeEmail } = require('../utils/normalize');
const env = require('../config/env');
const { ROLES, ACCOUNT_TYPES, isInstitutionAdminRole, isPlatformAdminRole } = require('../utils/roles');

const ensureAdminCanModifyTarget = ({ actor, target, nextRole }) => {
  if (String(actor.id) === String(target._id)) {
    throw new ApiError(400, 'Admins cannot modify their own administrative state', 'SELF_ADMIN_CHANGE_DENIED');
  }

  if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw new ApiError(403, 'Only super admins can modify super admins', 'SUPER_ADMIN_PROTECTED');
  }

  if (nextRole === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw new ApiError(403, 'Only super admins can grant super admin role', 'SUPER_ADMIN_GRANT_DENIED');
  }

  if (nextRole === ROLES.PLATFORM_ADMIN && !isPlatformAdminRole(actor.role)) {
    throw new ApiError(403, 'Only platform admins can grant platform admin role', 'PLATFORM_ADMIN_GRANT_DENIED');
  }
};

const getTutorApprovalContext = async ({ targetUserId }) => {
  const target = await User.findOne({
    _id: targetUserId,
    role: ROLES.TUTOR,
    status: 'pending_approval',
    deletedAt: null
  });

  if (!target) {
    throw new ApiError(404, 'Pending tutor not found', 'USER_NOT_FOUND');
  }

  const InstitutionMembership = require('../models/institutionMembership.model');
  const membership = await InstitutionMembership.findOne({
    userId: targetUserId,
    memberType: 'tutor',
    status: 'pending_approval'
  });

  return { target, membership };
};

const assertCanReviewTutor = ({ actor, target, membership }) => {
  if (isPlatformAdminRole(actor.role)) return;

  const isInstitutionTutor = Boolean(membership) || target.accountType === ACCOUNT_TYPES.INSTITUTION_TUTOR || Boolean(target.institutionId);

  if (
    isInstitutionTutor
    && isInstitutionAdminRole(actor.role)
    && String(actor.institutionId || '') === String((membership?.institutionId || target.institutionId || ''))
  ) {
    return;
  }

  throw new ApiError(403, 'You are not allowed to review this tutor account', 'TUTOR_REVIEW_FORBIDDEN');
};

const isPlatformScopedRole = (role) => isPlatformAdminRole(role);

const ensureActiveInstitutionMembership = async ({ userId, institutionId, memberType, actor }) => {
  if (!institutionId || ![ROLES.LEARNER, ROLES.TUTOR].includes(memberType)) return;

  await InstitutionMembership.updateOne(
    {
      institutionId,
      userId
    },
    {
      $set: {
        memberType,
        status: 'active',
        paymentStatus: 'not_required',
        approvedBy: actor?.id || actor?._id || null,
        approvedAt: new Date()
      },
      $setOnInsert: {
        institutionId,
        userId,
        joinedAt: new Date()
      }
    },
    { upsert: true }
  );
};

const listUsers = async ({ query, actor }) => {
  const filter = {
    deletedAt: null
  };

  if (!isPlatformAdminRole(actor.role)) {
    filter.institutionId = actor.institutionId || null;
  }

  if (query.role) {
    filter.role = query.role;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.search) {
    const search = query.search.trim();
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  if (query.joinedFrom || query.joinedTo) {
    filter.createdAt = {};
    if (query.joinedFrom) {
      filter.createdAt.$gte = new Date(query.joinedFrom);
    }
    if (query.joinedTo) {
      const joinedTo = new Date(query.joinedTo);
      joinedTo.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = joinedTo;
    }
  }

  const skip = (query.page - 1) * query.limit;
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    User.countDocuments(filter)
  ]);

  return {
    message: 'Users retrieved successfully.',
    data: {
      users: users.map(toPublicUser),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit)
      }
    }
  };
};

const setSuspendStatus = async ({ targetUserId, suspended, reason, actor, requestMeta }) => {
  const target = await User.findOne({
    _id: targetUserId,
    deletedAt: null
  });

  if (!target) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  ensureAdminCanModifyTarget({ actor, target });

  if ([ROLES.LEGACY_ADMIN, ROLES.SUPER_ADMIN, ROLES.PLATFORM_OWNER].includes(target.role)) {
    throw new ApiError(403, 'Admin accounts cannot be suspended from this page', 'ADMIN_ACCOUNT_PROTECTED');
  }

  const status = suspended ? 'suspended' : (target.emailVerified ? 'active' : 'pending_verification');
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: targetUserId,
      deletedAt: null
    },
    {
      $set: {
        status,
        failedLoginAttempts: 0,
        lockUntil: null
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (suspended) {
    await revokeAllUserSessions({
      userId: targetUserId,
      reason: 'admin_suspend',
      ip: requestMeta?.ip
    });
  }

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId,
    action: suspended ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
    metadata: {
      reason: reason || ''
    },
    requestMeta
  });

  return {
    message: suspended ? 'User suspended successfully.' : 'User restored successfully.',
    data: {
      user: toPublicUser(updatedUser)
    }
  };
};

const bulkSuspendUsers = async ({ userIds, reason, actor, requestMeta }) => {
  const uniqueUserIds = [...new Set(userIds.map(String))];
  const result = {
    suspended: [],
    failed: []
  };

  for (const userId of uniqueUserIds) {
    try {
      const response = await setSuspendStatus({
        targetUserId: userId,
        suspended: true,
        reason: reason || 'Bulk suspend',
        actor,
        requestMeta
      });
      result.suspended.push(response.data.user);
    } catch (error) {
      result.failed.push({
        userId,
        reason: error.message || 'Failed to suspend user'
      });
    }
  }

  return {
    message: `Bulk suspend completed. Suspended: ${result.suspended.length}, Failed: ${result.failed.length}.`,
    data: result
  };
};

const getUserProfileSummary = async ({ targetUserId, actor }) => {
  const target = await User.findOne({
    _id: targetUserId,
    deletedAt: null
  }).lean();

  if (!target) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (!isPlatformAdminRole(actor.role) && String(target.institutionId || '') !== String(actor.institutionId || '')) {
    throw new ApiError(403, 'You are not allowed to view this user profile', 'USER_PROFILE_FORBIDDEN');
  }

  const AuditLog = require('../models/auditLog.model');
  const [enrollments, payments, activityLog] = await Promise.all([
    Enrollment.find({ userId: targetUserId, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('courseId', 'title status')
      .lean(),
    Payment.find({ learnerId: targetUserId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('courseId', 'title')
      .lean(),
    AuditLog.find({ targetUserId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('actorUserId', 'name email role')
      .lean()
  ]);

  return {
    message: 'User profile summary retrieved successfully.',
    data: {
      user: toPublicUser(target),
      enrollmentHistory: enrollments.map((enrollment) => ({
        id: String(enrollment._id),
        courseTitle: enrollment.courseId?.title || 'Unknown course',
        courseStatus: enrollment.courseId?.status || null,
        status: enrollment.status,
        paymentStatus: enrollment.paymentStatus,
        progressPercentage: enrollment.progressPercentage,
        enrolledAt: enrollment.enrolledAt || enrollment.createdAt
      })),
      paymentHistory: payments.map((payment) => ({
        id: String(payment._id),
        courseTitle: payment.courseId?.title || 'Course access',
        amount: payment.amount,
        currency: payment.currency,
        status: payment.paymentStatus,
        paymentType: payment.paymentType,
        paidAt: payment.paidAt || payment.createdAt,
        transactionId: payment.transactionId
      })),
      activityLog: activityLog.map((log) => ({
        id: String(log._id),
        action: log.action,
        actorName: log.actorUserId?.name || 'System',
        actorRole: log.actorUserId?.role || null,
        metadata: log.metadata || {},
        createdAt: log.createdAt
      }))
    }
  };
};

const setBanStatus = async ({ targetUserId, banned, reason, actor, requestMeta }) => {
  const target = await User.findOne({
    _id: targetUserId,
    deletedAt: null
  });

  if (!target) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  ensureAdminCanModifyTarget({ actor, target });

  const status = banned ? 'banned' : (target.emailVerified ? 'active' : 'pending_verification');
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: targetUserId,
      deletedAt: null
    },
    {
      $set: {
        status,
        failedLoginAttempts: 0,
        lockUntil: null
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (banned) {
    await revokeAllUserSessions({
      userId: targetUserId,
      reason: 'admin_ban',
      ip: requestMeta?.ip
    });

    if (updatedUser.role === 'tutor' && updatedUser.institutionId) {
      try {
        await institutionService.suspendTutorCascade({
          tutorId: targetUserId,
          institutionId: updatedUser.institutionId,
          actorUserId: actor.id
        });
      } catch (err) {
        console.error('[AdminService] Error cascading tutor suspension:', err.message);
      }
    }
  }

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId,
    action: banned ? 'BAN_USER' : 'UNBAN_USER',
    metadata: {
      reason: reason || ''
    },
    requestMeta
  });

  return {
    message: banned ? 'User banned successfully.' : 'User unbanned successfully.',
    data: {
      user: toPublicUser(updatedUser)
    }
  };
};

const changeRole = async ({ targetUserId, role, institutionId, reason, actor, requestMeta }) => {
  const target = await User.findOne({
    _id: targetUserId,
    deletedAt: null
  });

  if (!target) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  ensureAdminCanModifyTarget({
    actor,
    target,
    nextRole: role
  });

  const resolvedInstitutionId = isPlatformScopedRole(role)
    ? null
    : (institutionId !== undefined ? institutionId : target.institutionId);
  const updateFields = { role };
  if (isPlatformScopedRole(role)) {
    updateFields.institutionId = null;
    updateFields.accountType = ACCOUNT_TYPES.PLATFORM_ADMIN;
  } else if (role === ROLES.TUTOR && resolvedInstitutionId) {
    updateFields.institutionId = resolvedInstitutionId;
    updateFields.accountType = ACCOUNT_TYPES.INSTITUTION_TUTOR;
  } else if (role === ROLES.LEARNER && resolvedInstitutionId) {
    updateFields.institutionId = resolvedInstitutionId;
    updateFields.accountType = ACCOUNT_TYPES.INSTITUTION_LEARNER;
  } else if (institutionId !== undefined) {
    updateFields.institutionId = institutionId;
  }

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: targetUserId,
      deletedAt: null
    },
    {
      $set: updateFields
    },
    {
      new: true,
      runValidators: true
    }
  );

  await ensureActiveInstitutionMembership({
    userId: updatedUser._id,
    institutionId: updatedUser.institutionId,
    memberType: updatedUser.role,
    actor
  });

  await revokeAllUserSessions({
    userId: targetUserId,
    reason: 'role_changed',
    ip: requestMeta?.ip
  });

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId,
    action: 'CHANGE_ROLE',
    metadata: {
      previousRole: target.role,
      nextRole: role,
      reason: reason || ''
    },
    requestMeta
  });

  return {
    message: 'User role changed successfully.',
    data: {
      user: toPublicUser(updatedUser)
    }
  };
};

const softDelete = async ({ targetUserId, actor, requestMeta }) => {
  const target = await User.findOne({
    _id: targetUserId,
    deletedAt: null
  });

  if (!target) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  ensureAdminCanModifyTarget({ actor, target });

  const deletedAt = new Date();
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: targetUserId,
      deletedAt: null
    },
    {
      $set: {
        deletedAt,
        status: 'suspended'
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  await revokeAllUserSessions({
    userId: targetUserId,
    reason: 'admin_soft_delete',
    ip: requestMeta?.ip
  });

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId,
    action: 'SOFT_DELETE_USER',
    metadata: {
      deletedAt
    },
    requestMeta
  });

  return {
    message: 'User deleted successfully.',
    data: {
      user: toPublicUser(updatedUser)
    }
  };
};

const approveTutor = async ({ targetUserId, actor, requestMeta }) => {
  const { target, membership } = await getTutorApprovalContext({ targetUserId });

  ensureAdminCanModifyTarget({ actor, target });
  assertCanReviewTutor({ actor, target, membership });

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: targetUserId,
      deletedAt: null
    },
    {
      $set: {
        status: 'active',
        'profile.tutorApproval.rejectionReason': '',
        'profile.tutorApproval.rejectedAt': null
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId,
    action: 'APPROVE_TUTOR',
    metadata: {},
    requestMeta
  });

  if (membership) {
    membership.status = 'active';
    membership.approvedBy = actor.id;
    membership.approvedAt = new Date();
    await membership.save();
  }

  try {
    await emailService.sendTutorApprovedEmail({
      to: updatedUser.email,
      name: updatedUser.name
    });
  } catch (error) {
    // Non-fatal if email fails
  }

  return {
    message: 'Tutor approved successfully.',
    data: {
      user: toPublicUser(updatedUser)
    }
  };
};

const rejectTutor = async ({ targetUserId, reason, actor, requestMeta }) => {
  const { target, membership } = await getTutorApprovalContext({ targetUserId });

  ensureAdminCanModifyTarget({ actor, target });
  assertCanReviewTutor({ actor, target, membership });

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: targetUserId,
      deletedAt: null
    },
    {
      $set: {
        status: 'rejected',
        'profile.tutorApproval.rejectionReason': reason || '',
        'profile.tutorApproval.rejectedAt': new Date()
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (membership) {
    membership.status = 'cancelled';
    await membership.save();
  }

  await revokeAllUserSessions({
    userId: targetUserId,
    reason: 'tutor_rejected',
    ip: requestMeta?.ip
  });

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId,
    action: 'REJECT_TUTOR',
    metadata: {
      reason: reason || '',
      institutionId: membership?.institutionId || target.institutionId || null
    },
    requestMeta
  });

  try {
    await emailService.sendTutorRejectedEmail({
      to: updatedUser.email,
      name: updatedUser.name,
      reason
    });
  } catch (error) {
    // Non-fatal if email fails
  }

  return {
    message: 'Tutor rejected successfully.',
    data: {
      user: toPublicUser(updatedUser)
    }
  };
};

const adminCreateUser = async ({ name, email, role, institutionId, actor, requestMeta }) => {
  const normalizedEmail = normalizeEmail(email);
  
  const existingUser = await User.findOne({
    email: normalizedEmail,
    deletedAt: null
  });

  if (existingUser) {
    throw new ApiError(409, 'Email is already registered', 'EMAIL_ALREADY_EXISTS');
  }

  // Generate a random temporary password
  const temporaryPassword = crypto.randomBytes(6).toString('hex'); // 12 characters
  const passwordHash = await hashPassword(temporaryPassword);

  const isPlatformRole = isPlatformScopedRole(role);
  const resolvedInstitutionId = isPlatformRole ? null : (institutionId || actor.institutionId || null);
  const accountTypeByRole = {
    [ROLES.LEARNER]: resolvedInstitutionId ? ACCOUNT_TYPES.INSTITUTION_LEARNER : ACCOUNT_TYPES.INDIVIDUAL_LEARNER,
    [ROLES.TUTOR]: resolvedInstitutionId ? ACCOUNT_TYPES.INSTITUTION_TUTOR : ACCOUNT_TYPES.INDIVIDUAL_TUTOR,
    [ROLES.INSTITUTION_ADMIN]: ACCOUNT_TYPES.INSTITUTION_ADMIN,
    [ROLES.LEGACY_ADMIN]: ACCOUNT_TYPES.INSTITUTION_ADMIN,
    [ROLES.PLATFORM_ADMIN]: ACCOUNT_TYPES.PLATFORM_ADMIN
  };

  const user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash,
    role,
    accountType: accountTypeByRole[role] || null,
    status: 'active',
    emailVerified: true,
    institutionId: resolvedInstitutionId
  });

  if (resolvedInstitutionId && [ROLES.LEARNER, ROLES.TUTOR].includes(role)) {
    await ensureActiveInstitutionMembership({
      userId: user._id,
      institutionId: resolvedInstitutionId,
      memberType: role,
      actor
    });
  }

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId: user.id,
    action: 'ADMIN_CREATE_USER',
    metadata: {
      role,
      email: normalizedEmail
    },
    requestMeta
  });

  // Send invitation email
  let emailSent = false;
  let emailError = null;

  try {
    await emailService.sendInvitationEmail({
      to: normalizedEmail,
      name,
      role,
      temporaryPassword,
      loginUrl: `${env.client.url}/login`
    });
    emailSent = true;
  } catch (error) {
    emailError = error.message;
    if (!env.isProduction) {
      console.error('Invitation email failed:', error.message);
      // In dev, we might still count it as "sent" if it went to console, 
      // but here we want to be honest about Brevo failures.
    }
  }

  return {
    message: emailSent 
      ? 'User created and invitation sent successfully.' 
      : `User created but invitation email failed: ${emailError}`,
    data: {
      user: toPublicUser(user),
      credentials: {
        email: normalizedEmail,
        temporaryPassword
      },
      emailStatus: emailSent ? 'sent' : 'failed',
      emailError
    }
  };
};

const bulkRegisterStudents = async ({ students, actor, requestMeta }) => {
  const results = {
    success: [],
    failed: []
  };

  for (const student of students) {
    try {
      const res = await adminCreateUser({
        name: student.name,
        email: student.email,
        role: 'learner',
        actor,
        requestMeta
      });
      
      results.success.push({ 
        email: student.email, 
        name: student.name,
        temporaryPassword: res.data.credentials.temporaryPassword,
        emailStatus: res.data.emailStatus
      });
    } catch (error) {
      results.failed.push({
        email: student.email,
        reason: error.message || 'Registration failed'
      });
    }
  }

  return {
    message: `Bulk registration completed. Success: ${results.success.length}, Failed: ${results.failed.length}`,
    data: results
  };
};

// ======================================================
// GET ANALYTICS DASHBOARD STATS
// ======================================================
const getAnalytics = async ({ startDate, endDate, allCourses = false, courseId } = {}) => {
  const matchFilter = { paymentStatus: 'success' };
  const refundFilter = { paymentStatus: 'refunded' };
  const userFilter = { deletedAt: null };
  const enrollmentFilter = { deletedAt: null };
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const percentChange = (current, previous) => {
    if (!previous) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  };
  
  if (courseId) {
    const mongoose = require('mongoose');
    matchFilter.courseId = new mongoose.Types.ObjectId(courseId);
    refundFilter.courseId = new mongoose.Types.ObjectId(courseId);
  }
  
  if (startDate || endDate) {
    matchFilter.paidAt = {};
    refundFilter.refundedAt = {};
    userFilter.createdAt = {};
    enrollmentFilter.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      matchFilter.paidAt.$gte = start;
      refundFilter.refundedAt.$gte = start;
      userFilter.createdAt.$gte = start;
      enrollmentFilter.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      matchFilter.paidAt.$lte = end;
      refundFilter.refundedAt.$lte = end;
      userFilter.createdAt.$lte = end;
      enrollmentFilter.createdAt.$lte = end;
    }
  }

  const [
    userCount, 
    enrollmentCount, 
    revenueData, 
    revenueThisMonthData,
    revenuePreviousMonthData,
    refundData,
    paymentTypeBreakdown,
    recentPayments, 
    monthlyTrend, 
    topCourses, 
    tutorBreakdown
  ] = await Promise.all([
    User.countDocuments(userFilter),
    Enrollment.countDocuments(enrollmentFilter),
    Payment.aggregate([
      { $match: matchFilter },
      { $group: { _id: null, totalRevenue: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      { $match: { paymentStatus: 'success', paidAt: { $gte: currentMonthStart, $lt: nextMonthStart } } },
      { $group: { _id: null, totalRevenue: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      { $match: { paymentStatus: 'success', paidAt: { $gte: previousMonthStart, $lt: currentMonthStart } } },
      { $group: { _id: null, totalRevenue: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      { $match: refundFilter },
      { $group: { _id: null, totalRefunds: { $sum: '$amount' }, refundCount: { $sum: 1 } } }
    ]),
    Payment.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$paymentType', revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { revenue: -1 } }
    ]),
    Payment.find(matchFilter)
      .sort({ paidAt: -1 })
      .limit(5)
      .populate('learnerId', 'name email')
      .populate('courseId', 'title')
      .lean(),
    // Monthly Trend
    Payment.aggregate([
      { $match: matchFilter },
      { 
        $group: { 
          _id: { 
            year: { $year: '$paidAt' }, 
            month: { $month: '$paidAt' } 
          }, 
          revenue: { $sum: '$amount' } 
        } 
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]),
    // Courses Revenue Performance (Conditional Limit)
    (() => {
      const pipeline = [
        { $match: matchFilter },
        { $group: { _id: '$courseId', revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { revenue: -1 } }
      ];
      if (!allCourses) {
        pipeline.push({ $limit: 10 });
      }
      pipeline.push(
        { 
          $lookup: { 
            from: 'courses', 
            localField: '_id', 
            foreignField: '_id', 
            as: 'course' 
          } 
        },
        { $unwind: '$course' },
        {
          $lookup: {
            from: 'users',
            localField: 'course.authorId',
            foreignField: '_id',
            as: 'tutor'
          }
        },
        { $unwind: { path: '$tutor', preserveNullAndEmptyArrays: true } },
        { 
          $project: { 
            title: '$course.title', 
            tutorName: { $ifNull: ['$tutor.name', 'Unknown Tutor'] },
            price: { $ifNull: ['$course.price', 0] },
            revenue: 1, 
            enrollments: '$count' 
          } 
        }
      );
      return Payment.aggregate(pipeline);
    })(),
    // Tutor Breakdown
    Payment.aggregate([
      { $match: matchFilter },
      { 
        $lookup: { 
          from: 'courses', 
          localField: 'courseId', 
          foreignField: '_id', 
          as: 'course' 
        } 
      },
      { $unwind: '$course' },
      { 
        $group: { 
          _id: '$course.authorId', 
          revenue: { $sum: '$amount' } 
        } 
      },
      { 
        $lookup: { 
          from: 'users', 
          localField: '_id', 
          foreignField: '_id', 
          as: 'tutor' 
        } 
      },
      { $unwind: { path: '$tutor', preserveNullAndEmptyArrays: true } },
      { 
        $project: { 
          tutorName: { $ifNull: ['$tutor.name', 'Unknown'] }, 
          revenue: 1 
        } 
      },
      { $sort: { revenue: -1 } }
    ])
  ]);

  const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;
  const revenueThisMonth = revenueThisMonthData.length > 0 ? revenueThisMonthData[0].totalRevenue : 0;
  const revenuePreviousMonth = revenuePreviousMonthData.length > 0 ? revenuePreviousMonthData[0].totalRevenue : 0;
  const refundSummary = refundData[0] || { totalRefunds: 0, refundCount: 0 };

  return {
    message: 'Analytics retrieved successfully',
    data: {
      userCount,
      enrollmentCount,
      totalRevenue,
      revenueThisMonth,
      revenuePreviousMonth,
      monthOverMonthChange: percentChange(revenueThisMonth, revenuePreviousMonth),
      refundSummary,
      paymentTypeBreakdown,
      recentPayments,
      monthlyTrend,
      topCourses,
      tutorBreakdown
    }
  };
};

const exportRevenueData = async ({ startDate, endDate, courseId }) => {
  const matchFilter = { paymentStatus: { $in: ['success', 'refunded'] } };
  
  if (courseId) {
    const mongoose = require('mongoose');
    matchFilter.courseId = new mongoose.Types.ObjectId(courseId);
  }

  if (startDate || endDate) {
    matchFilter.paidAt = {};
    if (startDate) matchFilter.paidAt.$gte = new Date(startDate);
    if (endDate) matchFilter.paidAt.$lte = new Date(endDate);
  }

  const payments = await Payment.find(matchFilter)
    .populate('learnerId', 'name email')
    .populate('courseId', 'title')
    .sort({ paidAt: -1 })
    .lean();

  const { Parser } = require('json2csv');
  
  const fields = [
    { label: 'Transaction ID', value: 'transactionId' },
    { label: 'Paid Date', value: (row) => row.paidAt ? new Date(row.paidAt).toISOString() : '' },
    { label: 'Refunded Date', value: (row) => row.refundedAt ? new Date(row.refundedAt).toISOString() : '' },
    { label: 'Payment Type', value: 'paymentType' },
    { label: 'Status', value: 'paymentStatus' },
    { label: 'Amount', value: 'amount' },
    { label: 'Currency', value: 'currency' },
    { label: 'Learner Name', value: 'learnerId.name' },
    { label: 'Learner Email', value: 'learnerId.email' },
    { label: 'Course Title', value: 'courseId.title' }
  ];

  const json2csvParser = new Parser({ fields });
  const csv = json2csvParser.parse(payments);
  
  return Buffer.from(csv);
};

// ==========================================
// REFUNDS
// ==========================================
const REFUND_QUEUE_STATUSES = ['refund_pending', 'refund_processing', 'refund_failed'];
const REFUND_PROCESSABLE_STATUSES = ['refund_pending', 'refund_failed'];

const getRefundFailureMessage = (error) => (
  error?.error?.description
  || error?.error?.reason
  || error?.description
  || error?.message
  || 'Razorpay refund failed'
);

const createRazorpayRefund = async ({ payment, reason }) => {
  if (!payment.transactionId) {
    throw new ApiError(400, 'Payment is missing the Razorpay payment ID');
  }

  const amountInPaise = Math.round(Number(payment.amount || 0) * 100);
  if (amountInPaise <= 0) {
    throw new ApiError(400, 'Refund amount must be greater than zero');
  }

  return razorpay.payments.refund(payment.transactionId, {
    amount: amountInPaise,
    receipt: `edu_ref_${String(payment._id).slice(-16)}_${Number(payment.refundAttempts || 1)}`,
    notes: {
      source: 'educore_admin_refund',
      paymentId: String(payment._id),
      learnerId: String(payment.learnerId),
      courseId: payment.courseId ? String(payment.courseId) : '',
      reason: reason || 'Admin approved full refund'
    }
  });
};

const getPendingRefunds = async () => {
  const Payment = require('../models/payment.model');
  const pendingRefunds = await Payment.find({ paymentStatus: { $in: REFUND_QUEUE_STATUSES } })
    .populate('learnerId', 'name email')
    .populate('courseId', 'title')
    .sort({ updatedAt: -1 })
    .lean();

  return {
    message: 'Refund queue retrieved',
    data: { refunds: pendingRefunds }
  };
};

const processRefund = async ({ paymentId, action, reason }) => {
  const Payment = require('../models/payment.model');
  const Enrollment = require('../models/enrollment.model');
  const Progress = require('../models/progress.model');
  const Course = require('../models/course.model');
  const emailService = require('./email.service');

  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new ApiError(404, 'Payment record not found');
  }

  if (action === 'retry' && payment.paymentStatus !== 'refund_failed') {
    throw new ApiError(400, 'Only failed refunds can be retried');
  }

  if (action === 'reject' && payment.paymentStatus !== 'refund_pending') {
    throw new ApiError(400, 'Only pending refund requests can be rejected');
  }

  if ((action === 'approve' || action === 'retry') && !REFUND_PROCESSABLE_STATUSES.includes(payment.paymentStatus)) {
    throw new ApiError(400, 'This payment is not ready for refund processing');
  }

  const enrollment = await Enrollment.findOne({
    userId: payment.learnerId,
    courseId: payment.courseId,
    status: { $in: ['refund_pending', 'refund_failed'] }
  });

  const paymentData = await Payment.findById(paymentId)
    .populate('learnerId', 'name email')
    .populate('courseId', 'title');

  if (action === 'approve' || action === 'retry') {
    payment.paymentStatus = 'refund_processing';
    payment.refundStatus = 'processing';
    payment.refundReason = reason || payment.refundReason || 'Admin approved full refund';
    payment.refundFailureReason = null;
    payment.refundAttempts = Number(payment.refundAttempts || 0) + 1;
    payment.refundLastAttemptAt = new Date();
    await payment.save();

    if (enrollment) {
      enrollment.status = 'refund_pending';
      enrollment.paymentStatus = 'refund_processing';
      await enrollment.save();
    }

    let razorpayRefund;
    try {
      razorpayRefund = await createRazorpayRefund({ payment, reason });
      if (razorpayRefund?.status === 'failed') {
        const refundError = new Error(razorpayRefund.error_description || razorpayRefund.error_reason || 'Razorpay refund failed');
        refundError.error = {
          description: razorpayRefund.error_description,
          reason: razorpayRefund.error_reason
        };
        throw refundError;
      }
    } catch (error) {
      const failureReason = getRefundFailureMessage(error);

      payment.paymentStatus = 'refund_failed';
      payment.refundStatus = 'failed';
      payment.refundFailureReason = failureReason;
      payment.refundLastAttemptAt = new Date();
      await payment.save();

      if (enrollment) {
        enrollment.status = 'refund_failed';
        enrollment.paymentStatus = 'refund_failed';
        await enrollment.save();
      }

      try {
        if (paymentData.learnerId?.email && emailService.sendRefundFailedEmail) {
          await emailService.sendRefundFailedEmail({
            to: paymentData.learnerId.email,
            name: paymentData.learnerId.name,
            courseTitle: paymentData.courseId?.title || 'Unknown Course',
            amount: payment.amount,
            currency: payment.currency,
            reason: failureReason
          });
        }
      } catch (emailError) {
        console.error('Failed to send refund failure email:', emailError);
      }

      throw new ApiError(502, `Razorpay refund failed: ${failureReason}`);
    }

    payment.paymentStatus = 'refunded';
    payment.razorpayRefundId = razorpayRefund?.id || null;
    payment.refundStatus = razorpayRefund?.status || 'processed';
    payment.refundAmount = typeof razorpayRefund?.amount === 'number'
      ? razorpayRefund.amount / 100
      : payment.amount;
    payment.refundFailureReason = null;
    payment.refundMetadata = razorpayRefund || {};
    payment.refundProcessedAt = new Date();
    payment.refundedAt = new Date();
    await payment.save();

    if (enrollment) {
      enrollment.status = 'refunded';
      enrollment.paymentStatus = 'refunded';
      enrollment.deletedAt = new Date();
      await enrollment.save();

      const progress = await Progress.findOne({ userId: payment.learnerId, courseId: payment.courseId, deletedAt: null });
      if (progress) {
        progress.deletedAt = new Date();
        await progress.save();
      }

      await Course.updateOne(
        { _id: payment.courseId, enrollmentCount: { $gt: 0 } },
        { $inc: { enrollmentCount: -1 } }
      );
    }

    try {
      if (paymentData.learnerId?.email) {
        await emailService.sendRefundApprovedEmail({
          to: paymentData.learnerId.email,
          name: paymentData.learnerId.name,
          courseTitle: paymentData.courseId?.title || 'Unknown Course',
          amount: payment.amount,
          currency: payment.currency,
          refundId: payment.razorpayRefundId
        });
      }
    } catch (error) {
      console.error('Failed to send refund approval email:', error);
    }

    return { message: 'Refund approved and initiated through Razorpay successfully' };
  } else if (action === 'reject') {
    payment.paymentStatus = 'success';
    payment.refundStatus = 'rejected';
    payment.refundFailureReason = null;
    await payment.save();

    if (enrollment) {
      enrollment.status = 'active';
      enrollment.paymentStatus = 'success';
      await enrollment.save();
    }

    try {
      if (paymentData.learnerId?.email) {
        await emailService.sendRefundRejectedEmail({
          to: paymentData.learnerId.email,
          name: paymentData.learnerId.name,
          courseTitle: paymentData.courseId?.title || 'Unknown Course',
          reason
        });
      }
    } catch (error) {
      console.error('Failed to send refund rejection email:', error);
    }

    return { message: 'Refund request rejected, access restored' };
  } else {
    throw new ApiError(400, 'Invalid action');
  }
};

module.exports = {
  listUsers,
  setBanStatus,
  setSuspendStatus,
  bulkSuspendUsers,
  changeRole,
  softDelete,
  getUserProfileSummary,
  approveTutor,
  rejectTutor,
  adminCreateUser,
  bulkRegisterStudents,
  getAnalytics,
  exportRevenueData,
  getPendingRefunds,
  processRefund
};
