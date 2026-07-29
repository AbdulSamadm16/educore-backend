const mongoose = require('mongoose');
const DiscussionPost = require('../models/discussionPost.model');
const DiscussionUnbanRequest = require('../models/discussionUnbanRequest.model');
const User = require('../models/user.model');
const Course = require('../models/course.model');
const Lesson = require('../models/lesson.model');
const Enrollment = require('../models/enrollment.model');
const notificationService = require('./notification.service');
const emailService = require('./email.service');
const { ApiError } = require('../utils/errors');
const { ADMIN_ROLES, isAdminRole } = require('../utils/roles');

/* ============================================================
   HELPERS
   ============================================================ */

/**
 * Strip dangerous HTML from markdown content (stored-XSS prevention).
 */
const sanitizeContent = (text) => {
  if (typeof text !== 'string') return text;
  let clean = text.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
  clean = clean.replace(/<iframe[^>]*>([\s\S]*?)<\/iframe>/gi, '');
  clean = clean.replace(/on\w+\s*=\s*(['"][^'"]*['"]|[^\s>]*)/gi, '');
  clean = clean.replace(/href\s*=\s*['"]javascript:[^'"]*['"]/gi, 'href="#"');
  return clean;
};

/**
 * Normalise a populated User reference to a safe author snapshot.
 */
const formatAuthor = (populatedUser) => {
  if (!populatedUser) return null;
  return {
    id: populatedUser._id?.toString() || populatedUser.id || String(populatedUser),
    name: populatedUser.name || 'Deleted User',
    avatarUrl: populatedUser.profile?.avatarUrl || null,
    role: populatedUser.role || 'learner'
  };
};

/* ============================================================
   USE CASE 1 / 2: CREATE POST OR REPLY
   ============================================================ */

