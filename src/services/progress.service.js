const Course = require('../models/course.model');
const Lesson = require('../models/lesson.model');
const Enrollment = require('../models/enrollment.model');
const Progress = require('../models/progress.model');
const { ApiError } = require('../utils/errors');

const calculateProgress = (completedLessons, totalLessons, completedQuizzes, totalQuizzes, completedAssignments, totalAssignments) => {
  let weightLessons = 100;
  let weightQuizzes = 0;
  let weightAssignments = 0;

  if (totalQuizzes > 0 && totalAssignments > 0) {
    weightLessons = 70;
    weightQuizzes = 20;
    weightAssignments = 10;
  } else if (totalQuizzes > 0) {
    weightLessons = 80;
    weightQuizzes = 20;
  } else if (totalAssignments > 0) {
    weightLessons = 80;
    weightAssignments = 20;
  }

  const lessonScore = totalLessons === 0 ? weightLessons : (completedLessons / totalLessons) * weightLessons;
  const quizScore = totalQuizzes === 0 ? weightQuizzes : (completedQuizzes / totalQuizzes) * weightQuizzes;
  const assignmentScore = totalAssignments === 0 ? weightAssignments : (completedAssignments / totalAssignments) * weightAssignments;

  return Math.min(100, Math.round(lessonScore + quizScore + assignmentScore));
};


// ======================================================
// GET PROGRESS
// ======================================================
const getProgress = async ({ userId, courseId }) => {

  // Validate enrollment
  const enrollment = await Enrollment.findOne({
    userId,
    courseId,
    deletedAt: null,
    status: 'active'
  })
    .select('_id')
    .lean();

  if (!enrollment) {
    throw new ApiError(
      403,
      'You are not enrolled in this course',
      'ENROLLMENT_REQUIRED'
    );
  }

  const progress = await Progress.findOne({
    userId,
    courseId,
    deletedAt: null
  }).lean();

  if (!progress) {
    // Return default progress if not yet created
    return {
      message: 'Progress retrieved successfully',
      data: {
        courseId,
        completedLessons: [],
        completedLessonCount: 0,
        lastAccessedLesson: null,
        progressPercentage: 0
      }
    };
  }

  return {
    message: 'Progress retrieved successfully',
    data: progress
  };
};


// ======================================================
// MARK LESSON COMPLETE
// ======================================================
const markLessonComplete = async ({ userId, courseId, lessonId }) => {

  // 1. Validate enrollment
  const enrollment = await Enrollment.findOne({
    userId,
    courseId,
    deletedAt: null,
    status: 'active'
  })
    .select('_id')
    .lean();

  if (!enrollment) {
    throw new ApiError(
      403,
      'You are not enrolled in this course',
      'ENROLLMENT_REQUIRED'
    );
  }

  // 2. Validate course & lesson
  const Lesson = require('../models/lesson.model');
  const Module = require('../models/module.model');

  const lessonObj = await Lesson.findOne({ _id: lessonId, deletedAt: null }).lean();
  if (!lessonObj) {
    throw new ApiError(404, 'Lesson not found', 'LESSON_NOT_FOUND');
  }

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  })
    .lean();

  if (!course) {
    throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');
  }

  // Fetch progress early to check alreadyCompleted and to check locked states
  let progress = await Progress.findOne({
    userId,
    courseId,
    deletedAt: null
  });

  const completedLessons = progress ? (progress.completedLessons || []).map(id => String(id)) : [];

  // Strict double-gated locking check
  if (course.isSequential) {
    const allModules = await Module.find({ courseId, deletedAt: null, isPublished: true }).sort({ order: 1 }).lean();
    const allLessons = await Lesson.find({ courseId, deletedAt: null, isPublished: true }).sort({ order: 1 }).lean();

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

    const currentLessonIdx = flatLessons.findIndex(l => String(l._id) === String(lessonId));
    if (currentLessonIdx !== -1) {
      const mUnlocked = moduleUnlocked.get(String(lessonObj.moduleId)) || false;
      if (!mUnlocked) {
        throw new ApiError(403, 'Cannot complete a locked lesson (Module is locked).', 'LESSON_LOCKED');
      }
      if (currentLessonIdx > 0) {
        const prevL = flatLessons[currentLessonIdx - 1];
        const prevCompleted = completedLessons.includes(String(prevL._id));
        if (!prevCompleted) {
          throw new ApiError(403, 'Cannot complete a locked lesson (Previous lesson is not completed).', 'LESSON_LOCKED');
        }
      }
    }
  }

  // Idempotency: Return early if already completed
  const alreadyCompleted = completedLessons.includes(String(lessonId));

  const totalLessonsCount = course.totalLessons || 0;
  const totalQuizzesCount = course.totalQuizzes || 0;
  const totalAssignmentsCount = course.totalAssignments || 0;

  if (alreadyCompleted && progress) {
    const percentage = calculateProgress(
      progress.completedLessonCount || 0,
      totalLessonsCount,
      (progress.completedQuizzes || []).length,
      totalQuizzesCount,
      (progress.completedAssignments || []).length,
      totalAssignmentsCount
    );
    return {
      message: 'Lesson already marked as complete',
      data: {
        ...progress.toJSON(),
        progressPercentage: percentage
      }
    };
  }

  // Create or Update Progress
  if (!progress) {
    progress = await Progress.create({
      userId,
      courseId,
      completedLessons: [lessonId],
      lastAccessedLesson: lessonId,
      completedLessonCount: 1
    });
  } else {
    progress.completedLessons.push(lessonId);
    progress.completedLessonCount = progress.completedLessons.length;
    progress.lastAccessedLesson = lessonId;
    await progress.save();
  }

  const percentage = calculateProgress(
    progress.completedLessonCount || 0,
    totalLessonsCount,
    (progress.completedQuizzes || []).length,
    totalQuizzesCount,
    (progress.completedAssignments || []).length,
    totalAssignmentsCount
  );

  // Update enrollment progress percentage
  await Enrollment.updateOne(
    { userId, courseId, deletedAt: null },
    { $set: { progressPercentage: percentage, lastAccessedAt: new Date() } }
  );

  // Trigger certificate generation if >= 90% complete
  if (percentage >= 90) {
    if (course && course.certificateEnabled) {
      const { triggerCertificateGeneration } = require('../queues/certificate.queue');
      await triggerCertificateGeneration({ userId, courseId });
    }
  }

  return {
    message: 'Lesson marked as complete',
    data: {
      ...progress.toJSON(),
      progressPercentage: percentage
    }
  };
};


