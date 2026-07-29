const quizAttemptService = require('../services/quizAttempt.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

const submitQuizAttempt = asyncHandler(async (req, res) => {
  const result = await quizAttemptService.submitQuizAttempt({
    userId: req.user.id,
    lessonId: req.params.lessonId,
    payload: req.body
  });
  return sendSuccess(res, 201, result.message, result.data);
});

const getMyQuizAttempts = asyncHandler(async (req, res) => {
  const result = await quizAttemptService.getMyQuizAttempts({
    userId: req.user.id,
    lessonId: req.query.lessonId,
    courseId: req.query.courseId
  });
  return sendSuccess(res, 200, result.message, result.data);
});

const getQuizAttemptDetails = asyncHandler(async (req, res) => {
  const result = await quizAttemptService.getQuizAttemptDetails({
    userId: req.user.id,
    attemptId: req.params.id,
    userRole: req.user.role
  });
  return sendSuccess(res, 200, result.message, result.data);
});

module.exports = {
  submitQuizAttempt,
  getMyQuizAttempts,
  getQuizAttemptDetails
};
