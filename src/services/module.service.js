const Course = require('../models/course.model');
const Module = require('../models/module.model');
const Lesson = require('../models/lesson.model');
const { recalculateCourseStructure } = require('../services/course.sync.service');
const { checkOwnerOrAdmin } = require('../services/access.service');
const { ApiError } = require('../utils/errors');
const auditService = require('./audit.service');


// ======================================================
// CREATE MODULE
// ======================================================
const createModule = async ({ courseId, payload, user }) => {

  // 1. Find course
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  // 2. Permission check
  const { hasAccess } = checkOwnerOrAdmin({ course, user });

  if (!hasAccess) {
    throw new ApiError(
      403,
      'You cannot edit this course',
      'COURSE_ACCESS_DENIED'
    );
  }

  // 3. Get next order
  const lastModule = await Module.findOne({
    courseId,
    deletedAt: null
  }).sort({ order: -1 });

  const nextOrder = lastModule ? lastModule.order + 1 : 1;

  // 4. Create module (no transaction — atomic create)
  const module = await Module.create({
    courseId,
    title: payload.title,
    description: payload.description || '',
    isPublished: course.status === 'published',
    order: nextOrder
  });

  // 5. Update course stats (atomic increment)
  await Course.updateOne(
    { _id: courseId },
    { $inc: { totalModules: 1 } }
  );

  // 6. Sync course structure
  await recalculateCourseStructure(courseId);

  // LOG AUDIT ACTION
  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'curriculum_update',
    changes: { to: { module: { title: payload.title, action: 'created' } } },
    metadata: { context: 'module_create' }
  }).catch(err => console.error('Failed to log module creation audit:', err));

  // Trigger notifications for enrolled learners if course is published
  if (course.status === 'published') {
    try {
      const Enrollment = require('../models/enrollment.model');
      const notificationService = require('./notification.service');
      
      const enrollments = await Enrollment.find({ 
        courseId, 
        status: 'active', 
        deletedAt: null 
      });

      if (enrollments.length > 0) {
        await Promise.all(
          enrollments.map((enrollment) =>
            notificationService.createNotification({
              userId: enrollment.userId,
              title: 'New Module Added',
              message: `A new module "${payload.title}" has been added to your enrolled course "${course.title}".`,
              type: 'info',
              metadata: {
                courseId: courseId.toString()
              }
            }).catch(err => console.error('[Notification Error] Failed to create module notification:', err))
          )
        );
      }
    } catch (err) {
      console.error('[Notification Trigger Error] Failed in createModule:', err);
    }
  }

  return {
    message: 'Module created successfully',
    data: module
  };
};


// ======================================================
// UPDATE MODULE
// ======================================================
const updateModule = async ({ moduleId, payload, user }) => {

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

  // Permission check
  const { hasAccess } = checkOwnerOrAdmin({ course, user });

  if (!hasAccess) {
    throw new ApiError(
      403,
      'You cannot edit this module',
      'MODULE_ACCESS_DENIED'
    );
  }

  // Safe allowed updates only (prevent mass assignment)
  const allowedUpdates = {
    title: payload.title,
    description: payload.description,
    isPublished: payload.isPublished
  };

  // Remove undefined fields
  Object.keys(allowedUpdates).forEach((key) => {
    if (allowedUpdates[key] === undefined) {
      delete allowedUpdates[key];
    }
  });

  const wasPublishedNow = !module.isPublished && allowedUpdates.isPublished === true;

  Object.assign(module, allowedUpdates);

  await module.save();

  // LOG AUDIT ACTION
  await auditService.logCourseAction({
    courseId: module.courseId,
    userId: user._id,
    action: 'curriculum_update',
    changes: { to: { module: { title: allowedUpdates.title || module.title, action: 'updated' } } },
    metadata: { context: 'module_update', moduleId: module._id }
  }).catch(err => console.error('Failed to log module update audit:', err));

  // Trigger notifications for enrolled learners if module is published now
  if (wasPublishedNow && course.status === 'published') {
    try {
      const Enrollment = require('../models/enrollment.model');
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
              title: 'New Module Added',
              message: `A new module "${module.title}" has been added to your enrolled course "${course.title}".`,
              type: 'info',
              metadata: {
                courseId: module.courseId.toString()
              }
            }).catch(err => console.error('[Notification Error] Failed to create module notification:', err))
          )
        );
      }
    } catch (err) {
      console.error('[Notification Trigger Error] Failed in updateModule:', err);
    }
  }

  return {
    message: 'Module updated successfully',
    data: module
  };
};


