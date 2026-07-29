const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Lesson = require('../models/lesson.model');
const Course = require('../models/course.model');
const Enrollment = require('../models/enrollment.model');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const emailService = require('./email.service');
const notificationService = require('./notification.service');
const env = require('../config/env');
const { ApiError } = require('../utils/errors');
const { isAdminRole } = require('../utils/roles');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const TEMP_DIR = path.join(UPLOADS_DIR, 'temp');
const VIDEOS_DIR = path.join(UPLOADS_DIR, 'videos');

// Ensure necessary directories exist for local fallback
// Ensure necessary directories exist only for local development
if (!process.env.VERCEL) {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

/**
 * Helper to format duration in seconds to standard readable format (e.g. 14m 33s)
 */
const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  let formatted = '';
  if (hrs > 0) {
    formatted += `${hrs}h `;
  }
  if (mins > 0 || hrs > 0) {
    formatted += `${mins}m `;
  }
  formatted += `${secs}s`;
  return formatted.trim();
};

/**
 * Zero-dependency pure-JS MP4 movie header box parser to extract exact duration
 */
const getMp4Duration = (filePath) => {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // Try to read first 128KB
    let buffer = Buffer.alloc(Math.min(128 * 1024, fileSize));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    let mvhdOffset = buffer.indexOf(Buffer.from('mvhd'));

    // If not found, try reading last 256KB
    if (mvhdOffset === -1 && fileSize > buffer.length) {
      const readSize = Math.min(256 * 1024, fileSize);
      buffer = Buffer.alloc(readSize);
      fs.readSync(fd, buffer, 0, buffer.length, fileSize - readSize);
      mvhdOffset = buffer.indexOf(Buffer.from('mvhd'));
    }

    if (mvhdOffset === -1) {
      return 0;
    }

    const version = buffer.readUInt8(mvhdOffset + 4);
    let timescale = 0;
    let duration = 0;

    if (version === 1) {
      timescale = buffer.readUInt32BE(mvhdOffset + 24);
      if (typeof buffer.readBigUInt64BE === 'function') {
        duration = Number(buffer.readBigUInt64BE(mvhdOffset + 28));
      } else {
        const high = buffer.readUInt32BE(mvhdOffset + 28);
        const low = buffer.readUInt32BE(mvhdOffset + 32);
        duration = high * 4294967296 + low;
      }
    } else {
      timescale = buffer.readUInt32BE(mvhdOffset + 16);
      duration = buffer.readUInt32BE(mvhdOffset + 20);
    }

    if (timescale > 0) {
      return Math.round(duration / timescale);
    }
    return 0;
  } catch (error) {
    console.error('Failed to parse MP4 duration', error);
    return 0;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
};

// Simple, high-performance in-memory cache for lesson validation and status checks.
// Since status checking polls the endpoint, caching authorization metadata dramatically reduces database read loads.
const lessonCache = new Map();
const CACHE_TTL = 15000; // 15 seconds TTL is plenty for active polling sequences

/**
 * Helper to invalidate the lesson access and status cache when modified
 */
const invalidateLessonCache = (lessonId) => {
  if (!lessonId) return;
  const targetId = String(lessonId);
  for (const key of lessonCache.keys()) {
    if (key.startsWith(`${targetId}_`)) {
      lessonCache.delete(key);
    }
  }
};

/**
 * Wraps lesson document saves, invalidating the cache atomically to ensure fresh polling reads
 */
const saveLessonAndClearCache = async (lesson) => {
  if (!lesson) return;
  await lesson.save();
  invalidateLessonCache(lesson._id || lesson.id);
};

/**
 * Helper to validate user has write access to the lesson (with high-performance cache boundary)
 */
const validateLessonAccess = async (lessonId, user) => {
  const cacheKey = `${String(lessonId)}_${String(user._id)}`;
  const now = Date.now();
  const cached = lessonCache.get(cacheKey);

  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  // Hydrate only Lesson to support document mutations/saves
  const lesson = await Lesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) {
    throw new ApiError(404, 'Lesson not found', 'LESSON_NOT_FOUND');
  }

  // Retrieve Course as a lean object to save huge hydration/parsing CPU overhead
  const course = await Course.findOne({ _id: lesson.courseId, deletedAt: null }).lean();
  if (!course) {
    throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');
  }

  const isOwner = course.authorId && String(course.authorId) === String(user._id);
  const isAdmin = isAdminRole(user.role);

  if (!isOwner && !isAdmin) {
    throw new ApiError(403, 'Not authorized to modify this course content', 'ACCESS_DENIED');
  }

  const data = { lesson, course };
  lessonCache.set(cacheKey, { timestamp: now, data });
  return data;
};

/**
 * Checks if Mux is fully configured in the environment
 */
const isMuxEnabled = () => {
  return !!(env.mux.tokenId && env.mux.tokenSecret);
};

/**
 * Helper to make authenticated requests to Mux API
 */