const createPost = async ({ courseId, lessonId, parentId = null, authorId, content, image = null }) => {
  // 1. Verify author and ban status
  const author = await User.findById(authorId).select('name email isDiscussionBanned role').lean();
  if (!author) throw new ApiError(404, 'Author user not found', 'USER_NOT_FOUND');
  if (author.isDiscussionBanned) {
    throw new ApiError(403, 'You are banned from participating in discussions', 'DISCUSSION_BANNED');
  }

  // 2. Validate course exists
  const course = await Course.findOne({ _id: courseId, deletedAt: null }).select('title authorId').lean();
  if (!course) throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');

  // 3. Validate lesson exists AND belongs to this course (prevents cross-course injection)
  const lesson = await Lesson.findOne({ _id: lessonId, deletedAt: null }).select('title courseId').lean();
  if (!lesson) throw new ApiError(404, 'Lesson not found', 'LESSON_NOT_FOUND');
  if (String(lesson.courseId) !== String(courseId)) {
    throw new ApiError(400, 'Lesson does not belong to the specified course', 'LESSON_COURSE_MISMATCH');
  }

  // 4. Enrollment gate (learners only — tutors and admins bypass)
  const isAuthor = String(course.authorId) === String(authorId);
  const isAdmin = isAdminRole(author.role);

  if (!isAuthor && !isAdmin) {
    const enrollment = await Enrollment.findOne({
      userId: authorId,
      courseId,
      deletedAt: null,
      status: 'active'
    }).select('_id').lean();
    if (!enrollment) {
      throw new ApiError(403, 'You must be enrolled in this course to participate in discussions', 'ENROLLMENT_REQUIRED');
    }
  }

  // 5. Threaded reply validation (max 1 level deep)
  if (parentId) {
    const parentPost = await DiscussionPost.findOne({ _id: parentId, deletedAt: null, isRemoved: false }).lean();
    if (!parentPost) throw new ApiError(404, 'Parent post not found', 'PARENT_POST_NOT_FOUND');
    if (parentPost.parentId) {
      throw new ApiError(400, 'Replies are limited to a single level', 'NESTED_REPLIES_NOT_ALLOWED');
    }
  }

  // 6. Image attachment validation
  if (image) {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!image.fileUrl) throw new ApiError(400, 'Image fileUrl is required', 'IMAGE_URL_REQUIRED');
    if (!image.mimeType || !allowedMimeTypes.includes(image.mimeType)) {
      throw new ApiError(400, 'Unsupported image type. Allowed: JPEG, PNG, WEBP, GIF.', 'INVALID_IMAGE_TYPE');
    }
    if (image.size && image.size > 5 * 1024 * 1024) {
      throw new ApiError(400, 'Image size exceeds the 5MB limit.', 'IMAGE_TOO_LARGE');
    }
  }

  // 7. Create post
  const newPost = await DiscussionPost.create({
    courseId,
    lessonId,
    parentId,
    authorId,
    content: sanitizeContent(content),
    image
  });

  // 8. Populate and return
  const populatedPost = await DiscussionPost.findById(newPost._id)
    .populate('authorId', 'name profile.avatarUrl role')
    .lean();

  // 9. Fire-and-forget notifications
  if (!parentId) {
    // Top-level question → notify course tutor
    const tutorId = course.authorId;
    if (tutorId && String(tutorId) !== String(authorId)) {
      const tutor = await User.findById(tutorId).select('name email notificationSettings').lean();
      if (tutor) {
        const settings = tutor.notificationSettings?.discussionActivity || { email: true, inApp: true };
        if (settings.inApp !== false) {
          await notificationService.createNotification({
            userId: tutorId.toString(),
            title: 'New Question Posted',
            message: `"${author.name}" asked a question in "${lesson.title}": "${content.slice(0, 60)}${content.length > 60 ? '...' : ''}"`,
            type: 'discussion',
            metadata: { courseId: courseId.toString(), lessonId: lessonId.toString(), postId: newPost._id.toString() }
          });
        }
        if (settings.email !== false && tutor.email) {
          try {
            await emailService.sendNewQuestionAlertEmail({
              to: tutor.email,
              tutorName: tutor.name,
              studentName: author.name,
              courseTitle: course.title,
              lessonTitle: lesson.title,
              questionContent: content
            });
          } catch (mailErr) {
            console.error('[Discussion] Tutor alert email failed:', mailErr.message);
          }
        }
      }
    }
  } else {
    // Reply → notify question author
    const parentPost = await DiscussionPost.findById(parentId).select('authorId').lean();
    if (parentPost && String(parentPost.authorId) !== String(authorId)) {
      const questionAuthorId = parentPost.authorId;
      const questionAuthor = await User.findById(questionAuthorId).select('name email notificationSettings').lean();
      if (questionAuthor) {
        const settings = questionAuthor.notificationSettings?.discussionActivity || { email: true, inApp: true };
        if (settings.inApp !== false) {
          await notificationService.createNotification({
            userId: questionAuthorId.toString(),
            title: 'New Reply Posted',
            message: `"${author.name}" replied to your question: "${content.slice(0, 60)}${content.length > 60 ? '...' : ''}"`,
            type: 'discussion',
            metadata: { courseId: courseId.toString(), lessonId: lessonId.toString(), postId: parentId.toString() }
          });
        }
        if (settings.email !== false && questionAuthor.email) {
          try {
            await emailService.sendNewReplyAlertEmail({
              to: questionAuthor.email,
              studentName: questionAuthor.name,
              replierName: author.name,
              courseTitle: course.title,
              lessonTitle: lesson.title,
              replyContent: content
            });
          } catch (mailErr) {
            console.error('[Discussion] Reply alert email failed:', mailErr.message);
          }
        }
      }
    }
  }

  const formattedPost = { ...populatedPost };
  if (populatedPost && populatedPost.authorId) {
    formattedPost.author = formatAuthor(populatedPost.authorId);
    delete formattedPost.authorId;
  }
  return formattedPost;
};

/* ============================================================
   USE CASE 1 / 3: GET DISCUSSION POSTS FOR A LESSON
   Includes full viewerState with 8 capability flags.
   ============================================================ */

