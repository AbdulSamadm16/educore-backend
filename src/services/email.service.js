const { sendBrevoEmail } = require('../config/brevo');
const { ApiError } = require('../utils/errors');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const sendMail = async ({ to, subject, text, html, name, attachments }) => {
  try {
    return await sendBrevoEmail({
      to,
      subject,
      text,
      html,
      recipientName: name,
      attachments
    });
  } catch (error) {
    throw new ApiError(502, 'Email delivery failed', 'EMAIL_DELIVERY_FAILED', {
      provider: 'brevo',
      providerMessage: error.message
    });
  }
};

const sendOtpEmail = async ({ to, otp, name }) => {
  const safeName = escapeHtml(name);

  return sendMail({
    to,
    name,
    subject: 'Verify your EduCore email',
    text: `Hello ${name}, your EduCore verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Hello ${safeName},</p><p>Your EduCore verification code is <strong>${escapeHtml(otp)}</strong>.</p><p>This code expires in 10 minutes.</p>`
  });
};

const sendEmailChangeOtp = async ({ to, otp, name }) => {
  const safeName = escapeHtml(name);

  return sendMail({
    to,
    name,
    subject: 'Confirm your new EduCore email',
    text: `Hello ${name}, your EduCore email change code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Hello ${safeName},</p><p>Your EduCore email change code is <strong>${escapeHtml(otp)}</strong>.</p><p>This code expires in 10 minutes.</p>`
  });
};

const sendPasswordResetEmail = async ({ to, resetUrl, name }) => {
  const safeName = escapeHtml(name);
  const safeResetUrl = escapeHtml(resetUrl);

  return sendMail({
    to,
    name,
    subject: 'Reset your EduCore password',
    text: `Hello ${name}, reset your EduCore password using this link: ${resetUrl}. This link expires in 30 minutes.`,
    html: `<p>Hello ${safeName},</p><p>Reset your EduCore password using this link:</p><p><a href="${safeResetUrl}">Reset password</a></p><p>Direct link for local testing:</p><p style="word-break:break-all;">${safeResetUrl}</p><p>This link expires in 30 minutes.</p>`
  });
};

const sendTutorApprovalRequestEmail = async ({ tutorName, tutorEmail }) => sendMail({
  to: process.env.BREVO_SENDER_EMAIL || 'admin@educore.com',
  name: 'Platform Admin',
  subject: 'New Tutor Account Requires Approval',
  text: `A new tutor (${tutorName} - ${tutorEmail}) has verified their email. Please log in to the admin dashboard to approve or reject their account.`,
  html: `<p>A new tutor has verified their email:</p><ul><li><strong>Name:</strong> ${escapeHtml(tutorName)}</li><li><strong>Email:</strong> ${escapeHtml(tutorEmail)}</li></ul><p>Please log in to the admin dashboard to approve or reject their account.</p>`
});

const sendTutorApprovedEmail = async ({ to, name }) => {
  const safeName = escapeHtml(name);

  return sendMail({
    to,
    name,
    subject: 'Your EduCore Tutor Account is Approved',
    text: `Hello ${name}, your tutor account has been approved. You can now log in to the platform.`,
    html: `<p>Hello ${safeName},</p><p>Your tutor account has been approved. You can now log in to the platform.</p>`
  });
};

const sendTutorRejectedEmail = async ({ to, name, reason }) => {
  const safeName = escapeHtml(name);
  const safeReason = escapeHtml(reason || 'Your tutor profile did not meet the current approval requirements.');

  return sendMail({
    to,
    name,
    subject: 'Your EduCore Tutor Account Was Not Approved',
    text: `Hello ${name}, your tutor account was not approved. Reason: ${reason || 'Your tutor profile did not meet the current approval requirements.'}`,
    html: `<p>Hello ${safeName},</p><p>Your tutor account was not approved.</p><p><strong>Reason:</strong> ${safeReason}</p>`
  });
};

