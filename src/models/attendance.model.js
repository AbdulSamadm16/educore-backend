const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
  
  joinedAt: { type: Date }, // Stored in UTC
  leftAt: { type: Date }, // Stored in UTC
  totalMinutes: { type: Number, default: 0 },
  
  attendanceStatus: { 
    type: String, 
    enum: ['joined', 'partial', 'completed', 'present', 'absent', 'late'], 
    default: 'joined' 
  },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  markedAt: { type: Date, default: null },
  note: { type: String, trim: true, maxlength: 300, default: '' },
}, { timestamps: true });

attendanceSchema.index({ sessionId: 1, learnerId: 1 }, { unique: true });
attendanceSchema.index({ institutionId: 1, batchId: 1, sessionId: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