const getDiscussionPosts = async ({ lessonId, sortBy = 'recent', page = 1, limit = 10, currentUserId }) => {
  // 0. Resolve lesson and course
  const lesson = await Lesson.findOne({ _id: lessonId, deletedAt: null }).select('courseId').lean();
  if (!lesson) throw new ApiError(404, 'Lesson not found', 'LESSON_NOT_FOUND');

  const courseId = lesson.courseId;
  const course = await Course.findById(courseId).select('authorId').lean();
  if (!course) throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');

  // 1. Authentication required
  if (!currentUserId) {
    throw new ApiError(401, 'Authentication required to access discussions', 'AUTH_REQUIRED');
  }

  const currentUser = await User.findById(currentUserId).select('role isDiscussionBanned').lean();
  if (!currentUser) {
    throw new ApiError(401, 'User account not found', 'USER_NOT_FOUND');
  }

  // 2. Derive caller's privilege level (used for viewerState computation)
  const isTutor = String(course.authorId) === String(currentUserId);
  const isAdmin = isAdminRole(currentUser.role);

  // 3. Enrollment gate
  if (!isTutor && !isAdmin) {
    const enrollment = await Enrollment.findOne({
      userId: currentUserId,
      courseId,
      deletedAt: null,
      status: 'active'
    }).select('_id').lean();
    if (!enrollment) {
      throw new ApiError(403, 'You must be enrolled in this course to view discussions', 'ENROLLMENT_REQUIRED');
    }
  }

  // 4. Pagination & sort
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 10;
  const skip = (parsedPage - 1) * parsedLimit;

  // Pinned posts always appear first regardless of sortBy
  let sortCriteria = { isPinned: -1 };
  if (sortBy === 'popular') {
    sortCriteria.upvoteCount = -1;
    sortCriteria.createdAt = -1;
  } else {
    // default: 'recent'
    sortCriteria.createdAt = -1;
  }

  // 5. Thread Continuum Protection: deleted posts with active replies remain visible
  const basePipeline = [
    {
      $match: {
        lessonId: new mongoose.Types.ObjectId(lessonId),
        parentId: null
      }
    },
    {
      $lookup: {
        from: 'discussionposts',
        let: { postId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$parentId', '$$postId'] },
                  { $eq: ['$deletedAt', null] }
                ]
              }
            }
          }
        ],
        as: 'activeReplies'
      }
    },
    {
      $addFields: { activeRepliesCount: { $size: '$activeReplies' } }
    },
    {
      $match: {
        $or: [
          { deletedAt: null },
          { deletedAt: { $ne: null }, activeRepliesCount: { $gt: 0 } }
        ]
      }
    }
  ];

  // 6. Fetch posts + total count in parallel
  const [rawPosts, countResult] = await Promise.all([
    DiscussionPost.aggregate([
      ...basePipeline,
      { $sort: sortCriteria },
      { $skip: skip },
      { $limit: parsedLimit }
    ]),
    DiscussionPost.aggregate([...basePipeline, { $count: 'total' }])
  ]);

  const total = countResult[0]?.total || 0;

  const topLevelPosts = await DiscussionPost.populate(rawPosts, {
    path: 'authorId',
    select: 'name profile.avatarUrl role'
  });

  const postIds = topLevelPosts.map(p => p._id);

  // 7. Fetch all replies for the returned posts (sorted chronologically)
  const allReplies = await DiscussionPost.find({
    parentId: { $in: postIds },
    deletedAt: null
  })
    .sort({ createdAt: 1 })
    .populate('authorId', 'name profile.avatarUrl role')
    .lean();

  // 8. viewerState builder — computes all 8 capability flags server-side
  //    so the frontend never has to re-derive permissions.
  const currentUserIdStr = String(currentUserId);

  const buildViewerState = ({
    authorIdStr,
    upvotes = [],
    reports = [],
    isRemoved = false,
    deletedAt = null,
    isReply = false
  }) => {
    const isPostAuthor = authorIdStr === currentUserIdStr;
    const isActive = !isRemoved && !deletedAt;
    const hasUpvoted = upvotes.map(id => String(id)).includes(currentUserIdStr);
    // canReport: must not have already reported this specific post
    const alreadyReported = reports.some(r => String(r.reporterId) === currentUserIdStr);

    return {
      // State flags
      hasUpvoted,
      isAuthor: isPostAuthor,

      // Action capability flags
      canEdit: isPostAuthor && isActive,
      canDelete: isActive && (isPostAuthor || isTutor || isAdmin),
      canPin: !isReply && isActive && (isTutor || isAdmin),
      canMarkOfficial: isReply && isActive && (isTutor || isAdmin),

      // canUpvote: active post, not own, not already voted
      canUpvote: isActive && !isPostAuthor && !hasUpvoted,

      // canReport: active post, not own, not already reported by this user
      canReport: isActive && !isPostAuthor && !alreadyReported
    };
  };

  // 9. Build reply map grouped by parentId
  const replyMap = new Map();

  allReplies.forEach(reply => {
    const pId = String(reply.parentId);
    if (!replyMap.has(pId)) replyMap.set(pId, []);

    const cleanReply = { ...reply };

    // Tombstone redaction for removed replies
    if (cleanReply.isRemoved) {
      cleanReply.content = 'This post was removed by a moderator';
      cleanReply.image = null;
    }

    // Extract authorId string BEFORE formatting (needed for viewerState)
    const replyAuthorIdStr = reply.authorId?._id
      ? String(reply.authorId._id)
      : String(reply.authorId || '');

    cleanReply.author = formatAuthor(reply.authorId);
    delete cleanReply.authorId;

    // Full viewerState
    cleanReply.viewerState = buildViewerState({
      authorIdStr: replyAuthorIdStr,
      upvotes: cleanReply.upvotes || [],
      reports: cleanReply.reports || [],
      isRemoved: cleanReply.isRemoved,
      deletedAt: cleanReply.deletedAt,
      isReply: true
    });

    // isOfficial placeholder — resolved against parent below
    cleanReply.isOfficial = false;

    // Strip sensitive moderation internals from non-admin responses
    if (!isAdmin) {
      delete cleanReply.reports;
      delete cleanReply.removedBy;
      delete cleanReply.removalReason;
      delete cleanReply.removedAt;
    }

    replyMap.get(pId).push(cleanReply);
  });

  // 10. Assemble final posts array
  const processedPosts = topLevelPosts.map(post => {
    const cleanPost = { ...post };

    // Tombstone redaction for removed/deleted top-level posts
    if (cleanPost.isRemoved) {
      cleanPost.content = 'This post was removed by a moderator';
      cleanPost.image = null;
    } else if (cleanPost.deletedAt) {
      cleanPost.content = 'This post was deleted by the author';
      cleanPost.image = null;
    }

    // Extract authorId string BEFORE formatting
    const postAuthorIdStr = post.authorId?._id
      ? String(post.authorId._id)
      : String(post.authorId || '');

    cleanPost.author = formatAuthor(post.authorId);
    delete cleanPost.authorId;

    // Resolve official answer flag on replies
    const repliesList = replyMap.get(String(post._id)) || [];
    const officialIdStr = post.officialAnswerId ? String(post.officialAnswerId) : null;
    const finalReplies = repliesList.map(r => {
      r.isOfficial = !!(officialIdStr && (String(r._id) === officialIdStr || String(r.id) === officialIdStr));
      return r;
    });

    cleanPost.replies = finalReplies;
    cleanPost.repliesCount = finalReplies.length;

    // Full viewerState
    cleanPost.viewerState = buildViewerState({
      authorIdStr: postAuthorIdStr,
      upvotes: cleanPost.upvotes || [],
      reports: cleanPost.reports || [],
      isRemoved: cleanPost.isRemoved,
      deletedAt: cleanPost.deletedAt,
      isReply: false
    });

    // Strip sensitive moderation internals from non-admin responses
    if (!isAdmin) {
      delete cleanPost.reports;
      delete cleanPost.removedBy;
      delete cleanPost.removalReason;
      delete cleanPost.removedAt;
    }

    return cleanPost;
  });

  return {
    posts: processedPosts,
    isDiscussionBanned: !!currentUser.isDiscussionBanned,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      pages: Math.ceil(total / parsedLimit)
    }
  };
};

