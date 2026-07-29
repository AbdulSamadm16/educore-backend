const express = require('express');
const router = express.Router();

const reviewController = require('../controllers/review.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  courseIdParamSchema,
  createReviewSchema,
  paginationSchema
} = require('../utils/validationSchemas');

// Get reviews for a course (Public)
router.get(
  '/:courseId',
  validate(courseIdParamSchema),
  validate(paginationSchema),
  reviewController.getCourseReviews
);

router.use(authenticate);

// Get current user's review for a course
router.get(
  '/:courseId/mine',
  validate(courseIdParamSchema),
  reviewController.getUserReview
);

// Create or update review
router.post(
  '/:courseId',
  validate(courseIdParamSchema),
  validate(createReviewSchema),
  reviewController.createOrUpdateReview
);

// Delete review
router.delete(
  '/:courseId',
  validate(courseIdParamSchema),
  reviewController.deleteReview
);

module.exports = router;
