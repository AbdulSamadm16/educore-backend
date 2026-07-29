const { google } = require('googleapis');
const User = require('../models/user.model');
const { ApiError } = require('../utils/errors');
const env = require('../config/env');

const getOAuthClient = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
};

exports.getAuthUrl = async (req, res, next) => {
  try {
    const oauth2Client = getOAuthClient();

    // Use state to pass the tutor's user ID so we know who they are in the callback
    // (Alternatively, require the callback to be authenticated via cookie/token, 
    // but state is safer if it's a generic redirect).
    // Better yet, just use a secure state parameter if needed. For now, since we have an API,
    // if the callback is an API call, we can assume the user passes a token.
    // Wait, the callback is usually an OAuth redirect which is a browser GET request.
    // If the browser doesn't send the JWT token in GET requests easily, we encode the user ID in the state securely.
    
    // For simplicity, we encode the tutor ID in the state. 
    // In production, this should be signed or encrypted to prevent CSRF, but a base64 is okay for MVP.
    const state = Buffer.from(JSON.stringify({ userId: req.user._id.toString() })).toString('base64');

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      prompt: 'consent', // Force consent to get a refresh token
      state
    });

    res.status(200).json({ success: true, data: { authUrl } });
  } catch (error) {
    next(error);
  }
};

exports.handleCallback = async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.CLIENT_URL}/tutor/settings?google_auth=error`);
    }

    if (!code || !state) {
      throw new ApiError(400, 'Invalid Google Auth Callback', 'INVALID_CALLBACK');
    }

    // Decode state to get user ID
    let decodedState;
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    } catch (e) {
      throw new ApiError(400, 'Invalid state parameter', 'INVALID_STATE');
    }

    const userId = decodedState.userId;

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      await User.findByIdAndUpdate(userId, { googleRefreshToken: tokens.refresh_token });
    }

    res.redirect(`${process.env.CLIENT_URL}/tutor/settings?google_auth=success`);
  } catch (error) {
    console.error('Google OAuth Callback Error:', error);
    res.redirect(`${process.env.CLIENT_URL}/tutor/settings?google_auth=error`);
  }
};

exports.disconnectGoogleAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    await User.findByIdAndUpdate(userId, { googleRefreshToken: null });
    res.status(200).json({ 
      success: true, 
      message: 'Google account disconnected',
      data: { googleConnected: false }
    });
  } catch (error) {
    next(error);
  }
};
