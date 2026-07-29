const mongoose = require('mongoose');

const institutionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  domain: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  description: {
    type: String,
    trim: true,
  },
  logo: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending'],
    default: 'active',
  },
  address: {
    type: String,
    trim: true,
  },
  contactNumber: {
    type: String,
    trim: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  code: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  settings: {
    theme: {
      primaryColor: { type: String, default: '#3b82f6' },
      logoUrl: { type: String, default: '' },
    },
    features: {
      customDomain: { type: Boolean, default: false },
      whiteLabel: { type: Boolean, default: false },
    },
    attendanceEditWindowHours: { type: Number, default: 24 }
  },
  isPublished: {
    type: Boolean,
    default: true,
    index: true
  },
  acceptsEnrollments: {
    type: Boolean,
    default: true,
    index: true
  },
  enrollmentCapacity: {
    type: Number,
    default: null
  },
  metadata: {
    learnerCount: { type: Number, default: 0 },
    courseCount: { type: Number, default: 0 },
  }
}, {
  timestamps: true,
});



const Institution = mongoose.model('Institution', institutionSchema);

module.exports = Institution;
