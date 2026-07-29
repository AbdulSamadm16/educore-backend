const ticketService = require('../services/ticket.service');
const storageService = require('../services/storage.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

/**
 * Helper to upload a list of files to storage service
 */
const uploadTicketAttachments = async (userId, files) => {
  const attachments = [];
  if (files && files.length > 0) {
    for (const file of files) {
      const uploadResult = await storageService.uploadSubmissionFile({ userId, file });
      attachments.push({
        name: file.originalname,
        url: uploadResult.fileUrl,
        key: uploadResult.publicId || 'raw',
        uploadedAt: new Date()
      });
    }
  }
  return attachments;
};

/**
 * Creates a support ticket
 */
const createTicket = asyncHandler(async (req, res) => {
  const { title, subject, issueType, description, scope, category, priority, courseId } = req.body;
  const attachments = await uploadTicketAttachments(req.user.id || req.user._id, req.files);

  const requestMeta = {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown'
  };

  const ticket = await ticketService.createTicket({
    creator: req.user,
    title,
    subject,
    issueType,
    description,
    scope,
    category,
    priority,
    courseId,
    attachments,
    requestMeta
  });

  return sendSuccess(res, 201, 'Ticket created successfully', ticket);
});

/**
 * Retrieves tickets lists with pagination and filters
 */
const getTickets = asyncHandler(async (req, res) => {
  const { scope, status, priority, category, institutionId, search, page, limit } = req.query;

  const result = await ticketService.getTickets({
    user: req.user,
    scope,
    status,
    priority,
    category,
    institutionId,
    search,
    page,
    limit
  });

  return sendSuccess(res, 200, 'Tickets retrieved successfully', result);
});

/**
 * Retrieve specific ticket details
 */
const getTicketById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await ticketService.getTicketById(id, req.user);
  return sendSuccess(res, 200, 'Ticket details retrieved successfully', result);
});

/**
 * Add a reply or internal note to a ticket
 */
const addTicketMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { message, isInternalNote } = req.body;
  const attachments = await uploadTicketAttachments(req.user.id || req.user._id, req.files);

  const requestMeta = {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown'
  };

  // Ensure isInternalNote is treated correctly as Boolean
  const parseInternalNote = isInternalNote === 'true' || isInternalNote === true;

  const ticketMessage = await ticketService.addTicketMessage({
    ticketId: id,
    sender: req.user,
    message,
    isInternalNote: parseInternalNote,
    attachments,
    requestMeta
  });

  return sendSuccess(res, 201, 'Message added successfully', ticketMessage);
});

/**
 * Update the status of a ticket
 */
const updateTicketStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const requestMeta = {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown'
  };

  const ticket = await ticketService.updateTicketStatus({
    ticketId: id,
    status,
    user: req.user,
    requestMeta
  });

  return sendSuccess(res, 200, 'Ticket status updated successfully', ticket);
});

/**
 * Assign ticket to a support user
 */
const assignTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assigneeId } = req.body;

  const requestMeta = {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown'
  };

  const ticket = await ticketService.assignTicket({
    ticketId: id,
    assigneeId,
    user: req.user,
    requestMeta
  });

  return sendSuccess(res, 200, 'Ticket assignment updated successfully', ticket);
});

/**
 * Escalate ticket to the next support tier
 */
const escalateTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const requestMeta = {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown'
  };

  const ticket = await ticketService.escalateTicket({
    ticketId: id,
    notes,
    user: req.user,
    requestMeta
  });

  return sendSuccess(res, 200, 'Ticket escalated successfully', ticket);
});

/**
 * Submit feedback on a resolved/closed ticket
 */
const submitFeedback = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  const requestMeta = {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown'
  };

  const ticket = await ticketService.submitFeedback({
    ticketId: id,
    rating: parseInt(rating, 10),
    comment,
    user: req.user,
    requestMeta
  });

  return sendSuccess(res, 200, 'Feedback submitted successfully', ticket);
});

/**
 * View chronological audit logs for a ticket
 */
const getTicketAuditLogs = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const logs = await ticketService.getTicketAuditLogs(id, req.user);
  return sendSuccess(res, 200, 'Audit logs retrieved successfully', logs);
});

module.exports = {
  createTicket,
  getTickets,
  getTicketById,
  addTicketMessage,
  updateTicketStatus,
  assignTicket,
  escalateTicket,
  submitFeedback,
  getTicketAuditLogs
};
