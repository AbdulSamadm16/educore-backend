const express = require('express');
const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas = require('../utils/validationSchemas');

const router = express.Router();

router.use(authenticate, requireRoles('admin', 'super_admin', 'platform_owner'));

router.get('/users', validate(schemas.listUsersSchema), adminController.listUsers);
router.post('/users', validate(schemas.adminCreateUserSchema), adminController.createUser);
router.post('/users/bulk', validate(schemas.bulkRegisterStudentsSchema), adminController.bulkRegisterStudents);
router.patch('/users/bulk-suspend', validate(schemas.bulkSuspendUsersSchema), adminController.bulkSuspendUsers);
router.get('/users/:id/profile-summary', validate(schemas.userIdParamSchema), adminController.getUserProfileSummary);
router.patch('/users/:id/ban', validate(schemas.banUserSchema), adminController.setBanStatus);
router.patch('/users/:id/suspend', validate(schemas.suspendUserSchema), adminController.setSuspendStatus);
router.patch('/users/:id/role', validate(schemas.changeRoleSchema), adminController.changeRole);
router.patch('/users/:id/approve-tutor', validate(schemas.userIdParamSchema), adminController.approveTutor);
router.patch('/users/:id/reject-tutor', validate(schemas.rejectTutorSchema), adminController.rejectTutor);
router.get('/email-logs', adminController.getEmailLogs);
router.get('/analytics', adminController.getAnalytics);
router.delete('/users/:id', validate(schemas.userIdParamSchema), adminController.softDelete);

router.get('/refunds/pending', adminController.getPendingRefunds);
router.post('/refunds/:paymentId/process', validate(schemas.processRefundSchema), adminController.processRefund);

module.exports = router;