const callMuxAPI = async (method, endpoint, data = null) => {
  const authHeader = Buffer.from(`${env.mux.tokenId}:${env.mux.tokenSecret}`).toString('base64');
  
  try {
    const response = await axios({
      method,
      url: `https://api.mux.com/video/v1${endpoint}`,
      data,
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data.data;
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error('[MUX API ERROR]:', errorDetails);
    throw new ApiError(502, 'Mux integration gateway communication failed', 'MUX_INTEGRATION_ERROR', errorDetails);
  }
};

/**
 * Initialize Resumable Video Upload Session
 * (Dual Mode: Mux Cloud Upload, with Local Chunked Upload fallback)
 */
const initializeUpload = async ({ lessonId, fileName, fileSize, notifyLearners, user }) => {
  const { lesson } = await validateLessonAccess(lessonId, user);

  // Validate File Size (Max 2GB)
  const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  if (fileSize > MAX_SIZE) {
    throw new ApiError(400, 'Video file size exceeds the maximum limit of 2GB', 'FILE_TOO_LARGE');
  }

  // Set notifyEnrolledOnReady flag to persist tutor's notification choice
  lesson.notifyEnrolledOnReady = !!notifyLearners;

  // Validate Extension (MP4, MOV, AVI)
  const ext = path.extname(fileName).toLowerCase();
  if (!['.mp4', '.mov', '.avi'].includes(ext)) {
    throw new ApiError(400, 'Invalid video format. Supported formats: MP4, MOV, AVI', 'INVALID_FILE_TYPE');
  }

  // ==========================================
  // MODE 1: MUX CLOUD DIRECT UPLOAD
  // ==========================================
  if (isMuxEnabled()) {
    console.log(`[VIDEO SERVICE] Mux is enabled. Attempting direct Mux upload for lesson ${lessonId}.`);
    
    try {
      // Request a Direct Upload Link from Mux
      const uploadSession = await callMuxAPI('POST', '/uploads', {
        new_asset_settings: {
          playback_policy: ['public'],
          passthrough: String(lessonId), // Bind Mux asset to our database Lesson ID
          mp4_support: 'capped-1080p'
        },
        cors_origin: '*'
      });

      // Update Lesson state
      lesson.videoStatus = 'Uploading';
      lesson.videoUploadId = uploadSession.id;
      lesson.videoProcessingError = null;
      await saveLessonAndClearCache(lesson);

      return {
        mode: 'mux',
        uploadId: uploadSession.id,
        uploadUrl: uploadSession.url,
        fileName,
        fileSize
      };
    } catch (muxErr) {
      // Mux API failed — fall through to local chunked upload
      console.error('[VIDEO SERVICE] Mux API call failed. Falling back to local chunked upload:', muxErr.message || muxErr);
    }
  }

  // ==========================================
  // MODE 2: LOCAL CHUNKED FALLBACK (Fully robust)
  // ==========================================
  console.log(`[VIDEO SERVICE] Mux is not configured. Falling back to local chunked upload for lesson ${lessonId}.`);
  const uploadId = crypto.randomBytes(16).toString('hex');
  
  lesson.videoStatus = 'Uploading';
  lesson.videoUploadId = uploadId;
  lesson.videoProcessingError = null;
  await saveLessonAndClearCache(lesson);

  const sessionTempDir = path.join(TEMP_DIR, uploadId);
  if (!fs.existsSync(sessionTempDir)) {
    fs.mkdirSync(sessionTempDir, { recursive: true });
  }

  const meta = {
    lessonId,
    uploadId,
    fileName,
    fileSize,
    ext,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(sessionTempDir, 'metadata.json'), JSON.stringify(meta, null, 2));

  return {
    mode: 'local',
    uploadId,
    fileName,
    fileSize,
    ext,
    chunkSize: 5 * 1024 * 1024 // Recommend 5MB chunks
  };
};

/**
 * Retrieve Upload Status and Received Chunk Indexes (for Resume support)
 */
const getUploadStatus = async ({ lessonId, user }) => {
  const { lesson } = await validateLessonAccess(lessonId, user);

  const uploadId = lesson.videoUploadId;
  if (!uploadId) {
    return {
      videoStatus: lesson.videoStatus,
      uploadedChunks: [],
      error: lesson.videoProcessingError
    };
  }

  // If Mux is enabled, query Mux for status AND proactively update lesson
  // when Mux reports the asset is ready (bypasses webhook for localhost dev)
  if (isMuxEnabled()) {
    try {
      const uploadSession = await callMuxAPI('GET', `/uploads/${uploadId}`);
      const muxStatus = uploadSession.status; // "waiting" | "asset_created" | "errored" | "cancelled" | "timed_out"

      // If Mux has created the asset but our DB still shows Uploading/Processing,
      // proactively resolve it — this handles the case where Mux webhooks can't reach localhost
      if (muxStatus === 'asset_created' && lesson.videoStatus !== 'Ready') {
        const assetId = uploadSession.asset_id;
        if (assetId) {
          try {
            const asset = await callMuxAPI('GET', `/assets/${assetId}`);
            
            if (asset.status === 'ready') {
              // Asset is fully transcoded — update lesson to Ready
              const playbackId = asset.playback_ids?.[0]?.id;
              if (playbackId) {
                lesson.videoStatus = 'Ready';
                lesson.videoUrl = `https://stream.mux.com/${playbackId}.m3u8`;
                const muxDuration = asset.duration ? Math.round(asset.duration) : 0;
                lesson.durationSeconds = muxDuration;
                lesson.durationFormatted = formatDuration(muxDuration);
                lesson.durationInMinutes = Math.max(1, Math.round(muxDuration / 60));
                await saveLessonAndClearCache(lesson);

                // Load course so we can send notifications correctly
                const resolvedCourse = await Course.findById(lesson.courseId).lean();
                const courseTitle = resolvedCourse ? resolvedCourse.title : 'the course';

                // Notify enrolled learners only if the tutor checked the checkbox
                await notifyLearnersOnVideoReady(lesson, courseTitle);

                // Always notify the tutor that their video is ready
                if (resolvedCourse) {
                  await notificationService.createNotification({
                    userId: resolvedCourse.authorId,
                    title: 'Video Processing Completed',
                    message: `Your video for lesson "${lesson.title}" in course "${courseTitle}" is ready!`,
                    type: 'success'
                  });

                  // Notify the tutor via email
                  try {
                    const tutor = await User.findById(resolvedCourse.authorId).select('name email').lean();
                    if (tutor && tutor.email) {
                      await emailService.sendVideoReadyEmail({
                        to: tutor.email,
                        tutorName: tutor.name,
                        courseTitle: courseTitle,
                        lessonTitle: lesson.title
                      });
                    }
                  } catch (emailErr) {
                    console.error('[VIDEO SERVICE] Proactive email notification failure:', emailErr.message);
                  }
                }

                console.log(`[VIDEO SERVICE] Proactively resolved Mux asset for lesson ${lessonId} via polling.`);
              }
            } else if (asset.status === 'preparing') {
              // Mux is still transcoding — update our status to Processing
              if (lesson.videoStatus !== 'Processing') {
                lesson.videoStatus = 'Processing';
                await saveLessonAndClearCache(lesson);
              }
            } else if (asset.status === 'errored') {
              lesson.videoStatus = 'Failed';
              lesson.videoProcessingError = asset.errors?.messages?.[0] || 'Mux transcoding failed.';
              await saveLessonAndClearCache(lesson);
            }
          } catch (assetErr) {
            console.error('[VIDEO SERVICE] Failed to fetch Mux asset status:', assetErr.message);
          }
        }
      } else if (muxStatus === 'errored') {
        if (lesson.videoStatus !== 'Failed') {
          lesson.videoStatus = 'Failed';
          lesson.videoProcessingError = 'Mux upload failed.';
          await saveLessonAndClearCache(lesson);
        }
      }

      return {
        mode: 'mux',
        videoStatus: lesson.videoStatus,
        uploadId,
        muxStatus,
        error: lesson.videoProcessingError
      };
    } catch (err) {
      // Fall through to database state if Mux check fails
      console.error('[VIDEO SERVICE] Mux status check failed, falling back to DB state:', err.message);
    }
  }

  // Local fallback status check
  const sessionTempDir = path.join(TEMP_DIR, uploadId);
  if (!fs.existsSync(sessionTempDir)) {
    return {
      mode: 'local',
      videoStatus: lesson.videoStatus,
      uploadedChunks: [],
      error: lesson.videoProcessingError
    };
  }

  const files = fs.readdirSync(sessionTempDir);
  const uploadedChunks = files
    .filter(file => file.startsWith('chunk_'))
    .map(file => parseInt(file.split('_')[1], 10))
    .sort((a, b) => a - b);

  return {
    mode: 'local',
    videoStatus: lesson.videoStatus,
    uploadId,
    uploadedChunks,
    error: lesson.videoProcessingError
  };
};

/**
 * Upload Video Chunk (Used in Local Fallback mode)
 */
const uploadChunk = async ({ lessonId, uploadId, chunkIndex, fileBuffer, user }) => {
  const { lesson } = await validateLessonAccess(lessonId, user);

  if (lesson.videoUploadId !== uploadId) {
    throw new ApiError(400, 'Invalid or expired upload session', 'INVALID_SESSION');
  }

  const sessionTempDir = path.join(TEMP_DIR, uploadId);
  if (!fs.existsSync(sessionTempDir)) {
    throw new ApiError(400, 'Upload session temp directory does not exist.', 'SESSION_EXPIRED');
  }

  const chunkPath = path.join(sessionTempDir, `chunk_${chunkIndex}`);
  fs.writeFileSync(chunkPath, fileBuffer);

  return {
    success: true,
    chunkIndex
  };
};

/**
 * Complete Chunked Upload (Used in Local Fallback mode)
 */
const completeUpload = async ({ lessonId, uploadId, totalChunks, user }) => {
  const { lesson, course } = await validateLessonAccess(lessonId, user);

  if (lesson.videoUploadId !== uploadId) {
    throw new ApiError(400, 'Invalid or expired upload session', 'INVALID_SESSION');
  }

  const sessionTempDir = path.join(TEMP_DIR, uploadId);
  if (!fs.existsSync(sessionTempDir)) {
    throw new ApiError(400, 'Upload session temp directory does not exist.', 'SESSION_EXPIRED');
  }

  let ext = '.mp4';
  try {
    const metaStr = fs.readFileSync(path.join(sessionTempDir, 'metadata.json'), 'utf8');
    const meta = JSON.parse(metaStr);
    ext = meta.ext || '.mp4';
  } catch (err) {}

  // Verify all chunks are present
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(sessionTempDir, `chunk_${i}`);
    if (!fs.existsSync(chunkPath)) {
      throw new ApiError(400, `Missing chunk at index ${i}. Upload incomplete.`, 'MISSING_CHUNK');
    }
  }

  // Assemble using a Promise to ensure it's fully written before we delete or start processing
  const finalFileName = `${lessonId}${ext}`;
  const finalFilePath = path.join(VIDEOS_DIR, finalFileName);

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(finalFilePath);
    writeStream.on('finish', resolve);
    writeStream.on('error', (err) => {
      writeStream.destroy();
      reject(err);
    });

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(sessionTempDir, `chunk_${i}`);
        const data = fs.readFileSync(chunkPath);
        writeStream.write(data);
      }
      writeStream.end();
    } catch (err) {
      writeStream.destroy();
      reject(err);
    }
  });

  // Determine file size to pass to simulator
  let fileSize = 0;
  try {
    const stats = fs.statSync(finalFilePath);
    fileSize = stats.size;
  } catch (statErr) {
    console.error('[VIDEO SERVICE] Error getting final video file size:', statErr);
  }

  // Clean up temp folder asynchronously
  process.nextTick(() => {
    try {
      const files = fs.readdirSync(sessionTempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(sessionTempDir, file));
      }
      fs.rmdirSync(sessionTempDir);
    } catch (cleanupErr) {
      console.error('Failed to clean up temp upload folder:', cleanupErr);
    }
  });

  lesson.videoStatus = 'Processing';
  await saveLessonAndClearCache(lesson);

  // Trigger local background transcode simulation
  simulateVideoProcessing({
    lessonId,
    courseTitle: course.title,
    lessonTitle: lesson.title,
    videoFileName: finalFileName,
    tutorId: course.authorId,
    tutorEmail: user.email,
    tutorName: user.name,
    fileSize
  });

  return {
    success: true,
    videoStatus: 'Processing'
  };
};