/* ============================================================
   USE CASE 3: UPVOTE A POST
   ============================================================ */

const upvotePost = async (postId, userId) => {
  // isRemoved posts cannot be upvoted
  const post = await DiscussionPost.findOne({ _id: postId, deletedAt: null, isRemoved: false });
  if (!post) throw new ApiError(404, 'Post not found', 'POST_NOT_FOUND');

  // Self-upvote guard (US-DISC-003)
  if (String(post.authorId) === String(userId)) {
    throw new ApiError(400, 'Learner cannot upvote their own post', 'CANNOT_UPVOTE_OWN_POST');
  }

  // Atomic upsert — prevents race-condition double-counting
  const updatedPost = await DiscussionPost.findOneAndUpdate(
    { _id: postId, upvotes: { $ne: userId } },
    { $addToSet: { upvotes: userId }, $inc: { upvoteCount: 1 } },
    { new: true }
  );

  return updatedPost || post;
};

/* ============================================================
   USE CASE 3: REMOVE UPVOTE
   ============================================================ */

const removeUpvote = async (postId, userId) => {
  const post = await DiscussionPost.findOne({ _id: postId, deletedAt: null, isRemoved: false });
  if (!post) throw new ApiError(404, 'Post not found', 'POST_NOT_FOUND');

  const updatedPost = await DiscussionPost.findOneAndUpdate(
    { _id: postId, upvotes: userId },
    { $pull: { upvotes: userId }, $inc: { upvoteCount: -1 } },
    { new: true }
  );

  return updatedPost || post;
};

