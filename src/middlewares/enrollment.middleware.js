const Enrollment = require('../models/enrollment.model');
const Lesson = require('../models/lesson.model');
const { ApiError } = require('../utils/errors');

const requireEnrollment = async (req, _res, next) => {
  try {
    const { courseId } = req.params;

    const enrollment = await Enrollment.findOne({
      userId: req.user._id,
      courseId,
      deletedAt: null,
      status: 'active'
    });

    if (!enrollment) {
      return next(
        new ApiError(
          403,
          'You are not enrolled in this course',
          'COURSE_ENROLLMENT_REQUIRED'
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requireEnrollment
};