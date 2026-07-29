const express = require('express');
const institutionFeeController = require('../controllers/institutionFee.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas = require('../utils/validationSchemas');

const router = express.Router({ mergeParams: true });

// Public endpoints
router.get(
  '/:institutionId/public',
  validate(schemas.institutionIdParamSchema),
  institutionFeeController.getPublicFeePlan
);

// Admin / Super Admin protected endpoints
router.get(
  '/:institutionId/history',
  authenticate,
  requireRoles('admin', 'super_admin'),
  validate(schemas.institutionIdParamSchema),
  institutionFeeController.getFeePlanHistory
);

router.post(
  '/:institutionId',
  authenticate,
  requireRoles('admin', 'super_admin'),
  validate(schemas.institutionIdParamSchema),
  validate(schemas.createFeePlanSchema),
  institutionFeeController.createFeePlanVersion
);

router.patch(
  '/:institutionId/payment-requirement',
  authenticate,
  requireRoles('admin', 'super_admin'),
  validate(schemas.institutionIdParamSchema),
  validate(schemas.togglePaymentRequirementSchema),
  institutionFeeController.togglePaymentRequirement
);

module.exports = router;
