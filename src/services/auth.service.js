const User = require('../models/user.model');
const Institution = require('../models/institution.model');
const InstitutionMembership = require('../models/institutionMembership.model');
const InstitutionFeePlan = require('../models/institutionFeePlan.model');
const redis = require('../config/redis');
const env = require('../config/env');

// Ensure event subscribers are loaded
require('../subscribers/auth.subscriber');
const { ApiError } = require('../utils/errors');
const { normalizeEmail } = require('../utils/normalize');
const { randomToken, hashToken } = require('../utils/crypto');
const { hashPassword, comparePassword } = require('../utils/password');
const { toPublicUser } = require('../utils/userPresenter');
const otpService = require('./otp.service');
const emailService = require('./email.service');

const { ACCOUNT_TYPES, ROLES } = require('../utils/roles');
const {
  createSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions
} = require('./session.service');

const PLATFORM_OWNER_ROLE = ROLES.PLATFORM_OWNER;
const resetTokenKey = ({ tokenHash }) => `password-reset:${tokenHash}`;

const standardUserFilter = {
  deletedAt: null
};

const ensureEmailAvailable = async (email) => {
  const existingUser = await User.exists({
    email,
    deletedAt: null
  });

  if (existingUser) {
    throw new ApiError(409, 'Email is already registered', 'EMAIL_ALREADY_EXISTS');
  }
};

const findStandardUserByEmail = async (email) => User.findOne({
    ...standardUserFilter,
    email
  }).select('+googleRefreshToken');

const findStandardUserWithPasswordByEmail = async (email) => User.findOne({
    ...standardUserFilter,
    email
  }).select('+passwordHash +googleRefreshToken');

const assertCanLogin = (user) => {
  if (user.status === 'rejected' && user.role !== ROLES.TUTOR) {
    throw new ApiError(403, 'Your account has been rejected by an administrator.', 'ACCOUNT_REJECTED', { fullName: user.name });
  }

  if (['pending_verification', 'suspended', 'blocked', 'banned'].includes(user.status)) {
    throw new ApiError(403, 'Account is not active or is blocked', 'ACCOUNT_NOT_ACTIVE');
  }

  if (!user.emailVerified) {
    throw new ApiError(403, 'Email verification required', 'EMAIL_VERIFICATION_REQUIRED');
  }

  if (user.status !== 'active' && user.status !== 'pending_approval' && !(user.status === 'rejected' && user.role === ROLES.TUTOR)) {
    throw new ApiError(403, 'Account is not active', 'ACCOUNT_NOT_ACTIVE');
  }
};

const register = async ({ payload }) => {
  const email = normalizeEmail(payload.email);

  // 1. Duplicate Account Check
  const existingUser = await User.findOne({
    email,
    deletedAt: null
  });

  if (existingUser) {
    if (existingUser.role === ROLES.TUTOR && existingUser.status === 'rejected') {
      // Allow registration to proceed (reapplying)
    } else {
      throw new ApiError(409, 'Email is already registered', 'EMAIL_ALREADY_EXISTS');
    }
  }

  const pendingRegKey = `pending-registration:${email}`;
  const pendingReg = await redis.get(pendingRegKey);
  if (pendingReg) {
    throw new ApiError(409, 'A pending registration already exists for this email', 'REGISTRATION_ALREADY_PENDING');
  }

  // 2. Institution Check
  const isInstitutionFlow = [ACCOUNT_TYPES.INSTITUTION_LEARNER, ACCOUNT_TYPES.INSTITUTION_TUTOR].includes(payload.registrationType);
  if (isInstitutionFlow) {
    const inst = await Institution.findOne({ _id: payload.institutionId, deletedAt: null });
    if (!inst) {
      throw new ApiError(400, 'Institution not found', 'INSTITUTION_INVALID');
    }
    if (inst.status !== 'active' || inst.isPublished !== true || inst.acceptsEnrollments !== true) {
      throw new ApiError(400, 'Institution does not accept enrollments at this time', 'INSTITUTION_INVALID');
    }
  }

  // 3. Rate Limit / Cooldown Check
  await otpService.enforceResendCooldown({
    userId: email,
    purpose: otpService.PURPOSES.EMAIL_VERIFICATION
  });

  // 4. Hash Password & Generate OTP
  const passwordHash = await hashPassword(payload.password);
  const otp = await otpService.createOtp({
    userId: email,
    purpose: otpService.PURPOSES.EMAIL_VERIFICATION,
    metadata: {
      email
    }
  });

  // 5. Store Pending Registration in Redis
  const pendingData = {
    fullName: payload.fullName,
    email,
    passwordHash,
    registrationType: payload.registrationType,
    institutionId: payload.institutionId || null,
    otp,
    createdAt: new Date().toISOString()
  };

  await redis.set(pendingRegKey, JSON.stringify(pendingData), 'EX', 900); // 15 minutes TTL

  // 6. Send Verification Email
  await emailService.sendOtpEmail({
    to: email,
    otp,
    name: payload.fullName
  });

  return {
    message: 'Registration successful. Please verify your email.'
  };
};

