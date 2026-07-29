const institutionsService = require('../services/institutions.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');
const { getRequestMeta } = require('../utils/requestMeta');

const search = asyncHandler(async (req, res) => {
  const result = await institutionsService.search({
    keyword: req.query.keyword,
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 20,
    sort: req.query.sort,
    user: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, 'Institutions search completed.', result);
});

const getDetail = asyncHandler(async (req, res) => {
  const result = await institutionsService.getDetail({
    institutionId: req.params.institutionId
  });

  return sendSuccess(res, 200, 'Institution details retrieved.', result);
});

const enroll = asyncHandler(async (req, res) => {
  const result = await institutionsService.enroll({
    userId: req.user._id,
    institutionId: req.body.institutionId,
    idempotencyKey: req.body.idempotencyKey,
    requestMeta: getRequestMeta(req)
  });

  const statusCode = result.data.status === 'completed' ? 201 : 202;
  return sendSuccess(res, statusCode, result.message, result.data);
});

const cancelRequest = asyncHandler(async (req, res) => {
  const result = await institutionsService.cancelRequest({
    requestId: req.body.requestId,
    userId: req.user._id,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message);
});

const verifyPayment = asyncHandler(async (req, res) => {
  const result = await institutionsService.verifyPaymentDirect({
    userId: req.user._id,
    requestId: req.body.requestId,
    razorpay_order_id: req.body.razorpay_order_id,
    razorpay_payment_id: req.body.razorpay_payment_id,
    razorpay_signature: req.body.razorpay_signature,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const adminUpdateMembership = asyncHandler(async (req, res) => {
  const result = await institutionsService.adminUpdateMembership({
    membershipId: req.params.membershipId,
    status: req.body.status,
    reason: req.body.reason,
    adminUser: req.user,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getMonitoringStats = asyncHandler(async (req, res) => {
  const result = await institutionsService.getMonitoringStats();
  return sendSuccess(res, 200, 'Monitoring stats retrieved.', result);
});

const runReconciliation = asyncHandler(async (req, res) => {
  const result = await institutionsService.reconcilePayments();
  return sendSuccess(res, 200, 'Reconciliation completed successfully.', result);
});

const getPaymentHistory = asyncHandler(async (req, res) => {
  const result = await institutionsService.getPaymentHistory({
    userId: req.user._id,
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 20
  });
  return sendSuccess(res, 200, 'Payment history retrieved.', result);
});

const getInstitutionPaymentRecords = asyncHandler(async (req, res) => {
  const result = await institutionsService.getInstitutionPaymentRecords({
    adminUser: req.user,
    institutionId: req.params.institutionId,
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 20
  });
  return sendSuccess(res, 200, 'Institution payment records retrieved.', result);
});

const getPaymentRevenueReport = asyncHandler(async (req, res) => {
  const result = await institutionsService.getPaymentRevenueReport({
    adminUser: req.user,
    institutionId: req.query.institutionId
  });
  return sendSuccess(res, 200, 'Revenue report retrieved.', result);
});

const downloadInstitutionInvoice = asyncHandler(async (req, res) => {
  const result = await institutionsService.downloadInstitutionInvoice({
    paymentId: req.params.paymentId,
    userId: req.user._id
  });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice-${result.transactionId}-${timestamp}.pdf"`);
  return res.send(result.buffer);
});

module.exports = {
  search,
  getDetail,
  enroll,
  cancelRequest,
  verifyPayment,
  adminUpdateMembership,
  getMonitoringStats,
  runReconciliation,
  getPaymentHistory,
  getInstitutionPaymentRecords,
  getPaymentRevenueReport,
  downloadInstitutionInvoice
};
