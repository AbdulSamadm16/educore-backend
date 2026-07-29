const Joi = require('joi');
const { USER_ROLES, PUBLIC_REGISTRATION_TYPES, ACCOUNT_TYPES, ROLES } = require('./roles');

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);
const password = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[A-Z])(?=.*\d).+$/)
  .messages({
    'string.pattern.base': 'Password must contain at least one uppercase letter and one number'
  });

const email = Joi.string().email({ tlds: { allow: false } }).trim().lowercase();
const otp = Joi.string().pattern(/^\d{6}$/).messages({
  'string.pattern.base': 'OTP must be a 6-digit code'
});
const roles = USER_ROLES.filter((role) => role !== ROLES.PLATFORM_OWNER);
const platformRoles = USER_ROLES;
const publicRegistrationRoles = ['learner', 'tutor'];
const statuses = ['active', 'pending_verification', 'pending_approval', 'banned', 'suspended', 'blocked', 'rejected'];

const registerSchema = {
  body: Joi.object({
    registrationType: Joi.string().valid(...PUBLIC_REGISTRATION_TYPES).required(),
    fullName: Joi.string().trim().min(2).max(100).required(),
    email: email.required(),
    password: password.required(),
    confirmPassword: Joi.valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match'
    }),
    institutionId: objectId.when('registrationType', {
      is: Joi.string().valid(ACCOUNT_TYPES.INSTITUTION_LEARNER, ACCOUNT_TYPES.INSTITUTION_TUTOR),
      then: Joi.required(),
      otherwise: Joi.optional().allow(null, '')  // allow but ignore for individual registrations
    })
  })
};


const verifyEmailSchema = {
  body: Joi.object({
    email: email.required(),
    otp: otp.required(),
    rememberMe: Joi.boolean().default(false)
  })
};

const resendOtpSchema = {
  body: Joi.object({
    email: email.required()
  })
};

const loginSchema = {
  body: Joi.object({
    email: email.required(),
    password: Joi.string().required(),
    rememberMe: Joi.boolean().default(false)
  })
};

const forgotPasswordSchema = {
  body: Joi.object({
    email: email.required()
  })
};

const resetPasswordSchema = {
  body: Joi.object({
    token: Joi.string().min(40),
    password: password.required(),
    confirmPassword: Joi.valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match'
    })
  })
};

const passwordResetCookieSchema = {
  query: Joi.object({
    token: Joi.string().min(40).required(),
    redirectTo: Joi.string().uri({ allowRelative: true }).default('/reset-password')
  })
};

const refreshTokenSchema = {
  body: Joi.object({
    refreshToken: Joi.string()
  })
};

const logoutSchema = refreshTokenSchema;

const updateProfileSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(100),
    bio: Joi.string().trim().allow('').max(500)
  })
};

const updateNotificationSettingsSchema = {
  body: Joi.object({
    enrollmentConfirmed: Joi.object({
      email: Joi.boolean(),
      inApp: Joi.boolean()
    }),
    newLesson: Joi.object({
      email: Joi.boolean(),
      inApp: Joi.boolean()
    }),
    liveClassReminder: Joi.object({
      email: Joi.boolean(),
      inApp: Joi.boolean()
    }),
    assignmentGraded: Joi.object({
      email: Joi.boolean(),
      inApp: Joi.boolean()
    }),
    quizResult: Joi.object({
      email: Joi.boolean(),
      inApp: Joi.boolean()
    }),
    paymentSuccess: Joi.object({
      email: Joi.boolean(),
      inApp: Joi.boolean()
    }),
    newStudentEnrolled: Joi.object({
      email: Joi.boolean(),
      inApp: Joi.boolean()
    })
  })
};

const changeEmailSchema = {
  body: Joi.object({
    email: email.required(),
    currentPassword: Joi.string().required()
  })
};

const verifyEmailChangeSchema = {
  body: Joi.object({
    otp: otp.required(),
    refreshToken: Joi.string().optional()
  })
};

const changePasswordSchema = {
  body: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: password.required(),
    confirmPassword: Joi.valid(Joi.ref('newPassword')).required().messages({
      'any.only': 'Passwords do not match'
    })
  })
};

