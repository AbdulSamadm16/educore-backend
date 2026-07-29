const redis = require('../config/redis');
const env = require('../config/env');
const { ApiError } = require('../utils/errors');
const { generateOtp, hashOtp, timingSafeEqual } = require('../utils/crypto');

const PURPOSES = {
  EMAIL_VERIFICATION: 'email_verification',
  EMAIL_CHANGE: 'email_change'
};

const otpKey = ({ userId, purpose }) => `otp:${purpose}:${userId}`;
const resendKey = ({ userId, purpose }) => `otp-resend:${purpose}:${userId}`;

const safeParse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
};

const createOtp = async ({ userId, purpose, metadata = {} }) => {
  const otp = generateOtp();
  const key = otpKey({ userId, purpose });
  const payload = {
    otpHash: hashOtp({ userId, purpose, otp }),
    attempts: 0,
    metadata,
    createdAt: new Date().toISOString()
  };

  await redis.set(key, JSON.stringify(payload), 'EX', env.otp.ttlSeconds);

  return otp;
};

const enforceResendCooldown = async ({ userId, purpose }) => {
  const key = resendKey({ userId, purpose });
  const result = await redis.set(key, '1', 'EX', env.otp.resendSeconds, 'NX');

  if (result !== 'OK') {
    throw new ApiError(429, 'Please wait before requesting another OTP', 'OTP_RESEND_RATE_LIMITED', {
      retryAfterSeconds: env.otp.resendSeconds
    });
  }
};

const verifyOtp = async ({ userId, purpose, otp }) => {
  const key = otpKey({ userId, purpose });
  const raw = await redis.get(key);

  if (!raw) {
    throw new ApiError(400, 'Invalid or expired OTP', 'OTP_INVALID');
  }

  const payload = safeParse(raw);

  if (!payload) {
    await redis.del(key);
    throw new ApiError(400, 'Invalid or expired OTP', 'OTP_INVALID');
  }

  if (payload.attempts >= env.otp.maxAttempts) {
    throw new ApiError(429, 'Too many OTP attempts', 'OTP_ATTEMPTS_EXCEEDED');
  }

  const candidateHash = hashOtp({ userId, purpose, otp });

  if (!timingSafeEqual(candidateHash, payload.otpHash)) {
    payload.attempts += 1;
    const ttl = await redis.ttl(key);
    const expiry = ttl > 0 ? ttl : env.otp.ttlSeconds;
    await redis.set(key, JSON.stringify(payload), 'EX', expiry);

    if (payload.attempts >= env.otp.maxAttempts) {
      throw new ApiError(429, 'Too many OTP attempts', 'OTP_ATTEMPTS_EXCEEDED');
    }

    throw new ApiError(400, 'Invalid or expired OTP', 'OTP_INVALID');
  }

  await redis.del(key);

  return payload.metadata || {};
};

module.exports = {
  PURPOSES,
  createOtp,
  enforceResendCooldown,
  verifyOtp
};
