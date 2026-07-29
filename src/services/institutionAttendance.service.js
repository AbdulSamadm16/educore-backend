const mongoose = require('mongoose');
const AttendanceSession = require('../models/attendanceSession.model');
const AttendanceRecord = require('../models/attendanceRecord.model');
const Batch = require('../models/batch.model');
const InstitutionMembership = require('../models/institutionMembership.model');
const TutorAssignment = require('../models/tutorAssignment.model');
const Institution = require('../models/institution.model');
const { ApiError } = require('../utils/errors');
const auditService = require('./audit.service');
const { isInstitutionAdminRole, isPlatformAdminRole } = require('../utils/roles');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

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

const getInstitutionContext = async (actor) => {
  const institutionId = actor.institutionId;
  if (!institutionId) throw new ApiError(400, 'Institution context missing', 'INSTITUTION_MISSING');
  return { actorUser: actor, institutionId };
};

const createAttendanceSession = async ({ actor, batchId, attendanceDate, topicCovered, remarks }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);

  // Validate tutor assignment
  const assignment = await TutorAssignment.findOne({
    institutionId,
    batchId,
    tutorId: actorUser._id,
    status: 'active'
  });
  if (!assignment) {
    throw new ApiError(403, 'You are not actively assigned to this batch', 'UNAUTHORIZED_BATCH_ACCESS');
  }

  // Validate batch
  const batch = await Batch.findOne({ _id: batchId, institutionId, deletedAt: null });
  if (!batch) {
    throw new ApiError(404, 'Batch not found or deleted', 'BATCH_NOT_FOUND');
  }

  return await runInTransaction(async (session) => {
    // Check for duplicate
    const startOfDay = new Date(attendanceDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const existingSession = await AttendanceSession.findOne({
      batchId,
      attendanceDate: { $gte: startOfDay, $lt: endOfDay }
    }).session(session);

    if (existingSession) {
      throw new ApiError(409, 'An attendance session already exists for this batch on this date', 'DUPLICATE_SESSION');
    }

    const attSession = new AttendanceSession({
      institutionId,
      batchId,
      tutorId: actorUser._id,
      attendanceDate: startOfDay,
      topicCovered,
      remarks,
      status: 'draft',
      createdBy: actorUser._id,
      updatedBy: actorUser._id
    });
    await attSession.save({ session });

    // Auto load students who are active in this batch
    const studentIds = batch.students.map(s => s.userId);
    const activeMemberships = await InstitutionMembership.find({
      userId: { $in: studentIds },
      institutionId,
      status: 'active'
    }).select('userId').session(session);
    
    const activeStudentIds = activeMemberships.map(m => m.userId);

    const records = activeStudentIds.map(studentId => ({
      attendanceSessionId: attSession._id,
      institutionId,
      batchId,
      studentId,
      status: 'absent', // Default
      markedBy: actorUser._id
    }));

    if (records.length > 0) {
      await AttendanceRecord.insertMany(records, { session });
    }

    await auditService.logAdminAction({
      actorUserId: actorUser._id,
      targetUserId: actorUser._id,
      action: 'ATTENDANCE_CREATED',
      metadata: { institutionId, batchId, sessionId: attSession._id }
    });

    return {
      message: 'Attendance session created successfully',
      data: { session: attSession, studentCount: records.length }
    };
  });
};

const getSessionRoster = async ({ actor, sessionId }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);

  const attSession = await AttendanceSession.findOne({ _id: sessionId, institutionId })
    .populate('batchId', 'name')
    .populate('tutorId', 'name email');

  if (!attSession) {
    throw new ApiError(404, 'Attendance session not found', 'SESSION_NOT_FOUND');
  }

  // Check access
  if (actorUser.role === 'tutor' && String(attSession.tutorId._id) !== String(actorUser._id)) {
    throw new ApiError(403, 'You do not have access to this session', 'UNAUTHORIZED_BATCH_ACCESS');
  }

  const records = await AttendanceRecord.find({ attendanceSessionId: sessionId })
    .populate('studentId', 'name email profile');

  return {
    message: 'Attendance roster retrieved',
    data: { session: attSession, records }
  };
};

