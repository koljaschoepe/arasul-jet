/**
 * Stilvorlagen für Flow-Ausgaben (Flows-Umbau 2026-08-02).
 *
 * Eine Vorlage ist eine vom Kunden hochgeladene Datei (Word, PDF, Markdown,
 * Text, HTML), die als STIL- UND STRUKTUR-REFERENZ dient: ihr Text fließt als
 * abgegrenzter Block in den Prompt („schreibe im Stil und Aufbau dieser
 * Vorlage"), sie wird NICHT pixelgenau befüllt. Das ist robust — nichts muss
 * exakt passen — und funktioniert mit dem, was der Kunde ohnehin hat.
 *
 * Ablage: `data/flows/vorlagen/` (im Container unterhalb von FLOWS_DIR) — im
 * selben Volume wie die Flows selbst, damit Vorlagen Rebuilds überleben und
 * mit ins Backup wandern. Für PDF/Word wird der Text SOFORT beim Hochladen
 * über den Document-Indexer extrahiert und als Sidecar (`<name>.extrahiert.txt`)
 * daneben gelegt: zur Laufzeit hängt der Flow damit nicht am Indexer.
 */

const path = require('path');
const fs = require('fs').promises;
const { FLOWS_DIR } = require('./flowRegistry');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');

const VORLAGEN_DIR = path.join(FLOWS_DIR, 'vorlagen');

/** Endung des Extraktions-Sidecars neben PDF-/Word-Vorlagen. */
const SIDECAR_SUFFIX = '.extrahiert.txt';

/** Direkt lesbare Textformate — brauchen keinen Sidecar. */
const TEXT_ENDUNGEN = new Set(['.md', '.markdown', '.txt', '.html', '.htm']);
/** Formate, deren Text beim Hochladen extrahiert wird. */
const EXTRAKT_ENDUNGEN = new Set(['.pdf', '.docx']);

/** Zeichen-Budget für den Vorlagen-Text im Prompt (≈ 2k Token). */
const MAX_VORLAGE_ZEICHEN = 8000;

/** Wirft bei unsauberen Namen — der Name wird zum Dateinamen. */
function assertSafeName(name) {
  const n = String(name || '').trim();
  if (!n || n.includes('/') || n.includes('\\') || n.includes('..') || n.startsWith('.')) {
    throw new ValidationError(`Ungültiger Vorlagenname "${name}"`);
  }
  return n;
}

function istErlaubteEndung(name) {
  const ext = path.extname(name).toLowerCase();
  return TEXT_ENDUNGEN.has(ext) || EXTRAKT_ENDUNGEN.has(ext);
}

async function ensureDir() {
  await fs.mkdir(VORLAGEN_DIR, { recursive: true });
}

