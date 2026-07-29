const express = require('express');
const router = express.Router();

const enrollmentController = require('../controllers/enrollment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const { enrollmentRateLimiter } = require('../middlewares/rateLimiter.middleware');
const {
  courseIdParamSchema,
  paginationSchema
} = require('../utils/validationSchemas');

router.use(authenticate);

// Get students enrolled in tutor's courses
router.get(
  '/tutor/students',
  enrollmentController.getTutorStudents
);

// My enrollments (MUST be before /:courseId to avoid route conflict)
router.get(
  '/my-courses',
  validate(paginationSchema),
  enrollmentController.getMyEnrollments
);

// Check enrollment status
router.get(
  '/check/:courseId',
  validate(courseIdParamSchema),
  enrollmentController.checkEnrollment
);

// Enroll in course
router.post(
  '/:courseId',
  enrollmentRateLimiter,
  validate(courseIdParamSchema),
  enrollmentController.enrollCourse
);

// Cancel enrollment
router.delete(
  '/:courseId',
  enrollmentRateLimiter,
  validate(courseIdParamSchema),
  enrollmentController.cancelEnrollment
);

// Request Refund
router.post(
  '/:courseId/refund',
  enrollmentRateLimiter,
  validate(courseIdParamSchema),
  enrollmentController.requestRefund
);

// Bulk enroll students
router.post(
  '/admin/bulk/:courseId',
  requireRoles('admin', 'super_admin', 'platform_owner'),
  validate(courseIdParamSchema),
  enrollmentController.bulkEnrollStudents
);

module.exports = router;
