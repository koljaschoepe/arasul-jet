/**
 * Snapshot-/Undo-Dienst für Datei-Schreibschritte (Plan 022, Schritt 4).
 *
 * Der Agent schreibt direkt auf die gemountete Platte (tools/dateien.js), und
 * der Editor speichert Projektdateien (ablageService). Damit sich beliebige
 * Schreibschritte MEHRSTUFIG und pro Datei rückgängig machen lassen, sichert
 * dieser Dienst VOR jeder Änderung den vorherigen Stand — als kleiner Stapel je
 * Datei. Agent- und Editor-Änderungen teilen sich denselben Stapel, weil beide
 * im selben Projektordner arbeiten: „Rückgängig" wirkt quellenübergreifend.
 *
 * Anders als der `changeTracker` (ein Vorher/Nachher-Abzug pro LAUF) ist dies
 * granular pro SCHRITT. Der Speicher liegt bewusst außerhalb des Nutzer-
 * Sichtbaren, in `<root>/.arasul-versions/`, und ist überall ausgeblendet
 * (Explorer, Baum, Agent-Listing, Änderungs-Abzug).
 *
 * Sparsam & 5-Jahres-tauglich: pro Datei nur die letzten N Versionen; reine
 * Anhänge werden als billiger „auf Größe kürzen"-Vermerk gesichert statt als
 * ganze Kopie (sonst wüchse ein Langdokument quadratisch).
 */

const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { resolveRealWithinRoots } = require('./pathSafe');
const logger = require('../../utils/logger');

/** Verzeichnisname des versteckten Versions-Speichers (je Root). */
const VERSIONS_DIR = '.arasul-versions';
/** Größte Datei, für die noch eine Inhalts-Kopie gesichert wird. */
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024; // 2 MB
/** So viele Versionen werden je Datei aufbewahrt (älteste fallen heraus). */
const MAX_VERSIONS_PER_FILE = 25;

function versionsRoot(root) {
  return path.join(root, VERSIONS_DIR);
}

/** Stabiler, dateisystem-sicherer Schlüssel für einen relativen Pfad. */
function schluessel(relPfad) {
  return crypto.createHash('sha1').update(relPfad).digest('hex').slice(0, 16);
}

function eintragDir(root, relPfad) {
  return path.join(versionsRoot(root), schluessel(relPfad));
}

async function ladeIndex(dir) {
  try {
    const roh = await fsp.readFile(path.join(dir, 'index.json'), 'utf8');
    const idx = JSON.parse(roh);
    if (idx && Array.isArray(idx.versionen)) {
      return idx;
    }
  } catch {
    // Kein/kaputter Index → als leer behandeln.
  }
  return null;
}

async function schreibeIndex(dir, idx) {
  await fsp.writeFile(path.join(dir, 'index.json'), JSON.stringify(idx), 'utf8');
}

/**
 * Sichert VOR einer Änderung den vorherigen Stand einer Datei.
 *
 * @param {string} root       Wurzel-Ordner (Projekt-/Arbeitsordner).
 * @param {string} relPfad    Pfad relativ zu `root` (mit '/').
 * @param {object} opts
 * @param {string|null} [opts.altInhalt]  Vorheriger Inhalt (null = existierte nicht).
 * @param {boolean} [opts.existierte]      Gab es die Datei vorher?
 * @param {number}  [opts.altGroesse]      Vorherige Größe (für 'trunc'-Sicherung).
 * @param {'inhalt'|'trunc'|'auto'} [opts.art]  Sicherungs-Art (auto = aus Inhalt ableiten).
 * @returns {Promise<boolean>} true, wenn eine Version abgelegt wurde.
 *
 * Best effort: wirft nie in den Aufrufer — Undo-Bücher dürfen keinen Schreib-
 * vorgang kippen.
 */
