const Course = require('../models/course.model');
const Module = require('../models/module.model');
const Lesson = require('../models/lesson.model');
const Enrollment = require('../models/enrollment.model');
const User = require('../models/user.model');
const InstitutionMembership = require('../models/institutionMembership.model');
const storageService = require('../services/storage.service');
const auditService = require('../services/audit.service');
const emailService = require('../services/email.service');
const institutionService = require('../services/institution.service');
const { checkOwnerOrAdmin } = require('../services/access.service');
const { signVideoUrl } = require('../services/video.service');
const { ApiError } = require('../utils/errors');
const { ACCOUNT_TYPES, ROLES, isAdminRole } = require('../utils/roles');

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  let formatted = '';
  if (hrs > 0) {
    formatted += `${hrs}h `;
  }
  if (mins > 0 || hrs > 0) {
    formatted += `${mins}m `;
  }
  formatted += `${secs}s`;
  return formatted.trim();
};

const assertTutorCanManageCourses = async ({ tutorId, action = 'manage courses' }) => {
  const tutor = await User.findOne({ _id: tutorId, role: ROLES.TUTOR, deletedAt: null })
    .select('status accountType institutionId')
    .lean();

  if (!tutor) return null;

  if (tutor.status !== 'active') {
    throw new ApiError(
      403,
      `Tutor account must be approved before you can ${action}.`,
      'TUTOR_APPROVAL_REQUIRED'
    );
  }

  const isInstitutionTutor = tutor.accountType === ACCOUNT_TYPES.INSTITUTION_TUTOR || Boolean(tutor.institutionId);
  if (!isInstitutionTutor) return;

  const activeMembership = await InstitutionMembership.exists({
    userId: tutorId,
    institutionId: tutor.institutionId,
    memberType: 'tutor',
    status: 'active'
  });

  if (!activeMembership) {
    throw new ApiError(
      403,
      `Institution tutor membership must be active before you can ${action}.`,
      'INSTITUTION_TUTOR_APPROVAL_REQUIRED'
    );
  }

  return tutor;
};

const computeLockStates = ({ course, modules, lessons, completedLessons, isPrivileged, isEnrolled }) => {
  const isSequential = course.isSequential === true;

  // Group lessons by module
  const moduleLessonsMap = new Map();
  lessons.forEach(l => {
    const mId = String(l.moduleId);
    if (!moduleLessonsMap.has(mId)) {
      moduleLessonsMap.set(mId, []);
    }
    moduleLessonsMap.get(mId).push(l);
  });

  // Sort lessons in each module by order
  modules.forEach(m => {
    const list = moduleLessonsMap.get(String(m._id)) || [];
    list.sort((a, b) => a.order - b.order);
    moduleLessonsMap.set(String(m._id), list);
  });

  // Module completion states
  const moduleCompleted = new Map();
  modules.forEach(m => {
    const list = moduleLessonsMap.get(String(m._id)) || [];
    if (list.length === 0) {
      moduleCompleted.set(String(m._id), true);
    } else {
      const allDone = list.every(l => completedLessons.includes(String(l._id)));
      moduleCompleted.set(String(m._id), allDone);
    }
  });

  // Module unlock states
  const moduleUnlocked = new Map();
  modules.forEach((m, mIdx) => {
    if (!isSequential || mIdx === 0) {
      moduleUnlocked.set(String(m._id), true);
    } else {
      const prevM = modules[mIdx - 1];
      const prevUnlocked = moduleUnlocked.get(String(prevM._id)) || false;
      const prevCompleted = moduleCompleted.get(String(prevM._id)) || false;
      moduleUnlocked.set(String(m._id), prevUnlocked && prevCompleted);
    }
  });

  // Build global flat order of lessons
  const flatLessons = [];
  modules.forEach(m => {
    const list = moduleLessonsMap.get(String(m._id)) || [];
    flatLessons.push(...list);
  });

  // Lesson lock states
  const lessonLocked = new Map();
  const lessonSequentialLocked = new Map();

  flatLessons.forEach((l, idx) => {
    const mId = String(l.moduleId);
    const mUnlocked = moduleUnlocked.get(mId) || false;

    let isSeqLocked = false;
    let isLocked = false;

    if (isSequential) {
      if (!mUnlocked) {
        isSeqLocked = true;
        isLocked = true;
      } else if (idx > 0) {
        // Prev lesson must be completed and NOT locked
        const prevL = flatLessons[idx - 1];
        const prevLocked = lessonLocked.get(String(prevL._id)) || false;
        const prevCompleted = completedLessons.includes(String(prevL._id));
        if (prevLocked || !prevCompleted) {
          isSeqLocked = true;
          isLocked = true;
        }
      }
    }

    // Unenrolled guest lock logic: locked unless isPreview is true
    if (!isEnrolled) {
      if (!l.isPreview) {
        isLocked = true;
      }
    }

    // A preview lesson is NEVER locked, regardless of guest status or sequential gating
    if (l.isPreview) {
      isLocked = false;
      isSeqLocked = false;
    }

    // Privileged bypass
    if (isPrivileged) {
      isLocked = false;
      isSeqLocked = false;
    }

    lessonLocked.set(String(l._id), isLocked);
    lessonSequentialLocked.set(String(l._id), isSeqLocked);
  });

  return {
    moduleCompleted,
    moduleUnlocked,
    lessonLocked,
    lessonSequentialLocked
  };
};


// ======================================================
// GET ALL COURSES (ADMIN / TUTOR VIEW)
// ======================================================
const getCourses = async ({ query }) => {

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;

  const filter = { deletedAt: null };

  if (query.level) filter.level = query.level;

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .populate('authorId', 'name avatarUrl profile')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    Course.countDocuments(filter)
  ]);

  return {
    message: 'Courses retrieved successfully',
    data: {
      courses,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }
  };
};


