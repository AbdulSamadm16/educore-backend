const crypto = require('crypto');
const Enrollment = require('../models/enrollment.model');
const Payment = require('../models/payment.model');
const Course = require('../models/course.model');
const Progress = require('../models/progress.model');
const User = require('../models/user.model');
const env = require('../config/env');
const razorpay = require('../config/razorpay');
const { generateInvoicePdf } = require('../utils/pdf.util');
const emailService = require('./email.service');

/**
 * Validates Razorpay Webhook Signature
 */
const validateWebhookSignature = (rawBody, signature, secret) => {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return expectedSignature === signature;
};

/**
 * Handles Webhook Events
 */
const handleWebhook = async (reqBody, rawBody, signature) => {
  const webhookSecret = env.razorpay.webhookSecret;
  if (!webhookSecret) {
    throw new Error('Webhook secret is not configured');
  }

  const isValid = validateWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    throw new Error('Invalid webhook signature');
  }

  const eventType = reqBody.event;
  if (eventType === 'order.paid' || eventType === 'payment.captured') {
    return handlePaymentSuccess(reqBody);
  } else if (eventType === 'payment.failed') {
    return handlePaymentFailure(reqBody);
  } else if (eventType === 'refund.processed' || eventType === 'refund.failed') {
    return handleRefundEvent(reqBody);
  }
  
  return { status: 'ignored', message: `Event ${eventType} ignored` };
};

const activateEnrollmentAndRecordPayment = async (enrollment, amountPaid, currency, transactionId, orderId, webhookVerified) => {
  // Idempotent Payment Record Creation
  await Payment.create({
    learnerId: enrollment.userId,
    courseId: enrollment.courseId,
    amount: amountPaid,
    currency,
    gateway: 'razorpay',
    transactionId,
    orderId,
    paymentStatus: 'success',
    webhookVerified,
    paidAt: new Date(),
    billingAddress: enrollment.billingAddress,
    billingPhone: enrollment.billingPhone
  });

  // Activate Enrollment
  if (enrollment.status === 'pending_payment') {
    enrollment.status = 'active';
    enrollment.paymentStatus = 'success';
    enrollment.amountPaid = amountPaid;
    enrollment.paymentId = transactionId;
    await enrollment.save();

    // Initialize progress since we deferred it for paid courses
    await Progress.create({
      userId: enrollment.userId,
      courseId: enrollment.courseId,
      completedLessons: []
    });

    // Increment enrollment count
    await Course.updateOne(
      { _id: enrollment.courseId },
      { $inc: { enrollmentCount: 1 } }
    );

    // Trigger new enrollment notifications to tutor
    try {
      const { triggerNewEnrollmentNotification } = require('./notification.service');
      await triggerNewEnrollmentNotification({ studentId: enrollment.userId, courseId: enrollment.courseId });
    } catch (notifErr) {
      console.error('[Notification Error] Failed to trigger enrollment notification on payment success:', notifErr.message);
    }

    // Trigger enrollment confirmation to learner
    try {
      const { triggerEnrollmentConfirmedNotification } = require('./notification.service');
      await triggerEnrollmentConfirmedNotification({ studentId: enrollment.userId, courseId: enrollment.courseId });
    } catch (notifErr) {
      console.error('[Notification Error] Failed to trigger learner enrollment confirmation notification on payment success:', notifErr.message);
    }

    // Trigger payment success in-app notification to learner
    try {
      const { triggerPaymentSuccessNotification } = require('./notification.service');
      await triggerPaymentSuccessNotification({
        studentId: enrollment.userId,
        courseId: enrollment.courseId,
        amount: amountPaid,
        currency,
        transactionId
      });
    } catch (notifErr) {
      console.error('[Notification Error] Failed to trigger payment success notification on payment success:', notifErr.message);
    }
    
    // Notifications & Invoice Generation

    try {
      const [course, user] = await Promise.all([
        Course.findById(enrollment.courseId).select('title').lean(),
        User.findById(enrollment.userId).select('name email').lean()
      ]);

      if (course && user) {
        // Generate Invoice
        const invoiceBuffer = await generateInvoicePdf({
          transactionId,
          amount: amountPaid,
          currency,
          paidAt: new Date()
        }, course, user);

        // Send Email
        await emailService.sendPaymentSuccessEmail({
          to: user.email,
          name: user.name,
          courseTitle: course.title,
          amount: amountPaid,
          currency,
          transactionId,
          invoiceBuffer
        });
      }
    } catch (notificationError) {
      console.error('[Payment Notification Error] Failed to generate invoice or send email:', notificationError);
      // We don't throw here because the payment was successful and enrollment is active.
      // We don't want Razorpay to keep retrying the webhook.
    }
  }

  return { status: 'success', message: 'Payment processed and enrollment activated' };
};

