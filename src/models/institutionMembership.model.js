const mongoose = require('mongoose');

const institutionMembershipSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    memberType: {
      type: String,
      enum: ['learner', 'tutor'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'pending_payment', 'pending_approval', 'suspended', 'cancelled'],
      default: 'active',
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending', 'paid'],
      default: 'not_required',
      index: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    approvedAt: {
      type: Date,
      default: null
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

institutionMembershipSchema.index({ institutionId: 1, userId: 1 }, { unique: true });

institutionMembershipSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('InstitutionMembership', institutionMembershipSchema);
