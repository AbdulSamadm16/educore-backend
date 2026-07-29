const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
    certificateNumber: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    blockchainTxId: {
      type: String,
      default: null
    },
    issueDate: {
      type: Date,
      default: Date.now
    },
    pdfUrl: {
      type: String,
      default: null
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CertificateTemplate',
      default: null,
      index: true
    },
    templateVersion: {
      type: Number,
      default: null
    },
    verificationUrl: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['processing', 'issued', 'failed', 'revoked'],
      default: 'processing',
      index: true
    }
  },
  { timestamps: true }
);

certificateSchema.index({ userId: 1, courseId: 1 }, { unique: true });

certificateSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Certificate', certificateSchema);