/**
 * Local Fallback Video Transcoding Simulator
 */
const simulateVideoProcessing = (params) => {
  const { lessonId, courseTitle, lessonTitle, videoFileName, tutorId, tutorEmail, tutorName, fileSize } = params;

  // Dynamic simulation delay based on video size:
  // - Small videos (< 5MB): 1.5 seconds
  // - Medium videos (5MB - 50MB): 4 seconds
  // - Large videos (> 50MB): 10 seconds
  let processingDelay = 10000; // default 10s
  if (fileSize) {
    const sizeInMB = fileSize / (1024 * 1024);
    if (sizeInMB < 5) {
      processingDelay = 1500;
    } else if (sizeInMB < 50) {
      processingDelay = 4000;
    }
  }

  console.log(`[VIDEO PROCESSOR] Scheduled simulated transcoding for lesson ${lessonId} (${(fileSize / (1024*1024)).toFixed(2)} MB) to complete in ${processingDelay}ms.`);

  setTimeout(async () => {
    try {
      const lesson = await Lesson.findOne({ _id: lessonId, deletedAt: null });
      if (!lesson) return;

      const filePath = path.join(VIDEOS_DIR, videoFileName);
      let durationSeconds = 0;
      if (fs.existsSync(filePath)) {
        durationSeconds = getMp4Duration(filePath);
      }

      // Safe fallback if duration extraction returns 0
      if (durationSeconds <= 0) {
        const sizeInMB = fileSize ? (fileSize / (1024 * 1024)) : 0;
        durationSeconds = Math.max(10, Math.round(sizeInMB * 60)) || 180;
      }

      lesson.videoStatus = 'Ready';
      lesson.videoUrl = `/uploads/videos/${videoFileName}`;
      lesson.durationSeconds = durationSeconds;
      lesson.durationFormatted = formatDuration(durationSeconds);
      lesson.durationInMinutes = Math.max(1, Math.round(durationSeconds / 60));
      await saveLessonAndClearCache(lesson);

      // Notify learners ONLY if the tutor checked the checkbox (notifyEnrolledOnReady === true)
      console.log(`[VIDEO PROCESSOR] notifyEnrolledOnReady for lesson ${lessonId}: ${lesson.notifyEnrolledOnReady}`);
      await notifyLearnersOnVideoReady(lesson, courseTitle);

      // Always notify the tutor — their personal video-ready alert is unconditional
      console.log(`[VIDEO PROCESSOR] Sending tutor notification to userId: ${tutorId}`);
      await notificationService.createNotification({
        userId: tutorId,
        title: 'Video Processing Completed',
        message: `Your video for lesson "${lessonTitle}" in course "${courseTitle}" is ready!`,
        type: 'success'
      });

      // Wrap email notification in its own try-catch so SMTP/Brevo failure doesn't brick the upload!
      if (tutorEmail) {
        try {
          await emailService.sendVideoReadyEmail({
            to: tutorEmail,
            tutorName: tutorName,
            courseTitle: courseTitle,
            lessonTitle: lessonTitle
          });
        } catch (emailErr) {
          console.error('[VIDEO PROCESSOR] Non-fatal email notification failure:', emailErr);
        }
      }
    } catch (err) {
      console.error('[VIDEO PROCESSOR] Error processing video async:', err);
      try {
        const lesson = await Lesson.findOne({ _id: lessonId });
        if (lesson) {
          lesson.videoStatus = 'Failed';
          lesson.videoProcessingError = err.message || 'Transcoding simulation failed.';
          await saveLessonAndClearCache(lesson);
        }
      } catch (dbErr) {}
    }
  }, processingDelay);
};