const listUsersSchema = {
  query: Joi.object({
    role: Joi.string().valid(...roles),
    status: Joi.string().valid(...statuses),
    search: Joi.string().trim().max(120).allow(''),
    joinedFrom: Joi.date().iso(),
    joinedTo: Joi.date().iso(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

const userIdParamSchema = {
  params: Joi.object({
    id: objectId.required()
  })
};

const banUserSchema = {
  params: userIdParamSchema.params,
  body: Joi.object({
    banned: Joi.boolean().required(),
    reason: Joi.string().trim().max(300).allow('')
  })
};

const suspendUserSchema = {
  params: userIdParamSchema.params,
  body: Joi.object({
    suspended: Joi.boolean().required(),
    reason: Joi.string().trim().max(300).allow('')
  })
};

const bulkSuspendUsersSchema = {
  body: Joi.object({
    userIds: Joi.array().items(objectId.required()).min(1).max(100).required(),
    reason: Joi.string().trim().max(300).allow('')
  })
};

const changeRoleSchema = {
  params: userIdParamSchema.params,
  body: Joi.object({
    role: Joi.string().valid(...roles).required(),
    reason: Joi.string().trim().max(300).allow(''),
    institutionId: objectId.optional()
  })
};

const rejectTutorSchema = {
  params: userIdParamSchema.params,
  body: Joi.object({
    reason: Joi.string().trim().max(500).allow('').default('')
  })
};

const platformLoginSchema = loginSchema;

const platformListUsersSchema = {
  query: Joi.object({
    role: Joi.string().valid(...platformRoles),
    status: Joi.string().valid(...statuses),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

const platformChangeRoleSchema = {
  params: userIdParamSchema.params,
  body: Joi.object({
    role: Joi.string().valid(...roles).required(),
    reason: Joi.string().trim().max(300).allow(''),
    institutionId: objectId.optional()
  })
};

const adminCreateUserSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: email.required(),
    role: Joi.string().valid(ROLES.LEARNER, ROLES.TUTOR, ROLES.INSTITUTION_ADMIN, ROLES.PLATFORM_ADMIN, ROLES.LEGACY_ADMIN).required(),
    institutionId: objectId.optional()
  })
};

const bulkRegisterStudentsSchema = {
  body: Joi.object({
    students: Joi.array().items(
      Joi.object({
        name: Joi.string().trim().min(2).max(100).required(),
        email: email.required()
      })
    ).min(1).max(100).required()
  })
};

const updateTutorApprovalProfileSchema = {
  body: Joi.object({
    bio: Joi.string().trim().min(20).max(500),
    expertise: Joi.array().items(Joi.string().trim().min(2).max(80)).max(10)
  })
};

const credentialIdParamSchema = {
  params: Joi.object({
    credentialId: objectId.required()
  })
};

const tutorSampleVideoMuxInitSchema = {
  body: Joi.object({
    fileName: Joi.string().trim().min(1).max(255).required(),
    fileSize: Joi.number().integer().min(1).max(2 * 1024 * 1024 * 1024).required(),
    mimeType: Joi.string().trim().max(100).allow('', null)
  })
};

const tutorSampleVideoMuxStatusSchema = {
  params: Joi.object({
    uploadId: Joi.string().trim().min(8).max(120).required()
  })
};

const processRefundSchema = {
  params: Joi.object({
    paymentId: objectId.required()
  }),
  body: Joi.object({
    action: Joi.string().valid('approve', 'reject', 'retry').required(),
    reason: Joi.string().trim().max(500).allow('', null)
  })
};

const courseIdParamSchema = {
  params: Joi.object({
    courseId: objectId.required()
  })
};

const paginationSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10)
  })
};

const createCourseSchema = {
  body: Joi.object({
    title: Joi.string()
      .trim()
      .min(3)
      .max(200)
      .required(),

    shortDescription: Joi.string()
      .trim()
      .max(300)
      .allow(''),

    description: Joi.string()
      .trim()
      .required(),

    category: Joi.string()
      .trim()
      .required(),

    level: Joi.string()
      .valid(
        'Beginner',
        'Intermediate',
        'Advanced'
      ),

    language: Joi.string()
      .trim(),

    thumbnailUrl: Joi.string()
      .allow(null, ''),

    trailerVideoUrl: Joi.string()
      .allow(null, ''),

    price: Joi.number()
      .min(0),

    isFree: Joi.boolean(),

    isSequential: Joi.boolean(),

    tags: Joi.array()
      .items(Joi.string().trim()),

    learningOutcomes: Joi.array()
      .items(Joi.string().trim()),

    requirements: Joi.array()
      .items(Joi.string().trim()),

    targetAudience: Joi.array()
      .items(Joi.string().trim()),

    seoTitle: Joi.string()
      .trim()
      .max(200)
      .allow(''),

    seoDescription: Joi.string()
      .trim()
      .max(500)
      .allow(''),
      
    certificateEnabled: Joi.boolean(),
    
    certificateTemplateId: Joi.string()
      .hex()
      .length(24)
      .allow(null, '')
  })
};

