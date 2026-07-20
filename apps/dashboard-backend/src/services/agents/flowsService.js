/**
 * Flows-Service (Plan 010, Schritt 4)
 *
 * CRUD über die Tabelle flows (Migration 110), owner-scoped wie flowAgents.
 * Ein Fluss speichert einen Graphen (JSONB) aus Agenten- und Bedingungs-Knoten.
 * Zusätzlich: Prüfung, dass alle referenzierten Agenten dem Nutzer gehören.
 */

const db = require('../../database');
const { NotFoundError, ValidationError } = require('../../utils/errors');

function rowToFlow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    graph: row.graph || { nodes: [], edges: [] },
    scheduleCron: row.schedule_cron || null,
    hasRunToken: Boolean(row.run_token_hash),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listFlows(userId) {
  const result = await db.query(`SELECT * FROM flows WHERE user_id = $1 ORDER BY updated_at DESC`, [
    userId,
  ]);
  return result.rows.map(rowToFlow);
}

async function getFlow(id, userId) {
  const result = await db.query(`SELECT * FROM flows WHERE id = $1 AND user_id = $2`, [id, userId]);
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError('Fluss nicht gefunden');
  }
  return rowToFlow(row);
}

async function createFlow(userId, { name, description = '', graph = { nodes: [], edges: [] } }) {
  const result = await db.query(
    `INSERT INTO flows (user_id, name, description, graph)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING *`,
    [userId, name, description, JSON.stringify(graph)]
  );
  return rowToFlow(result.rows[0]);
}

async function updateFlow(id, userId, fields) {
  await getFlow(id, userId); // 404 wenn fremd/unbekannt

  const sets = [];
  const params = [];
  let i = 1;
  if (fields.name !== undefined) {
    sets.push(`name = $${i++}`);
    params.push(fields.name);
  }
  if (fields.description !== undefined) {
    sets.push(`description = $${i++}`);
    params.push(fields.description);
  }
  if (fields.graph !== undefined) {
    sets.push(`graph = $${i++}::jsonb`);
    params.push(JSON.stringify(fields.graph));
  }
  if (sets.length === 0) {
    return getFlow(id, userId);
  }
  sets.push(`updated_at = NOW()`);
  params.push(id, userId);
  const result = await db.query(
    `UPDATE flows SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    params
  );
  return rowToFlow(result.rows[0]);
}

async function deleteFlow(id, userId) {
  const result = await db.query(`DELETE FROM flows WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (result.rowCount === 0) {
    throw new NotFoundError('Fluss nicht gefunden');
  }
  return true;
}

/**
 * Sicherstellen, dass alle Agenten-IDs dem Nutzer gehören (sonst ValidationError).
 * Verhindert, dass ein Fluss fremde Agenten referenziert — bevor der Lauf startet.
 * @param {number[]} agentIds
 * @param {number} userId
 */
async function assertAgentsOwned(agentIds, userId) {
  const uniq = [...new Set(agentIds.map(Number).filter(Boolean))];
  if (uniq.length === 0) {
    return;
  }
  const result = await db.query(
    `SELECT id FROM flow_agents WHERE user_id = $1 AND id = ANY($2::bigint[])`,
    [userId, uniq]
  );
  const found = new Set(result.rows.map(r => Number(r.id)));
  const missing = uniq.filter(id => !found.has(id));
  if (missing.length > 0) {
    throw new ValidationError(
      `Der Fluss referenziert unbekannte oder fremde Agenten: ${missing.join(', ')}`
    );
  }
}

/** Letzten Lauf eines Flusses ersetzen (schlank: nur der letzte bleibt). */
async function persistFlowRun(flowId, userId, { trigger, status, input, output, error }) {
  await db.query(`DELETE FROM flow_runs WHERE flow_id = $1`, [flowId]);
  await db.query(
    `INSERT INTO flow_runs (flow_id, user_id, trigger, status, input, output, error, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [flowId, userId, trigger, status, input || '', output || '', error || null]
  );
}

module.exports = {
  listFlows,
  getFlow,
  createFlow,
  updateFlow,
  deleteFlow,
  assertAgentsOwned,
  persistFlowRun,
  _internals: { rowToFlow },
};