// ======================================================
// GET COURSE DETAIL (TUTOR + INTERNAL VIEW)
// ======================================================
const getCourseById = async ({ courseId, userId, userRole }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  })
    .populate('authorId', 'name avatarUrl profile')
    .lean();

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  // Check enrollment status for learner badge
  let isEnrolled = false;
  let videoProgressMap = new Map();
  let progressObj = null;
  let certificate = null;

  if (userId) {
    const enrollment = await Enrollment.findOne({
      userId,
      courseId,
      deletedAt: null,
      status: 'active'
    })
      .select('_id')
      .lean();

    isEnrolled = !!enrollment;

    if (isEnrolled) {
      const Progress = require('../models/progress.model');
      progressObj = await Progress.findOne({
        userId,
        courseId,
        deletedAt: null
      }).lean();

      if (progressObj && progressObj.videoProgress) {
        progressObj.videoProgress.forEach(vp => {
          videoProgressMap.set(String(vp.lessonId), vp.secondsWatched);
        });
      }
    }

    const Certificate = require('../models/certificate.model');
    certificate = await Certificate.findOne({
      userId,
      courseId
    })
      .select('certificateNumber status pdfUrl verificationUrl issueDate')
      .lean();
  }

  const authorIdStr = course.authorId?._id ? course.authorId._id.toString() : (course.authorId ? course.authorId.toString() : null);
  const isAuthor = Boolean(userId && authorIdStr && authorIdStr === userId.toString());
  const isAdmin = isAdminRole(userRole);
  const isPrivileged = isAuthor || isAdmin;

  const isPlatformOwner = userRole === 'platform_owner' || userRole === 'platform_admin' || userRole === 'super_admin';
  const bypassVisibility = isPlatformOwner || isAuthor;

  // Enforce institution visibility
  if (!bypassVisibility && course.institutionId) {
    if (!userId) {
      throw new ApiError(403, 'This course is restricted to members of its institution.', 'INSTITUTION_COURSE_RESTRICTED');
    }
    const user = await User.findById(userId).select('institutionId').lean();
    if (!user || String(user.institutionId) !== String(course.institutionId)) {
      throw new ApiError(403, 'You do not have permission to view this institutional course.', 'INSTITUTION_COURSE_RESTRICTED');
    }
  }

  // Enforce public course block if institution settings disable public courses
  const isPublicCourse = course.courseType === 'PUBLIC' || !course.institutionId;
  if (!bypassVisibility && isPublicCourse && userId) {
    const user = await User.findById(userId).select('institutionId').lean();
    if (user && user.institutionId) {
      const InstitutionSettings = require('../models/institutionSettings.model');
      const settings = await InstitutionSettings.findOne({ institutionId: user.institutionId }).lean();
      const allowPublic = settings ? settings.allowPublicCourses !== false : true;
      if (!allowPublic) {
        throw new ApiError(403, 'Public courses are disabled for your institution.', 'PUBLIC_COURSES_DISABLED');
      }
    }
  }

  // Access Control: Block unpublished courses unless the user is the author, an admin, or an enrolled student
  if (course.status !== 'published') {
    if (!isEnrolled && !isPrivileged) {
      throw new ApiError(403, 'This course is currently unavailable.');
    }
  }

  const moduleQuery = { courseId, deletedAt: null };
  const lessonQuery = { courseId, deletedAt: null };

  if (!isPrivileged) {
    moduleQuery.isPublished = true;
    lessonQuery.isPublished = true;
  }

  const modules = await Module.find(moduleQuery)
    .sort({ order: 1 })
    .lean();

  const lessons = await Lesson.find(lessonQuery)
    .sort({ order: 1 })
    .lean();

  const completedLessons = progressObj ? (progressObj.completedLessons || []).map(id => String(id)) : [];

  const { lessonLocked, lessonSequentialLocked } = computeLockStates({
    course,
    modules,
    lessons,
    completedLessons,
    isPrivileged,
    isEnrolled
  });

  const normalizedLessons = lessons.map(l => {
    const isLocked = lessonLocked.get(String(l._id)) || false;
    const isSequentialLocked = lessonSequentialLocked.get(String(l._id)) || false;
    const isCompleted = completedLessons.includes(String(l._id));
    const secondsWatched = videoProgressMap.get(String(l._id)) || 0;
    const durationSeconds = l.durationSeconds || (l.durationInMinutes ? l.durationInMinutes * 60 : 0);
    const durationFormatted = l.durationFormatted || formatDuration(durationSeconds);
    const canSeeContent = l.isPreview || isEnrolled || isPrivileged;

    const attachments = (l.attachments || []).map(att => ({
      name: att.title || 'Attachment',
      title: att.title || 'Attachment',
      url: att.fileUrl,
      fileUrl: att.fileUrl
    }));

    return {
      id: String(l._id),
      _id: String(l._id),
      lessonId: String(l._id),
      title: l.title,
      description: l.description || '',
      lessonDescription: l.description || '',
      type: l.type,
      order: l.order,
      isPreview: l.isPreview,
      allowFreePreview: l.isPreview,
      isPublished: l.isPublished,
      isLocked,
      isSequentialLocked,
      videoUrl: canSeeContent && !isSequentialLocked ? (l.videoUrl ? signVideoUrl(l.videoUrl, l._id, userId) : null) : null,
      subtitleUrl: canSeeContent && !isSequentialLocked ? l.subtitleUrl : null,
      hlsUrl: canSeeContent && !isSequentialLocked && l.videoUrl && l.videoUrl.includes('stream.mux.com') ? signVideoUrl(l.videoUrl, l._id, userId) : null,
      subtitleUrl: canSeeContent && !isSequentialLocked ? (l.subtitleUrl || null) : null,
      videoStatus: canSeeContent ? l.videoStatus : null,
      videoProcessingError: canSeeContent ? l.videoProcessingError : null,
      attachments: canSeeContent && !isSequentialLocked ? attachments : [],
      content: canSeeContent && !isSequentialLocked ? l.content : null,
      quizMeta: canSeeContent && !isSequentialLocked ? l.quizMeta : null,
      assignmentMeta: canSeeContent && !isSequentialLocked ? l.assignmentMeta : null,
      durationSeconds,
      duration: durationFormatted,
      durationFormatted,
      durationInMinutes: l.durationInMinutes || Math.max(1, Math.round(durationSeconds / 60)),
      secondsWatched,
      isCompleted
    };
  });

  const lessonDataGrouped = new Map();
  normalizedLessons.forEach(lObj => {
    const lOriginal = lessons.find(x => String(x._id) === lObj.id);
    const mId = String(lOriginal.moduleId);
    if (!lessonDataGrouped.has(mId)) {
      lessonDataGrouped.set(mId, []);
    }
    lessonDataGrouped.get(mId).push(lObj);
  });

  const curriculum = modules.map((m) => ({
    id: m._id,
    _id: m._id,
    title: m.title,
    description: m.description,
    order: m.order,
    isPublished: m.isPublished,
    totalLessons: lessonDataGrouped.get(String(m._id))?.length || 0,
    lessons: lessonDataGrouped.get(String(m._id)) || []
  }));

  const totalDuration = normalizedLessons.reduce(
    (sum, l) => sum + (l.durationInMinutes || 0),
    0
  );

  return {
    message: 'Course details retrieved successfully',
    data: {
      course,
      certificate,
      certificateIssued: certificate?.status === 'issued',
      certificateDownloadUrl: certificate?.pdfUrl || null,
      isEnrolled,
      completedLessons,
      stats: {
        totalModules: modules.length,
        totalLessons: normalizedLessons.length,
        totalDurationInMinutes: totalDuration
      },
      modules: curriculum
    }
  };
};


// ======================================================
// CREATE COURSE
// ======================================================
const createCourse = async ({ payload, authorId }) => {
  const tutor = await assertTutorCanManageCourses({ tutorId: authorId, action: 'create courses' });

  const course = await Course.create({
    status: 'draft',
    authorId,
    institutionId: tutor ? tutor.institutionId : null,
    pendingChanges: null,
    ...payload
  });

  return {
    message: 'Course created successfully',
    data: course
  };
};


