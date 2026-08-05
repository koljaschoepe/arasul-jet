/**
 * External Credentials Service (Plan 008, Schritt 14)
 *
 * Persistiert die Login-Credentials externer CLIs (v1: Claude Code) pro Nutzer
 * VERSCHLÜSSELT in der DB, damit ein einmaliger Login in einem Sandbox-Terminal
 * einen `docker compose up -d --build` (Container-Neubau) überlebt — ohne
 * zweite Anmeldung.
 *
 * Zwei Ebenen:
 *   1. Reines Credential-CRUD (save/load/has/delete) — verschlüsselt via
 *      utils/tokenCrypto.js (AES-256-GCM, Schlüssel aus JWT_SECRET). Der
 *      Blob (IV || AuthTag || Ciphertext) landet als BYTEA in
 *      user_external_credentials (Migration 107).
 *   2. Container-Anbindung (captureClaudeLogin/restoreClaudeLogin) — liest bzw.
 *      schreibt die Claude-Code-Credential-Dateien im Workspace-Container per
 *      nicht-interaktivem `docker exec` (gleicher dockerode-Client wie die
 *      übrigen Sandbox-Services).
 *
 * WARUM tokenCrypto und nicht cryptoService: tokenCrypto liefert einen EINZIGEN
 * Buffer (IV||AuthTag||Ciphertext), der 1:1 in eine BYTEA-Spalte passt.
 * cryptoService gibt ein {encrypted, iv, authTag}-Triple zurück, das drei
 * Spalten bräuchte — schlechterer Fit für einen einzelnen verschlüsselten Blob.
 * Der Plan gibt tokenCrypto ohnehin den Vorzug.
 *
 * Sicherheit: Rohe Credential-Bytes werden NIE geloggt oder aus den
 * öffentlichen Funktionen zurückgegeben (nur boolesche/Zähl-Ergebnisse bzw. das
 * entschlüsselte Objekt an den vertrauenswürdigen Aufrufer).
 */

const { Writable } = require('stream');
const db = require('../../database');
const logger = require('../../utils/logger');
const { docker } = require('../core/docker');
const { encryptToken, decryptToken } = require('../../utils/tokenCrypto');

// Provider-Kennung für Claude Code.
const PROVIDER_CLAUDE = 'claude';

// Wall-clock-Limit für die Credential-exec-Aufrufe im Container.
const EXEC_TIMEOUT_MS = parseInt(process.env.CLAUDE_LOGIN_EXEC_TIMEOUT_MS || '15000', 10);

// Obergrenze für eingelesene Credential-Dateien (Schutz gegen ein aufgeblähtes
// ~/.claude.json). 2 MiB ist großzügig für Token-/Config-JSON.
const MAX_CRED_FILE_BYTES = 2 * 1024 * 1024;

// Die Dateien, die die Claude-Code-CLI im HOME des Container-Users ablegt.
// Pfade sind relativ zu $HOME (im Container ausgewertet — robust gegenüber dem
// konkreten Home-Verzeichnis des Sandbox-Users). `.credentials.json` trägt die
// OAuth-Tokens und ist für einen erfolgreichen Capture erforderlich;
// `.claude.json` (Account/Config-State) wird mitgenommen, falls vorhanden.
const CLAUDE_CRED_FILES = [
  { rel: '.claude/.credentials.json', required: true },
  { rel: '.claude.json', required: false },
];

// ============================================================================
// Credential-CRUD (verschlüsselt)
// ============================================================================

/**
 * Credentials eines Nutzers für einen Provider speichern (Upsert).
 * @param {number} userId
 * @param {string} provider
 * @param {object} credsObject - beliebiges JSON-serialisierbares Objekt.
 * @returns {Promise<{provider:string, updatedAt:string}>}
 */
