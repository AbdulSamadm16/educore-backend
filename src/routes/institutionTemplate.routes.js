const express = require('express');
const router = express.Router();
const institutionTemplateController = require('../controllers/institutionTemplate.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

// Protect all routes under this namespace to institution administrators
router.use(authenticate, requireRoles('institution_admin', 'admin', 'super_admin'));

router.get('/', institutionTemplateController.getInstitutionTemplates);
router.post('/', institutionTemplateController.createInstitutionTemplate);
router.patch('/:id', institutionTemplateController.updateInstitutionTemplate);
router.post('/preview', institutionTemplateController.previewRawTemplate);
router.post('/:id/preview', institutionTemplateController.previewExistingTemplate);

module.exports = router;
