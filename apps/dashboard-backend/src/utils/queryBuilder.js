/**
 * Query Builder Utilities
 * Helpers for building dynamic UPDATE queries with parameterized values.
 * Eliminates duplicated SET-clause building logic across route files.
 */

/**
 * Build SET clause components for a dynamic UPDATE query.
 *
 * @param {Object} fields - Map of column names to values. Only entries where
 *   the value is not undefined will be included in the SET clause.
 * @param {Object} [options]
 * @param {boolean} [options.includeUpdatedAt=true] - Prepend `updated_at = NOW()` to the SET clause.
 * @param {number} [options.startIndex=1] - Starting $N parameter index.
 * @returns {{ setClauses: string[], params: any[], paramIndex: number }}
 *   - setClauses: Array of "column = $N" strings (and optionally "updated_at = NOW()")
 *   - params: Array of values matching the $N placeholders
 *   - paramIndex: Next available parameter index (use for WHERE conditions)
 */
function buildSetClauses(fields, options = {}) {
  const { includeUpdatedAt = true, startIndex = 1 } = options;

  const setClauses = [];
  const params = [];
  let paramIndex = startIndex;

  if (includeUpdatedAt) {
    setClauses.push('updated_at = NOW()');
  }

  for (const [column, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setClauses.push(`${column} = $${paramIndex++}`);
      params.push(value);
    }
  }

  return { setClauses, params, paramIndex };
}

module.exports = {
  buildSetClauses,
};
