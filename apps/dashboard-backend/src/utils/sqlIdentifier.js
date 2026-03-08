/**
 * SQL Identifier Utilities
 * Central validation and escaping for dynamic SQL identifiers (table/column names).
 * Defense in Depth: Validation (isValidSlug) + Escaping (escapeIdentifier)
 */

const { ValidationError } = require('./errors');

/**
 * SQL Reserved Keywords - blocked from use as identifiers
 */
const SQL_RESERVED_KEYWORDS = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'drop',
  'create',
  'alter',
  'truncate',
  'table',
  'index',
  'view',
  'database',
  'schema',
  'grant',
  'revoke',
  'cascade',
  'union',
  'intersect',
  'except',
  'join',
  'where',
  'from',
  'into',
  'values',
  'set',
  'null',
  'not',
  'and',
  'or',
  'true',
  'false',
  'is',
  'in',
  'like',
  'between',
  'exists',
  'all',
  'any',
  'some',
  'order',
  'by',
  'group',
  'having',
  'limit',
  'offset',
  'as',
  'on',
  'using',
  'natural',
  'left',
  'right',
  'inner',
  'outer',
  'cross',
  'full',
  'primary',
  'foreign',
  'key',
  'references',
  'unique',
  'check',
  'default',
  'constraint',
  'exec',
  'execute',
  'declare',
  'cursor',
  'fetch',
  'open',
  'close',
  'begin',
  'end',
  'commit',
  'rollback',
  'savepoint',
  'trigger',
  'function',
  'procedure',
  'return',
  'returns',
  'language',
  'security',
  'definer',
  'invoker',
  'volatile',
  'stable',
  'immutable',
  'parallel',
  'safe',
]);

/**
 * Validate slug format.
 * Only lowercase letters, numbers, and underscores.
 * Must start with a letter, max 100 chars, no SQL keywords.
 */
function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return false;
  }
  if (slug.length > 100) {
    return false;
  }
  if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
    return false;
  }
  if (SQL_RESERVED_KEYWORDS.has(slug)) {
    return false;
  }
  return true;
}

/**
 * Escape identifier for safe use in dynamic SQL.
 * Validates first, then double-quotes the identifier (PostgreSQL standard).
 * @throws {ValidationError} if identifier is invalid
 */
function escapeIdentifier(identifier) {
  if (!isValidSlug(identifier)) {
    throw new ValidationError(`Invalid identifier: ${identifier}`);
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Escape a dynamic table name with the data_ prefix.
 * Returns e.g. "data_kunden" (double-quoted).
 * @throws {ValidationError} if slug is invalid
 */
function escapeTableName(slug) {
  if (!isValidSlug(slug)) {
    throw new ValidationError(`Invalid table name: ${slug}`);
  }
  return `"data_${slug.replace(/"/g, '""')}"`;
}

module.exports = {
  SQL_RESERVED_KEYWORDS,
  isValidSlug,
  escapeIdentifier,
  escapeTableName,
};
