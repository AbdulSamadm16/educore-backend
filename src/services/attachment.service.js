
const fs = require('fs');
const path = require('path');
const Lesson = require('../models/lesson.model');
const Course = require('../models/course.model');
const { ApiError } = require('../utils/errors');
const storageService = require('./storage.service');
const { isAdminRole } = require('../utils/roles');

/**
 * Validate that the user has write access to the lesson
 */
const validateLessonAccess = async (lessonId, user) => {
  const lesson = await Lesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) {
    throw new ApiError(404, 'Lesson not found', 'LESSON_NOT_FOUND');
  }

  const course = await Course.findOne({ _id: lesson.courseId, deletedAt: null });
  if (!course) {
    throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');
  }

  const isOwner = course.authorId && String(course.authorId) === String(user._id);
  const isAdmin = isAdminRole(user.role);

  if (!isOwner && !isAdmin) {
    throw new ApiError(403, 'Not authorized to modify this course content', 'ACCESS_DENIED');
  }

  return lesson;
};

/**
 * Sanitize filename to avoid folder traversal attacks
 */
const sanitizeFilename = (filename) => filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');

/**
 * Add supplementary attachment to a lesson
 */
const addAttachment = async ({ lessonId, file, user }) => {
  const lesson = await validateLessonAccess(lessonId, user);

  // Check upload limit (Max 5 attachments per lesson)
  if (lesson.attachments && lesson.attachments.length >= 5) {
    throw new ApiError(400, 'Maximum of 5 attachments per lesson is allowed', 'ATTACHMENT_LIMIT_EXCEEDED');
  }

  // Upload to Cloudinary (or local fallback)
  const storageResult = await storageService.uploadAttachment({ lessonId, file });

  const newAttachment = {
    title: file.originalname,
    fileUrl: storageResult.fileUrl,
    publicId: storageResult.publicId || null,
    resourceType: storageResult.resourceType || (storageResult.publicId ? 'raw' : 'local'),
    mimeType: storageResult.mimeType || file.mimetype || null,
    size: storageResult.bytes || (file.size || 0),
    uploadedAt: new Date()
  };

  lesson.attachments.push(newAttachment);
  try {
    await lesson.save();
  } catch (err) {
    // Rollback: delete newly uploaded cloud asset or local file to avoid orphaned storage
    if (storageResult.publicId) {
      try {
        await storageService.deleteResource({ publicId: storageResult.publicId, resourceType: storageResult.resourceType || 'raw' });
      } catch (delErr) {
        console.error('Rollback: failed to delete uploaded attachment', delErr);
      }
    }

    throw err;
  }

  return lesson.attachments;
};

/**
 * Remove supplementary attachment from a lesson
 */
const removeAttachment = async ({ lessonId, attachmentId, user }) => {
  const lesson = await validateLessonAccess(lessonId, user);

  // Find attachment record in list
  const attachment = lesson.attachments.id(attachmentId);
  if (!attachment) {
    throw new ApiError(404, 'Attachment not found under this lesson', 'ATTACHMENT_NOT_FOUND');
  }

  // Delete from Cloudinary or local
  if (attachment.publicId) {
    try {
      await storageService.deleteResource({ publicId: attachment.publicId, resourceType: attachment.resourceType || 'raw' });
    } catch (err) {
      console.error('Failed to delete attachment from Cloudinary:', attachment.publicId, err);
    }
  }

  // Pull/remove record and save
  lesson.attachments.pull(attachmentId);
  await lesson.save();

  return lesson.attachments;
};

/**
 * Replace supplementary attachment in a lesson (atomic replacement)
 */
const replaceAttachment = async ({ lessonId, attachmentId, file, user }) => {
  const lesson = await validateLessonAccess(lessonId, user);

  // Find attachment record in list
  const attachment = lesson.attachments.id(attachmentId);
  if (!attachment) {
    throw new ApiError(404, 'Attachment not found under this lesson', 'ATTACHMENT_NOT_FOUND');
  }

  // Record previous identifiers for cleanup
  const previousPublicId = attachment.publicId;
  const previousUrl = attachment.fileUrl;

  // Upload new attachment
  const storageResult = await storageService.uploadAttachment({ lessonId, file });

  // Update attachment in memory
  attachment.title = file.originalname;
  attachment.fileUrl = storageResult.fileUrl;
  attachment.publicId = storageResult.publicId || null;
  attachment.resourceType = storageResult.resourceType || (storageResult.publicId ? 'raw' : 'local');
  attachment.mimeType = storageResult.mimeType || file.mimetype || null;
  attachment.size = storageResult.bytes || (file.size || 0);
  attachment.uploadedAt = new Date();

  // Try to save updated lesson; if save fails, rollback newly uploaded asset
  try {
    await lesson.save();
  } catch (err) {
    // Rollback: delete newly uploaded cloud asset if exists
    if (storageResult.publicId) {
      try {
        await storageService.deleteResource({ publicId: storageResult.publicId, resourceType: storageResult.resourceType || 'raw' });
      } catch (delErr) {
        console.error('Rollback: failed to delete newly uploaded attachment', delErr);
      }
    }
    throw err;
  }

  // After successful save, remove previous attachment asset
  if (previousPublicId) {
    try {
      await storageService.deleteResource({ publicId: previousPublicId, resourceType: attachment.resourceType || 'raw' });
    } catch (err) {
      console.error('Failed to delete previous attachment from Cloudinary:', previousPublicId, err);
    }
  }

  return lesson.attachments;
};

module.exports = {
  addAttachment,
  removeAttachment,
  replaceAttachment
};
