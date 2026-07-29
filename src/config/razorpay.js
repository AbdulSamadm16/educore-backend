// config/razorpay.js

require('dotenv').config();

const Razorpay = require('razorpay');

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

// Validate environment variables
if (!keyId || !keySecret) {
  console.error('❌ Razorpay credentials are missing in .env file');
  process.exit(1);
}

// Create Razorpay instance
const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

module.exports = razorpay;