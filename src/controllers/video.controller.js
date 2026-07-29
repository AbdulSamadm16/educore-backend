const videoService = require('../services/video.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');
const { ApiError } = require('../utils/errors');

/**
 * Initialize Resumable Video Upload
 */
const initializeUpload = asyncHandler(async (req, res) => {
  const { fileName, fileSize, notifyLearners } = req.body;
  const { id: lessonId } = req.params;

  if (!fileName || !fileSize) {
    throw new ApiError(400, 'fileName and fileSize are required to initialize upload', 'MISSING_PARAMETERS');
  }

  const result = await videoService.initializeUpload({
    lessonId,
    fileName,
    fileSize: parseInt(fileSize, 10),
    notifyLearners: !!notifyLearners,
    user: req.user
  });

  return sendSuccess(res, 200, 'Upload session initialized successfully', result);
});

/**
 * Get Current Upload Status & List of Uploaded Chunks
 */
const getUploadStatus = asyncHandler(async (req, res) => {
  const { id: lessonId } = req.params;

  const result = await videoService.getUploadStatus({
    lessonId,
    user: req.user
  });

  // Prevent browser caching so polling always gets fresh status (avoids 304 stale loops)
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');

  return sendSuccess(res, 200, 'Upload status fetched successfully', result);
});

/**
 * Upload Video Chunk
 */
const uploadChunk = asyncHandler(async (req, res) => {
  const { id: lessonId } = req.params;
  const { uploadId, chunkIndex } = req.body;

  if (!uploadId || chunkIndex === undefined) {
    throw new ApiError(400, 'uploadId and chunkIndex are required', 'MISSING_PARAMETERS');
  }

  if (!req.file || !req.file.buffer) {
    throw new ApiError(400, 'No chunk file uploaded', 'MISSING_FILE');
  }

  const result = await videoService.uploadChunk({
    lessonId,
    uploadId,
    chunkIndex: parseInt(chunkIndex, 10),
    fileBuffer: req.file.buffer,
    user: req.user
  });

  return sendSuccess(res, 200, 'Chunk uploaded successfully', result);
});

/**
 * Complete Video Upload & Start Processing
 */
const completeUpload = asyncHandler(async (req, res) => {
  const { id: lessonId } = req.params;
  const { uploadId, totalChunks } = req.body;

  if (!uploadId || !totalChunks) {
    throw new ApiError(400, 'uploadId and totalChunks are required to complete upload', 'MISSING_PARAMETERS');
  }

  const result = await videoService.completeUpload({
    lessonId,
    uploadId,
    totalChunks: parseInt(totalChunks, 10),
    user: req.user
  });

  return sendSuccess(res, 200, 'Video upload completed. Processing started in the background.', result);
});

/**
 * Handle Webhooks from Mux Cloud
 */
const handleMuxWebhook = asyncHandler(async (req, res) => {
  await videoService.handleMuxWebhook(req.body);
  return sendSuccess(res, 200, 'Webhook received and processing', null);
});

/**
 * Stream local video securely using range requests
 */
const streamLocalVideo = asyncHandler(async (req, res) => {
  await videoService.streamLocalVideo(req, res);
});

module.exports = {
  initializeUpload,
  getUploadStatus,
  uploadChunk,
  completeUpload,
  handleMuxWebhook,
  streamLocalVideo
};
