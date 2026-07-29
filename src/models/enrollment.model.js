const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },

    status: {
      type: String,
      enum: ['pending_payment', 'active', 'completed', 'cancelled', 'refunded', 'expired', 'refund_pending', 'refund_failed'],
      default: 'active',
      index: true
    },

    enrollmentType: {
      type: String,
      enum: ['free', 'paid', 'admin_granted', 'bulk'],
      required: true,
      index: true
    },

    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending', 'success', 'failed', 'refunded', 'refund_pending', 'refund_processing', 'refund_failed'],
      default: 'not_required',
      index: true
    },

    paymentId: { type: String, default: null },

    paymentReference: { type: String, default: null, index: true },

    amountPaid: { type: Number, default: 0 },

    currency: { type: String, default: 'INR' },

    billingAddress: { type: String, default: null },

    billingPhone: { type: String, default: null },

    enrolledAt: { type: Date, default: Date.now },

    completedAt: { type: Date, default: null },

    lastAccessedAt: { type: Date, default: null },

    accessExpiresAt: { type: Date, default: null },

    certificateIssued: { type: Boolean, default: false },

    certificateEligible: { type: Boolean, default: false },

    progressPercentage: { type: Number, default: 0, min: 0, max: 100 },

    lastLessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },

    deletedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

// Prevent duplicate enrollment
enrollmentSchema.index(
  { userId: 1, courseId: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null }
  }
);

enrollmentSchema.index({ courseId: 1, status: 1 });
enrollmentSchema.index({ userId: 1, enrolledAt: -1 });

enrollmentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Enrollment', enrollmentSchema);
