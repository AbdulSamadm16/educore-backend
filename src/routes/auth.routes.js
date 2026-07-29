const express = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
const {
  authRateLimiter,
  strictAuthRateLimiter
} = require('../middlewares/rateLimiter.middleware');
const schemas = require('../utils/validationSchemas');

const router = express.Router();

router.post('/register', authRateLimiter, validate(schemas.registerSchema), authController.register);
router.post('/verify-email', strictAuthRateLimiter, validate(schemas.verifyEmailSchema), authController.verifyEmail);
router.post('/resend-otp', strictAuthRateLimiter, validate(schemas.resendOtpSchema), authController.resendOtp);
router.post('/login', strictAuthRateLimiter, validate(schemas.loginSchema), authController.login);
router.post('/forgot-password', strictAuthRateLimiter, validate(schemas.forgotPasswordSchema), authController.forgotPassword);
router.get('/password-reset-cookie', strictAuthRateLimiter, validate(schemas.passwordResetCookieSchema), authController.setPasswordResetTokenCookie);
router.post('/reset-password', strictAuthRateLimiter, validate(schemas.resetPasswordSchema), authController.resetPassword);
router.post('/refresh-token', authRateLimiter, validate(schemas.refreshTokenSchema), authController.refresh);
router.post('/logout', authRateLimiter, validate(schemas.logoutSchema), authController.logout);

module.exports = router;