async function sichereVorher(root, relPfad, opts = {}) {
  try {
    if (!root || !relPfad) {
      return false;
    }
    const dir = eintragDir(root, relPfad);
    await fsp.mkdir(dir, { recursive: true });
    const idx = (await ladeIndex(dir)) || { pfad: relPfad, versionen: [] };
    const seq = (idx.versionen.reduce((m, v) => Math.max(m, v.seq || 0), 0) || 0) + 1;

    let version;
    if (opts.existierte === false) {
      // Datei entstand neu → Undo bedeutet „löschen".
      version = { seq, ts: new Date().toISOString(), art: 'neu', bytes: 0 };
    } else if (opts.art === 'trunc') {
      // Reiner Anhang → Undo bedeutet „auf alte Größe kürzen" (billig).
      version = {
        seq,
        ts: new Date().toISOString(),
        art: 'trunc',
        bytes: Number(opts.altGroesse) || 0,
      };
    } else {
      const inhalt = opts.altInhalt == null ? '' : String(opts.altInhalt);
      if (Buffer.byteLength(inhalt, 'utf8') > MAX_SNAPSHOT_BYTES) {
        // Zu groß für eine Kopie → keine Undo-Stufe (ehrlich statt teuer).
        return false;
      }
      await fsp.writeFile(path.join(dir, `${seq}.snap`), inhalt, 'utf8');
      version = {
        seq,
        ts: new Date().toISOString(),
        art: 'inhalt',
        bytes: Buffer.byteLength(inhalt, 'utf8'),
      };
    }

    idx.pfad = relPfad;
    idx.versionen.push(version);
    // Älteste Versionen über dem Deckel entfernen (Dateien mit).
    while (idx.versionen.length > MAX_VERSIONS_PER_FILE) {
      const alt = idx.versionen.shift();
      if (alt && alt.art === 'inhalt') {
        await fsp.rm(path.join(dir, `${alt.seq}.snap`), { force: true }).catch(() => {});
      }
    }
    await schreibeIndex(dir, idx);
    return true;
  } catch (err) {
    logger.warn(`[SNAPSHOT] Sichern von "${relPfad}" fehlgeschlagen: ${err.message}`);
    return false;
  }
}

/** Anzahl verfügbarer Undo-Stufen + jüngste Version einer Datei (oder null). */
async function versionsInfo(root, relPfad) {
  const dir = eintragDir(root, relPfad);
  const idx = await ladeIndex(dir);
  if (!idx || idx.versionen.length === 0) {
    return null;
  }
  const letzte = idx.versionen[idx.versionen.length - 1];
  return { anzahl: idx.versionen.length, letzte };
}

/**
 * Inhalt der jüngsten Version (für Diff „vorher gegen jetzt"). Liefert null,
 * wenn die jüngste Version keine Inhalts-Kopie ist (neu/trunc) — dann gibt es
 * keinen sinnvollen Text-Vorher-Stand.
 */
async function letzterInhalt(root, relPfad) {
  const dir = eintragDir(root, relPfad);
  const idx = await ladeIndex(dir);
  if (!idx || idx.versionen.length === 0) {
    return null;
  }
  const letzte = idx.versionen[idx.versionen.length - 1];
  if (letzte.art !== 'inhalt') {
    return null;
  }
  try {
    return await fsp.readFile(path.join(dir, `${letzte.seq}.snap`), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Macht den jüngsten Schreibschritt einer Datei rückgängig (mehrstufig
 * aufrufbar). Schreibt symlink-sicher zurück in `root`.
 *
 * @returns {Promise<{ok:boolean, art?:string, verbleibend?:number, grund?:string}>}
 */
async function wiederherstellen(root, relPfad) {
  const dir = eintragDir(root, relPfad);
  const idx = await ladeIndex(dir);
  if (!idx || idx.versionen.length === 0) {
    return { ok: false, grund: 'Keine frühere Version vorhanden.' };
  }
  const version = idx.versionen[idx.versionen.length - 1];

  let abs;
  try {
    // Für 'neu' existiert die Datei; für 'inhalt'/'trunc' ebenfalls.
    abs = resolveRealWithinRoots([root], relPfad);
  } catch (err) {
    return { ok: false, grund: `Pfad nicht auflösbar: ${err.message}` };
  }

  try {
    if (version.art === 'neu') {
      await fsp.rm(abs, { force: true });
    } else if (version.art === 'trunc') {
      await fsp.truncate(abs, Number(version.bytes) || 0).catch(async err => {
        // Datei kürzer als erwartet o. Ä. → best effort: leer lassen.
        if (err.code !== 'ENOENT') {
          throw err;
        }
      });
    } else {
      const inhalt = await fsp.readFile(path.join(dir, `${version.seq}.snap`), 'utf8');
      await fsp.writeFile(abs, inhalt, 'utf8');
      await fsp.rm(path.join(dir, `${version.seq}.snap`), { force: true }).catch(() => {});
    }
  } catch (err) {
    return { ok: false, grund: `Wiederherstellen fehlgeschlagen: ${err.message}` };
  }

  idx.versionen.pop();
  if (idx.versionen.length === 0) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  } else {
    await schreibeIndex(dir, idx).catch(() => {});
  }
  return { ok: true, art: version.art, verbleibend: idx.versionen.length };
}

module.exports = {
  sichereVorher,
  wiederherstellen,
  versionsInfo,
  letzterInhalt,
  VERSIONS_DIR,
  MAX_SNAPSHOT_BYTES,
  MAX_VERSIONS_PER_FILE,
};
