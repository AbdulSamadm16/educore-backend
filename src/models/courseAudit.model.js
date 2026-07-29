const mongoose = require('mongoose');

const courseAuditSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { 
      type: String, 
      enum: ['create', 'update', 'status_change', 'curriculum_update', 'thumbnail_update', 'delete', 'discard_changes', 'approve', 'reject', 'flag_review'],
      required: true 
    },
    changes: {
      from: mongoose.Schema.Types.Mixed,
      to: mongoose.Schema.Types.Mixed
    },
    metadata: {
      userAgent: String,
      ip: String,
      context: String
    }
  },
  { timestamps: true }
);

courseAuditSchema.index({ courseId: 1, createdAt: -1 });

module.exports = mongoose.model('CourseAudit', courseAuditSchema);
