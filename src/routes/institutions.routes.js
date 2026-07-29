const express = require('express');
const institutionsController = require('../controllers/institutions.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas = require('../utils/validationSchemas');

const router = express.Router();

// Public discovery routes
router.get('/search', validate(schemas.searchInstitutionsSchema), institutionsController.search);
router.get('/:institutionId', institutionsController.getDetail);

// All other institutions actions require an authenticated session
router.use(authenticate);

// Learner/Tutor Discovery & Enrollment
router.post('/enroll', validate(schemas.enrollInstitutionSchema), institutionsController.enroll);
router.post('/enroll/cancel', validate(schemas.cancelEnrollmentRequestSchema), institutionsController.cancelRequest);
router.post('/payment/verify', validate(schemas.verifyInstitutionPaymentSchema), institutionsController.verifyPayment);

// Admin Enrollment & Membership Management
router.patch(
  '/memberships/:membershipId',
  requireRoles('admin', 'super_admin'),
  validate(schemas.adminUpdateMembershipSchema),
  institutionsController.adminUpdateMembership
);

router.get(
  '/payment/history',
  validate(schemas.institutionPaymentHistorySchema),
  institutionsController.getPaymentHistory
);

router.get(
  '/payment/admin/revenue-report',
  requireRoles('admin', 'super_admin', 'institution_admin'),
  validate(schemas.institutionRevenueReportSchema),
  institutionsController.getPaymentRevenueReport
);

router.get(
  '/payment/admin/:institutionId/records',
  requireRoles('admin', 'super_admin', 'institution_admin'),
  validate(schemas.institutionPaymentRecordsSchema),
  institutionsController.getInstitutionPaymentRecords
);

router.get(
  '/payment/:paymentId/invoice',
  validate(schemas.downloadInstitutionInvoiceSchema),
  institutionsController.downloadInstitutionInvoice
);

router.get(
  '/monitoring/stats',
  requireRoles('admin', 'super_admin'),
  institutionsController.getMonitoringStats
);

router.post(
  '/reconcile',
  requireRoles('admin', 'super_admin'),
  institutionsController.runReconciliation
);

module.exports = router;
