const mongoose = require('mongoose');

const attendanceSessionSchema = new mongoose.Schema({
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true,
    index: true
  },
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    required: true,
    index: true
  },
  tutorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  attendanceDate: {
    type: Date,
    required: true
  },
  topicCovered: {
    type: String,
    trim: true,
    default: ''
  },
  remarks: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'locked'],
    default: 'submitted',
    index: true
  },
  lockedAt: {
    type: Date,
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
    default: null
  }
}, {
  timestamps: true
});

// Unique index to prevent duplicate sessions for same batch on same date
attendanceSessionSchema.index({ batchId: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
