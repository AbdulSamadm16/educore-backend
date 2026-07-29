const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { hashToken } = require('./crypto');
const { inferAccountType } = require('./roles');

const createTokenPayload = (user, type) => {
  const accountType = inferAccountType(user);
  const isInstitution = ['institution_learner', 'institution_tutor', 'institution_admin'].includes(accountType);
  const tenant = user.__tenant || (isInstitution ? 'institution' : 'individual');

  return {
    sub: String(user._id),
    role: user.role,
    accountType,
    institutionId: user.institutionId ? String(user.institutionId) : null,
    tenant,
    type
  };
};

const createAccessToken = (user) => jwt.sign(
  createTokenPayload(user, 'access'),
  env.jwt.accessSecret,
  {
    expiresIn: env.jwt.accessTokenTtl,
    issuer: env.jwt.issuer,
    audience: env.jwt.audience
  }
);

const createRefreshToken = (user, rememberMe = false) => {
  const ttlDays = rememberMe
    ? env.jwt.rememberMeRefreshTokenTtlDays
    : env.jwt.refreshTokenTtlDays;

  const token = jwt.sign(
    {
      ...createTokenPayload(user, 'refresh'),
      jti: crypto.randomUUID()
    },
    env.jwt.refreshSecret,
    {
      expiresIn: `${ttlDays}d`,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience
    }
  );

  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
    rememberMe
  };
};

const verifyAccessToken = (token) => jwt.verify(token, env.jwt.accessSecret, {
  issuer: env.jwt.issuer,
  audience: env.jwt.audience
});

const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret, {
  issuer: env.jwt.issuer,
  audience: env.jwt.audience
});

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
