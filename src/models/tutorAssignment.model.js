const mongoose = require('mongoose');

const tutorAssignmentSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    tutorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
      index: true
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true
    },
    assignmentType: {
      type: String,
      enum: ['course', 'batch'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'removed'],
      default: 'active',
      index: true
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
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
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

tutorAssignmentSchema.index({ institutionId: 1, tutorId: 1, status: 1 });
tutorAssignmentSchema.index(
  { institutionId: 1, courseId: 1, assignmentType: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      assignmentType: 'course',
      status: 'active',
      courseId: { $type: 'objectId' }
    }
  }
);
tutorAssignmentSchema.index(
  { institutionId: 1, batchId: 1, assignmentType: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      assignmentType: 'batch',
      status: 'active',
      batchId: { $type: 'objectId' }
    }
  }
);
tutorAssignmentSchema.index(
  { tutorId: 1, courseId: 1, assignmentType: 1, status: 1 },
  {
    partialFilterExpression: {
      assignmentType: 'course',
      status: 'active'
    }
  }
);
tutorAssignmentSchema.index(
  { tutorId: 1, batchId: 1, assignmentType: 1, status: 1 },
  {
    partialFilterExpression: {
      assignmentType: 'batch',
      status: 'active'
    }
  }
);

tutorAssignmentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('TutorAssignment', tutorAssignmentSchema);
