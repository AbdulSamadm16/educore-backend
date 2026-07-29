const express = require('express');
const institutionController = require('../controllers/institution.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { uploadCsv } = require('../middlewares/upload.middleware');
const schemas = require('../utils/validationSchemas');

const router = express.Router();

router.use(authenticate, requireRoles('admin', 'super_admin'));

router.get('/dashboard', institutionController.getDashboard);

router.get('/batches', validate(schemas.institutionListBatchesSchema), institutionController.listBatches);
router.post('/batches', validate(schemas.createBatchSchema), institutionController.createBatch);
router.get('/batches/:batchId', validate(schemas.batchIdParamSchema), institutionController.getBatch);
router.patch('/batches/:batchId', validate(schemas.updateBatchSchema), institutionController.updateBatch);
router.patch('/batches/:batchId/archive', validate(schemas.batchIdParamSchema), institutionController.archiveBatch);
router.delete('/batches/:batchId', validate(schemas.batchIdParamSchema), institutionController.deleteBatch);
router.post(
  '/batches/:batchId/students',
  uploadCsv.single('csv'),
  validate(schemas.addBatchStudentsSchema),
  institutionController.addStudentsToBatch
);
router.delete(
  '/batches/:batchId/students/:studentId',
  validate(schemas.batchStudentParamSchema),
  institutionController.removeStudentFromBatch
);

router.get('/tutors/approved', validate(schemas.institutionTutorSearchSchema), institutionController.listApprovedTutors);
router.get('/tutor-assignments', validate(schemas.listTutorAssignmentsSchema), institutionController.listTutorAssignments);
router.get('/tutor-assignments/history', validate(schemas.tutorAssignmentHistorySchema), institutionController.getTutorAssignmentHistory);
router.get('/tutor-assignments/monitoring/stats', institutionController.getTutorMonitoringStats);
router.get('/tutor-assignments/:assignmentId', validate(schemas.tutorAssignmentIdParamSchema), institutionController.getTutorAssignment);
router.post('/tutor-assignments', validate(schemas.createTutorAssignmentSchema), institutionController.createTutorAssignments);
router.delete(
  '/tutor-assignments/:assignmentId',
  validate(schemas.tutorAssignmentIdParamSchema),
  institutionController.removeTutorAssignment
);

router.get(
  '/attendance/sessions/:sessionId/roster',
  validate(schemas.attendanceRosterSchema),
  institutionController.getAttendanceRoster
);
router.put(
  '/attendance/sessions/:sessionId',
  validate(schemas.markAttendanceSchema),
  institutionController.markAttendance
);
router.get(
  '/attendance/sessions/:sessionId/export.csv',
  validate(schemas.attendanceSessionParamSchema),
  institutionController.exportAttendanceForSession
);
router.get(
  '/attendance/students/:studentId',
  validate(schemas.attendanceStudentParamSchema),
  institutionController.getStudentAttendance
);
router.get(
  '/attendance/students/:studentId/export.csv',
  validate(schemas.attendanceStudentParamSchema),
  institutionController.exportAttendanceForStudent
);
router.get(
  '/attendance/batches/:batchId/history',
  validate(schemas.batchIdParamSchema),
  institutionController.getBatchAttendanceHistory
);
router.get('/settings', institutionController.getSettings);
router.patch('/settings', validate(schemas.updateInstitutionSettingsSchema), institutionController.updateSettings);

module.exports = router;