const sendInvitationEmail = async ({ to, name, role, temporaryPassword, loginUrl }) => {
  const safeName = escapeHtml(name);
  const safeLoginUrl = escapeHtml(loginUrl);

  return sendMail({
    to,
    name,
    subject: 'Your EduCore Invitation - Login Credentials',
    text: `Hello ${name},

You have been registered as a ${role} on EduCore.

Your Login Credentials:
Email: ${to}
Temporary Password: ${temporaryPassword}

Login Link: ${loginUrl}

Please log in and change your password immediately for security.

Welcome to the EduCore ecosystem!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Welcome to EduCore</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>You have been officially registered as a <strong>${escapeHtml(role)}</strong> on the EduCore platform.</p>
        
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #556b57;">Your Login Credentials</h3>
          <p style="margin: 5px 0;"><strong>Email:</strong> ${escapeHtml(to)}</p>
          <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px; font-size: 1.1em;">${escapeHtml(temporaryPassword)}</code></p>
        </div>

        <p>Please use the button below to log in and update your password immediately:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${safeLoginUrl}" style="background-color: #556b57; color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">Login to Your Account</a>
        </div>

        <p style="font-size: 0.9em; color: #7d9277;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${safeLoginUrl}" style="color: #556b57;">${safeLoginUrl}</a>
        </p>
        
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Modern Learning Holistic Ecosystem.</p>
      </div>
    `
  });
};

const sendInstitutionalOnboardingEmail = async ({ to, name, institutionName, tempPassword, loginUrl }) => {
  const safeName = escapeHtml(name);
  const safeInstitutionName = escapeHtml(institutionName);
  const safeLoginUrl = escapeHtml(loginUrl);

  return sendMail({
    to,
    name,
    subject: `Onboarding: ${institutionName} Admin Account`,
    text: `Hello ${name}, your institutional admin account for ${institutionName} has been created. Use the following credentials to log in: Email: ${to}, Temporary Password: ${tempPassword}. Login at: ${loginUrl}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Institutional Onboarding</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>Your institutional admin account for <strong>${safeInstitutionName}</strong> has been successfully initialized on the EduCore platform.</p>
        
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #556b57;">Access Credentials</h3>
          <p style="margin: 5px 0;"><strong>Email:</strong> ${escapeHtml(to)}</p>
          <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px; font-size: 1.1em;">${escapeHtml(tempPassword)}</code></p>
        </div>

        <p>Log in to your dashboard to begin setting up your institution:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${safeLoginUrl}" style="background-color: #556b57; color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">Login to Institution Portal</a>
        </div>
      </div>
    `
  });
};

