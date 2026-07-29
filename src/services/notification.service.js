
const Notification = require('../models/notification.model');
const { ApiError } = require('../utils/errors');
const { ADMIN_ROLES, PLATFORM_ADMIN_ROLES } = require('../utils/roles');

// In-memory active SSE client registry: maps userId string to a Set of active Express res streams
const activeClients = new Map();

/**
 * Register an active SSE response stream for a user (supporting multiple tabs/connections)
 */
const registerClient = (userId, res) => {
  const idStr = String(userId);
  if (!activeClients.has(idStr)) {
    activeClients.set(idStr, new Set());
  }
  activeClients.get(idStr).add(res);
  console.log(`[SSE REGISTRY] Registered client for user ${idStr}. Total active streams for user: ${activeClients.get(idStr).size}`);
};

/**
 * Unregister an active SSE stream
 */
const unregisterClient = (userId, res) => {
  const idStr = String(userId);
  if (!activeClients.has(idStr)) return;
  
  const clientSet = activeClients.get(idStr);
  clientSet.delete(res);
  
  if (clientSet.size === 0) {
    activeClients.delete(idStr);
    console.log(`[SSE REGISTRY] Unregistered user ${idStr} entirely.`);
  } else {
    console.log(`[SSE REGISTRY] Unregistered client stream for user ${idStr}. Remaining: ${clientSet.size}`);
  }
};

/**
 * Stream a real-time notification to all active client tabs of a user
 */
const sendPushNotification = (userId, notification) => {
  const idStr = String(userId);
  const clientSet = activeClients.get(idStr);
  if (clientSet && clientSet.size > 0) {
    console.log(`[SSE PUSH] Pushing live notification to ${clientSet.size} open streams for user ${idStr}`);
    clientSet.forEach((res) => {
      try {
        res.write(`id: ${notification._id || notification.id}\n`);
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(notification)}\n\n`);
        if (typeof res.flush === 'function') {
          res.flush();
        }
      } catch (err) {
        console.error(`[SSE PUSH ERROR] Failed writing to user ${idStr} stream:`, err.message);
      }
    });
  }
};

/**
 * Send real-time state synchronization commands (like 'read' or 'read-all') across multiple active tabs
 */
const sendStateSync = (userId, syncType, payload) => {
  const idStr = String(userId);
  const clientSet = activeClients.get(idStr);
  if (clientSet && clientSet.size > 0) {
    console.log(`[SSE STATE SYNC] Pushing ${syncType} state sync to ${clientSet.size} streams for user ${idStr}`);
    clientSet.forEach((res) => {
      try {
        res.write(`event: state_sync\n`);
        res.write(`data: ${JSON.stringify({ type: syncType, ...payload })}\n\n`);
        if (typeof res.flush === 'function') {
          res.flush();
        }
      } catch (err) {
        console.error(`[SSE SYNC ERROR] Failed syncing state to user ${idStr}:`, err.message);
      }
    });
  }
};

/**
 * Sync missed notifications to a client stream immediately upon reconnection
 * Handles the standard "Last-Event-ID" reconciliation loop
 */
const syncMissedNotifications = async (userId, lastEventId, res) => {
  try {
    const mongoose = require('mongoose');
    if (!lastEventId || !mongoose.Types.ObjectId.isValid(lastEventId)) return;

    console.log(`[SSE RECONCILIATION] Reconciling missed notifications for user ${userId} since event ID ${lastEventId}`);
    
    // Find notifications created chronologically after the last event ID
    const missed = await Notification.find({
      userId,
      _id: { $gt: lastEventId }
    }).sort({ createdAt: 1 });

    if (missed.length > 0) {
      console.log(`[SSE RECONCILIATION] Found ${missed.length} missed notifications to push immediately.`);
      missed.forEach((notif) => {
        res.write(`id: ${notif._id || notif.id}\n`);
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(notif)}\n\n`);
        if (typeof res.flush === 'function') {
          res.flush();
        }
      });
    } else {
      console.log(`[SSE RECONCILIATION] No missed notifications found since last Event ID.`);
    }
  } catch (err) {
    console.error('[SSE RECONCILIATION ERROR] Failed to sync missed notifications:', err.message);
  }
};

