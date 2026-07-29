const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth.middleware');
const notificationController = require('../controllers/notification.controller');
const { asyncHandler, ApiError } = require('../utils/errors');
const { accessCookieName } = require('../utils/cookies');

// Custom JWT query-param-aware authenticator wrapper specifically for SSE EventSource connections
const authenticateStream = asyncHandler(async (req, res, next) => {
  const authHeader = req.get('authorization');
  const token = (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null)
    || req.cookies?.[accessCookieName]
    || req.query.token; // Inspect query parameters for EventSource token

  if (!token) {
    throw new ApiError(401, 'Authentication required to establish notification stream', 'AUTH_REQUIRED');
  }

  const { verifyAccessToken } = require('../utils/tokens');
  const User = require('../models/user.model');
  
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired access token for notification stream', 'ACCESS_TOKEN_INVALID');
  }

  const user = await User.findOne({ _id: payload.sub, deletedAt: null });
  if (!user) {
    throw new ApiError(401, 'User account not found', 'USER_NOT_FOUND');
  }

  if (user.status === 'banned' || user.status === 'suspended') {
    throw new ApiError(403, 'Account is currently suspended', 'ACCOUNT_INACTIVE');
  }

  req.user = {
    id: user._id.toString(),
    _id: user._id,
    role: user.role,
    email: user.email,
    status: user.status
  };
  next();
});

// Stream real-time notifications via Server-Sent Events (SSE)
router.get(
  '/stream',
  authenticateStream,
  (req, res) => {
    // Write headers for persistent Server-Sent Events stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Prevent NGINX buffering
      'Access-Control-Allow-Origin': req.headers.origin || '*'
    });

    // Write initial connection success ping (CORS friendly)
    res.write(': sse connection established\n\n');
    if (typeof res.flush === 'function') {
      res.flush();
    }

    const notificationService = require('../services/notification.service');
    const userId = req.user._id;

    // Reconciliation: Reconcile any missed notifications if reconnecting
    const lastEventId = req.get('last-event-id') || req.query.lastEventId;
    if (lastEventId) {
      notificationService.syncMissedNotifications(userId, lastEventId, res);
    }

    // Register this active response stream in the service registry
    notificationService.registerClient(userId, res);

    const cleanupStream = () => {
      clearInterval(heartbeatTimer);
      notificationService.unregisterClient(userId, res);
      try {
        res.end();
      } catch (e) {}
    };

    // Heartbeat cleanup: Keep connection alive & proactively detect stale streams
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
        if (typeof res.flush === 'function') {
          res.flush();
        }
      } catch (err) {
        console.error('[SSE HEARTBEAT ERROR] Client stream died, cleaning up connection for user:', userId);
        cleanupStream();
      }
    }, 20000); // 20-second pings

    // Listen for client disconnect/close
    req.on('close', () => {
      console.log(`[SSE CLOSE] Connection closed by client/browser for user: ${userId}`);
      cleanupStream();
    });
  }
);

// Lock all endpoints below to authenticated requests
router.use(authenticate);

// Get user notifications (supports both simple list and advanced pagination)
router.get('/', notificationController.getNotifications);

// Mark specific notification as read
router.patch('/:id/read', notificationController.markRead);

// Mark all notifications as read
router.patch('/read-all', notificationController.markAllRead);

module.exports = router;