const sendVideoReadyEmail = async ({ to, name, tutorName, lessonTitle, courseTitle }) => {
  const actualName = name || tutorName || 'Tutor';
  const safeName = escapeHtml(actualName);
  const safeLessonTitle = escapeHtml(lessonTitle);
  const safeCourseTitle = escapeHtml(courseTitle);

  return sendMail({
    to,
    name: actualName,
    subject: `Video Ready: "${safeLessonTitle}" has finished processing!`,
    text: `Hello ${actualName}, your uploaded video for the lesson "${lessonTitle}" in the course "${courseTitle}" has finished processing and is ready for learners to view!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Your Video is Ready!</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>Excellent news! The video you uploaded for lesson <strong>"${safeLessonTitle}"</strong> in the course <strong>"${safeCourseTitle}"</strong> has finished processing and is now <strong>Ready</strong>.</p>
        
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #556b57;">
          <h3 style="margin-top: 0; color: #556b57; margin-bottom: 8px;">Video Processing Completed</h3>
          <p style="margin: 5px 0;">Learners can now watch this course content with optimized high-fidelity streaming quality.</p>
        </div>

        <p>Thank you for contributing your knowledge to the EduCore ecosystem!</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendVideoUpdatedEmail = async ({ to, studentName, lessonTitle, courseTitle }) => {
  const safeName = escapeHtml(studentName || 'Learner');
  const safeLessonTitle = escapeHtml(lessonTitle);
  const safeCourseTitle = escapeHtml(courseTitle);

  return sendMail({
    to,
    name: studentName,
    subject: `Video Update: "${safeLessonTitle}" in "${safeCourseTitle}" has been updated!`,
    text: `Hello ${studentName || 'Learner'}, the video for lesson "${lessonTitle}" in the course "${courseTitle}" has been updated by the tutor. Log in to your student dashboard to watch the new content!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">New Video Content Available!</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>Your tutor has updated the video content for the lesson <strong>"${safeLessonTitle}"</strong> in the course <strong>"${safeCourseTitle}"</strong>.</p>
        
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #556b57;">
          <h3 style="margin-top: 0; color: #556b57; margin-bottom: 8px;">Video Replaced</h3>
          <p style="margin: 5px 0;">New optimized streaming content is now live and waiting for you.</p>
        </div>

        <p>Log in to your student dashboard to resume your course and view the new video!</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendCoursePublishedEmail = async ({ to, studentName, courseTitle, tutorName }) => {
  const safeName = escapeHtml(studentName || 'Learner');
  const safeCourseTitle = escapeHtml(courseTitle);
  const safeTutorName = escapeHtml(tutorName || 'A Tutor');

  return sendMail({
    to,
    name: studentName,
    subject: `New Course Published: "${safeCourseTitle}"!`,
    text: `Hello ${studentName || 'Learner'}, an exciting new course "${courseTitle}" by ${tutorName} is now live on EduCore. Log in to your student dashboard to enroll and start learning!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">New Course Announcement!</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>We are thrilled to announce that a new course has been published on EduCore: <strong>"${safeCourseTitle}"</strong> by tutor <strong>${safeTutorName}</strong>.</p>
        
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #556b57;">
          <h3 style="margin-top: 0; color: #556b57; margin-bottom: 8px;">"${safeCourseTitle}" is Live</h3>
          <p style="margin: 5px 0;">Boost your learning path with this new course content.</p>
        </div>

        <p>Log in to your student dashboard to enroll and check it out now!</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendPaymentSuccessEmail = async ({ to, name, courseTitle, amount, currency, transactionId, invoiceBuffer }) => {
  const safeName = escapeHtml(name || 'Learner');
  const safeCourseTitle = escapeHtml(courseTitle);
  const safeTransactionId = escapeHtml(transactionId);
  const formattedAmount = `${currency || 'INR'} ${amount.toFixed(2)}`;

  let attachments = [];
  if (invoiceBuffer) {
    attachments.push({
      content: invoiceBuffer.toString('base64'),
      name: `Invoice-${safeTransactionId}.pdf`
    });
  }

  return sendMail({
    to,
    name,
    subject: `Payment Successful: "${safeCourseTitle}"`,
    text: `Hello ${name || 'Learner'}, your payment of ${formattedAmount} for "${courseTitle}" was successful. Transaction ID: ${transactionId}. Your invoice is attached.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Payment Successful!</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>Thank you for your purchase! Your payment for <strong>"${safeCourseTitle}"</strong> was successful.</p>
        
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #556b57;">
          <h3 style="margin-top: 0; color: #556b57; margin-bottom: 8px;">Transaction Details</h3>
          <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${safeTransactionId}</p>
          <p style="margin: 5px 0;"><strong>Amount Paid:</strong> ${formattedAmount}</p>
        </div>

        <p>Your enrollment is now active. You can log in and start learning immediately.</p>
        <p>Your invoice is attached to this email.</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `,
    attachments
  });
};

const sendNewStudentEnrolledEmail = async ({ to, tutorName, studentName, courseTitle }) => {
  const safeTutorName = escapeHtml(tutorName || 'Tutor');
  const safeStudentName = escapeHtml(studentName || 'A student');
  const safeCourseTitle = escapeHtml(courseTitle);

  return sendMail({
    to,
    name: tutorName,
    subject: `New Student Enrolled: "${safeCourseTitle}"`,
    text: `Hello ${tutorName || 'Tutor'},\n\nGood news! "${studentName}" has enrolled in your course "${courseTitle}".\n\nBest regards,\nEduCore Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">New Student Enrolled!</h2>
        <p>Hello <strong>${safeTutorName}</strong>,</p>
        <p>Good news! A new student, <strong>${safeStudentName}</strong>, has enrolled in your course:</p>
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Course:</strong> ${safeCourseTitle}</p>
          <p style="margin: 5px 0;"><strong>Student:</strong> ${safeStudentName}</p>
        </div>
        <p>Thank you for teaching on EduCore!</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendBulkEnrollmentSummaryEmail = async ({ to, tutorName, studentCount, courseTitle }) => {
  const safeTutorName = escapeHtml(tutorName || 'Tutor');
  const safeCourseTitle = escapeHtml(courseTitle);

  return sendMail({
    to,
    name: tutorName,
    subject: `Bulk Enrollment Summary: "${safeCourseTitle}"`,
    text: `Hello ${tutorName || 'Tutor'},\n\nGood news! ${studentCount} new students have enrolled in your course "${courseTitle}".\n\nBest regards,\nEduCore Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Bulk Enrollment Summary</h2>
        <p>Hello <strong>${safeTutorName}</strong>,</p>
        <p>Good news! <strong>${studentCount} new students</strong> have enrolled in your course:</p>
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Course:</strong> ${safeCourseTitle}</p>
          <p style="margin: 5px 0;"><strong>New Enrollments:</strong> ${studentCount}</p>
        </div>
        <p>Thank you for teaching on EduCore!</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendEnrollmentConfirmedEmail = async ({ to, studentName, courseTitle }) => {
  const safeStudentName = escapeHtml(studentName || 'Learner');
  const safeCourseTitle = escapeHtml(courseTitle);

  return sendMail({
    to,
    name: studentName,
    subject: `Enrollment Confirmed: "${safeCourseTitle}"`,
    text: `Hello ${studentName || 'Learner'},\n\nCongratulations! Your enrollment in the course "${courseTitle}" is confirmed.\n\nYou can access the course now and begin learning.\n\nBest regards,\nEduCore Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Enrollment Confirmed!</h2>
        <p>Hello <strong>${safeStudentName}</strong>,</p>
        <p>Congratulations! Your enrollment in the following course has been confirmed:</p>
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Course:</strong> ${safeCourseTitle}</p>
        </div>
        <p>You can log in to your dashboard to access the course content and start learning immediately.</p>
        <p>Happy learning!</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendQuizResultEmail = async ({ to, studentName, quizTitle, score, maxScore, percentage, passed }) => {
  const safeStudentName = escapeHtml(studentName || 'Learner');
  const safeQuizTitle = escapeHtml(quizTitle);
  const statusText = passed ? 'Passed' : 'Failed';
  const statusColor = passed ? '#10b981' : '#ef4444';

  return sendMail({
    to,
    name: studentName,
    subject: `Quiz Result: "${safeQuizTitle}" - ${statusText}`,
    text: `Hello ${studentName || 'Learner'},\n\nYou have completed the quiz "${quizTitle}" with a score of ${score}/${maxScore} (${percentage.toFixed(1)}%).\n\nStatus: ${statusText}.\n\nBest regards,\nEduCore Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Quiz Result</h2>
        <p>Hello <strong>${safeStudentName}</strong>,</p>
        <p>You have completed the quiz "<strong>${safeQuizTitle}</strong>". Here are your results:</p>
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Score:</strong> ${score} / ${maxScore}</p>
          <p style="margin: 5px 0;"><strong>Percentage:</strong> ${percentage.toFixed(1)}%</p>
          <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusText.toUpperCase()}</span></p>
        </div>
        <p>You can access details of your attempt in your dashboard under the quiz section.</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendAssignmentGradedEmail = async ({ to, studentName, assignmentTitle, courseTitle, grade, maxMarks, feedback }) => {
  const safeStudentName = escapeHtml(studentName || 'Learner');
  const safeAssignmentTitle = escapeHtml(assignmentTitle);
  const safeCourseTitle = escapeHtml(courseTitle);
  const safeFeedback = escapeHtml(feedback || 'No feedback provided.');

  return sendMail({
    to,
    name: studentName,
    subject: `Assignment Graded: "${safeAssignmentTitle}" in "${safeCourseTitle}"`,
    text: `Hello ${studentName || 'Learner'},\n\nYour submission for "${assignmentTitle}" in the course "${courseTitle}" has been graded.\n\nGrade: ${grade}/${maxMarks}\nFeedback: ${feedback || 'None'}\n\nBest regards,\nEduCore Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Assignment Graded</h2>
        <p>Hello <strong>${safeStudentName}</strong>,</p>
        <p>Your submission for "<strong>${safeAssignmentTitle}</strong>" in the course "<strong>${safeCourseTitle}</strong>" has been graded by the tutor.</p>
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Grade:</strong> ${grade} / ${maxMarks}</p>
          <p style="margin: 5px 0;"><strong>Feedback:</strong> ${safeFeedback}</p>
        </div>
        <p>You can review full details of your grade in your dashboard under the assignment section.</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendStudentSubmissionEmail = async ({ to, tutorName, studentName, assignmentTitle, courseTitle, submissionId }) => {
  const safeTutorName = escapeHtml(tutorName || 'Tutor');
  const safeStudentName = escapeHtml(studentName || 'Learner');
  const safeAssignmentTitle = escapeHtml(assignmentTitle);
  const safeCourseTitle = escapeHtml(courseTitle);

  return sendMail({
    to,
    name: tutorName,
    subject: `New Assignment Submission: "${safeAssignmentTitle}" in "${safeCourseTitle}"`,
    text: `Hello ${tutorName || 'Tutor'},\n\n"${studentName}" has submitted their assignment for "${assignmentTitle}" in the course "${courseTitle}".\n\nPlease log in to the Grade Center to review and grade this submission.\n\nBest regards,\nEduCore Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">New Assignment Submission</h2>
        <p>Hello <strong>${safeTutorName}</strong>,</p>
        <p>A student, <strong>${safeStudentName}</strong>, has submitted their assignment for <strong>"${safeAssignmentTitle}"</strong> in the course <strong>"${safeCourseTitle}"</strong>.</p>
        
        <p>Please log in to your tutor dashboard to review and grade the submission in the Grade Center.</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendTutorPaymentSuccessEmail = async ({ to, tutorName, studentName, courseTitle, amount, currency, transactionId }) => {
  const safeTutorName = escapeHtml(tutorName || 'Tutor');
  const safeStudentName = escapeHtml(studentName || 'Learner');
  const safeCourseTitle = escapeHtml(courseTitle);
  const safeTransactionId = escapeHtml(transactionId);
  const formattedAmount = `${currency || 'INR'} ${amount.toFixed(2)}`;

  return sendMail({
    to,
    name: tutorName,
    subject: `New Course Sale: "${safeCourseTitle}"`,
    text: `Hello ${tutorName || 'Tutor'},\n\nGood news! "${studentName}" has purchased your course "${courseTitle}".\n\nTransaction Details:\nAmount: ${formattedAmount}\nTransaction ID: ${transactionId}\n\nBest regards,\nEduCore Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">New Course Sale!</h2>
        <p>Hello <strong>${safeTutorName}</strong>,</p>
        <p>Good news! <strong>${safeStudentName}</strong> has purchased your course <strong>"${safeCourseTitle}"</strong>.</p>
        
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #556b57;">
          <h3 style="margin-top: 0; color: #556b57; margin-bottom: 8px;">Transaction Details</h3>
          <p style="margin: 5px 0;"><strong>Student Name:</strong> ${safeStudentName}</p>
          <p style="margin: 5px 0;"><strong>Amount Paid:</strong> ${formattedAmount}</p>
          <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${safeTransactionId}</p>
        </div>

        <p>Thank you for teaching on EduCore!</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
      </div>
    `
  });
};

const sendRefundApprovedEmail = async ({ to, name, courseTitle, amount, currency, refundId }) => {
  const safeName = escapeHtml(name);
  const safeCourseTitle = escapeHtml(courseTitle);
  const safeAmount = escapeHtml(`${currency} ${amount}`);
  const safeRefundId = refundId ? escapeHtml(refundId) : null;

  return sendMail({
    to,
    name,
    subject: `Refund Approved: ${courseTitle}`,
    text: `Hello ${name}, your refund request for "${courseTitle}" amounting to ${safeAmount} has been approved and initiated.${refundId ? ` Refund ID: ${refundId}.` : ''}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Refund Approved</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>Your refund request for the course <strong>"${safeCourseTitle}"</strong> has been approved by the platform admin.</p>
        
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #556b57;">
          <h3 style="margin-top: 0; color: #556b57; margin-bottom: 8px;">Refund Details</h3>
          <p style="margin: 0; color: #435947; line-height: 1.5;"><strong>Amount:</strong> ${safeAmount}</p>
          ${safeRefundId ? `<p style="margin: 8px 0 0; color: #435947; line-height: 1.5;"><strong>Refund ID:</strong> ${safeRefundId}</p>` : ''}
        </div>
        
        <p>The funds will be returned to your original payment method within a few business days.</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore.</p>
      </div>
    `
  });
};

const sendRefundFailedEmail = async ({ to, name, courseTitle, amount, currency, reason }) => {
  const safeName = escapeHtml(name || 'Learner');
  const safeCourseTitle = escapeHtml(courseTitle || 'your course');
  const safeAmount = escapeHtml(`${currency || 'INR'} ${amount}`);
  const safeReason = escapeHtml(reason || 'The payment gateway could not process the refund attempt.');

  return sendMail({
    to,
    name,
    subject: `Refund Processing Issue: ${courseTitle}`,
    text: `Hello ${name || 'Learner'}, we tried to process your refund for "${courseTitle}" amounting to ${safeAmount}, but the payment gateway reported an issue: ${reason || 'Refund processing failed'}. Your request remains in review for retry.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Refund Processing Issue</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>We tried to process your refund for <strong>"${safeCourseTitle}"</strong>, but the payment gateway reported an issue.</p>

        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #b45309;">
          <h3 style="margin-top: 0; color: #92400e; margin-bottom: 8px;">Refund Details</h3>
          <p style="margin: 0 0 8px; color: #435947; line-height: 1.5;"><strong>Amount:</strong> ${safeAmount}</p>
          <p style="margin: 0; color: #435947; line-height: 1.5;"><strong>Gateway Message:</strong> ${safeReason}</p>
        </div>

        <p>Your refund request remains in the admin queue for retry or review. Your course access will stay paused while this is being resolved.</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore.</p>
      </div>
    `
  });
};

const sendRefundRejectedEmail = async ({ to, name, courseTitle, reason }) => {
  const safeName = escapeHtml(name);
  const safeCourseTitle = escapeHtml(courseTitle);
  const safeReason = escapeHtml(reason || 'No specific reason provided by the administrator.');

  return sendMail({
    to,
    name,
    subject: `Refund Rejected: ${courseTitle}`,
    text: `Hello ${name}, your refund request for "${courseTitle}" was rejected. Reason: ${reason}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
        <h2 style="color: #435947;">Refund Request Update</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>Your refund request for the course <strong>"${safeCourseTitle}"</strong> was reviewed but unfortunately could not be approved at this time.</p>
        
        <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #556b57;">
          <h3 style="margin-top: 0; color: #556b57; margin-bottom: 8px;">Message from Administrator</h3>
          <p style="margin: 0; color: #435947; line-height: 1.5;">${safeReason}</p>
        </div>
        
        <p>Your access to the course has been restored, and you may continue your learning journey.</p>
        <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
        <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore.</p>
      </div>
    `
  });
};

module.exports = {
  sendMail,
  sendOtpEmail,
  sendEmailChangeOtp,
  sendPasswordResetEmail,
  sendTutorApprovalRequestEmail,
  sendTutorApprovedEmail,
  sendTutorRejectedEmail,
  sendInvitationEmail,
  sendInstitutionalOnboardingEmail,
  sendVideoReadyEmail,
  sendVideoUpdatedEmail,
  sendCoursePublishedEmail,
  sendPaymentSuccessEmail,
  sendNewStudentEnrolledEmail,
  sendBulkEnrollmentSummaryEmail,
  sendEnrollmentConfirmedEmail,
  sendQuizResultEmail,
  sendAssignmentGradedEmail,
  sendStudentSubmissionEmail,
  sendTutorPaymentSuccessEmail,
  sendRefundApprovedEmail,
  sendRefundRejectedEmail,
  sendRefundFailedEmail,
  sendCertificateEmail: async ({ to, name, courseTitle, pdfUrl, certificateBuffer }) => {
    const safeName = escapeHtml(name || 'Learner');
    const safeCourseTitle = escapeHtml(courseTitle);
    const safePdfUrl = escapeHtml(pdfUrl);

    const attachments = [];
    if (certificateBuffer) {
      attachments.push({
        content: certificateBuffer.toString('base64'),
        name: `Certificate-${safeCourseTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment'
      });
    }

    return sendMail({
      to,
      name,
      subject: `Certificate Issued: "${safeCourseTitle}"`,
      text: `Hello ${name || 'Learner'},\n\nCongratulations! Your certificate of completion for "${courseTitle}" has been issued.\n\nYou can download it using this link: ${pdfUrl}\n\nBest regards,\nEduCore Team`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
          <h2 style="color: #435947;">Congratulations!</h2>
          <p>Hello <strong>${safeName}</strong>,</p>
          <p>You have successfully completed all requirements for the course <strong>"${safeCourseTitle}"</strong>.</p>
          
          <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #556b57; text-align: center;">
            <h3 style="margin-top: 0; color: #556b57; margin-bottom: 8px;">Certificate Issued Successfully</h3>
            <p style="margin: 15px 0;">
              <a href="${safePdfUrl}" style="background-color: #556b57; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">View Certificate</a>
            </p>
          </div>
          <p>Your certificate is also attached to this email.</p>
          <p>Thank you for learning with EduCore!</p>
          <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
          <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
        </div>
      `,
      attachments
    });
  },
  sendNewQuestionAlertEmail: async ({ to, tutorName, studentName, courseTitle, lessonTitle, questionContent }) => {
    const safeTutorName = escapeHtml(tutorName || 'Tutor');
    const safeStudentName = escapeHtml(studentName || 'Learner');
    const safeCourseTitle = escapeHtml(courseTitle);
    const safeLessonTitle = escapeHtml(lessonTitle);
    const safeQuestion = escapeHtml(questionContent || '');

    return sendMail({
      to,
      name: tutorName,
      subject: `New Question Posted: "${safeCourseTitle}"`,
      text: `Hello ${safeTutorName},\n\n"${safeStudentName}" posted a question in "${safeLessonTitle}" of course "${safeCourseTitle}":\n\n"${questionContent}"\n\nBest regards,\nEduCore Team`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
          <h2 style="color: #435947;">New Discussion Question</h2>
          <p>Hello <strong>${safeTutorName}</strong>,</p>
          <p>A student, <strong>${safeStudentName}</strong>, has asked a question in <strong>"${safeLessonTitle}"</strong> of your course <strong>"${safeCourseTitle}"</strong>:</p>
          <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; font-style: italic;">
            "${safeQuestion}"
          </div>
          <p>Please log in to respond to their question and help them out.</p>
          <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
          <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
        </div>
      `
    });
  },
  sendNewReplyAlertEmail: async ({ to, studentName, replierName, courseTitle, lessonTitle, replyContent }) => {
    const safeStudentName = escapeHtml(studentName || 'Learner');
    const safeReplierName = escapeHtml(replierName || 'Someone');
    const safeCourseTitle = escapeHtml(courseTitle);
    const safeLessonTitle = escapeHtml(lessonTitle);
    const safeReply = escapeHtml(replyContent || '');

    return sendMail({
      to,
      name: studentName,
      subject: `New Reply to Your Question: "${safeCourseTitle}"`,
      text: `Hello ${safeStudentName},\n\n"${safeReplierName}" replied to your question in "${safeLessonTitle}" of course "${safeCourseTitle}":\n\n"${replyContent}"\n\nBest regards,\nEduCore Team`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eef2e8; border-radius: 16px;">
          <h2 style="color: #435947;">New Reply Posted</h2>
          <p>Hello <strong>${safeStudentName}</strong>,</p>
          <p><strong>${safeReplierName}</strong> has replied to your question in <strong>"${safeLessonTitle}"</strong> of the course <strong>"${safeCourseTitle}"</strong>:</p>
          <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0; font-style: italic;">
            "${safeReply}"
          </div>
          <p>Log in to the Course Player to view the conversation thread.</p>
          <hr style="border: 0; border-top: 1px solid #eef2e8; margin: 30px 0;">
          <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
        </div>
      `
    });
  },

  sendReportAlertEmail: async ({ to, tutorName, reporterName, courseTitle, lessonTitle, postContent, reason }) => {
    const safeTutorName = escapeHtml(tutorName || 'Tutor');
    const safeReporterName = escapeHtml(reporterName || 'A student');
    const safeCourseTitle = escapeHtml(courseTitle);
    const safeLessonTitle = escapeHtml(lessonTitle);
    const safePostContent = escapeHtml(postContent || '');
    const safeReason = escapeHtml(reason || 'No reason provided');

    return sendMail({
      to,
      name: tutorName,
      subject: `Post Reported in Your Course: "${safeCourseTitle}"`,
      text: `Hello ${safeTutorName},\n\nA post in your course "${safeCourseTitle}" (lesson "${safeLessonTitle}") has been reported by "${safeReporterName}".\n\nReported Post:\n"${postContent}"\n\nReport Reason: ${reason || 'No reason provided'}\n\nPlease log in to your tutor dashboard to review and moderate this post.\n\nBest regards,\nEduCore Team`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fee2e2; border-radius: 16px;">
          <h2 style="color: #b91c1c;">&#9888; Post Reported in Your Course</h2>
          <p>Hello <strong>${safeTutorName}</strong>,</p>
          <p>A discussion post in your course <strong>"${safeCourseTitle}"</strong> (lesson: <strong>"${safeLessonTitle}"</strong>) has been reported by a student.</p>

          <div style="background-color: #fef2f2; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h3 style="margin-top: 0; color: #b91c1c; font-size: 0.95em;">Report Details</h3>
            <p style="margin: 5px 0;"><strong>Reported By:</strong> ${safeReporterName}</p>
            <p style="margin: 5px 0;"><strong>Reason:</strong> ${safeReason}</p>
          </div>

          <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #556b57; font-size: 0.95em;">Reported Post Content</h3>
            <p style="font-style: italic; margin: 0;">&ldquo;${safePostContent}&rdquo;</p>
          </div>

          <p>Please log in to your tutor dashboard to review this post and take action if needed (you can delete it if it violates community guidelines).</p>
          <hr style="border: 0; border-top: 1px solid #fee2e2; margin: 30px 0;">
          <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Platform.</p>
        </div>
      `
    });
  },

  sendAdminReportAlertEmail: async ({ to, adminName, reporterName, courseTitle, lessonTitle, postContent, reason }) => {
    const safeAdminName = escapeHtml(adminName || 'Admin');
    const safeReporterName = escapeHtml(reporterName || 'A student');
    const safeCourseTitle = escapeHtml(courseTitle);
    const safeLessonTitle = escapeHtml(lessonTitle);
    const safePostContent = escapeHtml(postContent || '');
    const safeReason = escapeHtml(reason || 'No reason provided');

    return sendMail({
      to,
      name: adminName,
      subject: `[Moderation Alert] Discussion Post Reported in "${safeCourseTitle}"`,
      text: `Hello ${safeAdminName},\n\nA discussion post in the course "${safeCourseTitle}" (lesson "${safeLessonTitle}") has been reported by "${safeReporterName}".\n\nReported Post:\n"${postContent}"\n\nReport Reason: ${reason || 'No reason provided'}\n\nPlease log in to the Admin Dashboard (Moderation Section) to review, warn, or remove this post.\n\nBest regards,\nEduCore Moderation Team`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fee2e2; border-radius: 16px;">
          <h2 style="color: #b91c1c;">&#9888; Content Moderation Alert</h2>
          <p>Hello <strong>${safeAdminName}</strong>,</p>
          <p>A discussion post in the course <strong>"${safeCourseTitle}"</strong> (lesson: <strong>"${safeLessonTitle}"</strong>) has been flagged and reported by a user.</p>

          <div style="background-color: #fef2f2; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h3 style="margin-top: 0; color: #b91c1c; font-size: 0.95em;">Report Details</h3>
            <p style="margin: 5px 0;"><strong>Reported By:</strong> ${safeReporterName}</p>
            <p style="margin: 5px 0;"><strong>Reason:</strong> ${safeReason}</p>
          </div>

          <div style="background-color: #f3f4ee; padding: 20px; border-radius: 12px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #556b57; font-size: 0.95em;">Reported Post Content</h3>
            <p style="font-style: italic; margin: 0;">&ldquo;${safePostContent}&rdquo;</p>
          </div>

          <p>Please log in to the Institutional Admin Dashboard and navigate to the <strong>Moderation</strong> section to audit, warn, or remove this post.</p>
          <hr style="border: 0; border-top: 1px solid #fee2e2; margin: 30px 0;">
          <p style="font-size: 0.8em; color: #999;">This is an automated message from EduCore Moderation Platform.</p>
        </div>
      `
    });
  }
};
