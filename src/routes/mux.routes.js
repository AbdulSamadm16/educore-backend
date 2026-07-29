const express = require('express');
const router = express.Router();
const muxController = require('../controllers/mux.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

// Public webhook endpoint from Mux
router.post('/webhooks', muxController.handleWebhook);

// Apply authentication middleware globally to subsequent Mux endpoints
router.use(authenticate);

// Enforce role checks so only creators/dashboard administrators can generate or poll upload sessions
router.use(requireRoles('tutor', 'admin', 'super_admin'));

// Route: POST /api/v1/mux/upload-url - Generates direct upload url
router.post('/upload-url', muxController.getUploadUrl);

// Route: GET /api/v1/mux/uploads/:uploadId - Checks status of an upload session
router.get('/uploads/:uploadId', muxController.checkUploadStatus);

module.exports = router;
