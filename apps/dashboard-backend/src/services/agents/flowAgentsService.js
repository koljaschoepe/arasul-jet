/**
 * Flow-Agents-Service (Plan 010, Schritt 2)
 *
 * CRUD über die Tabelle flow_agents (Migration 110). Ein Flow-Agent gehört
 * genau einem Nutzer (flow_agents.user_id); Zugriff ist owner-scoped — ein
 * fremder oder unbekannter Agent liefert einheitlich NotFoundError (leakt nie
 * die Existenz). Reine async-Funktionen, direkt über db.query (Muster wie
 * providerKeysService).
 *
 * allow_external (Netz-/Cloud-Tools freischalten) darf nur ein Admin auf true
 * setzen — die Tool-Wirkung folgt in Schritt 3, das Rechte-Gate steht aber
 * bereits hier.
 */

const db = require('../../database');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { PROVIDERS } = require('./providerRegistry');

const VALID_PROVIDERS = Object.values(PROVIDERS);

// Zeilen-Shape → API-Shape (camelCase, tools als Array).
function rowToAgent(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    provider: row.provider,
    model: row.model,
    tools: Array.isArray(row.tools) ? row.tools : [],
    allowExternal: row.allow_external,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertProvider(provider) {
  if (!VALID_PROVIDERS.includes(provider)) {
    throw new ValidationError(
      `Unbekannter Provider "${provider}" (erlaubt: ${VALID_PROVIDERS.join(', ')})`
    );
  }
}

// allow_external nur für Admins; ein Nicht-Admin darf es nicht auf true setzen.
function resolveAllowExternal(requested, userRole) {
  if (requested === true && userRole !== 'admin') {
    throw new ValidationError('Nur Admins dürfen externe Tools (allow_external) freischalten');
  }
  return requested === true;
}

/**
 * Alle Agenten des Nutzers auflisten (neueste zuerst).
 * @param {number} userId
 * @returns {Promise<Array>}
 */
async function listAgents(userId) {
  const result = await db.query(
    `SELECT * FROM flow_agents WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows.map(rowToAgent);
}

/**
 * Einen Agenten des Nutzers laden. Fremd/unbekannt → NotFoundError.
 * @param {number} id
 * @param {number} userId
 * @returns {Promise<object>}
 */
async function getAgent(id, userId) {
  const result = await db.query(`SELECT * FROM flow_agents WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError('Agent nicht gefunden');
  }
  return rowToAgent(row);
}

/**
 * Neuen Agenten anlegen.
 * @param {number} userId
 * @param {string} userRole
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createAgent(userId, userRole, fields) {
  const {
    name,
    description = '',
    systemPrompt = '',
    provider = 'ollama',
    model = '',
    tools = [],
    allowExternal = false,
  } = fields;
  assertProvider(provider);
  const allow = resolveAllowExternal(allowExternal, userRole);

  const result = await db.query(
    `INSERT INTO flow_agents (user_id, name, description, system_prompt, provider, model, tools, allow_external)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING *`,
    [userId, name, description, systemPrompt, provider, model, JSON.stringify(tools), allow]
  );
  return rowToAgent(result.rows[0]);
}

/**
 * Einen Agenten aktualisieren (nur gesetzte Felder). Fremd/unbekannt → 404.
 * @param {number} id
 * @param {number} userId
 * @param {string} userRole
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function updateAgent(id, userId, userRole, fields) {
  // Existenz + Ownership sicherstellen (wirft 404).
  await getAgent(id, userId);

  const sets = [];
  const params = [];
  let i = 1;
  const push = (col, val) => {
    sets.push(`${col} = $${i++}`);
    params.push(val);
  };

  if (fields.name !== undefined) {
    push('name', fields.name);
  }
  if (fields.description !== undefined) {
    push('description', fields.description);
  }
  if (fields.systemPrompt !== undefined) {
    push('system_prompt', fields.systemPrompt);
  }
  if (fields.provider !== undefined) {
    assertProvider(fields.provider);
    push('provider', fields.provider);
  }
  if (fields.model !== undefined) {
    push('model', fields.model);
  }
  if (fields.tools !== undefined) {
    sets.push(`tools = $${i++}::jsonb`);
    params.push(JSON.stringify(fields.tools));
  }
  if (fields.allowExternal !== undefined) {
    push('allow_external', resolveAllowExternal(fields.allowExternal, userRole));
  }

  if (sets.length === 0) {
    return getAgent(id, userId);
  }
  sets.push(`updated_at = NOW()`);
  params.push(id, userId);

  const result = await db.query(
    `UPDATE flow_agents SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    params
  );
  return rowToAgent(result.rows[0]);
}

/**
 * Einen Agenten löschen. Fremd/unbekannt → 404.
 * @param {number} id
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
async function deleteAgent(id, userId) {
  const result = await db.query(`DELETE FROM flow_agents WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
  if (result.rowCount === 0) {
    throw new NotFoundError('Agent nicht gefunden');
  }
  return true;
}

module.exports = {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  // Für Tests / Wiederverwendung.
  _internals: { rowToAgent },
};