// ======================================================
// UPDATE COURSE
// ======================================================
const updateCourse = async ({ courseId, payload, user }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const { hasAccess } = checkOwnerOrAdmin({ course, user });

  if (!hasAccess) {
    throw new ApiError(403, 'Not authorized');
  }

  // Whitelist allowed fields (prevent overwriting protected fields)
  const allowedFields = [
    'title', 'shortDescription', 'description', 'category',
    'tags', 'level', 'language', 'thumbnailUrl', 'trailerVideoUrl',
    'price', 'isFree', 'isSequential', 'learningOutcomes', 'requirements',
    'targetAudience', 'visibility', 'seoTitle', 'seoDescription',
    'certificateEnabled', 'certificateTemplateId'
  ];

  const safePayload = {};

  for (const key of allowedFields) {
    if (payload[key] !== undefined) {
      safePayload[key] = payload[key];
    }
  }

  // If published → store as pending changes
  if (course.status === 'published') {
    const oldChanges = course.pendingChanges || {};
    course.pendingChanges = {
      ...oldChanges,
      ...safePayload,
      updatedAt: new Date()
    };

    await course.save();

    await auditService.logCourseAction({
      courseId,
      userId: user._id,
      action: 'update',
      changes: { to: safePayload },
      metadata: { status: 'published', mode: 'pending_changes' }
    });

    return {
      message: 'Changes saved as pending update',
      data: course
    };
  }

  // If draft or review_pending → direct update
  const oldData = {};
  Object.keys(safePayload).forEach(key => {
    oldData[key] = course[key];
  });

  const oldStatus = course.status;
  Object.assign(course, safePayload);
  await course.save();

  if (course.status === 'review_pending' && oldStatus !== 'review_pending') {
    try {
      const notificationService = require('./notification.service');
      await notificationService.triggerCourseReviewSubmittedAlert({ courseId: course._id.toString() });
    } catch (err) {
      console.error('[Notification Error] Failed to trigger course review submitted alert:', err.message);
    }
  }

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'update',
    changes: { from: oldData, to: safePayload },
    metadata: { status: course.status, mode: 'direct_update' }
  });

  return {
    message: 'Course updated successfully',
    data: course
  };
};


// ======================================================
// COURSE CURRICULUM (PUBLIC / LEARNER VIEW)
// ======================================================
const getCourseCurriculum = async ({ courseId, userId, userRole, query }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  })
    .select('title shortDescription thumbnailUrl authorId status isSequential institutionId certificateEnabled')
    .lean();

  if (!course) {
    throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');
  }

  // Check enrollment status for learner
  let isEnrolled = false;
  let videoProgressMap = new Map();
  let progressObj = null;

  if (userId) {
    const enrollment = await Enrollment.findOne({
      userId,
      courseId,
      deletedAt: null,
      status: 'active'
    })
      .select('_id')
      .lean();

    isEnrolled = !!enrollment;

    if (isEnrolled) {
      const Progress = require('../models/progress.model');
      progressObj = await Progress.findOne({
        userId,
        courseId,
        deletedAt: null
      }).lean();

      if (progressObj && progressObj.videoProgress) {
        progressObj.videoProgress.forEach(vp => {
          videoProgressMap.set(String(vp.lessonId), vp.secondsWatched);
        });
      }
    }
  }

  const isAuthor = userId && course.authorId && String(course.authorId) === String(userId);
  const isAdmin = isAdminRole(userRole);
  const isPrivileged = isAuthor || isAdmin;

  const isPlatformOwner = userRole === 'platform_owner' || userRole === 'platform_admin' || userRole === 'super_admin';
  const bypassVisibility = isPlatformOwner || isAuthor;

  // Access Control: Block draft/unpublished courses for non-privileged users
  if (['draft', 'unpublished'].includes(course.status)) {
    if (!isPrivileged) {
      throw new ApiError(403, 'This course is currently unavailable.', 'COURSE_UNAVAILABLE');
    }
  } else if (course.status !== 'published') {
    if (!isEnrolled && !isPrivileged) {
      throw new ApiError(403, 'This course is currently unavailable.', 'COURSE_UNAVAILABLE');
    }
  }

  // Enforce institution visibility
  if (!bypassVisibility && course.institutionId) {
    if (!userId) {
      throw new ApiError(403, 'You must be logged in to your institution to view this course.', 'COURSE_UNAVAILABLE');
    }
    const user = await User.findById(userId).select('institutionId').lean();
    if (!user || String(user.institutionId) !== String(course.institutionId)) {
      throw new ApiError(403, 'You do not have access to this institutional course.', 'COURSE_UNAVAILABLE');
    }
  }

  // Enforce public course block if institution settings disable public courses
  const isPublicCourse = course.courseType === 'PUBLIC' || !course.institutionId;
  if (!bypassVisibility && isPublicCourse && userId) {
    const user = await User.findById(userId).select('institutionId').lean();
    if (user && user.institutionId) {
      const InstitutionSettings = require('../models/institutionSettings.model');
      const settings = await InstitutionSettings.findOne({ institutionId: user.institutionId }).lean();
      const allowPublic = settings ? settings.allowPublicCourses !== false : true;
      if (!allowPublic) {
        throw new ApiError(403, 'Public courses are disabled for your institution.', 'PUBLIC_COURSES_DISABLED');
      }
    }
  }

  const moduleQuery = { courseId, deletedAt: null };
  const lessonQuery = { courseId, deletedAt: null };

  if (!isPrivileged) {
    moduleQuery.isPublished = true;
    lessonQuery.isPublished = true;
  }

  const modules = await Module.find(moduleQuery)
    .sort({ order: 1 })
    .lean();

  const lessons = await Lesson.find(lessonQuery)
    .sort({ order: 1 })
    .lean();

  const lessonMap = new Map();
  const completedLessons = progressObj ? (progressObj.completedLessons || []).map(id => String(id)) : [];

  const { lessonLocked, lessonSequentialLocked } = computeLockStates({
    course,
    modules,
    lessons,
    completedLessons,
    isPrivileged: isPrivileged && (!query || query.previewAsStudent !== 'true'),
    isEnrolled
  });

  const normalizedLessons = lessons.map(l => {
    const isLocked = lessonLocked.get(String(l._id)) || false;
    const isSequentialLocked = lessonSequentialLocked.get(String(l._id)) || false;
    const isCompleted = completedLessons.includes(String(l._id));
    const secondsWatched = videoProgressMap.get(String(l._id)) || 0;
    const durationSeconds = l.durationSeconds || (l.durationInMinutes ? l.durationInMinutes * 60 : 0);
    const durationFormatted = l.durationFormatted || formatDuration(durationSeconds);
    const canSeeContent = l.isPreview || isEnrolled || isPrivileged;

    const attachments = (l.attachments || []).map(att => ({
      name: att.title || 'Attachment',
      title: att.title || 'Attachment',
      url: att.fileUrl,
      fileUrl: att.fileUrl
    }));

    return {
      id: String(l._id),
      _id: String(l._id),
      lessonId: String(l._id),
      title: l.title,
      description: l.description || '',
      lessonDescription: l.description || '',
      type: l.type,
      order: l.order,
      isPreview: l.isPreview,
      allowFreePreview: l.isPreview,
      isPublished: l.isPublished,
      isLocked,
      isSequentialLocked,
      videoUrl: canSeeContent && !isSequentialLocked ? (l.videoUrl ? signVideoUrl(l.videoUrl, l._id, userId) : null) : null,
      subtitleUrl: canSeeContent && !isSequentialLocked ? l.subtitleUrl : null,
      hlsUrl: canSeeContent && !isSequentialLocked && l.videoUrl && l.videoUrl.includes('stream.mux.com') ? signVideoUrl(l.videoUrl, l._id, userId) : null,
      subtitleUrl: canSeeContent && !isSequentialLocked ? (l.subtitleUrl || null) : null,
      videoStatus: canSeeContent ? l.videoStatus : null,
      videoProcessingError: canSeeContent ? l.videoProcessingError : null,
      attachments: canSeeContent && !isSequentialLocked ? attachments : [],
      content: canSeeContent && !isSequentialLocked ? l.content : null,
      quizMeta: canSeeContent && !isSequentialLocked ? l.quizMeta : null,
      assignmentMeta: canSeeContent && !isSequentialLocked ? l.assignmentMeta : null,
      durationSeconds,
      duration: durationFormatted,
      durationFormatted,
      durationInMinutes: l.durationInMinutes || Math.max(1, Math.round(durationSeconds / 60)),
      secondsWatched,
      isCompleted
    };
  });

  const lessonDataGrouped = new Map();
  normalizedLessons.forEach(lObj => {
    const lOriginal = lessons.find(x => String(x._id) === lObj.id);
    const mId = String(lOriginal.moduleId);
    if (!lessonDataGrouped.has(mId)) {
      lessonDataGrouped.set(mId, []);
    }
    lessonDataGrouped.get(mId).push(lObj);
  });

  return {
    message: 'Course curriculum retrieved successfully',
    data: {
      course,
      modules: modules.map((m) => ({
        id: m._id,
        _id: m._id,
        title: m.title,
        description: m.description,
        order: m.order,
        isPublished: m.isPublished,
        lessons: lessonDataGrouped.get(String(m._id)) || []
      }))
    }
  };
};


