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
  // Second arg accepts either a string (legacy: service name) or an options
  // object (preferred: { code, service, details }) so callers can attach a
  // stable, machine-readable code like 'OLLAMA_UNAVAILABLE' or
  // 'EMBEDDING_DOWN' that the frontend can dispatch on.
  constructor(message = 'Service temporarily unavailable', opts = null) {
    let code = 'SERVICE_UNAVAILABLE';
    let details = null;

    if (typeof opts === 'string') {
      details = { service: opts };
    } else if (opts && typeof opts === 'object') {
      if (opts.code) {
        code = opts.code;
      }
      const service = opts.service || null;
      const extra = opts.details || null;
      if (service || extra) {
        details = { ...(service ? { service } : {}), ...(extra || {}) };
      }
    }

    super(message, { statusCode: 503, code, details });
  }
}

class NotImplementedError extends ApiError {
  constructor(message = 'Not implemented') {
    super(message, { statusCode: 501, code: 'NOT_IMPLEMENTED' });
  }
}

// Phase 6.2: Concrete service-error subclasses. Identical wire format to
// ServiceUnavailableError (same statusCode, same code, same envelope) — these
// just save the call site from spelling out the code each time and let
// handlers `instanceof` if they ever need to dispatch on the failing service.
class OllamaUnavailableError extends ServiceUnavailableError {
  constructor(message = 'LLM-Service nicht erreichbar', details = null) {
    super(message, { code: 'OLLAMA_UNAVAILABLE', service: 'ollama', details });
  }
}

class EmbeddingFailedError extends ServiceUnavailableError {
  constructor(message = 'Embedding-Service nicht erreichbar', details = null) {
    super(message, { code: 'EMBEDDING_DOWN', service: 'embedding', details });
  }
}

class QdrantUnavailableError extends ServiceUnavailableError {
  constructor(message = 'Vektor-Datenbank nicht erreichbar', details = null) {
    super(message, { code: 'QDRANT_UNAVAILABLE', service: 'qdrant', details });
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
  OllamaUnavailableError,
  EmbeddingFailedError,
  QdrantUnavailableError,
  NotImplementedError,
};
