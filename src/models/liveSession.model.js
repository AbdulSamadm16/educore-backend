const mongoose = require('mongoose');

const liveSessionSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  
  provider: { type: String, enum: ['google_meet'], default: 'google_meet' },
  meetingId: { type: String },
  meetingUrl: { type: String }, // Protected: NEVER exposed directly in list APIs
  
  startTime: { type: Date, required: true }, // Stored in UTC
  endTime: { type: Date, required: true }, // Stored in UTC
  timezone: { type: String, required: true }, // e.g., 'Asia/Kolkata', 'America/New_York'
  durationMinutes: { type: Number, required: true },
  
  status: { 
    type: String, 
    enum: ['scheduled', 'live', 'completed', 'cancelled', 'rescheduled'], 
    default: 'scheduled',
    index: true 
  },
  
  enrolledSnapshotCount: { type: Number, default: 0 },
  attendanceEnabled: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null }, // Support for soft deletion
}, { timestamps: true });

module.exports = mongoose.model('LiveSession', liveSessionSchema);
