/**
 * Custom Error Classes
 *
 * All API errors extend ApiError and carry:
 * - statusCode — HTTP status
 * - code       — stable machine-readable identifier (e.g. 'VALIDATION_ERROR')
 *                clients can dispatch on this without parsing human messages
 * - details    — optional structured payload (only exposed for 4xx responses)
 * - timestamp  — ISO string set at throw time
 *
 * The global error handler (middleware/errorHandler.js) serializes to:
 *   { error: { code, message, details? }, timestamp }
 */

class ApiError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
      timestamp: this.timestamp,
    };
  }
}

class ValidationError extends ApiError {
  constructor(message = 'Validation failed', details = null) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', details });
  }
}

class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(message, { statusCode: 401, code: 'UNAUTHORIZED' });
  }
}

class ForbiddenError extends ApiError {
  constructor(message = 'Access denied') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' });
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' });
  }
}

class ConflictError extends ApiError {
  constructor(message = 'Resource conflict') {
    super(message, { statusCode: 409, code: 'CONFLICT' });
  }
}

class RateLimitError extends ApiError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, {
      statusCode: 429,
      code: 'RATE_LIMITED',
      details: retryAfter ? { retryAfter } : null,
    });
  }
}

class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service temporarily unavailable', serviceName = null) {
    super(message, {
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      details: serviceName ? { service: serviceName } : null,
    });
  }
}

module.exports = {
  ApiError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
};
