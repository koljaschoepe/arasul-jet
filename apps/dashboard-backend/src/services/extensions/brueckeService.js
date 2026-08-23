/**
 * KI-Brücke (Plan 017 Schritt 2) — der kontrollierte Draht zwischen einer live
 * geschalteten Erweiterung (App im abgeriegelten iframe, opaker Origin) und der
 * lokalen Basis (LLM, RAG, Dateien, n8n-Flows).
 *
 * Sicherheitsmodell:
 *  - Das Dashboard (authentifizierte Eltern-Seite) holt per
 *    `POST /api/extensions/:id/bruecke/token` einen kurzlebigen, pro
 *    Erweiterung gescopten Token und reicht ihn der App per postMessage.
 *  - Die App ruft die Brücken-Routen mit `Authorization: Bearer <token>` auf.
 *    Cookies spielen keine Rolle (opaker Origin sendet keine mit; die
 *    CSRF-Schutzschicht bleibt für Cookie-Requests aktiv).
 *  - Das Backend prüft bei JEDEM Aufruf: Brücke aktiv (Env-Flag), Token gültig
 *    und zur Erweiterung passend, Erweiterung aktiviert, Fähigkeit im Schnitt
 *    deklariert ∩ freigegeben.
 *  - `EXTENSIONS_BRUECKE_ENABLED=false` ist der Notaus: alle Brücken-Routen
 *    antworten sofort mit 503, ohne Redeploy der Erweiterungen.
 *
 * Tokens leben nur im Speicher (Neustart = alle ungültig — die App holt sich
 * über die Eltern-Seite einfach einen neuen) und verfallen nach TOKEN_TTL_MS.
 */

const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const logger = require('../../utils/logger');
const {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} = require('../../utils/errors');

const TOKEN_TTL_MS_RAW = parseInt(process.env.EXTENSIONS_BRUECKE_TOKEN_TTL_MS || '900000', 10);
// Fail closed: ein kaputter Env-Wert (NaN) darf NICHT dazu führen, dass Tokens
// nie ablaufen (exp <= now ist für NaN immer false). Dann auf 15 min zurück.
const TOKEN_TTL_MS =
  Number.isFinite(TOKEN_TTL_MS_RAW) && TOKEN_TTL_MS_RAW > 0 ? TOKEN_TTL_MS_RAW : 900000; // 15 min
const MAX_TOKENS = 500;

// token → { extensionId, userId, exp }
const tokens = new Map();

/** Notaus-Flag — zur Laufzeit gelesen, damit Tests und .env-Änderungen greifen. */
function istAktiv() {
  return process.env.EXTENSIONS_BRUECKE_ENABLED !== 'false';
}

function aufraeumen() {
  const now = Date.now();
  for (const [t, e] of tokens.entries()) {
    if (e.exp <= now) {
      tokens.delete(t);
    }
  }
  // Harte Obergrenze gegen Token-Fluten: älteste zuerst verwerfen.
  if (tokens.size > MAX_TOKENS) {
    const sortiert = [...tokens.entries()].sort((a, b) => a[1].exp - b[1].exp);
    for (const [t] of sortiert.slice(0, tokens.size - MAX_TOKENS)) {
      tokens.delete(t);
    }
  }
}

/**
 * Gibt einen frischen Brücken-Token für eine aktivierte Erweiterung aus.
 * Aufrufer ist die authentifizierte Dashboard-Seite (requireAuth in der Route).
 */
