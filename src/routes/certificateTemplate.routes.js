const express = require('express');
const router = express.Router();
const certificateTemplateController = require('../controllers/certificateTemplate.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

// Protect all routes under this namespace to platform administrators
router.use(authenticate, requireRoles('platform_admin', 'super_admin', 'platform_owner'));

router.get('/', certificateTemplateController.getPlatformTemplates);
router.post('/', certificateTemplateController.createPlatformTemplate);
router.patch('/:id', certificateTemplateController.updatePlatformTemplate);
router.post('/preview', certificateTemplateController.previewRawTemplate);
router.post('/:id/preview', certificateTemplateController.previewExistingTemplate);

module.exports = router;