// ======================================================
// UPDATE VIDEO PLAYBACK PROGRESS (UNIFIED LOGGING)
// ======================================================
const updateVideoProgress = async ({
  userId,
  courseId,
  lessonId,
  watchTime,
  percentage,
  secondsWatched,
  progressPercentage
}) => {
  const actualWatchTime = watchTime !== undefined ? watchTime : secondsWatched;
  const actualPercentage = percentage !== undefined ? percentage : progressPercentage;
  // 1. Validate enrollment
  const enrollment = await Enrollment.findOne({
    userId,
    courseId,
    deletedAt: null,
    status: 'active'
  })
    .select('_id')
    .lean();

  if (!enrollment) {
    throw new ApiError(
      403,
      'You are not enrolled in this course',
      'ENROLLMENT_REQUIRED'
    );
  }

  // 2. Validate course & lesson
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  })
    .select('totalLessons totalQuizzes totalAssignments certificateEnabled')
    .lean();

  if (!course) {
    throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');
  }

  const lesson = await Lesson.findOne({
    _id: lessonId,
    courseId,
    deletedAt: null
  }).lean();

  if (!lesson) {
    throw new ApiError(404, 'Lesson not found', 'LESSON_NOT_FOUND');
  }

  // 3. Fetch or create progress
  let progress = await Progress.findOne({
    userId,
    courseId,
    deletedAt: null
  });

  if (!progress) {
    progress = new Progress({
      userId,
      courseId,
      completedLessons: [],
      completedLessonCount: 0,
      lessonProgress: [],
      videoProgress: []
    });
  }

  // Ensure arrays are initialized
  if (!progress.lessonProgress) {
    progress.lessonProgress = [];
  }
  if (!progress.videoProgress) {
    progress.videoProgress = [];
  }

  const isCompletedNow = actualPercentage >= 90;

  // 4. Update or insert watch progress for lessonProgress
  let lessonProg = progress.lessonProgress.find(
    (p) => String(p.lessonId) === String(lessonId)
  );

  if (lessonProg) {
    lessonProg.watchTime = actualWatchTime;
    lessonProg.percentage = actualPercentage;
    lessonProg.lastWatchedAt = new Date();
    if (isCompletedNow) {
      lessonProg.completed = true;
    }
  } else {
    progress.lessonProgress.push({
      lessonId,
      watchTime: actualWatchTime,
      percentage: actualPercentage,
      completed: isCompletedNow,
      lastWatchedAt: new Date()
    });
  }

  // 5. Update or insert watch progress for videoProgress (backward compatibility)
  let videoProgIndex = progress.videoProgress.findIndex(
    (p) => String(p.lessonId) === String(lessonId)
  );

  if (videoProgIndex > -1) {
    progress.videoProgress[videoProgIndex].secondsWatched = actualWatchTime;
    progress.videoProgress[videoProgIndex].lastWatchedAt = new Date();
  } else {
    progress.videoProgress.push({
      lessonId,
      secondsWatched: actualWatchTime,
      lastWatchedAt: new Date()
    });
  }

  // 6. Automatic threshold marking
  let justCompleted = false;
  if (isCompletedNow) {
    const alreadyCompleted = progress.completedLessons.some(
      (id) => String(id) === String(lessonId)
    );

    if (!alreadyCompleted) {
      progress.completedLessons.push(lessonId);
      progress.completedLessonCount = progress.completedLessons.length;
      justCompleted = true;
    }
  }

  progress.lastAccessedLesson = lessonId;
  await progress.save();

  // 7. Recalculate enrollment progress
  const totalLessons = course.totalLessons || 0;
  const totalQuizzes = course.totalQuizzes || 0;
  const totalAssignments = course.totalAssignments || 0;

  const overallPercentage = calculateProgress(
    progress.completedLessonCount || 0,
    totalLessons,
    (progress.completedQuizzes || []).length,
    totalQuizzes,
    (progress.completedAssignments || []).length,
    totalAssignments
  );

  await Enrollment.updateOne(
    { userId, courseId, deletedAt: null },
    { $set: { progressPercentage: overallPercentage, lastAccessedAt: new Date() } }
  );

  // Trigger certificate generation if >= 90% complete
  if (overallPercentage >= 90 && justCompleted) {
    if (course && course.certificateEnabled) {
      const { triggerCertificateGeneration } = require('../queues/certificate.queue');
      await triggerCertificateGeneration({ userId, courseId });
    }
  }

  return {
    message: 'Playback progress updated successfully',
    data: {
      ...progress.toJSON(),
      progressPercentage: overallPercentage
    }
  };
};


