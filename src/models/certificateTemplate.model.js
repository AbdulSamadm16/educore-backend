const mongoose = require('mongoose');

const certificateTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    thumbnailUrl: {
      type: String,
      default: ''
    },
    scope: {
      type: String,
      enum: ['platform', 'institution'],
      required: true,
      index: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      default: null,
      index: true
    },
    version: {
      type: Number,
      default: 1
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

certificateTemplateSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('CertificateTemplate', certificateTemplateSchema);
