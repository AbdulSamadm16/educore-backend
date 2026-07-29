const enrollmentService = require('../services/enrollment.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');
const { isAdminRole } = require('../utils/roles');

const enrollCourse = asyncHandler(async (req, res) => {
  const result = await enrollmentService.enrollCourse({
    userId: req.user._id,
    courseId: req.params.courseId,
    billingAddress: req.body.billingAddress,
    billingPhone: req.body.billingPhone
  });

  return sendSuccess(res, 201, result.message, result.data);
});

const getMyEnrollments = asyncHandler(async (req, res) => {
  const result = await enrollmentService.getMyEnrollments({
    userId: req.user._id,
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const checkEnrollment = asyncHandler(async (req, res) => {
  const result = await enrollmentService.checkEnrollment({
    userId: req.user._id,
    courseId: req.params.courseId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const cancelEnrollment = asyncHandler(async (req, res) => {
  const isAdmin = isAdminRole(req.user.role);

  // If the admin is cancelling it on behalf of a user, the userId might be in the body. Otherwise it's the current user.
  const targetUserId = (isAdmin && req.body.userId) ? req.body.userId : req.user._id;

  const result = await enrollmentService.cancelEnrollment({
    userId: targetUserId,
    courseId: req.params.courseId,
    isAdmin
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const getTutorStudents = asyncHandler(async (req, res) => {
  const result = await enrollmentService.getTutorStudents({
    tutorId: req.user._id,
    query: req.query
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const bulkEnrollStudents = asyncHandler(async (req, res) => {
  const { emails } = req.body;
  const courseId = req.body.courseId || req.params.courseId;
  
  if (!Array.isArray(emails) || !courseId) {
    return res.status(400).json({ success: false, message: 'Invalid payload: missing emails or courseId' });
  }

  const result = await enrollmentService.bulkEnrollStudents({
    adminId: req.user._id,
    emails,
    courseId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const requestRefund = asyncHandler(async (req, res) => {
  const result = await enrollmentService.requestRefund({
    userId: req.user._id,
    courseId: req.params.courseId
  });

  return sendSuccess(res, 200, result.message, result.data);
});

module.exports = {
  enrollCourse,
  getMyEnrollments,
  checkEnrollment,
  cancelEnrollment,
  getTutorStudents,
  bulkEnrollStudents,
  requestRefund
};
