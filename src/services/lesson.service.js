const fs = require('fs');
const path = require('path');
const Lesson = require('../models/lesson.model');
const Course = require('../models/course.model');
const Module = require('../models/module.model');

const SUBTITLES_DIR = path.join(__dirname, '../../uploads/subtitles');
if (!fs.existsSync(SUBTITLES_DIR)) {
  fs.mkdirSync(SUBTITLES_DIR, { recursive: true });
}
const Enrollment = require('../models/enrollment.model');
const { signVideoUrl } = require('../services/video.service');
const storageService = require('../services/storage.service');

const {
  recalculateCourseStructure
} = require('../services/course.sync.service');

const { ApiError } = require('../utils/errors');
const { isAdminRole } = require('../utils/roles');
const auditService = require('./audit.service');



// ======================================================
// CREATE LESSON
// ======================================================
const createLesson = async ({
  moduleId,
  payload,
  user
}) => {

  // 1. Find module
  const module = await Module.findOne({
    _id: moduleId,
    deletedAt: null
  });

  if (!module) {
    throw new ApiError(
      404,
      'Module not found',
      'MODULE_NOT_FOUND'
    );
  }

  // 2. Find course
  const course = await Course.findOne({
    _id: module.courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  // 3. Permission validation
  const isOwner =
    course.authorId &&
    String(course.authorId) === String(user._id);

  const isAdmin = [
    'admin',
    'super_admin'
  ].includes(user.role);

  if (!isOwner && !isAdmin) {
    throw new ApiError(
      403,
      'Not authorized',
      'ACCESS_DENIED'
    );
  }

  // 4. Find next order
  let nextOrder;
  const lessons = await Lesson.find({
    moduleId,
    deletedAt: null
  }).sort({ order: 1 });

  const isAssignment = (payload.type || 'video') === 'assignment';

  if (isAssignment) {
    const lastLesson = lessons[lessons.length - 1];
    nextOrder = lastLesson ? lastLesson.order + 1 : 1;
  } else {
    // Find the first assignment lesson (if any)
    const firstAssignment = lessons.find((l) => l.type === 'assignment');
    if (firstAssignment) {
      const targetOrder = firstAssignment.order;
      nextOrder = targetOrder;

      // Shift orders of all subsequent lessons by 1
      await Lesson.updateMany(
        {
          moduleId,
          deletedAt: null,
          order: { $gte: targetOrder }
        },
        {
          $inc: { order: 1 }
        }
      );
    } else {
      const lastLesson = lessons[lessons.length - 1];
      nextOrder = lastLesson ? lastLesson.order + 1 : 1;
    }
  }

  // 5. Create lesson
  const lesson = await Lesson.create({
    moduleId,
    courseId: module.courseId,
    title: payload.title,
    description: payload.description || '',
    type: payload.type || 'video',
    content: payload.content || '',
    videoUrl: payload.videoUrl || null,
    muxUploadId: payload.muxUploadId || null,
    muxAssetId: payload.muxAssetId || null,
    muxPlaybackId: payload.muxPlaybackId || null,
    durationInMinutes: payload.durationInMinutes || 0,
    thumbnailUrl: payload.thumbnailUrl || null,
    isPreview: payload.isPreview || false,
    notifyEnrolledOnReady: payload.notifyEnrolledOnReady || false,
    attachments: payload.attachments || [],
    liveSessionMeta: payload.liveSessionMeta || {},
    quizMeta: payload.quizMeta || {},
    assignmentMeta: payload.assignmentMeta || {},
    isPublished: course.status === 'published' ? true : (payload.isPublished || false),
    order: nextOrder
  });

  // 6. Sync course structure
  await recalculateCourseStructure(module.courseId);

  // LOG AUDIT ACTION
  await auditService.logCourseAction({
    courseId: module.courseId,
    userId: user._id,
    action: 'curriculum_update',
    changes: { to: { lesson: { title: payload.title, action: 'created', type: payload.type || 'video' } } },
    metadata: { context: 'lesson_create', moduleId }
  }).catch(err => console.error('Failed to log lesson creation audit:', err));

  // Trigger notifications for enrolled learners if course and lesson are published
  if (lesson.isPublished && course.status === 'published') {
    try {
      const notificationService = require('./notification.service');

      const enrollments = await Enrollment.find({
        courseId: module.courseId,
        status: 'active',
        deletedAt: null
      });

      if (enrollments.length > 0) {
        await Promise.all(
          enrollments.map((enrollment) =>
            notificationService.createNotification({
              userId: enrollment.userId,
              title: 'New Lesson Added',
              message: `A new lesson "${payload.title}" has been added under "${module.title}" in your enrolled course "${course.title}".`,
              type: 'info',
              metadata: {
                courseId: course._id.toString(),
                lessonId: lesson._id.toString()
              }
            }).catch(err => console.error('[Notification Error] Failed to create lesson notification:', err))
          )
        );
      }
    } catch (err) {
      console.error('[Notification Trigger Error] Failed in createLesson:', err);
    }
  }

  return {
    message: 'Lesson created successfully',
    data: lesson
  };
};



// ======================================================
// GET LESSON BY ID
// ======================================================
const getLessonById = async ({
  lessonId,
  user
}) => {

  const lesson = await Lesson.findOne({
    _id: lessonId,
    deletedAt: null
  });

  if (!lesson) {
    throw new ApiError(
      404,
      'Lesson not found',
      'LESSON_NOT_FOUND'
    );
  }

  const course = await Course.findOne({
    _id: lesson.courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  const isOwner =
    course.authorId &&
    String(course.authorId) === String(user._id);

  const isAdmin = [
    'admin',
    'super_admin',
    'platform_owner'
  ].includes(user.role);

  const enrollment = await Enrollment.findOne({
    userId: user._id,
    courseId: lesson.courseId,
    deletedAt: null,
    status: 'active'
  });
  const isEnrolled = !!enrollment;

  if (!isOwner && !isAdmin && !isEnrolled && !lesson.isPreview) {
    throw new ApiError(
      403,
      'Access denied. Course enrollment is required to view this lesson.',
      'ACCESS_DENIED'
    );
  }

  const lessonData = lesson.toJSON();
  if (lessonData.videoUrl) {
    lessonData.videoUrl = signVideoUrl(lessonData.videoUrl, lessonData.id, user._id);
  }

  let secondsWatched = 0;
  if (isEnrolled) {
    const Progress = require('../models/progress.model');
    const progressObj = await Progress.findOne({
      userId: user._id,
      courseId: lesson.courseId,
      deletedAt: null
    }).lean();

    if (progressObj && progressObj.videoProgress) {
      const entry = progressObj.videoProgress.find(
        (vp) => String(vp.lessonId) === String(lesson._id)
      );
      if (entry) {
        secondsWatched = entry.secondsWatched;
      }
    }

    if (course.isSequential && !isOwner && !isAdmin) {
      // Find modules and lessons
      const allModules = await Module.find({ courseId: lesson.courseId, deletedAt: null, isPublished: true }).sort({ order: 1 }).lean();
      const allLessons = await Lesson.find({ courseId: lesson.courseId, deletedAt: null, isPublished: true }).sort({ order: 1 }).lean();

      const completedLessons = progressObj ? (progressObj.completedLessons || []).map(id => String(id)) : [];

      // Let's compute lock states
      const moduleLessonsMap = new Map();
      allLessons.forEach(l => {
        const mId = String(l.moduleId);
        if (!moduleLessonsMap.has(mId)) {
          moduleLessonsMap.set(mId, []);
        }
        moduleLessonsMap.get(mId).push(l);
      });

      allModules.forEach(m => {
        const list = moduleLessonsMap.get(String(m._id)) || [];
        list.sort((a, b) => a.order - b.order);
        moduleLessonsMap.set(String(m._id), list);
      });

      const moduleCompleted = new Map();
      allModules.forEach(m => {
        const list = moduleLessonsMap.get(String(m._id)) || [];
        if (list.length === 0) {
          moduleCompleted.set(String(m._id), true);
        } else {
          const allDone = list.every(l => completedLessons.includes(String(l._id)));
          moduleCompleted.set(String(m._id), allDone);
        }
      });

      const moduleUnlocked = new Map();
      allModules.forEach((m, mIdx) => {
        if (mIdx === 0) {
          moduleUnlocked.set(String(m._id), true);
        } else {
          const prevM = allModules[mIdx - 1];
          const prevUnlocked = moduleUnlocked.get(String(prevM._id)) || false;
          const prevCompleted = moduleCompleted.get(String(prevM._id)) || false;
          moduleUnlocked.set(String(m._id), prevUnlocked && prevCompleted);
        }
      });

      const flatLessons = [];
      allModules.forEach(m => {
        const list = moduleLessonsMap.get(String(m._id)) || [];
        flatLessons.push(...list);
      });

      const currentLessonIdx = flatLessons.findIndex(l => String(l._id) === String(lesson._id));
      if (currentLessonIdx !== -1) {
        const mUnlocked = moduleUnlocked.get(String(lesson.moduleId)) || false;
        if (!mUnlocked) {
          throw new ApiError(403, 'Access denied. This lesson is locked until the previous module is completed.', 'LESSON_LOCKED');
        }
        if (currentLessonIdx > 0) {
          const prevL = flatLessons[currentLessonIdx - 1];
          const prevCompleted = completedLessons.includes(String(prevL._id));
          if (!prevCompleted) {
            throw new ApiError(403, 'Access denied. This lesson is locked until the previous lesson is completed.', 'LESSON_LOCKED');
          }
        }
      }
    }
  }
  lessonData.secondsWatched = secondsWatched;

  return {
    message: 'Lesson fetched successfully',
    data: lessonData
  };
};



// ======================================================
// UPDATE LESSON
// ======================================================
const triggerVideoReadyNotifications = async (lesson, course) => {
  try {
    const User = require('../models/user.model');
    const notificationService = require('./notification.service');
    const emailService = require('./email.service');

    const author = await User.findById(course.authorId);
    if (!author) return;

    // 1. Create in-app notification
    await notificationService.createNotification({
      userId: author._id,
      title: 'Video Upload Processed',
      message: `Your video for lesson "${lesson.title}" in course "${course.title}" has been successfully processed and is ready.`,
      type: 'video_ready',
      metadata: {
        courseId: course._id,
        lessonId: lesson._id
      }
    });

    // 2. Send email notification
    await emailService.sendVideoReadyEmail({
      to: author.email,
      name: author.name,
      lessonTitle: lesson.title,
      courseTitle: course.title
    });
    console.log(`Video ready notifications triggered successfully for user ${author.email}`);
  } catch (err) {
    console.error('Error triggering video ready notifications fallback:', err);
  }
};

const updateLesson = async ({
  lessonId,
  payload,
  user
}) => {

  const lesson = await Lesson.findOne({
    _id: lessonId,
    deletedAt: null
  });

  if (!lesson) {
    throw new ApiError(
      404,
      'Lesson not found',
      'LESSON_NOT_FOUND'
    );
  }

  const course = await Course.findOne({
    _id: lesson.courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  // Permission validation
  const isOwner =
    course.authorId &&
    String(course.authorId) === String(user._id);

  const isAdmin = [
    'admin',
    'super_admin'
  ].includes(user.role);

  if (!isOwner && !isAdmin) {
    throw new ApiError(
      403,
      'You cannot edit this lesson',
      'LESSON_ACCESS_DENIED'
    );
  }

  // Safe allowed updates only
  const allowedUpdates = {
    title: payload.title,
    description: payload.description,
    content: payload.content,
    type: payload.type,
    videoUrl: payload.videoUrl,
    muxUploadId: payload.muxUploadId,
    muxAssetId: payload.muxAssetId,
    muxPlaybackId: payload.muxPlaybackId,
    durationInMinutes: payload.durationInMinutes,
    thumbnailUrl: payload.thumbnailUrl,
    isPreview: payload.isPreview,
    notifyEnrolledOnReady: payload.notifyEnrolledOnReady,
    attachments: payload.attachments,
    liveSessionMeta: payload.liveSessionMeta,
    quizMeta: payload.quizMeta,
    assignmentMeta: payload.assignmentMeta,
    isPublished: payload.isPublished
  };

  // Remove undefined fields
  Object.keys(allowedUpdates).forEach((key) => {
    if (allowedUpdates[key] === undefined) {
      delete allowedUpdates[key];
    }
  });

  // Prevent temporary signed URLs (local secure stream paths or Mux signed tokens)
  // from overwriting the permanent raw database videoUrl during lesson updates.
  if (allowedUpdates.videoUrl) {
    const isSigned = allowedUpdates.videoUrl.includes('/video/stream') || allowedUpdates.videoUrl.includes('token=');
    if (isSigned) {
      delete allowedUpdates.videoUrl;
    }
  }

  const wasVideoProcessed = !lesson.muxPlaybackId && allowedUpdates.muxPlaybackId;
  const wasPublishedNow = !lesson.isPublished && allowedUpdates.isPublished === true;

  Object.assign(lesson, allowedUpdates);

  await lesson.save();

  // LOG AUDIT ACTION
  await auditService.logCourseAction({
    courseId: lesson.courseId,
    userId: user._id,
    action: 'curriculum_update',
    changes: { to: { lesson: { title: allowedUpdates.title || lesson.title, action: 'updated' } } },
    metadata: { context: 'lesson_update', lessonId: lesson._id }
  }).catch(err => console.error('Failed to log lesson update audit:', err));

  if (wasVideoProcessed) {
    // trigger notifications in background
    triggerVideoReadyNotifications(lesson, course);
  }

  // Trigger notifications for enrolled learners if lesson is published now
  if (wasPublishedNow && course.status === 'published') {
    try {
      const notificationService = require('./notification.service');
      const module = await Module.findOne({ _id: lesson.moduleId, deletedAt: null });

      if (module) {
        const enrollments = await Enrollment.find({
          courseId: lesson.courseId,
          status: 'active',
          deletedAt: null
        });

        if (enrollments.length > 0) {
          await Promise.all(
            enrollments.map((enrollment) =>
              notificationService.createNotification({
                userId: enrollment.userId,
                title: 'New Lesson Added',
                message: `A new lesson "${lesson.title}" has been added under "${module.title}" in your enrolled course "${course.title}".`,
                type: 'info',
                metadata: {
                  courseId: course._id.toString(),
                  lessonId: lesson._id.toString()
                }
              }).catch(err => console.error('[Notification Error] Failed to create lesson notification:', err))
            )
          );
        }
      }
    } catch (err) {
      console.error('[Notification Trigger Error] Failed in updateLesson:', err);
    }
  }

  return {
    message: 'Lesson updated successfully',
    data: lesson
  };
};



// ======================================================
// DELETE LESSON
// ======================================================
const deleteLesson = async ({
  lessonId,
  user
}) => {

  const lesson = await Lesson.findOne({
    _id: lessonId,
    deletedAt: null
  });

  if (!lesson) {
    throw new ApiError(
      404,
      'Lesson not found',
      'LESSON_NOT_FOUND'
    );
  }

  const course = await Course.findOne({
    _id: lesson.courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  // Permission validation
  const isOwner =
    course.authorId &&
    String(course.authorId) === String(user._id);

  const isAdmin = [
    'admin',
    'super_admin'
  ].includes(user.role);

  if (!isOwner && !isAdmin) {
    throw new ApiError(
      403,
      'You cannot delete this lesson',
      'LESSON_DELETE_DENIED'
    );
  }

  // Soft delete
  lesson.deletedAt = new Date();

  await lesson.save();

  // LOG AUDIT ACTION
  await auditService.logCourseAction({
    courseId: lesson.courseId,
    userId: user._id,
    action: 'curriculum_update',
    changes: { from: { lesson: { title: lesson.title, action: 'deleted' } } },
    metadata: { context: 'lesson_delete', lessonId: lesson._id }
  }).catch(err => console.error('Failed to log lesson delete audit:', err));

  // Sync course structure
  await recalculateCourseStructure(lesson.courseId);

  return {
    message: 'Lesson deleted successfully'
  };
};



// ======================================================
// REORDER LESSONS
// ======================================================
const reorderLessons = async ({
  moduleId,
  orderedLessonIds,
  user
}) => {

  // Validate module
  const module = await Module.findOne({
    _id: moduleId,
    deletedAt: null
  });

  if (!module) {
    throw new ApiError(
      404,
      'Module not found',
      'MODULE_NOT_FOUND'
    );
  }

  // Validate course
  const course = await Course.findOne({
    _id: module.courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  // Permission validation
  const isOwner =
    course.authorId &&
    String(course.authorId) === String(user._id);

  const isAdmin = [
    'admin',
    'super_admin'
  ].includes(user.role);

  if (!isOwner && !isAdmin) {
    throw new ApiError(
      403,
      'You cannot reorder lessons',
      'LESSON_REORDER_DENIED'
    );
  }

  // Validate payload
  if (!Array.isArray(orderedLessonIds)) {
    throw new ApiError(
      400,
      'Invalid lesson order payload',
      'INVALID_LESSON_ORDER'
    );
  }

  const lessons = await Lesson.find({
    moduleId,
    deletedAt: null
  });

  if (lessons.length !== orderedLessonIds.length) {
    throw new ApiError(
      400,
      'Lesson count mismatch',
      'INVALID_LESSON_ORDER'
    );
  }

  // Validate lesson ids
  const lessonMap = new Map(
    lessons.map((lesson) => [
      String(lesson._id),
      lesson
    ])
  );

  for (const id of orderedLessonIds) {
    if (!lessonMap.has(String(id))) {
      throw new ApiError(
        400,
        `Invalid lesson id: ${id}`,
        'INVALID_LESSON_ID'
      );
    }
  }

  // Bulk reorder
  const bulkOps = orderedLessonIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: {
        $set: {
          order: index + 1
        }
      }
    }
  }));

  await Lesson.bulkWrite(bulkOps);

  await auditService.logCourseAction({
    courseId: module.courseId,
    userId: user._id,
    action: 'curriculum_update',
    changes: { to: { order: orderedLessonIds } },
    metadata: { context: 'lesson_reorder', moduleId }
  }).catch(err => console.error('Failed to log lesson reorder audit:', err));

  return {
    message: 'Lessons reordered successfully',
    data: true
  };
};

// ======================================================
// ADD ATTACHMENT
// ======================================================
const addAttachment = async ({ lessonId, file, user }) => {
  const lesson = await Lesson.findOne({
    _id: lessonId,
    deletedAt: null
  });

  if (!lesson) {
    throw new ApiError(
      404,
      'Lesson not found',
      'LESSON_NOT_FOUND'
    );
  }

  const course = await Course.findOne({
    _id: lesson.courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  // Permission validation
  const isOwner =
    course.authorId &&
    String(course.authorId) === String(user._id);

  const isAdmin = [
    'admin',
    'super_admin'
  ].includes(user.role);

  if (!isOwner && !isAdmin) {
    throw new ApiError(
      403,
      'You are not authorized to edit this lesson',
      'ACCESS_DENIED'
    );
  }

  // Max 5 attachments per lesson
  if (lesson.attachments && lesson.attachments.length >= 5) {
    throw new ApiError(
      400,
      'A maximum of 5 attachments are allowed per lesson',
      'ATTACHMENT_LIMIT_EXCEEDED'
    );
  }

  // Upload to Cloudinary
  const attachmentData = await storageService.uploadAttachment({ lessonId, file });

  // Add to attachments array
  if (!lesson.attachments) {
    lesson.attachments = [];
  }
  lesson.attachments.push(attachmentData);

  await lesson.save();

  // Recalculate course structure
  await recalculateCourseStructure(lesson.courseId);

  return {
    message: 'Attachment added successfully',
    data: lesson
  };
};

// ======================================================
// REMOVE ATTACHMENT
// ======================================================
const removeAttachment = async ({ lessonId, attachmentId, user }) => {
  const lesson = await Lesson.findOne({
    _id: lessonId,
    deletedAt: null
  });

  if (!lesson) {
    throw new ApiError(
      404,
      'Lesson not found',
      'LESSON_NOT_FOUND'
    );
  }

  const course = await Course.findOne({
    _id: lesson.courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  // Permission validation
  const isOwner =
    course.authorId &&
    String(course.authorId) === String(user._id);

  const isAdmin = [
    'admin',
    'super_admin'
  ].includes(user.role);

  if (!isOwner && !isAdmin) {
    throw new ApiError(
      403,
      'You are not authorized to edit this lesson',
      'ACCESS_DENIED'
    );
  }

  // Remove the attachment
  if (lesson.attachments) {
    lesson.attachments = lesson.attachments.filter(
      (att) => String(att._id) !== String(attachmentId) && String(att.id) !== String(attachmentId)
    );
    lesson.markModified('attachments');
  }

  await lesson.save();

  // Recalculate course structure
  await recalculateCourseStructure(lesson.courseId);

  return {
    message: 'Attachment removed successfully',
    data: lesson
  };
};

const uploadSubtitle = async ({ lessonId, file, user }) => {
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
    throw new ApiError(
      403,
      'You are not authorized to edit this lesson',
      'ACCESS_DENIED'
    );
  }

  // Validate extension and size
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExts = new Set(['.vtt', '.srt']);
  if (!allowedExts.has(ext)) {
    throw new ApiError(400, 'Unsupported subtitle file type. Allowed: .vtt, .srt', 'INVALID_SUBTITLE_TYPE');
  }

  const maxBytes = 2 * 1024 * 1024; // 2MB
  const fileSize = file.size || (file.buffer && file.buffer.length) || 0;
  if (fileSize > maxBytes) {
    throw new ApiError(413, 'Subtitle file is too large (max 2MB)', 'SUBTITLE_TOO_LARGE');
  }

  // If SRT, convert to VTT
  let uploadBuffer = file.buffer;
  let uploadName = file.originalname;
  if (ext === '.srt') {
    try {
      const srtText = file.buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      // Remove numeric cue lines
      const withoutNumbers = srtText.split('\n').filter((line) => !/^\d+$/.test(line.trim())).join('\n');
      // Convert comma decimals to dot
      const converted = withoutNumbers.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      const vttText = `WEBVTT\n\n${converted}`;
      uploadBuffer = Buffer.from(vttText, 'utf8');
      uploadName = uploadName.replace(/\.srt$/i, '.vtt');
    } catch (err) {
      throw new ApiError(400, 'Failed to convert SRT to VTT', 'SUBTITLE_CONVERSION_FAILED');
    }
  } else {
    // Ensure VTT header exists
    const text = uploadBuffer.toString('utf8');
    if (!/^\s*WEBVTT/m.test(text)) {
      uploadBuffer = Buffer.from(`WEBVTT\n\n${text}`, 'utf8');
      uploadName = uploadName.replace(/\.vtt$/i, '.vtt');
    }
  }

  // Upload to Cloudinary via storageService
  const subtitleFile = {
    originalname: uploadName,
    buffer: uploadBuffer
  };

  const storageResult = await storageService.uploadSubtitle({ lessonId, file: subtitleFile });

  // Record previous metadata for cleanup
  const previousPublicId = lesson.subtitlePublicId;
  const previousUrl = lesson.subtitleUrl;

  // Update lesson with new subtitle metadata
  lesson.subtitleUrl = storageResult.url;
  lesson.subtitlePublicId = storageResult.publicId || null;
  lesson.subtitleResourceType = storageResult.resourceType || (storageResult.publicId ? 'raw' : 'local');
  lesson.subtitleUploadedAt = new Date();

  try {
    await lesson.save();
  } catch (err) {
    // Rollback: delete uploaded Cloudinary asset or local file to avoid orphan
    try {
      if (storageResult.publicId) {
        await storageService.deleteResource({ publicId: storageResult.publicId, resourceType: storageResult.resourceType || 'raw' });
      }
    } catch (delErr) {
      console.error('Rollback: failed to delete subtitle after DB save failure', delErr);
    }

    throw err;
  }

  // After successful save, delete previous asset (cloud or local) if exists
  if (previousPublicId) {
    try {
      await storageService.deleteResource({ publicId: previousPublicId, resourceType: lesson.subtitleResourceType || 'raw' });
    } catch (err) {
      console.error('Failed to delete previous subtitle asset:', previousPublicId, err);
    }
  }

  return {
    message: 'Subtitle uploaded successfully',
    data: lesson
  };
};

const removeSubtitle = async ({ lessonId, user }) => {
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
    throw new ApiError(
      403,
      'You are not authorized to edit this lesson',
      'ACCESS_DENIED'
    );
  }

  if (lesson.subtitlePublicId) {
    try {
      await storageService.deleteResource({ publicId: lesson.subtitlePublicId, resourceType: lesson.subtitleResourceType || 'raw' });
    } catch (err) {
      console.error('Failed to delete subtitle from Cloudinary:', lesson.subtitlePublicId, err);
    }
  }

  lesson.subtitleUrl = null;
  lesson.subtitlePublicId = null;
  lesson.subtitleResourceType = null;
  lesson.subtitleUploadedAt = null;
  await lesson.save();

  return {
    message: 'Subtitle removed successfully',
    data: lesson
  };
};

module.exports = {
  createLesson,
  getLessonById,
  updateLesson,
  deleteLesson,
  reorderLessons,
  addAttachment,
  removeAttachment,
  uploadSubtitle,
  removeSubtitle
};
