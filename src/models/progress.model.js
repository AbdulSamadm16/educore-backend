const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
    completedLessons: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson'
    }],
    completedQuizzes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz'
    }],
    completedAssignments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment'
    }],
    lessonProgress: [
      {
        lessonId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Lesson',
          required: true
        },
        watchTime: {
          type: Number,
          default: 0
        },
        percentage: {
          type: Number,
          default: 0
        },
        completed: {
          type: Boolean,
          default: false
        },
        lastWatchedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    lastAccessedLesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      default: null
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true
    },
    hasDownloadedMaterials: {
      type: Boolean,
      default: false
    },
    completedLessonCount: {
      type: Number,
      default: 0
    },
    videoProgress: [{
      lessonId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lesson',
        required: true
      },
      secondsWatched: {
        type: Number,
        default: 0
      },
      lastWatchedAt: {
        type: Date,
        default: Date.now
      }
    }],
    recordingProgress: [{
      recordingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LiveRecording',
        required: true
      },
      secondsWatched: {
        type: Number,
        default: 0
      },
      lastWatchedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  {
    timestamps: true
  }
);

progressSchema.index({ userId: 1, courseId: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

progressSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Progress', progressSchema);
