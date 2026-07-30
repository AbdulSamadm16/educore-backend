const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const env = require('./config/env');
const logger = require('./utils/logger');
const routes = require('./routes');
const authRoutes = require('./routes/auth.routes');
const platformRoutes = require('./routes/platform.routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const { ApiError } = require('./utils/errors');

const { mongoose, connectMongo } = require('./config/database');




// Load event subscribers
require('./subscribers/auth.subscriber');


const app = express();

let mongoConnectionPromise;

const ensureMongoConnection = async () => {
  if (mongoose.connection.readyState === 1) return;

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = connectMongo().catch((err) => {
      mongoConnectionPromise = null;
      throw err;
    });
  }

  await mongoConnectionPromise;
};

app.use(async (req, res, next) => {
  try {
    await ensureMongoConnection();
    next();
  } catch (error) {
    next(error);
  }
});



const startTime = Date.now();

if (env.trustProxy) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: env.isProduction
    ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    : false
}));

app.use(cors({
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  origin: (origin, callback) => {
    // Explicitly allow same-origin requests from the server's own Swagger UI port (4000)
    if (!origin || env.cors.origins === '*' || env.cors.origins.includes(origin) || origin === 'http://localhost:4000') {
      return callback(null, true);
    }

    return callback(new ApiError(403, 'CORS origin is not allowed', 'CORS_ORIGIN_DENIED'));
  }
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());

// ======================================================
// ROOT API ROUTE
// ======================================================

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'EduCore LMS API',
    version: 'v1',
    docs: '/api-docs',
    health: '/health'
  });
});

// ======================================================
// SWAGGER (must be before any wildcard/static frontend routes)
// ======================================================
const SWAGGER_CSS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.0.0/swagger-ui.min.css';
const SWAGGER_JS_BUNDLE = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.0.0/swagger-ui-bundle.min.js';
const SWAGGER_JS_PRESET = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.0.0/swagger-ui-standalone-preset.min.js';

app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCssUrl: SWAGGER_CSS_URL,
    customJs: [SWAGGER_JS_BUNDLE, SWAGGER_JS_PRESET],
    customSiteTitle: 'EduCore LMS API Documentation',
    explorer: true,
  })
);
// ======================================================
// HEALTH ENDPOINTS
// ======================================================

app.get('/health', (_req, res) => {
  const memUsage = process.memoryUsage();

  res.status(200).json({
    success: true,
    message: 'EduCore LMS API is healthy',
    data: {
      status: 'ok',
      environment: env.nodeEnv,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
      }
    }
  });
});

app.get('/health/db', async (_req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    if (dbState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is not connected',
        data: {
          status: stateMap[dbState] || 'unknown'
        }
      });
    }

    // Lightweight ping
    await mongoose.connection.db.admin().ping();

    return res.status(200).json({
      success: true,
      message: 'Database is connected',
      data: {
        status: 'connected',
        name: mongoose.connection.name,
        host: mongoose.connection.host
      }
    });
  } catch (error) {
    logger.error('Health check DB failed', { error: error.message });

    return res.status(503).json({
      success: false,
      message: 'Database health check failed',
      data: {
        status: 'error'
      }
    });
  }
});


const { optionalAuthenticate } = require('./middlewares/auth.middleware');

// Prevent direct access to raw video uploads; forcing the use of signed streaming endpoints
app.use('/uploads/videos', (_req, res) => {
  res.status(403).json({
    success: false,
    message: 'Direct access to raw video uploads is forbidden. Secure time-limited signed streams must be used.',
    error: {
      code: 'DIRECT_ACCESS_FORBIDDEN'
    }
  });
});

