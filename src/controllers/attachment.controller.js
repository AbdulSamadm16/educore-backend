const attachmentService = require('../services/attachment.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');
const { ApiError } = require('../utils/errors');

/**
 * Add attachment to a lesson
 */
const addAttachment = asyncHandler(async (req, res) => {
  const { id: lessonId } = req.params;

  if (!req.file) {
    throw new ApiError(400, 'No attachment file uploaded', 'MISSING_FILE');
  }

  const attachments = await attachmentService.addAttachment({
    lessonId,
    file: req.file,
    user: req.user
  });

  return sendSuccess(res, 200, 'Attachment added successfully', attachments);
});

/**
 * Remove attachment from a lesson
 */
const removeAttachment = asyncHandler(async (req, res) => {
  const { id: lessonId, attachmentId } = req.params;

  if (!attachmentId) {
    throw new ApiError(400, 'attachmentId is required', 'MISSING_PARAMETERS');
  }

  const attachments = await attachmentService.removeAttachment({
    lessonId,
    attachmentId,
    user: req.user
  });

  return sendSuccess(res, 200, 'Attachment removed successfully', attachments);
});

/**
 * Replace/update an attachment in a lesson
 */
const replaceAttachment = asyncHandler(async (req, res) => {
  const { id: lessonId, attachmentId } = req.params;

  if (!attachmentId) {
    throw new ApiError(400, 'attachmentId is required', 'MISSING_PARAMETERS');
  }

  if (!req.file) {
    throw new ApiError(400, 'No replacement file uploaded', 'MISSING_FILE');
  }

  const attachments = await attachmentService.replaceAttachment({
    lessonId,
    attachmentId,
    file: req.file,
    user: req.user
  });

  return sendSuccess(res, 200, 'Attachment replaced successfully', attachments);
});

module.exports = {
  addAttachment,
  removeAttachment,
  replaceAttachment
};
