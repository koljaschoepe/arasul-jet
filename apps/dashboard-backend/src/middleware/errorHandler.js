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
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not Found handler
 * Place after all routes to catch 404s
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      details: { path: req.originalUrl, method: req.method },
    },
    timestamp: new Date().toISOString(),
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
    username: req.user?.username,
  };

  // Determine status code and message
  let statusCode = 500;
  let message = 'Internal server error';
  let details = null;
  let code = 'INTERNAL_ERROR';

  if (err instanceof ApiError) {
    // Custom API error
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
    code = err.code || 'INTERNAL_ERROR';

    // Log level based on status code
    if (statusCode >= 500) {
      logger.error(`${req.method} ${req.originalUrl}: ${err.message}`, {
        ...errorContext,
        stack: err.stack,
      });
    } else if (statusCode >= 400) {
      logger.warn(`${req.method} ${req.originalUrl}: ${err.message}`, errorContext);
    }
  } else if (err.name === 'ValidationError') {
    // Mongoose/Joi validation error
    statusCode = 400;
    message = 'Validation failed';
    code = 'VALIDATION_ERROR';
    details = err.details || err.message;
    logger.warn(`${req.method} ${req.originalUrl}: ${message}`, errorContext);
  } else if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    // body-parser: kaputtes JSON im Request-Body ist ein Client-Fehler (400),
    // kein Server-Fehler — vorher lief das als 500/INTERNAL_ERROR durch.
    statusCode = 400;
    message = 'Ungültiger Request-Body (kein gültiges JSON)';
    code = 'VALIDATION_ERROR';
    logger.warn(`${req.method} ${req.originalUrl}: Malformed JSON body`, errorContext);
  } else if (err.type === 'entity.too.large') {
    // body-parser: Body über dem Limit — ebenfalls ein Client-Fehler.
    statusCode = 413;
    message = 'Request-Body zu groß';
    code = 'VALIDATION_ERROR';
    logger.warn(`${req.method} ${req.originalUrl}: Body too large`, errorContext);
  } else if (err.name === 'MulterError') {
    // multer: die Datei sprengt das Limit, kommt im falschen Feld oder es sind
    // zu viele. Alles davon ist ein Fehler des Aufrufers und keiner des
    // Geraets -- ohne diesen Zweig fiel ein zu grosses Paket als 500 heraus,
    // und der Partner las „das Geraet ist kaputt", wo „zu gross" stand
    // (Phase C5, beim Deploy-Endpunkt aufgefallen).
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Die hochgeladene Datei ist zu gross'
        : `Upload abgewiesen: ${err.message}`;
    code = 'VALIDATION_ERROR';
    details = { feld: err.field || null, grund: err.code };
    logger.warn(`${req.method} ${req.originalUrl}: multer ${err.code}`, errorContext);
  } else if (err.code === 'ECONNREFUSED') {
    // Database/service connection error
    statusCode = 503;
    message = 'Service temporarily unavailable';
    code = 'SERVICE_UNAVAILABLE';
    logger.error(`${req.method} ${req.originalUrl}: Connection refused`, {
      ...errorContext,
      target: err.address,
    });
  } else if (err.code === '23505') {
    // PostgreSQL unique violation
    statusCode = 409;
    message = 'Resource already exists';
    code = 'CONFLICT';
    logger.warn(`${req.method} ${req.originalUrl}: Duplicate key`, errorContext);
  } else if (err.code === '23503') {
    // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Invalid reference';
    code = 'VALIDATION_ERROR';
    logger.warn(`${req.method} ${req.originalUrl}: FK violation`, errorContext);
  } else if (err.code === '22P02') {
    // PostgreSQL: der Text passt nicht zum Spaltentyp, praktisch immer eine
    // kaputte Id in der Adresse (23.08.2026 an einer Loesch-Route der Sandbox
    // gefunden). Ohne diesen Zweig kam HTTP 500 zurueck — der Betreiber liest
    // "das Geraet ist kaputt", obwohl die Eingabe falsch war. Und die Antwort
    // trug die rohe Postgres-Meldung samt der eingegebenen Zeichenkette.
    statusCode = 400;
    message = 'Ungueltiger Wert in der Anfrage';
    code = 'VALIDATION_ERROR';
    logger.warn(`${req.method} ${req.originalUrl}: ungueltiger Wert (22P02)`, errorContext);
  } else {
    // Unknown error - log full details
    logger.error(`${req.method} ${req.originalUrl}: ${err.message}`, {
      ...errorContext,
      stack: err.stack,
      name: err.name,
    });
  }

  // Send response (skip if headers already sent, e.g. during SSE streaming)
  if (res.headersSent) {
    logger.error('Headers already sent, cannot send error response', { path: req.originalUrl });
    return;
  }
  try {
    // BH6: Never include stack traces or internal details in client response.
    // Only send safe, user-facing error info. Stack is logged server-side above.
    const errorBody = { code, message };
    // Only include details for client errors (4xx) where details are explicitly set
    if (details && statusCode >= 400 && statusCode < 500) {
      errorBody.details = details;
    }
    res.status(statusCode).json({
      error: errorBody,
      timestamp: new Date().toISOString(),
    });
  } catch (jsonErr) {
    logger.error(`Failed to serialize error response: ${jsonErr.message}`);
    res.status(500).end('Internal Server Error');
  }
};

module.exports = {
  asyncHandler,
  notFoundHandler,
  errorHandler,
};