const markAttendance = async ({ actor, sessionId, records }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);

  const attSession = await AttendanceSession.findOne({ _id: sessionId, institutionId });
  if (!attSession) throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');

  if (attSession.status === 'locked') {
    throw new ApiError(403, 'Session is locked and cannot be edited', 'SESSION_LOCKED');
  }

  if (actorUser.role === 'tutor') {
    if (String(attSession.tutorId) !== String(actorUser._id)) {
      throw new ApiError(403, 'You do not have access to this session', 'UNAUTHORIZED_BATCH_ACCESS');
    }
    const assignment = await TutorAssignment.findOne({ institutionId, batchId: attSession.batchId, tutorId: actorUser._id, status: 'active' });
    if (!assignment) throw new ApiError(403, 'Assignment revoked', 'TUTOR_ASSIGNMENT_REVOKED');
  }

  // Check edit window
  const inst = await Institution.findById(institutionId);
  const editWindowHours = inst.settings?.attendanceEditWindowHours || 24;
  const hoursSinceCreation = (Date.now() - attSession.createdAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceCreation > editWindowHours) {
    attSession.status = 'locked';
    attSession.lockedAt = new Date();
    await attSession.save();
    throw new ApiError(403, 'Edit window has expired. Session is now locked.', 'EDIT_WINDOW_EXPIRED');
  }

  return await runInTransaction(async (session) => {
    let updatedCount = 0;
    for (const record of records) {
      if (!['present', 'absent', 'late'].includes(record.status)) continue;

      const result = await AttendanceRecord.updateOne(
        { _id: record.recordId, attendanceSessionId: sessionId },
        { 
          $set: { 
            status: record.status, 
            lastEditedBy: actorUser._id, 
            lastEditedAt: new Date() 
          } 
        },
        { session }
      );
      if (result.modifiedCount > 0) updatedCount++;
    }

    if (attSession.status === 'draft') {
      attSession.status = 'submitted';
    }
    attSession.updatedBy = actorUser._id;
    await attSession.save({ session });

    await auditService.logAdminAction({
      actorUserId: actorUser._id,
      targetUserId: actorUser._id,
      action: 'ATTENDANCE_UPDATED',
      metadata: { institutionId, sessionId, updatedCount }
    });

    return {
      message: 'Attendance saved successfully',
      data: { updatedCount }
    };
  });
};

const overrideLockedAttendance = async ({ actor, sessionId, records }) => {
  const { actorUser, institutionId } = await getInstitutionContext(actor);

  // Simplistic permission check: must be super_admin or admin
  if (!isInstitutionAdminRole(actorUser.role) && !isPlatformAdminRole(actorUser.role)) {
    throw new ApiError(403, 'You do not have permission to override attendance', 'FORBIDDEN');
  }

  const attSession = await AttendanceSession.findOne({ _id: sessionId, institutionId });
  if (!attSession) throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');

  return await runInTransaction(async (session) => {
    let updatedCount = 0;
    for (const record of records) {
      if (!['present', 'absent', 'late'].includes(record.status)) continue;
      const result = await AttendanceRecord.updateOne(
        { _id: record.recordId, attendanceSessionId: sessionId },
        { $set: { status: record.status, lastEditedBy: actorUser._id, lastEditedAt: new Date() } },
        { session }
      );
      if (result.modifiedCount > 0) updatedCount++;
    }

    attSession.updatedBy = actorUser._id;
    await attSession.save({ session });

    await auditService.logAdminAction({
      actorUserId: actorUser._id,
      targetUserId: actorUser._id,
      action: 'ATTENDANCE_OVERRIDE',
      metadata: { institutionId, sessionId, updatedCount }
    });

    return {
      message: 'Attendance overridden successfully',
      data: { updatedCount }
    };
  });
};