const updateCourseSchema = {
  body: Joi.object({
    title: Joi.string()
      .trim()
      .min(3)
      .max(200),

    status: Joi.string()
      .valid('draft', 'review_pending', 'published', 'unpublished', 'suspended', 'archived', 'deleted'),

    shortDescription: Joi.string()
      .trim()
      .max(300)
      .allow(''),

    description: Joi.string()
      .trim(),

    category: Joi.string()
      .trim(),

    level: Joi.string()
      .valid(
        'Beginner',
        'Intermediate',
        'Advanced'
      ),

    language: Joi.string()
      .trim(),

    thumbnailUrl: Joi.string()
      .allow(null, ''),

    trailerVideoUrl: Joi.string()
      .allow(null, ''),

    price: Joi.number()
      .min(0),

    isFree: Joi.boolean(),

    isSequential: Joi.boolean(),

    tags: Joi.array()
      .items(Joi.string().trim()),

    learningOutcomes: Joi.array()
      .items(Joi.string().trim()),

    requirements: Joi.array()
      .items(Joi.string().trim()),

    targetAudience: Joi.array()
      .items(Joi.string().trim()),

    visibility: Joi.string()
      .valid('public', 'private', 'unlisted'),

    seoTitle: Joi.string()
      .trim()
      .max(200)
      .allow(''),

    seoDescription: Joi.string()
      .trim()
      .max(500)
      .allow(''),
      
    certificateEnabled: Joi.boolean(),
    
    certificateTemplateId: Joi.string()
      .hex()
      .length(24)
      .allow(null, '')
  })
};

const courseReviewDecisionSchema = {
  params: Joi.object({
    id: objectId.required()
  }),
  body: Joi.object({
    feedback: Joi.string().trim().min(3).max(1000).required()
  })
};

const courseFlagReviewSchema = {
  params: Joi.object({
    id: objectId.required()
  }),
  body: Joi.object({
    reason: Joi.string().trim().min(3).max(1000).required()
  })
};

const createModuleSchema = {
  body: Joi.object({
    title: Joi.string()
      .trim()
      .min(2)
      .max(200)
      .required(),

    description: Joi.string()
      .trim()
      .allow('')
  })
};

const updateModuleSchema = {
  body: Joi.object({
    title: Joi.string()
      .trim()
      .min(2)
      .max(200),

    description: Joi.string()
      .trim()
      .allow(''),

    isPublished: Joi.boolean()
  })
};

