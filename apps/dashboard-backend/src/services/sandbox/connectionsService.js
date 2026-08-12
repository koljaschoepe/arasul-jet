/**
 * Projekt-Verbindungen (Plan 017 Schritt 5).
 *
 * Pro Sandbox-Projekt hinterlegte externe Zugänge (`env`) und MCP-Server
 * (`mcp`). Der Geheimwert wird AES-256-GCM-verschlüsselt abgelegt (utils/
 * tokenCrypto, wie user_external_credentials) und NIE über die API
 * zurückgegeben — Aufrufer sehen nur Metadaten + „hat einen Wert".
 *
 * Beim Container-/Sitzungs-Start liefert `buildInjection` die Werte:
 *  - env-Verbindungen → `KEY=VALUE`-Paare (per Variablen-NAME referenzierbar)
 *  - mcp-Verbindungen → eine generierte `.mcp.json` (Claude Code) plus die
 *    Codex-MCP-Konfiguration; ihr optionaler Token wandert als Env unter
 *    `valueEnv` in die Umgebung, nie als Klartext in die Konfigdatei.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { NotFoundError, ConflictError } = require('../../utils/errors');
const { encryptToken, decryptToken } = require('../../utils/tokenCrypto');

// Defense in depth (die Schemas validieren schon beim Anlegen): ein MCP-Name
// bzw. Env-Name, der in generierte Konfig/Env fließt, muss sicher sein — sonst
// könnte er die TOML-/JSON-Struktur bzw. eine Env-Zeile aufbrechen.
const SAFE_MCP_NAME = /^[A-Za-z0-9_-]{1,60}$/;
const SAFE_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** DB-Zeile → API-Form. Der Geheimwert bleibt drin — nur Status nach außen. */
function toApi(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    kind: row.kind,
    config: row.config || {},
    hatWert: row.secret_encrypted != null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Alle Verbindungen eines Projekts (ohne Geheimwerte). */
async function listConnections(projectId) {
  const result = await db.query(
    `SELECT * FROM sandbox_project_connections WHERE project_id = $1 ORDER BY kind, name`,
    [projectId]
  );
  return result.rows.map(toApi);
}

/** Legt eine Verbindung an. */
async function createConnection(projectId, body, userId) {
  const config = {};
  if (body.kind === 'mcp') {
    config.command = body.command;
    config.args = body.args || [];
    if (body.valueEnv) {
      config.valueEnv = body.valueEnv;
    }
  }
  const secret = body.value != null && body.value.length > 0 ? encryptToken(body.value) : null;

  try {
    const result = await db.query(
      `INSERT INTO sandbox_project_connections (project_id, name, kind, config, secret_encrypted, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [projectId, body.name, body.kind, JSON.stringify(config), secret, userId || null]
    );
    logger.info(
      `Projekt-Verbindung angelegt: ${body.kind} "${body.name}" für Projekt ${projectId}`
    );
    return toApi(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      throw new ConflictError(`Eine Verbindung namens "${body.name}" existiert bereits`);
    }
    throw err;
  }
}

/** Aktualisiert Wert/Konfig einer Verbindung (Name + Art bleiben). */
async function updateConnection(projectId, connId, body) {
  const existing = await db.query(
    `SELECT * FROM sandbox_project_connections WHERE id = $1 AND project_id = $2`,
    [connId, projectId]
  );
  if (existing.rows.length === 0) {
    throw new NotFoundError('Verbindung nicht gefunden');
  }
  const row = existing.rows[0];
  const config = { ...(row.config || {}) };
  if (row.kind === 'mcp') {
    if (body.command !== undefined) {
      config.command = body.command;
    }
    if (body.args !== undefined) {
      config.args = body.args;
    }
    if (body.valueEnv !== undefined) {
      config.valueEnv = body.valueEnv;
    }
  }
  // Wert nur ersetzen, wenn einer mitkommt — sonst bleibt der alte erhalten.
  const secret =
    body.value != null && body.value.length > 0 ? encryptToken(body.value) : row.secret_encrypted;

  const result = await db.query(
    `UPDATE sandbox_project_connections
        SET config = $3, secret_encrypted = $4, updated_at = now()
      WHERE id = $1 AND project_id = $2
      RETURNING *`,
    [connId, projectId, JSON.stringify(config), secret]
  );
  return toApi(result.rows[0]);
}

/** Löscht eine Verbindung. */
async function deleteConnection(projectId, connId) {
  const result = await db.query(
    `DELETE FROM sandbox_project_connections WHERE id = $1 AND project_id = $2 RETURNING id`,
    [connId, projectId]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Verbindung nicht gefunden');
  }
  return { deleted: true, id: connId };
}

/**
 * Baut die Injektion für einen Container-/Sitzungs-Start:
 *  - `env`: `[{ name, value }]` — env-Verbindungen + die Token der MCP-Server
 *    (unter ihrem `valueEnv`-Namen). Der Aufrufer setzt sie per Variablen-NAME.
 *  - `mcpJson`: Inhalt für `/workspace/.mcp.json` (Claude Code), Server
 *    referenzieren Secrets nur über `${ENV}`-Platzhalter — nie im Klartext.
 *  - `codexToml`: MCP-Abschnitt für die Codex-Konfiguration (gleiche Server).
 * Leere Rückgaben, wenn das Projekt keine Verbindungen hat.
 */
async function buildInjection(projectId) {
  // Feste Reihenfolge (env vor mcp, dann Name): bei einer Namenskollision
  // zwischen einem env-Wert und dem valueEnv eines MCP-Servers ist das Ergebnis
  // sonst nicht-deterministisch (Env-Zuordnung könnte je Start kippen).
  const conns = await db.query(
    `SELECT * FROM sandbox_project_connections WHERE project_id = $1 ORDER BY kind, name`,
    [projectId]
  );
  const env = [];
  const mcpServers = {};
  const codexServers = [];

  for (const row of conns.rows) {
    const wert = row.secret_encrypted != null ? decryptToken(row.secret_encrypted) : null;
    if (row.kind === 'env') {
      if (!SAFE_ENV_NAME.test(row.name)) {
        logger.warn(`Verbindung "${row.name}" (${projectId}) übersprungen: unsicherer Env-Name`);
        continue;
      }
      if (wert != null) {
        env.push({ name: row.name, value: wert });
      }
      continue;
    }
    // mcp
    if (!SAFE_MCP_NAME.test(row.name)) {
      logger.warn(`MCP-Verbindung "${row.name}" (${projectId}) übersprungen: unsicherer Name`);
      continue;
    }
    const cfg = row.config || {};
    const envKey = cfg.valueEnv && SAFE_ENV_NAME.test(cfg.valueEnv) ? cfg.valueEnv : null;
    if (envKey && wert != null) {
      env.push({ name: envKey, value: wert });
    }
    const serverEnv = envKey ? { [envKey]: `\${${envKey}}` } : undefined;
    mcpServers[row.name] = {
      command: cfg.command,
      args: cfg.args || [],
      ...(serverEnv ? { env: serverEnv } : {}),
    };
    codexServers.push({
      name: row.name,
      command: cfg.command,
      args: cfg.args || [],
      envKey,
    });
  }

  const mcpJson =
    Object.keys(mcpServers).length > 0 ? JSON.stringify({ mcpServers }, null, 2) : null;

  // Codex liest MCP-Server aus ~/.codex/config.toml ([mcp_servers.<name>]).
  let codexToml = null;
  if (codexServers.length > 0) {
    codexToml = codexServers
      .map(s => {
        const args = (s.args || []).map(a => JSON.stringify(a)).join(', ');
        const envLine = s.envKey ? `\nenv = { "${s.envKey}" = "\${${s.envKey}}" }` : '';
        return `[mcp_servers.${s.name}]\ncommand = ${JSON.stringify(s.command)}\nargs = [${args}]${envLine}`;
      })
      .join('\n\n');
  }

  return { env, mcpJson, codexToml };
}

module.exports = {
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  buildInjection,
};
