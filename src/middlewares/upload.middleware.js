const path = require('path');
const multer = require('multer');
const env = require('../config/env');
const { ApiError } = require('../utils/errors');

const allowedAvatarMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const allowedCredentialMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const allowedSampleVideoMimeTypes = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm'
]);

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.uploads.maxAvatarSizeBytes,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedAvatarMimeTypes.has(file.mimetype)) {
      return callback(new ApiError(400, 'Avatar must be a JPG, PNG, WEBP, or GIF image', 'INVALID_AVATAR_TYPE'));
    }

    return callback(null, true);
  }
});

const uploadThumbnail = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedAvatarMimeTypes.has(file.mimetype)) {
      return callback(new ApiError(400, 'Thumbnail must be a JPG, PNG, WEBP, or GIF image', 'INVALID_THUMBNAIL_TYPE'));
    }
    return callback(null, true);
  }
});

const uploadVideoChunk = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max per chunk
    files: 1
  }
});

const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = ['.pdf', '.doc', '.docx'];
    const allowedMimes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]);

    if (!allowedExtensions.includes(ext) || !allowedMimes.has(file.mimetype)) {
      return callback(new ApiError(400, 'Unsupported file format. Supported formats: PDF, DOC, DOCX', 'INVALID_ATTACHMENT_TYPE'));
    }
    return callback(null, true);
  }
});

const uploadSubtitle = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max file size
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = ['.vtt', '.srt'];
    const allowedMimes = new Set(['text/vtt', 'application/x-subrip', 'text/plain']);

    if (!allowedExtensions.includes(ext) || !allowedMimes.has(file.mimetype)) {
      return callback(new ApiError(400, 'Unsupported subtitle format. Supported formats: VTT, SRT', 'INVALID_SUBTITLE_TYPE'));
    }
    return callback(null, true);
  }
});

const uploadSubmission = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const forbidden = new Set(['.exe', '.bat', '.sh', '.js', '.vbs']);
    if (forbidden.has(ext)) {
      return callback(new ApiError(400, 'Executable and script file uploads are forbidden for security reasons.', 'INVALID_FILE_TYPE'));
    }
    return callback(null, true);
  }
});

const uploadTutorCredential = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

    if (!allowedExtensions.includes(ext) || !allowedCredentialMimeTypes.has(file.mimetype)) {
      return callback(new ApiError(400, 'Aadhaar must be a PDF, JPG, PNG, or WEBP file', 'INVALID_CREDENTIAL_TYPE'));
    }

    return callback(null, true);
  }
});

const uploadTutorSampleVideo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = ['.mp4', '.mov', '.webm'];

    if (!allowedExtensions.includes(ext) || !allowedSampleVideoMimeTypes.has(file.mimetype)) {
      return callback(new ApiError(400, 'Sample video must be an MP4, MOV, or WEBM file', 'INVALID_SAMPLE_VIDEO_TYPE'));
    }

    return callback(null, true);
  }
});

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedMimes = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain']);

    if (ext !== '.csv' || !allowedMimes.has(file.mimetype)) {
      return callback(new ApiError(400, 'Unsupported file format. Supported format: CSV', 'INVALID_CSV_TYPE'));
    }

    return callback(null, true);
  }
});

module.exports = {
  uploadAvatar,
  uploadThumbnail,
  uploadVideoChunk,
  uploadAttachment,
  uploadTutorCredential,
  uploadTutorSampleVideo,
  uploadSubtitle,
  uploadSubmission,
  uploadCsv
};