/**
 * Creates an in-app notification in the database
 * @param {Object} params Notification details
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async ({ userId, title, message, type = 'system', metadata = null }) => {
  try {
    const User = require('../models/user.model');
    const user = await User.findById(userId).select('role notificationSettings').lean();
    if (user) {
      if (['institution_admin', 'admin'].includes(user.role)) {
        console.log(`[Notification Service] Notification suppressed for institution admin/admin ${userId}.`);
        return null; // Suppress creation
      }
      let settingsKey = null;

      // Map notification types and titles to user notification settings keys
      if (type === 'grade' || title === 'Assignment Graded!' || type === 'submission' || title === 'Assignment Submitted!') {
        settingsKey = 'assignmentGraded';
      } else if (type === 'newLesson' || title === 'New Lesson Added' || title === 'New Module Added' || title === 'Video Updated!' || title === 'Course Submitted for Review' || (metadata && metadata.eventType === 'RECORDING_PUBLISHED')) {
        settingsKey = 'newLesson';
      } else if (type === 'live_session' || title.includes('Live Class') || (metadata && String(metadata.eventType).startsWith('LIVE_CLASS'))) {
        settingsKey = 'liveClassReminder';
      } else if (type === 'course' && title === 'Enrollment Confirmed!') {
        settingsKey = 'enrollmentConfirmed';
      } else if (type === 'success' && title === 'Payment Successful!') {
        settingsKey = 'paymentSuccess';
      } else if (type === 'enrollment' && (title === 'New Student Enrolled!' || title === 'New Student Enrollment Summary' || title === 'Bulk Students Enrolled' || title === 'New Tutor Registered!')) {
        settingsKey = 'newStudentEnrolled';
      } else if (type === 'quiz' || title === 'Quiz Result') {
        settingsKey = 'quizResult';
      } else if (type === 'discussion' || title === 'New Question Posted' || title === 'New Reply Posted') {
        settingsKey = 'discussionActivity';
      }

      if (settingsKey) {
        const settings = user.notificationSettings?.[settingsKey] || { email: true, inApp: true };
        if (settings.inApp === false) {
          console.log(`[Notification Service] In-app notification of type "${type}" / title "${title}" suppressed for user ${userId} per settings.`);
          return null; // Suppress creation
        }
      }
    }

    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      metadata
    });
    
    // Push instantly via Server-Sent Events to any active online connections!
    sendPushNotification(userId, notification);
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw new ApiError(500, `Failed to create notification: ${error.message}`, 'NOTIFICATION_CREATION_FAILED');
  }
};


/**
 * Retrieves notifications for a specific user, sorted by most recent (supports pagination)
 * @param {string} userId User identifier
 * @param {Object} query Query parameters (page, limit)
 * @returns {Promise<Object|Array>} Paginated object or list of notifications
 */
const getNotificationsForUser = async (userId, query = {}) => {
  try {
    const isPaginated = query.page !== undefined;

    // Construct search & read filter object
    const filter = { userId };
    if (query.unread === 'true' || query.unread === true) {
      filter.isRead = false;
    } else if (query.isRead !== undefined) {
      filter.isRead = query.isRead === 'true' || query.isRead === true;
    }

    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: 'i' } },
        { message: { $regex: query.search, $options: 'i' } }
      ];
    }

    if (isPaginated) {
      const page = parseInt(query.page, 10) || 1;
      const limit = parseInt(query.limit, 10) || 20;
      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments(filter)
      ]);

      return {
        notifications,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } else {
      const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      return notifications;
    }
  } catch (error) {
    console.error(`Error fetching notifications for user ${userId}:`, error);
    throw new ApiError(500, 'Failed to retrieve notifications', 'NOTIFICATION_RETRIEVAL_FAILED');
  }
};

/**
 * Marks a specific notification as read for a given user
 * @param {string} notificationId Notification identifier
 * @param {string} userId User identifier
 * @returns {Promise<Object>} Updated notification
 */
const markAsRead = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      throw new ApiError(404, 'Notification not found or access denied', 'NOTIFICATION_NOT_FOUND');
    }

    // Broadcast read synchronization to keep other tabs aligned
    sendStateSync(userId, 'read', { id: notificationId });

    return notification;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error(`Error marking notification ${notificationId} as read:`, error);
    throw new ApiError(500, 'Failed to update notification state', 'NOTIFICATION_UPDATE_FAILED');
  }
};

/**
 * Marks all unread notifications as read for a given user
 * @param {string} userId User identifier
 * @returns {Promise<Object>} Update summary details
 */
