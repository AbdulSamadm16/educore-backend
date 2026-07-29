const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      select: false
    },
    expiresAt: {
      type: Date,
      required: true
    },
    rememberMe: {
      type: Boolean,
      default: false
    },
    deviceInfo: {
      ip: {
        type: String,
        default: 'unknown'
      },
      userAgent: {
        type: String,
        default: 'unknown'
      }
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true
    },
    revokedReason: {
      type: String,
      default: null
    },
    replacedByTokenHash: {
      type: String,
      default: null,
      select: false
    },
    createdByIp: {
      type: String,
      default: 'unknown'
    },
    revokedByIp: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

refreshTokenSchema.index({ userId: 1, tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ userId: 1, revokedAt: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