/* ============================================================
   USE CASE 1: EDIT POST CONTENT (author only)
   ============================================================ */

const editPost = async (postId, userId, userRole, content) => {
  // Ban check — banned users cannot edit existing posts either
  const user = await User.findById(userId).select('isDiscussionBanned').lean();
  if (user?.isDiscussionBanned) {
    throw new ApiError(403, 'You are banned from participating in discussions', 'DISCUSSION_BANNED');
  }

  const post = await DiscussionPost.findOne({ _id: postId, deletedAt: null });
  if (!post) throw new ApiError(404, 'Post not found', 'POST_NOT_FOUND');

  // Cannot edit a post the admin has already removed
  if (post.isRemoved) {
    throw new ApiError(403, 'Cannot edit a post that has been removed by a moderator', 'POST_REMOVED');
  }

  // Only the author may edit
  const isAuthor = String(post.authorId) === String(userId);
  if (!isAuthor) {
    throw new ApiError(403, 'Not authorized to edit this post', 'ACCESS_DENIED');
  }

  post.content = sanitizeContent(content);
  await post.save();

  return post;
};

/* ============================================================
   USE CASE 2: PIN / UNPIN (tutor or admin)
   ============================================================ */

const togglePinPost = async (postId, userId, userRole, isPinned) => {
  const post = await DiscussionPost.findOne({ _id: postId, deletedAt: null, isRemoved: false });
  if (!post) throw new ApiError(404, 'Post not found', 'POST_NOT_FOUND');

  // Only top-level posts can be pinned — replies don't have pin semantics
  if (post.parentId) {
    throw new ApiError(400, 'Only top-level posts can be pinned', 'PIN_ON_REPLY_NOT_ALLOWED');
  }

  const course = await Course.findById(post.courseId).select('authorId').lean();
  const isTutor = course && String(course.authorId) === String(userId);
  const isAdmin = isAdminRole(userRole);

  if (!isTutor && !isAdmin) {
    throw new ApiError(403, 'Only the course tutor or an admin can pin posts', 'ACCESS_DENIED');
  }

  post.isPinned = !!isPinned;
  await post.save();

  return post;
};

/* ============================================================
   USE CASE 2: MARK OFFICIAL ANSWER (tutor or admin)
   ============================================================ */

const markOfficialAnswer = async (postId, replyId, userId, userRole) => {
  const post = await DiscussionPost.findOne({ _id: postId, deletedAt: null, isRemoved: false });
  if (!post) throw new ApiError(404, 'Parent post not found', 'POST_NOT_FOUND');

  const course = await Course.findById(post.courseId).select('authorId').lean();
  const isTutor = course && String(course.authorId) === String(userId);
  const isAdmin = isAdminRole(userRole);

  if (!isTutor && !isAdmin) {
    throw new ApiError(403, 'Only the course tutor or an admin can mark official answers', 'ACCESS_DENIED');
  }

  if (replyId) {
    // Validate the reply exists, belongs to this parent, and is not removed
    const reply = await DiscussionPost.findOne({
      _id: replyId,
      parentId: postId,
      deletedAt: null,
      isRemoved: false
    }).lean();
    if (!reply) {
      throw new ApiError(404, 'Reply not found or does not belong to this post', 'REPLY_NOT_FOUND');
    }
    post.officialAnswerId = replyId;
  } else {
    // Unmark official answer
    post.officialAnswerId = null;
  }

  await post.save();
  return post;
};

/* ============================================================
   USE CASE 1 / 2: SOFT DELETE POST
   ============================================================ */

const deletePost = async (postId, userId, userRole) => {
  const post = await DiscussionPost.findOne({ _id: postId, deletedAt: null });
  if (!post) throw new ApiError(404, 'Post not found', 'POST_NOT_FOUND');

  const course = await Course.findById(post.courseId).select('authorId').lean();
  const isTutor = course && String(course.authorId) === String(userId);
  const isAuthor = String(post.authorId) === String(userId);
  const isAdmin = isAdminRole(userRole);

  if (!isAuthor && !isTutor && !isAdmin) {
    throw new ApiError(403, 'Not authorized to delete this post', 'ACCESS_DENIED');
  }

  // Author self-delete vs moderator removal
  if (isAuthor && !isTutor && !isAdmin) {
    post.deletedAt = new Date();
  } else {
    post.isRemoved = true;
    post.removalReason = 'Inappropriate content';
    post.removedBy = userId;
    post.removedAt = new Date();
  }

  await post.save();

  // If this reply was the official answer, clear the reference on the parent post
  if (post.parentId) {
    await DiscussionPost.updateOne(
      { _id: post.parentId, officialAnswerId: post._id },
      { $set: { officialAnswerId: null } }
    );
  }

  return post;
};