async function issueToken(extensionId, userId) {
  if (!istAktiv()) {
    throw new ServiceUnavailableError('Die KI-Brücke ist auf diesem Gerät deaktiviert');
  }
  const extensionService = require('./extensionService');
  const ext = await extensionService.getExtension(extensionId);
  if (!ext.enabled) {
    // Eine deaktivierte Erweiterung ist ein NORMALER, erwarteter Zustand
    // (ein wiederhergestellter Tab kann auf eine inzwischen deaktivierte App
    // zeigen — siehe Datei-Header). Deshalb KEIN 400 werfen: das erschiene als
    // roter Konsolen-Fehler im Browser (F-02). Stattdessen eine reguläre
    // „kein Token"-Antwort — die App bleibt dann einfach ohne Brücke.
    return { token: null, enabled: false, expiresInMs: 0, faehigkeiten: [] };
  }
  aufraeumen();
  const token = crypto.randomBytes(32).toString('base64url');
  tokens.set(token, { extensionId, userId: userId ?? null, exp: Date.now() + TOKEN_TTL_MS });
  return {
    token,
    expiresInMs: TOKEN_TTL_MS,
    faehigkeiten: ext.faehigkeiten.wirksam,
  };
}

/**
 * Prüft Token + Fähigkeit für einen Brücken-Aufruf und liefert die Erweiterung.
 * Wirft 503 (Brücke aus), 401 (Token fehlt/ungültig/abgelaufen/falsche
 * Erweiterung) oder 403 (Fähigkeit nicht freigegeben).
 */
async function autorisieren(extensionId, bearerToken, faehigkeit) {
  if (!istAktiv()) {
    throw new ServiceUnavailableError('Die KI-Brücke ist auf diesem Gerät deaktiviert');
  }
  if (!bearerToken) {
    throw new UnauthorizedError('Brücken-Token fehlt');
  }
  const eintrag = tokens.get(bearerToken);
  if (!eintrag || eintrag.exp <= Date.now()) {
    tokens.delete(bearerToken);
    throw new UnauthorizedError('Brücken-Token ungültig oder abgelaufen');
  }
  if (eintrag.extensionId !== extensionId) {
    throw new UnauthorizedError('Brücken-Token gehört zu einer anderen Erweiterung');
  }
  const extensionService = require('./extensionService');
  const ext = await extensionService.getExtension(extensionId);
  if (!ext.enabled) {
    throw new ForbiddenError(`Erweiterung "${extensionId}" ist deaktiviert`);
  }
  if (faehigkeit && !ext.faehigkeiten.wirksam.includes(faehigkeit)) {
    throw new ForbiddenError(
      `Fähigkeit "${faehigkeit}" ist für "${extensionId}" nicht freigegeben`
    );
  }
  return { extension: ext, userId: eintrag.userId };
}

// ============================================================================
// Fähigkeit: llm — eine gestreamte Antwort des lokalen Modells (SSE)
// ============================================================================

const LLM_SERVICE_URL = require('../../config/services').llm.url;

/**
 * Streamt eine LLM-Antwort als Server-Sent-Events in die Response:
 *   data: {"delta":"…"}   pro Text-Stück
 *   data: {"done":true}   am Ende
 * Läuft unter der EINEN GPU-Sperre (gpuQueue) — Chat, Flows und Brücke
 * treffen nie gleichzeitig auf die GPU.
 */