/**
 * Handle Webhooks from Mux cloud to process video state changes securely
 */
const handleMuxWebhook = async (event) => {
  const type = event.type;
  console.log(`[MUX WEBHOOK RECEIVED] Event: ${type}`);

  // We bind the lessonId inside passthrough field during initialization
  const lessonId = event.data?.passthrough;
  if (!lessonId) {
    console.log('[MUX WEBHOOK] No passthrough field containing lessonId found. Skipping.');
    return;
  }

  const lesson = await Lesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) {
    console.error(`[MUX WEBHOOK] Lesson not found with ID ${lessonId}`);
    return;
  }

  const course = await Course.findById(lesson.courseId);
  const tutor = course ? await User.findById(course.authorId) : null;

  switch (type) {
    // 1. Video completed uploading and processing started
    case 'video.upload.asset_created':
      lesson.videoStatus = 'Processing';
      await saveLessonAndClearCache(lesson);
      break;

    // 2. Video processing completed. HLS stream ready!
    case 'video.asset.ready':
      const playbackId = event.data.playback_ids?.[0]?.id;
      if (!playbackId) {
        console.error('[MUX WEBHOOK] playbackId is missing from event data!');
        return;
      }

      lesson.videoStatus = 'Ready';
      // Mux Adaptive HLS streaming URL!
      lesson.videoUrl = `https://stream.mux.com/${playbackId}.m3u8`;
      const muxDuration = event.data.duration ? Math.round(event.data.duration) : 0;
      lesson.durationSeconds = muxDuration;
      lesson.durationFormatted = formatDuration(muxDuration);
      lesson.durationInMinutes = Math.max(1, Math.round(muxDuration / 60));
      await saveLessonAndClearCache(lesson);

      // Notify learners if the checkbox was enabled
      await notifyLearnersOnVideoReady(lesson, course ? course.title : 'the course');

      // Trigger In-App Notification
      await notificationService.createNotification({
        userId: course.authorId,
        title: 'Video Processing Completed (Mux)',
        message: `Your video for lesson "${lesson.title}" in course "${course.title}" has been transcoded by Mux and is ready for adaptive streaming!`,
        type: 'success'
      });

      // Trigger Email Notification via Brevo
      if (tutor && tutor.email) {
        await emailService.sendVideoReadyEmail({
          to: tutor.email,
          tutorName: tutor.name,
          courseTitle: course.title,
          lessonTitle: lesson.title
        });
      }
      break;

    // 3. Mux transcoding error occurred
    case 'video.asset.errored':
      const muxError = event.data.errors?.message || 'Mux video transcoding failed.';
      lesson.videoStatus = 'Failed';
      lesson.videoProcessingError = muxError;
      await saveLessonAndClearCache(lesson);

      // Notify Tutor
      await notificationService.createNotification({
        userId: course.authorId,
        title: 'Video Processing Failed (Mux)',
        message: `The Mux transcoder failed to process your video for "${lesson.title}". Reason: ${muxError}`,
        type: 'error'
      });
      break;

    default:
      console.log(`[MUX WEBHOOK] Unhandled event type: ${type}`);
  }
};

