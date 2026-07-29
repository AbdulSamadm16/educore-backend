const progressService = require('../services/progress.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

const getProgress = asyncHandler(async (req, res) => {
  const result = await progressService.getProgress({
    userId: req.user._id,
    courseId: req.params.courseId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const markLessonComplete = asyncHandler(async (req, res) => {
  const result = await progressService.markLessonComplete({
    userId: req.user._id,
    courseId: req.params.courseId,
    lessonId: req.body.lessonId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const updateVideoProgress = asyncHandler(async (req, res) => {
  const watchTime = req.body.watchTime !== undefined ? req.body.watchTime : req.body.secondsWatched;
  const percentage = req.body.percentage !== undefined ? req.body.percentage : req.body.progressPercentage;

  const result = await progressService.updateVideoProgress({
    userId: req.user._id,
    courseId: req.params.courseId,
    lessonId: req.body.lessonId,
    watchTime,
    percentage
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const updateRecordingProgress = asyncHandler(async (req, res) => {
  const watchTime = req.body.watchTime !== undefined ? req.body.watchTime : req.body.secondsWatched;
  const result = await progressService.updateRecordingProgress({
    userId: req.user._id,
    courseId: req.params.courseId,
    recordingId: req.body.recordingId,
    watchTime
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getLearnerAnalytics = asyncHandler(async (req, res) => {
  const result = await progressService.getLearnerAnalytics({
    userId: req.user._id
  });

  return sendSuccess(res, 200, result.message, result.data);
});

module.exports = {
  getProgress,
  markLessonComplete,
  updateVideoProgress,
  updateRecordingProgress,
  getLearnerAnalytics
};
