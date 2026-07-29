const { inferAccountType } = require('./roles');

const toPublicUser = (user) => {
  const source = typeof user.toObject === 'function' ? user.toObject() : user;

  return {
    id: String(source._id || source.id),
    name: source.name,
    email: source.email,
    role: source.role,
    accountType: inferAccountType(source),
    status: source.status,
    emailVerified: source.emailVerified,
    institutionId: source.institutionId ? String(source.institutionId) : null,
    profile: source.profile || {},
    googleConnected: Boolean(source.googleRefreshToken),
    failedLoginAttempts: source.failedLoginAttempts,
    lockUntil: source.lockUntil,
    lastLoginAt: source.lastLoginAt,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    notificationSettings: {
      enrollmentConfirmed: {
        email: source.notificationSettings?.enrollmentConfirmed?.email !== false,
        inApp: source.notificationSettings?.enrollmentConfirmed?.inApp !== false
      },
      newLesson: {
        email: source.notificationSettings?.newLesson?.email !== false,
        inApp: source.notificationSettings?.newLesson?.inApp !== false
      },
      liveClassReminder: {
        email: source.notificationSettings?.liveClassReminder?.email !== false,
        inApp: source.notificationSettings?.liveClassReminder?.inApp !== false
      },
      assignmentGraded: {
        email: source.notificationSettings?.assignmentGraded?.email !== false,
        inApp: source.notificationSettings?.assignmentGraded?.inApp !== false
      },
      quizResult: {
        email: source.notificationSettings?.quizResult?.email !== false,
        inApp: source.notificationSettings?.quizResult?.inApp !== false
      },
      paymentSuccess: {
        email: source.notificationSettings?.paymentSuccess?.email !== false,
        inApp: source.notificationSettings?.paymentSuccess?.inApp !== false
      },
      newStudentEnrolled: {
        email: source.notificationSettings?.newStudentEnrolled?.email !== false,
        inApp: source.notificationSettings?.newStudentEnrolled?.inApp !== false
      }
    }
  };
};

module.exports = {
  toPublicUser
};
