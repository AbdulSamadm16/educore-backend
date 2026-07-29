const express = require('express');
const tutorGoogleAuthController = require('../controllers/tutorGoogleAuth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

const router = express.Router();

// Get the Google OAuth URL (requires authentication so we know which tutor is linking their account)
router.get('/auth', authenticate, requireRoles('tutor'), tutorGoogleAuthController.getAuthUrl);

// Disconnect Google Account
router.post('/disconnect', authenticate, requireRoles('tutor'), tutorGoogleAuthController.disconnectGoogleAccount);

// Google OAuth callback (Not protected by JWT because it's a browser redirect from Google)
router.get('/callback', tutorGoogleAuthController.handleCallback);

module.exports = router;
