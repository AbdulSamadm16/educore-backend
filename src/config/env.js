const dotenv = require('dotenv');
const Joi = require('joi');

dotenv.config();

const isProductionInput = process.env.NODE_ENV === 'production';
const secretSchema = isProductionInput
  ? Joi.string().min(32).required()
  : Joi.string().min(16).default('development-only-secret-value-32chars');

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  TRUST_PROXY: Joi.boolean().default(false),
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
  COOKIE_SECURE: Joi.boolean().default(isProductionInput),
  COOKIE_SAME_SITE: Joi.string().valid('strict', 'lax', 'none').default(isProductionInput ? 'none' : 'lax'),
  ACCESS_COOKIE_MAX_AGE_MINUTES: Joi.number().integer().min(1).default(15),

  MONGO_URI: Joi.string().uri({ scheme: [/mongodb/, /mongodb\+srv/] }).default('mongodb://127.0.0.1:27017/educore_lms'),
  REDIS_DRIVER: Joi.string().valid('redis', 'upstash-rest', 'memory', 'auto').default('auto'),
  REDIS_URL: Joi.string().uri({ scheme: [/redis/, /rediss/] }).allow('', null).default('redis://127.0.0.1:6379'),
  UPSTASH_REDIS_REST_URL: Joi.string().uri({ scheme: [/https/] }).allow('', null).default(''),
  UPSTASH_REDIS_REST_TOKEN: Joi.string().allow('', null).default(''),

  JWT_ACCESS_SECRET: secretSchema,
  JWT_REFRESH_SECRET: secretSchema,
  JWT_TOKEN_HASH_SECRET: secretSchema,
  JWT_ISSUER: Joi.string().default('educore'),
  JWT_AUDIENCE: Joi.string().default('educore-lms'),
  ACCESS_TOKEN_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(7),
  REMEMBER_ME_REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(30),

  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  ACCOUNT_LOCK_ATTEMPTS: Joi.number().integer().min(1).default(5),
  ACCOUNT_LOCK_MINUTES: Joi.number().integer().min(1).default(15),

  OTP_TTL_SECONDS: Joi.number().integer().min(60).default(600),
  OTP_RESEND_SECONDS: Joi.number().integer().min(10).default(60),
  OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),

  PASSWORD_RESET_TTL_SECONDS: Joi.number().integer().min(300).default(1800),
  API_PUBLIC_URL: Joi.string().uri().default('http://localhost:4000'),
  CLIENT_URL: Joi.string().uri().default('http://localhost:3000'),

  BREVO_API_KEY: isProductionInput ? Joi.string().required() : Joi.string().allow('', null).default(''),
  BREVO_API_URL: Joi.string().uri().default('https://api.brevo.com/v3/smtp/email'),
  BREVO_SENDER_NAME: Joi.string().default('EduCore'),
  BREVO_SENDER_EMAIL: Joi.string().email({ tlds: { allow: false } }).default('no-reply@educore.local'),

  CLOUDINARY_CLOUD_NAME: Joi.string().allow('', null).default(''),
  CLOUDINARY_API_KEY: Joi.string().allow('', null).default(''),
  CLOUDINARY_API_SECRET: Joi.string().allow('', null).default(''),
  CLOUDINARY_AVATAR_FOLDER: Joi.string().default('educore/avatars'),

  MAX_AVATAR_SIZE_BYTES: Joi.number().integer().min(1024).default(5 * 1024 * 1024),

  MUX_TOKEN_ID: Joi.string().allow('', null).default(''),
  MUX_TOKEN_SECRET: Joi.string().allow('', null).default(''),
  MUX_WEBHOOK_SECRET: Joi.string().allow('', null).default(''),
  MUX_SIGNING_KEY_ID: Joi.string().allow('', null).default(''),
  MUX_SIGNING_KEY_PRIVATE_KEY: Joi.string().allow('', null).default(''),

  RAZORPAY_KEY_ID: Joi.string().allow('', null).default(''),
  RAZORPAY_KEY_SECRET: Joi.string().allow('', null).default(''),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().allow('', null).default('')
}).unknown(true);