/* ============================================================
   USE CASE 3 / 4: REPORT A POST
   ============================================================ */

const reportPost = async (postId, reporterId, reason) => {
  const post = await DiscussionPost.findOne({ _id: postId, deletedAt: null, isRemoved: false });
  if (!post) throw new ApiError(404, 'Post not found', 'POST_NOT_FOUND');

  // Cannot report your own post
  if (String(post.authorId) === String(reporterId)) {
    throw new ApiError(400, 'You cannot report your own post', 'CANNOT_REPORT_OWN_POST');
  }

  // Idempotent — silently ignore duplicate reports from the same user
  const alreadyReported = post.reports.some(r => String(r.reporterId) === String(reporterId));
  if (alreadyReported) return post;

  // Track whether this is the very first report so we only notify the tutor once per post
  const isFirstReport = post.reports.length === 0;

  post.reports.push({ reporterId, reason, createdAt: new Date() });
  post.isReported = true;
  await post.save();

  // Notify the course tutor only on the FIRST report (not on every additional report)
  if (isFirstReport) {
    try {
      const [course, lesson, reporter] = await Promise.all([
        Course.findById(post.courseId).select('title authorId').lean(),
        Lesson.findById(post.lessonId).select('title').lean(),
        User.findById(reporterId).select('name').lean()
      ]);

      if (course && course.authorId) {
        const tutor = await User.findById(course.authorId)
          .select('name email notificationSettings institutionId')
          .lean();

        const postSnippet = post.content.slice(0, 120) + (post.content.length > 120 ? '...' : '');

        // 1. Notify the Course Tutor
        if (tutor) {
          const settings = tutor.notificationSettings?.discussionActivity || { email: true, inApp: true };

          // In-app notification
          if (settings.inApp !== false) {
            await notificationService.createNotification({
              userId: tutor._id.toString(),
              title: '⚠️ Post Reported in Your Course',
              message: `A post in "${lesson?.title || 'a lesson'}" of "${course.title}" was reported by "${reporter?.name || 'a student'}". Reason: "${reason || 'none'}". Please review it.`,
              type: 'discussion',
              metadata: {
                courseId: post.courseId.toString(),
                lessonId: post.lessonId.toString(),
                postId: post._id.toString()
              }
            });
          }

          // Email notification
          if (settings.email !== false && tutor.email) {
            await emailService.sendReportAlertEmail({
              to: tutor.email,
              tutorName: tutor.name,
              reporterName: reporter?.name || 'A student',
              courseTitle: course.title,
              lessonTitle: lesson?.title || 'Unknown Lesson',
              postContent: postSnippet,
              reason: reason || 'No reason provided'
            });
          }
        }

        // 2. Notify Relevant Admins (Institutional Admins & Platform Owners)
        let adminQuery = {
          role: { $in: ADMIN_ROLES },
          deletedAt: null
        };
        if (tutor && tutor.institutionId) {
          adminQuery = {
            deletedAt: null,
            $or: [
              { role: 'platform_owner' },
              { role: { $in: ADMIN_ROLES }, institutionId: tutor.institutionId }
            ]
          };
        }

        const admins = await User.find(adminQuery).select('name email role').lean();
        for (const admin of admins) {
          if (['institution_admin', 'admin'].includes(admin.role)) {
            continue;
          }
          if (admin.email) {
            try {
              await emailService.sendAdminReportAlertEmail({
                to: admin.email,
                adminName: admin.name,
                reporterName: reporter?.name || 'A student',
                courseTitle: course.title,
                lessonTitle: lesson?.title || 'Unknown Lesson',
                postContent: postSnippet,
                reason: reason || 'No reason provided'
              });
            } catch (adminMailErr) {
              console.error(`[Discussion] Admin email alert failed for ${admin.email}:`, adminMailErr.message);
            }
          }
        }
      }
    } catch (notifyErr) {
      // Fire-and-forget — a notification failure must never break the report itself
      console.error('[Discussion] Tutor report alert failed:', notifyErr.message);
    }
  }

  return post;
};

/* ============================================================
   USE CASE 4 (Admin): LIST REPORTED POSTS — MODERATION QUEUE
   ============================================================ */

