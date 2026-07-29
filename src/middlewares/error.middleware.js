const env = require('../config/env');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errors');

const normalizeError = (error) => {
  if (error instanceof ApiError) {
    return error;
  }

  if (error.name === 'ValidationError') {
    return new ApiError(400, 'Validation failed', 'MONGOOSE_VALIDATION_ERROR', error.errors);
  }

  if (error.name === 'CastError') {
    return new ApiError(400, 'Invalid resource identifier', 'INVALID_ID');
  }

  if (error.code === 11000) {
    return new ApiError(409, 'Resource already exists', 'DUPLICATE_RESOURCE');
  }

  if (error.name === 'MulterError') {
    return new ApiError(400, error.message, 'UPLOAD_ERROR');
  }

  if (error.type === 'entity.too.large') {
    return new ApiError(413, 'Request body is too large', 'BODY_TOO_LARGE');
  }

  return error;
};

const errorHandler = (error, _req, res, _next) => {
  const normalized = normalizeError(error);
  const statusCode = normalized.statusCode || 500;
  const isOperational = normalized.isOperational === true;
  const message = env.isProduction && !isOperational
    ? 'Internal server error'
    : normalized.message || 'Internal server error';

  if (statusCode >= 500) {
    logger.error('Server error', {
      statusCode,
      message: normalized.message,
      code: normalized.code,
      stack: env.isProduction ? undefined : normalized.stack
    });
  }

  const payload = {
    success: false,
    message,
    code: normalized.code || 'INTERNAL_SERVER_ERROR'
  };

  if (normalized.details && (!env.isProduction || isOperational)) {
    payload.details = normalized.details;
  }

  return res.status(statusCode).json(payload);
};

const notFoundHandler = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
};

module.exports = {
  errorHandler,
  notFoundHandler
};
