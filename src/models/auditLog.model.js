const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    action: {
      type: String,
      required: true,
      enum: [
        'BAN_USER', 'UNBAN_USER', 'SUSPEND_USER', 'UNSUSPEND_USER', 'CHANGE_ROLE', 'SOFT_DELETE_USER', 'APPROVE_TUTOR', 'REJECT_TUTOR', 'ADMIN_CREATE_USER', 'SELF_REGISTER',
        'INSTITUTION_SEARCH', 'ENROLLMENT_INITIATED', 'PAYMENT_STARTED', 'PAYMENT_FAILED', 'PAYMENT_RETRIED', 'PAYMENT_COMPLETED', 'MEMBERSHIP_CREATED', 'ENROLLMENT_COMPLETED',
        'MEMBERSHIP_SUSPENDED', 'MEMBERSHIP_CANCELLED', 'MEMBERSHIP_ACTIVATED',
        'TUTOR_ASSIGNED', 'TUTOR_REMOVED', 'TUTOR_REASSIGNED',
        'FRAUD_ALERT', 'INVOICE_GENERATED', 'CAPACITY_WARNING',
        'ATTENDANCE_CREATED', 'ATTENDANCE_UPDATED', 'ATTENDANCE_LOCKED', 'ATTENDANCE_EXPORTED', 
        'ATTENDANCE_VIEWED', 'ATTENDANCE_REPORT_EXPORTED', 'ATTENDANCE_OVERRIDE',
        'FEE_PLAN_CREATED', 'FEE_PLAN_UPDATED', 'FEE_PLAN_ACTIVATED', 'FEE_PLAN_DEACTIVATED', 'PAYMENT_REQUIREMENT_CHANGED',
        'CREATE_INSTITUTION', 'UPDATE_INSTITUTION', 'DISABLE_INSTITUTION', 'ENABLE_INSTITUTION', 'ASSIGN_INSTITUTION_ADMIN'
      ]
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ip: {
      type: String,
      default: 'unknown'
    },
    userAgent: {
      type: String,
      default: 'unknown'
    }
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false
    }
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });
auditLogSchema.index({ targetUserId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