async function saveCredentials(userId, provider, credsObject) {
  if (!userId) {
    throw new Error('userId ist erforderlich');
  }
  if (!provider) {
    throw new Error('provider ist erforderlich');
  }
  const json = JSON.stringify(credsObject ?? {});
  const encrypted = encryptToken(json);

  const result = await db.query(
    `INSERT INTO user_external_credentials (user_id, provider, encrypted_credentials, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, provider)
     DO UPDATE SET encrypted_credentials = EXCLUDED.encrypted_credentials, updated_at = NOW()
     RETURNING provider, updated_at`,
    [userId, provider, encrypted]
  );
  return {
    provider: result.rows[0].provider,
    updatedAt: result.rows[0].updated_at,
  };
}

/**
 * Credentials laden und entschlüsseln.
 * @param {number} userId
 * @param {string} provider
 * @returns {Promise<object|null>} das ursprüngliche Objekt oder null, wenn keins.
 */
async function loadCredentials(userId, provider) {
  if (!userId || !provider) {
    return null;
  }
  const result = await db.query(
    `SELECT encrypted_credentials
       FROM user_external_credentials
      WHERE user_id = $1 AND provider = $2
      LIMIT 1`,
    [userId, provider]
  );
  const row = result.rows[0];
  if (!row || !row.encrypted_credentials) {
    return null;
  }
  // pg liefert BYTEA als Buffer.
  const buf = Buffer.isBuffer(row.encrypted_credentials)
    ? row.encrypted_credentials
    : Buffer.from(row.encrypted_credentials);
  const json = decryptToken(buf);
  if (json == null) {
    return null;
  }
  return JSON.parse(json);
}

/**
 * Prüfen, ob für (userId, provider) Credentials hinterlegt sind.
 * @returns {Promise<boolean>}
 */
async function hasCredentials(userId, provider) {
  if (!userId || !provider) {
    return false;
  }
  const result = await db.query(
    `SELECT 1 FROM user_external_credentials
      WHERE user_id = $1 AND provider = $2
      LIMIT 1`,
    [userId, provider]
  );
  return result.rows.length > 0;
}

/**
 * Credentials löschen.
 * @returns {Promise<boolean>} true, wenn eine Zeile entfernt wurde.
 */
async function deleteCredentials(userId, provider) {
  if (!userId || !provider) {
    return false;
  }
  const result = await db.query(
    `DELETE FROM user_external_credentials
      WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );
  return result.rowCount > 0;
}

// ============================================================================
// Container-Anbindung (docker exec)
// ============================================================================

// POSIX single-quote-Literal (jedes ' → '\'') — sicher innerhalb sh -c '...'.
function shellSingleQuote(str) {
  return `'${String(str).replace(/'/g, "'\\''")}'`;
}

/**
 * Nicht-interaktiver docker exec, der stdout/stderr demultiplext einsammelt.
 * Wirft nie in den Aufrufer hinein wegen eines abwesenden/gestoppten
 * Containers — solche Fälle liefert der Aufrufer selbst als „nichts getan".
 * @returns {Promise<{stdout:string, stderr:string, exitCode:number|null}>}
 */
async function runExec(target, cmd) {
  const container = docker.getContainer(target);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const stream = await exec.start({ hijack: true, stdin: false });

  const stdoutChunks = [];
  const stderrChunks = [];
  let stdoutBytes = 0;
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      if (stdoutBytes < MAX_CRED_FILE_BYTES) {
        stdoutChunks.push(chunk);
        stdoutBytes += chunk.length;
      }
      cb();
    },
  });
  const stderr = new Writable({
    write(chunk, _enc, cb) {
      stderrChunks.push(chunk);
      cb();
    },
  });
  docker.modem.demuxStream(stream, stdout, stderr);

  await new Promise((resolve, reject) => {
    let settled = false;
    const done = err => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };
    const timer = setTimeout(() => {
      try {
        stream.destroy();
      } catch {
        /* ignore */
      }
      done(new Error(`exec timeout after ${EXEC_TIMEOUT_MS}ms`));
    }, EXEC_TIMEOUT_MS);
    stream.on('end', () => done());
    stream.on('error', done);
  });

  let exitCode = null;
  try {
    const info = await exec.inspect();
    exitCode = info.ExitCode;
  } catch {
    /* exit code is best-effort */
  }

  return {
    stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    stderr: Buffer.concat(stderrChunks).toString('utf8'),
    exitCode,
  };
}

