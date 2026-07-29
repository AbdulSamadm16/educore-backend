const mongoose = require('mongoose');
const User = require('../models/user.model');
const redis = require('../config/redis');
const env = require('../config/env');
const { ApiError } = require('../utils/errors');
const { normalizeEmail } = require('../utils/normalize');
const { randomToken, hashToken } = require('../utils/crypto');
const { hashPassword, comparePassword } = require('../utils/password');
const { toPublicUser } = require('../utils/userPresenter');
const {
  createSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions
} = require('./session.service');
const auditService = require('./audit.service');
const emailService = require('./email.service');

const PLATFORM_OWNER_ROLE = 'platform_owner';
const resetTokenKey = ({ tokenHash }) => `platform-password-reset:${tokenHash}`;

const assertPlatformOwnerCanModifyTarget = ({ actor, target }) => {
  if (String(actor.id) === String(target._id)) {
    throw new ApiError(400, 'Platform owners cannot modify their own administrative state', 'SELF_ADMIN_CHANGE_DENIED');
  }

  if (target.role === PLATFORM_OWNER_ROLE) {
    throw new ApiError(403, 'Platform owner accounts are protected from user-management actions', 'PLATFORM_OWNER_PROTECTED');
  }
};

const assertCanLogin = (user) => {
  if (!user.emailVerified || user.status === 'pending_verification') {
    throw new ApiError(403, 'Email verification required', 'EMAIL_VERIFICATION_REQUIRED');
  }

  if (user.status === 'banned' || user.status === 'suspended' || user.status !== 'active') {
    throw new ApiError(403, 'Account is not active', 'ACCOUNT_NOT_ACTIVE');
  }
};

const login = async ({ payload, requestMeta }) => {
  const genericError = new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  const email = normalizeEmail(payload.email);
  const user = await User.findOne({
    email,
    role: PLATFORM_OWNER_ROLE,
    deletedAt: null
  }).select('+passwordHash');

  if (!user) {
    throw genericError;
  }

  const now = new Date();

  // Active lock — reject immediately
  if (user.lockUntil && user.lockUntil > now) {
    throw new ApiError(423, 'Account is temporarily locked', 'ACCOUNT_LOCKED');
  }

  // Lock expired — clear atomically before bcrypt so concurrent requests see clean state
  if (user.lockUntil && user.lockUntil <= now) {
    await User.updateOne(
      { _id: user._id, role: PLATFORM_OWNER_ROLE, deletedAt: null },
      { $set: { failedLoginAttempts: 0, lockUntil: null } }
    );
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
  }

  const passwordMatches = await comparePassword(payload.password, user.passwordHash);

  if (!passwordMatches) {
    // Atomic increment — prevents concurrent requests from both reading 0 and writing 1
    const updated = await User.findOneAndUpdate(
      { _id: user._id, role: PLATFORM_OWNER_ROLE, deletedAt: null },
      { $inc: { failedLoginAttempts: 1 } },
      { new: true }
    );

    const nextAttempts = updated?.failedLoginAttempts ?? (user.failedLoginAttempts + 1);
    const shouldLock = nextAttempts >= env.security.accountLockAttempts;

    if (shouldLock) {
      const lockUntil = new Date(Date.now() + env.security.accountLockMinutes * 60 * 1000);
      await User.updateOne(
        { _id: user._id, role: PLATFORM_OWNER_ROLE, deletedAt: null },
        { $set: { lockUntil } }
      );
    }

    throw genericError;
  }

  assertCanLogin(user);

  const loginAt = new Date();
  await User.updateOne(
    { _id: user._id, role: PLATFORM_OWNER_ROLE, deletedAt: null },
    { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: loginAt } }
  );

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = loginAt;

  const tokens = await createSession({
    user,
    rememberMe: payload.rememberMe,
    requestMeta
  });

  return {
    message: 'Platform login successful.',
    data: {
      user: toPublicUser(user),
      role: user.role,
      ...tokens
    }
  };
};


