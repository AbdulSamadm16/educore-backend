const express = require('express');
const router = express.Router();
const liveSessionController = require('../controllers/liveSession.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { liveSessionSchema, updateLiveSessionSchema } = require('../utils/validationSchemas');

// Tutor routes
router.post('/', authenticate, requireRoles('tutor'), validate(liveSessionSchema), liveSessionController.createSession);
router.get('/my', authenticate, requireRoles('tutor'), liveSessionController.getTutorSessions);
router.get('/tutor-batches', authenticate, requireRoles('tutor'), liveSessionController.getTutorBatches);
router.patch('/:id', authenticate, requireRoles('tutor'), validate(updateLiveSessionSchema), liveSessionController.updateSession);
router.delete('/:id', authenticate, requireRoles('tutor'), liveSessionController.cancelSession);

// Learner / Shared static & specific routes
router.get('/my-upcoming', authenticate, liveSessionController.getLearnerSessions);
router.get('/course/:courseId', authenticate, liveSessionController.getCourseSessions);
router.get('/:id/join', authenticate, liveSessionController.getJoinUrl);

// Shared dynamic route MUST be last
router.get('/:id', authenticate, liveSessionController.getSessionById);

module.exports = router;
