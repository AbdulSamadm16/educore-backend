const courseService = require('../services/course.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');


const getCourses = asyncHandler(async (req, res) => {
  const result = await courseService.getCourses({
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getCourseById = asyncHandler(async (req, res) => {
  const result = await courseService.getCourseById({
    courseId: req.params.id,
    userId: req.user?._id || null,
    userRole: req.user?.role || null
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const createCourse = asyncHandler(async (req, res) => {
  const result = await courseService.createCourse({
    payload: req.body,
    authorId: req.user._id
  });

  return sendSuccess(res, 201, result.message, result.data);
});

const updateCourse = asyncHandler(async (req, res) => {
  const result = await courseService.updateCourse({
    courseId: req.params.id,
    payload: req.body,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getCourseCurriculum = asyncHandler(async (req, res) => {
  const result = await courseService.getCourseCurriculum({
    courseId: req.params.courseId,
    userId: req.user?._id || null,
    userRole: req.user?.role || null,
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const publishCourse = asyncHandler(async (req, res) => {
  const result = await courseService.publishCourse({
    courseId: req.params.id,
    user: req.user,
    sendNotification: req.body.sendNotification
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const unpublishCourse = asyncHandler(async (req, res) => {
  const result = await courseService.unpublishCourse({
    courseId: req.params.id,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const discardPendingChanges = asyncHandler(async (req, res) => {
  const result = await courseService.discardPendingChanges({
    courseId: req.params.id,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getCourseCatalogue = asyncHandler(async (req, res) => {
  const result = await courseService.getCourseCatalogue({
    query: req.query,
    userId: req.user?._id || null
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const checkCoursePublishReadiness = asyncHandler(async (req, res) => {
  const result = await courseService.checkCoursePublishReadiness({
    courseId: req.params.id
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getAllCoursesAdmin = asyncHandler(async (req, res) => {
  const result = await courseService.getAllCoursesAdmin({
    query: req.query,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const toggleFeatureCourse = asyncHandler(async (req, res) => {
  const result = await courseService.toggleFeatureCourse({
    courseId: req.params.id,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const suspendCourse = asyncHandler(async (req, res) => {
  const result = await courseService.suspendCourse({
    courseId: req.params.id,
    user: req.user,
    reason: req.body.reason
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const unsuspendCourse = asyncHandler(async (req, res) => {
  const result = await courseService.unsuspendCourse({
    courseId: req.params.id,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const deleteCourse = asyncHandler(async (req, res) => {
  const result = await courseService.deleteCourse({
    courseId: req.params.id,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getMyCourses = asyncHandler(async (req, res) => {
  const result = await courseService.getMyCourses({
    user: req.user,
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getCourseStats = asyncHandler(async (req, res) => {
  const result = await courseService.getCourseStats({
    courseId: req.params.id,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});


const approveCourse = asyncHandler(async (req, res) => {
  const result = await courseService.approveCourse({
    courseId: req.params.id,
    user: req.user,
    sendNotification: req.body.sendNotification
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const rejectCourseReview = asyncHandler(async (req, res) => {
  const result = await courseService.rejectCourseReview({
    courseId: req.params.id,
    user: req.user,
    feedback: req.body.feedback
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const flagCourseForReview = asyncHandler(async (req, res) => {
  const result = await courseService.flagCourseForReview({
    courseId: req.params.id,
    user: req.user,
    reason: req.body.reason
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const updateThumbnail = asyncHandler(async (req, res) => {
  const result = await courseService.updateThumbnail({
    courseId: req.params.id,
    file: req.file,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getCourseAuditLogs = asyncHandler(async (req, res) => {
  const result = await courseService.getCourseAuditLogs({
    courseId: req.params.id,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});


const getCoursePreviewCurriculum = asyncHandler(async (req, res) => {
  const result = await courseService.getCoursePreviewCurriculum({
    courseId: req.params.courseId,
    userId: req.user?._id || null
  });

  return sendSuccess(res, 200, result.message, result.data);
});


const getTutorAnalytics = asyncHandler(async (req, res) => {
  const result = await courseService.getTutorAnalytics({
    user: req.user,
    courseId: req.query.courseId || null
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const submitCourseForReview = asyncHandler(async (req, res) => {
  const result = await courseService.submitCourseForReview({
    courseId: req.params.id,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});


module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  getCourseCurriculum,
  getCoursePreviewCurriculum,
  publishCourse,
  unpublishCourse,
  discardPendingChanges,
  getCourseCatalogue,
  checkCoursePublishReadiness,
  getAllCoursesAdmin,
  toggleFeatureCourse,
  suspendCourse,
  unsuspendCourse,
  deleteCourse,
  getMyCourses,
  getCourseStats,
  approveCourse,
  rejectCourseReview,
  flagCourseForReview,
  updateThumbnail,
  getCourseAuditLogs,
  getTutorAnalytics,
  submitCourseForReview
};
