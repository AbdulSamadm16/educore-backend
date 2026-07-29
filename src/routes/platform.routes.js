const express = require('express');
const platformController = require('../controllers/platform.controller');
const { authenticate, authenticatePlatformOwner } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  authRateLimiter,
  strictAuthRateLimiter
} = require('../middlewares/rateLimiter.middleware');
const schemas = require('../utils/validationSchemas');

const router = express.Router();

router.post('/auth/login', strictAuthRateLimiter, validate(schemas.platformLoginSchema), platformController.login);
router.post('/auth/forgot-password', strictAuthRateLimiter, validate(schemas.forgotPasswordSchema), platformController.forgotPassword);
router.get('/auth/password-reset-cookie', strictAuthRateLimiter, validate(schemas.passwordResetCookieSchema), platformController.setPasswordResetTokenCookie);
router.post('/auth/reset-password', strictAuthRateLimiter, validate(schemas.resetPasswordSchema), platformController.resetPassword);
router.post('/auth/refresh-token', authRateLimiter, validate(schemas.refreshTokenSchema), platformController.refresh);
router.post('/auth/logout', authRateLimiter, validate(schemas.logoutSchema), platformController.logout);

router.use(authenticatePlatformOwner);

router.get('/users', validate(schemas.platformListUsersSchema), platformController.listUsers);
router.patch('/users/:id/ban', validate(schemas.banUserSchema), platformController.setBanStatus);
router.patch('/users/:id/role', validate(schemas.platformChangeRoleSchema), platformController.changeRole);
router.delete('/users/:id', validate(schemas.userIdParamSchema), platformController.softDelete);

router.get('/institutions', validate(schemas.platformListInstitutionsSchema), platformController.listInstitutions);
router.post('/institutions', validate(schemas.createInstitutionSchema), platformController.createInstitution);
router.patch('/institutions/:id', validate(schemas.updateInstitutionSchema), platformController.updateInstitution);
router.patch('/institutions/:id/status', validate(schemas.disableInstitutionSchema), platformController.disableInstitution);
router.post('/institutions/:id/admin', validate(schemas.assignInstitutionAdminSchema), platformController.assignInstitutionAdmin);
router.get('/institutions/:id/stats', validate(schemas.institutionIdParamSchema), platformController.getInstitutionStats);

router.get('/dashboard-stats', platformController.getDashboardStats);
router.get('/analytics', platformController.getAnalytics);
router.get('/analytics/export', platformController.exportRevenueDashboard);

module.exports = router;