/**
 * Generates a secure, time-limited, user-specific signed video URL
 */
const signVideoUrl = (videoUrl, lessonId, userId) => {
  if (!videoUrl || typeof videoUrl !== 'string') return null;

  // Defensive validation to prevent unsafe/malformed URLs from entering the player
  if (!videoUrl.startsWith('http') && !videoUrl.startsWith('/uploads/') && !videoUrl.startsWith('/api/')) {
    return null;
  }
  // 1. Mux Public Playback URLs — pass through without signing.
  // The upload-init flow creates assets with playback_policy: ['public'],
  // so Mux HLS URLs work without any token. Adding a signed JWT token to a
  // public playback URL can cause HLS.js segment fetch failures because
  // individual .ts segment sub-requests inside the manifest won't carry the token.
  // NOTE: To enable signed playback, change upload-init to use 'signed' policy
  // and uncomment the signing logic below.
  if (videoUrl.includes('stream.mux.com')) {
    return videoUrl;
  }

  // 2. Local Fallback Secure Signed Streaming Route
  if (
    videoUrl.startsWith('/uploads/videos/') ||
    videoUrl.includes('/uploads/videos/') ||
    videoUrl.includes('/video/stream')
  ) {
    try {
      const token = jwt.sign(
        {
          userId: userId ? String(userId) : 'guest',
          lessonId: String(lessonId)
        },
        env.jwt.accessSecret,
        { expiresIn: '2h' } // 2 hours expiration
      );

      return `/api/v1/lessons/${lessonId}/video/stream?token=${token}`;
    } catch (err) {
      console.error('[VIDEO SERVICE] Error signing local video path:', err);
      return videoUrl;
    }
  }

  return videoUrl;
};