async function llmStream({ prompt, system = '', temperature = 0.7 }, res) {
  const { withGpuLock } = require('../flows/gpuQueue');
  const modelService = require('../llm/modelService');
  const db = require('../../database');

  const catalogModelId = await modelService.getDefaultModel();
  if (!catalogModelId) {
    throw new ServiceUnavailableError('Kein LLM-Modell geladen');
  }
  let ollamaName = catalogModelId;
  try {
    const r = await db.query(
      `SELECT COALESCE(ollama_name, id) AS n FROM llm_model_catalog WHERE id = $1`,
      [catalogModelId]
    );
    if (r.rows.length > 0) {
      ollamaName = r.rows[0].n;
    }
  } catch (err) {
    logger.warn(`Brücke/llm: ollama_name für ${catalogModelId} nicht auflösbar: ${err.message}`);
  }

  const { initSSE, trackConnection } = require('../../utils/sseHelper');
  initSSE(res);
  // trackConnection hängt den res-'error'-Listener an (sonst reißt ein
  // Schreibfehler nach Client-Disconnect als unhandled EventEmitter-Error den
  // ganzen Prozess über uncaughtException herunter — DoS aus dem iframe).
  const conn = trackConnection(res);
  const sicherSchreiben = frame => {
    if (conn.isConnected() && !res.writableEnded) {
      res.write(frame);
    }
  };

  const messages = [];
  if (system) {
    messages.push({ role: 'system', content: String(system) });
  }
  messages.push({ role: 'user', content: String(prompt) });

  await withGpuLock(
    () =>
      new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: ollamaName,
          messages,
          stream: true,
          options: { temperature },
        });
        const url = new URL('/api/chat', LLM_SERVICE_URL);
        const { ollamaAgent, OLLAMA_AGENT_TIMEOUT_MS } = require('../llm/ollamaAgent');
        const req = http.request(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
            // Ohne eigenen Agenten gilt Nodes globaler, und der zerstoert den
            // Sockel nach fuenf Sekunden Stille. Bis zum ersten Token eines
            // 27B-Modells vergeht regelmaessig mehr. Siehe ollamaAgent.js.
            agent: ollamaAgent,
            timeout: OLLAMA_AGENT_TIMEOUT_MS,
          },
          up => {
            let puffer = '';
            up.on('data', chunk => {
              // Client weg → nichts mehr lesen/schreiben, Upstream abbrechen.
              if (!conn.isConnected()) {
                req.destroy();
                return;
              }
              puffer += chunk.toString('utf8');
              let nl;
              while ((nl = puffer.indexOf('\n')) >= 0) {
                const zeile = puffer.slice(0, nl).trim();
                puffer = puffer.slice(nl + 1);
                if (!zeile) {
                  continue;
                }
                try {
                  const parsed = JSON.parse(zeile);
                  const delta = parsed?.message?.content || '';
                  if (delta) {
                    sicherSchreiben(`data: ${JSON.stringify({ delta })}\n\n`);
                  }
                  if (parsed?.done) {
                    sicherSchreiben(`data: ${JSON.stringify({ done: true })}\n\n`);
                  }
                } catch {
                  // halbe Zeile / kein JSON — beim nächsten Chunk erneut
                }
              }
            });
            up.on('end', resolve);
            up.on('error', reject);
          }
        );
        req.on('error', reject);
        // Client weg → Upstream abbrechen, GPU-Sperre freigeben.
        res.on('close', () => req.destroy());
        req.end(body);
      })
  ).catch(err => {
    // Header sind raus — Fehler als SSE-Frame melden statt über den
    // globalen Error-Handler (der ist nach gesendeten Headern ein No-op).
    logger.warn(`Brücke/llm-Stream: ${err.message}`);
    sicherSchreiben(`data: ${JSON.stringify({ error: 'LLM nicht erreichbar' })}\n\n`);
  });
  if (!res.writableEnded) {
    res.end();
  }
}

// ============================================================================
// Fähigkeit: rag — Wissensbasis-Suche mit Quellen
// ============================================================================

const RAG_DEFAULT_LIMIT = 5;
const RAG_MAX_LIMIT = 15;
const RAG_SNIPPET_CHARS = 600;

async function ragSuche({ frage, anzahl }) {
  const ragCore = require('../rag/ragCore');
  const query = String(frage || '').trim();
  if (!query) {
    throw new ValidationError('"frage" darf nicht leer sein');
  }
  let limit = Number.parseInt(anzahl, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    limit = RAG_DEFAULT_LIMIT;
  }
  limit = Math.min(limit, RAG_MAX_LIMIT);

  const embedding = await ragCore.getEmbedding(query);
  const results = await ragCore.hybridSearch(query, embedding, limit, null);
  return (Array.isArray(results) ? results : []).map(r => {
    const payload = r.payload || {};
    const raw = String(payload.text || payload.content || '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      quelle: payload.document_name || payload.title || payload.document_id || 'Unbekannt',
      text: raw.length > RAG_SNIPPET_CHARS ? `${raw.slice(0, RAG_SNIPPET_CHARS)}…` : raw,
      score: typeof r.score === 'number' ? r.score : null,
    };
  });
}

