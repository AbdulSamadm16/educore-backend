const mongoose = require('mongoose');

const quizAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
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
    answers: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true
        },
        selectedOptionIndex: {
          type: Number,
          default: null
        },
        selectedOptionIndexes: [
          {
            type: Number
          }
        ]
      }
    ],
    score: {
      type: Number,
      default: 0
    },
    maxScore: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    },
    passed: {
      type: Boolean,
      default: false
    },
    attemptNumber: {
      type: Number,
      default: 1
    },
    status: {
      type: String,
      enum: ['submitted', 'graded'],
      default: 'submitted',
      index: true
    },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    gradedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Enforce unique index per attempt number for each user and quiz lesson
quizAttemptSchema.index({ userId: 1, lessonId: 1, attemptNumber: 1 }, { unique: true });

quizAttemptSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
