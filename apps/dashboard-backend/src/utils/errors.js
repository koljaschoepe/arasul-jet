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

class TokenExpiredError extends ApiError {
  constructor(message = 'Token expired') {
    super(message, { statusCode: 401, code: 'TOKEN_EXPIRED' });
  }
}

class InvalidTokenError extends ApiError {
  constructor(message = 'Invalid token') {
    super(message, { statusCode: 401, code: 'INVALID_TOKEN' });
  }
}

class TokenRevokedError extends ApiError {
  constructor(message = 'Token has been revoked') {
    super(message, { statusCode: 401, code: 'TOKEN_REVOKED' });
  }
}

/**
 * 403. Der Code ist `FORBIDDEN`, ausser ein Aufrufer nennt einen engeren
 * (`ACCOUNT_LOCKED`, `ACCOUNT_DISABLED`, `ORIGIN_NOT_ALLOWED`): ein Klient,
 * der nur den Status liest, kann ein gesperrtes Konto nicht von einer
 * abgewiesenen Herkunft unterscheiden und schickt einen Menschen auf die
 * falsche Fährte (J34).
 */
class ForbiddenError extends ApiError {
  constructor(message = 'Access denied', code = 'FORBIDDEN') {
    super(message, { statusCode: 403, code });
  }
}

/**
 * CSRF token missing/invalid. Distinct code so clients can tell this recoverable
 * failure (fetch a fresh token, retry once) apart from a genuine authorization
 * denial (FORBIDDEN), which must never be retried.
 */
class CsrfError extends ApiError {
  constructor(message = 'CSRF token invalid') {
    super(message, { statusCode: 403, code: 'CSRF_INVALID' });
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' });
  }
}

class ConflictError extends ApiError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, { statusCode: 409, code: 'CONFLICT', details });
  }
}

/**
 * Es passt nicht mehr hinein (J33, 28.09.2026): die Groessengrenze eines
 * Bereichs im Firmenordner oder der freie Platz des Geraets. 409 und nicht
 * 507, obwohl der Dateidienst selbst mit 507 abweist: eine 5xx liest jeder
 * Klient als „Server kaputt, noch einmal versuchen" -- und ein zweiter
 * Versuch passt genauso wenig. Der eigene Code sagt dem Kit, was es ist.
 */
class GrenzeErreichtError extends ApiError {
  constructor(message = 'Das passt nicht mehr hinein', details = null) {
    super(message, { statusCode: 409, code: 'GRENZE_ERREICHT', details });
  }
}

/**
 * Live schalten ging nicht durch (M5, Auftrag live-schalten-mit-sicherung):
 * `LIVE_ZURUECKGESCHALTET` -- die neue Fassung kam nicht hoch, und das Geraet
 * hat Fassung und Daten von vorher wiederhergestellt; `LIVE_NICHT_GESICHERT`
 * -- die Sicherung davor misslang, geschaltet wurde nichts. 409, denn ein
 * zweiter Versuch mit derselben Fassung endet gleich. `details` traegt den
 * zweiten Satz (`hilfe`) und die Technik.
 */
class LiveSchaltenError extends ApiError {
  constructor(message, code, details = null) {
    super(message, { statusCode: 409, code, details });
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
  /**
   * @param {string} message
   * @param {string|object|null} serviceOrOptions Either a service name
   *   (legacy: `'ollama'`) or an options object:
   *   `{ code?, service?, details? }`. The object form lets callers
   *   customize the error code (e.g. `'OLLAMA_UNAVAILABLE'`) while
   *   keeping the 503 status.
   */
  constructor(message = 'Service temporarily unavailable', serviceOrOptions = null) {
    if (serviceOrOptions === null || typeof serviceOrOptions === 'string') {
      super(message, {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        details: serviceOrOptions ? { service: serviceOrOptions } : null,
      });
    } else {
      const { code, service, details } = serviceOrOptions;
      super(message, {
        statusCode: 503,
        code: code || 'SERVICE_UNAVAILABLE',
        details: details || (service ? { service } : null),
      });
    }
  }
}

class NotImplementedError extends ApiError {
  constructor(message = 'Not implemented', details = null) {
    super(message, { statusCode: 501, code: 'NOT_IMPLEMENTED', details });
  }
}

module.exports = {
  ApiError,
  ValidationError,
  UnauthorizedError,
  TokenExpiredError,
  InvalidTokenError,
  TokenRevokedError,
  ForbiddenError,
  CsrfError,
  NotFoundError,
  ConflictError,
  GrenzeErreichtError,
  LiveSchaltenError,
  RateLimitError,
  ServiceUnavailableError,
  NotImplementedError,
};