// Zielcontainer-Referenz aus einem Workspace-Row bestimmen.
function containerTarget(workspace) {
  return (workspace && (workspace.container_id || workspace.container_name)) || null;
}

/**
 * Claude-Login aus einem laufenden Workspace-Container einfangen und
 * verschlüsselt speichern. No-op (kein Wurf), wenn die Datei(en) fehlen oder
 * der Container nicht erreichbar ist.
 *
 * @param {number} userId
 * @param {object} workspace - sandbox_projects-Row (container_id/container_name).
 * @returns {Promise<{captured:boolean, files?:string[], reason?:string}>}
 */
async function captureClaudeLogin(userId, workspace) {
  const target = containerTarget(workspace);
  if (!target) {
    return { captured: false, reason: 'no_container' };
  }

  const captured = {};
  const capturedNames = [];
  try {
    for (const file of CLAUDE_CRED_FILES) {
      // `cat` gibt bei fehlender Datei nichts auf stdout (Fehler → stderr,
      // 2>/dev/null unterdrückt); leere Ausgabe ⇒ Datei fehlt/leer.
      const cmd = ['/bin/sh', '-c', `cat "$HOME/${file.rel}" 2>/dev/null`];
      const { stdout } = await runExec(target, cmd);
      const content = stdout;
      if (content && content.trim().length > 0) {
        captured[file.rel] = content;
        capturedNames.push(file.rel);
      }
    }
  } catch (err) {
    logger.warn(`captureClaudeLogin: exec fehlgeschlagen (${target}): ${err.message}`);
    return { captured: false, reason: 'exec_failed' };
  }

  const requiredMissing = CLAUDE_CRED_FILES.some(f => f.required && !captured[f.rel]);
  if (requiredMissing) {
    // Nichts (Brauchbares) gefunden — Nutzer war (noch) nicht eingeloggt.
    return { captured: false, reason: 'no_credentials' };
  }

  await saveCredentials(userId, PROVIDER_CLAUDE, { files: captured });
  logger.info(`Claude-Login für User ${userId} eingefangen (${capturedNames.length} Datei(en))`);
  return { captured: true, files: capturedNames };
}

/**
 * Gespeicherten Claude-Login in einen laufenden Workspace-Container
 * zurückschreiben. No-op (kein Wurf), wenn keine Credentials hinterlegt sind
 * oder der Container nicht erreichbar ist.
 *
 * @param {number} userId
 * @param {object} workspace - sandbox_projects-Row (container_id/container_name).
 * @returns {Promise<{restored:boolean, files?:string[], reason?:string}>}
 */
async function restoreClaudeLogin(userId, workspace) {
  const target = containerTarget(workspace);
  if (!target) {
    return { restored: false, reason: 'no_container' };
  }

  let creds;
  try {
    creds = await loadCredentials(userId, PROVIDER_CLAUDE);
  } catch (err) {
    logger.warn(`restoreClaudeLogin: Laden fehlgeschlagen (User ${userId}): ${err.message}`);
    return { restored: false, reason: 'load_failed' };
  }
  const files = creds && creds.files;
  if (!files || Object.keys(files).length === 0) {
    return { restored: false, reason: 'no_credentials' };
  }

  const restoredNames = [];
  try {
    for (const rel of Object.keys(files)) {
      const content = files[rel];
      if (typeof content !== 'string' || content.length === 0) {
        continue;
      }
      // Inhalt base64-kodiert übergeben — base64 ist [A-Za-z0-9+/=], damit ist
      // das einzelne-Anführungszeichen-Literal garantiert sicher; im Container
      // dekodieren und schreiben. Verzeichnis anlegen, Perms auf 600 (Tokens!).
      const b64 = Buffer.from(content, 'utf8').toString('base64');
      const dest = `$HOME/${rel}`;
      const script =
        `set -e; ` +
        `dir=$(dirname "${dest}"); mkdir -p "$dir"; ` +
        `printf '%s' ${shellSingleQuote(b64)} | base64 -d > "${dest}"; ` +
        `chmod 600 "${dest}"`;
      const { exitCode } = await runExec(target, ['/bin/sh', '-c', script]);
      if (exitCode === 0 || exitCode == null) {
        restoredNames.push(rel);
      } else {
        logger.warn(`restoreClaudeLogin: Schreiben von ${rel} endete mit Exit ${exitCode}`);
      }
    }
  } catch (err) {
    logger.warn(`restoreClaudeLogin: exec fehlgeschlagen (${target}): ${err.message}`);
    return { restored: restoredNames.length > 0, files: restoredNames, reason: 'exec_failed' };
  }

  if (restoredNames.length === 0) {
    return { restored: false, reason: 'write_failed' };
  }
  logger.info(
    `Claude-Login für User ${userId} in Container wiederhergestellt (${restoredNames.length} Datei(en))`
  );
  return { restored: true, files: restoredNames };
}

