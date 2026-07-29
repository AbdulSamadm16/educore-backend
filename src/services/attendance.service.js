const Attendance = require('../models/attendance.model');
const LiveSession = require('../models/liveSession.model');
const Batch = require('../models/batch.model');
const { ApiError } = require('../utils/errors');

const recordJoin = async (learnerId, sessionId) => {
  if (!sessionId) {
    throw new ApiError(400, 'Session ID is required.', 'SESSION_ID_REQUIRED');
  }

  const session = await LiveSession.findOne({ _id: sessionId, deletedAt: null });
  if (!session) {
    throw new ApiError(404, 'Session not found.', 'NOT_FOUND');
  }

  let batch = null;
  if (session.batchId) {
    batch = await Batch.findOne({
      _id: session.batchId,
      'students.userId': learnerId,
      deletedAt: null
    }).select('institutionId');

    if (!batch) {
      throw new ApiError(403, 'You must belong to this batch to join', 'FORBIDDEN');
    }
  }

  // Check if attendance already exists
  let attendance = await Attendance.findOne({ sessionId, learnerId });
  if (!attendance) {
    attendance = await Attendance.create({
      sessionId,
      learnerId,
      institutionId: batch?.institutionId || null,
      batchId: session.batchId || null,
      joinedAt: new Date(),
      attendanceStatus: 'joined'
    });
  } else {
    // If re-joining, just update joinedAt if it was missing?
    // Usually we keep the first joinedAt, so we might not need to update.
    if (attendance.attendanceStatus === 'completed') {
      // already marked completed
    }
  }

  return attendance;
};

const recordLeave = async (learnerId, sessionId) => {
  if (!sessionId) {
    throw new ApiError(400, 'Session ID is required.', 'SESSION_ID_REQUIRED');
  }

  const attendance = await Attendance.findOne({ sessionId, learnerId });
  if (!attendance) {
    throw new ApiError(404, 'Attendance record not found for this user in this session.', 'NOT_FOUND');
  }

  attendance.leftAt = new Date();
  
  // Calculate total minutes if we have both joinedAt and leftAt
  if (attendance.joinedAt && attendance.leftAt) {
    const diffMs = attendance.leftAt.getTime() - attendance.joinedAt.getTime();
    const diffMins = Math.floor(diffMs / 1000 / 60);
    attendance.totalMinutes += diffMins;
    
    // Simple heuristic for completion (e.g. > 70% of duration)
    // For MVP, we can just mark partial/completed based on some threshold, or just mark partial
    attendance.attendanceStatus = 'partial';
  }

  await attendance.save();
  return attendance;
};

const getSessionAttendance = async (tutorId, sessionId) => {
  if (!sessionId) {
    throw new ApiError(400, 'Session ID is required.', 'SESSION_ID_REQUIRED');
  }

  // Ensure tutor owns the session
  const session = await LiveSession.findOne({ _id: sessionId, tutorId, deletedAt: null });
  if (!session) {
    throw new ApiError(403, 'You do not have permission to view attendance for this session.', 'FORBIDDEN');
  }

  const attendanceRecords = await Attendance.find({ sessionId }).populate('learnerId', 'name email profile');
  return attendanceRecords;
};

module.exports = {
  recordJoin,
  recordLeave,
  getSessionAttendance
};
