const express = require('express');
const quizAttemptController = require('../controllers/quizAttempt.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate);

// Student/learner routes
router.post('/lessons/:lessonId/attempt', quizAttemptController.submitQuizAttempt);
router.get('/my-attempts', quizAttemptController.getMyQuizAttempts);
router.get('/attempts/:id', quizAttemptController.getQuizAttemptDetails);

module.exports = router;
