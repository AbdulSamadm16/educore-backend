const reviewService = require('../services/review.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');


const createOrUpdateReview = asyncHandler(async (req, res) => {
  const result = await reviewService.createOrUpdateReview({
    userId: req.user._id,
    courseId: req.params.courseId,
    payload: req.body
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getCourseReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.getCourseReviews({
    courseId: req.params.courseId,
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const deleteReview = asyncHandler(async (req, res) => {
  const result = await reviewService.deleteReview({
    userId: req.user._id,
    courseId: req.params.courseId,
    user: req.user
  });

  return sendSuccess(res, 200, result.message);
});

const getUserReview = asyncHandler(async (req, res) => {
  const result = await reviewService.getUserReview({
    userId: req.user._id,
    courseId: req.params.courseId
  });

  return sendSuccess(res, 200, result.message, result.data);
});


module.exports = {
  createOrUpdateReview,
  getCourseReviews,
  deleteReview,
  getUserReview
};
