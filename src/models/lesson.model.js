const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema(
  {
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true, index: true },

    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
   
    type: {
      type: String,
      enum: ['video', 'text', 'quiz', 'assignment', 'live_session'],
      default: 'video',
      index: true
    },

    title: { type: String, required: true, trim: true, maxlength: 200 },

    description: { type: String, default: '' },

    content: { type: String, default: '' },

    videoUrl: { type: String, default: null },

    videoStatus: { 
      type: String, 
      enum: ['Uploading', 'Processing', 'Ready', 'Failed', null], 
      default: null,
      index: true
    },

    videoUploadId: { type: String, default: null, index: true },

    videoProcessingError: { type: String, default: null },

    muxUploadId: { type: String, default: null },

    muxAssetId: { type: String, default: null },

    muxPlaybackId: { type: String, default: null },

    durationInMinutes: { type: Number, default: 0 },

    durationSeconds: { type: Number, default: 0 },

    durationFormatted: { type: String, default: '' },

    thumbnailUrl: { type: String, default: null },

    // Subtitle metadata (Cloudinary)
    subtitleUrl: { type: String, default: null },
    subtitlePublicId: { type: String, default: null },
    subtitleResourceType: { type: String, default: null },
    subtitleUploadedAt: { type: Date, default: null },

    isPreview: { type: Boolean, default: false, index: true },

    order: { type: Number, required: true, default: 0 },

    attachments: [
      {
        title: { type: String },
        fileUrl: { type: String },
        publicId: { type: String, default: null },
        resourceType: { type: String, default: null },
        mimeType: { type: String, default: null },
        size: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: null }
      }
    ],

    liveSessionMeta: {
      meetingUrl: String,
      meetingDate: Date
    },

    quizMeta: {
      totalQuestions: { type: Number, default: 0 },
      passingScore: { type: Number, default: 70 },
      timeLimitInMinutes: { type: Number, default: 0 },
      questions: [{
        questionText: { type: String, required: true },
        isMultipleAnswer: { type: Boolean, default: false },
        options: [{ text: String, isCorrect: Boolean }],
        explanation: { type: String, default: '' },
        points: { type: Number, default: 1 }
      }]
    },

    assignmentMeta: {
      instructions: { type: String, default: '' },
      submissionType: { type: String, enum: ['file', 'text', 'both'], default: 'file' },
      maxMarks: { type: Number, default: 100 },
      allowMultipleSubmissions: { type: Boolean, default: false },
      dueDate: { type: Date, default: null },
      allowLateSubmissions: { type: Boolean, default: true }
    },

    isPublished: { type: Boolean, default: false },

    notifyEnrolledOnReady: { type: Boolean, default: false },

    deletedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

// IMPORTANT INDEXES
lessonSchema.index({ moduleId: 1, order: 1 });
lessonSchema.index({ courseId: 1, moduleId: 1, deletedAt: 1 });
lessonSchema.index({ courseId: 1, isPreview: 1, deletedAt: 1 });

lessonSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Lesson', lessonSchema);