// ======================================================
// DELETE MODULE
// ======================================================
const deleteModule = async ({ moduleId, user }) => {

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

  if (!module.courseId) {
    throw new ApiError(
      500,
      'Invalid module data: missing courseId',
      'INVALID_MODULE_DATA'
    );
  }

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

  // Permission check
  const { hasAccess } = checkOwnerOrAdmin({ course, user });

  if (!hasAccess) {
    throw new ApiError(
      403,
      'You cannot delete this module',
      'MODULE_DELETE_DENIED'
    );
  }

  // Soft delete module (atomic)
  await Module.updateOne(
    { _id: moduleId },
    { $set: { deletedAt: new Date() } }
  );

  // Soft delete all lessons in the module (atomic)
  await Lesson.updateMany(
    { moduleId, deletedAt: null },
    { $set: { deletedAt: new Date() } }
  );

  // Decrement course stats (atomic)
  await Course.updateOne(
    { _id: module.courseId },
    { $inc: { totalModules: -1 } }
  );

  // Sync course structure
  await recalculateCourseStructure(module.courseId);

  // LOG AUDIT ACTION
  await auditService.logCourseAction({
    courseId: module.courseId,
    userId: user._id,
    action: 'curriculum_update',
    changes: { from: { module: { title: module.title, action: 'deleted' } } },
    metadata: { context: 'module_delete', moduleId: module._id }
  }).catch(err => console.error('Failed to log module delete audit:', err));

  return {
    message: 'Module deleted successfully'
  };
};


// ======================================================
// REORDER MODULES
// ======================================================
const reorderModules = async ({ courseId, orderedModuleIds, user }) => {

  // Validate course
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  // Permission check
  const { hasAccess } = checkOwnerOrAdmin({ course, user });

  if (!hasAccess) {
    throw new ApiError(
      403,
      'You cannot reorder modules in this course',
      'MODULE_REORDER_DENIED'
    );
  }

  // Validate payload
  if (!Array.isArray(orderedModuleIds)) {
    throw new ApiError(
      400,
      'Invalid order payload',
      'INVALID_MODULE_ORDER'
    );
  }

  const modules = await Module.find({
    courseId,
    deletedAt: null
  });

  if (modules.length !== orderedModuleIds.length) {
    throw new ApiError(
      400,
      'Module count mismatch',
      'INVALID_MODULE_ORDER'
    );
  }

  // Validate all IDs belong to this course
  const moduleMap = new Map(
    modules.map((m) => [String(m._id), m])
  );

  for (const id of orderedModuleIds) {
    if (!moduleMap.has(String(id))) {
      throw new ApiError(
        400,
        `Invalid module id: ${id}`,
        'INVALID_MODULE_ID'
      );
    }
  }

  // Bulk reorder
  const bulkOps = orderedModuleIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: {
        $set: {
          order: index + 1
        }
      }
    }
  }));

  await Module.bulkWrite(bulkOps);

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'curriculum_update',
    changes: { to: { order: orderedModuleIds } },
    metadata: { context: 'module_reorder' }
  }).catch(err => console.error('Failed to log module reorder audit:', err));

  return {
    message: 'Modules reordered successfully',
    data: true
  };
};


module.exports = {
  createModule,
  updateModule,
  deleteModule,
  reorderModules
};