/**
 * Seekable chunk streaming endpoint for local videos, requiring valid signed URL
 */
const streamLocalVideo = async (req, res) => {
  const { id: lessonId } = req.params;
  const { token } = req.query;

  if (!token) {
    throw new ApiError(401, 'Access token is required to stream this content', 'ACCESS_TOKEN_REQUIRED');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.accessSecret);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired stream token', 'INVALID_STREAM_TOKEN');
  }

  if (String(decoded.lessonId) !== String(lessonId)) {
    throw new ApiError(400, 'Token does not match the requested lesson ID', 'INVALID_STREAM_TOKEN');
  }

  // Fetch lesson & course
  const lesson = await Lesson.findOne({ _id: lessonId, deletedAt: null });
  if (!lesson) {
    throw new ApiError(404, 'Lesson not found', 'LESSON_NOT_FOUND');
  }

  // Enforce access control
  if (!lesson.isPreview) {
    if (decoded.userId === 'guest') {
      throw new ApiError(403, 'Sign-in and enrollment required to access this lesson', 'ENROLLMENT_REQUIRED');
    }

    const course = await Course.findOne({ _id: lesson.courseId, deletedAt: null });
    if (!course) {
      throw new ApiError(404, 'Parent course not found', 'COURSE_NOT_FOUND');
    }

    // Check enrollment
    const enrollment = await Enrollment.findOne({
      userId: decoded.userId,
      courseId: lesson.courseId,
      deletedAt: null,
      status: 'active'
    });

    const isAuthor = course.authorId && String(course.authorId) === String(decoded.userId);
    
    let isAdmin = false;
    if (decoded.userId && decoded.userId !== 'guest') {
      const userObj = await User.findById(decoded.userId).select('role').lean();
      if (userObj && isAdminRole(userObj.role)) {
        isAdmin = true;
      }
    }

    if (!enrollment && !isAuthor && !isAdmin) {
      throw new ApiError(403, 'Active course enrollment required to access this secure stream', 'ENROLLMENT_REQUIRED');
    }

    // Check sequential progress locks
    if (course.isSequential && !isAuthor && !isAdmin) {
      const Module = require('../models/module.model');
      const allModules = await Module.find({ courseId: lesson.courseId, deletedAt: null, isPublished: true }).sort({ order: 1 }).lean();
      const allLessons = await Lesson.find({ courseId: lesson.courseId, deletedAt: null, isPublished: true }).sort({ order: 1 }).lean();
      
      const Progress = require('../models/progress.model');
      const progressObj = await Progress.findOne({
        userId: decoded.userId,
        courseId: lesson.courseId,
        deletedAt: null
      }).lean();
      
      const completedLessons = progressObj ? (progressObj.completedLessons || []).map(id => String(id)) : [];
      
      // Let's compute lock states
      const moduleLessonsMap = new Map();
      allLessons.forEach(l => {
        const mId = String(l.moduleId);
        if (!moduleLessonsMap.has(mId)) {
          moduleLessonsMap.set(mId, []);
        }
        moduleLessonsMap.get(mId).push(l);
      });

      allModules.forEach(m => {
        const list = moduleLessonsMap.get(String(m._id)) || [];
        list.sort((a, b) => a.order - b.order);
        moduleLessonsMap.set(String(m._id), list);
      });

      const moduleCompleted = new Map();
      allModules.forEach(m => {
        const list = moduleLessonsMap.get(String(m._id)) || [];
        if (list.length === 0) {
          moduleCompleted.set(String(m._id), true);
        } else {
          const allDone = list.every(l => completedLessons.includes(String(l._id)));
          moduleCompleted.set(String(m._id), allDone);
        }
      });

      const moduleUnlocked = new Map();
      allModules.forEach((m, mIdx) => {
        if (mIdx === 0) {
          moduleUnlocked.set(String(m._id), true);
        } else {
          const prevM = allModules[mIdx - 1];
          const prevUnlocked = moduleUnlocked.get(String(prevM._id)) || false;
          const prevCompleted = moduleCompleted.get(String(prevM._id)) || false;
          moduleUnlocked.set(String(m._id), prevUnlocked && prevCompleted);
        }
      });

      const flatLessons = [];
      allModules.forEach(m => {
        const list = moduleLessonsMap.get(String(m._id)) || [];
        flatLessons.push(...list);
      });

      // Let's compute cascading lock states
      const lessonLocked = new Map();
      flatLessons.forEach((l, idx) => {
        const mId = String(l.moduleId);
        const mUnlocked = moduleUnlocked.get(mId) || false;
        let isLocked = false;

        if (!mUnlocked) {
          isLocked = true;
        } else if (idx > 0) {
          const prevL = flatLessons[idx - 1];
          const prevLocked = lessonLocked.get(String(prevL._id)) || false;
          const prevCompleted = completedLessons.includes(String(prevL._id));
          if (prevLocked || !prevCompleted) {
            isLocked = true;
          }
        }
        lessonLocked.set(String(l._id), isLocked);
      });

      const isLocked = lessonLocked.get(String(lesson._id)) || false;
      if (isLocked) {
        throw new ApiError(403, 'Access denied. This video is locked until the previous lessons and modules are completed.', 'LESSON_LOCKED');
      }
    }
  }

  // Resolve file path dynamically
  const VIDEOS_DIR = path.join(__dirname, '../../uploads/videos');
  if (!fs.existsSync(VIDEOS_DIR)) {
    throw new ApiError(404, 'Local video directory not initialized', 'ASSET_NOT_FOUND');
  }

  const files = fs.readdirSync(VIDEOS_DIR);
  const videoFile = files.find(f => f.startsWith(String(lessonId)));

  if (!videoFile) {
    throw new ApiError(404, 'Secure video asset file not found on disk', 'ASSET_NOT_FOUND');
  }

  const filePath = path.join(VIDEOS_DIR, videoFile);
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Set security headers to prevent downloading/screen-capturing easily
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
};

