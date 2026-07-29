const Ticket = require('../models/ticket.model');
const TicketMessage = require('../models/ticketMessage.model');
const TicketAuditLog = require('../models/ticketAuditLog.model');
const User = require('../models/user.model');
const Course = require('../models/course.model');
const { ApiError } = require('../utils/errors');
const { createNotification } = require('./notification.service');
const emailService = require('./email.service');
const { PLATFORM_ADMIN_ROLES, INSTITUTION_ADMIN_ROLES } = require('../utils/roles');

/**
 * Helper to check if a role is a platform admin/support role
 */
const isPlatformAdmin = (role) => PLATFORM_ADMIN_ROLES.includes(role);

/**
 * Helper to check if a role is an institution admin role
 */
const isInstitutionAdmin = (role) => INSTITUTION_ADMIN_ROLES.includes(role);

/**
 * Generates a unique Ticket ID in the format TK-YYYYMMDD-XXXX
 */
const generateTicketId = async () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const randomSeq = Math.floor(1000 + Math.random() * 9000); // 4-digit random sequence
    const candidateId = `TK-${dateStr}-${randomSeq}`;
    
    const exists = await Ticket.exists({ ticketId: candidateId });
    if (!exists) {
      return candidateId;
    }
  }
  throw new ApiError(500, 'Failed to generate unique ticket ID', 'TICKET_ID_GENERATION_FAILED');
};

/**
 * Helper to notify the support team (either the assignee or all queue managers)
 */
const notifySupportTeam = async (ticket, title, message) => {
  try {
    if (ticket.assignedTo) {
      await createNotification({
        userId: ticket.assignedTo,
        title,
        message,
        type: 'system',
        metadata: { ticketId: ticket._id.toString() }
      });
    } else {
      if (ticket.scope === 'institution' && ticket.institutionId) {
        const admins = await User.find({
          institutionId: ticket.institutionId,
          role: { $in: INSTITUTION_ADMIN_ROLES },
          status: 'active',
          deletedAt: null
        }).select('_id').lean();

        for (const admin of admins) {
          await createNotification({
            userId: admin._id,
            title,
            message,
            type: 'system',
            metadata: { ticketId: ticket._id.toString() }
          });
        }
      } else {
        const platformAdmins = await User.find({
          role: { $in: PLATFORM_ADMIN_ROLES },
          status: 'active',
          deletedAt: null
        }).select('_id').lean();

        for (const admin of platformAdmins) {
          await createNotification({
            userId: admin._id,
            title,
            message,
            type: 'system',
            metadata: { ticketId: ticket._id.toString() }
          });
        }
      }
    }
  } catch (err) {
    console.error('[SSMS Notifications] Support team notification failed:', err.message);
  }
};

/**
 * Creates a support ticket
 */