const handlePaymentSuccess = async (reqBody) => {
  const paymentPayload = reqBody.payload.payment.entity;
  const transactionId = paymentPayload.id;
  const orderId = paymentPayload.order_id;
  const amountPaid = paymentPayload.amount / 100; // paise to INR
  const currency = paymentPayload.currency;

  // Verify uniqueness (idempotency)
  const existingPayment = await Payment.findOne({ transactionId });
  if (existingPayment) {
    if (existingPayment.paymentStatus === 'success') {
      return { status: 'already_processed', message: 'Payment already processed' };
    }
  }
  
  const enrollment = await Enrollment.findOne({
    paymentReference: orderId,
    deletedAt: null
  });

  if (!enrollment) {
    const EnrollmentRequest = require('../models/enrollmentRequest.model');
    const enrollmentRequest = await EnrollmentRequest.findOne({
      paymentReference: orderId
    });
    if (enrollmentRequest) {
      const institutionsService = require('./institutions.service');
      return await institutionsService.processPaymentSuccessInTransaction({
        enrollmentRequest,
        transactionId,
        orderId,
        webhookVerified: true
      });
    }
    throw new Error(`No pending enrollment found for orderId: ${orderId}`);
  }

  return await activateEnrollmentAndRecordPayment(enrollment, amountPaid, currency, transactionId, orderId, true);
};

const handlePaymentFailure = async (reqBody) => {
  const paymentPayload = reqBody.payload.payment.entity;
  const transactionId = paymentPayload.id;
  const orderId = paymentPayload.order_id;
  const amountAttempted = paymentPayload.amount / 100;
  const currency = paymentPayload.currency;

  const enrollment = await Enrollment.findOne({
    paymentReference: orderId,
    deletedAt: null
  });

  if (!enrollment) {
    const EnrollmentRequest = require('../models/enrollmentRequest.model');
    const enrollmentRequest = await EnrollmentRequest.findOne({
      paymentReference: orderId
    });
    if (enrollmentRequest) {
      enrollmentRequest.status = 'failed';
      await enrollmentRequest.save();

      // Create failed payment record
      await Payment.create({
        learnerId: enrollmentRequest.userId,
        institutionId: enrollmentRequest.institutionId,
        amount: amountAttempted,
        currency,
        gateway: 'razorpay',
        transactionId,
        orderId,
        paymentStatus: 'failed',
        webhookVerified: true,
        metadata: { error: paymentPayload.error_description }
      });

      const auditService = require('./audit.service');
      await auditService.logAdminAction({
        actorUserId: enrollmentRequest.userId,
        targetUserId: enrollmentRequest.userId,
        action: 'PAYMENT_FAILED',
        metadata: { requestId: enrollmentRequest._id, reason: paymentPayload.error_description || 'payment_failed_webhook' },
        requestMeta: null
      });

      return { status: 'recorded_failure', message: 'Institution payment failure recorded' };
    }
    return { status: 'error', message: 'Enrollment not found for failed payment' };
  }

  // Create failed payment record
  await Payment.create({
    learnerId: enrollment.userId,
    courseId: enrollment.courseId,
    amount: amountAttempted,
    currency,
    gateway: 'razorpay',
    transactionId,
    orderId,
    paymentStatus: 'failed',
    webhookVerified: true,
    metadata: { error: paymentPayload.error_description }
  });

  return { status: 'recorded_failure', message: 'Payment failure recorded' };
};

