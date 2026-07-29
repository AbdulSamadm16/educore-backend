const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    title: {
      type: String,
      trim: true,
      maxlength: 150
    },
    issueType: {
      type: String,
      required: true,
      index: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    creatorRole: {
      type: String,
      required: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      default: null,
      index: true
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
      index: true
    },
    scope: {
      type: String,
      enum: ['institution', 'platform'],
      required: true,
      default: 'institution',
      index: true
    },
    status: {
      type: String,
      enum: ['open', 'assigned', 'in_progress', 'waiting_for_user', 'resolved', 'closed'],
      default: 'open',
      index: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true
    },
    category: {
      type: String,
      required: true,
      index: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    assignedRole: {
      type: String,
      enum: ['institution_admin', 'platform_support', 'platform_admin', 'development', 'tutor'],
      default: null,
      index: true
    },
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
        default: null
      },
      comment: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null
      },
      submittedAt: {
        type: Date,
        default: null
      },
      resolvedAt: {
        type: Date,
        default: null
      },
      slaResolutionTimeMs: {
        type: Number,
        default: null
      }
    },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        key: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now }
      }
    ],
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

// Indexes for querying lists efficiently
ticketSchema.index({ creatorId: 1, status: 1 });
ticketSchema.index({ institutionId: 1, scope: 1, status: 1 });
ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });

ticketSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Ticket', ticketSchema);
