const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const Batch = require('../models/batch.model');
const Course = require('../models/course.model');
const Enrollment = require('../models/enrollment.model');
const Attendance = require('../models/attendance.model');
const LiveSession = require('../models/liveSession.model');
const TutorAssignment = require('../models/tutorAssignment.model');
const InstitutionMembership = require('../models/institutionMembership.model');
const User = require('../models/user.model');
const InstitutionSettings = require('../models/institutionSettings.model');
const notificationService = require('./notification.service');
const auditService = require('./audit.service');
const { ApiError } = require('../utils/errors');
const { toPublicUser } = require('../utils/userPresenter');

const sameId = (left, right) => String(left || '') === String(right || '');
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

// Reusable transaction wrapper (graceful fallback for standalone Mongo)
const runInTransaction = async (fn) => {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (_) {
    session = null;
  }
  try {
    const result = await fn(session);
    if (session) await session.commitTransaction();
    return result;
  } catch (err) {
    if (session && session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    if (session) session.endSession();
  }
};

const isObjectIdString = (value) => objectIdPattern.test(String(value || '').trim());

const buildAuthorSnapshot = (user) => ({
  name: user.name,
  avatarUrl: user.profile?.avatarUrl || null,
  role: user.role
});

const normalizeStringList = (value) => {
  if (!value) return [];
  const values = Array.isArray(value) ? value : String(value).split(/[\n,]/);
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
};

const parseCsvContent = (content = '') => {
  const lines = String(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { emails: [], studentIds: [] };
  }

  const firstColumns = lines[0].split(',').map((item) => item.trim().toLowerCase());
  const hasHeader = firstColumns.includes('email') || firstColumns.includes('studentid') || firstColumns.includes('student_id');
  const headers = firstColumns;
  const rows = hasHeader ? lines.slice(1) : lines;
  const emails = [];
  const studentIds = [];

  rows.forEach((line) => {
    const values = line.split(',').map((item) => item.trim());

    if (!hasHeader) {
      const identifier = values[0];
      if (!identifier) return;

      if (isObjectIdString(identifier)) {
        studentIds.push(identifier);
        return;
      }

      emails.push(identifier.toLowerCase());
      return;
    }

    const emailIndex = headers.indexOf('email');
    const studentIdIndex = headers.includes('studentid') ? headers.indexOf('studentid') : headers.indexOf('student_id');

    if (emailIndex >= 0 && values[emailIndex]) {
      emails.push(values[emailIndex].toLowerCase());
    }

    if (studentIdIndex >= 0 && values[studentIdIndex]) {
      studentIds.push(values[studentIdIndex]);
    }
  });

  return {
    emails: [...new Set(emails)],
    studentIds: [...new Set(studentIds)]
  };
};

const collectStudentInputs = ({ payload = {}, file }) => {
  const emails = new Set([
    ...normalizeStringList(payload.emails),
    ...normalizeStringList(payload.email)
  ]);
  const studentIds = new Set([
    ...normalizeStringList(payload.studentIds),
    ...normalizeStringList(payload.studentId)
  ]);

  const students = Array.isArray(payload.students) ? payload.students : [];
  students.forEach((student) => {
    if (typeof student === 'string') {
      if (/^[0-9a-fA-F]{24}$/.test(student.trim())) {
        studentIds.add(student.trim());
      } else {
        emails.add(student.trim().toLowerCase());
      }
      return;
    }

    if (student?.studentId) studentIds.add(String(student.studentId));
    if (student?.userId) studentIds.add(String(student.userId));
    if (student?.email) emails.add(String(student.email).trim().toLowerCase());
  });

  const csvContents = [];
  if (payload.csvContent) csvContents.push(payload.csvContent);
  if (file?.buffer) csvContents.push(file.buffer.toString('utf8'));

  csvContents.forEach((csvContent) => {
    const parsed = parseCsvContent(csvContent);
    parsed.emails.forEach((email) => emails.add(email));
    parsed.studentIds.forEach((studentId) => studentIds.add(studentId));
  });

  return {
    emails: [...emails],
    studentIds: [...studentIds]
  };
};

const getInstitutionContext = async (actor) => {
  const actorUser = await User.findOne({
    _id: actor._id || actor.id,
    deletedAt: null
  }).select('name email role institutionId status profile');

  if (!actorUser) {
    throw new ApiError(401, 'Authenticated user not found', 'USER_NOT_FOUND');
  }

  if (!actorUser.institutionId) {
    throw new ApiError(403, 'Institution admin account is not linked to an institution', 'INSTITUTION_REQUIRED');
  }

  return {
    actorUser,
    institutionId: actorUser.institutionId
  };
};

const assertInstitutionTutor = async ({ tutorId, institutionId }) => {
  const tutor = await User.findOne({
    _id: tutorId,
    role: 'tutor',
    status: 'active',
    institutionId,
    deletedAt: null
  });

  if (!tutor) {
    throw new ApiError(404, `Tutor ${tutorId} is not approved or belongs to another institution.`, 'TUTOR_NOT_FOUND');
  }

  return tutor;
};

const getBatchForInstitution = async ({ batchId, institutionId }) => {
  const batch = await Batch.findOne({
    _id: batchId,
    institutionId,
    deletedAt: null
  });

  if (!batch) {
    throw new ApiError(404, 'Batch not found in this institution', 'BATCH_NOT_FOUND');
  }

  return batch;
};

const batchToPayload = (batch) => {
  const source = batch.toObject ? batch.toObject() : batch;
  return {
    ...source,
    id: String(source._id || source.id),
    studentCount: source.students?.length || 0
  };
};

const courseBelongsToInstitution = async ({ course, institutionId, actorUser }) => {
  if (sameId(course.authorId, actorUser._id)) return true;

  const author = await User.findOne({
    _id: course.authorId,
    institutionId,
    deletedAt: null
  }).select('_id');

  return !!author;
};

const notifyTutorAssignment = async ({ tutorId, title, message, metadata }) => {
  try {
    await notificationService.createNotification({
      userId: tutorId,
      title,
      message,
      type: 'system',
      metadata
    });
  } catch (error) {
    console.error('[Institution] Failed to notify tutor assignment:', error.message);
  }
};

const createTutorAssignmentRecord = async (assignmentPayload, targetLabel) => {
  try {
    return await TutorAssignment.create(assignmentPayload);
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(
        409,
        `${targetLabel} already has an active tutor assignment. Refresh and try again.`,
        'ACTIVE_ASSIGNMENT_CONFLICT'
      );
    }

    throw error;
  }
};

