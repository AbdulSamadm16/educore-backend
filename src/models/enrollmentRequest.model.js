const mongoose = require('mongoose');

const enrollmentRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    status: {
      type: String,
      enum: ['pending_payment', 'payment_processing', 'completed', 'expired', 'cancelled', 'failed'],
      default: 'pending_payment',
      index: true
    },
    paymentReference: { type: String, default: null, index: true }, // Order ID from payment gateway
    feeSnapshot: {
      registrationFee: { type: Number, required: true },
      joiningFee: { type: Number, required: true },
      monthlyFee: { type: Number, required: true },
      totalInitialCost: { type: Number, required: true },
      currency: { type: String, default: 'INR' }
    },
    idempotencyKey: { type: String, unique: true, sparse: true, index: true },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

// Concurrency: unique index on user/institution for active pending requests
enrollmentRequestSchema.index(
  { userId: 1, institutionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending_payment', 'payment_processing'] }
    }
  }
);

module.exports = mongoose.model('EnrollmentRequest', enrollmentRequestSchema);
