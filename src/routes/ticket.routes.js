const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const ticketController = require('../controllers/ticket.controller');

const router = express.Router();

const path = require('path');
const { ApiError } = require('../utils/errors');

// Allowed support ticket attachment file types
const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

// Multer memory-storage configured specifically for ticket attachments with type filters
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 5 // maximum of 5 attachments per request
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExtensions.includes(ext) || !allowedMimeTypes.has(file.mimetype)) {
      return callback(new ApiError(400, 'Unsupported file format. Allowed formats: PDF, DOC, DOCX, TXT, PNG, JPG, GIF, WEBP', 'INVALID_FILE_TYPE'));
    }
    callback(null, true);
  }
});

// Joi Schemas for Validation
const createTicketSchema = Joi.object({
  title: Joi.string().max(150),
  subject: Joi.string().max(150),
  issueType: Joi.string(),
  category: Joi.string(),
  description: Joi.string().required(),
  scope: Joi.string().valid('institution', 'platform').default('institution'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
  courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/)
})
  .or('title', 'subject')
  .or('category', 'issueType');

const getTicketsSchema = Joi.object({
  scope: Joi.string().valid('institution', 'platform'),
  status: Joi.string().valid('open', 'assigned', 'in_progress', 'waiting_for_user', 'resolved', 'closed'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
  category: Joi.string(),
  institutionId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
  search: Joi.string().allow(''),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

const addMessageSchema = Joi.object({
  message: Joi.string().required(),
  isInternalNote: Joi.alternatives().try(Joi.boolean(), Joi.string().valid('true', 'false')).default(false)
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('open', 'assigned', 'in_progress', 'waiting_for_user', 'resolved', 'closed').required()
});

const assignTicketSchema = Joi.object({
  assigneeId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).allow(null, '').required()
});

const escalateTicketSchema = Joi.object({
  notes: Joi.string().allow('').max(500)
});

const feedbackSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().allow('').max(500)
});

// Apply authentication middleware on all routes
router.use(authenticate);

// 1. Create a support ticket
router.post(
  '/',
  upload.array('attachments', 5),
  validate({ body: createTicketSchema }),
  ticketController.createTicket
);

// 2. Retrieve ticket list
router.get(
  '/',
  validate({ query: getTicketsSchema }),
  ticketController.getTickets
);

// 3. Fetch specific ticket details
router.get(
  '/:id',
  ticketController.getTicketById
);

// 4. Add a reply / message
router.post(
  '/:id/reply',
  upload.array('attachments', 5),
  validate({ body: addMessageSchema }),
  ticketController.addTicketMessage
);

// 5. Update status
router.patch(
  '/:id/status',
  validate({ body: updateStatusSchema }),
  ticketController.updateTicketStatus
);

// 6. Assign / claim ticket
router.post(
  '/:id/assign',
  validate({ body: assignTicketSchema }),
  ticketController.assignTicket
);

// 7. Escalate ticket
router.post(
  '/:id/escalate',
  validate({ body: escalateTicketSchema }),
  ticketController.escalateTicket
);

// 8. Submit feedback
router.post(
  '/:id/feedback',
  validate({ body: feedbackSchema }),
  ticketController.submitFeedback
);

// 9. Fetch audit log history
router.get(
  '/:id/audit-logs',
  ticketController.getTicketAuditLogs
);

module.exports = router;
