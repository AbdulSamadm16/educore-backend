const RefreshToken = require('../models/refreshToken.model');
const User = require('../models/user.model');
const { ApiError } = require('../utils/errors');
const { hashToken } = require('../utils/crypto');
const {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken
} = require('../utils/tokens');

const assertUserCanUseSession = (user) => {
  if (!user || user.deletedAt) {
    throw new ApiError(401, 'Invalid refresh token', 'REFRESH_TOKEN_INVALID');
  }

  if (!user.emailVerified || user.status === 'pending_verification') {
    throw new ApiError(403, 'Email verification required', 'EMAIL_VERIFICATION_REQUIRED');
  }

  if (user.status === 'banned' || user.status === 'suspended') {
    throw new ApiError(403, 'Account is not active', 'ACCOUNT_NOT_ACTIVE');
  }

  if (user.status === 'pending_approval') {
    throw new ApiError(403, 'Your account is under review by an administrator.', 'ACCOUNT_PENDING_APPROVAL');
  }
};

const assertRefreshPayload = (payload) => {
  if (payload.type !== 'refresh') {
    throw new ApiError(401, 'Invalid refresh token', 'REFRESH_TOKEN_INVALID');
  }
};

const createSession = async ({ user, rememberMe = false, requestMeta }) => {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user, rememberMe);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: refreshToken.tokenHash,
    expiresAt: refreshToken.expiresAt,
    rememberMe: refreshToken.rememberMe,
    deviceInfo: requestMeta?.deviceInfo,
    createdByIp: requestMeta?.ip || 'unknown'
  });

  return {
    accessToken,
    refreshToken: refreshToken.token,
    refreshTokenExpiresAt: refreshToken.expiresAt
  };
};

const revokeAllUserSessions = async ({ userId, reason, ip }) => RefreshToken.updateMany(
  {
    userId,
    revokedAt: null
  },
  {
    $set: {
      revokedAt: new Date(),
      revokedReason: reason,
      revokedByIp: ip || null
    }
  }
);

const revokeOtherUserSessions = async ({ userId, reason, ip, currentRefreshToken }) => {
  const query = {
    userId,
    revokedAt: null
  };

  if (currentRefreshToken) {
    query.tokenHash = { $ne: hashToken(currentRefreshToken) };
  }

  return RefreshToken.updateMany(query, {
    $set: {
      revokedAt: new Date(),
      revokedReason: reason,
      revokedByIp: ip || null
    }
  });
};

const rotateRefreshToken = async ({ refreshToken, requestMeta }) => {
  let payload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (_error) {
    throw new ApiError(401, 'Invalid refresh token', 'REFRESH_TOKEN_INVALID');
  }

  assertRefreshPayload(payload);

  const tokenHash = hashToken(refreshToken);
  const existing = await RefreshToken.findOne({
    userId: payload.sub,
    tokenHash
  }).select('+tokenHash +replacedByTokenHash');

  if (!existing) {
    await revokeAllUserSessions({
      userId: payload.sub,
      reason: 'refresh_reuse_detected',
      ip: requestMeta?.ip
    });
    throw new ApiError(401, 'Invalid refresh token', 'REFRESH_TOKEN_INVALID');
  }

  if (existing.revokedAt) {
    await revokeAllUserSessions({
      userId: existing.userId,
      reason: 'refresh_reuse_detected',
      ip: requestMeta?.ip
    });
    throw new ApiError(401, 'Invalid refresh token', 'REFRESH_TOKEN_INVALID');
  }

  if (existing.expiresAt <= new Date()) {
    await RefreshToken.updateOne(
      {
        _id: existing._id,
        userId: existing.userId
      },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: 'expired',
          revokedByIp: requestMeta?.ip || null
        }
      }
    );
    throw new ApiError(401, 'Invalid refresh token', 'REFRESH_TOKEN_INVALID');
  }

  const user = await User.findOne({
    _id: existing.userId,
    deletedAt: null
  });

  assertUserCanUseSession(user);

  const newAccessToken = createAccessToken(user);
  const newRefreshToken = createRefreshToken(user, existing.rememberMe);

  const rotated = await RefreshToken.findOneAndUpdate(
    {
      _id: existing._id,
      userId: existing.userId,
      revokedAt: null
    },
    {
      $set: {
        revokedAt: new Date(),
        revokedReason: 'rotated',
        replacedByTokenHash: newRefreshToken.tokenHash,
        revokedByIp: requestMeta?.ip || null
      }
    },
    {
      new: true
    }
  );

  if (!rotated) {
    await revokeAllUserSessions({
      userId: existing.userId,
      reason: 'refresh_rotation_race',
      ip: requestMeta?.ip
    });
    throw new ApiError(401, 'Invalid refresh token', 'REFRESH_TOKEN_INVALID');
  }

  await RefreshToken.create({
    userId: existing.userId,
    tokenHash: newRefreshToken.tokenHash,
    expiresAt: newRefreshToken.expiresAt,
    rememberMe: newRefreshToken.rememberMe,
    deviceInfo: requestMeta?.deviceInfo,
    createdByIp: requestMeta?.ip || 'unknown'
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken.token,
    refreshTokenExpiresAt: newRefreshToken.expiresAt
  };
};

const revokeRefreshToken = async ({ refreshToken, requestMeta }) => {
  let payload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (_error) {
    return;
  }

  try {
    assertRefreshPayload(payload);
  } catch (_error) {
    return;
  }

  await RefreshToken.updateOne(
    {
      userId: payload.sub,
      tokenHash: hashToken(refreshToken),
      revokedAt: null
    },
    {
      $set: {
        revokedAt: new Date(),
        revokedReason: 'logout',
        revokedByIp: requestMeta?.ip || null
      }
    }
  );
};

module.exports = {
  createSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  revokeOtherUserSessions
};
