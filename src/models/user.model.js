const mongoose = require('mongoose');
const { USER_ROLES, ACCOUNT_TYPES } = require('../utils/roles');

const credentialSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    fileUrl: { type: String, trim: true, required: true },
    publicId: { type: String, trim: true, default: null },
    resourceType: { type: String, trim: true, default: 'raw' },
    mimeType: { type: String, trim: true, default: null },
    size: { type: Number, default: 0, min: 0 },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const sampleVideoSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: '' },
    videoUrl: { type: String, trim: true, default: null },
    publicId: { type: String, trim: true, default: null },
    resourceType: { type: String, trim: true, default: 'video' },
    muxUploadId: { type: String, trim: true, default: null },
    muxAssetId: { type: String, trim: true, default: null },
    muxPlaybackId: { type: String, trim: true, default: null },
    videoStatus: { type: String, trim: true, default: null },
    mimeType: { type: String, trim: true, default: null },
    size: { type: Number, default: 0, min: 0 },
    uploadedAt: { type: Date, default: null }
  },
  { _id: false }
);

const tutorApprovalSchema = new mongoose.Schema(
  {
    expertise: [{ type: String, trim: true, maxlength: 80 }],
    credentials: {
      type: [credentialSchema],
      default: []
    },
    sampleVideo: {
      type: sampleVideoSchema,
      default: () => ({})
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },
    rejectedAt: {
      type: Date,
      default: null
    },
    resubmittedAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const profileSchema = new mongoose.Schema(
  {
    avatarUrl: {
      type: String,
      trim: true,
      default: null
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },
    tutorApproval: {
      type: tutorApprovalSchema,
      default: () => ({})
    }
  },
  {
    _id: false
  }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    googleRefreshToken: {
      type: String,
      default: null,
      select: false
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      index: true
    },
    accountType: {
      type: String,
      enum: Object.values(ACCOUNT_TYPES),
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'pending_verification', 'pending_approval', 'banned', 'suspended', 'blocked', 'rejected'],
      required: true,
      default: 'pending_verification',
      index: true
    },
    emailVerified: {
      type: Boolean,
      default: false,
      index: true
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    lockUntil: {
      type: Date,
      default: null
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    profile: {
      type: profileSchema,
      default: () => ({})
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      default: null,
      index: true
    },
    isDiscussionBanned: {
      type: Boolean,
      default: false
    },
    discussionWarnings: [
      {
        reason: { type: String, required: true },
        warnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        warnedAt: { type: Date, default: Date.now },
        postContentSnippet: { type: String, default: null }
      }
    ],
    notificationSettings: {
      type: {
        enrollmentConfirmed: {
          email: { type: Boolean, default: true },
          inApp: { type: Boolean, default: true }
        },
        newLesson: {
          email: { type: Boolean, default: true },
          inApp: { type: Boolean, default: true }
        },
        liveClassReminder: {
          email: { type: Boolean, default: true },
          inApp: { type: Boolean, default: true }
        },
        assignmentGraded: {
          email: { type: Boolean, default: true },
          inApp: { type: Boolean, default: true }
        },
        quizResult: {
          email: { type: Boolean, default: true },
          inApp: { type: Boolean, default: true }
        },
        paymentSuccess: {
          email: { type: Boolean, default: true },
          inApp: { type: Boolean, default: true }
        },
        newStudentEnrolled: {
          email: { type: Boolean, default: true },
          inApp: { type: Boolean, default: true }
        },
        discussionActivity: {
          email: { type: Boolean, default: true },
          inApp: { type: Boolean, default: true }
        }
      },
      default: () => ({
        enrollmentConfirmed: { email: true, inApp: true },
        newLesson: { email: true, inApp: true },
        liveClassReminder: { email: true, inApp: true },
        assignmentGraded: { email: true, inApp: true },
        quizResult: { email: true, inApp: true },
        paymentSuccess: { email: true, inApp: true },
        newStudentEnrolled: { email: true, inApp: true },
        discussionActivity: { email: true, inApp: true }
      })
    }
  },
  {
    timestamps: true
  }
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      deletedAt: null
    }
  }
);
userSchema.index({ role: 1, status: 1, deletedAt: 1 });
userSchema.index({ accountType: 1, status: 1, deletedAt: 1 });
userSchema.index({ name: 1, deletedAt: 1 });

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
