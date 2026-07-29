const env = require('./env');

const sendDevEmail = ({ to, subject, text, html, recipientName }, reason = undefined) => {
  if (reason) {
    console.warn(`Brevo delivery unavailable (${reason}). Falling back to development email transport.`);
  }

  console.log(JSON.stringify({
    provider: 'brevo-dev-transport',
    to,
    recipientName,
    subject,
    text,
    html
  }));

  // Append simulated email to Backend/logs/dev-emails.log in local development
  if (!process.env.VERCEL) {
    try {
      const fs = require('fs');
      const path = require('path');
      const logsDir = path.join(__dirname, '../../logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const logFilePath = path.join(logsDir, 'dev-emails.log');
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] 
To: ${to} (${recipientName || 'No Name'})
Subject: ${subject}
Reason: ${reason || 'N/A'}
Text:
${text}
HTML:
${html}
================================================================================
\n`;
      fs.appendFileSync(logFilePath, logEntry, 'utf8');
    } catch (fsErr) {
      console.error('Failed to append simulated email to dev-emails.log:', fsErr);
    }
  }

  // Automatically log to database as sent or failed
  try {
    const EmailLog = require('../models/emailLog.model');
    EmailLog.create({
      recipient: to,
      recipientName: recipientName || '',
      subject,
      status: reason ? 'failed' : 'sent',
      errorMessage: reason || 'sent via dev transport (simulation)'
    }).catch(err => console.error('Failed to create EmailLog in dev transport:', err));
  } catch (err) {
    console.error('EmailLog dev transport error:', err);
  }

  return {
    messageId: 'dev-transport'
  };
};

const sendBrevoEmail = async ({ to, subject, text, html, recipientName, attachments }) => {
  const EmailLog = require('../models/emailLog.model');

  // Immediate regex validation for recipient email address format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !emailRegex.test(to)) {
    try {
      await EmailLog.create({
        recipient: to || 'missing-recipient',
        recipientName: recipientName || '',
        subject,
        status: 'failed',
        errorMessage: 'Invalid recipient email format'
      });
    } catch (err) {
      console.error('Failed to log invalid email event:', err);
    }
    throw new Error('Invalid recipient email format');
  }


  if (!env.brevo.apiKey) {
    if (!env.isProduction) {
      return sendDevEmail({ to, subject, text, html, recipientName });
    }

    try {
      await EmailLog.create({
        recipient: to,
        recipientName: recipientName || '',
        subject,
        status: 'failed',
        errorMessage: 'Brevo API key is not configured'
      });
    } catch (err) {
      console.error(err);
    }

    throw new Error('Brevo API key is not configured');
  }

  let response;

  try {
    response = await fetch(env.brevo.apiUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': env.brevo.apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: env.brevo.senderName,
          email: env.brevo.senderEmail
        },
        to: [
          {
            email: to,
            name: recipientName
          }
        ],
        subject,
        htmlContent: html,
        textContent: text,
        ...(attachments && attachments.length > 0 && { attachment: attachments })
      })
    });
  } catch (error) {
    if (!env.isProduction) {
      return sendDevEmail({ to, subject, text, html, recipientName }, error.message);
    }

    try {
      await EmailLog.create({
        recipient: to,
        recipientName: recipientName || '',
        subject,
        status: 'failed',
        errorMessage: error.message
      });
    } catch (err) {
      console.error(err);
    }

    throw error;
  }

  const responseText = await response.text();
  let body = {};

  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch (_error) {
    body = {
      message: responseText
    };
  }

  if (!response.ok) {
    const message = body.message || body.error || 'Brevo email delivery failed';
    if (!env.isProduction) {
      return sendDevEmail({ to, subject, text, html, recipientName }, message);
    }

    try {
      await EmailLog.create({
        recipient: to,
        recipientName: recipientName || '',
        subject,
        status: 'failed',
        errorMessage: message
      });
    } catch (err) {
      console.error(err);
    }

    throw new Error(message);
  }

  // Success path
  try {
    await EmailLog.create({
      recipient: to,
      recipientName: recipientName || '',
      subject,
      status: 'sent',
      errorMessage: ''
    });
  } catch (err) {
    console.error(err);
  }

  return body;
};

module.exports = {
  sendBrevoEmail
};
