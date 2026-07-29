const institutionService = require('../services/institution.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

const getDashboard = asyncHandler(async (req, res) => {
  const result = await institutionService.getDashboard({
    actor: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const listBatches = asyncHandler(async (req, res) => {
  const result = await institutionService.listBatches({
    actor: req.user,
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getBatch = asyncHandler(async (req, res) => {
  const result = await institutionService.getBatch({
    actor: req.user,
    batchId: req.params.batchId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const createBatch = asyncHandler(async (req, res) => {
  const result = await institutionService.createBatch({
    actor: req.user,
    payload: req.body
  });

  return sendSuccess(res, 201, result.message, result.data);
});

const updateBatch = asyncHandler(async (req, res) => {
  const result = await institutionService.updateBatch({
    actor: req.user,
    batchId: req.params.batchId,
    payload: req.body
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const addStudentsToBatch = asyncHandler(async (req, res) => {
  const result = await institutionService.addStudentsToBatch({
    actor: req.user,
    batchId: req.params.batchId,
    payload: req.body,
    file: req.file
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const removeStudentFromBatch = asyncHandler(async (req, res) => {
  const result = await institutionService.removeStudentFromBatch({
    actor: req.user,
    batchId: req.params.batchId,
    studentId: req.params.studentId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const archiveBatch = asyncHandler(async (req, res) => {
  const result = await institutionService.archiveBatch({
    actor: req.user,
    batchId: req.params.batchId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const deleteBatch = asyncHandler(async (req, res) => {
  const result = await institutionService.deleteBatch({
    actor: req.user,
    batchId: req.params.batchId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const listApprovedTutors = asyncHandler(async (req, res) => {
  const result = await institutionService.listApprovedTutors({
    actor: req.user,
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const listTutorAssignments = asyncHandler(async (req, res) => {
  const result = await institutionService.listTutorAssignments({
    actor: req.user,
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const createTutorAssignments = asyncHandler(async (req, res) => {
  const result = await institutionService.createTutorAssignments({
    actor: req.user,
    payload: req.body
  });

  return sendSuccess(res, 201, result.message, result.data);
});

const removeTutorAssignment = asyncHandler(async (req, res) => {
  const result = await institutionService.removeTutorAssignment({
    actor: req.user,
    assignmentId: req.params.assignmentId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getAttendanceRoster = asyncHandler(async (req, res) => {
  const result = await institutionService.getAttendanceRoster({
    actor: req.user,
    sessionId: req.params.sessionId,
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const markAttendance = asyncHandler(async (req, res) => {
  const result = await institutionService.markAttendance({
    actor: req.user,
    sessionId: req.params.sessionId,
    records: req.body.records
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const exportAttendanceForSession = asyncHandler(async (req, res) => {
  const csvBuffer = await institutionService.exportAttendanceForSession({
    actor: req.user,
    sessionId: req.params.sessionId
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-session-${timestamp}.csv"`);
  return res.send(csvBuffer);
});

const getStudentAttendance = asyncHandler(async (req, res) => {
  const result = await institutionService.getStudentAttendance({
    actor: req.user,
    studentId: req.params.studentId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const exportAttendanceForStudent = asyncHandler(async (req, res) => {
  const csvBuffer = await institutionService.exportAttendanceForStudent({
    actor: req.user,
    studentId: req.params.studentId
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-student-${timestamp}.csv"`);
  return res.send(csvBuffer);
});

const getBatchAttendanceHistory = asyncHandler(async (req, res) => {
  const result = await institutionService.getBatchAttendanceHistory({
    actor: req.user,
    batchId: req.params.batchId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getTutorAssignment = asyncHandler(async (req, res) => {
  const result = await institutionService.getTutorAssignment({
    actor: req.user,
    assignmentId: req.params.assignmentId
  });
  return sendSuccess(res, 200, result.message, result.data);
});

const getTutorAssignmentHistory = asyncHandler(async (req, res) => {
  const result = await institutionService.getTutorAssignmentHistory({
    actor: req.user,
    tutorId: req.query.tutorId,
    limit: parseInt(req.query.limit, 10) || 50
  });
  return sendSuccess(res, 200, result.message, result.data);
});

const getTutorMonitoringStats = asyncHandler(async (req, res) => {
  const result = await institutionService.getTutorMonitoringStats({
    actor: req.user
  });
  return sendSuccess(res, 200, result.message, result.data);
});

const getSettings = asyncHandler(async (req, res) => {
  const result = await institutionService.getSettings({
    actor: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const updateSettings = asyncHandler(async (req, res) => {
  const result = await institutionService.updateSettings({
    actor: req.user,
    payload: req.body
  });

  return sendSuccess(res, 200, result.message, result.data);
});

module.exports = {
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
  getAttendanceRoster,
  markAttendance,
  exportAttendanceForSession,
  getStudentAttendance,
  exportAttendanceForStudent,
  getBatchAttendanceHistory,
  getSettings,
  updateSettings
};