const createLessonSchema = {
  body: Joi.object({
    title: Joi.string()
      .trim()
      .min(2)
      .max(200)
      .required(),

    description: Joi.string()
      .allow(''),

    content: Joi.string()
      .allow(''),

    type: Joi.string()
      .valid('video', 'text', 'quiz', 'assignment', 'live_session')
      .default('video'),

    videoUrl: Joi.string()
      .allow('', null),

    muxUploadId: Joi.string()
      .allow('', null),

    muxAssetId: Joi.string()
      .allow('', null),

    muxPlaybackId: Joi.string()
      .allow('', null),

    durationInMinutes: Joi.number()
      .min(0)
      .default(0),

    durationSeconds: Joi.number()
      .min(0)
      .default(0),

    durationFormatted: Joi.string()
      .allow('', null),

    thumbnailUrl: Joi.string()
      .allow('', null),

    subtitleUrl: Joi.string()
      .allow('', null),

    isPreview: Joi.boolean()
      .default(false),

    notifyEnrolledOnReady: Joi.boolean()
      .default(false),

    isPublished: Joi.boolean()
      .default(false),

    attachments: Joi.array()
      .items(Joi.object({
        _id: Joi.string().allow('', null),
        id: Joi.string().allow('', null),
        title: Joi.string().trim(),
        fileUrl: Joi.string()
      })),

    liveSessionMeta: Joi.object({
      meetingUrl: Joi.string().allow('', null),
      meetingDate: Joi.date().iso()
    }).allow(null),

    quizMeta: Joi.object({
      totalQuestions: Joi.number().integer().min(0).default(0),
      passingScore: Joi.number().min(0).max(100).default(70),
      timeLimitInMinutes: Joi.number().integer().min(0).default(0),
      questions: Joi.array().items(Joi.object({
        _id: Joi.string().allow('', null),
        id: Joi.string().allow('', null),
        questionText: Joi.string().trim().required(),
        isMultipleAnswer: Joi.boolean().default(false),
        options: Joi.array().items(Joi.object({
          _id: Joi.string().allow('', null),
          id: Joi.string().allow('', null),
          text: Joi.string().trim().required(),
          isCorrect: Joi.boolean().required()
        })).required(),
        explanation: Joi.string().trim().allow(''),
        points: Joi.number().integer().min(1).default(1)
      })).default([])
    }).allow(null),

    assignmentMeta: Joi.object({
      instructions: Joi.string().trim().allow(''),
      submissionType: Joi.string().trim().valid('file', 'text', 'both').default('file'),
      maxMarks: Joi.number().min(1).default(100),
      allowMultipleSubmissions: Joi.boolean().default(false),
      dueDate: Joi.date().iso().allow(null, ''),
      allowLateSubmissions: Joi.boolean().default(true)
    }).allow(null)
  })
};

const updateLessonSchema = {
  body: Joi.object({
    title: Joi.string()
      .trim()
      .min(2)
      .max(200),

    description: Joi.string()
      .allow(''),

    content: Joi.string()
      .allow(''),

    type: Joi.string()
      .valid('video', 'text', 'quiz', 'assignment', 'live_session'),

    videoUrl: Joi.string()
      .allow('', null),

    muxUploadId: Joi.string()
      .allow('', null),

    muxAssetId: Joi.string()
      .allow('', null),

    muxPlaybackId: Joi.string()
      .allow('', null),

    durationInMinutes: Joi.number()
      .min(0),

    durationSeconds: Joi.number()
      .min(0),

    durationFormatted: Joi.string()
      .allow('', null),

    thumbnailUrl: Joi.string()
      .allow('', null),

    subtitleUrl: Joi.string()
      .allow('', null),

    isPreview: Joi.boolean(),

    notifyEnrolledOnReady: Joi.boolean(),

    isPublished: Joi.boolean(),

    attachments: Joi.array()
      .items(Joi.object({
        _id: Joi.string().allow('', null),
        id: Joi.string().allow('', null),
        title: Joi.string().trim(),
        fileUrl: Joi.string()
      })),

    liveSessionMeta: Joi.object({
      meetingUrl: Joi.string().allow('', null),
      meetingDate: Joi.date().iso()
    }).allow(null),

    quizMeta: Joi.object({
      totalQuestions: Joi.number().integer().min(0).default(0),
      passingScore: Joi.number().min(0).max(100).default(70),
      timeLimitInMinutes: Joi.number().integer().min(0).default(0),
      questions: Joi.array().items(Joi.object({
        _id: Joi.string().allow('', null),
        id: Joi.string().allow('', null),
        questionText: Joi.string().trim().required(),
        isMultipleAnswer: Joi.boolean().default(false),
        options: Joi.array().items(Joi.object({
          _id: Joi.string().allow('', null),
          id: Joi.string().allow('', null),
          text: Joi.string().trim().required(),
          isCorrect: Joi.boolean().required()
        })).required(),
        explanation: Joi.string().trim().allow(''),
        points: Joi.number().integer().min(1).default(1)
      })).default([])
    }).allow(null),

    assignmentMeta: Joi.object({
      instructions: Joi.string().trim().allow(''),
      submissionType: Joi.string().trim().valid('file', 'text', 'both').default('file'),
      maxMarks: Joi.number().min(1).default(100),
      allowMultipleSubmissions: Joi.boolean().default(false),
      dueDate: Joi.date().iso().allow(null, ''),
      allowLateSubmissions: Joi.boolean().default(true)
    }).allow(null)
  })
};

const reorderLessonsSchema = {
  body: Joi.object({
    moduleId: objectId.required(),
    orderedLessonIds: Joi.array()
      .items(objectId.required())
      .min(1)
      .required()
  })
};