// ======================================================
// COURSE PREVIEW CURRICULUM (GUEST / CATALOGUE VIEW)
// ======================================================
const getCoursePreviewCurriculum = async ({ courseId, userId }) => {
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  })
    .select('title shortDescription thumbnailUrl authorId status isSequential institutionId')
    .lean();

  if (!course) {
    throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');
  }

  if (['draft', 'unpublished'].includes(course.status)) {
    throw new ApiError(403, 'This course is currently unavailable.', 'COURSE_UNAVAILABLE');
  }

  // Enforce institution visibility
  if (course.institutionId) {
    if (!userId) {
      throw new ApiError(403, 'You must be logged in to your institution to view this course.', 'COURSE_UNAVAILABLE');
    }
    const user = await User.findById(userId).select('institutionId').lean();
    if (!user || String(user.institutionId) !== String(course.institutionId)) {
      throw new ApiError(403, 'You do not have access to this institutional course.', 'COURSE_UNAVAILABLE');
    }
  }

  // Enforce public course block if institution settings disable public courses
  const isPublicCourse = course.courseType === 'PUBLIC' || !course.institutionId;
  if (isPublicCourse && userId) {
    const user = await User.findById(userId).select('institutionId').lean();
    if (user && user.institutionId) {
      const InstitutionSettings = require('../models/institutionSettings.model');
      const settings = await InstitutionSettings.findOne({ institutionId: user.institutionId }).lean();
      const allowPublic = settings ? settings.allowPublicCourses !== false : true;
      if (!allowPublic) {
        throw new ApiError(403, 'Public courses are disabled for your institution.', 'PUBLIC_COURSES_DISABLED');
      }
    }
  }

  const modules = await Module.find({ courseId, deletedAt: null, isPublished: true })
    .sort({ order: 1 })
    .lean();

  const lessons = await Lesson.find({ courseId, deletedAt: null, isPublished: true })
    .sort({ order: 1 })
    .lean();

  const lessonMap = new Map();

  lessons.forEach((l) => {
    const key = String(l.moduleId);

    if (!lessonMap.has(key)) {
      lessonMap.set(key, []);
    }

    const durationSeconds = l.durationSeconds || (l.durationInMinutes ? l.durationInMinutes * 60 : 0);
    const durationFormatted = l.durationFormatted || formatDuration(durationSeconds);

    if (l.isPreview) {
      lessonMap.get(key).push({
        id: String(l._id),
        _id: String(l._id),
        lessonId: String(l._id),
        title: l.title,
        description: l.description || '',
        lessonDescription: l.description || '',
        type: l.type,
        order: l.order,
        isPreview: true,
        allowFreePreview: true,
        isPublished: l.isPublished,
        isLocked: false,
        isSequentialLocked: false,
        videoUrl: l.videoUrl ? signVideoUrl(l.videoUrl, l._id, 'guest') : null,
        subtitleUrl: l.subtitleUrl || null,
        hlsUrl: l.videoUrl && l.videoUrl.includes('stream.mux.com') ? signVideoUrl(l.videoUrl, l._id, 'guest') : null,
        subtitleUrl: l.subtitleUrl || null,
        videoStatus: l.videoStatus,
        videoProcessingError: l.videoProcessingError,
        attachments: [], // Guest strips raw attachments for preview
        content: l.content || null,
        durationSeconds,
        duration: durationFormatted,
        durationFormatted,
        durationInMinutes: l.durationInMinutes || Math.max(1, Math.round(durationSeconds / 60)),
        secondsWatched: 0,
        isCompleted: false
      });
    } else {
      // Locked lesson for preview
      lessonMap.get(key).push({
        id: String(l._id),
        _id: String(l._id),
        lessonId: String(l._id),
        title: l.title,
        description: '', // strip details
        lessonDescription: '',
        type: l.type,
        order: l.order,
        isPreview: false,
        allowFreePreview: false,
        isPublished: l.isPublished,
        isLocked: true,
        isSequentialLocked: false,
        videoUrl: null, // strip
        hlsUrl: null, // strip
        subtitleUrl: null,
        videoStatus: null,
        videoProcessingError: null,
        attachments: [], // strip
        content: null, // strip
        durationSeconds,
        duration: durationFormatted,
        durationFormatted,
        durationInMinutes: l.durationInMinutes || Math.max(1, Math.round(durationSeconds / 60)),
        secondsWatched: 0,
        isCompleted: false
      });
    }
  });

  return {
    message: 'Course preview curriculum retrieved successfully',
    data: {
      course,
      modules: modules.map((m) => ({
        id: m._id,
        _id: m._id,
        title: m.title,
        description: m.description,
        order: m.order,
        lessons: lessonMap.get(String(m._id)) || []
      }))
    }
  };
};


