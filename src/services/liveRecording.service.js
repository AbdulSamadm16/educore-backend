const LiveRecording = require('../models/liveRecording.model');
const LiveSession = require('../models/liveSession.model');
const Course = require('../models/course.model');
const { ApiError } = require('../utils/errors');
const muxService = require('./mux.service');
const { triggerRecordingPublished } = require('../queues/liveClass.queue');
const cron = require('node-cron');

const getMuxDirectUploadUrl = async (tutorId, sessionId, courseId) => {
  // Security rules: Validate tutor owns this course
  const course = await Course.findOne({ _id: courseId, authorId: tutorId, deletedAt: null });
  if (!course) {
    throw new ApiError(403, 'You do not have permission to upload to this course.', 'FORBIDDEN');
  }

  const session = await LiveSession.findOne({ _id: sessionId, courseId, tutorId, deletedAt: null });
  if (!session) {
    throw new ApiError(404, 'Session not found or belongs to a different course.', 'NOT_FOUND');
  }

  // Create upload in Mux
  const upload = await muxService.createDirectUpload();
  
  return {
    uploadId: upload.id,
    url: upload.url
  };
};

const createDraft = async (tutorId, data) => {
  const { sessionId, courseId, title, description, muxAssetId, muxPlaybackId, streamUrl, duration, provider, uploadType } = data;

  const session = await LiveSession.findOne({ _id: sessionId, courseId, tutorId, deletedAt: null });
  if (!session) {
    throw new ApiError(404, 'Session not found.', 'NOT_FOUND');
  }

  // Discard older drafts or published ones based on the strict Versioning rule: One draft, one published
  // Actually, the rule states: "If tutor uploads new recording: old one becomes discarded"
  await LiveRecording.updateMany(
    { sessionId, status: { $in: ['draft', 'published'] } },
    { $set: { status: 'discarded', deletedAt: new Date() } }
  );

  const isExternal = provider === 'external' || uploadType === 'external';

  const draft = await LiveRecording.create({
    sessionId,
    courseId,
    tutorId,
    title: title || session.title, // Default title to session title
    description,
    provider: isExternal ? 'external' : 'mux',
    muxAssetId: isExternal ? null : muxAssetId,
    muxPlaybackId: isExternal ? null : muxPlaybackId,
    streamUrl,
    processingStatus: isExternal ? 'ready' : 'processing', // External URLs don't need Mux webhooks
    duration,
    uploadType: isExternal ? 'external' : 'direct',
    status: 'draft',
    visibility: 'enrolled_only'
  });

  return draft;
};

const publishRecording = async (tutorId, recordingId) => {
  const recording = await LiveRecording.findOne({ _id: recordingId, tutorId, deletedAt: null });
  if (!recording) {
    throw new ApiError(404, 'Recording not found.', 'NOT_FOUND');
  }

  if (recording.processingStatus !== 'ready') {
    throw new ApiError(400, 'Recording cannot be published because it is not ready yet.', 'BAD_REQUEST');
  }

  if (recording.status === 'published') {
    return recording;
  }

  recording.status = 'published';
  recording.publishedAt = new Date();
  await recording.save();

  await triggerRecordingPublished({
    recordingId: recording._id,
    title: recording.title,
    courseId: recording.courseId
  });

  return recording;
};

const discardRecording = async (tutorId, recordingId) => {
  const recording = await LiveRecording.findOne({ _id: recordingId, tutorId, deletedAt: null });
  if (!recording) {
    throw new ApiError(404, 'Recording not found.', 'NOT_FOUND');
  }

  recording.status = 'discarded';
  recording.deletedAt = new Date();
  await recording.save();

  if (recording.muxAssetId) {
    try {
      await muxService.deleteAsset(recording.muxAssetId);
    } catch (err) {
      console.error('Failed to delete Mux asset on discard:', err);
    }
  }

  return recording;
};

const handleMuxWebhook = async (event) => {
  const { type, data } = event;
  
  // We care about video.asset.ready and video.asset.errored
  if (type === 'video.asset.ready') {
    const assetId = data.id;
    const playbackId = data.playback_ids && data.playback_ids[0] ? data.playback_ids[0].id : null;
    const streamUrl = playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : null;
    
    await LiveRecording.updateOne(
      { muxAssetId: assetId },
      { 
        $set: { 
          processingStatus: 'ready',
          muxPlaybackId: playbackId,
          streamUrl: streamUrl,
          duration: data.duration
        } 
      }
    );
  } else if (type === 'video.asset.errored') {
    const assetId = data.id;
    await LiveRecording.updateOne(
      { muxAssetId: assetId },
      { $set: { processingStatus: 'failed' } }
    );
  }
};

// Cleanup cron was explicitly removed in the rules "REMOVE THIS Orphan Cleanup CRON"

module.exports = {
  getMuxDirectUploadUrl,
  createDraft,
  publishRecording,
  discardRecording,
  handleMuxWebhook
};
