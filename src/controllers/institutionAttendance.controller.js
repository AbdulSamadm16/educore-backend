const institutionAttendanceService = require('../services/institutionAttendance.service');
const { ApiError } = require('../utils/errors');

const createAttendanceSession = async (req, res, next) => {
  try {
    const result = await institutionAttendanceService.createAttendanceSession({
      actor: req.user,
      batchId: req.body.batchId,
      attendanceDate: req.body.attendanceDate,
      topicCovered: req.body.topicCovered,
      remarks: req.body.remarks
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

const getSessionRoster = async (req, res, next) => {
  try {
    const result = await institutionAttendanceService.getSessionRoster({
      actor: req.user,
      sessionId: req.params.sessionId
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const markAttendance = async (req, res, next) => {
  try {
    const result = await institutionAttendanceService.markAttendance({
      actor: req.user,
      sessionId: req.params.sessionId,
      records: req.body.records
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const overrideLockedAttendance = async (req, res, next) => {
  try {
    const result = await institutionAttendanceService.overrideLockedAttendance({
      actor: req.user,
      sessionId: req.params.sessionId,
      records: req.body.records
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const getAttendanceDashboard = async (req, res, next) => {
  try {
    const result = await institutionAttendanceService.getAttendanceDashboard({
      actor: req.user
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const getBatchAttendanceAnalytics = async (req, res, next) => {
  try {
    const result = await institutionAttendanceService.getBatchAttendanceAnalytics({
      actor: req.user,
      batchId: req.params.batchId
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const getAttendanceRecords = async (req, res, next) => {
  try {
    const result = await institutionAttendanceService.getAttendanceRecords({
      actor: req.user,
      query: req.query
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const exportAttendanceCsv = async (req, res, next) => {
  try {
    const buffer = await institutionAttendanceService.exportAttendanceCsv({
      actor: req.user,
      query: req.query
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${timestamp}.csv"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

const exportAttendancePdf = async (req, res, next) => {
  try {
    const buffer = await institutionAttendanceService.exportAttendancePdf({
      actor: req.user,
      query: req.query
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${timestamp}.pdf"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
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
