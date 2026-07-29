const liveSessionService = require('../services/liveSession.service');
const { ApiError } = require('../utils/errors');
const LiveSession = require('../models/liveSession.model');
const Enrollment = require('../models/enrollment.model');
const Batch = require('../models/batch.model');

// Helper to normalize response shape
const formatSessionResponse = (sessionDoc, includeMeetingUrl = false) => {
  const session = sessionDoc.toObject ? sessionDoc.toObject() : sessionDoc;
  
  const formatted = {
    id: session._id,
    title: session.title,
    description: session.description,
    startTime: session.startTime,
    endTime: session.endTime,
    timezone: session.timezone,
    durationMinutes: session.durationMinutes,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };

  if (includeMeetingUrl) {
    formatted.meetingUrl = session.meetingUrl;
  }

  // Format course
  if (session.courseId && typeof session.courseId === 'object') {
    formatted.course = {
      id: session.courseId._id,
      title: session.courseId.title,
      thumbnailUrl: session.courseId.thumbnailUrl
    };
  } else {
    formatted.course = { id: session.courseId };
  }

  // Format tutor
  if (session.tutorId && typeof session.tutorId === 'object') {
    formatted.tutor = {
      id: session.tutorId._id,
      name: session.tutorId.name,
      avatarUrl: session.tutorId.avatarUrl
    };
  } else {
    formatted.tutor = { id: session.tutorId };
  }

  if (session.batchId && typeof session.batchId === 'object') {
    formatted.batch = {
      id: session.batchId._id,
      name: session.batchId.name,
      status: session.batchId.status
    };
  } else if (session.batchId) {
    formatted.batch = { id: session.batchId };
  }

  return formatted;
};

exports.createSession = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const session = await liveSessionService.createSession(tutorId, req.body);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
};

exports.updateSession = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const session = await liveSessionService.updateSession(tutorId, req.params.id, req.body);
    res.status(200).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
};

exports.cancelSession = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const session = await liveSessionService.cancelSession(tutorId, req.params.id);
    res.status(200).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
};

exports.getTutorSessions = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const sessions = await LiveSession.find({ tutorId, deletedAt: null })
      .populate('courseId', 'title')
      .populate('batchId', 'name status')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit);

    const total = await LiveSession.countDocuments({ tutorId, deletedAt: null });

    const formattedSessions = sessions.map(s => formatSessionResponse(s, true)); // Tutors can see their own URLs

    res.status(200).json({ success: true, data: formattedSessions, pagination: { page, limit, total } });
  } catch (error) {
    next(error);
  }
};

exports.getTutorBatches = async (req, res, next) => {
  try {
    const tutorId = req.user._id;
    const batches = await Batch.find({
      assignedTutorId: tutorId,
      deletedAt: null,
      status: 'active'
    }).select('name _id startDate endDate');

    const formattedBatches = batches.map(b => ({
      id: b._id,
      name: b.name,
      startDate: b.startDate,
      endDate: b.endDate
    }));

    res.status(200).json({ success: true, data: formattedBatches });
  } catch (error) {
    next(error);
  }
};

exports.getCourseSessions = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const sessions = await LiveSession.find({ courseId, deletedAt: null })
      .populate('tutorId', 'name')
      .populate('courseId', 'title')
      .populate('batchId', 'name status')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit);

    const total = await LiveSession.countDocuments({ courseId, deletedAt: null });

    const formattedSessions = sessions.map(s => formatSessionResponse(s, false));

    res.status(200).json({ success: true, data: formattedSessions, pagination: { page, limit, total } });
  } catch (error) {
    next(error);
  }
};

exports.getLearnerSessions = async (req, res, next) => {
  try {
    const learnerId = req.user._id;
    const { filter } = req.query; // 'this_week', 'this_month', 'all'
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Get all active enrollments and batch memberships for the learner
    const enrollments = await Enrollment.find({ userId: learnerId, status: 'active', deletedAt: null }).select('courseId');
    const courseIds = enrollments.map(e => e.courseId);
    const batches = await Batch.find({ 'students.userId': learnerId, deletedAt: null, status: { $ne: 'archived' } }).select('_id');
    const batchIds = batches.map(b => b._id);

    const query = {
      deletedAt: null,
      status: { $in: ['scheduled', 'rescheduled', 'live'] } // Upcoming or currently live
    };

    if (courseIds.length || batchIds.length) {
      query.$or = [
        { courseId: { $in: courseIds } },
        { batchId: { $in: batchIds } }
      ];
    } else {
      query.$or = [{ _id: null }];
    }

    const now = new Date();
    
    if (filter === 'this_week') {
      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() + (7 - now.getDay())); // rough end of week
      query.startTime = { $gte: now, $lte: endOfWeek };
    } else if (filter === 'this_month') {
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      query.startTime = { $gte: now, $lte: endOfMonth };
    } else {
      // 'all' upcoming
      query.startTime = { $gte: now };
    }

    const sessions = await LiveSession.find(query)
      .populate('tutorId', 'name avatarUrl')
      .populate('courseId', 'title thumbnailUrl')
      .populate('batchId', 'name status')
      .sort({ startTime: 1 }) // Ascending order for upcoming
      .skip(skip)
      .limit(limit);

    const total = await LiveSession.countDocuments(query);

    const formattedSessions = sessions.map(s => formatSessionResponse(s, false));

    res.status(200).json({ success: true, data: formattedSessions, pagination: { page, limit, total } });
  } catch (error) {
    next(error);
  }
};

exports.getJoinUrl = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;
    const url = await liveSessionService.getJoinUrl(userId, role, req.params.id);
    res.status(200).json({ success: true, data: { meetingUrl: url } });
  } catch (error) {
    next(error);
  }
};

exports.getSessionById = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;
    const { id } = req.params;

    const session = await LiveSession.findOne({ _id: id, deletedAt: null })
      .populate('tutorId', 'name avatarUrl')
      .populate('courseId', 'title thumbnailUrl')
      .populate('batchId', 'name status students');

    if (!session) {
      throw new ApiError(404, 'Live session not found', 'NOT_FOUND');
    }

    if (role === 'tutor') {
      if (session.tutorId._id.toString() !== userId.toString()) {
        throw new ApiError(403, 'You do not have permission to view this session', 'FORBIDDEN');
      }
    } else if (role === 'learner') {
      if (session.batchId) {
        const isBatchStudent = session.batchId.students?.some((student) => String(student.userId) === String(userId));
        if (!isBatchStudent) {
          throw new ApiError(403, 'You must belong to this batch to view this session', 'FORBIDDEN');
        }
      } else {
        const enrollment = await Enrollment.findOne({ userId, courseId: session.courseId._id, status: 'active', deletedAt: null });
        if (!enrollment) {
          throw new ApiError(403, 'You must be actively enrolled in the course to view this session', 'FORBIDDEN');
        }
      }
    } else {
      throw new ApiError(403, 'You do not have permission to view this session', 'FORBIDDEN');
    }

    const formattedSession = formatSessionResponse(session, false); // Never expose URL here
    res.status(200).json({ success: true, data: formattedSession });
  } catch (error) {
    next(error);
  }
};
