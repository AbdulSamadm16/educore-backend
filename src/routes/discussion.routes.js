const express = require('express');
const { authenticate, optionalAuthenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const discussionController = require('../controllers/discussion.controller');

const router = express.Router();

/* ==========================================================
   LEARNER / TUTOR ROUTES
   ========================================================== */

// Create a top-level post or a threaded reply
router.post(
  '/',
  authenticate,
  discussionController.createPost
);

// List posts and replies for a lesson (with full viewerState)
router.get(
  '/',
  authenticate,  // discussions require auth — no anonymous browsing
  discussionController.getDiscussionPosts
);

// Upvote a post or reply
router.post(
  '/:postId/upvote',
  authenticate,
  discussionController.upvotePost
);

// Remove an upvote
router.delete(
  '/:postId/upvote',
  authenticate,
  discussionController.removeUpvote
);

// Edit post content (author only)
router.patch(
  '/:postId',
  authenticate,
  discussionController.editPost
);

// Pin / Unpin a top-level post (tutor or admin)
router.patch(
  '/:postId/pin',
  authenticate,
  discussionController.togglePinPost
);

// Mark or unmark a reply as official answer (tutor or admin)
router.patch(
  '/:postId/official',
  authenticate,
  discussionController.markOfficialAnswer
);

// Soft-delete a post (author / tutor / admin)
router.delete(
  '/:postId',
  authenticate,
  discussionController.deletePost
);

// Report a post
router.post(
  '/:postId/report',
  authenticate,
  discussionController.reportPost
);

// Submit an apology unban request (banned users only)
router.post(
  '/unban-requests',
  authenticate,
  discussionController.createUnbanRequest
);

// Get user's own unban request status
router.get(
  '/unban-requests/my-status',
  authenticate,
  discussionController.getMyUnbanRequestStatus
);

/* ==========================================================
   ADMIN MODERATION ROUTES
   NOTE: these static /admin/* routes MUST be declared before
   any dynamic /:postId routes to avoid Express matching
   "admin" as a postId parameter.
   ========================================================== */

// List reported posts (moderation queue)
router.get(
  '/admin/reports',
  authenticate,
  requireRoles('admin', 'super_admin', 'platform_owner'),
  discussionController.getReportedPostsAdmin
);

// Remove a reported post with a reason
router.delete(
  '/admin/:postId',
  authenticate,
  requireRoles('admin', 'super_admin', 'platform_owner'),
  discussionController.adminRemovePost
);

// Dismiss all reports without removing the post (no violation found)
router.patch(
  '/admin/:postId/dismiss-reports',
  authenticate,
  requireRoles('admin', 'super_admin', 'platform_owner'),
  discussionController.dismissReports
);

// Issue a warning to a user
router.post(
  '/admin/users/:userId/warn',
  authenticate,
  requireRoles('admin', 'super_admin', 'platform_owner'),
  discussionController.adminWarnUser
);

// Ban or unban a user from discussions
router.post(
  '/admin/users/:userId/discussion-ban',
  authenticate,
  requireRoles('admin', 'super_admin', 'platform_owner'),
  discussionController.adminBanUser
);

// Admin: Get pending unban requests
router.get(
  '/admin/unban-requests',
  authenticate,
  requireRoles('admin', 'super_admin', 'platform_owner'),
  discussionController.getUnbanRequestsAdmin
);

// Admin: Approve or reject unban request
router.patch(
  '/admin/unban-requests/:requestId/resolve',
  authenticate,
  requireRoles('admin', 'super_admin', 'platform_owner'),
  discussionController.resolveUnbanRequestAdmin
);

module.exports = router;