const getDashboard = async ({ actor }) => {
  const { institutionId } = await getInstitutionContext(actor);

  const learners = await User.find({
    institutionId,
    role: 'learner',
    deletedAt: null
  }).select('_id');
  const learnerIds = learners.map((learner) => learner._id);

  const batchIds = await Batch.find({
    institutionId,
    deletedAt: null
  }).select('_id');

  const [
    activeBatches,
    activeTutors,
    completionAggregate,
    recentEnrollments,
    upcomingSessions,
    topCourses
  ] = await Promise.all([
    Batch.countDocuments({ institutionId, status: 'active', deletedAt: null }),
    User.countDocuments({ institutionId, role: 'tutor', status: 'active', deletedAt: null }),
    Enrollment.aggregate([
      { $match: { userId: { $in: learnerIds }, deletedAt: null } },
      { $group: { _id: null, averageCompletionRate: { $avg: '$progressPercentage' } } }
    ]),
    Enrollment.find({ userId: { $in: learnerIds }, deletedAt: null })
      .sort({ enrolledAt: -1, createdAt: -1 })
      .limit(10)
      .populate('userId', 'name email')
      .populate('courseId', 'title thumbnailUrl')
      .lean(),
    LiveSession.find({
      batchId: { $in: batchIds.map((batch) => batch._id) },
      deletedAt: null,
      status: { $in: ['scheduled', 'rescheduled', 'live'] },
      startTime: { $gte: new Date() }
    })
      .sort({ startTime: 1 })
      .limit(10)
      .populate('courseId', 'title thumbnailUrl')
      .populate('tutorId', 'name email')
      .populate('batchId', 'name')
      .lean(),
    Enrollment.aggregate([
      { $match: { userId: { $in: learnerIds }, deletedAt: null } },
      {
        $group: {
          _id: '$courseId',
          enrollmentCount: { $sum: 1 },
          averageCompletionRate: { $avg: '$progressPercentage' }
        }
      },
      { $sort: { averageCompletionRate: -1, enrollmentCount: -1 } },
      { $limit: 5 },
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
        $project: {
          courseId: '$_id',
          title: '$course.title',
          thumbnailUrl: '$course.thumbnailUrl',
          enrollmentCount: 1,
          averageCompletionRate: { $round: ['$averageCompletionRate', 0] }
        }
      }
    ])
  ]);

  return {
    message: 'Institution dashboard retrieved successfully',
    data: {
      kpis: {
        totalStudents: learnerIds.length,
        activeBatches,
        activeTutors,
        averageCompletionRate: Math.round(completionAggregate[0]?.averageCompletionRate || 0)
      },
      recentEnrollmentActivity: recentEnrollments,
      upcomingLiveSessions: upcomingSessions,
      topPerformingCourses: topCourses
    }
  };
};

