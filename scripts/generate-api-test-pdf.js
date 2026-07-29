const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'docs');
const outputFile = path.join(outputDir, 'api-test-plan.pdf');

const lines = [
  { text: 'EduCore API Test Plan', style: 'title' },
  { text: 'Generated: 2026-05-08' },
  { text: 'Base URL: http://localhost:4000' },
  { text: 'Tenant header/body values are no longer used anywhere. Do not send x-tenant-id or tenantId.' },
  { text: 'Redis is currently disabled with REDIS_DRIVER=memory, so OTPs, reset tokens, and rate limits reset when the server restarts.' },
  { text: '' },
  { text: 'How To Use This PDF', style: 'heading' },
  { text: '1. Run the API server: npm run dev' },
  { text: '2. Use Postman/Thunder Client/curl against http://localhost:4000.' },
  { text: '3. For protected routes, copy accessToken from login responses into Authorization: Bearer <accessToken>.' },
  { text: '4. For refresh/logout, use refreshToken in JSON body or the auth cookie if your client preserves cookies.' },
  { text: '5. For OTP/reset-email tests, check your email inbox or test transport output. Reset links open the frontend on http://localhost:3000.' },
  { text: '6. Run npm test after manual testing to confirm the automated smoke flows still pass.' },
  { text: '' },
  { text: 'Seed Accounts', style: 'heading' },
  { text: 'Platform owner: npm run seed:platform-owner' },
  { text: 'Admin and super admin: npm run seed:admins' },
  { text: 'Current roles: learner, tutor, admin, super_admin, platform_owner.' },
  { text: 'Important rule: one email can only belong to one active account globally.' },
  { text: '' },
  { text: 'Global Checks', style: 'heading' },
  { text: 'GET /health' },
  { text: 'Auth: none' },
  { text: 'Expected: 200, success true, healthy message.' },
  { text: '' },
  { text: 'Public Auth APIs', style: 'heading' },
  { text: 'POST /auth/register' },
  { text: 'Auth: none' },
  { text: 'Body: {"name":"Learner One","email":"learner1@example.com","password":"Password123","confirmPassword":"Password123","role":"learner"}' },
  { text: 'Also test role tutor. Do not send tenantId.' },
  { text: 'Expected learner: 201, registration successful, verification email/OTP sent.' },
  { text: 'Expected tutor: 201, then after verification tutor status becomes pending_approval.' },
  { text: 'Negative: reuse the same email -> 409 EMAIL_ALREADY_EXISTS.' },
  { text: '' },
  { text: 'POST /auth/verify-email' },
  { text: 'Auth: none' },
  { text: 'Body: {"email":"learner1@example.com","otp":"123456","rememberMe":false}' },
  { text: 'Expected learner: 200, user returned, accessToken/refreshToken returned.' },
  { text: 'Expected tutor: 200, pending_approval message, no login until admin approval.' },
  { text: 'Negative: wrong/expired OTP -> 400 OTP_INVALID.' },
  { text: '' },
  { text: 'POST /auth/resend-otp' },
  { text: 'Auth: none' },
  { text: 'Body: {"email":"learner1@example.com"}' },
  { text: 'Expected: 200 generic resend message.' },
  { text: 'Negative: repeat immediately -> likely rate/cooldown error.' },
  { text: '' },
  { text: 'POST /auth/login' },
  { text: 'Auth: none' },
  { text: 'Body: {"email":"learner1@example.com","password":"Password123","rememberMe":false}' },
  { text: 'Expected active learner/admin/super_admin: 200, tokens returned.' },
  { text: 'Expected pending tutor: 403 ACCOUNT_PENDING_APPROVAL.' },
  { text: 'Expected platform_owner here: 401 because platform owners use /platform/auth/login.' },
  { text: 'Negative: wrong password -> 401 INVALID_CREDENTIALS; repeated wrong passwords can lock account.' },
  { text: '' },
  { text: 'POST /auth/forgot-password' },
  { text: 'Auth: none' },
  { text: 'Body: {"email":"learner1@example.com"}' },
  { text: 'Expected: 200 generic message. A reset email should be sent if the email exists and Brevo is configured.' },
  { text: 'Expected email link: http://localhost:3000/reset-password?token=<reset-token>.' },
  { text: 'Frontend should read token from the URL and POST it to /auth/reset-password.' },
  { text: 'Current Redis note: this works against memory Redis while REDIS_DRIVER=memory.' },
  { text: '' },
  { text: 'GET /auth/password-reset-cookie?token=<token>&redirectTo=/reset-password' },
  { text: 'Auth: none' },
  { text: 'Compatibility route for old reset links. New frontend logic should use the token query parameter directly.' },
  { text: '' },
  { text: 'POST /auth/reset-password' },
  { text: 'Auth: none. Frontend sends token from reset-password?token=... in the JSON body.' },
  { text: 'Body: {"token":"<reset-token>","password":"Password456","confirmPassword":"Password456"}' },
  { text: 'Expected: 200 Password reset successful, old sessions revoked.' },
  { text: 'Negative: expired/used token -> 400 RESET_TOKEN_INVALID.' },
  { text: '' },
  { text: 'POST /auth/refresh-token' },
  { text: 'Auth: refresh token in body or cookie.' },
  { text: 'Body: {"refreshToken":"<refreshToken>"}' },
  { text: 'Expected: 200, new accessToken and refreshToken returned.' },
  { text: 'Negative: reuse an old rotated refresh token -> 401 and user sessions revoked.' },
  { text: '' },
  { text: 'POST /auth/logout' },
  { text: 'Auth: refresh token in body or cookie.' },
  { text: 'Body: {"refreshToken":"<refreshToken>"}' },
  { text: 'Expected: 200 Logout successful, cookies cleared if present.' },
  { text: '' },
  { text: 'Authenticated User APIs', style: 'heading' },
  { text: 'GET /users/me' },
  { text: 'Auth: learner/tutor/admin/super_admin Bearer token. Platform owner tokens are rejected here.' },
  { text: 'Expected: 200, current public user returned, no tenantId field.' },
  { text: '' },
  { text: 'PUT /users/me' },
  { text: 'Auth: user Bearer token' },
  { text: 'Content-Type: multipart/form-data if uploading avatar, otherwise JSON is fine.' },
  { text: 'JSON body: {"name":"New Name","bio":"Short bio"}' },
  { text: 'Optional email change: {"email":"new-email@example.com"} starts email-change OTP.' },
  { text: 'Expected: 200, updated user and optional emailChange object.' },
  { text: '' },
  { text: 'PUT /users/change-email' },
  { text: 'Auth: user Bearer token' },
  { text: 'Body: {"email":"new-email@example.com"}' },
  { text: 'Expected: 200, OTP sent to new email.' },
  { text: 'Negative: email already used globally -> 409 EMAIL_ALREADY_EXISTS.' },
  { text: '' },
  { text: 'POST /users/verify-email-change' },
  { text: 'Auth: user Bearer token' },
  { text: 'Body: {"otp":"123456"}' },
  { text: 'Expected: 200, email changed successfully.' },
  { text: '' },
  { text: 'PUT /users/change-password' },
  { text: 'Auth: user Bearer token' },
  { text: 'Body: {"currentPassword":"Password123","newPassword":"Password456","confirmPassword":"Password456"}' },
  { text: 'Expected: 200, password changed, sessions revoked, log in again.' },
  { text: '' },
  { text: 'Course/Lesson/Progress/Note APIs', style: 'heading' },
  { text: 'GET /courses?page=1&limit=10&level=Beginner' },
  { text: 'Auth: user Bearer token' },
  { text: 'Expected: 200, published courses only, pagination returned.' },
  { text: '' },
  { text: 'GET /courses/:id' },
  { text: 'Auth: user Bearer token' },
  { text: 'Expected: 200, course details plus modules and lessons.' },
  { text: 'Negative: unknown id -> 404 Course not found.' },
  { text: '' },
  { text: 'POST /courses' },
  { text: 'Auth: user Bearer token' },
  { text: 'Body: {"title":"Intro Course","description":"Course description","level":"Beginner","status":"published","thumbnailUrl":"https://example.com/thumb.png"}' },
  { text: 'Expected: 201, course created with authorId from logged-in user.' },
  { text: 'Note: route currently allows any authenticated role; restrict later if only tutors/admins should create courses.' },
  { text: '' },
  { text: 'GET /lessons/:id' },
  { text: 'Auth: user Bearer token' },
  { text: 'Expected: 200, lesson with course and module title.' },
  { text: '' },
  { text: 'GET /progress/:courseId' },
  { text: 'Auth: user Bearer token' },
  { text: 'Expected: 200, progress returned; creates empty progress if missing.' },
  { text: '' },
  { text: 'POST /progress/:courseId/complete' },
  { text: 'Auth: user Bearer token' },
  { text: 'Body: {"lessonId":"<lessonId>"}' },
  { text: 'Expected: 200, lesson added to completedLessons, no duplicate if called twice.' },
  { text: '' },
  { text: 'GET /notes' },
  { text: 'Auth: user Bearer token' },
  { text: 'Expected: 200, notes owned by current user only.' },
  { text: '' },
  { text: 'POST /notes' },
  { text: 'Auth: user Bearer token' },
  { text: 'Body: {"courseId":"<courseId>","lessonId":"<lessonId>","content":"My note"}' },
  { text: 'Expected: 201, note saved for current user.' },
  { text: '' },
  { text: 'PUT /notes/:id' },
  { text: 'Auth: user Bearer token' },
  { text: 'Body: {"content":"Updated note"}' },
  { text: 'Expected: 200 if note belongs to user; 404 otherwise.' },
  { text: '' },
  { text: 'DELETE /notes/:id' },
  { text: 'Auth: user Bearer token' },
  { text: 'Expected: 200 if note belongs to user; soft deletes the note.' },
  { text: '' },
  { text: 'Admin APIs', style: 'heading' },
  { text: 'Auth for all /admin routes: admin or super_admin Bearer token.' },
  { text: 'GET /admin/users?role=learner&status=active&page=1&limit=20' },
  { text: 'Expected: 200, paginated global user list. No tenant filtering.' },
  { text: '' },
  { text: 'PATCH /admin/users/:id/ban' },
  { text: 'Body: {"banned":true,"reason":"Policy violation"}' },
  { text: 'Expected: 200, target status banned and sessions revoked.' },
  { text: 'Negative: admin modifying own account -> 400 SELF_ADMIN_CHANGE_DENIED.' },
  { text: 'Negative: admin modifying super_admin -> 403 SUPER_ADMIN_PROTECTED.' },
  { text: '' },
  { text: 'PATCH /admin/users/:id/role' },
  { text: 'Body: {"role":"tutor","reason":"Approved educator"}' },
  { text: 'Allowed roles: learner, tutor, admin, super_admin.' },
  { text: 'Expected: 200, role changed and sessions revoked.' },
  { text: 'Negative: only super_admin can grant/modify super_admin.' },
  { text: '' },
  { text: 'DELETE /admin/users/:id' },
  { text: 'Expected: 200, user soft deleted and sessions revoked.' },
  { text: '' },
  { text: 'Platform Owner APIs', style: 'heading' },
  { text: 'Platform owner is the application owner/developer control account. It does not use /auth/login.' },
  { text: 'POST /platform/auth/login' },
  { text: 'Auth: none' },
  { text: 'Body: {"email":"owner@example.com","password":"Password123","rememberMe":false}' },
  { text: 'Expected: 200, platform owner user and tokens returned.' },
  { text: '' },
  { text: 'POST /platform/auth/forgot-password' },
  { text: 'Auth: none' },
  { text: 'Body: {"email":"owner@example.com"}' },
  { text: 'Expected: 200 generic message and reset email if configured.' },
  { text: 'Expected email link: http://localhost:3000/platform/reset-password?token=<reset-token>.' },
  { text: 'Frontend should read token from the URL and POST it to /platform/auth/reset-password.' },
  { text: '' },
  { text: 'GET /platform/auth/password-reset-cookie?token=<token>&redirectTo=/platform/reset-password' },
  { text: 'Auth: none' },
  { text: 'Compatibility route for old platform reset links. New frontend logic should use the token query parameter directly.' },
  { text: '' },
  { text: 'POST /platform/auth/reset-password' },
  { text: 'Auth: none. Frontend sends token from platform/reset-password?token=... in the JSON body.' },
  { text: 'Body: {"token":"<reset-token>","password":"Password456","confirmPassword":"Password456"}' },
  { text: 'Expected: 200, redirectTo /platform/login.' },
  { text: '' },
  { text: 'POST /platform/auth/refresh-token' },
  { text: 'Auth: platform refresh token in body/cookie.' },
  { text: 'Body: {"refreshToken":"<refreshToken>"}' },
  { text: 'Expected: 200, rotated platform tokens.' },
  { text: '' },
  { text: 'POST /platform/auth/logout' },
  { text: 'Auth: platform refresh token in body/cookie.' },
  { text: 'Expected: 200 Platform logout successful.' },
  { text: '' },
  { text: 'GET /platform/users?role=learner&status=active&page=1&limit=20' },
  { text: 'Auth: platform_owner Bearer token only.' },
  { text: 'Expected: 200, all application users globally, including admin roles if filtered/visible.' },
  { text: '' },
  { text: 'PATCH /platform/users/:id/ban' },
  { text: 'Auth: platform_owner Bearer token only.' },
  { text: 'Body: {"banned":true,"reason":"Owner action"}' },
  { text: 'Expected: 200, any non-platform-owner target can be banned/unbanned.' },
  { text: 'Negative: platform owner modifying self -> 400 SELF_ADMIN_CHANGE_DENIED.' },
  { text: 'Negative: platform owner modifying another platform owner -> 403 PLATFORM_OWNER_PROTECTED.' },
  { text: '' },
  { text: 'PATCH /platform/users/:id/role' },
  { text: 'Auth: platform_owner Bearer token only.' },
  { text: 'Body: {"role":"super_admin","reason":"Promote operator"}' },
  { text: 'Allowed roles: learner, tutor, admin, super_admin.' },
  { text: 'Expected: 200, role changed and sessions revoked.' },
  { text: '' },
  { text: 'DELETE /platform/users/:id' },
  { text: 'Auth: platform_owner Bearer token only.' },
  { text: 'Expected: 200, non-platform-owner user soft deleted and sessions revoked.' },
  { text: '' },
  { text: 'Compatibility Routes', style: 'heading' },
  { text: 'Every route above also works with /api/v1 prefix where mounted:' },
  { text: '/api/v1/auth/*, /api/v1/platform/*, /api/v1/users/*, /api/v1/admin/*, /api/v1/courses/*, /api/v1/lessons/*, /api/v1/progress/*, /api/v1/notes/*.' },
  { text: '' },
  { text: 'Recommended Manual Test Order', style: 'heading' },
  { text: '1. GET /health.' },
  { text: '2. Register a learner, verify OTP, login, refresh, logout.' },
  { text: '3. Register a tutor, verify OTP, confirm login is blocked while pending_approval.' },
  { text: '4. Login admin/super_admin, list users, approve/change tutor role or status as needed.' },
  { text: '5. Login learner, test profile, email change, password change.' },
  { text: '6. Create/fetch course content, progress, and notes.' },
  { text: '7. Login platform owner at /platform/auth/login and test global user controls.' },
  { text: '8. Test duplicate email by trying to register the same email again.' },
  { text: '9. Test forgot/reset password for normal user and platform owner.' },
  { text: '10. Run npm test and npm run audit:duplicate-emails.' }
];

