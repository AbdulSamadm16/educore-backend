const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
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

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },

    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },

    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ''
    },

    isVerifiedPurchase: {
      type: Boolean,
      default: false
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

// One review per user per course
reviewSchema.index(
  { userId: 1, courseId: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null }
  }
);

reviewSchema.index({ courseId: 1, rating: -1, deletedAt: 1 });

reviewSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Review', reviewSchema);