// ======================================================
// PUBLISH COURSE
// ======================================================
const publishCourse = async ({ courseId, user, sendNotification }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const { hasAccess } = checkOwnerOrAdmin({ course, user });

  if (!hasAccess) {
    throw new ApiError(403, 'Not authorized');
  }

  await assertTutorCanManageCourses({ tutorId: course.authorId, action: 'publish courses' });

  // Step 1: basic counts
  const moduleCount = await Module.countDocuments({
    courseId,
    deletedAt: null
  });

  const lessonCount = await Lesson.countDocuments({
    courseId,
    deletedAt: null
  });

  if (moduleCount < 1 || lessonCount < 1) {
    throw new ApiError(
      400,
      'Course must have at least 1 module and 1 lesson',
      'NOT_READY_TO_PUBLISH'
    );
  }

  // Step 2: structural validation — every module must have lessons
  const modules = await Module.find({
    courseId,
    deletedAt: null
  }).select('_id title');

  for (const mod of modules) {
    const modLessonCount = await Lesson.countDocuments({
      moduleId: mod._id,
      deletedAt: null
    });

    if (modLessonCount < 1) {
      throw new ApiError(
        400,
        `Module "${mod.title}" has no lessons`,
        'MODULE_INCOMPLETE'
      );
    }
  }

  // Step 3: apply pending changes if any
  if (course.pendingChanges) {
    const { updatedAt, ...changes } = course.pendingChanges;
    Object.assign(course, changes);
    course.pendingChanges = null;
  }

  // Step 3.5: certificate template validation & freeze version
  if (course.certificateEnabled) {
    if (!course.certificateTemplateId) {
      throw new ApiError(
        400,
        'A certificate template must be selected when certificates are enabled',
        'CERTIFICATE_TEMPLATE_REQUIRED'
      );
    }

    const CertificateTemplate = require('../models/certificateTemplate.model');
    const template = await CertificateTemplate.findOne({
      _id: course.certificateTemplateId,
      isActive: true
    });

    if (!template) {
      throw new ApiError(
        400,
        'Selected certificate template is not active or does not exist',
        'CERTIFICATE_TEMPLATE_INVALID'
      );
    }

    // Verify visibility rules based on course scope
    const isInstitutional = Boolean(course.institutionId);
    if (!isInstitutional) {
      if (template.scope !== 'platform') {
        throw new ApiError(
          400,
          'Individual courses must use a platform-scoped certificate template',
          'CERTIFICATE_TEMPLATE_SCOPE_INVALID'
        );
      }
    } else {
      if (template.scope !== 'institution' || String(template.institutionId) !== String(course.institutionId)) {
        throw new ApiError(
          400,
          'Institutional courses must use a certificate template matching their institution',
          'CERTIFICATE_TEMPLATE_SCOPE_INVALID'
        );
      }
    }

    course.certificateTemplateVersion = template.version;
  }

  // Step 4: publish
  // For development/tutor empowerment, we allow direct publishing
  const oldStatus = course.status;
  course.status = 'published';
  course.publishedAt = course.publishedAt || new Date();
  course.visibility = 'public';
  course.isPublishReady = true;
  course.lastPublishedAt = new Date();

  await course.save();

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'status_change',
    changes: { from: { status: oldStatus }, to: { status: 'published' } },
    metadata: { status: 'published' }
  }).catch(err => console.error('Failed to log course publish audit:', err));

  // Step 5: Auto-publish all modules and lessons to ensure visibility
  await Promise.all([
    Module.updateMany(
      { courseId, deletedAt: null },
      { $set: { isPublished: true } }
    ),
    Lesson.updateMany(
      { courseId, deletedAt: null },
      { $set: { isPublished: true } }
    )
  ]);

  // Broadcast Course Announcement to all registered learners
  if (sendNotification) {
    try {
      const notificationService = require('./notification.service');
      const NotificationModel = require('../models/notification.model');

      // Only notify learners who should see this course:
      // - If the course has no institutionId (individual tutor), only notify individual learners.
      // - If the course belongs to an institution, only notify learners in that institution.
      let learnerFilter = { role: 'learner', deletedAt: null };
      if (course.institutionId) {
        // Institution course → notify only learners in that institution
        learnerFilter.institutionId = course.institutionId;
      } else {
        // Individual tutor course → exclude institution learners
        learnerFilter.accountType = 'individual_learner';
      }

      const learners = await User.find(learnerFilter).select('_id name email').lean();

      if (learners.length > 0) {
        const tutorName = user.name || 'A Tutor';
        const notificationsPayload = learners.map(learner => ({
          userId: learner._id,
          title: 'New Course Published!',
          message: `A new course has been published: "${course.title}" by ${tutorName}. Check it out now!`,
          type: 'course',
          metadata: { courseId: course._id }
        }));

        // Bulk write to db for absolute speed
        const createdNotifications = await NotificationModel.insertMany(notificationsPayload);

        // Broadcast in real-time down SSE stream for any connected users
        createdNotifications.forEach(notif => {
          notificationService.sendPushNotification(notif.userId, notif);
        });

        // Trigger email notification to all platform learners asynchronously!
        const emailService = require('./email.service');
        learners.forEach(learner => {
          if (learner.email) {
            emailService.sendCoursePublishedEmail({
              to: learner.email,
              studentName: learner.name,
              courseTitle: course.title,
              tutorName: tutorName
            }).catch(emailErr => {
              console.error(`[COURSE EMAIL BROADCAST ERROR] Failed to send email to ${learner.email}:`, emailErr.message);
            });
          }
        });

        console.log(`[COURSE BROADCAST] Successfully broadcast announcement of "${course.title}" to ${learners.length} learners.`);
      }
    } catch (broadcastErr) {
      console.error('[COURSE BROADCAST ERROR] Failed to broadcast course announcement:', broadcastErr);
    }
  }

  return {
    message: 'Course published successfully and content synchronized.',
    data: course
  };
};


// ======================================================
// UNPUBLISH COURSE
// ======================================================
const unpublishCourse = async ({ courseId, user }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const { hasAccess } = checkOwnerOrAdmin({ course, user });

  if (!hasAccess) {
    throw new ApiError(403, 'Not authorized');
  }

  const oldStatus = course.status;
  course.status = 'unpublished';
  course.visibility = 'private';

  await course.save();

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'status_change',
    changes: { from: { status: oldStatus }, to: { status: 'unpublished' } },
    metadata: { status: 'unpublished' }
  }).catch(err => console.error('Failed to log course unpublish audit:', err));

  return {
    message: 'Course unpublished successfully',
    data: course
  };
};


// ======================================================
// DISCARD PENDING CHANGES (REVERT TO LAST PUBLISHED STATE)
// ======================================================
const discardPendingChanges = async ({ courseId, user }) => {
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const { hasAccess } = checkOwnerOrAdmin({ course, user });

  if (!hasAccess) {
    throw new ApiError(403, 'Not authorized');
  }

  course.pendingChanges = null;
  await course.save();

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'discard_changes',
    metadata: { status: course.status }
  });

  return {
    message: 'Pending changes discarded successfully and reverted to published state',
    data: course
  };
};


// ======================================================
// COURSE CATALOGUE (LEARNER VIEW)
// ======================================================
const getCourseCatalogue = async ({ query, userId }) => {

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;

  const filter = {
    deletedAt: null,
    status: 'published'
  };

  // Visibility logic: Individual learners/guests see only non-institutional courses.
  // Institutional learners/tutors see only courses from their institution.
  if (userId) {
    const user = await User.findById(userId).select('institutionId accountType').lean();
    if (user && user.institutionId) {
      const InstitutionSettings = require('../models/institutionSettings.model');
      const settings = await InstitutionSettings.findOne({ institutionId: user.institutionId }).lean();
      const allowPublic = settings ? settings.allowPublicCourses !== false : true;

      if (!allowPublic) {
        filter.institutionId = user.institutionId;
      } else {
        filter.$or = [
          { courseType: 'PUBLIC' },
          { institutionId: null },
          { institutionId: user.institutionId }
        ];
      }
    } else {
      filter.$or = [
        { courseType: 'PUBLIC' },
        { institutionId: null }
      ];
    }
  } else {
    filter.$or = [
      { courseType: 'PUBLIC' },
      { institutionId: null }
    ];
  }

  // Category filter
  if (query.category) {
    filter.category = query.category;
  }

  // Level filter
  if (query.level) {
    filter.level = query.level;
  }

  // Price filter
  if (query.price === 'free') {
    filter.isFree = true;
  } else if (query.price === 'paid') {
    filter.isFree = false;
  }

  // Rating filter
  if (query.rating) {
    filter.averageRating = { $gte: Number(query.rating) };
  }

  // Featured filter
  if (query.featured !== undefined) {
    filter.featured = query.featured;
  }

  // Search filter
  if (query.search) {
    const matchingAuthors = await User.find({
      name: { $regex: query.search, $options: 'i' }
    }).select('_id');
    const authorIds = matchingAuthors.map(a => a._id);

    filter.$or = [
      { title: { $regex: query.search, $options: 'i' } },
      { shortDescription: { $regex: query.search, $options: 'i' } },
      { tags: { $regex: query.search, $options: 'i' } },
      { authorId: { $in: authorIds } }
    ];
  }

  // Sort options
  let sortOption = { featured: -1, createdAt: -1 };

  if (query.sort === 'popular') {
    sortOption = { featured: -1, enrollmentCount: -1 };
  } else if (query.sort === 'rating') {
    sortOption = { featured: -1, averageRating: -1 };
  } else if (query.sort === 'price_low') {
    sortOption = { featured: -1, price: 1 };
  } else if (query.sort === 'price_high') {
    sortOption = { featured: -1, price: -1 };
  }

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .select(`
        title slug shortDescription category level
        thumbnailUrl price isFree currency
        averageRating reviewCount enrollmentCount
        durationInMinutes totalModules totalLessons
        featured authorSnapshot tags authorId
      `)
      .populate('authorId', 'name profile avatarUrl')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    Course.countDocuments(filter)
  ]);

  // Add enrolled badge if userId provided
  let enrolledCourseIds = new Set();

  if (userId) {
    const enrollments = await Enrollment.find({
      userId,
      deletedAt: null,
      status: 'active'
    })
      .select('courseId')
      .lean();

    enrolledCourseIds = new Set(
      enrollments.map((e) => String(e.courseId))
    );
  }

  const coursesWithBadge = courses.map((course) => ({
    ...course,
    isEnrolled: enrolledCourseIds.has(String(course._id))
  }));

  return {
    message: 'Course catalogue retrieved successfully',
    data: {
      courses: coursesWithBadge,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }
  };
};