const listBatches = async ({ actor, query }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { institutionId, deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.search) {
    filter.name = { $regex: query.search, $options: 'i' };
  }

  const [batches, total] = await Promise.all([
    Batch.find(filter)
      .populate('assignedTutorId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Batch.countDocuments(filter)
  ]);

  return {
    message: 'Batches retrieved successfully',
    data: {
      batches: batches.map(batchToPayload),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  };
};

const getBatch = async ({ actor, batchId }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const batch = await Batch.findOne({ _id: batchId, institutionId, deletedAt: null })
    .populate('assignedTutorId', 'name email')
    .populate('students.userId', 'name email status profile');

  if (!batch) {
    throw new ApiError(404, 'Batch not found in this institution', 'BATCH_NOT_FOUND');
  }

  return {
    message: 'Batch retrieved successfully',
    data: {
      batch: batchToPayload(batch)
    }
  };
};

const createBatch = async ({ actor, payload }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);

  if (new Date(payload.endDate) < new Date(payload.startDate)) {
    throw new ApiError(400, 'Batch end date must be after start date', 'INVALID_BATCH_DATES');
  }

  if (payload.assignedTutorId) {
    await assertInstitutionTutor({ tutorId: payload.assignedTutorId, institutionId });
  }

  const batch = await Batch.create({
    institutionId,
    name: payload.name,
    startDate: payload.startDate,
    endDate: payload.endDate,
    assignedTutorId: payload.assignedTutorId || null
  });

  if (payload.assignedTutorId) {
    await TutorAssignment.create({
      institutionId,
      tutorId: payload.assignedTutorId,
      batchId: batch._id,
      assignmentType: 'batch',
      assignedBy: actorUser._id
    });

    await notifyTutorAssignment({
      tutorId: payload.assignedTutorId,
      title: 'New Batch Assignment',
      message: `You have been assigned to batch "${batch.name}".`,
      metadata: { batchId: batch._id, eventType: 'BATCH_ASSIGNED' }
    });
  }

  return {
    message: 'Batch created successfully',
    data: {
      batch: batchToPayload(batch)
    }
  };
};

const updateBatch = async ({ actor, batchId, payload }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);
  const batch = await getBatchForInstitution({ batchId, institutionId });

  if (payload.startDate || payload.endDate) {
    const startDate = payload.startDate || batch.startDate;
    const endDate = payload.endDate || batch.endDate;
    if (new Date(endDate) < new Date(startDate)) {
      throw new ApiError(400, 'Batch end date must be after start date', 'INVALID_BATCH_DATES');
    }
  }

  if (payload.name !== undefined) batch.name = payload.name;
  if (payload.startDate !== undefined) batch.startDate = payload.startDate;
  if (payload.endDate !== undefined) batch.endDate = payload.endDate;
  if (payload.status !== undefined) batch.status = payload.status;

  if (payload.assignedTutorId !== undefined) {
    const nextTutorId = payload.assignedTutorId || null;

    if (nextTutorId) {
      await assertInstitutionTutor({ tutorId: nextTutorId, institutionId });
    }

    const previousTutorId = batch.assignedTutorId;
    batch.assignedTutorId = nextTutorId;

    if (!sameId(previousTutorId, nextTutorId)) {
      await TutorAssignment.updateMany(
        { institutionId, batchId: batch._id, assignmentType: 'batch', status: 'active' },
        { $set: { status: 'removed', removedBy: actorUser._id, removedAt: new Date() } }
      );

      if (nextTutorId) {
        await TutorAssignment.create({
          institutionId,
          tutorId: nextTutorId,
          batchId: batch._id,
          assignmentType: 'batch',
          assignedBy: actorUser._id
        });

        await notifyTutorAssignment({
          tutorId: nextTutorId,
          title: 'New Batch Assignment',
          message: `You have been assigned to batch "${batch.name}".`,
          metadata: { batchId: batch._id, eventType: 'BATCH_ASSIGNED' }
        });
      }
    }
  }

  await batch.save();

  return {
    message: 'Batch updated successfully',
    data: {
      batch: batchToPayload(batch)
    }
  };
};

const addStudentsToBatch = async ({ actor, batchId, payload, file }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);
  const batch = await getBatchForInstitution({ batchId, institutionId });
  const { emails, studentIds } = collectStudentInputs({ payload, file });

  if (emails.length === 0 && studentIds.length === 0) {
    throw new ApiError(400, 'Provide student IDs, emails, or a CSV file', 'NO_STUDENTS_PROVIDED');
  }

  const existingIds = new Set(batch.students.map((student) => String(student.userId)));
  const successful = [];
  const failed = [];

  const usersById = studentIds.length
    ? await User.find({ _id: { $in: studentIds }, deletedAt: null })
    : [];
  const usersByEmail = emails.length
    ? await User.find({ email: { $in: emails.map((email) => email.toLowerCase()) }, deletedAt: null })
    : [];

  const candidates = new Map();
  usersById.forEach((user) => candidates.set(String(user._id), user));
  usersByEmail.forEach((user) => candidates.set(String(user._id), user));

  studentIds.forEach((studentId) => {
    if (!candidates.has(String(studentId))) {
      failed.push({ identifier: studentId, reason: 'Student not found' });
    }
  });

  emails.forEach((email) => {
    const found = usersByEmail.some((user) => user.email === email);
    if (!found) {
      failed.push({ identifier: email, reason: 'Student not found' });
    }
  });

  for (const user of candidates.values()) {
    if (user.role !== 'learner') {
      failed.push({ identifier: user.email, reason: 'User is not a learner' });
      continue;
    }

    if (user.status !== 'active') {
      failed.push({ identifier: user.email, reason: 'Learner is not active' });
      continue;
    }

    if (!user.institutionId) {
      failed.push({ identifier: user.email, reason: 'Learner is independent and does not belong to this institution' });
      continue;
    }

    if (!sameId(user.institutionId, institutionId)) {
      failed.push({ identifier: user.email, reason: 'Learner belongs to another institution' });
      continue;
    }

    if (existingIds.has(String(user._id))) {
      failed.push({ identifier: user.email, reason: 'Learner already exists in this batch' });
      continue;
    }

    batch.students.push({
      userId: user._id,
      addedBy: actorUser._id
    });
    existingIds.add(String(user._id));
    successful.push({ id: user._id, name: user.name, email: user.email });
  }

  await batch.save();

  return {
    message: `Students processed. Added: ${successful.length}, Failed: ${failed.length}`,
    data: {
      added: successful,
      failed,
      batch: batchToPayload(batch)
    }
  };
};