const createTicket = async ({ creator, title, subject, issueType, description, scope, category, priority, courseId, attachments, requestMeta }) => {
  const finalSubject = subject || title;
  const finalIssueType = issueType || category;

  if (!finalSubject || !description || !finalIssueType) {
    throw new ApiError(400, 'Subject/Title, description, and IssueType/Category are required fields', 'MISSING_FIELDS');
  }

  // PLATFORM ADMIN RESTRICTION
  if (isPlatformAdmin(creator.role)) {
    throw new ApiError(403, 'Platform administrators cannot create support tickets', 'FORBIDDEN');
  }

  const ticketId = await generateTicketId();

  // ROUTING LOGIC MATRIX
  let assignedRole = null;
  let finalScope = 'platform';
  let institutionId = creator.institutionId || null;

  if (creator.role === 'learner') {
    if (['technical', 'billing', 'other'].includes(finalIssueType)) {
      assignedRole = 'platform_admin';
      finalScope = 'platform';
    } else if (finalIssueType === 'academic') {
      assignedRole = 'tutor';
      finalScope = institutionId ? 'institution' : 'platform';
      if (!courseId) {
        throw new ApiError(400, 'Course selection is required for academic issues', 'MISSING_COURSE');
      }
    } else if (finalIssueType === 'account') {
      if (institutionId) {
        assignedRole = 'institution_admin';
        finalScope = 'institution';
      } else {
        assignedRole = 'platform_admin';
        finalScope = 'platform';
      }
    } else {
      assignedRole = 'platform_admin';
      finalScope = 'platform';
    }
  } else if (creator.role === 'tutor') {
    if (institutionId) {
      assignedRole = 'institution_admin';
      finalScope = 'institution';
    } else {
      assignedRole = 'platform_admin';
      finalScope = 'platform';
    }
  } else if (isInstitutionAdmin(creator.role)) {
    assignedRole = 'platform_admin';
    finalScope = 'platform';
  }

  const ticket = await Ticket.create({
    ticketId,
    subject: finalSubject,
    title: finalSubject,
    issueType: finalIssueType,
    category: finalIssueType,
    description,
    creatorId: creator.id || creator._id,
    creatorRole: creator.role,
    institutionId,
    courseId,
    scope: finalScope,
    assignedRole,
    priority: priority || 'medium',
    status: 'open',
    attachments: attachments || []
  });

  // Log in Ticket Audit Log
  await TicketAuditLog.create({
    ticketId: ticket._id,
    actorUserId: creator.id || creator._id,
    actorRole: creator.role,
    action: 'TICKET_CREATED',
    metadata: { scope: finalScope, category: finalIssueType, priority: ticket.priority },
    ip: requestMeta?.ip || 'unknown',
    userAgent: requestMeta?.userAgent || 'unknown'
  });

  // Trigger Notifications asynchronously
  try {
    // 1. Notify Creator
    await createNotification({
      userId: creator.id || creator._id,
      title: 'Ticket Created successfully',
      message: `Your ticket ${ticketId} has been successfully filed and is under review.`,
      type: 'system',
      metadata: { ticketId: ticket._id.toString() }
    });

    if (creator.email) {
      await emailService.sendMail({
        to: creator.email,
        name: creator.name || 'User',
        subject: `Ticket Filed: [${ticketId}] - ${finalSubject}`,
        text: `Hello,\n\nYour support ticket has been received. Ticket ID: ${ticketId}\nPriority: ${ticket.priority}\nDescription:\n${description}\n\nWe will get back to you shortly.\n\nBest regards,\nEduCore Support Team`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
            <h2 style="color: #435947;">Ticket Received</h2>
            <p>Your support ticket has been registered successfully.</p>
            <div style="background-color: #f3f4ee; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p><strong>Ticket ID:</strong> ${ticketId}</p>
              <p><strong>Subject:</strong> ${finalSubject}</p>
              <p><strong>Priority:</strong> ${ticket.priority}</p>
            </div>
            <p>Our support staff will review and respond to your request shortly.</p>
          </div>
        `
      }).catch(err => console.error('[SSMS Notifications] Failed to send ticket confirmation email:', err.message));
    }

    // 2. Notify Support Queue Managers
    const notifTitle = finalScope === 'institution' ? 'New Support Ticket Filed' : 'New Platform Support Ticket';
    const notifMsg = finalScope === 'institution'
      ? `A new ticket ${ticketId} is awaiting response in your queue.`
      : `Ticket ${ticketId} has been created and assigned to the platform queue.`;
    await notifySupportTeam(ticket, notifTitle, notifMsg);
  } catch (notifErr) {
    console.error('[SSMS Notifications] Non-blocking notification dispatch issue:', notifErr.message);
  }

  return ticket;
};

/**
 * Retrieves support tickets with multi-tenant filtering and pagination
 */
const getTickets = async ({ user, scope, status, priority, category, institutionId, search, page = 1, limit = 20 }) => {
  const filter = { deletedAt: null };

  const isPlatformUser = isPlatformAdmin(user.role);
  const isInstAdmin = isInstitutionAdmin(user.role);
  const isTutor = user.role === 'tutor';

  if (isPlatformUser) {
    if (institutionId) filter.institutionId = institutionId;
  } else if (isInstAdmin) {
    filter.$or = [
      { creatorId: user.id || user._id },
      { assignedRole: 'institution_admin', institutionId: user.institutionId }
    ];
  } else if (isTutor) {
    const tutorCourses = await Course.find({ authorId: user.id || user._id, deletedAt: null }).select('_id').lean();
    const courseIds = tutorCourses.map(c => c._id);
    filter.$or = [
      { creatorId: user.id || user._id },
      { assignedRole: 'tutor', courseId: { $in: courseIds } }
    ];
  } else {
    // Learners
    filter.creatorId = user.id || user._id;
  }

  // Dynamic Query Filters
  if (scope) filter.scope = scope;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;

  if (search) {
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { ticketId: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ]
    });
  }

  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [tickets, total] = await Promise.all([
    Ticket.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('creatorId', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('courseId', 'title')
      .lean(),
    Ticket.countDocuments(filter)
  ]);

  return {
    tickets,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      pages: Math.ceil(total / parsedLimit)
    }
  };
};

/**
 * Retrieve a ticket by ID with message history
 */
const getTicketById = async (ticketId, user) => {
  const ticket = await Ticket.findOne({ _id: ticketId, deletedAt: null })
    .populate('creatorId', 'name email role')
    .populate('assignedTo', 'name email role');

  if (!ticket) {
    throw new ApiError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  }

  // Enforce Tenant Boundaries
  const isPlatformUser = isPlatformAdmin(user.role);
  const isInstAdmin = isInstitutionAdmin(user.role);
  const isTutor = user.role === 'tutor';
  const isCreator = String(ticket.creatorId._id || ticket.creatorId) === String(user.id || user._id);

  if (!isCreator && !isPlatformUser) {
    if (isInstAdmin) {
      const sameInstitution = ticket.institutionId && String(ticket.institutionId) === String(user.institutionId);
      if (!sameInstitution || ticket.assignedRole !== 'institution_admin') {
        throw new ApiError(403, 'Access denied to this ticket', 'FORBIDDEN');
      }
    } else if (isTutor) {
      if (ticket.assignedRole !== 'tutor' || !ticket.courseId) {
        throw new ApiError(403, 'Access denied to this ticket', 'FORBIDDEN');
      }
      const course = await Course.findOne({ _id: ticket.courseId, authorId: user.id || user._id, deletedAt: null });
      if (!course) {
        throw new ApiError(403, 'Access denied to this ticket', 'FORBIDDEN');
      }
    } else {
      throw new ApiError(403, 'Access denied to this ticket', 'FORBIDDEN');
    }
  }

  // Conversation history querying
  const messageFilter = { ticketId };
  // Hide internal notes from Learners and Tutors
  if (!isPlatformUser && !isInstAdmin) {
    messageFilter.isInternalNote = false;
  }

  const messages = await TicketMessage.find(messageFilter)
    .sort({ createdAt: 1 })
    .populate('senderId', 'name email role')
    .lean();

  return { ticket, messages };
};

/**
 * Add a message/reply to a support ticket
 */
const addTicketMessage = async ({ ticketId, sender, message, isInternalNote = false, attachments = [], requestMeta }) => {
  if (!message || !message.trim()) {
    throw new ApiError(400, 'Message body cannot be empty', 'EMPTY_MESSAGE');
  }

  const ticket = await Ticket.findOne({ _id: ticketId, deletedAt: null });
  if (!ticket) {
    throw new ApiError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  }

  const isPlatformUser = isPlatformAdmin(sender.role);
  const isInstAdmin = isInstitutionAdmin(sender.role);
  const isCreator = String(ticket.creatorId) === String(sender.id || sender._id);
  const isAssignedTutor = sender.role === 'tutor' &&
    ticket.assignedRole === 'tutor' &&
    ticket.courseId &&
    !!(await Course.findOne({ _id: ticket.courseId, authorId: sender.id || sender._id, deletedAt: null }));

  // Validate Access to reply
  if (!isPlatformUser && !isCreator) {
    if (isInstAdmin) {
      const sameInstitution = ticket.institutionId && String(ticket.institutionId) === String(sender.institutionId);
      if (!sameInstitution || ticket.scope !== 'institution') {
        throw new ApiError(403, 'Access denied', 'FORBIDDEN');
      }
    } else if (isAssignedTutor) {
      // Allowed access
    } else {
      throw new ApiError(403, 'Access denied', 'FORBIDDEN');
    }
  }

  // Enforce customer turn-taking: Lock chat if ticket is open/assigned/in_progress
  const isAgent = isPlatformUser || isInstAdmin || isAssignedTutor;
  if (!isAgent && isCreator) {
    if (ticket.status !== 'waiting_for_user' && ticket.status !== 'resolved' && ticket.status !== 'closed') {
      throw new ApiError(403, 'Chat is locked. You can only reply when the support team requests your response.', 'CHAT_LOCKED');
    }
  }

  // Only Admins/Support can write internal notes
  const canWriteInternal = isPlatformUser || isInstAdmin || isAssignedTutor;
  const finalInternalNote = canWriteInternal ? isInternalNote : false;

  // Create message record
  const ticketMessage = await TicketMessage.create({
    ticketId,
    senderId: sender.id || sender._id,
    senderRole: sender.role,
    message,
    isInternalNote: finalInternalNote,
    attachments
  });

  // Lifecycle updates & notifications
  let statusTransition = null;
  const oldStatus = ticket.status;

  if (!finalInternalNote) {
    if (isCreator) {
      // User replied -> Set back to in_progress
      if (ticket.status === 'waiting_for_user' || ticket.status === 'resolved') {
        ticket.status = 'in_progress';
        ticket.resolvedAt = null;
        ticket.slaResolutionTimeMs = null;
        statusTransition = { oldStatus, newStatus: 'in_progress' };
      }
    } else {
      // Support Agent replied -> Set status to waiting_for_user
      if (ticket.status !== 'waiting_for_user' && ticket.status !== 'closed') {
        ticket.status = 'waiting_for_user';
        statusTransition = { oldStatus, newStatus: 'waiting_for_user' };
      }
    }
  }

  await ticket.save();

  // Audit log entry
  await TicketAuditLog.create({
    ticketId: ticket._id,
    actorUserId: sender.id || sender._id,
    actorRole: sender.role,
    action: finalInternalNote ? 'TICKET_INTERNAL_NOTE_ADDED' : 'TICKET_REPLY_ADDED',
    metadata: {
      messageId: ticketMessage._id,
      statusChanged: statusTransition ? true : false,
      ...statusTransition
    },
    ip: requestMeta?.ip || 'unknown',
    userAgent: requestMeta?.userAgent || 'unknown'
  });

  // Notifications
  try {
    if (!finalInternalNote) {
      if (isCreator) {
        const isReopen = oldStatus === 'resolved' || oldStatus === 'closed';
        const notifTitle = isReopen ? `Ticket Reopened: [${ticket.ticketId}]` : `Reply Received: [${ticket.ticketId}]`;
        const notifMsg = isReopen 
          ? `The creator has reopened ticket ${ticket.ticketId}: "${message}"`
          : `The ticket creator left a new reply on ticket ${ticket.ticketId}.`;
        
        await notifySupportTeam(ticket, notifTitle, notifMsg);
      } else {
        // Notify Creator
        await createNotification({
          userId: ticket.creatorId,
          title: `New Reply: [${ticket.ticketId}]`,
          message: `A support agent has replied to your ticket ${ticket.ticketId}.`,
          type: 'system',
          metadata: { ticketId: ticket._id.toString() }
        });

        // Email Notify Creator
        const creatorUser = await User.findById(ticket.creatorId).select('email name').lean();
        if (creatorUser && creatorUser.email) {
          await emailService.sendMail({
            to: creatorUser.email,
            name: creatorUser.name || 'User',
            subject: `Reply Added: [${ticket.ticketId}] - ${ticket.title}`,
            text: `Hello,\n\nA new message has been posted on your support ticket ${ticket.ticketId}:\n\n"${message}"\n\nPlease log in to view the full discussion history.\n\nBest regards,\nEduCore Support Team`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
                <h3 style="color: #435947;">New Reply Posted</h3>
                <p>A support agent replied to your ticket <strong>${ticket.ticketId}</strong>:</p>
                <div style="background-color: #f3f4ee; padding: 15px; border-radius: 8px; margin: 15px 0; font-style: italic;">
                  "${message}"
                </div>
                <p>Please log in to your dashboard to respond.</p>
              </div>
            `
          }).catch(err => console.error('[SSMS Notifications] Failed to send reply email notification:', err.message));
        }
      }
    }
  } catch (notifErr) {
    console.error('[SSMS Notifications] Message notification failed:', notifErr.message);
  }

  return ticketMessage;
};

