const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.post('/webhook/razorpay', paymentController.razorpayWebhook);
router.post('/verify', authenticate, paymentController.verifyPayment);

router.get('/history', authenticate, paymentController.getPaymentHistory);
router.get('/by-order/:orderId', authenticate, paymentController.getPaymentByOrderId);
router.get('/:id/invoice', authenticate, paymentController.downloadInvoice);

module.exports = router;