const markAllAsRead = async (userId) => {
  try {
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );
    
    // Broadcast bulk-read synchronization to align other tabs
    sendStateSync(userId, 'read_all', {});
    
    return result;
  } catch (error) {
    console.error(`Error marking all notifications as read for user ${userId}:`, error);
    throw new ApiError(500, 'Failed to update notifications state', 'NOTIFICATION_UPDATE_FAILED');
  }
};

const triggerNewEnrollmentNotification = async ({ studentId, courseId }) => {
  try {
    const User = require('../models/user.model');
    const Course = require('../models/course.model');
    const emailService = require('./email.service');

    const [student, course] = await Promise.all([
      User.findById(studentId).select('name').lean(),
      Course.findById(courseId).select('title authorId').lean()
    ]);

    if (!course || !course.authorId) return;

    const tutor = await User.findById(course.authorId).select('name email notificationSettings').lean();
    if (!tutor) return;

    const studentName = student ? student.name : 'A student';
    const settings = tutor.notificationSettings?.newStudentEnrolled || { email: true, inApp: true };
    const emailEnabled = settings.email !== false;
    const inAppEnabled = settings.inApp !== false;

    if (inAppEnabled) {
      await createNotification({
        userId: tutor._id.toString(),
        title: 'New Student Enrolled!',
        message: `"${studentName}" has enrolled in your course "${course.title}".`,
        type: 'enrollment',
        metadata: { courseId: course._id.toString(), studentId: studentId.toString() }
      });
    }

    if (emailEnabled) {
      try {
        await emailService.sendNewStudentEnrolledEmail({
          to: tutor.email,
          tutorName: tutor.name,
          studentName,
          courseTitle: course.title
        });
      } catch (mailErr) {
        console.error('[Notification Error] Failed to send new student enrollment email:', mailErr.message);
      }
    }
  } catch (err) {
    console.error('[Notification Error] Error triggering new enrollment notification:', err);
  }
};

const triggerBulkEnrollmentNotification = async ({ courseId, studentCount }) => {
  try {
    if (studentCount <= 0) return;

    const User = require('../models/user.model');
    const Course = require('../models/course.model');
    const emailService = require('./email.service');

    const course = await Course.findById(courseId).select('title authorId').lean();
    if (!course || !course.authorId) return;

    const tutor = await User.findById(course.authorId).select('name email notificationSettings').lean();
    if (!tutor) return;

    const settings = tutor.notificationSettings?.newStudentEnrolled || { email: true, inApp: true };
    const emailEnabled = settings.email !== false;
    const inAppEnabled = settings.inApp !== false;

    const message = `${studentCount} new student${studentCount > 1 ? 's' : ''} enrolled in "${course.title}".`;

    if (inAppEnabled) {
      await createNotification({
        userId: tutor._id.toString(),
        title: 'New Student Enrollment Summary',
        message,
        type: 'enrollment',
        metadata: { courseId: course._id.toString(), count: studentCount }
      });
    }

    if (emailEnabled) {
      try {
        await emailService.sendBulkEnrollmentSummaryEmail({
          to: tutor.email,
          tutorName: tutor.name,
          studentCount,
          courseTitle: course.title
        });
      } catch (mailErr) {
        console.error('[Notification Error] Failed to send bulk enrollment summary email:', mailErr.message);
      }
    }
  } catch (err) {
    console.error('[Notification Error] Error triggering bulk enrollment notification:', err);
  }
};

const triggerEnrollmentConfirmedNotification = async ({ studentId, courseId }) => {
  try {
    const User = require('../models/user.model');
    const Course = require('../models/course.model');
    const emailService = require('./email.service');

    const [student, course] = await Promise.all([
      User.findById(studentId).select('name email notificationSettings').lean(),
      Course.findById(courseId).select('title').lean()
    ]);

    if (!student || !course) return;

    const settings = student.notificationSettings?.enrollmentConfirmed || { email: true, inApp: true };
    const emailEnabled = settings.email !== false;
    const inAppEnabled = settings.inApp !== false;

    if (inAppEnabled) {
      await createNotification({
        userId: studentId.toString(),
        title: 'Enrollment Confirmed!',
        message: `You have successfully enrolled in "${course.title}".`,
        type: 'course',
        metadata: { courseId: course._id.toString() }
      });
    }

    if (emailEnabled) {
      try {
        await emailService.sendEnrollmentConfirmedEmail({
          to: student.email,
          studentName: student.name,
          courseTitle: course.title
        });
      } catch (mailErr) {
        console.error('[Notification Error] Failed to send enrollment confirmation email:', mailErr.message);
      }
    }
  } catch (err) {
    console.error('[Notification Error] Error triggering enrollment confirmed notification:', err);
  }
};