const removeStudentFromBatch = async ({ actor, batchId, studentId }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const batch = await getBatchForInstitution({ batchId, institutionId });
  const initialCount = batch.students.length;

  batch.students = batch.students.filter((student) => !sameId(student.userId, studentId));

  if (batch.students.length === initialCount) {
    throw new ApiError(404, 'Student is not in this batch', 'BATCH_STUDENT_NOT_FOUND');
  }

  await batch.save();

  return {
    message: 'Student removed from batch successfully',
    data: {
      batch: batchToPayload(batch)
    }
  };
};

const archiveBatch = async ({ actor, batchId }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const batch = await getBatchForInstitution({ batchId, institutionId });
  const now = new Date();
  const activeSessionFilter = {
    batchId: batch._id,
    deletedAt: null,
    status: { $in: ['scheduled', 'rescheduled', 'live'] },
    endTime: { $gte: now }
  };
  const [blockingSessions, blockingSessionCount] = await Promise.all([
    LiveSession.find(activeSessionFilter)
      .select('title startTime endTime status')
      .sort({ startTime: 1 })
      .limit(5)
      .lean(),
    LiveSession.countDocuments(activeSessionFilter)
  ]);

  if (blockingSessionCount > 0) {
    throw new ApiError(
      409,
      `Cannot archive batch while ${blockingSessionCount} active or upcoming live session(s) are linked to it`,
      'BATCH_HAS_ACTIVE_SESSIONS',
      {
        total: blockingSessionCount,
        sessions: blockingSessions
      }
    );
  }

  batch.status = 'archived';
  batch.archivedAt = new Date();
  await batch.save();

  return {
    message: 'Batch archived successfully',
    data: {
      batch: batchToPayload(batch)
    }
  };
};

const deleteBatch = async ({ actor, batchId }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const batch = await getBatchForInstitution({ batchId, institutionId });
  const now = new Date();
  const activeSessionFilter = {
    batchId: batch._id,
    deletedAt: null,
    status: { $in: ['scheduled', 'rescheduled', 'live'] },
    endTime: { $gte: now }
  };
  const [blockingSessions, blockingSessionCount] = await Promise.all([
    LiveSession.find(activeSessionFilter)
      .select('title startTime endTime status')
      .sort({ startTime: 1 })
      .limit(5)
      .lean(),
    LiveSession.countDocuments(activeSessionFilter)
  ]);

  if (blockingSessionCount > 0) {
    throw new ApiError(
      409,
      `Cannot delete batch while ${blockingSessionCount} active or upcoming live session(s) are linked to it`,
      'BATCH_HAS_ACTIVE_SESSIONS',
      {
        total: blockingSessionCount,
        sessions: blockingSessions
      }
    );
  }

  batch.deletedAt = new Date();
  await batch.save();

  // Cascade: deactivate tutor assignments
  await deactivateAssignmentsForBatch(batch._id);

  return {
    message: 'Batch deleted successfully'
  };
};

const listApprovedTutors = async ({ actor, query }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const filter = {
    institutionId,
    role: 'tutor',
    status: 'active',
    deletedAt: null
  };

  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { email: { $regex: query.search, $options: 'i' } }
    ];
  }

  const tutors = await User.find(filter)
    .select('name email profile status')
    .sort({ name: 1 })
    .lean();

  return {
    message: 'Approved tutors retrieved successfully',
    data: {
      tutors: tutors.map(toPublicUser)
    }
  };
};

const listTutorAssignments = async ({ actor, query }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const filter = { institutionId };

  if (query.status) filter.status = query.status;
  if (query.tutorId) filter.tutorId = query.tutorId;
  if (query.assignmentType) filter.assignmentType = query.assignmentType;

  const assignments = await TutorAssignment.find(filter)
    .populate('tutorId', 'name email')
    .populate('courseId', 'title')
    .populate('batchId', 'name status')
    .sort({ createdAt: -1 })
    .lean();

  return {
    message: 'Tutor assignments retrieved successfully',
    data: {
      assignments
    }
  };
};

