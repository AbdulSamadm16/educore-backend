const attendanceService = require('../services/attendance.service');
const institutionService = require('../services/institution.service');
const LiveSession = require('../models/liveSession.model');
const Batch = require('../models/batch.model');
const User = require('../models/user.model');
const { ApiError } = require('../utils/errors');

// Helper to get tutor/admin institution context
const getTutorInstitutionContext = async (userObj) => {
  const { actorUser, institutionId } = await institutionService.getInstitutionContext(userObj);
  return { actorUser, institutionId };
};

exports.joinSession = async (req, res, next) => {
  try {
    const learnerId = req.user._id;
    const sessionId = req.params.id || req.body.sessionId;
    const attendance = await attendanceService.recordJoin(learnerId, sessionId);
    res.status(200).json({ success: true, data: attendance });
  } catch (error) {
    next(error);
  }
};

exports.leaveSession = async (req, res, next) => {
  try {
    const learnerId = req.user._id;
    const sessionId = req.params.id || req.body.sessionId;
    const attendance = await attendanceService.recordLeave(learnerId, sessionId);
    res.status(200).json({ success: true, data: attendance });
  } catch (error) {
    next(error);
  }
};

exports.getSessionAttendance = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const sessionId = req.params.id || req.query.sessionId;
    const attendance = await attendanceService.getSessionAttendance(tutorId, sessionId);
    res.status(200).json({ success: true, data: attendance });
  } catch (error) {
    next(error);
  }
};

// Tutor & Admin Dashboards Controllers
exports.getTutorBatches = async (req, res, next) => {
  try {
    const actor = req.user;
    const { institutionId } = await getTutorInstitutionContext(actor);

    let queryFilter = { institutionId, deletedAt: null };

    // If tutor, restrict to assigned batches OR batches where tutor teaches a live session
    if (actor.role === 'tutor') {
      const sessionBatches = await LiveSession.find({ tutorId: actor._id, deletedAt: null }).distinct('batchId');
      queryFilter.$or = [
        { assignedTutorId: actor._id },
        { _id: { $in: sessionBatches } }
      ];
    }

    const batches = await Batch.find(queryFilter).select('name status startDate endDate');

    const formattedBatches = batches.map(b => ({
      id: b._id || b.id,
      _id: b._id || b.id,
      name: b.name,
      status: b.status,
      startDate: b.startDate,
      endDate: b.endDate
    }));

    res.status(200).json({
      success: true,
      message: 'Batches retrieved successfully',
      data: { batches: formattedBatches }
    });
  } catch (error) {
    next(error);
  }
};

