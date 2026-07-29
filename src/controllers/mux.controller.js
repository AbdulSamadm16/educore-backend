const muxService = require('../services/mux.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');
const Lesson = require('../models/lesson.model');
const Course = require('../models/course.model');
const User = require('../models/user.model');
const notificationService = require('../services/notification.service');
const emailService = require('../services/email.service');

/**
 * Exposes endpoint to request a direct, signed upload URL from Mux Cloud.
 * Accessible by authenticated Tutors, Admins, and Super Admins.
 */
const getUploadUrl = asyncHandler(async (req, res) => {
  const upload = await muxService.createDirectUpload();

  return sendSuccess(
    res,
    201,
    'Signed upload URL generated successfully',
    {
      uploadUrl: upload.url,
      uploadId: upload.id
    }
  );
});

/**
 * Exposes endpoint to retrieve current upload status and fetch playback IDs if ready.
 * Accessible by authenticated Tutors, Admins, and Super Admins.
 */
const checkUploadStatus = asyncHandler(async (req, res) => {
  const { uploadId } = req.params;
  const upload = await muxService.getUploadStatus(uploadId);

  const responseData = {
    status: upload.status,
    assetId: upload.asset_id || null,
    playbackId: null
  };

  // If asset has been created successfully, retrieve the asset details to get the playback ID
  if (upload.status === 'asset_created' && upload.asset_id) {
    try {
      const asset = await muxService.getAssetDetails(upload.asset_id);
      responseData.status = asset.status; // update status to active/preparing etc.
      
      if (asset.playback_ids && asset.playback_ids.length > 0) {
        responseData.playbackId = asset.playback_ids[0].id;
      }
    } catch (assetError) {
      console.warn(`Could not fetch details for Mux Asset ${upload.asset_id}:`, assetError.message);
    }
  }

  return sendSuccess(
    res,
    200,
    'Mux upload status retrieved successfully',
    responseData
  );
});

/**
 * Handles incoming webhooks from Mux Cloud
 */
const handleWebhook = asyncHandler(async (req, res) => {
  const event = req.body;

  console.log('[Mux Webhook] Received event:', event?.type);

  if (event && event.type === 'video.asset.ready') {
    const assetId = event.data.id;
    const uploadId = event.data.upload_id;
    const playbackId = event.data.playback_ids?.[0]?.id;

    // Find the lesson associated with this assetId or uploadId
    const lesson = await Lesson.findOne({
      $or: [
        { muxAssetId: assetId },
        { muxUploadId: uploadId }
      ]
    });

    if (lesson) {
      console.log(`[Mux Webhook] Found lesson "${lesson.title}" for asset ${assetId}`);

      // Update lesson with asset details if needed
      let updated = false;
      if (!lesson.muxAssetId) {
        lesson.muxAssetId = assetId;
        updated = true;
      }
      if (playbackId && !lesson.muxPlaybackId) {
        lesson.muxPlaybackId = playbackId;
        lesson.videoUrl = `https://stream.mux.com/${playbackId}.m3u8`;
        updated = true;
      }

      if (updated) {
        await lesson.save();
      }

      // Fetch course details
      const course = await Course.findById(lesson.courseId);
      if (course) {
        const author = await User.findById(course.authorId);
        if (author) {
          // 1. Create in-app notification
          await notificationService.createNotification({
            userId: author._id,
            title: 'Video Upload Processed',
            message: `Your video for lesson "${lesson.title}" in course "${course.title}" has finished processing and is ready.`,
            type: 'video_ready',
            metadata: {
              courseId: course._id,
              lessonId: lesson._id
            }
          });

          // 2. Send email notification
          await emailService.sendVideoReadyEmail({
            to: author.email,
            name: author.name,
            lessonTitle: lesson.title,
            courseTitle: course.title
          });
          console.log(`[Mux Webhook] Triggered notification and email to ${author.email}`);
        }
      }
    } else {
      console.warn(`[Mux Webhook] Lesson not found for asset ID ${assetId} or upload ID ${uploadId}`);
    }
  }

  // Always respond with 200 OK to Mux
  return sendSuccess(res, 200, 'Webhook processed successfully', null);
});

module.exports = {
  getUploadUrl,
  checkUploadStatus,
  handleWebhook
};
