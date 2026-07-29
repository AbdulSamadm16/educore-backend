const QuizAttempt = require('../models/quizAttempt.model');
const Lesson = require('../models/lesson.model');
const Enrollment = require('../models/enrollment.model');
const Progress = require('../models/progress.model');
const { ApiError } = require('../utils/errors');

const submitQuizAttempt = async ({ userId, lessonId, payload }) => {
  const lesson = await Lesson.findOne({ _id: lessonId, type: 'quiz', deletedAt: null });
  if (!lesson) {
    throw new ApiError(404, 'Quiz not found', 'QUIZ_NOT_FOUND');
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({ userId, courseId: lesson.courseId, status: 'active' });
  if (!enrollment) {
    throw new ApiError(403, 'You are not enrolled in this course', 'ENROLLMENT_REQUIRED');
  }

  const lastAttempt = await QuizAttempt.findOne({ userId, lessonId }).sort({ attemptNumber: -1 });
  const attemptNumber = lastAttempt ? lastAttempt.attemptNumber + 1 : 1;

  const quizMeta = lesson.quizMeta || { questions: [], passingScore: 70 };
  const questions = quizMeta.questions || [];

  let score = 0;
  let maxScore = 0;

  const answers = (payload.answers || []).map((ans) => {
    const question = questions.find(q => String(q._id || q.id) === String(ans.questionId));
    if (!question) {
      throw new ApiError(400, `Question not found in quiz: ${ans.questionId}`, 'INVALID_QUESTION');
    }

    const qPoints = question.points || 1;
    maxScore += qPoints;

    // Find the correct option index(es)
    if (question.isMultipleAnswer) {
      const correctIndexes = [];
      question.options.forEach((o, idx) => {
        if (o.isCorrect) correctIndexes.push(idx);
      });

      const selectedIndexes = ans.selectedOptionIndexes || [];
      // To get full points, selectedIndexes must exactly match correctIndexes
      if (
        correctIndexes.length === selectedIndexes.length &&
        correctIndexes.every(val => selectedIndexes.includes(val))
      ) {
        score += qPoints;
      }
    } else {
      const correctIdx = question.options.findIndex(o => o.isCorrect);
      if (correctIdx !== -1 && Number(ans.selectedOptionIndex) === correctIdx) {
        score += qPoints;
      }
    }

    return {
      questionId: ans.questionId,
      selectedOptionIndex: ans.selectedOptionIndex,
      selectedOptionIndexes: ans.selectedOptionIndexes || []
    };
  });

  // Calculate missing questions (if learner skipped them)
  questions.forEach((q) => {
    const answered = answers.some(a => String(a.questionId) === String(q._id || q.id));
    if (!answered) {
      maxScore += q.points || 1;
    }
  });

  if (maxScore === 0) maxScore = 1; // Prevent division by zero

  const percentage = (score / maxScore) * 100;
  const passed = percentage >= (quizMeta.passingScore || 70);
  const status = 'graded';

  // Update Progress
  if (passed) {
    try {
      let progress = await Progress.findOne({ userId, courseId: lesson.courseId, deletedAt: null });
      if (progress) {
        if (!progress.completedLessons.includes(lessonId)) {
          progress.completedLessons.push(lessonId);
          progress.completedLessonCount = progress.completedLessons.length;
          await progress.save();
        }
      }
    } catch (err) {
      console.error('[Progress Sync Error] Failed to update completed quiz in progress:', err);
    }
  }

  const attempt = await QuizAttempt.create({
    userId,
    lessonId,
    courseId: lesson.courseId,
    answers,
    score,
    maxScore,
    percentage,
    passed,
    attemptNumber,
    status
  });

  // Trigger quiz result notification to student (learner)
  try {
    const { triggerQuizResultNotification } = require('./notification.service');
    await triggerQuizResultNotification({
      studentId: userId,
      lessonId,
      score,
      maxScore,
      percentage,
      passed
    });
  } catch (notifErr) {
    console.error('[Notification Error] Failed to trigger quiz result notification:', notifErr.message);
  }

  return {
    message: 'Quiz attempt graded successfully',
    data: attempt
  };
};

const getMyQuizAttempts = async ({ userId, lessonId, courseId }) => {
  const filter = { userId };
  if (lessonId) filter.lessonId = lessonId;
  if (courseId) filter.courseId = courseId;

  const attempts = await QuizAttempt.find(filter)
    .populate('lessonId', 'title quizMeta')
    .sort({ createdAt: -1 });

  return {
    message: 'Quiz attempts retrieved successfully',
    data: attempts
  };
};

const getQuizAttemptDetails = async ({ userId, attemptId, userRole }) => {
  const attempt = await QuizAttempt.findById(attemptId)
    .populate('lessonId', 'title quizMeta description')
    .populate('userId', 'name email')
    .populate('gradedBy', 'name');

  if (!attempt) {
    throw new ApiError(404, 'Quiz attempt not found', 'ATTEMPT_NOT_FOUND');
  }

  // Ensure security: only learner or tutor/admin can access
  if (String(attempt.userId._id || attempt.userId) !== String(userId) && !['tutor', 'admin', 'super_admin'].includes(userRole)) {
    throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  }

  return {
    message: 'Quiz attempt details retrieved successfully',
    data: attempt
  };
};

module.exports = {
  submitQuizAttempt,
  getMyQuizAttempts,
  getQuizAttemptDetails
};
