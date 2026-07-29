const express = require('express');
const institutionAttendanceController = require('../controllers/institutionAttendance.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas = require('../utils/validationSchemas');

const router = express.Router();

// Tutors & Admins can access these
router.post(
  '/sessions',
  authenticate,
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(schemas.createOfflineAttendanceSessionSchema),
  institutionAttendanceController.createAttendanceSession
);

router.get(
  '/sessions/:sessionId/roster',
  authenticate,
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(schemas.offlineAttendanceSessionParamSchema),
  institutionAttendanceController.getSessionRoster
);

router.put(
  '/sessions/:sessionId',
  authenticate,
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(schemas.markOfflineAttendanceSchema),
  institutionAttendanceController.markAttendance
);

// Admin Only routes
router.put(
  '/sessions/:sessionId/override',
  authenticate,
  requireRoles('admin', 'super_admin'),
  validate(schemas.markOfflineAttendanceSchema),
  institutionAttendanceController.overrideLockedAttendance
);

router.get(
  '/dashboard',
  authenticate,
  requireRoles('admin', 'super_admin'),
  institutionAttendanceController.getAttendanceDashboard
);

router.get(
  '/records',
  authenticate,
  requireRoles('admin', 'super_admin'),
  institutionAttendanceController.getAttendanceRecords
);

router.get(
  '/records/export.csv',
  authenticate,
  requireRoles('admin', 'super_admin'),
  institutionAttendanceController.exportAttendanceCsv
);

router.get(
  '/records/export.pdf',
  authenticate,
  requireRoles('admin', 'super_admin'),
  institutionAttendanceController.exportAttendancePdf
);

router.get(
  '/analytics/batches/:batchId',
  authenticate,
  requireRoles('admin', 'super_admin'),
  validate(schemas.batchIdParamSchema),
  institutionAttendanceController.getBatchAttendanceAnalytics
);

module.exports = router;
