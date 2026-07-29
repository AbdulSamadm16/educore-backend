const fs = require('fs');
const path = require('path');
const swaggerSpec = require('../src/config/swagger');

const routeMounts = {
  'auth.routes.js': ['/auth', '/api/v1/auth'],
  'platform.routes.js': ['/api/v1/platform'],
  'tutorGoogleAuth.routes.js': ['/api/tutors/google'],
  'institutions.routes.js': ['/api/v1/institutions'],
  'user.routes.js': ['/api/v1/users'],
  'admin.routes.js': ['/api/v1/admin'],
  'course.routes.js': ['/api/v1/courses'],
  'lesson.routes.js': ['/api/v1/lessons'],
  'progress.routes.js': ['/api/v1/progress'],
  'note.routes.js': ['/api/v1/notes'],
  'enrollment.routes.js': ['/api/v1/enrollments'],
  'module.routes.js': ['/api/v1/modules'],
  'review.routes.js': ['/api/v1/reviews'],
  'submission.routes.js': ['/api/v1/submissions'],
  'wishlist.routes.js': ['/api/v1/wishlist'],
  'mux.routes.js': ['/api/v1/mux'],
  'notification.routes.js': ['/api/v1/notifications'],
  'payment.routes.js': ['/api/v1/payments'],
  'certificate.routes.js': ['/api/v1/certificates'],
  'liveSession.routes.js': ['/api/v1/live-sessions'],
  'liveRecording.routes.js': ['/api/v1/live-recordings'],
  'attendance.routes.js': ['/api/v1/attendance'],
  'quizAttempt.routes.js': ['/api/v1/quizzes'],
  'discussion.routes.js': ['/api/v1/discussions'],
  'institution.routes.js': ['/api/v1/institution'],
  'institutionAttendance.routes.js': ['/api/v1/institution-attendance'],
  'institutionFee.routes.js': ['/api/v1/institution-fees']
};

const routePattern = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)/g;

function normalizePath(basePath, routePath) {
  const suffix = routePath === '/' ? '' : routePath;
  return `${basePath}${suffix}`
    .replace(/\/+/g, '/')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function collectRoutes() {
  const routesDir = path.join(__dirname, '../src/routes');
  const routes = [];

  for (const [fileName, basePaths] of Object.entries(routeMounts)) {
    const filePath = path.join(routesDir, fileName);
    const contents = fs.readFileSync(filePath, 'utf8');

    for (const match of contents.matchAll(routePattern)) {
      for (const basePath of basePaths) {
        routes.push({
          method: match[1],
          apiPath: normalizePath(basePath, match[2]),
          fileName
        });
      }
    }
  }

  routes.push(
    { method: 'get', apiPath: '/health', fileName: 'app.js' },
    { method: 'get', apiPath: '/health/db', fileName: 'app.js' }
  );

  return routes;
}

const missingRoutes = collectRoutes().filter(({ method, apiPath }) => {
  return !swaggerSpec.paths[apiPath] || !swaggerSpec.paths[apiPath][method];
});

if (missingRoutes.length > 0) {
  console.error('Swagger is missing documentation for these route operations:');
  for (const route of missingRoutes) {
    console.error(`- ${route.method.toUpperCase()} ${route.apiPath} (${route.fileName})`);
  }
  process.exit(1);
}

console.log('Swagger route coverage check passed.');
