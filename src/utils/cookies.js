const env = require('../config/env');

const accessCookieName = 'accessToken';
const refreshCookieName = 'refreshToken';
const passwordResetCookieName = 'passwordResetToken';

const baseCookieOptions = {
  httpOnly: true,
  secure: env.cookies.secure,
  sameSite: env.cookies.sameSite,
  path: '/'
};

const setAuthCookies = (res, data = {}) => {
  if (!data.accessToken || !data.refreshToken) {
    return;
  }

  res.cookie(accessCookieName, data.accessToken, {
    ...baseCookieOptions,
    maxAge: env.cookies.accessMaxAgeMinutes * 60 * 1000
  });

  res.cookie(refreshCookieName, data.refreshToken, {
    ...baseCookieOptions,
    maxAge: Math.max(new Date(data.refreshTokenExpiresAt).getTime() - Date.now(), 0)
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie(accessCookieName, baseCookieOptions);
  res.clearCookie(refreshCookieName, baseCookieOptions);
};

const setPasswordResetCookie = (res, token) => {
  if (!token) {
    return;
  }

  res.cookie(passwordResetCookieName, token, {
    ...baseCookieOptions,
    maxAge: env.passwordReset.ttlSeconds * 1000
  });
};

const clearPasswordResetCookie = (res) => {
  res.clearCookie(passwordResetCookieName, baseCookieOptions);
};

module.exports = {
  accessCookieName,
  refreshCookieName,
  passwordResetCookieName,
  setAuthCookies,
  clearAuthCookies,
  setPasswordResetCookie,
  clearPasswordResetCookie
};