/**
 * Updates status of a ticket
 */
const updateTicketStatus = async ({ ticketId, status, user, requestMeta }) => {
  const ticket = await Ticket.findOne({ _id: ticketId, deletedAt: null });
  if (!ticket) {
    throw new ApiError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  }

  if (ticket.status === status) {
    return ticket;
  }

  const isPlatformUser = isPlatformAdmin(user.role);
  const isInstAdmin = isInstitutionAdmin(user.role);
  const isCreator = String(ticket.creatorId) === String(user.id || user._id);
  const isAssignedTutor = user.role === 'tutor' &&
    ticket.assignedRole === 'tutor' &&
    ticket.courseId &&
    !!(await Course.findOne({ _id: ticket.courseId, authorId: user.id || user._id, deletedAt: null }));

  // Validate Access
  if (!isPlatformUser && !isCreator) {
    if (isInstAdmin) {
      const sameInstitution = ticket.institutionId && String(ticket.institutionId) === String(user.institutionId);
      if (!sameInstitution || ticket.scope !== 'institution') {
        throw new ApiError(403, 'Access denied', 'FORBIDDEN');
      }
    } else if (isAssignedTutor) {
      // Allowed access
    } else {
      throw new ApiError(403, 'Access denied', 'FORBIDDEN');
    }
  }

  const isSupport = isPlatformUser || isInstAdmin || isAssignedTutor;

  // Support staff can mark tickets as resolved, but cannot mark as closed
  if (isSupport) {
    if (status === 'closed') {
      throw new ApiError(403, 'Support staff cannot mark tickets as closed. Only the creator can confirm resolution and close the ticket.', 'UNAUTHORIZED_STATUS_CHANGE');
    }
  }

  // Non-support (like creators who are learners or other roles) can only close or reopen tickets
  if (!isSupport) {
    if (status === 'in_progress') {
      // Reopen logic: check if currently closed/resolved and within configurable window
      if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
        throw new ApiError(400, 'Ticket can only be reopened if it is currently resolved or closed', 'INVALID_REOPEN_STATE');
      }
      const windowDays = parseInt(process.env.TICKET_REOPEN_WINDOW_DAYS, 10) || 7;
      const windowMs = windowDays * 24 * 60 * 60 * 1000;
      const timeSinceUpdate = Date.now() - new Date(ticket.updatedAt).getTime();
      if (timeSinceUpdate > windowMs) {
        throw new ApiError(400, `Tickets can only be reopened within ${windowDays} days of resolution/closure`, 'REOPEN_WINDOW_EXPIRED');
      }
    } else if (status !== 'closed') {
      throw new ApiError(403, 'You do not have permission to transition ticket to this state', 'UNAUTHORIZED_STATUS_CHANGE');
    }
  }

  const oldStatus = ticket.status;
  ticket.status = status;
  
  if (status === 'resolved' || status === 'closed') {
    ticket.resolvedAt = new Date();
    ticket.slaResolutionTimeMs = ticket.resolvedAt.getTime() - new Date(ticket.createdAt).getTime();
  } else if (status === 'in_progress' || status === 'open') {
    ticket.resolvedAt = null;
    ticket.slaResolutionTimeMs = null;
  }

  await ticket.save();

  // Audit Action classification
  let auditAction = 'TICKET_STATUS_CHANGED';
  if (status === 'resolved') auditAction = 'TICKET_RESOLVED';
  else if (status === 'closed') auditAction = 'TICKET_CLOSED';
  else if (status === 'in_progress' && (oldStatus === 'closed' || oldStatus === 'resolved')) auditAction = 'TICKET_REOPENED';

  await TicketAuditLog.create({
    ticketId: ticket._id,
    actorUserId: user.id || user._id,
    actorRole: user.role,
    action: auditAction,
    metadata: { oldStatus, newStatus: status },
    ip: requestMeta?.ip || 'unknown',
    userAgent: requestMeta?.userAgent || 'unknown'
  });

  // Notify creator of status changes
  try {
    const isActorCreator = String(user.id || user._id) === String(ticket.creatorId);
    
    // Creator is always notified of status changes unless they performed it
    if (!isActorCreator) {
      await createNotification({
        userId: ticket.creatorId,
        title: `Ticket Status Updated`,
        message: `Your ticket ${ticket.ticketId} status has changed to "${status}".`,
        type: 'system',
        metadata: { ticketId: ticket._id.toString() }
      });
    }

    // If status is updated by creator, notify support team
    if (isActorCreator) {
      let supportTitle = `Ticket Status Updated: [${ticket.ticketId}]`;
      let supportMsg = `The creator has updated ticket ${ticket.ticketId} status to "${status}".`;
      if (status === 'resolved') {
        supportTitle = `Ticket Marked Resolved: [${ticket.ticketId}]`;
        supportMsg = `The creator has marked ticket ${ticket.ticketId} as resolved.`;
      } else if (status === 'closed') {
        supportTitle = `Ticket Closed: [${ticket.ticketId}]`;
        supportMsg = `The creator has closed ticket ${ticket.ticketId}.`;
      }
      await notifySupportTeam(ticket, supportTitle, supportMsg);
    }

    if (status === 'resolved') {
      // Send resolution notification & feedback request
      const creatorUser = await User.findById(ticket.creatorId).select('email name').lean();
      if (creatorUser && creatorUser.email) {
        await emailService.sendMail({
          to: creatorUser.email,
          name: creatorUser.name || 'User',
          subject: `Resolved: Ticket [${ticket.ticketId}] - ${ticket.title}`,
          text: `Hello,\n\nWe have resolved your ticket ${ticket.ticketId}. Please log in to complete resolution feedback.\n\nBest regards,\nEduCore Support Team`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
              <h2 style="color: #435947;">Ticket Resolved</h2>
              <p>Your ticket <strong>${ticket.ticketId}</strong> has been resolved by our support team.</p>
              <p>Please log in to your account to review the solution and submit your feedback.</p>
            </div>
          `
        }).catch(err => console.error('[SSMS Notifications] Failed to send ticket resolution email:', err.message));
      }
    }
  } catch (notifErr) {
    console.error('[SSMS Notifications] Status notification failed:', notifErr.message);
  }

  return ticket;
};

/**
 * Assigns or reassigns a ticket
 */
const assignTicket = async ({ ticketId, assigneeId, user, requestMeta }) => {
  const ticket = await Ticket.findOne({ _id: ticketId, deletedAt: null });
  if (!ticket) {
    throw new ApiError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  }

  const isPlatformUser = isPlatformAdmin(user.role);
  const isInstAdmin = isInstitutionAdmin(user.role);

  if (!isPlatformUser && !isInstAdmin) {
    throw new ApiError(403, 'Permission denied to assign tickets', 'FORBIDDEN');
  }

  if (isInstAdmin && !isPlatformUser) {
    // Inst Admin can only assign institution tickets belonging to their institution
    const sameInstitution = ticket.institutionId && String(ticket.institutionId) === String(user.institutionId);
    if (!sameInstitution || ticket.scope !== 'institution') {
      throw new ApiError(403, 'Access denied', 'FORBIDDEN');
    }
  }

  let assignee = null;
  if (assigneeId) {
    assignee = await User.findOne({ _id: assigneeId, deletedAt: null });
    if (!assignee) {
      throw new ApiError(404, 'Assignee not found', 'ASSIGNEE_NOT_FOUND');
    }

    // Inst Admins can only assign to users of the same institution
    if (isInstAdmin && !isPlatformUser) {
      if (String(assignee.institutionId) !== String(user.institutionId)) {
        throw new ApiError(400, 'Assignee must belong to the same institution', 'INVALID_ASSIGNEE');
      }
    }
  }

  const oldAssigneeId = ticket.assignedTo;
  ticket.assignedTo = assigneeId || null;
  ticket.status = assigneeId ? 'assigned' : 'open';
  await ticket.save();

  // Log in Audit Trail
  await TicketAuditLog.create({
    ticketId: ticket._id,
    actorUserId: user.id || user._id,
    actorRole: user.role,
    action: oldAssigneeId ? 'TICKET_REASSIGNED' : 'TICKET_ASSIGNED',
    metadata: { oldAssigneeId, newAssigneeId: assigneeId },
    ip: requestMeta?.ip || 'unknown',
    userAgent: requestMeta?.userAgent || 'unknown'
  });

  // Notify Assignee
  try {
    if (assigneeId) {
      await createNotification({
        userId: assigneeId,
        title: 'Support Ticket Assigned',
        message: `Ticket ${ticket.ticketId} has been assigned to you.`,
        type: 'system',
        metadata: { ticketId: ticket._id.toString() }
      });
    }

    // Notify Creator
    await createNotification({
      userId: ticket.creatorId,
      title: 'Ticket Assigned to Support',
      message: `Your ticket ${ticket.ticketId} has been assigned to a support agent.`,
      type: 'system',
      metadata: { ticketId: ticket._id.toString() }
    });
  } catch (notifErr) {
    console.error('[SSMS Notifications] Assign notification failed:', notifErr.message);
  }

  return ticket;
};

/**
 * Escalates a ticket to the next support tier
 */
const escalateTicket = async ({ ticketId, notes, user, requestMeta }) => {
  const ticket = await Ticket.findOne({ _id: ticketId, deletedAt: null });
  if (!ticket) {
    throw new ApiError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  }

  const isPlatformUser = isPlatformAdmin(user.role);
  const isInstAdmin = isInstitutionAdmin(user.role);

  if (!isPlatformUser && !isInstAdmin) {
    throw new ApiError(403, 'Permission denied to escalate tickets', 'FORBIDDEN');
  }

  if (isInstAdmin && !isPlatformUser) {
    const sameInstitution = ticket.institutionId && String(ticket.institutionId) === String(user.institutionId);
    if (!sameInstitution || ticket.scope !== 'institution') {
      throw new ApiError(403, 'Access denied', 'FORBIDDEN');
    }
  }

  const currentRole = ticket.assignedRole || 'institution_admin';
  let nextRole = null;

  if (currentRole === 'institution_admin') {
    nextRole = 'platform_support';
  } else if (currentRole === 'platform_support') {
    nextRole = 'platform_admin';
  } else if (currentRole === 'platform_admin') {
    nextRole = 'development';
  } else {
    throw new ApiError(400, 'Ticket is already at the highest escalation level', 'MAX_ESCALATION_REACHED');
  }

  // Update Ticket State
  ticket.assignedRole = nextRole;
  ticket.assignedTo = null; // Unassign so tier claims it
  ticket.status = 'open'; // Reset status to prompt queue claim

  // If escalated to platform support, ticket overrides to platform-wide scope
  if (nextRole === 'platform_support' || nextRole === 'platform_admin' || nextRole === 'development') {
    ticket.scope = 'platform';
  }

  await ticket.save();

  // Create chronological escalation note (internal only)
  const textNote = `Escalated to ${nextRole.toUpperCase()}. Escalation notes: ${notes || 'None'}`;
  await TicketMessage.create({
    ticketId: ticket._id,
    senderId: user.id || user._id,
    senderRole: user.role,
    message: textNote,
    isInternalNote: true
  });

  // Log in Audit Trail
  await TicketAuditLog.create({
    ticketId: ticket._id,
    actorUserId: user.id || user._id,
    actorRole: user.role,
    action: 'TICKET_ESCALATED',
    metadata: { escalatedFrom: currentRole, escalatedTo: nextRole, notes },
    ip: requestMeta?.ip || 'unknown',
    userAgent: requestMeta?.userAgent || 'unknown'
  });

  // Notify next tier queue managers
  try {
    const managers = await User.find({
      role: { $in: PLATFORM_ADMIN_ROLES },
      status: 'active',
      deletedAt: null
    }).select('_id').lean();

    for (const mgr of managers) {
      await createNotification({
        userId: mgr._id,
        title: 'Ticket Escalated',
        message: `Ticket ${ticket.ticketId} has been escalated to ${nextRole.toUpperCase()}.`,
        type: 'system',
        metadata: { ticketId: ticket._id.toString() }
      });
    }
  } catch (notifErr) {
    console.error('[SSMS Notifications] Escalation notification failed:', notifErr.message);
  }

  return ticket;
};

/**
 * Submits resolution feedback
 */
const submitFeedback = async ({ ticketId, rating, comment, user, requestMeta }) => {
  const ticket = await Ticket.findOne({ _id: ticketId, deletedAt: null });
  if (!ticket) {
    throw new ApiError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  }

  // Only creator can submit feedback
  if (String(ticket.creatorId) !== String(user.id || user._id)) {
    throw new ApiError(403, 'Only the ticket creator can submit feedback', 'FORBIDDEN');
  }

  // Feedback only allowed for resolved/closed tickets
  if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
    throw new ApiError(400, 'Feedback can only be submitted for resolved or closed tickets', 'INVALID_TICKET_STATE');
  }

  // Enforce one feedback submission per ticket
  if (ticket.feedback && ticket.feedback.submittedAt) {
    throw new ApiError(400, 'Feedback has already been submitted for this ticket', 'FEEDBACK_ALREADY_SUBMITTED');
  }

  ticket.feedback = {
    rating,
    comment: comment || '',
    submittedAt: new Date()
  };

  await ticket.save();

  // Log audit log
  await TicketAuditLog.create({
    ticketId: ticket._id,
    actorUserId: user.id || user._id,
    actorRole: user.role,
    action: 'FEEDBACK_SUBMITTED',
    metadata: { rating },
    ip: requestMeta?.ip || 'unknown',
    userAgent: requestMeta?.userAgent || 'unknown'
  });

  return ticket;
};

/**
 * Retrieve Audit logs for a specific ticket
 */
const getTicketAuditLogs = async (ticketId, user) => {
  const ticket = await Ticket.findOne({ _id: ticketId, deletedAt: null });
  if (!ticket) {
    throw new ApiError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  }

  const isPlatformUser = isPlatformAdmin(user.role);
  const isInstAdmin = isInstitutionAdmin(user.role);

  if (!isPlatformUser && !isInstAdmin) {
    throw new ApiError(403, 'Permission denied to view audit logs', 'FORBIDDEN');
  }

  if (isInstAdmin && !isPlatformUser) {
    const sameInstitution = ticket.institutionId && String(ticket.institutionId) === String(user.institutionId);
    if (!sameInstitution || ticket.scope !== 'institution') {
      throw new ApiError(403, 'Access denied', 'FORBIDDEN');
    }
  }

  return TicketAuditLog.find({ ticketId })
    .sort({ createdAt: -1 })
    .populate('actorUserId', 'name email role')
    .lean();
};

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
