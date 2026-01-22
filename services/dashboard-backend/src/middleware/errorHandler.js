/**
 * Error Handling Middleware
 * Centralized error handling for Express routes
 */

const logger = require('../utils/logger');
const { ApiError } = require('../utils/errors');

/**
 * Async route handler wrapper
 * Eliminates the need for try-catch in every route
 *
 * Usage:
 *   const { asyncHandler } = require('../middleware/errorHandler');
 *   router.get('/', asyncHandler(async (req, res) => {
 *     const data = await someAsyncOperation();
 *     res.json(data);
 *   }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not Found handler
 * Place after all routes to catch 404s
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
};

/**
 * Global error handler middleware
 * Place last in middleware chain
 *
 * Handles:
 * - Custom ApiError instances
 * - Standard Error instances
 * - Unknown errors
 */
const errorHandler = (err, req, res, next) => {
  // Log error with context
  const errorContext = {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    username: req.user?.username
  };

  // Determine status code and message
  let statusCode = 500;
  let message = 'Internal server error';
  let details = null;

  if (err instanceof ApiError) {
    // Custom API error
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;

    // Log level based on status code
    if (statusCode >= 500) {
      logger.error(`${req.method} ${req.originalUrl}: ${err.message}`, {
        ...errorContext,
        stack: err.stack
      });
    } else if (statusCode >= 400) {
      logger.warn(`${req.method} ${req.originalUrl}: ${err.message}`, errorContext);
    }
  } else if (err.name === 'ValidationError') {
    // Mongoose/Joi validation error
    statusCode = 400;
    message = 'Validation failed';
    details = err.details || err.message;
    logger.warn(`${req.method} ${req.originalUrl}: ${message}`, errorContext);
  } else if (err.code === 'ECONNREFUSED') {
    // Database/service connection error
    statusCode = 503;
    message = 'Service temporarily unavailable';
    logger.error(`${req.method} ${req.originalUrl}: Connection refused`, {
      ...errorContext,
      target: err.address
    });
  } else if (err.code === '23505') {
    // PostgreSQL unique violation
    statusCode = 409;
    message = 'Resource already exists';
    logger.warn(`${req.method} ${req.originalUrl}: Duplicate key`, errorContext);
  } else if (err.code === '23503') {
    // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Invalid reference';
    logger.warn(`${req.method} ${req.originalUrl}: FK violation`, errorContext);
  } else {
    // Unknown error - log full details
    logger.error(`${req.method} ${req.originalUrl}: ${err.message}`, {
      ...errorContext,
      stack: err.stack,
      name: err.name
    });
  }

  // Send response
  res.status(statusCode).json({
    error: message,
    ...(details && { details }),
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  asyncHandler,
  notFoundHandler,
  errorHandler
};
