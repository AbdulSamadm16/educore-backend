const express = require('express');
const router = express.Router();

const progressController = require('../controllers/progress.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  markLessonCompleteSchema,
  updateVideoProgressSchema
} = require('../utils/validationSchemas');

router.use(authenticate);

// Get learner-wide learning analytics
router.get(
  '/learner/analytics',
  progressController.getLearnerAnalytics
);

// Get progress for a course
router.get(
  '/:courseId',
  progressController.getProgress
);

// Mark lesson as complete
router.post(
  '/:courseId/complete',
  validate(markLessonCompleteSchema),
  progressController.markLessonComplete
);

// Update video playback progress (auto-marks complete if >= 90%)
router.post(
  '/:courseId/video-progress',
  validate(updateVideoProgressSchema),
  progressController.updateVideoProgress
);

module.exports = router;
