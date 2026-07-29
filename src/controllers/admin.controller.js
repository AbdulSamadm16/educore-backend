const adminService = require('../services/admin.service');
const { generateRevenueReportPdf } = require('../utils/pdf.util');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');
const { getRequestMeta } = require('../utils/requestMeta');

const listUsers = asyncHandler(async (req, res) => {
  const result = await adminService.listUsers({
    query: req.query,
    actor: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const setBanStatus = asyncHandler(async (req, res) => {
  const result = await adminService.setBanStatus({
    targetUserId: req.params.id,
    banned: req.body.banned,
    reason: req.body.reason,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const setSuspendStatus = asyncHandler(async (req, res) => {
  const result = await adminService.setSuspendStatus({
    targetUserId: req.params.id,
    suspended: req.body.suspended,
    reason: req.body.reason,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const bulkSuspendUsers = asyncHandler(async (req, res) => {
  const result = await adminService.bulkSuspendUsers({
    userIds: req.body.userIds,
    reason: req.body.reason,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const changeRole = asyncHandler(async (req, res) => {
  const result = await adminService.changeRole({
    targetUserId: req.params.id,
    role: req.body.role,
    institutionId: req.body.institutionId,
    reason: req.body.reason,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const softDelete = asyncHandler(async (req, res) => {
  const result = await adminService.softDelete({
    targetUserId: req.params.id,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getUserProfileSummary = asyncHandler(async (req, res) => {
  const result = await adminService.getUserProfileSummary({
    targetUserId: req.params.id,
    actor: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const approveTutor = asyncHandler(async (req, res) => {
  const result = await adminService.approveTutor({
    targetUserId: req.params.id,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const rejectTutor = asyncHandler(async (req, res) => {
  const result = await adminService.rejectTutor({
    targetUserId: req.params.id,
    reason: req.body.reason,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const createUser = asyncHandler(async (req, res) => {
  const result = await adminService.adminCreateUser({
    name: req.body.name,
    email: req.body.email,
    role: req.body.role,
    institutionId: req.body.institutionId,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 201, result.message, result.data);
});

const bulkRegisterStudents = asyncHandler(async (req, res) => {
  const result = await adminService.bulkRegisterStudents({
    students: req.body.students,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getEmailLogs = asyncHandler(async (req, res) => {
  const EmailLog = require('../models/emailLog.model');
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status && req.query.status !== 'all') {
    filter.status = req.query.status;
  }
  if (req.query.search) {
    filter.$or = [
      { recipient: { $regex: req.query.search, $options: 'i' } },
      { subject: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  const logs = await EmailLog.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await EmailLog.countDocuments(filter);

  return sendSuccess(res, 200, 'Email logs fetched successfully', {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

const getAnalytics = asyncHandler(async (req, res) => {
  const result = await adminService.getAnalytics({
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    allCourses: req.query.allCourses === 'true',
    courseId: req.query.courseId
  });
  return sendSuccess(res, 200, result.message, result.data);
});

const exportRevenueDashboard = asyncHandler(async (req, res) => {
  const { startDate, endDate, format, courseId } = req.query;
  const analyticsData = await adminService.getAnalytics({ startDate, endDate, courseId });

  if (format === 'pdf') {
    const pdfBuffer = await generateRevenueReportPdf(analyticsData.data, { 
      startDate, 
      endDate, 
      title: 'Institution Revenue Report' 
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="revenue-report-${timestamp}.pdf"`);
    return res.send(pdfBuffer);
  } else {
    const csvBuffer = await adminService.exportRevenueData({ startDate, endDate, courseId });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="revenue-report-${timestamp}.csv"`);
    return res.send(csvBuffer);
  }
});

const getPendingRefunds = asyncHandler(async (req, res) => {
  const result = await adminService.getPendingRefunds();
  return sendSuccess(res, 200, result.message, result.data);
});

const processRefund = asyncHandler(async (req, res) => {
  const result = await adminService.processRefund({
    paymentId: req.params.paymentId,
    action: req.body.action,
    reason: req.body.reason
  });
  return sendSuccess(res, 200, result.message, result.data);
});

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
  createUser,
  bulkRegisterStudents,
  getEmailLogs,
  getAnalytics,
  exportRevenueDashboard,
  getPendingRefunds,
  processRefund
};