// ======================================================
// UPDATE RECORDING PLAYBACK PROGRESS
// ======================================================
const updateRecordingProgress = async ({ userId, recordingId, watchTime }) => {
  // Validate recording to extract courseId
  const LiveRecording = require('../models/liveRecording.model');
  const recording = await LiveRecording.findOne({ _id: recordingId, deletedAt: null }).lean();
  if (!recording) {
    throw new ApiError(404, 'Recording not found', 'RECORDING_NOT_FOUND');
  }

  const courseId = recording.courseId;

  // Validate enrollment
  const enrollment = await Enrollment.findOne({ userId, courseId, deletedAt: null, status: 'active' }).select('_id').lean();
  if (!enrollment) {
    throw new ApiError(403, 'You are not enrolled in this course', 'ENROLLMENT_REQUIRED');
  }

  let progress = await Progress.findOne({ userId, courseId, deletedAt: null });
  if (!progress) {
    progress = new Progress({
      userId, courseId, completedLessons: [], completedLessonCount: 0, lessonProgress: [], videoProgress: [], recordingProgress: []
    });
  }

  if (!progress.recordingProgress) progress.recordingProgress = [];

  let recProgIndex = progress.recordingProgress.findIndex(p => String(p.recordingId) === String(recordingId));
  if (recProgIndex > -1) {
    progress.recordingProgress[recProgIndex].secondsWatched = watchTime;
    progress.recordingProgress[recProgIndex].lastWatchedAt = new Date();
  } else {
    progress.recordingProgress.push({
      recordingId,
      secondsWatched: watchTime,
      lastWatchedAt: new Date()
    });
  }

  await progress.save();

  return {
    message: 'Recording progress updated successfully',
    data: progress
  };
};

