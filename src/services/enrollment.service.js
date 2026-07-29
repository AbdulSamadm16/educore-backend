const Course = require('../models/course.model');
const Enrollment = require('../models/enrollment.model');
const Progress = require('../models/progress.model');
const Module = require('../models/module.model');
const { ApiError } = require('../utils/errors');


// ======================================================
// ENROLL IN COURSE
// ======================================================
const enrollCourse = async ({ userId, courseId, billingAddress, billingPhone }) => {

  const course = await Course.findOne({
    _id: courseId,
    deletedAt: null,
    status: 'published'
  })
    .select('title authorId isFree price currency certificateEnabled')
    .lean();

  if (!course) {
    throw new ApiError(
      404,
      'Course not found',
      'COURSE_NOT_FOUND'
    );
  }

  const existingEnrollment = await Enrollment.findOne({
    userId,
    courseId,
    deletedAt: null
  }).lean();

  if (existingEnrollment) {
    if (existingEnrollment.status === 'active' || existingEnrollment.status === 'completed') {
      throw new ApiError(
        409,
        'Already enrolled in this course',
        'COURSE_ALREADY_ENROLLED'
      );
    }
  }

  let enrollmentType = 'free';
  let paymentStatus = 'not_required';
  let status = 'active';
  let razorpayOrder = null;

  if (!course.isFree && course.price > 0) {
    enrollmentType = 'paid';
    paymentStatus = 'pending';
    status = 'pending_payment';

    const razorpay = require('../config/razorpay');
    try {
      const orderOptions = {
        amount: Math.round(course.price * 100), // amount in paise
        currency: course.currency || 'INR',
        receipt: `rcpt_${userId.toString().slice(-6)}_${courseId.toString().slice(-6)}_${Date.now().toString().slice(-4)}`
      };
      razorpayOrder = await razorpay.orders.create(orderOptions);
    } catch (error) {
      console.error('[Razorpay Error] Failed to create order:', error);
      throw new ApiError(500, 'Failed to initialize payment gateway');
    }
  }

  // If there's an existing pending enrollment, just return the new order for them to pay
  if (existingEnrollment && existingEnrollment.status === 'pending_payment') {
    // Save the new razorpayOrder.id and updated billing info to the existing pending enrollment
    await Enrollment.updateOne(
      { _id: existingEnrollment._id },
      {
        $set: {
          paymentReference: razorpayOrder.id,
          billingAddress: billingAddress || existingEnrollment.billingAddress,
          billingPhone: billingPhone || existingEnrollment.billingPhone
        }
      }
    );
    return {
      message: 'Payment order initiated',
      data: {
        enrollment: existingEnrollment,
        razorpayOrder
      }
    };
  }

  const enrollment = await Enrollment.create({
    userId,
    courseId,
    status,
    enrollmentType,
    paymentStatus,
    amountPaid: course.isFree ? 0 : course.price,
    currency: course.currency,
    paymentReference: razorpayOrder ? razorpayOrder.id : null,
    billingAddress,
    billingPhone,
    certificateEligible: course.certificateEnabled || false
  });

  // Only initialize progress and increment count if it's a FREE course (active)
  // For paid courses, this will happen in the Razorpay Webhook after success.
  if (status === 'active') {
    await Progress.create({
      userId,
      courseId,
      completedLessons: []
    });

    await Course.updateOne(
      { _id: courseId },
      { $inc: { enrollmentCount: 1 } }
    );
  }

  // Notify course Author/Tutor & Learner ONLY if active (free courses)
  if (status === 'active') {
    if (course.authorId) {
      try {
        const { triggerNewEnrollmentNotification } = require('./notification.service');
        await triggerNewEnrollmentNotification({ studentId: userId, courseId });
      } catch (notifErr) {
        console.error('[Notification Error] Failed to trigger tutor enrollment notification:', notifErr.message);
      }
    }

    try {
      const { triggerEnrollmentConfirmedNotification } = require('./notification.service');
      await triggerEnrollmentConfirmedNotification({ studentId: userId, courseId });
    } catch (notifErr) {
      console.error('[Notification Error] Failed to trigger learner enrollment confirmation notification:', notifErr.message);
    }
  }

  return {
    message: status === 'pending_payment' ? 'Payment order initiated' : 'Course enrolled successfully',
    data: {
      enrollment,
      razorpayOrder
    }
  };
};


