const express = require('express');
const router = express.Router({ mergeParams: true }); // to merge with liveSession routes if nested
const attendanceController = require('../controllers/attendance.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas = require('../utils/validationSchemas');

// Tutor & Admin Attendance Board Routes
router.get('/tutor/batches', authenticate, requireRoles('tutor', 'admin', 'super_admin'), attendanceController.getTutorBatches);
router.get(
  '/tutor/batches/:batchId/history',
  authenticate,
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(schemas.batchIdParamSchema),
  attendanceController.getTutorBatchHistory
);
router.get(
  '/tutor/sessions/:sessionId/roster',
  authenticate,
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(schemas.attendanceRosterSchema),
  attendanceController.getTutorSessionRoster
);
router.put(
  '/tutor/sessions/:sessionId',
  authenticate,
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(schemas.markAttendanceSchema),
  attendanceController.markTutorAttendance
);
router.get(
  '/tutor/sessions/:sessionId/export.csv',
  authenticate,
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(schemas.attendanceSessionParamSchema),
  attendanceController.exportTutorSessionCSV
);
router.get('/tutor/students', authenticate, requireRoles('tutor', 'admin', 'super_admin'), attendanceController.getTutorStudents);
router.get(
  '/tutor/students/:studentId',
  authenticate,
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(schemas.attendanceStudentParamSchema),
  attendanceController.getTutorStudentAttendance
);
router.get(
  '/tutor/students/:studentId/export.csv',
  authenticate,
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(schemas.attendanceStudentParamSchema),
  attendanceController.exportTutorStudentCSV
);

// Telemetry & Learner routes
router.post('/:id/join', authenticate, attendanceController.joinSession);
router.post('/:id/leave', authenticate, attendanceController.leaveSession);
router.get('/:id', authenticate, requireRoles('tutor'), attendanceController.getSessionAttendance);

router.post('/join', authenticate, attendanceController.joinSession);
router.post('/leave', authenticate, attendanceController.leaveSession);
router.get('/', authenticate, requireRoles('tutor'), attendanceController.getSessionAttendance);

module.exports = router;
