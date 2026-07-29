const discussionService = require('../services/discussion.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

const createPost = asyncHandler(async (req, res) => {
  const { courseId, lessonId, parentId, content, image } = req.body;
  const result = await discussionService.createPost({
    courseId,
    lessonId,
    parentId,
    authorId: req.user._id,
    content,
    image
  });
  return sendSuccess(res, 201, 'Discussion post created successfully', result);
});

const getDiscussionPosts = asyncHandler(async (req, res) => {
  const { lessonId, sortBy, page, limit } = req.query;
  const result = await discussionService.getDiscussionPosts({
    lessonId,
    sortBy,
    page,
    limit,
    currentUserId: req.user?._id || null
  });
  return sendSuccess(res, 200, 'Discussions retrieved successfully', result);
});

const upvotePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const result = await discussionService.upvotePost(postId, req.user._id);
  return sendSuccess(res, 200, 'Post upvoted successfully', result);
});

const removeUpvote = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const result = await discussionService.removeUpvote(postId, req.user._id);
  return sendSuccess(res, 200, 'Upvote removed successfully', result);
});

const editPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  const result = await discussionService.editPost(postId, req.user._id, req.user.role, content);
  return sendSuccess(res, 200, 'Post content updated successfully', result);
});

const togglePinPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { isPinned } = req.body;
  const result = await discussionService.togglePinPost(postId, req.user._id, req.user.role, isPinned);
  return sendSuccess(res, 200, `Post successfully ${isPinned ? 'pinned' : 'unpinned'}`, result);
});

const markOfficialAnswer = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { officialAnswerId } = req.body;
  const result = await discussionService.markOfficialAnswer(postId, officialAnswerId, req.user._id, req.user.role);
  return sendSuccess(res, 200, 'Official answer updated successfully', result);
});

const deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  await discussionService.deletePost(postId, req.user._id, req.user.role);
  return sendSuccess(res, 200, 'Post deleted successfully');
});

const reportPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { reason } = req.body;
  const result = await discussionService.reportPost(postId, req.user._id, reason);
  return sendSuccess(res, 200, 'Post reported successfully', result);
});

const getReportedPostsAdmin = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await discussionService.getReportedPostsAdmin({ page, limit });
  return sendSuccess(res, 200, 'Reported posts retrieved successfully', result);
});

const adminRemovePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { reason } = req.body;
  const result = await discussionService.adminRemovePost(postId, req.user._id, reason);
  return sendSuccess(res, 200, 'Post removed by administrator', result);
});

// Dismiss all reports on a post without removing it (no violation found)
const dismissReports = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const result = await discussionService.dismissReports(postId, req.user._id);
  return sendSuccess(res, 200, 'Reports dismissed — post cleared from moderation queue', result);
});

const adminWarnUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason, postContent } = req.body;
  const result = await discussionService.adminWarnUser(userId, req.user._id, reason, postContent);
  return sendSuccess(res, 200, 'User warned successfully', result);
});

const adminBanUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { isBanned } = req.body;
  const result = await discussionService.adminBanUser(userId, isBanned);
  return sendSuccess(res, 200, `User successfully ${isBanned ? 'banned' : 'unbanned'} from discussions`, result);
});

const createUnbanRequest = asyncHandler(async (req, res) => {
  const result = await discussionService.createUnbanRequest({
    userId: req.user._id,
    apology: req.body.apology
  });
  return sendSuccess(res, 201, 'Unban request submitted successfully', result);
});

const getMyUnbanRequestStatus = asyncHandler(async (req, res) => {
  const result = await discussionService.getMyUnbanRequestStatus(req.user._id);
  return sendSuccess(res, 200, 'Unban request status retrieved successfully', result);
});

const getUnbanRequestsAdmin = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await discussionService.getUnbanRequestsAdmin({ page, limit });
  return sendSuccess(res, 200, 'Unban requests retrieved successfully', result);
});

const resolveUnbanRequestAdmin = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { status, adminNotes } = req.body;
  const result = await discussionService.resolveUnbanRequestAdmin({
    requestId,
    adminId: req.user._id,
    status,
    adminNotes
  });
  return sendSuccess(res, 200, `Unban request successfully ${status}`, result);
});

module.exports = {
  createPost,
  getDiscussionPosts,
  upvotePost,
  removeUpvote,
  editPost,
  togglePinPost,
  markOfficialAnswer,
  deletePost,
  reportPost,
  getReportedPostsAdmin,
  adminRemovePost,
  dismissReports,
  adminWarnUser,
  adminBanUser,
  createUnbanRequest,
  getMyUnbanRequestStatus,
  getUnbanRequestsAdmin,
  resolveUnbanRequestAdmin
};