/**
 * Best-effort-Wrapper für den Container-Start-Pfad: stellt den Claude-Login
 * wieder her, ohne jemals zu werfen (ein Restore-Fehler darf den Terminal-Start
 * nicht blockieren).
 */
async function restoreClaudeLoginBestEffort(userId, workspace) {
  try {
    return await restoreClaudeLogin(userId, workspace);
  } catch (err) {
    logger.warn(`restoreClaudeLoginBestEffort: unterdrückter Fehler: ${err.message}`);
    return { restored: false, reason: 'error' };
  }
}

// ============================================================================
// Zentraler KI-Zugang (Plan 013, 2026-07-28)
// ============================================================================
// Statt sich in JEDER Sandbox einzeln im Terminal anzumelden (kaputter OAuth-
// Link), hinterlegt der Admin EINMAL zentral einen Zugang — entweder ein Abo-
// Langzeit-Token (`claude setup-token` → CLAUDE_CODE_OAUTH_TOKEN, headless, 1 Jahr)
// oder einen API-Key (ANTHROPIC_API_KEY, Abrechnung pro Nutzung). Der Wert wird
// verschlüsselt gespeichert (eigener Provider, getrennt vom eingefangenen
// Terminal-Login) und in JEDE Sandbox als Umgebungsvariable gebracht: beim
// Container-Start über die Container-Env, in laufenden Containern über eine aus
// `.bashrc` gesourcte Profildatei. So ist `claude` sofort angemeldet — ohne
// interaktiven Login.

const PROVIDER_CENTRAL = 'claude-central';
const AUTH_FILE = '.arasul-claude-auth.sh';
const SOURCE_LINE = `[ -f "$HOME/${AUTH_FILE}" ] && . "$HOME/${AUTH_FILE}"`;

/** Umgebungsvariable je Zugangsart. */
function envVarForMode(mode) {
  return mode === 'apikey' ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN';
}

/** Zentralen Zugang setzen (mode: 'token' = Abo, 'apikey' = API). */
async function setCentralAuth(userId, mode, value) {
  const m = mode === 'apikey' ? 'apikey' : 'token';
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('value ist erforderlich');
  }
  await saveCredentials(userId, PROVIDER_CENTRAL, { mode: m, value: value.trim() });
  return { mode: m };
}

/** Zentralen Zugang laden (inkl. Wert — nur für Injektion, NIE an den Client). */
async function getCentralAuth(userId) {
  const c = await loadCredentials(userId, PROVIDER_CENTRAL);
  if (!c) {
    return null;
  }
  // OAuth-Bündel (Dashboard-Login-Handshake): der Access-Token ist der injizierte
  // Wert; Refresh-Token + Ablauf bleiben im Tresor und werden hier NICHT an den
  // Injektions-Pfad durchgereicht (nur der reine CLAUDE_CODE_OAUTH_TOKEN).
  if (c.mode === 'oauth') {
    if (typeof c.accessToken !== 'string' || c.accessToken.length === 0) {
      return null;
    }
    return { mode: 'oauth', value: c.accessToken, expiresAt: c.expiresAt || null };
  }
  if (typeof c.value !== 'string' || c.value.length === 0) {
    return null;
  }
  return { mode: c.mode === 'apikey' ? 'apikey' : 'token', value: c.value };
}

