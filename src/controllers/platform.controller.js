const platformService = require('../services/platform.service');
const adminService = require('../services/admin.service');
const { generateRevenueReportPdf } = require('../utils/pdf.util');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');
const { getRequestMeta } = require('../utils/requestMeta');
const {
  refreshCookieName,
  passwordResetCookieName,
  setAuthCookies,
  clearAuthCookies,
  setPasswordResetCookie,
  clearPasswordResetCookie
} = require('../utils/cookies');

const login = asyncHandler(async (req, res) => {
  const result = await platformService.login({
    payload: req.body,
    requestMeta: getRequestMeta(req)
  });

  setAuthCookies(res, result.data);

  return sendSuccess(res, 200, result.message, result.data);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await platformService.forgotPassword({
    payload: req.body
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const setPasswordResetTokenCookie = asyncHandler(async (req, res) => {
  setPasswordResetCookie(res, req.query.token);
  return res.redirect(302, req.query.redirectTo);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await platformService.resetPassword({
    payload: {
      ...req.body,
      token: req.body.token || req.cookies?.[passwordResetCookieName]
    },
    requestMeta: getRequestMeta(req)
  });

  clearPasswordResetCookie(res);
  clearAuthCookies(res);

  return sendSuccess(res, 200, result.message, result.data);
});

const refresh = asyncHandler(async (req, res) => {
  const result = await platformService.refresh({
    payload: {
      refreshToken: req.body.refreshToken || req.cookies?.[refreshCookieName]
    },
    requestMeta: getRequestMeta(req)
  });

  setAuthCookies(res, result.data);

  return sendSuccess(res, 200, result.message, result.data);
});

const logout = asyncHandler(async (req, res) => {
  const result = await platformService.logout({
    payload: {
      refreshToken: req.body.refreshToken || req.cookies?.[refreshCookieName]
    },
    requestMeta: getRequestMeta(req)
  });

  clearAuthCookies(res);

  return sendSuccess(res, 200, result.message);
});

const listUsers = asyncHandler(async (req, res) => {
  const result = await platformService.listUsers({
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const setBanStatus = asyncHandler(async (req, res) => {
  const result = await platformService.setBanStatus({
    targetUserId: req.params.id,
    banned: req.body.banned,
    reason: req.body.reason,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const changeRole = asyncHandler(async (req, res) => {
  const result = await platformService.changeRole({
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
  const result = await platformService.softDelete({
    targetUserId: req.params.id,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const createInstitution = asyncHandler(async (req, res) => {
  const result = await platformService.createInstitution({
    payload: req.body,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 201, result.message, result.data);
});

const listInstitutions = asyncHandler(async (req, res) => {
  const result = await platformService.listInstitutions({
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const updateInstitution = asyncHandler(async (req, res) => {
  const result = await platformService.updateInstitution({
    institutionId: req.params.id,
    payload: req.body,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const disableInstitution = asyncHandler(async (req, res) => {
  const result = await platformService.disableInstitution({
    institutionId: req.params.id,
    status: req.body.status,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const assignInstitutionAdmin = asyncHandler(async (req, res) => {
  const result = await platformService.assignInstitutionAdmin({
    institutionId: req.params.id,
    adminEmail: req.body.adminEmail,
    adminName: req.body.adminName,
    actor: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getInstitutionStats = asyncHandler(async (req, res) => {
  const result = await platformService.getInstitutionStats({
    institutionId: req.params.id
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getDashboardStats = asyncHandler(async (_req, res) => {
  const result = await platformService.getDashboardStats();
  return sendSuccess(res, 200, result.message, result.data);
});

const getAnalytics = asyncHandler(async (req, res) => {
  const result = await adminService.getAnalytics({
    startDate: req.query.startDate,
    endDate: req.query.endDate,
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
      title: 'Platform Revenue Report' 
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

module.exports = {
  login,
  forgotPassword,
  setPasswordResetTokenCookie,
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
  getDashboardStats,
  getAnalytics,
  exportRevenueDashboard
};