const handleRefundEvent = async (reqBody) => {
  const refundPayload = reqBody.payload?.refund?.entity;
  if (!refundPayload) {
    return { status: 'ignored', message: 'Refund payload missing' };
  }

  const payment = await Payment.findOne({
    $or: [
      { razorpayRefundId: refundPayload.id },
      { transactionId: refundPayload.payment_id }
    ]
  });

  if (!payment) {
    return { status: 'ignored', message: `No payment found for refund ${refundPayload.id}` };
  }

  payment.razorpayRefundId = refundPayload.id || payment.razorpayRefundId;
  payment.refundStatus = refundPayload.status || (reqBody.event === 'refund.failed' ? 'failed' : 'processed');
  payment.refundAmount = typeof refundPayload.amount === 'number'
    ? refundPayload.amount / 100
    : payment.refundAmount;
  payment.refundMetadata = refundPayload;

  if (reqBody.event === 'refund.failed') {
    payment.paymentStatus = 'refund_failed';
    payment.refundFailureReason = refundPayload.error_description || refundPayload.error_reason || 'Razorpay refund failed';

    const enrollment = await Enrollment.findOne({
      userId: payment.learnerId,
      courseId: payment.courseId,
      status: { $in: ['refund_pending', 'refund_failed', 'refunded'] }
    });

    if (enrollment) {
      const wasRefunded = enrollment.status === 'refunded';
      
      enrollment.status = 'refund_failed';
      enrollment.paymentStatus = 'refund_failed';
      
      if (wasRefunded) {
        enrollment.deletedAt = null;
        
        // Restore progress if it was deleted
        await Progress.updateOne(
          { userId: payment.learnerId, courseId: payment.courseId },
          { $set: { deletedAt: null } }
        );

        // Restore course enrollment count since access is restored
        await Course.updateOne(
          { _id: payment.courseId },
          { $inc: { enrollmentCount: 1 } }
        );
      }
      
      await enrollment.save();
    }
  } else {
    payment.paymentStatus = 'refunded';
    payment.refundFailureReason = null;
    payment.refundProcessedAt = new Date();
    payment.refundedAt = payment.refundedAt || new Date();

    const enrollment = await Enrollment.findOne({
      userId: payment.learnerId,
      courseId: payment.courseId,
      deletedAt: null,
      status: { $in: ['refund_pending', 'refund_failed'] }
    });

    if (enrollment) {
      enrollment.status = 'refunded';
      enrollment.paymentStatus = 'refunded';
      enrollment.deletedAt = new Date();
      await enrollment.save();

      await Progress.updateOne(
        { userId: payment.learnerId, courseId: payment.courseId, deletedAt: null },
        { $set: { deletedAt: new Date() } }
      );

      await Course.updateOne(
        { _id: payment.courseId, enrollmentCount: { $gt: 0 } },
        { $inc: { enrollmentCount: -1 } }
      );
    }
  }

  await payment.save();
  return { status: 'success', message: `Refund event ${reqBody.event} processed` };
};

const verifyPaymentDirect = async ({ userId, courseId, razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  const secret = env.razorpay.keySecret;
  if (!secret) throw new Error('Razorpay secret key not configured');

  const generatedSignature = crypto
    .createHmac('sha256', secret)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (generatedSignature !== razorpay_signature) {
    throw new Error('Invalid payment signature');
  }

  // Verify uniqueness (idempotency)
  const existingPayment = await Payment.findOne({ transactionId: razorpay_payment_id });
  if (existingPayment && existingPayment.paymentStatus === 'success') {
    return { status: 'already_processed', message: 'Payment already processed' };
  }

  const enrollment = await Enrollment.findOne({
    userId,
    courseId,
    paymentReference: razorpay_order_id,
    deletedAt: null
  });

  if (!enrollment) {
    throw new Error('Pending enrollment not found for this user and order');
  }

  // Fetch actual payment details from Razorpay to safely get amount/currency
  const payment = await razorpay.payments.fetch(razorpay_payment_id);
  const amountPaid = payment.amount / 100;
  const currency = payment.currency;

  return await activateEnrollmentAndRecordPayment(
    enrollment,
    amountPaid,
    currency,
    razorpay_payment_id,
    razorpay_order_id,
    false // webhookVerified = false because it's frontend-verified
  );
};

module.exports = {
  handleWebhook,
  verifyPaymentDirect
};