const reorderModulesSchema = {
  body: Joi.object({
    courseId: objectId.required(),
    orderedModuleIds: Joi.array()
      .items(objectId.required())
      .min(1)
      .required()
  })
};

const objectIdParamSchema = {
  params: Joi.object({
    id: objectId.required()
  })
};

const lessonAttachmentParamSchema = {
  params: Joi.object({
    id: objectId.required(),
    attachmentId: objectId.required()
  })
};

const catalogueQuerySchema = {
  query: Joi.object({
    search: Joi.string()
      .trim()
      .max(200)
      .allow(''),

    category: Joi.string()
      .trim(),

    level: Joi.string()
      .valid('Beginner', 'Intermediate', 'Advanced'),

    price: Joi.string()
      .valid('free', 'paid'),

    sort: Joi.string()
      .valid('newest', 'latest', 'popular', 'rating', 'price_low', 'price_high')
      .default('newest'),

    rating: Joi.number()
      .min(1)
      .max(5)
      .allow(''),

    featured: Joi.boolean(),

    page: Joi.number()
      .integer()
      .min(1)
      .default(1),

    limit: Joi.number()
      .integer()
      .min(1)
      .max(50)
      .default(10)
  })
};

const markLessonCompleteSchema = {
  body: Joi.object({
    lessonId: objectId.required()
  })
};

const updateVideoProgressSchema = {
  body: Joi.object({
    lessonId: objectId.required(),
    progressPercentage: Joi.number().min(0).max(100),
    secondsWatched: Joi.number().min(0),
    watchTime: Joi.number().min(0),
    percentage: Joi.number().min(0).max(100)
  })
};

const createReviewSchema = {
  body: Joi.object({
    rating: Joi.number()
      .integer()
      .min(1)
      .max(5)
      .required(),

    title: Joi.string()
      .trim()
      .max(200)
      .allow(''),

    comment: Joi.string()
      .trim()
      .max(2000)
      .allow('')
  })
};

const createInstitutionSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    domain: Joi.string().trim().min(3).max(100).required(),
    email: Joi.string().email().required(),
    description: Joi.string().trim().max(500).allow(''),
    adminName: Joi.string().trim().min(2).max(100).required(),
    adminEmail: Joi.string().email().required(),
    code: Joi.string().trim().min(2).max(20).allow(''),
  })
};

const updateInstitutionSchema = {
  params: Joi.object({
    id: objectId.required()
  }),
  body: Joi.object({
    name: Joi.string().trim().min(2).max(100),
    domain: Joi.string().trim().min(3).max(100),
    email: Joi.string().email(),
    description: Joi.string().trim().max(500).allow(''),
    code: Joi.string().trim().min(2).max(20).allow(''),
  }).min(1)
};

const disableInstitutionSchema = {
  params: Joi.object({
    id: objectId.required()
  }),
  body: Joi.object({
    status: Joi.string().valid('active', 'suspended').required()
  })
};

const assignInstitutionAdminSchema = {
  params: Joi.object({
    id: objectId.required()
  }),
  body: Joi.object({
    adminName: Joi.string().trim().min(2).max(100).required(),
    adminEmail: Joi.string().email().required()
  })
};

const updateInstitutionSettingsSchema = {
  body: Joi.object({
    allowPublicCourses: Joi.boolean().required()
  })
};