const verifyEmail = async ({ payload, requestMeta }) => {
  const email = normalizeEmail(payload.email);

  // 1. Get Redis record
  const key = `pending-registration:${email}`;
  const raw = await redis.get(key);
  if (!raw) {
    throw new ApiError(400, 'Registration expired or invalid. Please register again.', 'REGISTRATION_EXPIRED');
  }

  const regData = JSON.parse(raw);

  // 2. Verify OTP
  await otpService.verifyOtp({
    userId: email,
    purpose: otpService.PURPOSES.EMAIL_VERIFICATION,
    otp: payload.otp
  });

  // 3. User Role & Status rules
  let role = ROLES.LEARNER;
  if (regData.registrationType === ACCOUNT_TYPES.INDIVIDUAL_TUTOR || regData.registrationType === ACCOUNT_TYPES.INSTITUTION_TUTOR) {
    role = ROLES.TUTOR;
  }

  const nextStatus = role === ROLES.TUTOR ? 'pending_approval' : 'active';

  let user;
  const existingUser = await User.findOne({ email: regData.email, deletedAt: null });
  if (existingUser) {
    if (existingUser.role === ROLES.TUTOR && existingUser.status === 'rejected') {
      existingUser.name = regData.fullName;
      existingUser.passwordHash = regData.passwordHash;
      existingUser.role = role;
      existingUser.accountType = regData.registrationType;
      existingUser.status = nextStatus;
      existingUser.emailVerified = true;
      existingUser.institutionId = regData.institutionId || null;
      existingUser.failedLoginAttempts = 0;
      existingUser.lockUntil = null;
      user = await existingUser.save();
    } else {
      throw new ApiError(409, 'Email is already registered', 'EMAIL_ALREADY_EXISTS');
    }
  } else {
    user = await User.create({
      name: regData.fullName,
      email: regData.email,
      passwordHash: regData.passwordHash,
      role,
      accountType: regData.registrationType,
      status: nextStatus,
      emailVerified: true,
      institutionId: regData.institutionId || null
    });
  }

  // 5. Emit user.verified event (handles membership, audit log, notifications)
  const eventEmitter = require('../utils/eventEmitter');
  eventEmitter.emit('user.verified', { user, regData, requestMeta });

  // 6. Delete Redis keys
  await redis.del(key);
  await redis.del(`otp-resend:${otpService.PURPOSES.EMAIL_VERIFICATION}:${email}`);

  const tokens = await createSession({
    user,
    rememberMe: payload.rememberMe,
    requestMeta
  });

  const message = nextStatus === 'pending_approval'
    ? 'Email verified. Your tutor account is now under review by an administrator.'
    : 'Email verified successfully.';

  return {
    message,
    data: {
      user: toPublicUser(user),
      ...tokens
    }
  };
};

const resendOtp = async ({ payload }) => {
  const email = normalizeEmail(payload.email);

  // Check Redis pending registration
  const key = `pending-registration:${email}`;
  const raw = await redis.get(key);
  if (!raw) {
    throw new ApiError(400, 'Registration expired or invalid. Please register again.', 'REGISTRATION_EXPIRED');
  }

  const regData = JSON.parse(raw);

  // Enforce resend cooldown using email as userId
  await otpService.enforceResendCooldown({
    userId: email,
    purpose: otpService.PURPOSES.EMAIL_VERIFICATION
  });

  const otp = await otpService.createOtp({
    userId: email,
    purpose: otpService.PURPOSES.EMAIL_VERIFICATION,
    metadata: {
      email
    }
  });

  // Update Redis payload's OTP
  regData.otp = otp;
  const ttl = await redis.ttl(key);
  const expiry = ttl > 0 ? ttl : 900; // default 15 minutes
  await redis.set(key, JSON.stringify(regData), 'EX', expiry);

  await emailService.sendOtpEmail({
    to: email,
    otp,
    name: regData.fullName
  });

  return {
    message: 'A new OTP has been sent to your email.'
  };
};

