const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['info', 'success', 'warning', 'error', 'system', 'video_ready', 'course', 'enrollment', 'submission', 'grade', 'quiz', 'discussion'], 
      default: 'info' 
    },
    isRead: { type: Boolean, default: false, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

// Transform _id to id when serializing to JSON or Object
const transformFn = (_doc, ret) => {
  ret.id = ret._id.toString();
  delete ret._id;
  delete ret.__v;
  return ret;
};

notificationSchema.set('toJSON', { transform: transformFn });
notificationSchema.set('toObject', { transform: transformFn });

module.exports = mongoose.model('Notification', notificationSchema);