/**
 * Automatically recovers stranded "Processing" videos on server startup.
 * If local fallback: checks if assembled file exists on disk and re-triggers simulation.
 * If Mux: queries Mux to check status and updates lesson accordingly.
 */
const recoverStrandedProcessingVideos = async () => {
  try {
    const strandedLessons = await Lesson.find({ videoStatus: 'Processing', deletedAt: null });
    if (strandedLessons.length === 0) return;

    console.log(`[VIDEO RECOVERY] Found ${strandedLessons.length} stranded lesson(s) in 'Processing' state.`);

    for (const lesson of strandedLessons) {
      const lessonId = lesson._id || lesson.id;
      
      // 1. If Mux is enabled, query Mux API
      if (isMuxEnabled() && lesson.videoUploadId) {
        try {
          console.log(`[VIDEO RECOVERY] Querying Mux for lesson ${lessonId} upload status...`);
          const uploadSession = await callMuxAPI('GET', `/uploads/${lesson.videoUploadId}`);
          
          if (uploadSession.status === 'asset_created' && uploadSession.asset_id) {
            console.log(`[VIDEO RECOVERY] Mux asset created for lesson ${lessonId}. Querying asset details...`);
            const assetDetails = await callMuxAPI('GET', `/assets/${uploadSession.asset_id}`);
            
            if (assetDetails.status === 'ready') {
              const playbackId = assetDetails.playback_ids?.[0]?.id;
              if (playbackId) {
                lesson.videoStatus = 'Ready';
                lesson.videoUrl = `https://stream.mux.com/${playbackId}.m3u8`;
                lesson.durationInMinutes = Math.round(assetDetails.duration / 60) || 1;
                await saveLessonAndClearCache(lesson);
                console.log(`[VIDEO RECOVERY] Successfully recovered lesson ${lessonId} to 'Ready' using Mux asset.`);
              }
            } else if (assetDetails.status === 'errored') {
              lesson.videoStatus = 'Failed';
              lesson.videoProcessingError = assetDetails.errors?.message || 'Mux transcoding failed.';
              await saveLessonAndClearCache(lesson);
              console.log(`[VIDEO RECOVERY] Lesson ${lessonId} Mux asset was in errored state. Updated to 'Failed'.`);
            } else {
              console.log(`[VIDEO RECOVERY] Mux asset is still ${assetDetails.status}. Waiting for webhook or next poll.`);
            }
          } else if (uploadSession.status === 'errored') {
            lesson.videoStatus = 'Failed';
            lesson.videoProcessingError = 'Mux upload session errored.';
            await saveLessonAndClearCache(lesson);
            console.log(`[VIDEO RECOVERY] Lesson ${lessonId} Mux upload session errored. Updated to 'Failed'.`);
          }
        } catch (muxErr) {
          console.error(`[VIDEO RECOVERY] Mux recovery failed for lesson ${lessonId}:`, muxErr.message);
        }
        continue;
      }

      // 2. Local Fallback Mode Check
      const files = fs.existsSync(VIDEOS_DIR) ? fs.readdirSync(VIDEOS_DIR) : [];
      const videoFile = files.find(f => f.startsWith(String(lessonId)));

      if (videoFile) {
        const filePath = path.join(VIDEOS_DIR, videoFile);
        let fileSize = 0;
        try {
          fileSize = fs.statSync(filePath).size;
        } catch (err) {}

        const course = await Course.findById(lesson.courseId).lean();
        const tutor = course ? await User.findById(course.authorId).lean() : null;

        console.log(`[VIDEO RECOVERY] Local file found for lesson ${lessonId} (${videoFile}). Re-triggering processing simulation...`);

        // Re-simulate with a short recovery delay
        simulateVideoProcessing({
          lessonId,
          courseTitle: course?.title || 'Unknown Course',
          lessonTitle: lesson.title,
          videoFileName: videoFile,
          tutorId: course?.authorId,
          tutorEmail: tutor?.email,
          tutorName: tutor?.name,
          fileSize
        });
      } else {
        // No local file found, and not using Mux or uploadId is missing -> mark as Failed
        console.log(`[VIDEO RECOVERY] No file or active Mux session found for processing lesson ${lessonId}. Marking as 'Failed'.`);
        lesson.videoStatus = 'Failed';
        lesson.videoProcessingError = 'Video processing interrupted by server shutdown.';
        await saveLessonAndClearCache(lesson);
      }
    }
  } catch (err) {
    console.error('[VIDEO RECOVERY] Fatal error in startup video recovery:', err);
  }
};

