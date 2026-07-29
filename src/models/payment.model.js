const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    learnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: false,
      index: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      default: null,
      index: true
    },
    enrollmentRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EnrollmentRequest',
      default: null,
      index: true
    },
    paymentType: {
      type: String,
      enum: ['course_purchase', 'subscription', 'institution_enrollment'],
      default: 'course_purchase',
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR',
      required: true
    },
    billingAddress: {
      type: String,
      default: null
    },
    billingPhone: {
      type: String,
      default: null
    },
    gateway: {
      type: String,
      default: 'razorpay'
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      index: true
    },
    orderId: {
      type: String,
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'success', 'failed', 'refunded', 'refund_pending', 'refund_processing', 'refund_failed'],
      default: 'pending',
      index: true
    },
    razorpayRefundId: {
      type: String,
      default: null,
      index: true
    },
    refundStatus: {
      type: String,
      default: null,
      index: true
    },
    refundAmount: {
      type: Number,
      default: null
    },
    refundReason: {
      type: String,
      default: null
    },
    refundRequestedAt: {
      type: Date,
      default: null
    },
    refundProcessedAt: {
      type: Date,
      default: null
    },
    refundFailureReason: {
      type: String,
      default: null
    },
    refundAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    refundLastAttemptAt: {
      type: Date,
      default: null
    },
    webhookVerified: {
      type: Boolean,
      default: false
    },
    paidAt: {
      type: Date,
      default: null
    },
    refundedAt: {
      type: Date,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    refundMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

paymentSchema.index({ learnerId: 1, courseId: 1 });
paymentSchema.index({ learnerId: 1, institutionId: 1, paymentType: 1 });
paymentSchema.index({ createdAt: -1 });

paymentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
