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
 * mit ins Backup wandern. Für PDF/Word liegt der Text als Sidecar
 * (`<name>.extrahiert.txt`) daneben: zur Laufzeit hängt der Flow damit nicht
 * am Indexer.
 *
 * Hochladen, auflisten und löschen ging über `/api/flows/vorlagen`; diese
 * Routen sind mit der Totcode-Prüfung vom 06.10.2026 gefallen, weil keine
 * Oberfläche sie mehr rief. Geblieben ist das Lesen einer Vorlage, die schon
 * auf dem Gerät liegt.
 */

const path = require('path');
const fs = require('fs').promises;
const { FLOWS_DIR } = require('./flowRegistry');
const { ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');

const VORLAGEN_DIR = path.join(FLOWS_DIR, 'vorlagen');

/** Endung des Extraktions-Sidecars neben PDF-/Word-Vorlagen. */
const SIDECAR_SUFFIX = '.extrahiert.txt';

/** Formate, deren Text als Sidecar daneben liegt. */
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
  ladeVorlagenText,
  VORLAGEN_DIR,
  MAX_VORLAGE_ZEICHEN,
};
