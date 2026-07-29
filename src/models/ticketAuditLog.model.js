const mongoose = require('mongoose');

const ticketAuditLogSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
      index: true
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    actorRole: {
      type: String,
      required: true
    },
    action: {
      type: String,
      required: true,
      enum: [
        'TICKET_CREATED',
        'TICKET_ASSIGNED',
        'TICKET_REASSIGNED',
        'TICKET_ESCALATED',
        'TICKET_REPLY_ADDED',
        'TICKET_INTERNAL_NOTE_ADDED',
        'TICKET_STATUS_CHANGED',
        'TICKET_RESOLVED',
        'TICKET_CLOSED',
        'TICKET_REOPENED',
        'FEEDBACK_SUBMITTED'
      ]
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ip: {
      type: String,
      default: 'unknown'
    },
    userAgent: {
      type: String,
      default: 'unknown'
    }
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false
    }
  }
);

// Indexes
ticketAuditLogSchema.index({ ticketId: 1, createdAt: -1 });

ticketAuditLogSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('TicketAuditLog', ticketAuditLogSchema);