const { value, error } = schema.validate(process.env, {
  abortEarly: false,
  convert: true
});

if (error) {
  throw new Error(`Environment validation failed: ${error.details.map((detail) => detail.message).join(', ')}`);
}

const corsOrigins = value.CORS_ORIGIN === '*'
  ? '*'
  : value.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

module.exports = {
  nodeEnv: value.NODE_ENV,
  isProduction: value.NODE_ENV === 'production',
  port: value.PORT,
  trustProxy: value.TRUST_PROXY,
  cors: {
    origins: corsOrigins
  },
  cookies: {
    secure: value.COOKIE_SECURE,
    sameSite: value.COOKIE_SAME_SITE,
    accessMaxAgeMinutes: value.ACCESS_COOKIE_MAX_AGE_MINUTES
  },
  mongo: {
    uri: value.MONGO_URI
  },
  redis: {
    driver: value.REDIS_DRIVER,
    url: value.REDIS_URL,
    upstashRestUrl: value.UPSTASH_REDIS_REST_URL,
    upstashRestToken: value.UPSTASH_REDIS_REST_TOKEN,
    useUpstashRest: value.REDIS_DRIVER === 'upstash-rest'
      || (value.REDIS_DRIVER === 'auto' && Boolean(value.UPSTASH_REDIS_REST_URL && value.UPSTASH_REDIS_REST_TOKEN)),
    useMemory: value.REDIS_DRIVER === 'memory'
  },
  jwt: {
    accessSecret: value.JWT_ACCESS_SECRET,
    refreshSecret: value.JWT_REFRESH_SECRET,
    issuer: value.JWT_ISSUER,
    audience: value.JWT_AUDIENCE,
    accessTokenTtl: value.ACCESS_TOKEN_TTL,
    refreshTokenTtlDays: value.REFRESH_TOKEN_TTL_DAYS,
    rememberMeRefreshTokenTtlDays: value.REMEMBER_ME_REFRESH_TOKEN_TTL_DAYS
  },
  security: {
    tokenHashSecret: value.JWT_TOKEN_HASH_SECRET,
    bcryptSaltRounds: value.BCRYPT_SALT_ROUNDS,
    accountLockAttempts: value.ACCOUNT_LOCK_ATTEMPTS,
    accountLockMinutes: value.ACCOUNT_LOCK_MINUTES
  },
  otp: {
    ttlSeconds: value.OTP_TTL_SECONDS,
    resendSeconds: value.OTP_RESEND_SECONDS,
    maxAttempts: value.OTP_MAX_ATTEMPTS
  },
  passwordReset: {
    ttlSeconds: value.PASSWORD_RESET_TTL_SECONDS
  },
  client: {
    apiPublicUrl: value.API_PUBLIC_URL.replace(/\/$/, ''),
    url: value.CLIENT_URL.replace(/\/$/, '')
  },
  brevo: {
    apiKey: value.BREVO_API_KEY,
    apiUrl: value.BREVO_API_URL,
    senderName: value.BREVO_SENDER_NAME,
    senderEmail: value.BREVO_SENDER_EMAIL
  },
  cloudinary: {
    cloudName: value.CLOUDINARY_CLOUD_NAME,
    apiKey: value.CLOUDINARY_API_KEY,
    apiSecret: value.CLOUDINARY_API_SECRET,
    avatarFolder: value.CLOUDINARY_AVATAR_FOLDER.replace(/^\/|\/$/g, '')
  },
  mux: {
    tokenId: value.MUX_TOKEN_ID,
    tokenSecret: value.MUX_TOKEN_SECRET,
    webhookSecret: value.MUX_WEBHOOK_SECRET,
    signingKeyId: value.MUX_SIGNING_KEY_ID,
    signingKeyPrivateKey: value.MUX_SIGNING_KEY_PRIVATE_KEY
  },
  razorpay: {
    keyId: value.RAZORPAY_KEY_ID,
    keySecret: value.RAZORPAY_KEY_SECRET,
    webhookSecret: value.RAZORPAY_WEBHOOK_SECRET
  },
  uploads: {
    maxAvatarSizeBytes: value.MAX_AVATAR_SIZE_BYTES
  }
};