const pageWidth = 612;
const pageHeight = 792;
const margin = 50;
const maxWidth = pageWidth - margin * 2;
const fontSize = 10;
const lineHeight = 14;
const titleSize = 20;
const headingSize = 14;

const escapePdf = (value) => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')
  .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');

const estimateWidth = (text, size) => text.length * size * 0.48;

const wrapText = (text, size) => {
  if (!text) return [''];
  const words = text.split(' ');
  const wrapped = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (estimateWidth(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) wrapped.push(line);

    if (estimateWidth(word, size) <= maxWidth) {
      line = word;
      continue;
    }

    let chunk = '';
    for (const char of word) {
      const candidateChunk = `${chunk}${char}`;
      if (estimateWidth(candidateChunk, size) > maxWidth && chunk) {
        wrapped.push(chunk);
        chunk = char;
      } else {
        chunk = candidateChunk;
      }
    }
    line = chunk;
  }

  if (line) wrapped.push(line);
  return wrapped;
};

const pages = [];
let current = [];
let y = pageHeight - margin;

const addPage = () => {
  if (current.length) pages.push(current);
  current = [];
  y = pageHeight - margin;
};

for (const entry of lines) {
  const size = entry.style === 'title' ? titleSize : entry.style === 'heading' ? headingSize : fontSize;
  const leading = entry.style === 'title' ? 24 : entry.style === 'heading' ? 18 : lineHeight;
  const font = entry.style === 'title' || entry.style === 'heading' ? 'F2' : 'F1';
  const wrapped = wrapText(entry.text, size);
  const blockHeight = wrapped.length * leading + (entry.style === 'heading' ? 4 : 0);

  if (y - blockHeight < margin) {
    addPage();
  }

  if (entry.style === 'heading' && current.length) {
    y -= 5;
  }

  for (const line of wrapped) {
    current.push({
      text: line,
      x: margin,
      y,
      size,
      font
    });
    y -= leading;
  }

  if (entry.text === '') {
    y -= 4;
  }
}

addPage();

const objects = [];

const addObject = (body) => {
  objects.push(body);
  return objects.length;
};

const pageRefs = [];
const catalogRef = addObject('<< /Type /Catalog /Pages 2 0 R >>');
const pagesRef = addObject('');
const fontRegularRef = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
const fontBoldRef = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

for (const page of pages) {
  const stream = page.map((line) => (
    `BT /${line.font} ${line.size} Tf ${line.x} ${line.y} Td (${escapePdf(line.text)}) Tj ET`
  )).join('\n');

  const contentRef = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
  const pageRef = addObject(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularRef} 0 R /F2 ${fontBoldRef} 0 R >> >> /Contents ${contentRef} 0 R >>`);
  pageRefs.push(pageRef);
}

objects[pagesRef - 1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

let pdf = '%PDF-1.4\n';
const offsets = [0];

for (let index = 0; index < objects.length; index += 1) {
  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
}

const xrefOffset = Buffer.byteLength(pdf, 'utf8');
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += '0000000000 65535 f \n';

for (let index = 1; index < offsets.length; index += 1) {
  pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
}

pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, pdf);

console.log(`Generated ${outputFile}`);
