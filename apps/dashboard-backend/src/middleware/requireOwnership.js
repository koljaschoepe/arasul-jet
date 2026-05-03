/**
 * requireOwnership — Phase 1.1
 *
 * Verifiziert, dass der eingeloggte User die angefragte Resource besitzt
 * (oder Admin-Rolle hat). Gemeinsame Helpers für Routen-Audit.
 *
 * Verwendung in Routen:
 *
 *     const { requireResourceOwner } = require('../middleware/requireOwnership');
 *     router.get('/projects/:id',
 *       requireAuth,
 *       requireResourceOwner('projects'),
 *       asyncHandler(...));
 *
 * Tabelle muss eine Spalte `owner_id` haben (Migration 089).
 */

const db = require('../database');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

const TABLE_WHITELIST = new Set([
  'projects',
  'documents',
  'knowledge_spaces',
  'chat_conversations',
]);

const OWNER_COLUMN = {
  projects: 'owner_id',
  documents: 'owner_id',
  knowledge_spaces: 'owner_id',
  chat_conversations: 'user_id',
};

/**
 * Express-Middleware-Factory.
 *
 * @param {string} table - Tabellenname (whitelisted)
 * @param {string} [paramName='id'] - Name des req.params-Felds mit der Resource-ID
 * @returns Express-Middleware
 */
function requireResourceOwner(table, paramName = 'id') {
  if (!TABLE_WHITELIST.has(table)) {
    throw new Error(`requireResourceOwner: ${table} ist nicht whitelisted`);
  }
  const ownerCol = OWNER_COLUMN[table];

  return async function (req, res, next) {
    try {
      const resourceId = req.params[paramName];
      if (!resourceId) {return next(new NotFoundError('Resource ID fehlt'));}

      // Admins sehen alles. Sicherer Default: req.user muss durch requireAuth
      // gesetzt sein — wenn nicht, einfach 401.
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
      }
      if (req.user.role === 'admin') {return next();}

      const result = await db.query(
        `SELECT ${ownerCol} AS owner_id FROM ${table} WHERE id = $1 LIMIT 1`,
        [resourceId]
      );
      if (result.rows.length === 0) {return next(new NotFoundError('Resource nicht gefunden'));}
      if (result.rows[0].owner_id !== req.user.id) {
        return next(new ForbiddenError('Kein Zugriff auf diese Resource'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Helper für Listen-Endpoints: liefert WHERE-Fragment + Parameter, damit
 * Listen automatisch User-scoped werden.
 *
 *   const { whereOwn, params } = ownershipFilter('projects', req.user, 'p');
 *   db.query(`SELECT * FROM projects p WHERE ${whereOwn}`, params);
 *
 * Admins bekommen `1=1` (kein Filter).
 */
function ownershipFilter(table, user, alias = '') {
  if (!TABLE_WHITELIST.has(table)) {
    throw new Error(`ownershipFilter: ${table} ist nicht whitelisted`);
  }
  if (!user || !user.id) {
    return { whereOwn: '1=0', params: [] };
  }
  if (user.role === 'admin') {
    return { whereOwn: '1=1', params: [] };
  }
  const ownerCol = OWNER_COLUMN[table];
  const prefix = alias ? `${alias}.` : '';
  return {
    whereOwn: `${prefix}${ownerCol} = $1`,
    params: [user.id],
  };
}

/**
 * Liefert die Liste der knowledge_space-IDs, auf die der User Zugriff hat
 * (Owner ODER space_member ODER Admin).
 *
 * Admins bekommen NULL als Marker für "kein Filter / alle Spaces".
 *
 * @param {Object} user - req.user
 * @returns {Promise<string[]|null>} Array von Space-IDs, oder null bei Admin
 */
async function listAccessibleSpaceIds(user) {
  if (!user || !user.id) {return [];}
  if (user.role === 'admin') {return null;} // null = kein Filter

  const result = await db.query(`SELECT DISTINCT space_id FROM space_members WHERE user_id = $1`, [
    user.id,
  ]);
  return result.rows.map(r => r.space_id);
}

module.exports = {
  requireResourceOwner,
  ownershipFilter,
  listAccessibleSpaceIds,
};