const getLearnerAnalytics = async ({ userId }) => {
  const QuizAttempt = require('../models/quizAttempt.model');
  const Submission = require('../models/submission.model');
  const Enrollment = require('../models/enrollment.model');
  const Progress = require('../models/progress.model');

  // 1. Fetch all user data concurrently
  const [progressDocs, quizAttempts, submissions, enrollments] = await Promise.all([
    Progress.find({ userId, deletedAt: null }).lean(),
    QuizAttempt.find({ userId }).lean(),
    Submission.find({ userId }).lean(),
    Enrollment.find({ userId, deletedAt: null }).lean()
  ]);

  // 2. Calculate Hours Watched (from videoProgress & recordingProgress secondsWatched)
  let totalSecondsWatched = 0;
  progressDocs.forEach((doc) => {
    (doc.videoProgress || []).forEach((vp) => {
      totalSecondsWatched += (vp.secondsWatched || 0);
    });
    (doc.recordingProgress || []).forEach((rp) => {
      totalSecondsWatched += (rp.secondsWatched || 0);
    });
  });
  const totalHoursWatched = parseFloat((totalSecondsWatched / 3600).toFixed(1));

  // 3. Calculate Course Counts
  let inProgressCount = 0;
  let completedCount = 0;
  enrollments.forEach((e) => {
    if (e.status === 'completed' || e.progressPercentage === 100) {
      completedCount++;
    } else if (e.status === 'active') {
      inProgressCount++;
    }
  });

  // 4. Calculate Quiz Average (best percentage per quiz lesson)
  const quizBestScores = {};
  quizAttempts.forEach((attempt) => {
    const lessonId = String(attempt.lessonId);
    const scorePct = attempt.percentage || 0;
    if (!quizBestScores[lessonId] || scorePct > quizBestScores[lessonId]) {
      quizBestScores[lessonId] = scorePct;
    }
  });
  const bestScores = Object.values(quizBestScores);
  const quizAverage = bestScores.length > 0
    ? Math.round(bestScores.reduce((acc, curr) => acc + curr, 0) / bestScores.length)
    : 0;

  // 5. Gather activity timestamps for Heatmap and Streak calculations
  const getYYYYMMDD = (date) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const uniqueDates = new Set();
  const heatmapCounts = {};

  const recordActivity = (date) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return;

    // Streak tracking date string
    const dateStr = getYYYYMMDD(d);
    if (dateStr) uniqueDates.add(dateStr);

    // Heatmap hour-day distribution
    const day = d.getDay(); // 0 (Sunday) to 6 (Saturday)
    const hour = d.getHours(); // 0 to 23
    const key = `${day}-${hour}`;
    heatmapCounts[key] = (heatmapCounts[key] || 0) + 1;
  };

  progressDocs.forEach((doc) => {
    if (doc.createdAt) recordActivity(doc.createdAt);
    if (doc.updatedAt) recordActivity(doc.updatedAt);
    (doc.lessonProgress || []).forEach((lp) => {
      if (lp.lastWatchedAt) recordActivity(lp.lastWatchedAt);
    });
    (doc.videoProgress || []).forEach((vp) => {
      if (vp.lastWatchedAt) recordActivity(vp.lastWatchedAt);
    });
    (doc.recordingProgress || []).forEach((rp) => {
      if (rp.lastWatchedAt) recordActivity(rp.lastWatchedAt);
    });
  });

  quizAttempts.forEach((q) => {
    if (q.createdAt) recordActivity(q.createdAt);
  });

  submissions.forEach((s) => {
    if (s.createdAt) recordActivity(s.createdAt);
  });

  enrollments.forEach((e) => {
    if (e.createdAt) recordActivity(e.createdAt);
    if (e.lastAccessedAt) recordActivity(e.lastAccessedAt);
  });

  // Calculate Streak
  let currentStreak = 0;
  if (uniqueDates.size > 0) {
    const today = new Date();
    const todayStr = getYYYYMMDD(today);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getYYYYMMDD(yesterday);

    let startStr = null;
    if (uniqueDates.has(todayStr)) {
      startStr = todayStr;
    } else if (uniqueDates.has(yesterdayStr)) {
      startStr = yesterdayStr;
    }

    if (startStr) {
      const checkDate = new Date(startStr);
      while (true) {
        const checkStr = getYYYYMMDD(checkDate);
        if (uniqueDates.has(checkStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }
  }

  // Calculate Max Streak
  let maxStreak = 0;
  if (uniqueDates.size > 0) {
    const sortedUniqueDates = Array.from(uniqueDates).sort();
    let tempStreak = 0;
    let prevDate = null;

    sortedUniqueDates.forEach((dateStr) => {
      const currDate = new Date(dateStr);
      if (prevDate === null) {
        tempStreak = 1;
      } else {
        const diffTime = Math.abs(currDate - prevDate);
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      }
      if (tempStreak > maxStreak) {
        maxStreak = tempStreak;
      }
      prevDate = currDate;
    });
  }

  // Format Heatmap Data
  const activityHeatmap = Object.entries(heatmapCounts).map(([key, count]) => {
    const [day, hour] = key.split('-').map(Number);
    return { day, hour, count };
  });

  return {
    message: 'Learner analytics fetched successfully',
    data: {
      totalHoursWatched,
      coursesCount: {
        inProgress: inProgressCount,
        completed: completedCount
      },
      quizAverage,
      streak: {
        currentStreak,
        maxStreak,
        activeDaysCount: uniqueDates.size
      },
      activityHeatmap
    }
  };
};

module.exports = {
  getProgress,
  markLessonComplete,
  updateVideoProgress,
  updateRecordingProgress,
  getLearnerAnalytics
};