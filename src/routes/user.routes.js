const express = require('express');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authenticateTutorApproval } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { strictAuthRateLimiter } = require('../middlewares/rateLimiter.middleware');
const { uploadAvatar, uploadTutorCredential, uploadTutorSampleVideo } = require('../middlewares/upload.middleware');
const schemas = require('../utils/validationSchemas');

const router = express.Router();

router.get('/me/tutor-approval', authenticateTutorApproval, userController.getTutorApprovalProfile);
router.patch('/me/tutor-approval', authenticateTutorApproval, validate(schemas.updateTutorApprovalProfileSchema), userController.updateTutorApprovalProfile);
router.post(
  '/me/tutor-approval/credentials',
  authenticateTutorApproval,
  uploadTutorCredential.fields([
    { name: 'aadhar', maxCount: 1 },
    { name: 'credential', maxCount: 1 },
    { name: 'credentials', maxCount: 1 }
  ]),
  userController.addTutorCredential
);
router.delete('/me/tutor-approval/credentials/:credentialId', authenticateTutorApproval, validate(schemas.credentialIdParamSchema), userController.removeTutorCredential);
router.post('/me/tutor-approval/sample-video/mux-upload-init', authenticateTutorApproval, validate(schemas.tutorSampleVideoMuxInitSchema), userController.initTutorSampleVideoMuxUpload);
router.get('/me/tutor-approval/sample-video/mux-upload-status/:uploadId', authenticateTutorApproval, validate(schemas.tutorSampleVideoMuxStatusSchema), userController.getTutorSampleVideoMuxStatus);
router.post('/me/tutor-approval/sample-video', authenticateTutorApproval, uploadTutorSampleVideo.single('sampleVideo'), userController.uploadTutorSample);
router.post('/me/tutor-approval/resubmit', authenticateTutorApproval, userController.resubmitTutorApproval);

router.use(authenticate);

router.get('/me', userController.getProfile);
router.put('/me', uploadAvatar.single('avatar'), validate(schemas.updateProfileSchema), userController.updateProfile);
router.get('/me/notification-settings', userController.getNotificationSettings);
router.patch('/me/notification-settings', validate(schemas.updateNotificationSettingsSchema), userController.updateNotificationSettings);
router.put('/change-email', strictAuthRateLimiter, validate(schemas.changeEmailSchema), userController.requestEmailChange);
router.post('/verify-email-change', strictAuthRateLimiter, validate(schemas.verifyEmailChangeSchema), userController.verifyEmailChange);
router.put('/change-password', strictAuthRateLimiter, validate(schemas.changePasswordSchema), userController.changePassword);

module.exports = router;