// ======================================================
// CHECK COURSE PUBLISH READINESS
// ======================================================
const checkCoursePublishReadiness = async ({ courseId }) => {

  // 1. Check modules
  const modules = await Module.find({
    courseId,
    deletedAt: null
  });

  if (!modules.length) {
    throw new ApiError(
      400,
      'Course must have at least 1 module',
      'NO_MODULES_FOUND'
    );
  }

  // 2. Check lessons
  const lessons = await Lesson.find({
    courseId,
    deletedAt: null
  });

  if (!lessons.length) {
    throw new ApiError(
      400,
      'Course must have at least 1 lesson',
      'NO_LESSONS_FOUND'
    );
  }

  // 3. Check empty modules
  const moduleIds = new Set(modules.map((m) => String(m._id)));

  const lessonsGrouped = {};

  for (const lesson of lessons) {
    const key = String(lesson.moduleId);
    lessonsGrouped[key] = (lessonsGrouped[key] || 0) + 1;
  }

  for (const moduleId of moduleIds) {
    if (!lessonsGrouped[moduleId]) {
      throw new ApiError(
        400,
        'All modules must contain at least 1 lesson',
        'EMPTY_MODULE_FOUND'
      );
    }
  }

  return {
    message: 'Course is ready to publish',
    data: {
      isReady: true,
      totalModules: modules.length,
      totalLessons: lessons.length
    }
  };
};


// ======================================================
// MY COURSES (TUTOR DASHBOARD)
// ======================================================
const getMyCourses = async ({ user, query }) => {

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {
    deletedAt: null,
    authorId: user._id
  };

  // Filter by status
  if (query.status) {
    filter.status = query.status;
  }

  // Search filter
  if (query.search) {
    filter.title = { $regex: query.search, $options: 'i' };
  }

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(`
        title
        status
        price
        isFree
        thumbnailUrl
        enrollmentCount
        averageRating
        totalModules
        totalLessons
        featured
        pendingChanges
        updatedAt
        createdAt
      `)
      .lean(),

    Course.countDocuments(filter)
  ]);

  return {
    message: 'My courses retrieved successfully',
    data: {
      courses,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }
  };
};


// ======================================================
// COURSE STATS
// ======================================================
const getCourseStats = async ({ courseId, user }) => {

  const course = await Course.findOne({
    _id: courseId,
    authorId: user._id,
    deletedAt: null
  })
    .select('enrollmentCount status updatedAt')
    .lean();

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const [modules, lessons] = await Promise.all([
    Module.countDocuments({ courseId, deletedAt: null }),
    Lesson.countDocuments({ courseId, deletedAt: null })
  ]);

  return {
    message: 'Course stats retrieved successfully',
    data: {
      courseId,
      modules,
      lessons,
      enrollmentCount: course.enrollmentCount || 0,
      status: course.status,
      lastUpdated: course.updatedAt
    }
  };
};


// ======================================================
// ADMIN: GET ALL COURSES
// ======================================================
const getAllCoursesAdmin = async ({ query, user }) => {

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {
    deletedAt: null
  };

  // If the admin belongs to an institution, they can only manage their institution's courses
  if (user && user.institutionId) {
    filter.institutionId = user.institutionId;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.tutorId) {
    filter.authorId = query.tutorId;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.featured !== undefined) {
    filter.featured = query.featured === 'true' || query.featured === true;
  }

  let courses = [];
  let total = 0;

  if (query.search) {
    const matchingTutors = await User.find({
      role: 'tutor',
      name: { $regex: query.search, $options: 'i' }
    }).select('_id').lean();
    
    filter.$or = [
      { title: { $regex: query.search, $options: 'i' } },
      { shortDescription: { $regex: query.search, $options: 'i' } },
      { authorId: { $in: matchingTutors.map(t => t._id) } }
    ];
  }

  [courses, total] = await Promise.all([
    Course.find(filter)
      .populate('authorId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Course.countDocuments(filter)
  ]);

  return {
    message: 'Admin courses retrieved successfully',
    data: {
      courses,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }
  };
};


// ======================================================
// ADMIN: TOGGLE FEATURE COURSE
// ======================================================
const toggleFeatureCourse = async ({ courseId, user }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const isAdmin = isAdminRole(user.role);

  if (!isAdmin) {
    throw new ApiError(403, 'Not authorized');
  }

  course.featured = !course.featured;

  await course.save();

  return {
    message: course.featured
      ? 'Course marked as featured'
      : 'Course removed from featured',
    data: course
  };
};


// ======================================================
// ADMIN: SUSPEND COURSE
// ======================================================
const suspendCourse = async ({ courseId, user, reason }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  }).populate('authorId', 'name email');

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const isAdmin = isAdminRole(user.role);

  if (!isAdmin) {
    throw new ApiError(403, 'Not authorized');
  }

  course.status = 'suspended';
  course.reviewNotes = reason || 'No reason provided';

  await course.save();

  // Send email notification to tutor
  if (course.authorId && course.authorId.email) {
    await emailService.sendMail({
      to: course.authorId.email,
      name: course.authorId.name,
      subject: `Course Suspended: ${course.title}`,
      text: `Your course "${course.title}" has been suspended by an administrator.\n\nReason: ${course.reviewNotes}\n\nPlease contact support for more information.`
    });
  }

  return {
    message: 'Course suspended successfully',
    data: course
  };
};


// ======================================================
// ADMIN: UNSUSPEND COURSE
// ======================================================
const unsuspendCourse = async ({ courseId, user }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const isAdmin = isAdminRole(user.role);

  if (!isAdmin) {
    throw new ApiError(403, 'Not authorized');
  }

  // Restore to published status
  course.status = 'published';
  course.reviewNotes = 'Course unsuspended by administrator';

  await course.save();

  return {
    message: 'Course unsuspended successfully',
    data: course
  };
};