/** Sehr einfache HTML-Entkleidung — für Vorlagen reicht der sichtbare Text. */
function stripHtml(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Listet die Vorlagen (ohne Sidecars).
 * @returns {Promise<{name:string, groesse:number, hochgeladen:string}[]>}
 */
async function listVorlagen() {
  await ensureDir();
  const entries = await fs.readdir(VORLAGEN_DIR, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || e.name.endsWith(SIDECAR_SUFFIX) || !istErlaubteEndung(e.name)) {
      continue;
    }
    const stat = await fs.stat(path.join(VORLAGEN_DIR, e.name));
    out.push({ name: e.name, groesse: stat.size, hochgeladen: stat.mtime.toISOString() });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return out;
}

/**
 * Speichert eine hochgeladene Vorlage. Für PDF/Word wird der Text sofort
 * extrahiert und als Sidecar abgelegt — schlägt die Extraktion fehl, wird die
 * Vorlage NICHT gespeichert (eine Vorlage ohne lesbaren Text wäre wirkungslos,
 * das soll beim Hochladen auffallen, nicht erst im Lauf).
 *
 * @param {object} p
 * @param {string} p.name - Original-Dateiname.
 * @param {Buffer} p.buffer - Dateiinhalt.
 * @param {object} [deps] - `extractText(buffer, name)` für Tests austauschbar.
 * @returns {Promise<{name:string, groesse:number}>}
 */
async function saveVorlage({ name, buffer }, deps = {}) {
  const safe = assertSafeName(name);
  if (!istErlaubteEndung(safe)) {
    throw new ValidationError(
      'Vorlagenformat nicht unterstützt — erlaubt: .docx, .pdf, .md, .txt, .html'
    );
  }
  await ensureDir();

  const ext = path.extname(safe).toLowerCase();
  if (EXTRAKT_ENDUNGEN.has(ext)) {
    const extractText =
      deps.extractText ||
      (async (buf, filename) => {
        const extractionService = require('../documents/extractionService');
        const { text } = await extractionService.extractFromBuffer(buf, filename);
        return text;
      });
    let text;
    try {
      text = await extractText(buffer, safe);
    } catch (err) {
      throw new ValidationError(
        `Text der Vorlage konnte nicht gelesen werden: ${err.message}. ` +
          'Bitte eine Text-, Markdown-, Word- oder PDF-Datei mit lesbarem Text hochladen.'
      );
    }
    if (!String(text || '').trim()) {
      throw new ValidationError('Die Vorlage enthält keinen lesbaren Text');
    }
    await fs.writeFile(path.join(VORLAGEN_DIR, safe + SIDECAR_SUFFIX), String(text), 'utf8');
  }

  await fs.writeFile(path.join(VORLAGEN_DIR, safe), buffer);
  return { name: safe, groesse: buffer.length };
}

/** Löscht eine Vorlage samt Sidecar. */
async function deleteVorlage(name) {
  const safe = assertSafeName(name);
  const datei = path.join(VORLAGEN_DIR, safe);
  try {
    await fs.unlink(datei);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`Vorlage "${safe}" nicht gefunden`);
    }
    throw err;
  }
  try {
    await fs.unlink(datei + SIDECAR_SUFFIX);
  } catch {
    // Kein Sidecar (Textformat) — in Ordnung.
  }
}

/**
 * Lädt den TEXT einer Vorlage für den Prompt (gekappt auf MAX_VORLAGE_ZEICHEN).
 * Wirft nie — eine fehlende/unlesbare Vorlage darf den Lauf nicht kippen; der
 * Aufrufer bekommt dann `gefunden: false` und lässt den Block schlicht weg.
 *
 * @returns {Promise<{gefunden:boolean, text:string, gekuerzt:boolean}>}
 */
async function ladeVorlagenText(name) {
  try {
    const safe = assertSafeName(name);
    const ext = path.extname(safe).toLowerCase();
    let text;
    if (EXTRAKT_ENDUNGEN.has(ext)) {
      text = await fs.readFile(path.join(VORLAGEN_DIR, safe + SIDECAR_SUFFIX), 'utf8');
    } else {
      text = await fs.readFile(path.join(VORLAGEN_DIR, safe), 'utf8');
      if (ext === '.html' || ext === '.htm') {
        text = stripHtml(text);
      }
    }
    text = String(text).trim();
    if (!text) {
      return { gefunden: false, text: '', gekuerzt: false };
    }
    const gekuerzt = text.length > MAX_VORLAGE_ZEICHEN;
    return { gefunden: true, text: gekuerzt ? text.slice(0, MAX_VORLAGE_ZEICHEN) : text, gekuerzt };
  } catch (err) {
    logger.warn(`Vorlagen-Text "${name}" nicht ladbar: ${err.message}`);
    return { gefunden: false, text: '', gekuerzt: false };
  }
}

module.exports = {
  listVorlagen,
  saveVorlage,
  deleteVorlage,
  ladeVorlagenText,
  VORLAGEN_DIR,
  MAX_VORLAGE_ZEICHEN,
};
