const CourseAudit = require('../models/courseAudit.model');
const AuditLog = require('../models/auditLog.model');

/**
 * Logs an action in the course audit trail
 */
const logCourseAction = async ({ courseId, userId, action, changes = null, metadata = {} }) => {
  try {
    const audit = await CourseAudit.create({
      courseId,
      userId,
      action,
      changes,
      metadata
    });
    return audit;
  } catch (err) {
    console.error('Audit Logging Error:', err);
    // Don't throw to prevent blocking the main operation
    return null;
  }
};

/**
 * Logs an action in the administrative audit log
 */
const logAdminAction = async ({ actorUserId, targetUserId, action, metadata = {}, requestMeta = null }) => {
  try {
    const ip = requestMeta?.ip || 'unknown';
    const userAgent = requestMeta?.deviceInfo?.userAgent || 'unknown';
    const audit = await AuditLog.create({
      actorUserId,
      targetUserId,
      action,
      metadata,
      ip,
      userAgent
    });
    return audit;
  } catch (err) {
    console.error('Admin Audit Logging Error:', err);
    // Don't throw to prevent blocking the main operation
    return null;
  }
};

/**
 * Retrieves audit logs for a specific course
 */
const getCourseLogs = async (courseId) => {
  return CourseAudit.find({ courseId })
    .populate('userId', 'name email role')
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = {
  logCourseAction,
  getCourseLogs,
  logAdminAction
};
