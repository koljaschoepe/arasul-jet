/**
 * Zod-based request validation middleware.
 *
 * Usage:
 *   const { validateBody, validateQuery } = require('../middleware/validate');
 *   router.post('/foo', requireAuth, validateBody(MySchema), asyncHandler(...));
 *
 * On success, parsed+coerced values replace the original req.body/req.query/req.params
 * so handlers receive typed, trimmed, defaulted data.
 *
 * On failure, throws ValidationError with code='VALIDATION_ERROR' and
 * details=[{ path, message, code }, ...] — the global error handler returns 400.
 */

const { ValidationError } = require('../utils/errors');

const formatZodError = zodError => {
  return zodError.issues.map(issue => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));
};

const summarizeIssues = issues => {
  if (issues.length === 0) {return 'validation failed';}
  const first = issues[0];
  return `${first.path}: ${first.message}`;
};

const validate = (schema, source) => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const issues = formatZodError(result.error);
    return next(
      new ValidationError(summarizeIssues(issues), {
        code: 'VALIDATION_ERROR',
        source,
        issues,
      })
    );
  }
  req[source] = result.data;
  next();
};

module.exports = {
  validateBody: schema => validate(schema, 'body'),
  validateQuery: schema => validate(schema, 'query'),
  validateParams: schema => validate(schema, 'params'),
};
