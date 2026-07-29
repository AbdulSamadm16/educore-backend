const crypto = require('crypto');
const env = require('../config/env');

const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('hex');

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hmac = (value) => crypto
  .createHmac('sha256', env.security.tokenHashSecret)
  .update(value)
  .digest('hex');

const hashToken = (token) => hmac(token);

const hashOtp = ({ userId, purpose, otp }) => hmac(`${userId}:${purpose}:${otp}`);

const timingSafeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

module.exports = {
  randomToken,
  generateOtp,
  hashToken,
  hashOtp,
  timingSafeEqual
};