const triggerPaymentSuccessNotification = async ({ studentId, courseId, amount, currency, transactionId }) => {
  try {
    const User = require('../models/user.model');
    const Course = require('../models/course.model');
    const emailService = require('./email.service');

    const [student, course] = await Promise.all([
      User.findById(studentId).select('name notificationSettings').lean(),
      Course.findById(courseId).select('title authorId').lean()
    ]);

    if (!student || !course) return;

    // 1. Notify Student
    const settings = student.notificationSettings?.paymentSuccess || { email: true, inApp: true };
    const inAppEnabled = settings.inApp !== false;

    if (inAppEnabled) {
      await createNotification({
        userId: studentId.toString(),
        title: 'Payment Successful!',
        message: `Your payment of ${currency || 'INR'} ${amount} for "${course.title}" was successful.`,
        type: 'success',
        metadata: { 
          courseId: course._id.toString(), 
          amount, 
          currency, 
          transactionId 
        }
      });
    }

    // 2. Notify Tutor
    if (course.authorId) {
      const tutor = await User.findById(course.authorId).select('name email notificationSettings').lean();
      if (tutor) {
        const tutorSettings = tutor.notificationSettings?.paymentSuccess || { email: true, inApp: true };
        
        if (tutorSettings.inApp !== false) {
          await createNotification({
            userId: tutor._id.toString(),
            title: 'New Course Sale!',
            message: `"${student.name || 'A student'}" has purchased your course "${course.title}" for ${currency || 'INR'} ${amount}.`,
            type: 'success',
            metadata: { 
              courseId: course._id.toString(), 
              studentId: studentId.toString(),
              amount, 
              currency, 
              transactionId 
            }
          });
        }

        if (tutorSettings.email !== false && tutor.email) {
          await emailService.sendTutorPaymentSuccessEmail({
            to: tutor.email,
            tutorName: tutor.name,
            studentName: student.name || 'A student',
            courseTitle: course.title,
            amount,
            currency,
            transactionId
          }).catch(mailErr => console.error('[Notification Error] Failed to send tutor sales email:', mailErr.message));
        }
      }
    }
  } catch (err) {
    console.error('[Notification Error] Error triggering payment success notification:', err);
  }
};

const triggerQuizResultNotification = async ({ studentId, lessonId, score, maxScore, percentage, passed }) => {
  try {
    const User = require('../models/user.model');
    const Lesson = require('../models/lesson.model');
    const emailService = require('./email.service');

    const [student, lesson] = await Promise.all([
      User.findById(studentId).select('name email notificationSettings').lean(),
      Lesson.findOne({ _id: lessonId, type: 'quiz', deletedAt: null }).select('title').lean()
    ]);

    if (!student || !lesson) return;

    const settings = student.notificationSettings?.quizResult || { email: true, inApp: true };
    const inAppEnabled = settings.inApp !== false;
    const emailEnabled = settings.email !== false;

    if (inAppEnabled) {
      await createNotification({
        userId: studentId.toString(),
        title: 'Quiz Graded!',
        message: `You scored ${score}/${maxScore} (${percentage.toFixed(1)}%) on your attempt for "${lesson.title}". Status: ${passed ? 'Passed' : 'Failed'}.`,
        type: 'quiz',
        metadata: { 
          lessonId: lessonId.toString(), 
          score, 
          maxScore, 
          percentage, 
          passed 
        }
      });
    }

    if (emailEnabled) {
      try {
        await emailService.sendQuizResultEmail({
          to: student.email,
          studentName: student.name,
          quizTitle: lesson.title,
          score,
          maxScore,
          percentage,
          passed
        });
      } catch (mailErr) {
        console.error('[Notification Error] Failed to send quiz result email:', mailErr.message);
      }
    }
  } catch (err) {
    console.error('[Notification Error] Error triggering quiz result notification:', err);
  }
};

