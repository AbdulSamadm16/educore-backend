const { asyncHandler, ApiError } = require('../utils/errors');
const paymentService = require('../services/payment.service');
const Payment = require('../models/payment.model');
const Course = require('../models/course.model');
const { generateInvoicePdf } = require('../utils/pdf.util');
const { sendSuccess } = require('../utils/response');
/**
 * @desc    Handle Razorpay Webhooks
 * @route   POST /api/v1/payments/webhook/razorpay
 * @access  Public (Validated by Razorpay Signature)
 */
const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    throw new ApiError(400, 'Missing Razorpay signature');
  }
  
  const rawBody = JSON.stringify(req.body); // We stringify since the body parser already parsed it.

  try {
    const result = await paymentService.handleWebhook(req.body, rawBody, signature);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[Razorpay Webhook Error]', error);
    // Even if it fails, we return 200 so Razorpay stops retrying aggressively if it's a validation fail, 
    // but standard practice is 400 for bad signature, 500 for server error.
    if (error.message.includes('Invalid webhook signature')) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

const verifyPayment = asyncHandler(async (req, res) => {
  const { courseId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const userId = req.user._id;

  if (!courseId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ApiError(400, 'Missing required fields for verification');
  }

  const result = await paymentService.verifyPaymentDirect({
    userId,
    courseId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  });

  // Fetch the payment record so the frontend success page has all details
  const payment = await Payment.findOne({ transactionId: razorpay_payment_id })
    .populate('courseId', 'title thumbnailUrl')
    .lean();

  return sendSuccess(res, 200, result.message, { payment });
});

/**
 * @desc    Fetch a single payment by its Razorpay order ID (for success page re-entry)
 * @route   GET /api/v1/payments/by-order/:orderId
 * @access  Private (learner must own the payment)
 */
const getPaymentByOrderId = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user._id;

  const payment = await Payment.findOne({ orderId, learnerId: userId })
    .populate('courseId', 'title thumbnailUrl')
    .lean();

  if (!payment) throw new ApiError(404, 'Payment record not found');

  return sendSuccess(res, 200, 'Payment fetched', { payment });
});

const getPaymentHistory = asyncHandler(async (req, res) => {
  const { startDate, endDate, status } = req.query;
  const userId = req.user._id;

  const filter = { learnerId: userId };
  
  if (status && status !== 'all') {
    filter.paymentStatus = status;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const payments = await Payment.find(filter)
    .populate('courseId', 'title slug thumbnailUrl')
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, 200, 'Payment history retrieved', { payments });
});

const downloadInvoice = asyncHandler(async (req, res) => {
  const paymentId = req.params.id;
  const userId = req.user._id;

  const payment = await Payment.findOne({
    _id: paymentId,
    learnerId: userId,
    paymentStatus: 'success'
  }).lean();

  if (!payment) {
    throw new ApiError(404, 'Valid payment record not found for invoice');
  }

  const course = await Course.findById(payment.courseId).select('title').lean();
  
  const invoiceBuffer = await generateInvoicePdf(payment, course || {}, req.user);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Invoice-${payment.transactionId}.pdf`);
  res.send(invoiceBuffer);
});

module.exports = {
  razorpayWebhook,
  verifyPayment,
  getPaymentByOrderId,
  getPaymentHistory,
  downloadInvoice
};
