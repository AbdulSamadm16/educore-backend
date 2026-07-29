const authService = require('../services/auth.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');
const { getRequestMeta } = require('../utils/requestMeta');
const {
  refreshCookieName,
  passwordResetCookieName,
  setAuthCookies,
  clearAuthCookies,
  setPasswordResetCookie,
  clearPasswordResetCookie
} = require('../utils/cookies');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register({
    payload: req.body
  });

  return sendSuccess(res, 201, result.message, result.data);
});

const verifyEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail({
    payload: req.body,
    requestMeta: getRequestMeta(req)
  });

  setAuthCookies(res, result.data);

  return sendSuccess(res, 200, result.message, result.data);
});

const resendOtp = asyncHandler(async (req, res) => {
  const result = await authService.resendOtp({
    payload: req.body
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    payload: req.body,
    requestMeta: getRequestMeta(req)
  });

  setAuthCookies(res, result.data);

  return sendSuccess(res, 200, result.message, result.data);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword({
    payload: req.body
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword({
    payload: {
      ...req.body,
      token: req.body.token || req.cookies?.[passwordResetCookieName]
    },
    requestMeta: getRequestMeta(req)
  });

  clearPasswordResetCookie(res);
  clearAuthCookies(res);

  return sendSuccess(res, 200, result.message, result.data);
});

const setPasswordResetTokenCookie = asyncHandler(async (req, res) => {
  setPasswordResetCookie(res, req.query.token);
  return res.redirect(302, req.query.redirectTo);
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh({
    payload: {
      refreshToken: req.body.refreshToken || req.cookies?.[refreshCookieName]
    },
    requestMeta: getRequestMeta(req)
  });

  setAuthCookies(res, result.data);

  return sendSuccess(res, 200, result.message, result.data);
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout({
    payload: {
      refreshToken: req.body.refreshToken || req.cookies?.[refreshCookieName]
    },
    requestMeta: getRequestMeta(req)
  });

  clearAuthCookies(res);

  return sendSuccess(res, 200, result.message, result.data);
});

module.exports = {
  register,
  verifyEmail,
  resendOtp,
  login,
  forgotPassword,
  resetPassword,
  setPasswordResetTokenCookie,
  refresh,
  logout
};