// ============================================================================
// Fähigkeit: dateien — EIGENER Datentopf je Erweiterung, symlink-sicher
// ============================================================================
// Bewusst NICHT die Projektablage (/arasul/projects): eine Erweiterung darf nie
// quer auf Kundendaten anderer Projekte zugreifen. Jede Erweiterung bekommt
// ihren eigenen Ordner /arasul/extensions-data/<id> (compose-gemountet).

const EXTENSIONS_DATA_DIR = process.env.EXTENSIONS_DATA_DIR || '/arasul/extensions-data';
const DATEI_MAX_READ = 256 * 1024;
const DATEI_MAX_WRITE = 1024 * 1024;
const DATEI_MAX_LIST = 500;

/** Datentopf-Wurzel dieser Erweiterung (angelegt bei Bedarf). */
async function datenWurzel(extensionId) {
  const dir = path.join(EXTENSIONS_DATA_DIR, extensionId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function dateien(extensionId, { aktion, pfad, inhalt }) {
  const { resolveRealWithinRoots, assertFdWithinRoots } = require('../flows/pathSafe');
  const roots = [await datenWurzel(extensionId)];
  const rel = String(pfad || '.');

  switch (String(aktion || '')) {
    case 'list': {
      const dir = resolveRealWithinRoots(roots, rel);
      const dirents = await fsp.readdir(dir, { withFileTypes: true }).catch(err => {
        throw new NotFoundError(
          `Ordner nicht gefunden: ${err.code === 'ENOENT' ? rel : err.message}`
        );
      });
      return {
        eintraege: dirents.slice(0, DATEI_MAX_LIST).map(d => ({
          name: d.name,
          typ: d.isDirectory() ? 'ordner' : 'datei',
        })),
      };
    }
    case 'read': {
      // TOCTOU-sicher: mit O_NOFOLLOW öffnen, dann über den Deskriptor prüfen,
      // dass die geöffnete Datei wirklich im Datentopf liegt (wie in
      // services/flows/tools/dateien.js) — ein zwischengetauschter Symlink
      // lenkt den Zugriff sonst nach draußen.
      resolveRealWithinRoots(roots, rel); // Vorprüfung (wirft bei Ausbruch)
      const abs = path.join(roots[0], rel);
      let fd;
      try {
        fd = await fsp.open(abs, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      } catch (err) {
        if (err.code === 'ELOOP') {
          throw new ValidationError('Symlinks sind nicht erlaubt');
        }
        throw new NotFoundError(`Datei nicht gefunden: ${rel}`);
      }
      try {
        assertFdWithinRoots(roots, fd.fd, rel);
        const stat = await fd.stat();
        if (!stat.isFile()) {
          throw new ValidationError(`"${rel}" ist keine Datei`);
        }
        if (stat.size > DATEI_MAX_READ) {
          throw new ValidationError(
            `Datei zu groß (max. ${DATEI_MAX_READ / 1024} KB über die Brücke)`
          );
        }
        return { inhalt: await fd.readFile('utf8') };
      } finally {
        await fd.close();
      }
    }
    case 'write': {
      const text = String(inhalt ?? '');
      if (Buffer.byteLength(text) > DATEI_MAX_WRITE) {
        throw new ValidationError(`Inhalt zu groß (max. ${DATEI_MAX_WRITE / 1024} KB)`);
      }
      const name = path.basename(rel);
      if (!name || name === '.' || name === '..' || name.includes('/')) {
        throw new ValidationError('Ungültiger Dateiname');
      }
      // Eltern-Ordner symlink-sicher auflösen, dann per O_NOFOLLOW schreiben —
      // ein Symlink am Zielnamen darf den Schreibzugriff nicht nach außen lenken.
      const parent = resolveRealWithinRoots(roots, path.dirname(rel));
      const abs = path.join(parent, name);
      let fd;
      try {
        fd = await fsp.open(
          abs,
          fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW,
          0o644
        );
      } catch (err) {
        if (err.code === 'ELOOP') {
          throw new ValidationError('Symlinks sind nicht erlaubt');
        }
        throw err;
      }
      try {
        assertFdWithinRoots(roots, fd.fd, rel);
        await fd.truncate(0);
        await fd.writeFile(text, 'utf8');
      } finally {
        await fd.close();
      }
      return { geschrieben: true, pfad: rel };
    }
    default:
      throw new ValidationError('aktion muss list, read oder write sein');
  }
}

// ============================================================================
// Fähigkeit: flows — Flows auflisten, starten, Lauf-Status abfragen
// ============================================================================

async function flowsListe() {
  const flowRegistry = require('../flows/flowRegistry');
  const flows = await flowRegistry.listFlows();
  return (flows || []).map(f => ({
    name: f.name,
    beschreibung: f.beschreibung || f.description || '',
    argumente: f.argumente || [],
  }));
}

async function flowStarten({ name, args, userId }) {
  const flowRegistry = require('../flows/flowRegistry');
  const flowRunner = require('../flows/flowRunner');
  const { resolveArguments } = require('../flows/runFlow');

  const flow = await flowRegistry.loadFlow(name, {});
  resolveArguments(flow.argumente, args || {});
  const { runId } = await flowRunner.starten({
    flowName: name,
    args: args || {},
    userId,
    conversationId: null,
  });
  return { runId };
}

async function flowLauf({ runId, userId }) {
  const runStore = require('../flows/runStore');
  const run = await runStore.getRun({ runId, userId });
  if (!run) {
    throw new NotFoundError(`Lauf ${runId} nicht gefunden`);
  }
  return {
    runId: run.id,
    status: run.status,
    ergebnis: run.result || null,
    fehler: run.error || null,
  };
}

/** Nur für Tests. */
function _reset() {
  tokens.clear();
}

// --- Ausgehende Aufrufe (Plan 023 H1) ---------------------------------------

const NETZ_TIMEOUT_MS = parseInt(process.env.EXTENSIONS_NETZ_TIMEOUT_MS || '20000', 10);
const NETZ_MAX_ANTWORT = parseInt(process.env.EXTENSIONS_NETZ_MAX_ANTWORT || '1048576', 10);
const NETZ_METHODEN = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
/**
 * Kopfzeilen, die die Erweiterung NICHT setzen darf.
 *
 * `host` und `content-length` gehören der Verbindung, nicht dem Aufrufer. Und
 * ein selbst gesetzter `cookie` wäre der Weg, fremde Sitzungen mitzuschicken.
 */
const NETZ_VERBOTENE_KOEPFE = new Set(['host', 'content-length', 'connection', 'cookie']);

/**
 * Ein Aufruf nach draußen, an ein im Manifest deklariertes Ziel (Plan 023 H1).
 *
 * Drei Wände, in dieser Reihenfolge:
 *   1. Fähigkeit `netz` deklariert UND freigegeben (macht `autorisieren`)
 *   2. Adresse steht im Manifest unter `netz.ziele` (`pruefeZiel`)
 *   3. Der Name löst nicht ins eigene Netz auf (`pruefeAdresse`)
 *
 * Umleitungen werden NICHT verfolgt. Eine Umleitung ist eine zweite Adresse,
 * die niemand geprüft hat; wer ihr folgt, hebt Wand 2 und 3 auf. Die
 * Erweiterung bekommt Ziel und Status zurück und kann selbst entscheiden, ob
 * sie das neue Ziel aufrufen will — dann läuft es wieder durch alle drei.
 *
 * @returns {Promise<{status:number, kopf:object, rumpf:string, gekuerzt:boolean}>}
 */
async function netzAufruf(extensionId, manifest, { url, methode, kopf, rumpf }, deps = {}) {
  const { pruefeZiel, pruefeAdresse } = deps.netzZiele || require('./netzZiele');
  const holen = deps.fetch || globalThis.fetch;

  const ziel = pruefeZiel(url, manifest);
  const verfahren = String(methode || 'GET').toUpperCase();
  if (!NETZ_METHODEN.has(verfahren)) {
    throw new ValidationError(`Methode "${verfahren}" ist nicht erlaubt`);
  }
  const adressen = await pruefeAdresse(ziel.hostname, deps.aufloesen);

  const koepfe = {};
  for (const [k, v] of Object.entries(kopf || {})) {
    const klein = String(k).toLowerCase();
    if (NETZ_VERBOTENE_KOEPFE.has(klein)) {
      throw new ValidationError(`Kopfzeile "${k}" darf nicht gesetzt werden`);
    }
    koepfe[k] = String(v);
  }

  const abbruch = new AbortController();
  const uhr = setTimeout(() => abbruch.abort(), NETZ_TIMEOUT_MS);
  let antwort;
  try {
    antwort = await holen(ziel.toString(), {
      method: verfahren,
      headers: koepfe,
      body: verfahren === 'GET' || verfahren === 'DELETE' ? undefined : (rumpf ?? undefined),
      redirect: 'manual',
      signal: abbruch.signal,
    });
  } catch (err) {
    throw new ServiceUnavailableError(
      err.name === 'AbortError'
        ? `Das Ziel hat nicht innerhalb von ${Math.round(NETZ_TIMEOUT_MS / 1000)}s geantwortet`
        : `Aufruf fehlgeschlagen: ${err.message}`
    );
  } finally {
    clearTimeout(uhr);
  }

  const text = await antwort.text();
  const gekuerzt = text.length > NETZ_MAX_ANTWORT;
  const antwortKoepfe = {};
  antwort.headers?.forEach?.((v, k) => {
    antwortKoepfe[k] = v;
  });

  logger.info(
    `Bruecke netz: ${extensionId} -> ${verfahren} ${ziel.origin}${ziel.pathname} ` +
      `(${antwort.status}, ${adressen[0]})`
  );

  return {
    status: antwort.status,
    kopf: antwortKoepfe,
    rumpf: gekuerzt ? text.slice(0, NETZ_MAX_ANTWORT) : text,
    gekuerzt,
  };
}

/**
 * Die Tabellen-Fähigkeit an ihren Dienst weiterreichen (Plan 023 H1).
 *
 * Steht hier und nicht in der Route, damit alle Brücken-Fähigkeiten denselben
 * Weg nehmen: Route prüft die Freigabe, Brücke reicht weiter, Fachdienst
 * entscheidet.
 */
async function tabellen(extensionId, rumpf, deps = {}) {
  const dienst = deps.tabellenService || require('./tabellenService');
  switch (rumpf.aktion) {
    case 'liste':
      return dienst.liste(extensionId, deps);
    case 'anlegen':
      return dienst.anlegen(extensionId, rumpf, deps);
    case 'schreiben':
      return dienst.schreiben(extensionId, rumpf, deps);
    case 'lesen':
      return dienst.lesen(extensionId, rumpf, deps);
    case 'loeschen':
      return dienst.loeschen(extensionId, rumpf, deps);
    default:
      throw new ValidationError(`Unbekannte Aktion: ${rumpf.aktion}`);
  }
}

/**
 * Die Zeitplan-Fähigkeit an ihren Dienst weiterreichen (Plan 023 H1).
 */
async function zeitplan(extensionId, rumpf, deps = {}) {
  const dienst = deps.zeitplanService || require('./zeitplanService');
  switch (rumpf.aktion) {
    case 'liste':
      return dienst.liste(extensionId, deps);
    case 'anlegen':
      return dienst.anlegen(extensionId, rumpf, deps);
    case 'entfernen':
      return dienst.entfernen(extensionId, rumpf, deps);
    default:
      throw new ValidationError(`Unbekannte Aktion: ${rumpf.aktion}`);
  }
}

module.exports = {
  TOKEN_TTL_MS,
  istAktiv,
  issueToken,
  autorisieren,
  llmStream,
  ragSuche,
  dateien,
  netzAufruf,
  tabellen,
  zeitplan,
  flowsListe,
  flowStarten,
  flowLauf,
  _reset,
  _internals: { tokens },
};