const platformListInstitutionsSchema = {
  query: Joi.object({
    status: Joi.string().valid('active', 'suspended', 'pending'),
    search: Joi.string().trim().allow(''),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

const idOrEmpty = Joi.alternatives().try(objectId, Joi.valid('', null));
const stringList = Joi.alternatives().try(
  Joi.array().items(Joi.string().trim().min(1)),
  Joi.string().trim().allow('')
);

const institutionListBatchesSchema = {
  query: Joi.object({
    status: Joi.string().valid('active', 'completed', 'archived'),
    search: Joi.string().trim().allow(''),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

const batchIdParamSchema = {
  params: Joi.object({
    batchId: objectId.required()
  })
};

const batchStudentParamSchema = {
  params: Joi.object({
    batchId: objectId.required(),
    studentId: objectId.required()
  })
};

const createBatchSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).required(),
    assignedTutorId: idOrEmpty
  })
};

const updateBatchSchema = {
  params: batchIdParamSchema.params,
  body: Joi.object({
    name: Joi.string().trim().min(2).max(120),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    assignedTutorId: idOrEmpty,
    status: Joi.string().valid('active', 'completed', 'archived')
  }).min(1)
};

const addBatchStudentsSchema = {
  params: batchIdParamSchema.params,
  body: Joi.object({
    studentIds: stringList,
    studentId: Joi.string().trim(),
    emails: stringList,
    email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase(),
    students: Joi.array().items(
      Joi.alternatives().try(
        Joi.string().trim(),
        Joi.object({
          studentId: objectId,
          userId: objectId,
          email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase()
        }).or('studentId', 'userId', 'email')
      )
    ),
    csvContent: Joi.string().allow('')
  })
};

const institutionTutorSearchSchema = {
  query: Joi.object({
    search: Joi.string().trim().allow('')
  })
};

const listTutorAssignmentsSchema = {
  query: Joi.object({
    status: Joi.string().valid('active', 'removed'),
    assignmentType: Joi.string().valid('course', 'batch'),
    tutorId: objectId
  })
};

const createTutorAssignmentSchema = {
  body: Joi.object({
    tutorId: objectId.required(),
    courseIds: stringList,
    batchIds: stringList,
    batchId: objectId
  }).or('courseIds', 'batchIds', 'batchId')
};

const tutorAssignmentIdParamSchema = {
  params: Joi.object({
    assignmentId: objectId.required()
  })
};

const attendanceSessionParamSchema = {
  params: Joi.object({
    sessionId: objectId.required()
  })
};

const attendanceRosterSchema = {
  params: attendanceSessionParamSchema.params,
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(100)
  })
};

const attendanceStudentParamSchema = {
  params: Joi.object({
    studentId: objectId.required()
  })
};

const markAttendanceSchema = {
  params: attendanceSessionParamSchema.params,
  body: Joi.object({
    records: Joi.array().items(
      Joi.object({
        studentId: objectId.required(),
        status: Joi.string().valid('present', 'absent', 'late').required(),
        note: Joi.string().trim().max(300).allow('')
      })
    ).min(1).required()
  })
};

const liveSessionSchema = {
  body: Joi.object({
    courseId: objectId.required(),
    batchId: idOrEmpty,
    title: Joi.string().trim().min(2).max(200).required(),
    description: Joi.string().trim().allow('', null),
    startTime: Joi.date().iso().required(),
    endTime: Joi.date().iso().greater(Joi.ref('startTime')).required(),
    timezone: Joi.string().trim().required(),
    durationMinutes: Joi.number().integer().min(1).required()
  })
};

const updateLiveSessionSchema = {
  params: Joi.object({
    id: objectId.required()
  }),
  body: Joi.object({
    title: Joi.string().trim().min(2).max(200),
    batchId: idOrEmpty,
    description: Joi.string().trim().allow('', null),
    startTime: Joi.date().iso(),
    endTime: Joi.date().iso().greater(Joi.ref('startTime')),
    timezone: Joi.string().trim(),
    durationMinutes: Joi.number().integer().min(1)
  }).min(1)
};

const searchInstitutionsSchema = {
  query: Joi.object({
    keyword: Joi.string().trim().allow(''),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('newest', 'name').default('newest')
  })
};

const enrollInstitutionSchema = {
  body: Joi.object({
    institutionId: objectId.required(),
    idempotencyKey: Joi.string().uuid().optional()
  })
};

const cancelEnrollmentRequestSchema = {
  body: Joi.object({
    requestId: objectId.required()
  })
};

const verifyInstitutionPaymentSchema = {
  body: Joi.object({
    requestId: objectId.required(),
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required()
  })
};

const adminUpdateMembershipSchema = {
  params: Joi.object({
    membershipId: objectId.required()
  }),
  body: Joi.object({
    status: Joi.string().valid('active', 'suspended', 'cancelled').required(),
    reason: Joi.string().max(300).allow('')
  })
};

const institutionPaymentHistorySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

