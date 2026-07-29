const mongoose = require('mongoose');

const discussionImageSchema = new mongoose.Schema(
  {
    fileUrl: {
      type: String,
      required: true,
      trim: true
    },
    publicId: {
      type: String,
      required: true,
      trim: true
    },
    resourceType: {
      type: String,
      default: 'image'
    },
    mimeType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      required: true
    },
    size: {
      type: Number,
      required: true,
      min: 0
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const discussionPostSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
      index: true
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DiscussionPost',
      default: null,
      index: true
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    image: {
      type: discussionImageSchema,
      default: null
    },
    upvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    upvoteCount: {
      type: Number,
      default: 0,
      index: true
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true
    },
    officialAnswerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DiscussionPost',
      default: null
    },
    reports: [reportSchema],
    isReported: {
      type: Boolean,
      default: false,
      index: true
    },
    isRemoved: {
      type: Boolean,
      default: false,
      index: true
    },
    removalReason: {
      type: String,
      default: null
    },
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    removedAt: {
      type: Date,
      default: null
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes to speed up frontend page loads and sorting
// 1. Sort by: Pinned first, then Upvotes, then Date
discussionPostSchema.index({ lessonId: 1, parentId: 1, isPinned: -1, upvoteCount: -1, createdAt: -1, deletedAt: 1 });
// 2. Sort by: Pinned first, then Date (Recent)
discussionPostSchema.index({ lessonId: 1, parentId: 1, isPinned: -1, createdAt: -1, deletedAt: 1 });
// 3. Admin queue index
discussionPostSchema.index({ isReported: 1, isRemoved: 1, updatedAt: -1 });

// 4. Replies query index (US-DISC-001 / US-DISC-003)
discussionPostSchema.index({ parentId: 1, deletedAt: 1, createdAt: 1 });

discussionPostSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('DiscussionPost', discussionPostSchema);