/**
 * Helper to bulk notify enrolled learners when a lesson's video is ready,
 * if the tutor checked the 'notify learners' checkbox.
 */
const notifyLearnersOnVideoReady = async (lesson, courseTitle) => {
  // Only notify learners when the tutor explicitly opted-in (must be true, not undefined/null/false)
  if (lesson.notifyEnrolledOnReady !== true) return;
  try {
    const Enrollment = require('../models/enrollment.model');
    const enrollments = await Enrollment.find({ 
      courseId: lesson.courseId, 
      status: 'active', 
      deletedAt: null 
    }).populate('userId', 'name email notificationSettings').lean();
    
    if (enrollments.length > 0) {
      const notificationService = require('./notification.service');
      const NotificationModel = require('../models/notification.model');
      
      const bulkNotifs = enrollments
        .filter(e => {
          const student = e.userId;
          if (!student) return false;
          const settings = student.notificationSettings?.newLesson || { email: true, inApp: true };
          return settings.inApp !== false;
        })
        .map(e => ({
          userId: e.userId?._id || e.userId,
          title: 'Video Updated!',
          message: `A new video has been uploaded for lesson "${lesson.title}" in course "${courseTitle}".`,
          type: 'course',
          metadata: { courseId: lesson.courseId, lessonId: lesson._id }
        }));
      
      let insertedDocs = [];
      if (bulkNotifs.length > 0) {
        insertedDocs = await NotificationModel.insertMany(bulkNotifs);
        
        // Push instantly via Server-Sent Events to online students
        insertedDocs.forEach(doc => {
          notificationService.sendPushNotification(doc.userId, doc);
        });
      }
 
      // Send Email notifications asynchronously
      const emailService = require('./email.service');
      enrollments.forEach(e => {
        const student = e.userId;
        if (student && student.email) {
          const settings = student.notificationSettings?.newLesson || { email: true, inApp: true };
          if (settings.email !== false) {
            emailService.sendVideoUpdatedEmail({
              to: student.email,
              studentName: student.name,
              lessonTitle: lesson.title,
              courseTitle: courseTitle
            }).catch(emailErr => {
              console.error(`[VIDEO EMAIL NOTIFICATION ERROR] Failed to send email to ${student.email}:`, emailErr.message);
            });
          }
        }
      });
      
      console.log(`[VIDEO NOTIFICATION] Successfully notified ${enrollments.length} learners about video update for lesson ${lesson._id}`);
    }
    
    // Clear the flag so they aren't notified multiple times
    lesson.notifyEnrolledOnReady = false;
    await saveLessonAndClearCache(lesson);
  } catch (notifErr) {
    console.error('[VIDEO NOTIFICATION ERROR] Failed to notify learners of video update:', notifErr.message);
  }
};

module.exports = {
  initializeUpload,
  getUploadStatus,
  uploadChunk,
  completeUpload,
  handleMuxWebhook,
  signVideoUrl,
  streamLocalVideo,
  recoverStrandedProcessingVideos
};
