const express = require('express');
const { authenticate, optionalAuthenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const { searchRateLimiter, adminRateLimiter } = require('../middlewares/rateLimiter.middleware');

const courseController = require('../controllers/course.controller');
const { uploadThumbnail } = require('../middlewares/upload.middleware');
const {
  createCourseSchema,
  updateCourseSchema,
  courseReviewDecisionSchema,
  courseFlagReviewSchema,
  objectIdParamSchema,
  catalogueQuerySchema
} = require('../utils/validationSchemas');

const router = express.Router();

/* =========================
   MY COURSES (TUTOR DASHBOARD)
========================= */

// My Courses (must be above dynamic /:id)
router.get(
  '/my-courses',
  authenticate,
  courseController.getMyCourses
);

// Tutor Analytics (must be above dynamic /:id)
router.get(
  '/tutor/analytics',
  authenticate,
  courseController.getTutorAnalytics
);

/* =========================
   PUBLIC (OPTIONAL AUTH) ROUTES
========================= */

// Catalogue (learner browsing)
router.get(
  '/catalogue',
  optionalAuthenticate,
  searchRateLimiter,
  validate(catalogueQuerySchema),
  courseController.getCourseCatalogue
);

// Course by ID
router.get(
  '/:id',
  optionalAuthenticate,
  validate(objectIdParamSchema),
  courseController.getCourseById
);

// Curriculum
router.get(
  '/:courseId/curriculum',
  optionalAuthenticate,
  courseController.getCourseCurriculum
);

// Preview Curriculum
router.get(
  '/:courseId/preview-curriculum',
  optionalAuthenticate,
  courseController.getCoursePreviewCurriculum
);

router.use(authenticate);

/* =========================
   MY COURSES & ADMIN
========================= */



// Admin all courses
router.get(
  '/admin/all',
  requireRoles('admin', 'super_admin', 'platform_owner', 'platform_admin'),
  courseController.getAllCoursesAdmin
);

/* =========================
   COURSE ACTIONS
========================= */

// Create course
router.post(
  '/',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(createCourseSchema),
  courseController.createCourse
);

// Publish / Unpublish
router.patch(
  '/:id/approve',
  requireRoles('admin', 'super_admin', 'platform_owner', 'platform_admin'),
  validate(objectIdParamSchema),
  courseController.approveCourse
);

router.patch(
  '/:id/reject-review',
  requireRoles('admin', 'super_admin', 'platform_owner', 'platform_admin'),
  validate(courseReviewDecisionSchema),
  courseController.rejectCourseReview
);

router.patch(
  '/:id/flag-review',
  requireRoles('admin', 'super_admin', 'platform_owner', 'platform_admin'),
  validate(courseFlagReviewSchema),
  courseController.flagCourseForReview
);

router.patch(
  '/:id/publish',
  validate(objectIdParamSchema),
  courseController.publishCourse
);

router.patch(
  '/:id/unpublish',
  validate(objectIdParamSchema),
  courseController.unpublishCourse
);

router.patch(
  '/:id/discard',
  validate(objectIdParamSchema),
  courseController.discardPendingChanges
);

router.patch(
  '/:id/submit-for-review',
  validate(objectIdParamSchema),
  courseController.submitCourseForReview
);

// Admin actions
router.patch(
  '/:id/feature',
  requireRoles('admin', 'super_admin', 'platform_owner', 'platform_admin'),
  adminRateLimiter,
  validate(objectIdParamSchema),
  courseController.toggleFeatureCourse
);

router.patch(
  '/:id/suspend',
  requireRoles('admin', 'super_admin', 'platform_owner', 'platform_admin'),
  adminRateLimiter,
  validate(objectIdParamSchema),
  courseController.suspendCourse
);

router.patch(
  '/:id/unsuspend',
  requireRoles('admin', 'super_admin', 'platform_owner', 'platform_admin'),
  adminRateLimiter,
  validate(objectIdParamSchema),
  courseController.unsuspendCourse
);

router.delete(
  '/:id',
  requireRoles('tutor', 'admin', 'super_admin', 'platform_owner'),
  validate(objectIdParamSchema),
  courseController.deleteCourse
);

/* =========================
   SAFE DYNAMIC ROUTES (LAST)
========================= */

// Publish readiness
router.get(
  '/:id/publish-readiness',
  validate(objectIdParamSchema),
  courseController.checkCoursePublishReadiness
);

// Stats
router.get(
  '/:id/stats',
  validate(objectIdParamSchema),
  courseController.getCourseStats
);

// Audit Logs
router.get(
  '/:id/audit-logs',
  requireRoles('tutor', 'admin', 'super_admin', 'platform_owner', 'platform_admin'),
  validate(objectIdParamSchema),
  courseController.getCourseAuditLogs
);

// Update course
router.patch(
  '/:id',
  requireRoles('tutor', 'admin', 'super_admin', 'platform_owner'),
  validate(updateCourseSchema),
  courseController.updateCourse
);

// Update thumbnail
router.patch(
  '/:id/thumbnail',
  requireRoles('tutor', 'admin', 'super_admin', 'platform_owner'),
  uploadThumbnail.single('thumbnail'),
  courseController.updateThumbnail
);

module.exports = router;
