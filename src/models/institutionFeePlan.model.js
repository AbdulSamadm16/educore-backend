const mongoose = require('mongoose');

const institutionFeePlanSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true
    },
    registrationFee: {
      type: Number,
      default: 0
    },
    joiningFee: {
      type: Number,
      default: 0
    },
    monthlyFee: {
      type: Number,
      default: 0
    },
    paymentRequired: {
      type: Boolean,
      default: false
    },
    currency: {
      type: String,
      default: 'INR'
    },
    active: {
      type: Boolean,
      default: true
    },
    version: {
      type: Number,
      default: 1
    },
    effectiveFrom: {
      type: Date,
      default: Date.now
    },
    effectiveTo: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changeReason: {
      type: String
    }
  },
  { timestamps: true }
);

institutionFeePlanSchema.index({ institutionId: 1 }, { unique: true, partialFilterExpression: { active: true } });
institutionFeePlanSchema.index({ institutionId: 1, active: 1 });

institutionFeePlanSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('InstitutionFeePlan', institutionFeePlanSchema);
