const mongoose = require('mongoose');
const Review = require('../models/review.model');
const Course = require('../models/course.model');
const Enrollment = require('../models/enrollment.model');
const { ApiError } = require('../utils/errors');
const logger = require('../utils/logger');
const { isAdminRole } = require('../utils/roles');


// ======================================================
// RECALCULATE COURSE RATING (ATOMIC)
// ======================================================
const recalculateCourseRating = async (courseId) => {
  try {
    const result = await Review.aggregate([
      {
        $match: {
          courseId: new mongoose.Types.ObjectId(String(courseId)),
          deletedAt: null
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 }
        }
      }
    ]);

    const stats = result[0] || { averageRating: 0, reviewCount: 0 };

    await Course.updateOne(
      { _id: courseId },
      {
        $set: {
          averageRating: Math.round(stats.averageRating * 10) / 10,
          reviewCount: stats.reviewCount
        }
      }
    );
  } catch (error) {
    logger.error('Failed to recalculate course rating', {
      courseId: String(courseId),
      error: error.message
    });
  }
};


// ======================================================
// CREATE OR UPDATE REVIEW
// ======================================================
const createOrUpdateReview = async ({ userId, courseId, payload }) => {

  // Validate course exists
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null,
    status: 'published'
  })
    .select('_id')
    .lean();

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  // Validate enrollment
  const enrollment = await Enrollment.findOne({
    userId,
    courseId,
    deletedAt: null,
    status: 'active'
  })
    .select('_id')
    .lean();

  if (!enrollment) {
    throw new ApiError(
      403,
      'You must be enrolled to review this course',
      'ENROLLMENT_REQUIRED'
    );
  }

  // Validate rating
  const rating = Number(payload.rating);

  if (!rating || rating < 1 || rating > 5) {
    throw new ApiError(
      400,
      'Rating must be between 1 and 5',
      'INVALID_RATING'
    );
  }

  // Check for existing review
  let review = await Review.findOne({
    userId,
    courseId,
    deletedAt: null
  });

  if (review) {
    // Update existing
    review.rating = rating;
    review.title = payload.title || review.title;
    review.comment = payload.comment || review.comment;

    await review.save();
  } else {
    // Create new
    review = await Review.create({
      userId,
      courseId,
      rating,
      title: payload.title || '',
      comment: payload.comment || '',
      isVerifiedPurchase: true
    });
  }

  // Recalculate course rating
  await recalculateCourseRating(courseId);

  logger.info('Review submitted', {
    userId: String(userId),
    courseId: String(courseId),
    rating
  });

  return {
    message: review.isNew
      ? 'Review submitted successfully'
      : 'Review updated successfully',
    data: review
  };
};


// ======================================================
// GET COURSE REVIEWS
// ======================================================
const getCourseReviews = async ({ courseId, query }) => {

  const page = parseInt(query?.page, 10) || 1;
  const limit = parseInt(query?.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {
    courseId,
    deletedAt: null
  };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('userId', 'name avatarUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Review.countDocuments(filter)
  ]);

  return {
    message: 'Reviews retrieved successfully',
    data: {
      reviews,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }
  };
};


// ======================================================
// DELETE REVIEW
// ======================================================
const deleteReview = async ({ userId, courseId, user }) => {

  const filter = {
    courseId,
    deletedAt: null
  };

  // Admin can delete any review; users can only delete their own
  const isAdmin = isAdminRole(user.role);

  if (!isAdmin) {
    filter.userId = userId;
  }

  const review = await Review.findOne(filter);

  if (!review) {
    throw new ApiError(
      404,
      'Review not found',
      'REVIEW_NOT_FOUND'
    );
  }

  review.deletedAt = new Date();

  await review.save();

  // Recalculate
  await recalculateCourseRating(courseId);

  logger.info('Review deleted', {
    reviewId: String(review._id),
    courseId: String(courseId),
    deletedBy: String(user._id)
  });

  return {
    message: 'Review deleted successfully'
  };
};


// ======================================================
// GET USER REVIEW FOR COURSE
// ======================================================
const getUserReview = async ({ userId, courseId }) => {

  const review = await Review.findOne({
    userId,
    courseId,
    deletedAt: null
  }).lean();

  return {
    message: 'User review retrieved',
    data: review || null
  };
};


module.exports = {
  createOrUpdateReview,
  getCourseReviews,
  deleteReview,
  getUserReview,
  recalculateCourseRating
};