const createTutorAssignments = async ({ actor, payload }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);
  const tutor = await assertInstitutionTutor({ tutorId: payload.tutorId, institutionId });
  const courseIds = normalizeStringList(payload.courseIds);
  const batchIds = normalizeStringList(payload.batchIds || payload.batchId);

  if (courseIds.length === 0 && batchIds.length === 0) {
    throw new ApiError(400, 'Provide at least one course or batch assignment', 'NO_ASSIGNMENT_TARGETS');
  }

  const assignments = [];

  return await runInTransaction(async (session) => {
    for (const courseId of courseIds) {
      const course = await Course.findOne({ _id: courseId, deletedAt: null }).session(session);
      if (!course) {
        throw new ApiError(404, `Course not found: ${courseId}`, 'COURSE_NOT_FOUND');
      }

      const isInstitutionCourse = await courseBelongsToInstitution({ course, institutionId, actorUser });
      if (!isInstitutionCourse) {
        throw new ApiError(403, `Course is not managed by this institution: ${courseId}`, 'COURSE_NOT_IN_INSTITUTION');
      }

      await TutorAssignment.updateMany(
        { institutionId, courseId: course._id, assignmentType: 'course', status: 'active' },
        { $set: { status: 'removed', removedBy: actorUser._id, removedAt: new Date() } },
        { session }
      );

      const assignment = await createTutorAssignmentRecord({
        institutionId,
        tutorId: tutor._id,
        courseId: course._id,
        assignmentType: 'course',
        assignedBy: actorUser._id,
        metadata: { previousAuthorId: course.authorId }
      }, 'Course');

      course.authorId = tutor._id;
      course.authorSnapshot = buildAuthorSnapshot(tutor);
      await course.save({ session });

      await auditService.logAdminAction({
        actorUserId: actorUser._id,
        targetUserId: tutor._id,
        action: 'TUTOR_ASSIGNED',
        metadata: { institutionId, assignmentType: 'course', courseId: course._id, assignmentId: assignment._id }
      });

      await notifyTutorAssignment({
        tutorId: tutor._id,
        title: 'New Course Assignment',
        message: `You have been assigned to course "${course.title}".`,
        metadata: { courseId: course._id, assignmentId: assignment._id, eventType: 'COURSE_ASSIGNED' }
      });

      assignments.push(assignment);
    }

    for (const batchId of batchIds) {
      const batch = await getBatchForInstitution({ batchId, institutionId });

      await TutorAssignment.updateMany(
        { institutionId, batchId: batch._id, assignmentType: 'batch', status: 'active' },
        { $set: { status: 'removed', removedBy: actorUser._id, removedAt: new Date() } },
        { session }
      );

      batch.assignedTutorId = tutor._id;
      await batch.save({ session });

      const assignment = await createTutorAssignmentRecord({
        institutionId,
        tutorId: tutor._id,
        batchId: batch._id,
        assignmentType: 'batch',
        assignedBy: actorUser._id
      }, 'Batch');

      await auditService.logAdminAction({
        actorUserId: actorUser._id,
        targetUserId: tutor._id,
        action: 'TUTOR_ASSIGNED',
        metadata: { institutionId, assignmentType: 'batch', batchId: batch._id, assignmentId: assignment._id }
      });

      await notifyTutorAssignment({
        tutorId: tutor._id,
        title: 'New Batch Assignment',
        message: `You have been assigned to batch "${batch.name}".`,
        metadata: { batchId: batch._id, assignmentId: assignment._id, eventType: 'BATCH_ASSIGNED' }
      });

      assignments.push(assignment);
    }

    return {
      message: 'Tutor assignment created successfully',
      data: { assignments }
    };
  });
};

const removeTutorAssignment = async ({ actor, assignmentId }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);

  return await runInTransaction(async (session) => {
    const assignment = await TutorAssignment.findOne({
      _id: assignmentId,
      institutionId,
      status: 'active'
    }).session(session);

    if (!assignment) {
      throw new ApiError(404, 'Active tutor assignment not found', 'ASSIGNMENT_NOT_FOUND');
    }

    assignment.status = 'removed';
    assignment.removedBy = actorUser._id;
    assignment.removedAt = new Date();
    await assignment.save({ session });

    if (assignment.assignmentType === 'course' && assignment.courseId) {
      const course = await Course.findOne({ _id: assignment.courseId, deletedAt: null }).session(session);
      if (course && sameId(course.authorId, assignment.tutorId)) {
        const previousAuthorId = assignment.metadata?.previousAuthorId;
        const previousAuthor = previousAuthorId && !sameId(previousAuthorId, assignment.tutorId)
          ? await User.findOne({ _id: previousAuthorId, deletedAt: null }).select('name role profile').session(session)
          : null;
        const restoredAuthor = previousAuthor || actorUser;
        course.authorId = restoredAuthor._id;
        course.authorSnapshot = buildAuthorSnapshot(restoredAuthor);
        await course.save({ session });
      }
    }

    if (assignment.assignmentType === 'batch' && assignment.batchId) {
      await Batch.updateOne(
        { _id: assignment.batchId, institutionId, assignedTutorId: assignment.tutorId },
        { $set: { assignedTutorId: null } },
        { session }
      );
    }

    // Notify tutor of removal
    try {
      await notifyTutorAssignment({
        tutorId: assignment.tutorId,
        title: 'Assignment Removed',
        message: `You have been removed from a ${assignment.assignmentType} assignment.`,
        metadata: { assignmentId: assignment._id, eventType: 'ASSIGNMENT_REMOVED' }
      });
    } catch (notifErr) {
      console.error('[Institution] Removal notification failed:', notifErr.message);
    }

    await auditService.logAdminAction({
      actorUserId: actorUser._id,
      targetUserId: assignment.tutorId,
      action: 'TUTOR_REMOVED',
      metadata: { institutionId, assignmentType: assignment.assignmentType, assignmentId: assignment._id }
    });

    return {
      message: 'Tutor assignment removed successfully',
      data: { assignment }
    };
  });
};