exports.getTutorBatchHistory = async (req, res, next) => {
  try {
    const actor = req.user;
    const { batchId } = req.params;
    const { institutionId } = await getTutorInstitutionContext(actor);

    const batch = await Batch.findOne({ _id: batchId, institutionId, deletedAt: null });
    if (!batch) {
      throw new ApiError(404, 'Batch not found in this institution', 'BATCH_NOT_FOUND');
    }

    if (actor.role === 'tutor') {
      const isAssigned = batch.assignedTutorId && String(batch.assignedTutorId) === String(actor._id);
      const teachesSession = await LiveSession.exists({ batchId, tutorId: actor._id, deletedAt: null });

      if (!isAssigned && !teachesSession) {
        throw new ApiError(403, 'You do not have access to this batch', 'FORBIDDEN');
      }
    }

    const result = await institutionService.getBatchAttendanceHistory({
      actor,
      batchId
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

exports.getTutorSessionRoster = async (req, res, next) => {
  try {
    const actor = req.user;
    const { sessionId } = req.params;
    const { institutionId } = await getTutorInstitutionContext(actor);

    const session = await LiveSession.findOne({ _id: sessionId, deletedAt: null });
    if (!session) {
      throw new ApiError(404, 'Live session not found', 'SESSION_NOT_FOUND');
    }

    if (actor.role === 'tutor') {
      const isTutor = String(session.tutorId) === String(actor._id);
      let isBatchAssigned = false;
      if (session.batchId) {
        const batch = await Batch.findOne({ _id: session.batchId, deletedAt: null }).select('assignedTutorId');
        if (batch && batch.assignedTutorId && String(batch.assignedTutorId) === String(actor._id)) {
          isBatchAssigned = true;
        }
      }

      if (!isTutor && !isBatchAssigned) {
        throw new ApiError(403, 'You do not have access to this session', 'FORBIDDEN');
      }
    }

    const result = await institutionService.getAttendanceRoster({
      actor,
      sessionId,
      query: req.query
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

exports.markTutorAttendance = async (req, res, next) => {
  try {
    const actor = req.user;
    const { sessionId } = req.params;
    const { institutionId } = await getTutorInstitutionContext(actor);

    const session = await LiveSession.findOne({ _id: sessionId, deletedAt: null });
    if (!session) {
      throw new ApiError(404, 'Live session not found', 'SESSION_NOT_FOUND');
    }

    if (actor.role === 'tutor') {
      const isTutor = String(session.tutorId) === String(actor._id);
      let isBatchAssigned = false;
      if (session.batchId) {
        const batch = await Batch.findOne({ _id: session.batchId, deletedAt: null }).select('assignedTutorId');
        if (batch && batch.assignedTutorId && String(batch.assignedTutorId) === String(actor._id)) {
          isBatchAssigned = true;
        }
      }

      if (!isTutor && !isBatchAssigned) {
        throw new ApiError(403, 'You do not have access to this session', 'FORBIDDEN');
      }
    }

    const result = await institutionService.markAttendance({
      actor,
      sessionId,
      records: req.body.records
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

exports.exportTutorSessionCSV = async (req, res, next) => {
  try {
    const actor = req.user;
    const { sessionId } = req.params;
    const { institutionId } = await getTutorInstitutionContext(actor);

    const session = await LiveSession.findOne({ _id: sessionId, deletedAt: null });
    if (!session) {
      throw new ApiError(404, 'Live session not found', 'SESSION_NOT_FOUND');
    }

    if (actor.role === 'tutor') {
      const isTutor = String(session.tutorId) === String(actor._id);
      let isBatchAssigned = false;
      if (session.batchId) {
        const batch = await Batch.findOne({ _id: session.batchId, deletedAt: null }).select('assignedTutorId');
        if (batch && batch.assignedTutorId && String(batch.assignedTutorId) === String(actor._id)) {
          isBatchAssigned = true;
        }
      }

      if (!isTutor && !isBatchAssigned) {
        throw new ApiError(403, 'You do not have access to this session', 'FORBIDDEN');
      }
    }

    const csvBuffer = await institutionService.exportAttendanceForSession({
      actor,
      sessionId
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-session-${timestamp}.csv"`);
    return res.send(csvBuffer);
  } catch (error) {
    next(error);
  }
};

exports.getTutorStudents = async (req, res, next) => {
  try {
    const { institutionId } = await getTutorInstitutionContext(req.user);
    const learners = await User.find({
      institutionId,
      role: 'learner',
      deletedAt: null
    }).select('name email profile status');

    const formattedLearners = learners.map(l => ({
      id: l._id || l.id,
      _id: l._id || l.id,
      name: l.name,
      email: l.email,
      profile: l.profile,
      status: l.status
    }));

    res.status(200).json({
      success: true,
      message: 'Students retrieved successfully',
      data: { users: formattedLearners }
    });
  } catch (error) {
    next(error);
  }
};

exports.getTutorStudentAttendance = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const result = await institutionService.getStudentAttendance({
      actor: req.user,
      studentId
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

exports.exportTutorStudentCSV = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const csvBuffer = await institutionService.exportAttendanceForStudent({
      actor: req.user,
      studentId
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-student-${timestamp}.csv"`);
    return res.send(csvBuffer);
  } catch (error) {
    next(error);
  }
};
