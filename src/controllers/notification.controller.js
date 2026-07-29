const mongoose = require('mongoose');
const notificationService = require('../services/notification.service');
const { asyncHandler, ApiError } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

/**
 * Retrieves the current user's notifications
 */
const getNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.getNotificationsForUser(req.user._id, req.query);
  return sendSuccess(res, 200, 'Notifications retrieved successfully', result);
});

/**
 * Marks a specific notification as read
 */
const markRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid notification ID', 'INVALID_ID');
  }
  const notification = await notificationService.markAsRead(id, req.user._id);
  return sendSuccess(res, 200, 'Notification marked as read successfully', notification);
});

/**
 * Marks all notifications for the current user as read
 */
const markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllAsRead(req.user._id);
  return sendSuccess(res, 200, 'All notifications marked as read successfully', null);
});

module.exports = {
  getNotifications,
  markRead,
  markAllRead
};