const getSessionForInstitution = async ({ sessionId, institutionId }) => {
  const session = await LiveSession.findOne({ _id: sessionId, deletedAt: null })
    .populate('courseId', 'title')
    .populate('tutorId', 'name email')
    .populate('batchId', 'name institutionId students status');

  if (!session) {
    throw new ApiError(404, 'Live session not found', 'SESSION_NOT_FOUND');
  }

  if (!session.batchId || !sameId(session.batchId.institutionId, institutionId)) {
    throw new ApiError(403, 'Session is not linked to a batch in this institution', 'SESSION_NOT_IN_INSTITUTION');
  }

  return session;
};

const getAttendanceRoster = async ({ actor, sessionId, query = {} }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const session = await getSessionForInstitution({ sessionId, institutionId });
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
  const skip = (page - 1) * limit;
  const batchId = session.batchId._id;
  const [batch, totalResult] = await Promise.all([
    Batch.findOne({ _id: batchId, institutionId, deletedAt: null })
      .slice('students', [skip, limit])
      .populate('students.userId', 'name email profile status'),
    Batch.aggregate([
      { $match: { _id: batchId, institutionId, deletedAt: null } },
      { $project: { studentCount: { $size: '$students' } } }
    ])
  ]);

  if (!batch) {
    throw new ApiError(404, 'Batch not found in this institution', 'BATCH_NOT_FOUND');
  }

  const studentIds = batch.students
    .map((student) => student.userId?._id || student.userId)
    .filter(Boolean);
  const records = await Attendance.find({
    sessionId,
    learnerId: { $in: studentIds }
  }).lean();
  const recordByLearner = new Map(records.map((record) => [String(record.learnerId), record]));
  const totalStudents = totalResult[0]?.studentCount || 0;
  const batchPayload = batchToPayload(batch);
  batchPayload.studentCount = totalStudents;

  return {
    message: 'Attendance roster retrieved successfully',
    data: {
      session,
      batch: batchPayload,
      students: batch.students.map((student) => {
        const user = student.userId;
        const userId = user?._id || user;
        return {
          user,
          attendance: userId ? recordByLearner.get(String(userId)) || null : null
        };
      }),
      pagination: {
        page,
        limit,
        total: totalStudents,
        pages: Math.ceil(totalStudents / limit)
      }
    }
  };
};