// Secure attachments: Block download if the user is not enrolled or if the lesson is locked (unless allowFreePreview/isPreview is true)
app.get('/uploads/attachments/:filename', optionalAuthenticate, async (req, res, next) => {
  try {
    const { filename } = req.params;
    
    // Parse the lessonId from the filename.
    // Uploaded files are named `${lessonId}_${timestamp}_${filename}` or similar.
    const parts = filename.split('_');
    const lessonId = parts[0];
    
    const Lesson = require('./models/lesson.model');
    const Course = require('./models/course.model');
    const Enrollment = require('./models/enrollment.model');
    const Module = require('./models/module.model');
    
    // Validate Mongo ID
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attachment path structure.'
      });
    }
    
    const lesson = await Lesson.findOne({ _id: lessonId, deletedAt: null }).lean();
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Attachment parent lesson not found.'
      });
    }
    
    // If it is a free preview lesson, anyone can view it
    if (lesson.isPreview) {
      return next();
    }
    
    // Otherwise, check if user is logged in
    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: 'Authentication and enrollment required to access this attachment.',
        error: { code: 'ENROLLMENT_REQUIRED' }
      });
    }
    
    const course = await Course.findOne({ _id: lesson.courseId, deletedAt: null }).lean();
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Parent course not found.'
      });
    }
    
    const isAuthor = course.authorId && String(course.authorId) === String(req.user._id);
    const isAdmin = ['admin', 'super_admin', 'platform_owner'].includes(req.user.role);
    
    if (isAuthor || isAdmin) {
      return next();
    }
    
    // Check enrollment
    const enrollment = await Enrollment.findOne({
      userId: req.user._id,
      courseId: lesson.courseId,
      deletedAt: null,
      status: 'active'
    }).lean();
    
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'Active course enrollment required to access this secure attachment.',
        error: { code: 'ENROLLMENT_REQUIRED' }
      });
    }
    
    // Check sequential lock if course is sequential
    if (course.isSequential) {
      const allModules = await Module.find({ courseId: lesson.courseId, deletedAt: null, isPublished: true }).sort({ order: 1 }).lean();
      const allLessons = await Lesson.find({ courseId: lesson.courseId, deletedAt: null, isPublished: true }).sort({ order: 1 }).lean();
      
      const Progress = require('./models/progress.model');
      const progressObj = await Progress.findOne({
        userId: req.user._id,
        courseId: lesson.courseId,
        deletedAt: null
      }).lean();
      
      const completedLessons = progressObj ? (progressObj.completedLessons || []).map(id => String(id)) : [];
      
      // Let's compute lock states
      const moduleLessonsMap = new Map();
      allLessons.forEach(l => {
        const mId = String(l.moduleId);
        if (!moduleLessonsMap.has(mId)) {
          moduleLessonsMap.set(mId, []);
        }
        moduleLessonsMap.get(mId).push(l);
      });

      allModules.forEach(m => {
        const list = moduleLessonsMap.get(String(m._id)) || [];
        list.sort((a, b) => a.order - b.order);
        moduleLessonsMap.set(String(m._id), list);
      });

      const moduleCompleted = new Map();
      allModules.forEach(m => {
        const list = moduleLessonsMap.get(String(m._id)) || [];
        if (list.length === 0) {
          moduleCompleted.set(String(m._id), true);
        } else {
          const allDone = list.every(l => completedLessons.includes(String(l._id)));
          moduleCompleted.set(String(m._id), allDone);
        }
      });

      const moduleUnlocked = new Map();
      allModules.forEach((m, mIdx) => {
        if (mIdx === 0) {
          moduleUnlocked.set(String(m._id), true);
        } else {
          const prevM = allModules[mIdx - 1];
          const prevUnlocked = moduleUnlocked.get(String(prevM._id)) || false;
          const prevCompleted = moduleCompleted.get(String(prevM._id)) || false;
          moduleUnlocked.set(String(m._id), prevUnlocked && prevCompleted);
        }
      });

      const flatLessons = [];
      allModules.forEach(m => {
        const list = moduleLessonsMap.get(String(m._id)) || [];
        flatLessons.push(...list);
      });

      const currentLessonIdx = flatLessons.findIndex(l => String(l._id) === String(lesson._id));
      if (currentLessonIdx !== -1) {
        const mUnlocked = moduleUnlocked.get(String(lesson.moduleId)) || false;
        if (!mUnlocked) {
          return res.status(403).json({
            success: false,
            message: 'This lesson resource is locked until the previous module is completed.',
            error: { code: 'LESSON_LOCKED' }
          });
        }
        if (currentLessonIdx > 0) {
          const prevL = flatLessons[currentLessonIdx - 1];
          const prevCompleted = completedLessons.includes(String(prevL._id));
          if (!prevCompleted) {
            return res.status(403).json({
              success: false,
              message: 'This lesson resource is locked until the previous lesson is completed.',
              error: { code: 'LESSON_LOCKED' }
            });
          }
        }
      }
    }
    
    return next();
  } catch (error) {
    return next(error);
  }
});

app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Request logging
if (env.isProduction) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}



// ======================================================
// ROUTES
// ======================================================

app.use('/api/v1/platform', platformRoutes);
app.use('/auth', authRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/tutors/google', require('./routes/tutorGoogleAuth.routes'));
app.use('/api/v1/institutions', require('./routes/institutions.routes'));
app.use('/api/v1', routes);


// ======================================================
// FRONTEND STATIC FILES (move here)
// ======================================================
const frontendDist = path.join(__dirname, '../../Frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false }));



  // SPA fallback for navigation requests only. Skip API, auth, uploads and assets.
  app.get('*', (req, res, next) => {
    const url = req.originalUrl || req.url || '';
    if (
  url.startsWith('/api') ||
  url.startsWith('/auth') ||
  url.startsWith('/uploads') ||
  url.startsWith('/assets') ||
  url.startsWith('/api-docs')

) {
  return next();
}
    return res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ======================================================
// ERROR HANDLERS (must be last)
// ======================================================

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