// ======================================================
// ADMIN: DELETE COURSE
// ======================================================
const deleteCourse = async ({ courseId, user }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const isAdmin = isAdminRole(user.role);
  const isOwner = course.authorId.toString() === user._id.toString();

  if (!isAdmin && !isOwner) {
    throw new ApiError(403, 'Not authorized to delete this course');
  }

  course.deletedAt = new Date();
  course.status = 'deleted';

  await course.save();

  try {
    await institutionService.deactivateAssignmentsForCourse(courseId);
  } catch (err) {
    console.error('[CourseService] Error cascading course deletion to tutor assignments:', err.message);
  }

  return {
    message: 'Course deleted successfully',
    data: course
  };
};


const approveCourse = async ({ courseId, user, sendNotification }) => {
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  // Double check admin role (redundant with route protection but safe)
  if (!isAdminRole(user.role)) {
    throw new ApiError(403, 'Only administrators can approve courses');
  }

  course.status = 'published';
  course.publishedAt = course.publishedAt || new Date();
  course.lastPublishedAt = new Date();
  course.reviewedBy = user._id;
  course.reviewedAt = new Date();
  course.reviewNotes = 'Course approved by administrator';

  await course.save();

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'approve',
    changes: { from: { status: 'review_pending' }, to: { status: 'published' } },
    metadata: { status: 'published' }
  }).catch(err => console.error('Failed to log course approval audit:', err));

  // Broadcast Course Announcement to all registered learners
  if (sendNotification) {
    try {
      const notificationService = require('./notification.service');
      const NotificationModel = require('../models/notification.model');

      // Only notify learners who should see this course:
      // - If the course has no institutionId (individual tutor), only notify individual learners.
      // - If the course belongs to an institution, only notify learners in that institution.
      let learnerFilter = { role: 'learner', deletedAt: null };
      if (course.institutionId) {
        learnerFilter.institutionId = course.institutionId;
      } else {
        learnerFilter.accountType = 'individual_learner';
      }

      const learners = await User.find(learnerFilter).select('_id').lean();

      if (learners.length > 0) {
        const tutorUser = await User.findById(course.authorId).select('name').lean();
        const tutorName = tutorUser ? tutorUser.name : 'A Tutor';

        const notificationsPayload = learners.map(learner => ({
          userId: learner._id,
          title: 'New Course Published!',
          message: `A new course has been published: "${course.title}" by ${tutorName}. Check it out now!`,
          type: 'course',
          metadata: { courseId: course._id }
        }));

        const createdNotifications = await NotificationModel.insertMany(notificationsPayload);

        createdNotifications.forEach(notif => {
          notificationService.sendPushNotification(notif.userId, notif);
        });

        console.log(`[COURSE APPROVE BROADCAST] Broadcast course approval of "${course.title}" to ${learners.length} learners.`);
      }
    } catch (broadcastErr) {
      console.error('[COURSE APPROVE BROADCAST ERROR] Failed to broadcast:', broadcastErr);
    }
  }

  return {
    message: 'Course approved and published',
    data: course
  };
};

const rejectCourseReview = async ({ courseId, user, feedback }) => {
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  }).populate('authorId', 'name email');

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  if (!isAdminRole(user.role)) {
    throw new ApiError(403, 'Only administrators can reject courses');
  }

  const oldStatus = course.status;
  course.status = 'unpublished';
  course.reviewedBy = user._id;
  course.reviewedAt = new Date();
  course.reviewNotes = feedback || 'Course rejected by administrator';

  await course.save();

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'reject',
    changes: { from: { status: oldStatus }, to: { status: 'unpublished', reviewNotes: course.reviewNotes } },
    metadata: { status: 'unpublished', feedback: course.reviewNotes }
  }).catch(err => console.error('Failed to log course rejection audit:', err));

  if (course.authorId?.email) {
    await emailService.sendMail({
      to: course.authorId.email,
      name: course.authorId.name,
      subject: `Course Review Feedback: ${course.title}`,
      text: `Your course "${course.title}" was not approved for publishing yet.\n\nFeedback: ${course.reviewNotes}\n\nPlease update the course and submit it for review again.`
    }).catch(err => console.error('Failed to send course rejection email:', err));
  }

  return {
    message: 'Course rejected with feedback',
    data: course
  };
};

const flagCourseForReview = async ({ courseId, user, reason }) => {
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  if (!isAdminRole(user.role)) {
    throw new ApiError(403, 'Only administrators can flag courses for review');
  }

  course.flaggedForReview = true;
  course.flagReviewReason = reason || 'Flagged for periodic review';
  course.flaggedAt = new Date();
  course.flaggedBy = user._id;

  await course.save();

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'flag_review',
    changes: { from: { flaggedForReview: false }, to: { flaggedForReview: true, flagReviewReason: course.flagReviewReason } },
    metadata: { status: course.status, reason: course.flagReviewReason }
  }).catch(err => console.error('Failed to log course review flag audit:', err));

  return {
    message: 'Course flagged for periodic review',
    data: course
  };
};

const updateThumbnail = async ({ courseId, file, user }) => {
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const { hasAccess } = checkOwnerOrAdmin({ course, user });
  if (!hasAccess) {
    throw new ApiError(403, 'Not authorized');
  }

  if (!file) {
    throw new ApiError(400, 'No file provided');
  }

  const imageUrl = await storageService.uploadCourseThumbnail({
    courseId,
    file
  });

  const oldThumb = course.thumbnailUrl;
  course.thumbnailUrl = imageUrl;
  await course.save();

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'thumbnail_update',
    changes: { from: { thumbnailUrl: oldThumb }, to: { thumbnailUrl: imageUrl } },
    metadata: { status: course.status, mode: 'direct_update' }
  });

  return {
    message: 'Thumbnail updated successfully',
    data: { thumbnailUrl: imageUrl }
  };
};

const getCourseAuditLogs = async ({ courseId, user }) => {
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new ApiError(404, 'Course not found');

  const { hasAccess } = checkOwnerOrAdmin({ course, user });
  if (!hasAccess) throw new ApiError(403, 'Not authorized');

  const logs = await auditService.getCourseLogs(courseId);

  return {
    message: 'Course audit logs retrieved successfully',
    data: logs
  };
};


