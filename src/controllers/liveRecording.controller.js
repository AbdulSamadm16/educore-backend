const liveRecordingService = require('../services/liveRecording.service');
const LiveRecording = require('../models/liveRecording.model');
const LiveSession = require('../models/liveSession.model');
const Mux = require('@mux/mux-node');
const env = require('../config/env');

exports.getMuxUploadUrl = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const { sessionId, courseId } = req.body;
    const uploadConfig = await liveRecordingService.getMuxDirectUploadUrl(tutorId, sessionId, courseId);
    res.status(200).json({ success: true, data: uploadConfig });
  } catch (error) {
    next(error);
  }
};

exports.createDraft = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const draft = await liveRecordingService.createDraft(tutorId, req.body);
    res.status(201).json({ success: true, data: draft });
  } catch (error) {
    next(error);
  }
};

exports.publishRecording = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const recording = await liveRecordingService.publishRecording(tutorId, req.params.id);
    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    next(error);
  }
};

exports.discardRecording = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const recording = await liveRecordingService.discardRecording(tutorId, req.params.id);
    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    next(error);
  }
};

exports.muxWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['mux-signature'];
    if (!signature) {
      return res.status(401).send('No signature found');
    }

    const secret = process.env.MUX_WEBHOOK_SECRET || (env.mux && env.mux.webhookSecret);

    if (secret) {
      const payload = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? req.body.toString()
        : JSON.stringify(req.body);

      try {
        Mux.Webhooks.verifyHeader(payload, signature, secret);
      } catch (err) {
        console.error('Mux webhook signature verification failed:', err);
        return res.status(401).send('Invalid Signature');
      }
    } else {
      console.warn('[WARNING] MUX_WEBHOOK_SECRET is not set. Webhook verification is bypassed.');
    }

    // Ensure we pass the object to the service
    const eventBody = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString())
      : req.body;

    await liveRecordingService.handleMuxWebhook(eventBody);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Mux webhook error:', error);
    res.status(500).send('Webhook Error');
  }
};

exports.getCourseRecordings = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const completedSessions = await LiveSession.find({ courseId, status: 'completed', deletedAt: null }).select('_id');
    const sessionIds = completedSessions.map(s => s._id);

    const query = {
      courseId,
      sessionId: { $in: sessionIds },
      status: 'published',
      processingStatus: 'ready',
      deletedAt: null
    };

    const recordings = await LiveRecording.find(query)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await LiveRecording.countDocuments(query);

    res.status(200).json({ success: true, data: recordings, pagination: { page, limit, total } });
  } catch (error) {
    next(error);
  }
};

exports.getTutorRecordings = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const { courseId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const query = {
      tutorId,
      courseId,
      deletedAt: null
    };

    const recordings = await LiveRecording.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await LiveRecording.countDocuments(query);

    res.status(200).json({ success: true, data: recordings, pagination: { page, limit, total } });
  } catch (error) {
    next(error);
  }
};

exports.updateProgress = async (req, res, next) => {
  try {
    const { recordingId } = req.params;
    const watchTime = req.body.watchTime !== undefined ? req.body.watchTime : req.body.secondsWatched;

    const progressService = require('../services/progress.service');
    const result = await progressService.updateRecordingProgress({
      userId: req.user._id,
      recordingId,
      watchTime
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
