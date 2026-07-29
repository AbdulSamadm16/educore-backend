const express = require('express');
const router = express.Router();
const liveRecordingController = require('../controllers/liveRecording.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

// Public Webhook (Mux)
router.post('/webhook', express.raw({ type: 'application/json' }), liveRecordingController.muxWebhook);

// Tutor routes
router.post('/mux-upload-url', authenticate, requireRoles('tutor'), liveRecordingController.getMuxUploadUrl);
router.post('/draft', authenticate, requireRoles('tutor'), liveRecordingController.createDraft);
router.post('/:id/publish', authenticate, requireRoles('tutor'), liveRecordingController.publishRecording);
router.delete('/:id', authenticate, requireRoles('tutor'), liveRecordingController.discardRecording);
router.get('/tutor/:courseId', authenticate, requireRoles('tutor'), liveRecordingController.getTutorRecordings);

// Learner routes
router.get('/course/:courseId', authenticate, liveRecordingController.getCourseRecordings);

// Progress Route
router.post('/:recordingId/progress', authenticate, liveRecordingController.updateProgress);

module.exports = router;
