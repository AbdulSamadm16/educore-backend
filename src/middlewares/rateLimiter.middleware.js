const redis = require('../config/redis');
const env = require('../config/env');
const { ApiError } = require('../utils/errors');

const createRedisRateLimiter = ({ prefix, windowSeconds, max }) => async (req, res, next) => {
  const routePart = `${req.method}:${req.baseUrl}${req.path}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
  const ipPart = (req.ip || req.socket?.remoteAddress || 'unknown').replace(/[^a-zA-Z0-9:._-]/g, '_');
  const key = `rate:${prefix}:${routePart}:${ipPart}`;

  try {
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const resetSeconds = ttl > 0 ? ttl : windowSeconds;

    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(max - current, 0)));
    res.set('RateLimit-Reset', String(resetSeconds));

    if (current > max) {
      throw new ApiError(429, 'Too many requests', 'RATE_LIMITED', {
        retryAfterSeconds: resetSeconds
      });
    }

    return next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }

    return next(new ApiError(503, 'Rate limiter unavailable', 'RATE_LIMITER_UNAVAILABLE', env.isProduction ? undefined : {
      redisDriver: env.redis.driver,
      useMemory: env.redis.useMemory,
      useUpstashRest: env.redis.useUpstashRest,
      error: error.message
    }));
  }
};

const authRateLimiter = createRedisRateLimiter({
  prefix: 'auth',
  windowSeconds: 60,
  max: 10
});

const strictAuthRateLimiter = createRedisRateLimiter({
  prefix: 'auth-strict',
  windowSeconds: 60,
  max: 5
});

const enrollmentRateLimiter = createRedisRateLimiter({
  prefix: 'enrollment',
  windowSeconds: 60,
  max: 10
});

const searchRateLimiter = createRedisRateLimiter({
  prefix: 'search',
  windowSeconds: 60,
  max: 30
});

const adminRateLimiter = createRedisRateLimiter({
  prefix: 'admin',
  windowSeconds: 60,
  max: 30
});

module.exports = {
  createRedisRateLimiter,
  authRateLimiter,
  strictAuthRateLimiter,
  enrollmentRateLimiter,
  searchRateLimiter,
  adminRateLimiter
};
