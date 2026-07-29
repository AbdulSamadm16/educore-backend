const submissionService = require('../services/submission.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

const submitAssignment = asyncHandler(async (req, res) => {
  const result = await submissionService.submitAssignment({
    userId: req.user.id,
    lessonId: req.params.lessonId,
    payload: req.body
  });
  return sendSuccess(res, 201, result.message, result.data);
});

const getMySubmissions = asyncHandler(async (req, res) => {
  const result = await submissionService.getMySubmissions({
    userId: req.user.id,
    courseId: req.query.courseId
  });
  return sendSuccess(res, 200, result.message, result.data);
});

const getSubmissionDetails = asyncHandler(async (req, res) => {
  const result = await submissionService.getSubmissionDetails({
    userId: req.user.id,
    submissionId: req.params.id
  });
  return sendSuccess(res, 200, result.message, result.data);
});

const listSubmissionsForGrading = asyncHandler(async (req, res) => {
  const result = await submissionService.listSubmissionsForGrading({
    tutorId: req.user.id,
    lessonId: req.query.lessonId,
    courseId: req.query.courseId
  });
  return sendSuccess(res, 200, result.message, result.data);
});

const gradeSubmission = asyncHandler(async (req, res) => {
  const result = await submissionService.gradeSubmission({
    tutorId: req.user.id,
    submissionId: req.params.id,
    grade: req.body.grade,
    feedback: req.body.feedback
  });
  return sendSuccess(res, 200, result.message, result.data);
});

const uploadSubmissionFile = asyncHandler(async (req, res) => {
  const { ApiError } = require('../utils/errors');
  if (!req.file) {
    throw new ApiError(400, 'No file uploaded', 'FILE_REQUIRED');
  }
  const result = await submissionService.uploadSubmissionFile({
    userId: req.user.id,
    file: req.file
  });
  return sendSuccess(res, 201, 'File uploaded to Cloudinary successfully', result);
});

module.exports = {
  submitAssignment,
  getMySubmissions,
  getSubmissionDetails,
  listSubmissionsForGrading,
  gradeSubmission,
  uploadSubmissionFile
};
