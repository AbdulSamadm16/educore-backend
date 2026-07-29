const express = require('express');
const submissionController = require('../controllers/submission.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas = require('../utils/validationSchemas');
const { uploadSubmission } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(authenticate);

// Learner routes
router.post('/upload', uploadSubmission.single('file'), submissionController.uploadSubmissionFile);
router.post('/lessons/:lessonId/submit', submissionController.submitAssignment);
router.get('/my-submissions', submissionController.getMySubmissions);
router.get('/:id', submissionController.getSubmissionDetails);

// Tutor routes
router.get('/tutor/list', requireRoles('tutor', 'admin', 'super_admin'), submissionController.listSubmissionsForGrading);
router.patch('/:id/grade', requireRoles('tutor', 'admin', 'super_admin'), submissionController.gradeSubmission);

module.exports = router;