const getReportedPostsAdmin = async ({ page = 1, limit = 10 }) => {
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 10;
  const skip = (parsedPage - 1) * parsedLimit;

  const [posts, total] = await Promise.all([
    DiscussionPost.find({ isReported: true, isRemoved: false, deletedAt: null })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('authorId', 'name email role')
      .populate('reports.reporterId', 'name email')
      .lean(),
    DiscussionPost.countDocuments({ isReported: true, isRemoved: false, deletedAt: null })
  ]);

  const formattedPosts = posts.map(post => {
    const cleanPost = { ...post };

    cleanPost.author = formatAuthor(post.authorId);
    delete cleanPost.authorId;

    if (post.reports && Array.isArray(post.reports)) {
      cleanPost.reports = post.reports.map(rep => {
        const cleanRep = { ...rep };
        if (rep.reporterId) {
          cleanRep.reporter = {
            id: rep.reporterId._id?.toString() || rep.reporterId.id || String(rep.reporterId),
            name: rep.reporterId.name || 'Deleted User',
            email: rep.reporterId.email || ''
          };
          delete cleanRep.reporterId;
        }
        return cleanRep;
      });
    }

    return cleanPost;
  });

  return {
    posts: formattedPosts,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      pages: Math.ceil(total / parsedLimit)
    }
  };
};

/* ============================================================
   USE CASE 4 (Admin): REMOVE A POST WITH REASON
   ============================================================ */

const adminRemovePost = async (postId, adminId, reason) => {
  const post = await DiscussionPost.findOne({ _id: postId, deletedAt: null });
  if (!post) throw new ApiError(404, 'Post not found', 'POST_NOT_FOUND');

  // Idempotent — if already removed, just return the existing record
  if (post.isRemoved) return post;

  post.isRemoved = true;
  post.removalReason = reason;
  post.removedBy = adminId;
  post.removedAt = new Date();

  // Also clear the report queue for this post since the admin has acted on it
  post.reports = [];
  post.isReported = false;

  await post.save();

  // If this reply was the official answer, clear it from the parent
  if (post.parentId) {
    await DiscussionPost.updateOne(
      { _id: post.parentId, officialAnswerId: post._id },
      { $set: { officialAnswerId: null } }
    );
  }

  return post;
};

/* ============================================================
   USE CASE 4 (Admin): DISMISS REPORTS (no violation found)
   Clears the report queue without removing the post.
   ============================================================ */

const dismissReports = async (postId, adminId) => {
  const post = await DiscussionPost.findOne({ _id: postId });
  if (!post) throw new ApiError(404, 'Post not found', 'POST_NOT_FOUND');

  // If the post is already removed there is nothing to dismiss
  if (post.isRemoved) {
    throw new ApiError(400, 'Cannot dismiss reports on a post that has already been removed', 'POST_ALREADY_REMOVED');
  }

  post.reports = [];
  post.isReported = false;
  await post.save();

  return post;
};

/* ============================================================
   USE CASE 4 (Admin): WARN A USER
   ============================================================ */

const adminWarnUser = async (userId, adminId, reason, postContent = null) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

  const snippet = postContent && typeof postContent === 'string'
    ? postContent.slice(0, 80) + (postContent.length > 80 ? '...' : '')
    : null;

  user.discussionWarnings.push({
    reason,
    warnedBy: adminId,
    warnedAt: new Date(),
    postContentSnippet: snippet
  });

  await user.save();

  try {
    const postText = snippet ? ` regarding your post: "${snippet}"` : '';
    await notificationService.createNotification({
      userId: userId.toString(),
      title: 'Discussion Warning Issued',
      message: `You have received a warning from moderation${postText}. Reason: "${reason}". Repeated violations may lead to suspension of privileges.`,
      type: 'system',
      metadata: { action: 'warning', reason, postContentSnippet: snippet }
    });
  } catch (notifErr) {
    console.error('[Discussion] Failed to send warning notification:', notifErr.message);
  }

  return user;
};

/* ============================================================
   USE CASE 4 (Admin): BAN / UNBAN A USER FROM DISCUSSIONS
   ============================================================ */

const adminBanUser = async (userId, isBanned) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

  user.isDiscussionBanned = !!isBanned;
  await user.save();

  try {
    await notificationService.createNotification({
      userId: userId.toString(),
      title: isBanned ? 'Discussion Privileges Suspended' : 'Discussion Privileges Restored',
      message: isBanned
        ? 'Your discussion access has been suspended by a moderator due to policy violations.'
        : 'Your discussion access has been restored. You can now post and reply in course Q&A.',
      type: 'system',
      metadata: { action: 'ban_status_change', isBanned }
    });
  } catch (notifErr) {
    console.error('[Discussion] Failed to create ban status notification:', notifErr.message);
  }

  return user;
};

