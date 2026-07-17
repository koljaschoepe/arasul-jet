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

const fs = require('fs');
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

/**
 * Like `resolveWithin`, but ALSO defeats symlink escapes. The lexical check
 * above only inspects the string, so an agent that (via the `terminal` tool)
 * creates `escape.md -> /etc/shadow` inside the workspace could then read/write
 * it with the `dateien` tool — the symlink itself lives in the jail, but the
 * filesystem follows it out. This resolves the deepest EXISTING ancestor with
 * `realpath` (following every symlink) and re-checks containment, and rejects a
 * dangling symlink as the final component (which `realpath` cannot resolve).
 * Use this for every real filesystem access an agent triggers.
 *
 * @param {string} baseDir - Workspace root (host_path). Absolute, must exist.
 * @param {string} relPath - Path relative to the workspace.
 * @returns {string} Absolute, symlink-resolved, jailed path.
 * @throws {ValidationError} if the path escapes the workspace via any means.
 */
function resolveRealWithin(baseDir, relPath) {
  const target = resolveWithin(baseDir, relPath); // lexical jail first
  let realBase;
  try {
    realBase = fs.realpathSync(path.resolve(baseDir));
  } catch {
    throw new ValidationError('Workspace-Verzeichnis nicht gefunden');
  }

  const tail = [];
  let cur = target;
  for (;;) {
    let real;
    try {
      real = fs.realpathSync(cur);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // `cur` may itself be a DANGLING symlink (lstat succeeds, realpath ENOENTs) —
        // writing through it would follow it out of the jail.
        let lst = null;
        try {
          lst = fs.lstatSync(cur);
        } catch {
          lst = null;
        }
        if (lst && lst.isSymbolicLink()) {
          throw new ValidationError(`Pfad "${relPath}" ist ein Symlink aus dem Workspace heraus`);
        }
        const parent = path.dirname(cur);
        if (parent === cur) {
          break;
        } // reached FS root without an existing ancestor
        tail.unshift(path.basename(cur));
        cur = parent;
        continue;
      }
      throw new ValidationError(`Pfad "${relPath}" kann nicht aufgeloest werden`);
    }
    const full = tail.length ? path.join(real, ...tail) : real;
    const rel = path.relative(realBase, full);
    if (rel === '') {
      return full;
    }
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ValidationError(`Pfad "${relPath}" verlaesst den Workspace (Symlink)`);
    }
    return full;
  }
  // Base exists, so this is unreachable in practice — fail closed.
  throw new ValidationError(`Pfad "${relPath}" kann nicht aufgeloest werden`);
}

module.exports = { resolveWithin, resolveRealWithin };
