const express = require('express');
const router = express.Router();

const lessonController = require('../controllers/lesson.controller');
const videoController = require('../controllers/video.controller');
const attachmentController = require('../controllers/attachment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const { uploadVideoChunk, uploadAttachment, uploadSubtitle } = require('../middlewares/upload.middleware');
const {
  createLessonSchema,
  updateLessonSchema,
  reorderLessonsSchema,
  objectIdParamSchema,
  lessonAttachmentParamSchema
} = require('../utils/validationSchemas');

// Unauthenticated Webhook Route for Mux callbacks
router.post('/video/webhook', videoController.handleMuxWebhook);

// Secure video streaming endpoint (Uses signed token in query param)
router.get(
  '/:id/video/stream',
  validate(objectIdParamSchema),
  videoController.streamLocalVideo
);

router.use(authenticate);

// Reorder lessons (MUST be before /:id to avoid route conflict)
router.patch(
  '/reorder',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(reorderLessonsSchema),
  lessonController.reorderLessons
);

// Create lesson under a module
router.post(
  '/module/:moduleId',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(createLessonSchema),
  lessonController.createLesson
);

// Get lesson by ID
router.get(
  '/:id',
  validate(objectIdParamSchema),
  lessonController.getLessonById
);

// Update lesson
router.patch(
  '/:id',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(updateLessonSchema),
  lessonController.updateLesson
);

// Delete lesson
router.delete(
  '/:id',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(objectIdParamSchema),
  lessonController.deleteLesson
);

// ======================================================
// RESUMABLE VIDEO UPLOAD ROUTES
// ======================================================

// Initialize resumable video upload session
router.post(
  '/:id/video/upload-init',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(objectIdParamSchema),
  videoController.initializeUpload
);

// Query upload status and uploaded chunks (for pausing and resuming)
router.get(
  '/:id/video/upload-status',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(objectIdParamSchema),
  videoController.getUploadStatus
);

// Upload a single video chunk
router.post(
  '/:id/video/upload-chunk',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(objectIdParamSchema),
  uploadVideoChunk.single('chunk'),
  videoController.uploadChunk
);

// Complete video upload and trigger background transcoding
router.post(
  '/:id/video/upload-complete',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(objectIdParamSchema),
  videoController.completeUpload
);

// ======================================================
// SUPPLEMENTARY ATTACHMENT ROUTES
// ======================================================

// Add attachment to lesson (Limit: max 5 attachments)
router.post(
  '/:id/attachments',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(objectIdParamSchema),
  uploadAttachment.single('attachment'),
  attachmentController.addAttachment
);

// Remove attachment from lesson
router.delete(
  '/:id/attachments/:attachmentId',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(lessonAttachmentParamSchema),
  attachmentController.removeAttachment
);

// Replace/update attachment in lesson
router.put(
  '/:id/attachments/:attachmentId',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(lessonAttachmentParamSchema),
  uploadAttachment.single('attachment'),
  attachmentController.replaceAttachment
);

// ======================================================
// SUBTITLE/CAPTION ROUTES
// ======================================================

// Add/upload subtitle file to lesson (.vtt, .srt)
router.post(
  '/:id/subtitles',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(objectIdParamSchema),
  uploadSubtitle.single('subtitle'),
  lessonController.uploadSubtitle
);

// Remove subtitle file from lesson
router.delete(
  '/:id/subtitles',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(objectIdParamSchema),
  lessonController.removeSubtitle
);

module.exports = router;
