const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
  {
    recipient: {
      type: String,
      required: true,
      index: true
    },
    recipientName: {
      type: String,
      default: ''
    },
    subject: {
      type: String,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: ['sent', 'failed'],
      index: true
    },
    errorMessage: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false
    }
  }
);

emailLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