// ======================================================
// EXPORTS
// ======================================================
const getTutorAnalytics = async ({ user, courseId }) => {
  const Course = require('../models/course.model');
  const Enrollment = require('../models/enrollment.model');
  const Progress = require('../models/progress.model');
  const Lesson = require('../models/lesson.model');
  const QuizAttempt = require('../models/quizAttempt.model');

  // 1. Fetch all courses owned by the tutor
  const courses = await Course.find({ authorId: user._id, deletedAt: null }).lean();
  if (courses.length === 0) {
    return {
      message: 'No courses found for this tutor',
      data: {
        courses: [],
        overallWatchTime: 0,
        engagementScore: 0,
        enrollmentTrend: [],
        courseStats: [],
        selectedCourseAnalytics: null
      }
    };
  }

  const courseIds = courses.map(c => c._id);

  // 2. Fetch enrollments, progress, and quiz attempts for tutor's courses
  const [enrollments, progressDocs, quizAttempts] = await Promise.all([
    Enrollment.find({ courseId: { $in: courseIds }, deletedAt: null }).lean(),
    Progress.find({ courseId: { $in: courseIds }, deletedAt: null }).lean(),
    QuizAttempt.find({ courseId: { $in: courseIds } }).lean()
  ]);

  // 3. Overall aggregated watch time (in hours)
  let totalSeconds = 0;
  progressDocs.forEach(p => {
    (p.videoProgress || []).forEach(vp => {
      totalSeconds += (vp.secondsWatched || 0);
    });
    (p.recordingProgress || []).forEach(rp => {
      totalSeconds += (rp.secondsWatched || 0);
    });
  });
  const overallWatchTime = parseFloat((totalSeconds / 3600).toFixed(1));

  // 4. Monthly enrollment trend (past 6 months)
  const enrollmentTrend = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    enrollmentTrend[monthStr] = 0;
  }

  enrollments.forEach(e => {
    const date = e.enrolledAt || e.createdAt;
    if (date) {
      const monthStr = new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (enrollmentTrend[monthStr] !== undefined) {
        enrollmentTrend[monthStr]++;
      }
    }
  });

  const trendData = Object.entries(enrollmentTrend).map(([month, count]) => ({
    month,
    enrollments: count
  }));

  // 5. Course overview completion rate list
  const courseStatsList = courses.map(course => {
    const courseIdStr = String(course._id);
    const courseEnrollments = enrollments.filter(e => String(e.courseId) === courseIdStr);
    const totalEnrolled = courseEnrollments.length;
    const completed = courseEnrollments.filter(e => e.status === 'completed' || e.progressPercentage === 100).length;

    const avgCompletionRate = totalEnrolled > 0
      ? Math.round((completed / totalEnrolled) * 100)
      : 0;

    return {
      courseId: course._id,
      title: course.title,
      enrollmentCount: totalEnrolled,
      avgCompletionRate
    };
  });

  // 6. Selected Course Analytics (defaults to first course if not selected)
  let selectedCourseId = courseId;
  if (!selectedCourseId && courses.length > 0) {
    selectedCourseId = String(courses[0]._id);
  }

  let selectedCourseAnalytics = null;
  if (selectedCourseId) {
    const targetCourse = courses.find(c => String(c._id) === String(selectedCourseId));
    if (targetCourse) {
      const courseLessons = await Lesson.find({ courseId: selectedCourseId, deletedAt: null }).sort({ order: 1 }).lean();
      const courseEnrollments = enrollments.filter(e => String(e.courseId) === String(selectedCourseId));
      const courseProgress = progressDocs.filter(p => String(p.courseId) === String(selectedCourseId));
      const courseQuizAttempts = quizAttempts.filter(q => String(q.courseId) === String(selectedCourseId));

      const totalEnrolled = courseEnrollments.length;

      // Calculate Per-lesson drop-off rate
      const lessonDropOffs = courseLessons.map((lesson, idx) => {
        const lessonIdStr = String(lesson._id);
        const completedCount = courseProgress.filter(p =>
          (p.completedLessons || []).map(id => String(id)).includes(lessonIdStr)
        ).length;

        const dropOffRate = totalEnrolled > 0
          ? Math.round(((totalEnrolled - completedCount) / totalEnrolled) * 100)
          : 0;

        return {
          lessonId: lesson._id,
          title: lesson.title,
          type: lesson.type,
          order: lesson.order || (idx + 1),
          completedCount,
          dropOffRate
        };
      });

      // Calculate Quiz Average Scores per quiz
      const courseQuizzes = courseLessons.filter(l => l.type === 'quiz');
      const quizStats = courseQuizzes.map(quiz => {
        const quizIdStr = String(quiz._id);
        const attempts = courseQuizAttempts.filter(a => String(a.lessonId) === quizIdStr);
        const avgScore = attempts.length > 0
          ? Math.round(attempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / attempts.length)
          : 0;

        return {
          lessonId: quiz._id,
          title: quiz.title,
          attemptsCount: attempts.length,
          avgScore
        };
      });

      // Total Watch Time for selected course (in hours)
      let selectedSeconds = 0;
      courseProgress.forEach(p => {
        (p.videoProgress || []).forEach(vp => {
          selectedSeconds += (vp.secondsWatched || 0);
        });
        (p.recordingProgress || []).forEach(rp => {
          selectedSeconds += (rp.secondsWatched || 0);
        });
      });
      const selectedWatchTime = parseFloat((selectedSeconds / 3600).toFixed(1));

      // Selected Course Completion Rate
      const selectedCompleted = courseEnrollments.filter(e => e.status === 'completed' || e.progressPercentage === 100).length;
      const selectedCompletionRate = totalEnrolled > 0
        ? Math.round((selectedCompleted / totalEnrolled) * 100)
        : 0;

      selectedCourseAnalytics = {
        courseId: selectedCourseId,
        title: targetCourse.title,
        enrollmentCount: totalEnrolled,
        completionRate: selectedCompletionRate,
        watchTimeHours: selectedWatchTime,
        lessonDropOffs,
        quizStats
      };
    }
  }

  // 7. Composite Student Engagement Score
  const totalEnrolled = enrollments.length;
  const activeInLast30Days = enrollments.filter(e => {
    if (!e.lastAccessedAt) return false;
    const diff = new Date() - new Date(e.lastAccessedAt);
    return diff < (30 * 24 * 60 * 60 * 1000);
  }).length;
  const activeRate = totalEnrolled > 0 ? (activeInLast30Days / totalEnrolled) * 100 : 0;

  const overallProgressAvg = enrollments.length > 0
    ? Math.round(enrollments.reduce((acc, curr) => acc + (curr.progressPercentage || 0), 0) / enrollments.length)
    : 0;

  const overallQuizAverage = quizAttempts.length > 0
    ? Math.round(quizAttempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / quizAttempts.length)
    : 0;

  const engagementScore = Math.round(
    (overallProgressAvg * 0.4) +
    (overallQuizAverage * 0.3) +
    (activeRate * 0.3)
  );

  return {
    message: 'Tutor analytics retrieved successfully',
    data: {
      courses: courses.map(c => ({ id: c._id, title: c.title })),
      overallWatchTime,
      engagementScore,
      enrollmentTrend: trendData,
      courseStats: courseStatsList,
      selectedCourseAnalytics
    }
  };
};

const submitCourseForReview = async ({ courseId, user }) => {
  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null
  });

  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  const { hasAccess } = checkOwnerOrAdmin({ course, user });
  if (!hasAccess) {
    throw new ApiError(403, 'Not authorized');
  }

  if (course.status === 'published') {
    throw new ApiError(400, 'Published courses cannot be submitted for review');
  }

  const oldStatus = course.status;
  course.status = 'review_pending';
  await course.save();

  await auditService.logCourseAction({
    courseId,
    userId: user._id,
    action: 'status_change',
    changes: { from: { status: oldStatus }, to: { status: 'review_pending' } },
    metadata: { status: 'review_pending' }
  }).catch(err => console.error('Failed to log course review submission audit:', err));

  try {
    const notificationService = require('./notification.service');
    await notificationService.triggerCourseReviewSubmittedAlert({ courseId: course._id.toString() });
  } catch (err) {
    console.error('[Notification Error] Failed to trigger course review submitted alert:', err.message);
  }

  return {
    message: 'Course submitted for review successfully',
    data: course
  };
};

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
  getMyCourses,
  getCourseStats,
  getAllCoursesAdmin,
  toggleFeatureCourse,
  suspendCourse,
  unsuspendCourse,
  deleteCourse,
  approveCourse,
  rejectCourseReview,
  flagCourseForReview,
  updateThumbnail,
  getCourseAuditLogs,
  getTutorAnalytics,
  submitCourseForReview
};
