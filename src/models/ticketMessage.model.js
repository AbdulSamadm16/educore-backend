const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderRole: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    isInternalNote: {
      type: Boolean,
      default: false,
      index: true
    },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        key: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now }
      }
    ]
  },
  {
    timestamps: true
  }
);

// Indexes
ticketMessageSchema.index({ ticketId: 1, createdAt: 1 });

ticketMessageSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('TicketMessage', ticketMessageSchema);