const institutionPaymentRecordsSchema = {
  params: Joi.object({
    institutionId: objectId.required()
  }),
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

const institutionRevenueReportSchema = {
  query: Joi.object({
    institutionId: objectId.optional()
  })
};

const downloadInstitutionInvoiceSchema = {
  params: Joi.object({
    paymentId: objectId.required()
  })
};

const createFeePlanSchema = {
  body: Joi.object({
    registrationFee: Joi.number().min(0).required(),
    joiningFee: Joi.number().min(0).required(),
    monthlyFee: Joi.number().min(0).required(),
    changeReason: Joi.string().trim().min(3).max(300).required()
  })
};

const togglePaymentRequirementSchema = {
  body: Joi.object({
    paymentRequired: Joi.boolean().required(),
    changeReason: Joi.string().trim().min(3).max(300).required()
  })
};

const institutionIdParamSchema = {
  params: Joi.object({
    institutionId: objectId.required()
  })
};

const createOfflineAttendanceSessionSchema = {
  body: Joi.object({
    batchId: objectId.required(),
    attendanceDate: Joi.date().iso().required(),
    topicCovered: Joi.string().trim().max(300).allow(''),
    remarks: Joi.string().trim().max(500).allow('')
  })
};

const markOfflineAttendanceSchema = {
  params: Joi.object({
    sessionId: objectId.required()
  }),
  body: Joi.object({
    records: Joi.array().items(
      Joi.object({
        recordId: objectId.required(),
        status: Joi.string().valid('present', 'absent', 'late').required()
      })
    ).min(1).required()
  })
};

const offlineAttendanceSessionParamSchema = {
  params: Joi.object({
    sessionId: objectId.required()
  })
};

const tutorAssignmentHistorySchema = {
  query: Joi.object({
    tutorId: objectId.optional(),
    limit: Joi.number().integer().min(1).max(200).default(50)
  })
};

module.exports = {
  registerSchema,
  verifyEmailSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  passwordResetCookieSchema,
  refreshTokenSchema,
  logoutSchema,
  updateProfileSchema,
  updateTutorApprovalProfileSchema,
  credentialIdParamSchema,
  tutorSampleVideoMuxInitSchema,
  tutorSampleVideoMuxStatusSchema,
  updateNotificationSettingsSchema,
  changeEmailSchema,
  verifyEmailChangeSchema,
  changePasswordSchema,
  listUsersSchema,
  userIdParamSchema,
  banUserSchema,
  suspendUserSchema,
  bulkSuspendUsersSchema,
  changeRoleSchema,
  rejectTutorSchema,
  platformLoginSchema,
  platformListUsersSchema,
  platformChangeRoleSchema,
  adminCreateUserSchema,
  bulkRegisterStudentsSchema,
  processRefundSchema,
  courseIdParamSchema,
  paginationSchema,
  createCourseSchema,
  updateCourseSchema,
  courseReviewDecisionSchema,
  courseFlagReviewSchema,
  createModuleSchema,
  updateModuleSchema,
  createLessonSchema,
  updateLessonSchema,
  reorderLessonsSchema,
  reorderModulesSchema,
  objectIdParamSchema,
  lessonAttachmentParamSchema,
  catalogueQuerySchema,
  markLessonCompleteSchema,
  updateVideoProgressSchema,
  createReviewSchema,
  createInstitutionSchema,
  platformListInstitutionsSchema,
  institutionListBatchesSchema,
  batchIdParamSchema,
  batchStudentParamSchema,
  createBatchSchema,
  updateBatchSchema,
  addBatchStudentsSchema,
  institutionTutorSearchSchema,
  listTutorAssignmentsSchema,
  createTutorAssignmentSchema,
  tutorAssignmentIdParamSchema,
  attendanceSessionParamSchema,
  attendanceRosterSchema,
  attendanceStudentParamSchema,
  markAttendanceSchema,
  liveSessionSchema,
  updateLiveSessionSchema,
  searchInstitutionsSchema,
  enrollInstitutionSchema,
  cancelEnrollmentRequestSchema,
  verifyInstitutionPaymentSchema,
  adminUpdateMembershipSchema,
  institutionPaymentHistorySchema,
  institutionPaymentRecordsSchema,
  institutionRevenueReportSchema,
  downloadInstitutionInvoiceSchema,
  tutorAssignmentHistorySchema,
  createOfflineAttendanceSessionSchema,
  markOfflineAttendanceSchema,
  offlineAttendanceSessionParamSchema,
  createFeePlanSchema,
  togglePaymentRequirementSchema,
  institutionIdParamSchema,
  updateInstitutionSchema,
  disableInstitutionSchema,
  assignInstitutionAdminSchema,
  updateInstitutionSettingsSchema
};
