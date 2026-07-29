const { google } = require('googleapis');
const crypto = require('crypto');
const { ApiError } = require('../utils/errors');
const env = require('../config/env');

/**
 * Initializes the OAuth2 Client with the given refresh token.
 */
const initGoogleAuth = (refreshToken) => {
  if (!refreshToken) {
    throw new ApiError(400, 'Tutor has not connected their Google account. Missing refresh token.', 'GOOGLE_AUTH_MISSING');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return oauth2Client;
};

// With OAuth, calendar ID is always 'primary' (the tutor's primary calendar)
const getCalendarId = () => 'primary';

/**
 * Creates a Google Calendar event with a Google Meet link using the Tutor's OAuth token.
 */
const createMeeting = async ({ refreshToken, title, description, startTime, endTime, timezone }) => {
  const auth = initGoogleAuth(refreshToken);
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const event = {
      summary: title,
      description: description || 'Live session on EduCore LMS',
      start: {
        dateTime: new Date(startTime).toISOString(),
        timeZone: timezone,
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
        timeZone: timezone,
      },
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    };

    const response = await calendar.events.insert({
      calendarId: getCalendarId(),
      resource: event,
      conferenceDataVersion: 1, // Required to generate Meet links
    });

    const createdEvent = response.data;
    const meetingUrl = createdEvent.hangoutLink;

    if (!meetingUrl) {
      throw new Error('Google Calendar failed to generate a Hangouts Meet link.');
    }

    return {
      meetingId: createdEvent.id,
      meetingUrl: meetingUrl
    };
  } catch (error) {
    console.error('Error creating Google Calendar meeting:', error);
    throw new ApiError(502, `Failed to create meeting: ${error.message}`, 'GOOGLE_MEET_CREATION_FAILED');
  }
};

/**
 * Updates an existing Google Calendar event.
 */
const updateMeeting = async (meetingId, { refreshToken, title, description, startTime, endTime, timezone }) => {
  const auth = initGoogleAuth(refreshToken);
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const event = {
      summary: title,
      description: description,
      start: {
        dateTime: new Date(startTime).toISOString(),
        timeZone: timezone,
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
        timeZone: timezone,
      },
    };

    const response = await calendar.events.patch({
      calendarId: getCalendarId(),
      eventId: meetingId,
      resource: event,
    });

    return response.data;
  } catch (error) {
    console.error('Error updating Google Calendar meeting:', error);
    throw new ApiError(502, `Failed to update meeting: ${error.message}`, 'GOOGLE_MEET_UPDATE_FAILED');
  }
};

/**
 * Cancels a Google Calendar event.
 */
const cancelMeeting = async (meetingId, refreshToken) => {
  if (!meetingId) return true; // Nothing to cancel

  try {
    const auth = initGoogleAuth(refreshToken);
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: getCalendarId(),
      eventId: meetingId,
    });
    return true;
  } catch (error) {
    console.error('Error cancelling Google Calendar meeting:', error);
    // Ignore 404s if it's already deleted
    if (error.code === 404) return true;

    // Even if cancellation fails (e.g. token revoked), we don't strictly want to block the DB deletion,
    // but the original code threw here. We will maintain the throw behavior for ApiError logging.
    throw new ApiError(502, `Failed to cancel meeting: ${error.message}`, 'GOOGLE_MEET_CANCEL_FAILED');
  }
};

module.exports = {
  createMeeting,
  updateMeeting,
  cancelMeeting,
};