const getAttendanceDashboard = async ({ actor }) => {
  const { institutionId } = await getInstitutionContext(actor);

  const totalSessions = await AttendanceSession.countDocuments({ institutionId });
  
  const statusCounts = await AttendanceRecord.aggregate([
    { $match: { institutionId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  let present = 0, absent = 0, late = 0;
  statusCounts.forEach(s => {
    if (s._id === 'present') present = s.count;
    if (s._id === 'absent') absent = s.count;
    if (s._id === 'late') late = s.count;
  });

  const totalRecords = present + absent + late;
  const attendanceRate = totalRecords ? ((present + late) / totalRecords) * 100 : 0;
  const absentRate = totalRecords ? (absent / totalRecords) * 100 : 0;
  const lateRate = totalRecords ? (late / totalRecords) * 100 : 0;

  return {
    message: 'Dashboard stats retrieved',
    data: {
      totalSessions,
      totalRecords,
      attendanceRate: attendanceRate.toFixed(2),
      absentRate: absentRate.toFixed(2),
      lateRate: lateRate.toFixed(2),
      counts: { present, absent, late }
    }
  };
};

const getBatchAttendanceAnalytics = async ({ actor, batchId }) => {
  const { institutionId } = await getInstitutionContext(actor);

  const batch = await Batch.findOne({ _id: batchId, institutionId, deletedAt: null });
  if (!batch) throw new ApiError(404, 'Batch not found', 'BATCH_NOT_FOUND');

  const statusCounts = await AttendanceRecord.aggregate([
    { $match: { institutionId, batchId: new mongoose.Types.ObjectId(batchId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  let present = 0, absent = 0, late = 0;
  statusCounts.forEach(s => {
    if (s._id === 'present') present = s.count;
    if (s._id === 'absent') absent = s.count;
    if (s._id === 'late') late = s.count;
  });

  const totalRecords = present + absent + late;
  const attendanceRate = totalRecords ? ((present + late) / totalRecords) * 100 : 0;

  return {
    message: 'Batch analytics retrieved',
    data: {
      batchId,
      batchName: batch.name,
      totalRecords,
      attendanceRate: attendanceRate.toFixed(2),
      counts: { present, absent, late }
    }
  };
};

const buildAttendanceReportFilter = async ({ actor, query = {} }) => {
  const { institutionId } = await getInstitutionContext(actor);
  const sessionFilter = { institutionId };

  if (query.batchId) sessionFilter.batchId = query.batchId;
  if (query.tutorId) sessionFilter.tutorId = query.tutorId;
  if (query.dateFrom || query.dateTo) {
    sessionFilter.attendanceDate = {};
    if (query.dateFrom) sessionFilter.attendanceDate.$gte = new Date(query.dateFrom);
    if (query.dateTo) sessionFilter.attendanceDate.$lte = new Date(query.dateTo);
  }

  const sessionIds = await AttendanceSession.find(sessionFilter).distinct('_id');
  const recordFilter = { institutionId, attendanceSessionId: { $in: sessionIds } };
  if (query.studentId) recordFilter.studentId = query.studentId;

  return recordFilter;
};

const getAttendanceRecords = async ({ actor, query = {} }) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const skip = (page - 1) * limit;
  const recordFilter = await buildAttendanceReportFilter({ actor, query });

  const [records, total] = await Promise.all([
    AttendanceRecord.find(recordFilter)
      .populate('studentId', 'name email')
      .populate({
        path: 'attendanceSessionId',
        select: 'attendanceDate topicCovered tutorId batchId',
        populate: [
          { path: 'tutorId', select: 'name email' },
          { path: 'batchId', select: 'name' }
        ]
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AttendanceRecord.countDocuments(recordFilter)
  ]);

  return {
    message: 'Attendance records retrieved',
    data: {
      records,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    }
  };
};

const flattenAttendanceRows = (records) => records.map((record) => {
  const session = record.attendanceSessionId || {};
  return {
    date: session.attendanceDate ? new Date(session.attendanceDate).toISOString().slice(0, 10) : '',
    batch: session.batchId?.name || '',
    tutor: session.tutorId?.name || '',
    student: record.studentId?.name || '',
    email: record.studentId?.email || '',
    status: record.status,
    topic: session.topicCovered || ''
  };
});

const exportAttendanceCsv = async ({ actor, query = {} }) => {
  const recordFilter = await buildAttendanceReportFilter({ actor, query });
  const records = await AttendanceRecord.find(recordFilter)
    .populate('studentId', 'name email')
    .populate({
      path: 'attendanceSessionId',
      select: 'attendanceDate topicCovered tutorId batchId',
      populate: [
        { path: 'tutorId', select: 'name email' },
        { path: 'batchId', select: 'name' }
      ]
    })
    .sort({ createdAt: -1 })
    .lean();

  const parser = new Parser({ fields: ['date', 'batch', 'tutor', 'student', 'email', 'status', 'topic'] });
  return Buffer.from(parser.parse(flattenAttendanceRows(records)));
};

const exportAttendancePdf = async ({ actor, query = {} }) => {
  const recordFilter = await buildAttendanceReportFilter({ actor, query });
  const records = await AttendanceRecord.find(recordFilter)
    .populate('studentId', 'name email')
    .populate({
      path: 'attendanceSessionId',
      select: 'attendanceDate topicCovered tutorId batchId',
      populate: [
        { path: 'tutorId', select: 'name email' },
        { path: 'batchId', select: 'name' }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

  const rows = flattenAttendanceRows(records);
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  doc.fontSize(16).text('Attendance Report');
  doc.moveDown();
  doc.fontSize(9);
  rows.forEach((row) => {
    doc.text(`${row.date} | ${row.batch} | ${row.tutor} | ${row.student} | ${row.status}`);
  });
  doc.end();

  return await new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

module.exports = {
  createAttendanceSession,
  getSessionRoster,
  markAttendance,
  overrideLockedAttendance,
  getAttendanceDashboard,
  getBatchAttendanceAnalytics,
  getAttendanceRecords,
  exportAttendanceCsv,
  exportAttendancePdf
};