const login = async ({ payload, requestMeta }) => {
  const genericError = new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  const email = normalizeEmail(payload.email);
  const user = await findStandardUserWithPasswordByEmail(email);

  if (!user) {
    throw genericError;
  }

    const now = new Date();

    // BUG FIX 1: Active lock — reject immediately
    if (user.lockUntil && user.lockUntil > now) {
      throw new ApiError(423, 'Account is temporarily locked', 'ACCOUNT_LOCKED');
    }

    // BUG FIX 2: Lock has EXPIRED — clear it atomically in the DB BEFORE the bcrypt comparison.
    // Without this, a concurrent request could read the stale future lockUntil and
    // block a user who already waited out their lock period.
    if (user.lockUntil && user.lockUntil <= now) {
    const loginAt = new Date();
    await User.updateOne(
      { _id: user._id, deletedAt: null },
      { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: loginAt } }
    );
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = loginAt;
    }

    // BUG FIX 3: If passwordHash is missing (e.g. Google Login), reject with 401 instead of crashing bcrypt (500)
    if (!user.passwordHash) {
      throw new ApiError(401, 'Please login with Google', 'USE_GOOGLE_LOGIN');
    }

    // bcrypt compare is slow (~100-200ms) — a concurrent bad-password request
    // must not be able to race and set a future lockUntil in the gap.
    const passwordMatches = await comparePassword(payload.password, user.passwordHash);

    if (!passwordMatches) {
      // BUG FIX 3: Use atomic $inc so concurrent requests cannot both read failedLoginAttempts=0
      // and both write back 1, causing the counter to never actually reach the lock threshold.
      const updated = await User.findOneAndUpdate(
        { _id: user._id, deletedAt: null },
        { $inc: { failedLoginAttempts: 1 } },
        { new: true }
      );

      const nextAttempts = updated?.failedLoginAttempts ?? (user.failedLoginAttempts + 1);
      const shouldLock = nextAttempts >= env.security.accountLockAttempts;

      if (shouldLock) {
        const lockUntil = new Date(Date.now() + env.security.accountLockMinutes * 60 * 1000);
        await User.updateOne(
          { _id: user._id, deletedAt: null },
          { $set: { lockUntil } }
        );
      }

      throw genericError;
    }

    assertCanLogin(user);

    // Successful login — reset failed attempt counter atomically
    const loginAt = new Date();
    await User.updateOne(
      { _id: user._id, deletedAt: null },
      { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: loginAt } }
    );

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = loginAt;

    const tokens = await createSession({
      user,
      rememberMe: payload.rememberMe,
      requestMeta
    });

    return {
      message: 'Login successful.',
      data: {
        user: toPublicUser(user),
        role: user.role,
        ...tokens
      }
    };
};


const forgotPassword = async ({ payload }) => {
  const email = normalizeEmail(payload.email);
  const user = await findStandardUserByEmail(email);

  if (user) {
    try {
      const token = randomToken();
      const tokenHash = hashToken(token);

      await redis.set(
        resetTokenKey({ tokenHash }),
        JSON.stringify({
          userId: String(user._id)
        }),
        'EX',
        env.passwordReset.ttlSeconds
      );

      const resetUrl = `${env.client.url}/reset-password?token=${encodeURIComponent(token)}`;

      await emailService.sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        name: user.name
      });
    } catch (error) {
      if (!env.isProduction) {
        console.error('Forgot password delivery failed:', error.message);
      }
    }
  }

  return {
    message: 'If the email exists, password reset instructions have been sent.'
  };
};

const resetPassword = async ({ payload, requestMeta }) => {
  if (!payload.token) {
    throw new ApiError(400, 'Invalid or expired reset token', 'RESET_TOKEN_INVALID');
  }

  const tokenHash = hashToken(payload.token);
  const key = resetTokenKey({ tokenHash });
  const raw = await redis.get(key);

  if (!raw) {
    throw new ApiError(400, 'Invalid or expired reset token', 'RESET_TOKEN_INVALID');
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    await redis.del(key);
    throw new ApiError(400, 'Invalid or expired reset token', 'RESET_TOKEN_INVALID');
  }

  const passwordHash = await hashPassword(payload.password);
  const user = await User.findOneAndUpdate(
    {
      _id: parsed.userId,
      ...standardUserFilter,
      deletedAt: null
    },
    {
      $set: {
        passwordHash,
        failedLoginAttempts: 0,
        lockUntil: null
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (!user) {
    await redis.del(key);
    throw new ApiError(400, 'Invalid or expired reset token', 'RESET_TOKEN_INVALID');
  }

  await revokeAllUserSessions({
    userId: user._id,
    reason: 'password_reset',
    ip: requestMeta?.ip
  });
  await redis.del(key);

  return {
    message: 'Password reset successful.',
    data: {
      redirectTo: '/login'
    }
  };
};

const refresh = async ({ payload, requestMeta }) => {
  const tokens = await rotateRefreshToken({
    refreshToken: payload.refreshToken,
    requestMeta
  });

  return {
    message: 'Token refreshed successfully.',
    data: tokens
  };
};

const logout = async ({ payload, requestMeta }) => {
  await revokeRefreshToken({
    refreshToken: payload.refreshToken,
    requestMeta
  });

  return {
    message: 'Logout successful.'
  };
};

module.exports = {
  register,
  verifyEmail,
  resendOtp,
  login,
  forgotPassword,
  resetPassword,
  refresh,
  logout
};
