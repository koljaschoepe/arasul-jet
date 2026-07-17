/**
 * Path-jail helper for the agent subsystem.
 *
 * Every filesystem access an agent performs (its own definition files and the
 * `dateien` tool) is confined to the workspace's on-disk `host_path`. This
 * helper resolves a caller-supplied relative path against that base and throws
 * a ValidationError if the result would escape the jail (via `..`, a symlink-y
 * absolute path, etc.). Callers must never touch the filesystem with a path
 * that did not pass through here.
 */

const path = require('path');
const { ValidationError } = require('../../utils/errors');

/**
 * Resolve `relPath` inside `baseDir`, guaranteeing the result stays within it.
 * @param {string} baseDir - The workspace root (host_path). Absolute.
 * @param {string} relPath - A path relative to the workspace. `.`/'' == root.
 * @returns {string} Absolute, jailed path.
 * @throws {ValidationError} if the path escapes the workspace.
 */
function resolveWithin(baseDir, relPath) {
  if (typeof baseDir !== 'string' || baseDir.length === 0) {
    throw new ValidationError('Workspace-Pfad fehlt');
  }
  const base = path.resolve(baseDir);
  const target = path.resolve(base, relPath || '.');
  const rel = path.relative(base, target);

  // rel === '' → target is the base itself (allowed).
  // A leading '..' segment or an absolute rel means the target escaped the base.
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ValidationError(`Pfad "${relPath}" liegt ausserhalb des Workspace`);
  }
  return target;
}

module.exports = { resolveWithin };