/** Status für den Client — OHNE den Geheimwert. */
async function getCentralAuthStatus(userId) {
  const c = await getCentralAuth(userId);
  if (!c) {
    return { configured: false, mode: null };
  }
  return {
    configured: true,
    mode: c.mode,
    ...(c.mode === 'oauth' ? { expiresAt: c.expiresAt } : {}),
  };
}

/** Zentralen Zugang löschen. */
async function deleteCentralAuth(userId) {
  return deleteCredentials(userId, PROVIDER_CENTRAL);
}

/**
 * Env-Objekt für die Container-Env (createContainer) — leer, wenn kein zentraler
 * Zugang hinterlegt ist. In `docker exec`-Shells (Terminal) sichtbar, damit
 * `claude` in einer frischen Sandbox sofort angemeldet ist.
 */
async function getCentralAuthEnv(userId) {
  const c = await getCentralAuth(userId);
  if (!c) {
    return {};
  }
  return { [envVarForMode(c.mode)]: c.value };
}

/**
 * Den zentralen Zugang in einen LAUFENDEN Container schreiben (bzw. entfernen):
 * eine aus `.bashrc` gesourcte Profildatei, damit auch bestehende Sandboxes den
 * Zugang in neuen Shells bekommen — ohne Neubau. `auth === null` leert die Datei.
 */
async function applyCentralAuthToContainer(target, auth) {
  const content = auth
    ? `export ${envVarForMode(auth.mode)}=${shellSingleQuote(auth.value)}\n`
    : '';
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  const script =
    `set -e; ` +
    `printf '%s' ${shellSingleQuote(b64)} | base64 -d > "$HOME/${AUTH_FILE}"; ` +
    `chmod 600 "$HOME/${AUTH_FILE}"; ` +
    `touch "$HOME/.bashrc"; ` +
    `grep -qF ${shellSingleQuote(AUTH_FILE)} "$HOME/.bashrc" || echo ${shellSingleQuote(SOURCE_LINE)} >> "$HOME/.bashrc"`;
  await runExec(target, ['/bin/sh', '-c', script]);
}

/** Best-effort-Anwendung auf einen Workspace-Container (Start-Pfad). */
async function applyCentralAuthBestEffort(userId, workspace) {
  try {
    const target = containerTarget(workspace);
    if (!target) {
      return;
    }
    const auth = await getCentralAuth(userId);
    await applyCentralAuthToContainer(target, auth);
  } catch (err) {
    logger.warn(`applyCentralAuthBestEffort: unterdrückter Fehler: ${err.message}`);
  }
}

/** Zentralen Zugang auf ALLE laufenden Container des Nutzers anwenden (bei Änderung). */
async function applyCentralAuthToUserContainers(userId) {
  const rows = (
    await db.query(
      `SELECT container_id, container_name FROM sandbox_projects
        WHERE user_id = $1 AND container_status = 'running' AND container_id IS NOT NULL`,
      [userId]
    )
  ).rows;
  for (const w of rows) {
    await applyCentralAuthBestEffort(userId, w);
  }
  return rows.length;
}

module.exports = {
  saveCredentials,
  loadCredentials,
  hasCredentials,
  deleteCredentials,
  captureClaudeLogin,
  restoreClaudeLogin,
  restoreClaudeLoginBestEffort,
  PROVIDER_CLAUDE,
  // Zentraler KI-Zugang.
  setCentralAuth,
  getCentralAuth,
  getCentralAuthStatus,
  deleteCentralAuth,
  getCentralAuthEnv,
  applyCentralAuthBestEffort,
  applyCentralAuthToUserContainers,
  PROVIDER_CENTRAL,
  // Für Tests / Wiederverwendung.
  _internals: { CLAUDE_CRED_FILES, shellSingleQuote, envVarForMode, AUTH_FILE },
};
