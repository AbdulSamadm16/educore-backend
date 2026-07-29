const Submission = require('../models/submission.model');
const Lesson = require('../models/lesson.model');
const Enrollment = require('../models/enrollment.model');
const { ApiError } = require('../utils/errors');

const submitAssignment = async ({ userId, lessonId, payload }) => {
  const lesson = await Lesson.findOne({ _id: lessonId, type: 'assignment', deletedAt: null });
  if (!lesson) {
    throw new ApiError(404, 'Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({ userId, courseId: lesson.courseId, status: 'active' });
  if (!enrollment) {
    throw new ApiError(403, 'You are not enrolled in this course', 'ENROLLMENT_REQUIRED');
  }

  // Check if multiple submissions are allowed
  if (!lesson.assignmentMeta?.allowMultipleSubmissions) {
    const existingSubmission = await Submission.findOne({ userId, lessonId });
    if (existingSubmission) {
      throw new ApiError(400, 'Multiple submissions not allowed for this assignment', 'SUBMISSION_ALREADY_EXISTS');
    }
  }

  const lastSubmission = await Submission.findOne({ userId, lessonId }).sort({ attemptNumber: -1 });
  const attemptNumber = lastSubmission ? lastSubmission.attemptNumber + 1 : 1;

  const isLate = lesson.assignmentMeta?.dueDate ? new Date() > new Date(lesson.assignmentMeta.dueDate) : false;
  if (isLate && !lesson.assignmentMeta?.allowLateSubmissions) {
    throw new ApiError(400, 'Late submissions are not allowed for this assignment', 'LATE_SUBMISSIONS_DISABLED');
  }

  const submission = await Submission.create({
    userId,
    lessonId,
    courseId: lesson.courseId,
    submissionType: payload.submissionType || lesson.assignmentMeta.submissionType,
    content: payload.content,
    attachments: payload.attachments || [],
    attemptNumber,
    isLate
  });

  // Trigger real-time notifications to tutor
  try {
    const Course = require('../models/course.model');
    const course = await Course.findById(lesson.courseId).select('title authorId').lean();
    if (course && course.authorId) {
      const User = require('../models/user.model');
      const studentUser = await User.findById(userId).select('name').lean();
      const studentName = studentUser ? studentUser.name : 'A student';

      const notificationService = require('./notification.service');
      await notificationService.createNotification({
        userId: course.authorId,
        title: 'Assignment Submitted!',
        message: `"${studentName}" has submitted an assignment for "${lesson.title}" in "${course.title}".`,
        type: 'submission',
        metadata: { courseId: course._id, lessonId, submissionId: submission._id }
      });

      const tutor = await User.findById(course.authorId).select('name email notificationSettings').lean();
      if (tutor) {
        const settings = tutor.notificationSettings?.assignmentGraded || { email: true, inApp: true };
        if (settings.email !== false && tutor.email) {
          const emailService = require('./email.service');
          await emailService.sendStudentSubmissionEmail({
            to: tutor.email,
            tutorName: tutor.name,
            studentName,
            assignmentTitle: lesson.title,
            courseTitle: course.title,
            submissionId: submission._id.toString()
          }).catch(mailErr => console.error('[Notification Error] Failed to send student submission email to tutor:', mailErr.message));
        }
      }
    }
  } catch (notifErr) {
    console.error('[Notification Error] Failed to trigger submission notification:', notifErr.message);
  }

  // Mark the lesson as completed in progress
  try {
    const progressService = require('./progress.service');
    await progressService.markLessonComplete({
      userId,
      courseId: lesson.courseId,
      lessonId
    });
  } catch (progressErr) {
    console.error('[Progress Update Error] Failed to mark assignment lesson complete:', progressErr.message || progressErr);
  }

  return {
    message: 'Assignment submitted successfully',
    data: submission
  };
};

const getMySubmissions = async ({ userId, courseId }) => {
  const filter = { userId };
  if (courseId) filter.courseId = courseId;

  const submissions = await Submission.find(filter)
    .populate('lessonId', 'title assignmentMeta')
    .sort({ createdAt: -1 });

  return {
    message: 'Submissions retrieved successfully',
    data: submissions
  };
};

const getSubmissionDetails = async ({ userId, submissionId }) => {
  const submission = await Submission.findOne({ _id: submissionId, userId })
    .populate('lessonId', 'title assignmentMeta description')
    .populate('gradedBy', 'name');

  if (!submission) {
    throw new ApiError(404, 'Submission not found', 'SUBMISSION_NOT_FOUND');
  }

  return {
    message: 'Submission details retrieved successfully',
    data: submission
  };
};

// Tutor/Admin functions
const listSubmissionsForGrading = async ({ tutorId, lessonId, courseId }) => {
  const filter = {};
  if (lessonId) filter.lessonId = lessonId;
  if (courseId) filter.courseId = courseId;

  // In a real scenario, we'd verify the tutor owns the course
  const submissions = await Submission.find(filter)
    .populate('userId', 'name email')
    .populate('lessonId', 'title maxMarks')
    .populate('courseId', 'title')
    .sort({ createdAt: -1 });

  return {
    message: 'Submissions for grading retrieved successfully',
    data: submissions
  };
};

const gradeSubmission = async ({ tutorId, submissionId, grade, feedback }) => {
  const submission = await Submission.findById(submissionId);
  if (!submission) {
    throw new ApiError(404, 'Submission not found', 'SUBMISSION_NOT_FOUND');
  }

  const lesson = await Lesson.findById(submission.lessonId);
  const maxMarks = lesson?.assignmentMeta?.maxMarks || 100;

  if (grade > maxMarks) {
    throw new ApiError(400, `Grade cannot exceed maximum marks (${maxMarks})`, 'INVALID_GRADE');
  }

  submission.grade = grade;
  submission.feedback = feedback;
  submission.status = 'graded';
  submission.gradedBy = tutorId;
  submission.gradedAt = new Date();

  await submission.save();

  // Trigger real-time notifications to student
  try {
    const Course = require('../models/course.model');
    const course = await Course.findById(submission.courseId).select('title').lean();
    const courseTitle = course ? course.title : 'the course';
    const lessonTitle = lesson ? lesson.title : 'Assignment';

    if (submission.userId) {
      const notificationService = require('./notification.service');
      await notificationService.createNotification({
        userId: submission.userId,
        title: 'Assignment Graded!',
        message: `Your submission for assignment "${lessonTitle}" in "${courseTitle}" has been graded: ${grade}/${maxMarks}.`,
        type: 'grade',
        metadata: { courseId: submission.courseId, lessonId: submission.lessonId, submissionId }
      });

      // Send email if user's notification setting is enabled
      const User = require('../models/user.model');
      const student = await User.findById(submission.userId).select('name email notificationSettings').lean();
      if (student) {
        const settings = student.notificationSettings?.assignmentGraded || { email: true, inApp: true };
        if (settings.email !== false) {
          const emailService = require('./email.service');
          await emailService.sendAssignmentGradedEmail({
            to: student.email,
            studentName: student.name,
            assignmentTitle: lessonTitle,
            courseTitle,
            grade,
            maxMarks,
            feedback
          }).catch(mailErr => console.error('[Notification Error] Failed to send assignment graded email:', mailErr.message));
        }
      }
    }
  } catch (notifErr) {
    console.error('[Notification Error] Failed to trigger grading notification:', notifErr.message);
  }

  return {
    message: 'Submission graded successfully',
    data: submission
  };
};

const uploadSubmissionFile = async ({ userId, file }) => {
  const storageService = require('./storage.service');
  return await storageService.uploadSubmissionFile({ userId, file });
};

module.exports = {
  submitAssignment,
  getMySubmissions,
  getSubmissionDetails,
  listSubmissionsForGrading,
  gradeSubmission,
  uploadSubmissionFile
};