/* ============================================================
   APOLOGY & UNBAN REQUEST SERVICES
   ============================================================ */

const createUnbanRequest = async ({ userId, apology }) => {
  const user = await User.findById(userId).select('isDiscussionBanned').lean();
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  if (!user.isDiscussionBanned) {
    throw new ApiError(400, 'User is not currently banned from discussions', 'NOT_BANNED');
  }

  if (!apology || apology.trim().length === 0) {
    throw new ApiError(400, 'Apology message is required', 'APOLOGY_REQUIRED');
  }
  if (apology.length > 1000) {
    throw new ApiError(400, 'Apology exceeds 1000 characters limit', 'APOLOGY_TOO_LONG');
  }

  const request = await DiscussionUnbanRequest.findOneAndUpdate(
    { userId },
    {
      apology: apology.trim(),
      status: 'pending',
      adminNotes: null,
      resolvedBy: null,
      resolvedAt: null
    },
    { upsert: true, new: true }
  );

  return request;
};

const getMyUnbanRequestStatus = async (userId) => {
  const request = await DiscussionUnbanRequest.findOne({ userId }).lean();
  return request || null;
};

const getUnbanRequestsAdmin = async ({ page = 1, limit = 20 } = {}) => {
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [requests, total] = await Promise.all([
    DiscussionUnbanRequest.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('userId', 'name email role')
      .lean(),
    DiscussionUnbanRequest.countDocuments({ status: 'pending' })
  ]);

  const formattedRequests = requests.map(req => {
    const clean = { ...req };
    if (req.userId) {
      clean.user = {
        id: req.userId._id?.toString() || req.userId.id || String(req.userId),
        name: req.userId.name || 'Deleted User',
        email: req.userId.email || '',
        role: req.userId.role || 'learner'
      };
      delete clean.userId;
    }
    return clean;
  });

  return {
    requests: formattedRequests,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      pages: Math.ceil(total / parsedLimit)
    }
  };
};

const resolveUnbanRequestAdmin = async ({ requestId, adminId, status, adminNotes = '' }) => {
  if (!['approved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'Invalid resolution status. Must be approved or rejected', 'INVALID_STATUS');
  }

  const request = await DiscussionUnbanRequest.findById(requestId);
  if (!request) {
    throw new ApiError(404, 'Unban request not found', 'REQUEST_NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new ApiError(400, 'This request has already been resolved', 'ALREADY_RESOLVED');
  }

  request.status = status;
  request.adminNotes = adminNotes ? adminNotes.trim() : null;
  request.resolvedBy = adminId;
  request.resolvedAt = new Date();
  await request.save();

  if (status === 'approved') {
    await User.updateOne({ _id: request.userId }, { $set: { isDiscussionBanned: false } });

    try {
      await notificationService.createNotification({
        userId: request.userId.toString(),
        title: 'Discussion Privileges Restored',
        message: `Your unban request was approved by administration. Notes: "${adminNotes || 'Welcome back to discussions!'}". You can now post and reply in Q&A boards.`,
        type: 'system',
        metadata: { action: 'unban_approved', notes: adminNotes }
      });
    } catch (notifErr) {
      console.error('[Discussion] Failed to send unban approved notification:', notifErr.message);
    }
  } else {
    try {
      await notificationService.createNotification({
        userId: request.userId.toString(),
        title: 'Unban Request Rejected',
        message: `Your discussion appeal has been rejected. Feedback: "${adminNotes || 'Please adhere to the community guidelines.'}".`,
        type: 'system',
        metadata: { action: 'unban_rejected', notes: adminNotes }
      });
    } catch (notifErr) {
      console.error('[Discussion] Failed to send unban rejected notification:', notifErr.message);
    }
  }

  return request;
};

/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {
  createPost,
  getDiscussionPosts,
  upvotePost,
  removeUpvote,
  editPost,
  togglePinPost,
  markOfficialAnswer,
  deletePost,
  reportPost,
  getReportedPostsAdmin,
  adminRemovePost,
  dismissReports,
  adminWarnUser,
  adminBanUser,
  createUnbanRequest,
  getMyUnbanRequestStatus,
  getUnbanRequestsAdmin,
  resolveUnbanRequestAdmin
};
