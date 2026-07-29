const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    lessonId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Lesson', 
      required: true, 
      index: true 
    },
    courseId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Course', 
      required: true, 
      index: true 
    },
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    submissionType: { 
      type: String, 
      enum: ['file', 'text', 'both'], 
      required: true 
    },
    content: { 
      type: String, 
      default: '' 
    },
    attachments: [{ 
      title: String, 
      fileUrl: String,
      publicId: String
    }],
    status: { 
      type: String, 
      enum: ['submitted', 'graded', 'returned'], 
      default: 'submitted',
      index: true
    },
    grade: { 
      type: Number, 
      min: 0, 
      default: null 
    },
    feedback: { 
      type: String, 
      default: '' 
    },
    gradedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      default: null 
    },
    gradedAt: { 
      type: Date, 
      default: null 
    },
    attemptNumber: {
      type: Number,
      default: 1
    },
    isLate: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

submissionSchema.index({ userId: 1, lessonId: 1, attemptNumber: 1 }, { unique: true });
submissionSchema.index({ courseId: 1, status: 1 });
submissionSchema.index({ lessonId: 1, status: 1 });

submissionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Submission', submissionSchema);