const forgotPassword = async ({ payload }) => {
  const email = normalizeEmail(payload.email);
  const user = await User.findOne({
    email,
    role: PLATFORM_OWNER_ROLE,
    deletedAt: null
  });

  if (user) {
    try {
      const token = randomToken();
      const tokenHash = hashToken(token);

      await redis.set(
        resetTokenKey({ tokenHash }),
        JSON.stringify({
          userId: String(user._id)
        }),
        'EX',
        env.passwordReset.ttlSeconds
      );

      const resetUrl = `${env.client.url}/platform/reset-password?token=${encodeURIComponent(token)}`;

      await emailService.sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        name: user.name
      });
    } catch (error) {
      if (!env.isProduction) {
        console.error('Platform forgot password delivery failed:', error.message);
      }
    }
  }

  return {
    message: 'If the email exists, password reset instructions have been sent.'
  };
};

const resetPassword = async ({ payload, requestMeta }) => {
  if (!payload.token) {
    throw new ApiError(400, 'Invalid or expired reset token', 'RESET_TOKEN_INVALID');
  }

  const tokenHash = hashToken(payload.token);
  const key = resetTokenKey({ tokenHash });
  const raw = await redis.get(key);

  if (!raw) {
    throw new ApiError(400, 'Invalid or expired reset token', 'RESET_TOKEN_INVALID');
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    await redis.del(key);
    throw new ApiError(400, 'Invalid or expired reset token', 'RESET_TOKEN_INVALID');
  }

  const passwordHash = await hashPassword(payload.password);
  const user = await User.findOneAndUpdate(
    {
      _id: parsed.userId,
      role: PLATFORM_OWNER_ROLE,
      deletedAt: null
    },
    {
      $set: {
        passwordHash,
        failedLoginAttempts: 0,
        lockUntil: null
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (!user) {
    await redis.del(key);
    throw new ApiError(400, 'Invalid or expired reset token', 'RESET_TOKEN_INVALID');
  }

  await revokeAllUserSessions({
    userId: user._id,
    reason: 'platform_password_reset',
    ip: requestMeta?.ip
  });
  await redis.del(key);

  return {
    message: 'Password reset successful.',
    data: {
      redirectTo: '/platform/login'
    }
  };
};

const refresh = async ({ payload, requestMeta }) => {
  const tokens = await rotateRefreshToken({
    refreshToken: payload.refreshToken,
    requestMeta
  });

  return {
    message: 'Platform token refreshed successfully.',
    data: tokens
  };
};

const logout = async ({ payload, requestMeta }) => {
  await revokeRefreshToken({
    refreshToken: payload.refreshToken,
    requestMeta
  });

  return {
    message: 'Platform logout successful.'
  };
};

const listUsers = async ({ query }) => {
  const filter = {
    deletedAt: null
  };

  if (query.role) {
    filter.role = query.role;
  }

  if (query.status) {
    filter.status = query.status;
  }

  const skip = (query.page - 1) * query.limit;

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    User.countDocuments(filter)
  ]);

  return {
    message: 'Platform users retrieved successfully.',
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

const setBanStatus = async ({ targetUserId, banned, reason, actor, requestMeta }) => {
  const target = await User.findOne({
    _id: targetUserId,
    deletedAt: null
  });

  if (!target) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  assertPlatformOwnerCanModifyTarget({ actor, target });

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
      reason: 'platform_ban',
      ip: requestMeta?.ip
    });
  }

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId,
    action: banned ? 'BAN_USER' : 'UNBAN_USER',
    metadata: {
      reason: reason || '',
      platformAction: true
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

  assertPlatformOwnerCanModifyTarget({ actor, target });

  const updateFields = { role };
  if (role === 'tutor' && institutionId) {
    updateFields.institutionId = institutionId;
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

  await revokeAllUserSessions({
    userId: targetUserId,
    reason: 'platform_role_changed',
    ip: requestMeta?.ip
  });

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId,
    action: 'CHANGE_ROLE',
    metadata: {
      previousRole: target.role,
      nextRole: role,
      reason: reason || '',
      platformAction: true
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

const Institution = require('../models/institution.model');
const InstitutionAdmin = require('../models/institutionAdmin.model');
const InstitutionSettings = require('../models/institutionSettings.model');
const Course = require('../models/course.model');
const Batch = require('../models/batch.model');
const Enrollment = require('../models/enrollment.model');
const Payment = require('../models/payment.model');
const Progress = require('../models/progress.model');

const formatDateKey = (date) => date.toISOString().slice(0, 10);

const formatShortDate = (date) => date.toLocaleDateString('en-US', {
  month: 'short',
  day: 'numeric'
});

const percentChange = (current, previous) => {
  if (!previous && !current) return '0%';
  if (!previous) return '+100%';
  const value = ((current - previous) / previous) * 100;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const getDashboardStats = async () => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(monthStart);

  const seriesDays = 14;
  const signupStart = new Date(todayStart);
  signupStart.setDate(signupStart.getDate() - (seriesDays - 1));

  const [
    totalUsers,
    totalCourses,
    activeLearnerIds,
    revenueMtdData,
    revenuePreviousMonthData,
    signupRows,
    enrollmentRows,
    registrations,
    courses,
    payments,
    roleCounts
  ] = await Promise.all([
    User.countDocuments({ deletedAt: null }),
    Course.countDocuments({ deletedAt: null, status: { $ne: 'deleted' } }),
    Progress.distinct('userId', {
      deletedAt: null,
      updatedAt: { $gte: todayStart }
    }),
    Payment.aggregate([
      {
        $match: {
          paymentStatus: 'success',
          paidAt: { $gte: monthStart, $lte: now }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      {
        $match: {
          paymentStatus: 'success',
          paidAt: { $gte: previousMonthStart, $lt: previousMonthEnd }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    User.aggregate([
      {
        $match: {
          deletedAt: null,
          createdAt: { $gte: signupStart, $lte: now }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Enrollment.aggregate([
      {
        $match: {
          deletedAt: null,
          status: { $in: ['active', 'completed'] }
        }
      },
      { $group: { _id: '$courseId', enrollments: { $sum: 1 } } },
      { $sort: { enrollments: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'course'
        }
      },
      { $unwind: '$course' },
      { $match: { 'course.deletedAt': null } },
      {
        $project: {
          _id: 0,
          courseId: '$_id',
          title: '$course.title',
          enrollments: 1
        }
      }
    ]),
    User.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email role createdAt')
      .lean(),
    Course.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title status authorId createdAt')
      .populate('authorId', 'name')
      .lean(),
    Payment.find({ paymentStatus: 'success' })
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(5)
      .populate('learnerId', 'name email')
      .populate('courseId', 'title')
      .lean(),
    User.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ])
  ]);

  const revenueMtd = revenueMtdData[0]?.total || 0;
  const revenuePreviousMonth = revenuePreviousMonthData[0]?.total || 0;
  const currency = payments[0]?.currency || 'INR';
  const signupMap = new Map(signupRows.map((row) => [row._id, row.count]));
  const signupSeries = Array.from({ length: seriesDays }, (_, index) => {
    const date = new Date(signupStart);
    date.setDate(signupStart.getDate() + index);
    const key = formatDateKey(date);
    return {
      date: key,
      label: formatShortDate(date),
      value: signupMap.get(key) || 0
    };
  });

  const roleMap = roleCounts.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const activityItems = [
    ...registrations.map((user) => ({
      id: `registration-${user._id}`,
      type: 'registration',
      title: 'New registration',
      description: `${user.name || user.email} joined as ${String(user.role || 'user').replace('_', ' ')}`,
      timestamp: user.createdAt
    })),
    ...courses.map((course) => ({
      id: `course-${course._id}`,
      type: 'course',
      title: 'New course created',
      description: `${course.title} by ${course.authorId?.name || 'Unknown tutor'}`,
      timestamp: course.createdAt
    })),
    ...payments.map((payment) => ({
      id: `payment-${payment._id}`,
      type: 'payment',
      title: 'Recent payment',
      description: `${payment.learnerId?.name || payment.learnerId?.email || 'Learner'} paid for ${payment.courseId?.title || 'course access'}`,
      timestamp: payment.paidAt || payment.createdAt,
      amount: payment.amount,
      currency: payment.currency || currency
    }))
  ]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  return {
    message: 'Platform dashboard stats retrieved successfully.',
    data: {
      kpis: [
        {
          key: 'totalUsers',
          label: 'Total Users',
          value: totalUsers,
          icon: 'Users',
          change: `${signupSeries.reduce((sum, point) => sum + point.value, 0)} new in 14 days`
        },
        {
          key: 'totalCourses',
          label: 'Total Courses',
          value: totalCourses,
          icon: 'BookOpen',
          change: `${enrollmentRows.length} courses with enrollments`
        },
        {
          key: 'revenueMtd',
          label: 'Revenue MTD',
          value: revenueMtd,
          valueType: 'currency',
          currency,
          icon: 'Wallet',
          change: `${percentChange(revenueMtd, revenuePreviousMonth)} vs last month`
        },
        {
          key: 'activeLearnersToday',
          label: 'Active Learners Today',
          value: activeLearnerIds.length,
          icon: 'Activity',
          change: 'Based on learning progress today'
        }
      ],
      signupSeries,
      enrollmentTopCourses: enrollmentRows,
      recentActivities: activityItems,
      userDistribution: {
        total: totalUsers,
        learners: roleMap.learner || 0,
        tutors: roleMap.tutor || 0,
        admins: (roleMap.admin || 0)
          + (roleMap.institution_admin || 0)
          + (roleMap.platform_admin || 0)
          + (roleMap.super_admin || 0)
          + (roleMap.platform_owner || 0)
      }
    }
  };
};

const createInstitution = async ({ payload, actor, requestMeta }) => {
  const existingDomain = await Institution.findOne({ domain: payload.domain.toLowerCase() });
  if (existingDomain) {
    throw new ApiError(400, 'Institution domain already exists', 'DOMAIN_ALREADY_EXISTS');
  }

  const existingEmail = await Institution.findOne({ email: payload.email.toLowerCase() });
  if (existingEmail) {
    throw new ApiError(400, 'Institution email already exists', 'EMAIL_ALREADY_EXISTS');
  }

  if (payload.code) {
    const existingCode = await Institution.findOne({ code: payload.code.trim() });
    if (existingCode) {
      throw new ApiError(400, 'Institution code already exists', 'CODE_ALREADY_EXISTS');
    }
  }

  // Check if admin email already exists in User model
  const existingUser = await User.findOne({ email: payload.adminEmail.toLowerCase() });
  if (existingUser) {
    throw new ApiError(400, 'Admin email already exists as a platform user', 'USER_ALREADY_EXISTS');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  let reqPayloadVars = {};

  try {
      const tempPassword = randomToken().slice(0, 12);
      const passwordHash = await hashPassword(tempPassword);

      const [adminUser] = await User.create([{
        name: payload.adminName,
        email: payload.adminEmail,
        passwordHash,
        role: 'institution_admin',
        accountType: 'institution_admin',
        status: 'active',
        emailVerified: true, // Auto-verify for created institutions
      }], { session });

      // Create Institution in the institution DB
      const [institution] = await Institution.create([{
        name: payload.name,
        domain: payload.domain,
        email: payload.email,
        description: payload.description,
        owner: adminUser._id,
        code: payload.code ? payload.code.trim() : undefined,
        createdBy: actor._id || actor.id,
      }], { session });

      // Link user to institution
      adminUser.institutionId = institution._id;
      await adminUser.save({ session });

      // Create settings
      await InstitutionSettings.create([{
        institutionId: institution._id,
        allowPublicCourses: true,
        updatedBy: actor._id || actor.id
      }], { session });

      // Create institution admin mapping
      await InstitutionAdmin.create([{
        institutionId: institution._id,
        userId: adminUser._id
      }], { session });

      // Pass variables out to outer scope to send email
      reqPayloadVars = { adminUser, institution, tempPassword };

    await session.commitTransaction();
    session.endSession();

    // Send onboarding email outside the transaction
    try {
      await emailService.sendInstitutionalOnboardingEmail({
        to: reqPayloadVars.adminUser.email,
        name: reqPayloadVars.adminUser.name,
        institutionName: reqPayloadVars.institution.name,
        tempPassword: reqPayloadVars.tempPassword,
        loginUrl: `${env.client.url}/login`
      });
    } catch (error) {
      console.error('Failed to send onboarding email:', error.message);
    }

    await auditService.logAdminAction({
      actorUserId: actor._id || actor.id,
      targetUserId: reqPayloadVars.adminUser._id,
      action: 'CREATE_INSTITUTION',
      metadata: {
        institutionId: reqPayloadVars.institution._id,
        platformAction: true
      },
      requestMeta
    });

    return {
      message: 'Institution created successfully.',
      data: {
        institution: reqPayloadVars.institution,
        admin: toPublicUser(reqPayloadVars.adminUser)
      }
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

const updateInstitution = async ({ institutionId, payload, actor, requestMeta }) => {
  const institution = await Institution.findOne({ _id: institutionId });
  if (!institution) {
    throw new ApiError(404, 'Institution not found', 'INSTITUTION_NOT_FOUND');
  }

  if (payload.domain && payload.domain.toLowerCase() !== institution.domain) {
    const existingDomain = await Institution.findOne({ domain: payload.domain.toLowerCase() });
    if (existingDomain) {
      throw new ApiError(400, 'Institution domain already exists', 'DOMAIN_ALREADY_EXISTS');
    }
    institution.domain = payload.domain.toLowerCase();
  }

  if (payload.email && payload.email.toLowerCase() !== institution.email) {
    const existingEmail = await Institution.findOne({ email: payload.email.toLowerCase() });
    if (existingEmail) {
      throw new ApiError(400, 'Institution email already exists', 'EMAIL_ALREADY_EXISTS');
    }
    institution.email = payload.email.toLowerCase();
  }

  if (payload.code && payload.code.trim() !== institution.code) {
    const existingCode = await Institution.findOne({ code: payload.code.trim() });
    if (existingCode) {
      throw new ApiError(400, 'Institution code already exists', 'CODE_ALREADY_EXISTS');
    }
    institution.code = payload.code.trim();
  }

  if (payload.name !== undefined) institution.name = payload.name;
  if (payload.description !== undefined) institution.description = payload.description;

  await institution.save();

  await auditService.logAdminAction({
    actorUserId: actor._id || actor.id,
    targetUserId: institution.owner,
    action: 'UPDATE_INSTITUTION',
    metadata: {
      institutionId,
      updatedFields: Object.keys(payload),
      platformAction: true
    },
    requestMeta
  });

  return {
    message: 'Institution updated successfully.',
    data: { institution }
  };
};

const disableInstitution = async ({ institutionId, status, actor, requestMeta }) => {
  if (!['active', 'suspended'].includes(status)) {
    throw new ApiError(400, 'Invalid institution status', 'INVALID_STATUS');
  }

  const institution = await Institution.findOne({ _id: institutionId });
  if (!institution) {
    throw new ApiError(404, 'Institution not found', 'INSTITUTION_NOT_FOUND');
  }

  institution.status = status;
  await institution.save();

  const users = await User.find({ institutionId, deletedAt: null });
  const userIds = users.map(u => u._id);

  if (status === 'suspended') {
    // Suspend institution admins
    await User.updateMany(
      { institutionId, role: 'institution_admin', deletedAt: null },
      { $set: { status: 'suspended' } }
    );

    // Revoke sessions for all users of the institution
    for (const userId of userIds) {
      await revokeAllUserSessions({
        userId,
        reason: 'institution_suspended',
        ip: requestMeta?.ip
      });
    }
  } else if (status === 'active') {
    // Reactivate institution admins
    await User.updateMany(
      { institutionId, role: 'institution_admin', status: 'suspended', deletedAt: null },
      { $set: { status: 'active' } }
    );
  }

  await auditService.logAdminAction({
    actorUserId: actor._id || actor.id,
    targetUserId: institution.owner,
    action: status === 'suspended' ? 'DISABLE_INSTITUTION' : 'ENABLE_INSTITUTION',
    metadata: {
      institutionId,
      status,
      platformAction: true
    },
    requestMeta
  });

  return {
    message: `Institution ${status === 'suspended' ? 'disabled' : 'enabled'} successfully.`,
    data: { institution }
  };
};

const assignInstitutionAdmin = async ({ institutionId, adminEmail, adminName, actor, requestMeta }) => {
  const institution = await Institution.findOne({ _id: institutionId });
  if (!institution) {
    throw new ApiError(404, 'Institution not found', 'INSTITUTION_NOT_FOUND');
  }

  const email = normalizeEmail(adminEmail);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let adminUser = await User.findOne({ email, deletedAt: null });
    let tempPassword = null;

    if (!adminUser) {
      tempPassword = randomToken().slice(0, 12);
      const passwordHash = await hashPassword(tempPassword);

      [adminUser] = await User.create([{
        name: adminName,
        email,
        passwordHash,
        role: 'institution_admin',
        accountType: 'institution_admin',
        status: 'active',
        emailVerified: true,
        institutionId: institution._id
      }], { session });
    } else {
      adminUser.role = 'institution_admin';
      adminUser.accountType = 'institution_admin';
      adminUser.institutionId = institution._id;
      if (adminUser.status !== 'active') {
        adminUser.status = 'active';
      }
      await adminUser.save({ session });
    }

    institution.owner = adminUser._id;
    await institution.save({ session });

    await InstitutionAdmin.findOneAndUpdate(
      { institutionId: institution._id, userId: adminUser._id },
      { institutionId: institution._id, userId: adminUser._id },
      { upsert: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    await revokeAllUserSessions({
      userId: adminUser._id,
      reason: 'platform_assigned_institution_admin',
      ip: requestMeta?.ip
    });

    try {
      if (tempPassword) {
        await emailService.sendInstitutionalOnboardingEmail({
          to: adminUser.email,
          name: adminUser.name,
          institutionName: institution.name,
          tempPassword,
          loginUrl: `${env.client.url}/login`
        });
      }
    } catch (error) {
      console.error('Failed to send admin assignment email:', error.message);
    }

    await auditService.logAdminAction({
      actorUserId: actor._id || actor.id,
      targetUserId: adminUser._id,
      action: 'ASSIGN_INSTITUTION_ADMIN',
      metadata: {
        institutionId,
        adminUserId: adminUser._id,
        adminEmail: email,
        platformAction: true
      },
      requestMeta
    });

    return {
      message: 'Institution admin assigned successfully.',
      data: {
        institution,
        admin: toPublicUser(adminUser)
      }
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

const getInstitutionStats = async ({ institutionId }) => {
  const institution = await Institution.findOne({ _id: institutionId });
  if (!institution) {
    throw new ApiError(404, 'Institution not found', 'INSTITUTION_NOT_FOUND');
  }

  const [learnerCount, tutorCount, courseCount, activeBatchCount] = await Promise.all([
    User.countDocuments({ institutionId, role: 'learner', deletedAt: null }),
    User.countDocuments({ institutionId, role: 'tutor', deletedAt: null }),
    Course.countDocuments({ institutionId, deletedAt: null }),
    Batch.countDocuments({ institutionId, status: 'active', deletedAt: null })
  ]);

  return {
    message: 'Institution stats retrieved successfully.',
    data: {
      learnerCount,
      tutorCount,
      courseCount,
      activeBatchCount
    }
  };
};

const listInstitutions = async ({ query }) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { domain: { $regex: query.search, $options: 'i' } }
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [institutions, total] = await Promise.all([
    Institution.find(filter)
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    Institution.countDocuments(filter)
  ]);

  return {
    message: 'Institutions retrieved successfully.',
    data: {
      institutions,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit)
      }
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

  assertPlatformOwnerCanModifyTarget({ actor, target });

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
    reason: 'platform_soft_delete',
    ip: requestMeta?.ip
  });

  await auditService.logAdminAction({
    actorUserId: actor.id,
    targetUserId,
    action: 'SOFT_DELETE_USER',
    metadata: {
      deletedAt,
      platformAction: true
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

module.exports = {
  login,
  forgotPassword,
  resetPassword,
  refresh,
  logout,
  listUsers,
  setBanStatus,
  changeRole,
  softDelete,
  createInstitution,
  listInstitutions,
  updateInstitution,
  disableInstitution,
  assignInstitutionAdmin,
  getInstitutionStats,
  getDashboardStats
};