const triggerTutorRegistrationAlert = async ({ tutorId }) => {
  try {
    const User = require('../models/user.model');
    const tutor = await User.findById(tutorId).select('name email institutionId accountType').lean();
    if (!tutor) return;

    const admins = await User.find({
      role: { $in: ADMIN_ROLES },
      deletedAt: null
    }).select('name email role institutionId notificationSettings').lean();

    for (const admin of admins) {
      if (['institution_admin', 'admin'].includes(admin.role)) {
        continue;
      }

      const isPlatformAdmin = PLATFORM_ADMIN_ROLES.includes(admin.role);
      const isTutorInstitutionAdmin = tutor.institutionId && admin.institutionId && String(admin.institutionId) === String(tutor.institutionId);

      if (!isPlatformAdmin && !isTutorInstitutionAdmin) {
        continue;
      }

      const settings = admin.notificationSettings?.newStudentEnrolled || { email: true, inApp: true };
      if (settings.inApp !== false) {
        await createNotification({
          userId: admin._id.toString(),
          title: 'New Tutor Registered!',
          message: `Tutor "${tutor.name}" (${tutor.email}) has registered and awaits approval.`,
          type: 'enrollment',
          metadata: { tutorId: tutor._id.toString() }
        });
      }
    }
  } catch (err) {
    console.error('[Notification Error] Error triggering tutor registration alert:', err);
  }
};

const triggerCourseReviewSubmittedAlert = async ({ courseId }) => {
  try {
    const User = require('../models/user.model');
    const Course = require('../models/course.model');
    const emailService = require('./email.service');

    const course = await Course.findById(courseId).select('title authorId institutionId').lean();
    if (!course) return;

    const tutor = await User.findById(course.authorId).select('name').lean();
    const tutorName = tutor ? tutor.name : 'A Tutor';

    const admins = await User.find({
      role: { $in: ADMIN_ROLES },
      deletedAt: null
    }).select('name email role institutionId notificationSettings').lean();

    for (const admin of admins) {
      if (['institution_admin', 'admin'].includes(admin.role)) {
        continue;
      }

      const isPlatformAdmin = PLATFORM_ADMIN_ROLES.includes(admin.role);
      const isCourseInstitutionAdmin = course.institutionId && admin.institutionId && String(admin.institutionId) === String(course.institutionId);

      if (!isPlatformAdmin && !isCourseInstitutionAdmin) {
        continue;
      }

      const settings = admin.notificationSettings?.newLesson || { email: true, inApp: true };

      if (settings.inApp !== false) {
        await createNotification({
          userId: admin._id.toString(),
          title: 'Course Submitted for Review',
          message: `"${tutorName}" has submitted course "${course.title}" for approval.`,
          type: 'system',
          metadata: { courseId: course._id.toString() }
        });
      }

      if (settings.email !== false && admin.email) {
        try {
          await emailService.sendMail({
            to: admin.email,
            name: admin.name || 'Platform Admin',
            subject: `Course Pending Approval: "${course.title}"`,
            text: `Hello ${admin.name || 'Admin'},\n\n"${tutorName}" has submitted the course "${course.title}" for approval.\n\nPlease log in to the admin dashboard to review and approve/reject this course.\n\nBest regards,\nEduCore Team`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
                <h2 style="color: #435947;">Course Approval Required</h2>
                <p>Hello <strong>${admin.name || 'Admin'}</strong>,</p>
                <p>A tutor, <strong>${tutorName}</strong>, has submitted a course for approval:</p>
                <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Course Title:</strong> ${course.title}</p>
                  <p style="margin: 5px 0;"><strong>Submitted By:</strong> ${tutorName}</p>
                </div>
                <p>Please log in to the admin dashboard to review the course curriculum and approve or reject the submission.</p>
                <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
                <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
              </div>
            `
          });
        } catch (mailErr) {
          console.error(`[Notification Error] Failed to send course review email to admin ${admin.email}:`, mailErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[Notification Error] Error triggering course review submitted alert:', err);
  }
};

module.exports = {
  registerClient,
  unregisterClient,
  sendPushNotification,
  sendStateSync,
  syncMissedNotifications,
  createNotification,
  getNotificationsForUser,
  markAsRead,
  markAllAsRead,
  triggerNewEnrollmentNotification,
  triggerBulkEnrollmentNotification,
  triggerEnrollmentConfirmedNotification,
  triggerPaymentSuccessNotification,
  triggerQuizResultNotification,
  triggerTutorRegistrationAlert,
  triggerCourseReviewSubmittedAlert
};

