const userService = require('../services/user.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');
const { getRequestMeta } = require('../utils/requestMeta');

const getProfile = asyncHandler(async (req, res) => {
  const result = await userService.getProfile({
    userId: req.user.id
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const updateProfile = asyncHandler(async (req, res) => {
  const result = await userService.updateProfile({
    userId: req.user.id,
    payload: req.body,
    file: req.file
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getTutorApprovalProfile = asyncHandler(async (req, res) => {
  const result = await userService.getTutorApprovalProfile({
    userId: req.user.id
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const updateTutorApprovalProfile = asyncHandler(async (req, res) => {
  const result = await userService.updateTutorApprovalProfile({
    userId: req.user.id,
    payload: req.body
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const addTutorCredential = asyncHandler(async (req, res) => {
  const files = [
    ...(req.files?.aadhar || []),
    ...(req.files?.credential || []),
    ...(req.files?.credentials || []),
    ...(req.file ? [req.file] : [])
  ];

  const result = await userService.addTutorCredential({
    userId: req.user.id,
    files
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const removeTutorCredential = asyncHandler(async (req, res) => {
  const result = await userService.removeTutorCredential({
    userId: req.user.id,
    credentialId: req.params.credentialId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const uploadTutorSample = asyncHandler(async (req, res) => {
  const result = await userService.uploadTutorSample({
    userId: req.user.id,
    file: req.file
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const initTutorSampleVideoMuxUpload = asyncHandler(async (req, res) => {
  const result = await userService.initTutorSampleVideoMuxUpload({
    userId: req.user.id,
    payload: req.body
  });

  return sendSuccess(res, 201, result.message, result.data);
});

const getTutorSampleVideoMuxStatus = asyncHandler(async (req, res) => {
  const result = await userService.getTutorSampleVideoMuxStatus({
    userId: req.user.id,
    uploadId: req.params.uploadId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const resubmitTutorApproval = asyncHandler(async (req, res) => {
  const result = await userService.resubmitTutorApproval({
    userId: req.user.id
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const requestEmailChange = asyncHandler(async (req, res) => {
  const emailChange = await userService.requestEmailChange({
    userId: req.user.id,
    email: req.body.email,
    currentPassword: req.body.currentPassword
  });

  return sendSuccess(res, 200, 'Email change verification started.', {
    emailChange
  });
});

const verifyEmailChange = asyncHandler(async (req, res) => {
  const result = await userService.verifyEmailChange({
    userId: req.user.id,
    payload: req.body,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await userService.changePassword({
    userId: req.user.id,
    payload: req.body,
    requestMeta: getRequestMeta(req)
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getNotificationSettings = asyncHandler(async (req, res) => {
  const result = await userService.getNotificationSettings({
    userId: req.user.id
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const updateNotificationSettings = asyncHandler(async (req, res) => {
  const result = await userService.updateNotificationSettings({
    userId: req.user.id,
    payload: req.body
  });

  return sendSuccess(res, 200, result.message, result.data);
});

module.exports = {
  getProfile,
  updateProfile,
  getTutorApprovalProfile,
  updateTutorApprovalProfile,
  addTutorCredential,
  removeTutorCredential,
  uploadTutorSample,
  initTutorSampleVideoMuxUpload,
  getTutorSampleVideoMuxStatus,
  resubmitTutorApproval,
  requestEmailChange,
  verifyEmailChange,
  changePassword,
  getNotificationSettings,
  updateNotificationSettings
};
