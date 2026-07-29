const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },

    description: { type: String, trim: true, default: '' },

    order: { type: Number, required: true, default: 0 },

    isPublished: { type: Boolean, default: false },

    deletedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

// IMPORTANT INDEXES
moduleSchema.index({ courseId: 1, order: 1, deletedAt: 1 });

moduleSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Module', moduleSchema);