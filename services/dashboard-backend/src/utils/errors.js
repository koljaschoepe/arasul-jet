/**
 * Custom Error Classes
 * Centralized error handling for the API
 */

/**
 * Base API Error
 * All custom errors should extend this class
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      ...(this.details && { details: this.details }),
      timestamp: this.timestamp
    };
  }
}

/**
 * 400 Bad Request
 * Use for validation errors or malformed requests
 */
class ValidationError extends ApiError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, details);
  }
}

/**
 * 401 Unauthorized
 * Use when authentication is required but not provided or invalid
 */
class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

/**
 * 403 Forbidden
 * Use when user is authenticated but not authorized for the action
 */
class ForbiddenError extends ApiError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

/**
 * 404 Not Found
 * Use when requested resource doesn't exist
 */
class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * 409 Conflict
 * Use for duplicate entries or state conflicts
 */
class ConflictError extends ApiError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

/**
 * 429 Too Many Requests
 * Use when rate limit is exceeded
 */
class RateLimitError extends ApiError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 429, retryAfter ? { retryAfter } : null);
  }
}

/**
 * 503 Service Unavailable
 * Use when an external service is down
 */
class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service temporarily unavailable', serviceName = null) {
    super(message, 503, serviceName ? { service: serviceName } : null);
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
  ServiceUnavailableError
};
