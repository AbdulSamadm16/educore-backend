const Course = require('../models/course.model');
const Lesson = require('../models/lesson.model');
const Module = require('../models/module.model');
const Enrollment = require('../models/enrollment.model');
const { ApiError } = require('../utils/errors');


// ======================================================
// REUSABLE: CHECK OWNER OR ADMIN
// ======================================================
const checkOwnerOrAdmin = ({ course, user }) => {

  const isOwner =
    course.authorId &&
    String(course.authorId) === String(user._id);

  const isAdmin = [
    'admin',
    'super_admin'
  ].includes(user.role);

  return { isOwner, isAdmin, hasAccess: isOwner || isAdmin };
};


// ======================================================
// CAN ACCESS COURSE
// ======================================================
const canAccessCourse = async ({ courseId, user }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  }).lean();

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  const { isOwner, isAdmin, hasAccess } = checkOwnerOrAdmin({
    course,
    user
  });

  // Admin can always access
  if (isAdmin) {
    return {
      canAccess: true,
      course,
      isOwner,
      isAdmin,
      enrollment: null
    };
  }

  // Owner can always access their own course
  if (isOwner) {
    return {
      canAccess: true,
      course,
      isOwner,
      isAdmin,
      enrollment: null
    };
  }

  // Suspended courses — only admin (already handled above)
  if (course.status === 'suspended') {
    throw new ApiError(
      403,
      'This course is currently suspended',
      'COURSE_SUSPENDED'
    );
  }

  // Published courses — check enrollment for learners
  if (course.status === 'published') {

    const enrollment = await Enrollment.findOne({
      userId: user._id,
      courseId,
      deletedAt: null,
      status: 'active'
    }).lean();

    return {
      canAccess: true,
      course,
      isOwner: false,
      isAdmin: false,
      enrollment
    };
  }

  // Unpublished/draft — enrolled learners retain access
  const enrollment = await Enrollment.findOne({
    userId: user._id,
    courseId,
    deletedAt: null,
    status: 'active'
  }).lean();

  if (enrollment) {
    return {
      canAccess: true,
      course,
      isOwner: false,
      isAdmin: false,
      enrollment
    };
  }

  // All other cases — deny
  throw new ApiError(
    403,
    'You do not have access to this course',
    'COURSE_ACCESS_DENIED'
  );
};


// ======================================================
// CAN ACCESS LESSON
// ======================================================
const canAccessLesson = async ({ lessonId, user }) => {

  const lesson = await Lesson.findOne({
    _id: lessonId,
    deletedAt: null
  }).lean();

  if (!lesson) {
    throw new ApiError(
      404,
      'Lesson not found',
      'LESSON_NOT_FOUND'
    );
  }

  // Preview lessons are always accessible
  if (lesson.isPreview) {
    return {
      canAccess: true,
      lesson,
      isPreview: true,
      isLocked: false
    };
  }

  const course = await Course.findOne({
    _id: lesson.courseId,
    deletedAt: null
  }).lean();

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  const { isOwner, isAdmin } = checkOwnerOrAdmin({
    course,
    user
  });

  // Owner or admin can access any lesson
  if (isOwner || isAdmin) {
    return {
      canAccess: true,
      lesson,
      isPreview: false,
      isLocked: false
    };
  }

  // Suspended course — block non-admin
  if (course.status === 'suspended') {
    return {
      canAccess: false,
      lesson,
      isPreview: false,
      isLocked: true
    };
  }

  // Check enrollment for non-preview lessons
  const enrollment = await Enrollment.findOne({
    userId: user._id,
    courseId: lesson.courseId,
    deletedAt: null,
    status: 'active'
  }).lean();

  if (enrollment) {
    return {
      canAccess: true,
      lesson,
      isPreview: false,
      isLocked: false
    };
  }

  // Not enrolled — lesson is locked
  return {
    canAccess: false,
    lesson,
    isPreview: false,
    isLocked: true
  };
};


module.exports = {
  checkOwnerOrAdmin,
  canAccessCourse,
  canAccessLesson
};