const markAttendance = async ({ actor, sessionId, records }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);
  const session = await getSessionForInstitution({ sessionId, institutionId });
  const batch = await Batch.findOne({ _id: session.batchId._id, institutionId, deletedAt: null });
  const batchStudentIds = new Set(batch.students.map((student) => String(student.userId)));
  const updated = [];
  const failed = [];

  for (const record of records) {
    if (!batchStudentIds.has(String(record.studentId))) {
      failed.push({ studentId: record.studentId, reason: 'Student is not in this batch' });
      continue;
    }

    const attendance = await Attendance.findOneAndUpdate(
      {
        sessionId,
        learnerId: record.studentId
      },
      {
        $set: {
          institutionId,
          batchId: batch._id,
          attendanceStatus: record.status,
          note: record.note || '',
          markedBy: actorUser._id,
          markedAt: new Date()
        },
        $setOnInsert: {
          joinedAt: record.status === 'present' || record.status === 'late' ? new Date() : null
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).populate('learnerId', 'name email');

    updated.push(attendance);
  }

  return {
    message: `Attendance saved. Updated: ${updated.length}, Failed: ${failed.length}`,
    data: {
      updated,
      failed
    }
  };
};

const buildAttendanceRows = (records) => records.map((record) => ({
  sessionId: record.sessionId?._id || record.sessionId,
  sessionTitle: record.sessionId?.title || '',
  batchName: record.batchId?.name || '',
  studentId: record.learnerId?._id || record.learnerId,
  studentName: record.learnerId?.name || '',
  studentEmail: record.learnerId?.email || '',
  status: record.attendanceStatus,
  joinedAt: record.joinedAt || '',
  leftAt: record.leftAt || '',
  totalMinutes: record.totalMinutes || 0,
  markedAt: record.markedAt || '',
  note: record.note || ''
}));

const exportAttendanceForSession = async ({ actor, sessionId }) => {
  const { institutionId } = await getInstitutionContext(actor);
  await getSessionForInstitution({ sessionId, institutionId });

  const records = await Attendance.find({ sessionId, institutionId })
    .populate('sessionId', 'title startTime')
    .populate('batchId', 'name')
    .populate('learnerId', 'name email')
    .sort({ createdAt: 1 })
    .lean();

  const parser = new Parser({
    fields: ['sessionId', 'sessionTitle', 'batchName', 'studentId', 'studentName', 'studentEmail', 'status', 'joinedAt', 'leftAt', 'totalMinutes', 'markedAt', 'note']
  });

  return Buffer.from(parser.parse(buildAttendanceRows(records)));
};

const getStudentAttendance = async ({ actor, studentId }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const student = await User.findOne({
    _id: studentId,
    institutionId,
    role: 'learner',
    deletedAt: null
  }).select('name email');

  if (!student) {
    throw new ApiError(404, 'Student not found in this institution', 'STUDENT_NOT_FOUND');
  }

  const records = await Attendance.find({ learnerId: studentId, institutionId })
    .populate('sessionId', 'title startTime endTime status')
    .populate('batchId', 'name')
    .sort({ markedAt: -1, createdAt: -1 })
    .lean();

  return {
    message: 'Student attendance retrieved successfully',
    data: {
      student,
      attendance: records
    }
  };
};

const exportAttendanceForStudent = async ({ actor, studentId }) => {
  const result = await getStudentAttendance({ actor, studentId });
  const parser = new Parser({
    fields: ['sessionId', 'sessionTitle', 'batchName', 'studentId', 'studentName', 'studentEmail', 'status', 'joinedAt', 'leftAt', 'totalMinutes', 'markedAt', 'note']
  });

  const rows = buildAttendanceRows(result.data.attendance.map((record) => ({
    ...record,
    learnerId: result.data.student
  })));

  return Buffer.from(parser.parse(rows));
};

const getBatchAttendanceHistory = async ({ actor, batchId }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const batch = await getBatchForInstitution({ batchId, institutionId });
  const sessions = await LiveSession.find({ batchId: batch._id, deletedAt: null })
    .sort({ startTime: -1 })
    .populate('courseId', 'title')
    .populate('tutorId', 'name email')
    .lean();
  const sessionIds = sessions.map((session) => session._id);
  const records = await Attendance.find({ sessionId: { $in: sessionIds }, institutionId }).lean();

  const countsBySession = new Map();
  records.forEach((record) => {
    const key = String(record.sessionId);
    if (!countsBySession.has(key)) {
      countsBySession.set(key, { present: 0, absent: 0, late: 0, joined: 0, partial: 0, completed: 0 });
    }
    const counts = countsBySession.get(key);
    counts[record.attendanceStatus] = (counts[record.attendanceStatus] || 0) + 1;
  });

  return {
    message: 'Batch attendance history retrieved successfully',
    data: {
      batch: batchToPayload(batch),
      sessions: sessions.map((session) => ({
        ...session,
        attendanceSummary: countsBySession.get(String(session._id)) || {
          present: 0,
          absent: 0,
          late: 0,
          joined: 0,
          partial: 0,
          completed: 0
        }
      }))
    }
  };
};

/**
 * Role-aware: get a single tutor assignment
 * - Admin/institution_admin: full access within institution
 * - Tutor: can only view own assignments
 * - Learner: can view assigned tutor for a batch/course they're enrolled in
 */
const getTutorAssignment = async ({ actor, assignmentId }) => {
  const assignment = await TutorAssignment.findById(assignmentId)
    .populate('tutorId', 'name email profile')
    .populate('courseId', 'title')
    .populate('batchId', 'name status')
    .lean();

  if (!assignment) {
    throw new ApiError(404, 'Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  const role = actor.role;

  if (role === 'tutor') {
    // Tutor can only view their own assignments
    if (String(assignment.tutorId._id || assignment.tutorId) !== String(actor._id || actor.id)) {
      throw new ApiError(403, 'Access denied', 'FORBIDDEN');
    }
  } else if (role === 'learner') {
    // Learner can only view if enrolled in the related course/batch institution
    const membership = await InstitutionMembership.findOne({
      userId: actor._id || actor.id,
      institutionId: assignment.institutionId,
      status: 'active'
    });
    if (!membership) {
      throw new ApiError(403, 'Access denied: not a member of this institution', 'FORBIDDEN');
    }
    // Only return public tutor info
    return {
      message: 'Assigned tutor retrieved',
      data: {
        tutor: assignment.tutorId,
        assignmentType: assignment.assignmentType,
        courseId: assignment.courseId,
        batchId: assignment.batchId
      }
    };
  } else {
    // Admin: check institution boundary
    const { institutionId } = await getInstitutionContext(actor);
    if (String(assignment.institutionId) !== String(institutionId)) {
      throw new ApiError(403, 'Access denied: cross-institution read', 'FORBIDDEN');
    }
  }

  return {
    message: 'Assignment retrieved successfully',
    data: { assignment }
  };
};

/**
 * Admin: retrieve immutable assignment history via AuditLog
 */
const getTutorAssignmentHistory = async ({ actor, tutorId, limit = 50 }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const AuditLog = require('../models/auditLog.model');

  const filter = {
    action: { $in: ['TUTOR_ASSIGNED', 'TUTOR_REMOVED', 'TUTOR_REASSIGNED'] },
    'metadata.institutionId': institutionId
  };
  if (tutorId) filter.targetUserId = tutorId;

  const history = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actorUserId', 'name email')
    .populate('targetUserId', 'name email')
    .lean();

  return {
    message: 'Assignment history retrieved',
    data: { history }
  };
};

/**
 * Admin: assignment workload monitoring
 */
const getTutorMonitoringStats = async ({ actor }) => {
  const { institutionId } = await getInstitutionContext(actor);

  const allTutors = await User.find({
    institutionId,
    role: 'tutor',
    status: 'active',
    deletedAt: null
  }).select('_id name email').lean();

  const tutorIds = allTutors.map(t => t._id);

  const assignmentCounts = await TutorAssignment.aggregate([
    { $match: { institutionId, tutorId: { $in: tutorIds }, status: 'active' } },
    { $group: { _id: '$tutorId', count: { $sum: 1 }, types: { $addToSet: '$assignmentType' } } }
  ]);

  const countMap = {};
  assignmentCounts.forEach(a => { countMap[String(a._id)] = a; });

  const OVERLOAD_THRESHOLD = 5;
  const tutorStats = allTutors.map(t => {
    const stats = countMap[String(t._id)] || { count: 0, types: [] };
    return {
      tutorId: t._id,
      name: t.name,
      email: t.email,
      activeAssignments: stats.count,
      assignmentTypes: stats.types,
      isOverloaded: stats.count >= OVERLOAD_THRESHOLD,
      isInactive: stats.count === 0
    };
  });

  return {
    message: 'Tutor monitoring stats retrieved',
    data: {
      tutors: tutorStats,
      overloadedCount: tutorStats.filter(t => t.isOverloaded).length,
      inactiveCount: tutorStats.filter(t => t.isInactive).length,
      totalActiveTutors: allTutors.length
    }
  };
};

/**
 * Cascade: deactivate all active assignments for a tutor when they are suspended
 */
const suspendTutorCascade = async ({ tutorId, institutionId, actorUserId }) => {
  const assignments = await TutorAssignment.find({ tutorId, institutionId, status: 'active' }).lean();
  if (assignments.length === 0) return;

  await TutorAssignment.updateMany(
    { tutorId, institutionId, status: 'active' },
    { $set: { status: 'removed', removedBy: actorUserId, removedAt: new Date() } }
  );

  for (const assignment of assignments) {
    await auditService.logAdminAction({
      actorUserId,
      targetUserId: tutorId,
      action: 'TUTOR_REMOVED',
      metadata: { institutionId, assignmentId: assignment._id, reason: 'TUTOR_SUSPENDED', assignmentType: assignment.assignmentType }
    });
  }
};

/**
 * Cascade: archive all active assignments for a deleted/archived course
 */
const deactivateAssignmentsForCourse = async (courseId) => {
  await TutorAssignment.updateMany(
    { courseId, status: 'active' },
    { $set: { status: 'removed', removedAt: new Date(), 'metadata.reason': 'COURSE_DELETED' } }
  );
};

/**
 * Cascade: archive all active assignments for a deleted/archived batch
 */
const deactivateAssignmentsForBatch = async (batchId) => {
  await TutorAssignment.updateMany(
    { batchId, status: 'active' },
    { $set: { status: 'removed', removedAt: new Date(), 'metadata.reason': 'BATCH_DELETED' } }
  );
};

const getSettings = async ({ actor }) => {
  const institutionId = actor.institutionId;
  if (!institutionId) {
    throw new ApiError(400, 'User is not associated with an institution', 'NO_INSTITUTION_ASSOCIATION');
  }

  let settings = await InstitutionSettings.findOne({ institutionId });
  if (!settings) {
    settings = await InstitutionSettings.create({
      institutionId,
      allowPublicCourses: true
    });
  }

  return {
    message: 'Institution settings retrieved successfully.',
    data: settings
  };
};

const updateSettings = async ({ actor, payload }) => {
  const institutionId = actor.institutionId;
  if (!institutionId) {
    throw new ApiError(400, 'User is not associated with an institution', 'NO_INSTITUTION_ASSOCIATION');
  }

  let settings = await InstitutionSettings.findOne({ institutionId });
  if (!settings) {
    settings = new InstitutionSettings({
      institutionId,
      allowPublicCourses: payload.allowPublicCourses,
      updatedBy: actor._id || actor.id
    });
  } else {
    settings.allowPublicCourses = payload.allowPublicCourses;
    settings.updatedBy = actor._id || actor.id;
  }

  await settings.save();

  return {
    message: 'Institution settings updated successfully.',
    data: settings
  };
};

module.exports = {
  getInstitutionContext,
  getDashboard,
  listBatches,
  getBatch,
  createBatch,
  updateBatch,
  addStudentsToBatch,
  removeStudentFromBatch,
  archiveBatch,
  deleteBatch,
  listApprovedTutors,
  listTutorAssignments,
  createTutorAssignments,
  removeTutorAssignment,
  getTutorAssignment,
  getTutorAssignmentHistory,
  getTutorMonitoringStats,
  suspendTutorCascade,
  deactivateAssignmentsForCourse,
  deactivateAssignmentsForBatch,
  getAttendanceRoster,
  markAttendance,
  exportAttendanceForSession,
  getStudentAttendance,
  exportAttendanceForStudent,
  getBatchAttendanceHistory,
  getSettings,
  updateSettings
};
