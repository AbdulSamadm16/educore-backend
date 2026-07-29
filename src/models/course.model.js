const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200, index: true },

    slug: { type: String, unique: true, sparse: true, trim: true, lowercase: true, index: true },

    shortDescription: { type: String, trim: true, maxlength: 300, default: '' },

    description: { type: String, required: true, trim: true },

    category: { type: String, trim: true, required: true, index: true },

    tags: [{ type: String, trim: true, lowercase: true }],

    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      default: 'Beginner',
      index: true
    },

    language: { type: String, default: 'English' },

    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    authorSnapshot: {
      name: String,
      avatarUrl: String,
      role: String
    },

    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },

    courseType: {
      type: String,
      enum: ['PUBLIC', 'INSTITUTION'],
      default: 'PUBLIC',
      index: true
    },


    thumbnailUrl: { type: String, default: null },

    trailerVideoUrl: { type: String, default: null },

    previewLessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },

    price: { type: Number, default: 0, min: 0 },

    currency: { type: String, default: 'INR' },

    isFree: { type: Boolean, default: true, index: true },

    status: {
      type: String,
      enum: ['draft', 'review_pending', 'published', 'unpublished', 'suspended', 'archived', 'deleted'],
      default: 'draft',
      index: true
    },

    visibility: {
      type: String,
      enum: ['public', 'private', 'unlisted'],
      default: 'private',
      index: true
    },

    featured: { type: Boolean, default: false, index: true },
    isSequential: { type: Boolean, default: false },

    learningOutcomes: [{ type: String }],

    requirements: [{ type: String }],

    targetAudience: [{ type: String }],

    durationInMinutes: { type: Number, default: 0 },

    totalModules: { type: Number, default: 0 },

    totalLessons: { type: Number, default: 0 },
    
    totalQuizzes: { type: Number, default: 0 },
    
    totalAssignments: { type: Number, default: 0 },

    enrollmentCount: { type: Number, default: 0, index: true },

    averageRating: { type: Number, default: 0, min: 0, max: 5 },

    reviewCount: { type: Number, default: 0 },

    version: { type: Number, default: 1 },

    isPublishReady: { type: Boolean, default: false },

    publishedAt: { type: Date, default: null },

    lastPublishedAt: { type: Date, default: null },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    reviewedAt: { type: Date, default: null },

    reviewNotes: { type: String, default: '' },

    flaggedForReview: { type: Boolean, default: false, index: true },

    flagReviewReason: { type: String, default: '' },

    flaggedAt: { type: Date, default: null },

    flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    seoTitle: { type: String, default: '' },

    seoDescription: { type: String, default: '' },

    pendingChanges: { type: mongoose.Schema.Types.Mixed, default: null },

    certificateEnabled: { type: Boolean, default: false, index: true },

    certificateTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'CertificateTemplate', default: null, index: true },

    certificateTemplateVersion: { type: Number, default: null },

    deletedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

courseSchema.index({ status: 1, visibility: 1, category: 1, deletedAt: 1 });
courseSchema.index({ featured: 1, averageRating: -1, enrollmentCount: -1 });
courseSchema.index({ title: 'text', shortDescription: 'text', tags: 'text' });
courseSchema.index({ authorId: 1, status: 1, deletedAt: 1 });
courseSchema.index({ category: 1, level: 1, deletedAt: 1 });

courseSchema.pre('save', function (next) {
  if (this.institutionId) {
    this.courseType = 'INSTITUTION';
  } else {
    this.courseType = 'PUBLIC';
  }
  next();
});

courseSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Course', courseSchema);