// ======================================================
// MY ENROLLMENTS
// ======================================================
const getMyEnrollments = async ({ userId, query }) => {

  const page = parseInt(query?.page, 10) || 1;
  const limit = parseInt(query?.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {
    userId,
    deletedAt: null
  };

  if (query?.status) {
    filter.status = query.status;
  }

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate({
        path: 'courseId',
        match: { deletedAt: null },
        select: `
          title slug thumbnailUrl category level
          averageRating reviewCount enrollmentCount
          durationInMinutes totalModules totalLessons
          authorSnapshot status
        `
      })
      .sort({ enrolledAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Enrollment.countDocuments(filter)
  ]);

  // Filter out enrollments where course was deleted
  const filteredEnrollments = enrollments
    .filter((item) => item && item.courseId)
    .map((item) => {
      const enrollment = { ...item };
      enrollment.course = enrollment.courseId;
      delete enrollment.courseId;
      return enrollment;
    });

  return {
    message: 'Enrollments retrieved successfully',
    data: {
      enrollments: filteredEnrollments,
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
// CHECK ENROLLMENT STATUS
// ======================================================
const checkEnrollment = async ({ userId, courseId }) => {

  const enrollment = await Enrollment.findOne({
    userId,
    courseId,
    deletedAt: null,
    status: 'active'
  })
    .select('_id status enrolledAt progressPercentage')
    .lean();

  return {
    message: 'Enrollment status retrieved successfully',
    data: {
      enrolled: !!enrollment,
      enrollment: enrollment || null
    }
  };
};


// ======================================================
// CANCEL ENROLLMENT
// ======================================================
const cancelEnrollment = async ({ userId, courseId, isAdmin = false }) => {

  const enrollment = await Enrollment.findOne({
    userId,
    courseId,
    deletedAt: null,
    status: 'active'
  });

  if (!enrollment) {
    throw new ApiError(
      404,
      'Active enrollment not found',
      'ENROLLMENT_NOT_FOUND'
    );
  }

  // Prevent users from unenrolling from paid courses unless forced by Admin
  if (enrollment.enrollmentType === 'paid' && !isAdmin) {
    throw new ApiError(
      403,
      'You cannot unenroll from a paid course directly.',
      'PAID_COURSE_UNENROLL_FORBIDDEN'
    );
  }

  // Soft delete enrollment
  enrollment.status = 'cancelled';
  enrollment.deletedAt = new Date();

  await enrollment.save();

  // Decrement enrollment count (atomic, floor at 0)
  await Course.updateOne(
    { _id: courseId, enrollmentCount: { $gt: 0 } },
    { $inc: { enrollmentCount: -1 } }
  );

  // Soft delete associated progress
  await Progress.updateOne(
    { userId, courseId, deletedAt: null },
    { $set: { deletedAt: new Date() } }
  );

  return {
    message: 'Enrollment cancelled successfully'
  };
};


// ======================================================
// REQUEST REFUND
// ======================================================
const requestRefund = async ({ userId, courseId }) => {
  const Payment = require('../models/payment.model');
  const Progress = require('../models/progress.model');
  const Certificate = require('../models/certificate.model');

  // 1. Find active enrollment
  const enrollment = await Enrollment.findOne({
    userId,
    courseId,
    deletedAt: null,
    status: 'active'
  });

  if (!enrollment) {
    throw new ApiError(404, 'Active enrollment not found');
  }

  // 2. Find successful payment
  const payment = await Payment.findOne({
    learnerId: userId,
    courseId,
    paymentStatus: 'success'
  });

  if (!payment) {
    throw new ApiError(400, 'No successful payment found for this enrollment');
  }

  // 3. Deny if institutional
  if (payment.paymentType === 'institution_enrollment') {
    throw new ApiError(403, 'Refund denied: Institutional enrollments cannot be refunded directly');
  }

  // 4. Deny if > 14 days
  const daysSincePayment = (Date.now() - new Date(payment.paidAt || payment.createdAt).getTime()) / (1000 * 3600 * 24);
  if (daysSincePayment > 14) {
    throw new ApiError(403, 'Refund denied: Request is outside the 14-day refund window');
  }

  // 5. Calculate completion from Progress
  const progress = await Progress.findOne({ userId, courseId, deletedAt: null });
  if (progress) {
    if (progress.hasDownloadedMaterials) {
      throw new ApiError(403, 'Refund denied: Course materials have been downloaded or exported');
    }

    const course = await Course.findById(courseId).select('totalLessons');
    const totalLessons = course?.totalLessons || 1;
    const completedLessons = progress.completedLessonCount || 0;
    const percentage = (completedLessons / totalLessons) * 100;

    if (percentage >= 20) {
      throw new ApiError(403, 'Refund denied: More than 20% of the course has been consumed');
    }
  }

  // 6. Deny if certificate exists
  const certificate = await Certificate.findOne({ userId, courseId });
  if (certificate) {
    throw new ApiError(403, 'Refund denied: A certificate has already been issued for this course');
  }

  // 7. Check multiple refund abuse
  const previousRefundsCount = await Payment.countDocuments({
    learnerId: userId,
    paymentStatus: 'refunded'
  });

  if (previousRefundsCount >= 2) {
    throw new ApiError(403, 'Refund denied: Multiple refund abuse detected');
  }

  // Proceed with refund
  payment.paymentStatus = 'refund_pending';
  payment.refundRequestedAt = payment.refundRequestedAt || new Date();
  payment.refundStatus = 'requested';
  payment.refundFailureReason = null;
  await payment.save();

  enrollment.status = 'refund_pending';
  enrollment.paymentStatus = 'refund_pending';
  await enrollment.save();

  return { message: 'Refund request submitted and is pending admin approval' };
};


// ======================================================
// GET ENROLLED STUDENTS FOR TUTOR
// ======================================================
const getTutorStudents = async ({ tutorId, query }) => {
  const page = parseInt(query?.page, 10) || 1;
  const limit = parseInt(query?.limit, 10) || 10;
  const skip = (page - 1) * limit;
  const search = (query?.search || '').trim();
  const requestedCourseId = query?.courseId;

  // 1. Fetch tutor's courses
  const courses = await Course.find({
    authorId: tutorId,
    deletedAt: null
  }).select('_id title').lean();

  let courseIds = courses.map((c) => c._id);
  if (requestedCourseId && requestedCourseId !== 'all') {
    courseIds = courseIds.filter((courseId) => String(courseId) === String(requestedCourseId));
  }

  // 2. Fetch enrollments for these courses. Some older/institutional flows
  // created Progress rows without a matching Enrollment row; merge those as a
  // fallback so tutors still see real learners with course activity.
  const filter = {
    courseId: { $in: courseIds },
    deletedAt: null
  };

  if (query?.status) {
    filter.status = query.status;
  }

  if (search) {
    const User = require('../models/user.model');
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ],
      deletedAt: null
    }).select('_id').lean();

    filter.userId = { $in: matchingUsers.map((user) => user._id) };
  }

  const progressFilter = {
    courseId: { $in: courseIds },
    deletedAt: null
  };

  if (filter.userId) {
    progressFilter.userId = filter.userId;
  }

  const studentCourseSourcePipeline = [
    { $match: filter },
    {
      $project: {
        userId: 1,
        courseId: 1,
        status: 1,
        progressPercentage: 1,
        enrolledAt: 1,
        createdAt: 1,
        completedAt: 1,
        source: { $literal: 'enrollment' },
        sourcePriority: { $literal: 0 }
      }
    }
  ];

  if (!query?.status || query.status === 'active') {
    studentCourseSourcePipeline.push({
      $unionWith: {
        coll: Progress.collection.name,
        pipeline: [
          { $match: progressFilter },
          {
            $project: {
              userId: 1,
              courseId: 1,
              status: { $literal: 'active' },
              progressPercentage: { $literal: 0 },
              enrolledAt: '$createdAt',
              createdAt: 1,
              completedAt: { $literal: null },
              source: { $literal: 'progress' },
              sourcePriority: { $literal: 1 }
            }
          }
        ]
      }
    });
  }

  const uniqueStudentsPipeline = [
    ...studentCourseSourcePipeline,
    { $sort: { sourcePriority: 1, createdAt: -1 } },
    {
      $group: {
        _id: {
          userId: '$userId',
          courseId: '$courseId'
        },
        record: { $first: '$$ROOT' }
      }
    },
    { $replaceRoot: { newRoot: '$record' } },
    {
      $group: {
        _id: '$userId',
        enrollments: {
          $push: {
            _id: '$_id',
            courseId: '$courseId',
            status: '$status',
            progressPercentage: '$progressPercentage',
            enrolledAt: '$enrolledAt',
            createdAt: '$createdAt',
            completedAt: '$completedAt',
            source: '$source'
          }
        },
        latestEnrolledAt: { $max: { $ifNull: ['$enrolledAt', '$createdAt'] } }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'student'
      }
    },
    { $unwind: '$student' },
    { $sort: { latestEnrolledAt: -1 } }
  ];

  const countPipeline = [
    ...studentCourseSourcePipeline,
    {
      $group: {
        _id: {
          userId: '$userId',
          courseId: '$courseId'
        }
      }
    },
    { $group: { _id: '$_id.userId' } },
    { $count: 'total' }
  ];

  const [countResult, groupedResults] = await Promise.all([
    Enrollment.aggregate(countPipeline),
    Enrollment.aggregate([
      ...uniqueStudentsPipeline,
      { $skip: skip },
      { $limit: limit }
    ])
  ]);

  const total = countResult[0]?.total || 0;

  // Populate courseId inside the enrollments array
  await Course.populate(groupedResults, {
    path: 'enrollments.courseId',
    select: 'title slug thumbnailUrl'
  });

  const userIds = groupedResults.map((r) => r._id).filter(Boolean);
  const QuizAttempt = require('../models/quizAttempt.model');
  const Lesson = require('../models/lesson.model');
  const Submission = require('../models/submission.model');

  const [allAttempts, allLessons, allProgress, allSubmissions] = await Promise.all([
    QuizAttempt.find({
      userId: { $in: userIds },
      courseId: { $in: courseIds }
    })
      .populate('lessonId', 'title')
      .lean(),
    Lesson.find({
      courseId: { $in: courseIds },
      deletedAt: null
    })
      .select('_id title courseId moduleId')
      .populate('moduleId', 'title')
      .lean(),
    Progress.find({
      userId: { $in: userIds },
      courseId: { $in: courseIds },
      deletedAt: null
    }).lean(),
    Submission.find({
      userId: { $in: userIds },
      courseId: { $in: courseIds }
    })
      .populate('lessonId', 'title')
      .lean()
  ]);

  const studentRecords = groupedResults.map((r) => {
    return {
      _id: r._id,
      userId: {
        _id: r.student._id,
        name: r.student.name,
        email: r.student.email,
        profile: r.student.profile
      },
      enrolledAt: r.latestEnrolledAt,
      createdAt: r.latestEnrolledAt,
      enrollments: r.enrollments.map((e) => {
        if (!e.courseId) return { ...e, quizResults: [], lessonProgressList: [], submissions: [] };

        // Match quiz attempts
        const matchingAttempts = allAttempts.filter(
          (att) =>
            String(att.userId) === String(r._id) &&
            String(att.courseId) === String(e.courseId?._id || e.courseId)
        );

        const attemptsByQuiz = {};
        matchingAttempts.forEach((att) => {
          const lessonKey = String(att.lessonId?._id || att.lessonId);
          if (!attemptsByQuiz[lessonKey]) {
            attemptsByQuiz[lessonKey] = [];
          }
          attemptsByQuiz[lessonKey].push(att);
        });

        const quizResults = Object.entries(attemptsByQuiz).map(([lessonId, atts]) => {
          atts.sort((a, b) => a.attemptNumber - b.attemptNumber);
          const latestAttempt = atts[atts.length - 1];
          const bestAttempt = atts.reduce(
            (best, curr) => (curr.score > best.score ? curr : best),
            atts[0]
          );

          return {
            lessonId,
            quizTitle: latestAttempt.lessonId?.title || 'Quiz',
            attemptsCount: atts.length,
            latestScore: latestAttempt.score,
            bestScore: bestAttempt.score,
            maxScore: latestAttempt.maxScore,
            percentage: latestAttempt.percentage,
            passed: atts.some((a) => a.passed),
            status: latestAttempt.status,
            submittedAt: latestAttempt.createdAt
          };
        });

        // Match progress
        const prog = allProgress.find(
          (p) =>
            String(p.userId) === String(r._id) &&
            String(p.courseId) === String(e.courseId?._id || e.courseId)
        );

        // Filter lessons
        const courseLessons = allLessons.filter(
          (l) => String(l.courseId) === String(e.courseId?._id || e.courseId)
        );

        const progressPercentage = Number(e.progressPercentage) || (
          prog && courseLessons.length > 0
            ? Math.round((((prog.completedLessonCount || prog.completedLessons?.length || 0) / courseLessons.length) * 100))
            : 0
        );

        const lessonProgressList = courseLessons.map((l) => {
          let percentage = 0;
          let completed = false;
          let lastWatchedAt = null;

          if (prog) {
            const isCompleted = prog.completedLessons?.some((id) => String(id) === String(l._id));
            const lp = prog.lessonProgress?.find((p) => String(p.lessonId) === String(l._id));

            if (isCompleted) {
              percentage = 100;
              completed = true;
            } else if (lp) {
              percentage = lp.percentage || 0;
              completed = lp.completed || false;
              lastWatchedAt = lp.lastWatchedAt;
            }
          }

          return {
            lessonId: l._id,
            title: l.title,
            moduleTitle: l.moduleId?.title || '-',
            percentage,
            completed,
            lastWatchedAt
          };
        });

        // Match submissions
        const submissions = allSubmissions.filter(
          (sub) =>
            String(sub.userId) === String(r._id) &&
            String(sub.courseId) === String(e.courseId?._id || e.courseId)
        ).map((sub) => ({
          _id: sub._id,
          lessonId: sub.lessonId?._id || sub.lessonId,
          assignmentTitle: sub.lessonId?.title || 'Assignment',
          submissionType: sub.submissionType,
          status: sub.status,
          grade: sub.grade,
          feedback: sub.feedback,
          attemptNumber: sub.attemptNumber,
          isLate: sub.isLate,
          submittedAt: sub.createdAt,
          attachments: sub.attachments
        }));

        return {
          ...e,
          progressPercentage,
          quizResults,
          lessonProgressList,
          submissions
        };
      })
    };
  });

  return {
    message: 'Tutor students retrieved successfully',
    data: {
      enrollments: studentRecords,
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
// BULK ENROLL STUDENTS (ADMIN)
// ======================================================
const bulkEnrollStudents = async ({ adminId, emails, courseId }) => {
  // Validate course
  const course = await Course.findOne({ _id: courseId, deletedAt: null }).lean();
  if (!course) {
    throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');
  }

  const results = {
    successful: [],
    failed: []
  };

  const User = require('../models/user.model');

  for (const email of emails) {
    try {
      const userEmail = email.trim().toLowerCase();
      // 1. Check if user exists
      const user = await User.findOne({ email: userEmail, deletedAt: null }).lean();
      if (!user) {
        results.failed.push({ email, reason: 'User not found' });
        continue;
      }
      const userId = user._id;

      // 2. Check if already enrolled
      const existingEnrollment = await Enrollment.findOne({
        userId,
        courseId,
        deletedAt: null
      }).lean();

      if (existingEnrollment && (existingEnrollment.status === 'active' || existingEnrollment.status === 'completed')) {
        results.failed.push({ email, reason: 'Already enrolled' });
        continue;
      }

      // 3. Create Enrollment (Admin bulk grants are considered "free" or comped)
      const enrollment = await Enrollment.create({
        userId,
        courseId,
        status: 'active',
        enrollmentType: 'free',
        paymentStatus: 'not_required',
        amountPaid: 0,
        currency: course.currency,
        certificateEligible: course.certificateEnabled || false
      });

      // 4. Initialize progress
      await Progress.create({
        userId,
        courseId,
        completedLessons: []
      });

      // Increment enrollment count
      await Course.updateOne(
        { _id: courseId },
        { $inc: { enrollmentCount: 1 } }
      );

      results.successful.push({ email, enrollmentId: enrollment._id });

      // Notify learner enrollment confirmation
      try {
        const { triggerEnrollmentConfirmedNotification } = require('./notification.service');
        await triggerEnrollmentConfirmedNotification({ studentId: userId, courseId });
      } catch (notifErr) {
        console.error(`[Notification Error] Failed to trigger learner enrollment confirmation notification for ${email}:`, notifErr.message);
      }
    } catch (error) {
      results.failed.push({ email, reason: error.message });
    }
  }

  if (results.successful.length > 0) {
    try {
      const { triggerBulkEnrollmentNotification } = require('./notification.service');
      await triggerBulkEnrollmentNotification({ courseId, studentCount: results.successful.length });
    } catch (notifErr) {
      console.error('[Notification Error] Failed to trigger bulk enrollment notification:', notifErr.message);
    }
  }

  return {
    message: 'Bulk enrollment completed',
    data: results
  };
};


module.exports = {
  enrollCourse,
  getMyEnrollments,
  checkEnrollment,
  cancelEnrollment,
  getTutorStudents,
  bulkEnrollStudents,
  requestRefund
};
