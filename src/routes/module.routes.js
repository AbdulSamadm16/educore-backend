const express = require('express');
const router = express.Router();

const moduleController = require('../controllers/module.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const {
  createModuleSchema,
  updateModuleSchema,
  reorderModulesSchema
} = require('../utils/validationSchemas');

router.use(authenticate);

// Reorder modules (MUST be before /:id to avoid route conflict)
router.patch(
  '/reorder',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(reorderModulesSchema),
  moduleController.reorderModules
);

// Create module under a course
router.post(
  '/:courseId',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(createModuleSchema),
  moduleController.createModule
);

// Update module
router.patch(
  '/:id',
  requireRoles('tutor', 'admin', 'super_admin'),
  validate(updateModuleSchema),
  moduleController.updateModule
);

// Delete module
router.delete(
  '/:id',
  requireRoles('tutor', 'admin', 'super_admin'),
  moduleController.deleteModule
);

module.exports = router;
