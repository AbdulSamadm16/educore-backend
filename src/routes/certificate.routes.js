const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificate.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.get('/my-certificates', authenticate, certificateController.getMyCertificates);
router.get('/templates', authenticate, certificateController.getAvailableTemplates);
router.get('/templates/:id/preview', authenticate, certificateController.previewTemplateForTutor);
router.get('/validate/:certificateNumber', certificateController.validateCertificate);
router.get('/download/:certificateNumber', certificateController.downloadCertificate);

module.exports = router;
