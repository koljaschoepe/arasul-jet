/**
 * Automatischer Chat-Titel aus der ersten Nachricht (Plan 011, Schritt 20).
 *
 * Eine frische Unterhaltung trägt den Vorgabetitel „Neuer Chat" (bzw. „New
 * Chat" aus dem alten DB-Default). Damit man Wochen später zurückfindet, wird
 * beim ersten Nutzer-Beitrag ein sprechender Titel abgeleitet — die erste Zeile,
 * auf eine handliche Länge gekürzt.
 *
 * Bewusst best-effort: Das Titeln darf das Speichern der Nachricht nie
 * gefährden. Deshalb liegt der (fehlertolerante) Datenbankzugriff hier im
 * Service und nicht in der Route — die Route bleibt frei von try/catch.
 */

const axios = require('axios');
const db = require('../../database');
const logger = require('../../utils/logger');
const services = require('../../config/services');
const { withGpuLock } = require('../flows/gpuQueue');

/** Vorgabetitel, die als „noch nicht benannt" gelten und überschrieben werden dürfen. */
const VORGABE_TITEL = ['Neuer Chat', 'New Chat'];

/** Maximale Länge des abgeleiteten Titels. */
const MAX_LEN = 60;

/**
 * Leitet aus einem Nachrichtentext einen Titel ab: erste nicht-leere Zeile,
 * Leerraum normalisiert, auf {@link MAX_LEN} gekürzt (mit „…").
 * @param {string} content
 * @returns {string} Der Titel, oder '' wenn nichts Sinnvolles übrig bleibt.
 */
function ableitenTitel(content) {
  const ersteZeile = String(content || '')
    .split('\n')
    .map(z => z.trim())
    .find(z => z.length > 0);
  if (!ersteZeile) {
    return '';
  }
  const sauber = ersteZeile.replace(/\s+/g, ' ').trim();
  return sauber.length > MAX_LEN ? `${sauber.slice(0, MAX_LEN - 1).trimEnd()}…` : sauber;
}

/**
 * Setzt den Auto-Titel, falls die Unterhaltung noch den Vorgabetitel trägt.
 * Ein einziges gezieltes UPDATE (mit Titel-Bedingung in der WHERE-Klausel)
 * verhindert ein Wettrennen und titelt garantiert nur die erste Nachricht.
 * Wirft nie.
 *
 * @param {{ conversationId: (number|string), role: string, content: string }} p
 * @param {{ query?: Function }} [deps]
 * @returns {Promise<string|null>} Der gesetzte Titel oder null (nichts geändert).
 */
async function setzeAutoTitel({ conversationId, role, content }, deps = {}) {
  const query = deps.query || db.query;
  // Nur echte Nutzer-Beiträge titeln — nicht die Assistenz-Antwort oder System.
  if (role !== 'user') {
    return null;
  }
  const titel = ableitenTitel(content);
  if (!titel) {
    return null;
  }
  try {
    const res = await query(
      // Plan 023 E5: die Herkunft wird mitgeschrieben. Ohne sie kann der
      // spaetere Lauf-Titel nicht unterscheiden, ob hier die erste Frage steht
      // (verbesserungswuerdig) oder ein von Hand vergebener Name (unantastbar).
      `UPDATE chat_conversations
          SET title = $2, titel_quelle = 'frage', titel_bei_nachrichten = message_count
        WHERE id = $1
          AND title = ANY($3::text[])`,
      [conversationId, titel, VORGABE_TITEL]
    );
    return res.rowCount > 0 ? titel : null;
  } catch (err) {
    logger.warn(`Auto-Titel für Chat ${conversationId} fehlgeschlagen: ${err.message}`);
    return null;
  }
}

/**
 * Der Chat heisst nach dem, was darin getan wurde (Plan 023 E5).
 *
 * Bis zum 22.08.2026 war der Titel die erste Zeile der ersten Frage. Bei zehn
 * Chats aus zehn Auftraegen stehen dann zehn Fragen untereinander. Wer
 * zurueckspringt, sucht aber nach dem, was herauskam.
 *
 * Drei Entscheidungen, die hier drinstecken:
 *
 *  1. **Dasselbe Modell wie der Lauf.** Es liegt schon im Speicher. Ein
 *     schnelleres zu nehmen hiesse, das grosse zu entladen und danach wieder zu
 *     laden, und das kostet auf dem Jetson gemessen 6 bis 30 Sekunden, fuer
 *     eine Ueberschrift.
 *  2. **Nach der Antwort, nie davor.** Der Nutzer wartet nie auf einen Titel.
 *     Scheitert er, bleibt der bisherige stehen.
 *  3. **Ein von Hand vergebener Titel bleibt.** Dafuer ist `titel_quelle` da:
 *     NULL heisst "der Mensch hat entschieden".
 */

/** Hoechstens so viele Tokens fuer die Ueberschrift. Sie ist eine Zeile. */
const TITEL_NUM_PREDICT = 32;
/** Nach so vielen Millisekunden ohne Antwort bleibt der alte Titel stehen. */
const TITEL_TIMEOUT_MS = 30_000;

const TITEL_ANWEISUNG =
  'Du gibst einem Chat eine Ueberschrift. Antworte mit HOECHSTENS sechs Woertern, ' +
  'auf Deutsch, ohne Anfuehrungszeichen, ohne Punkt am Ende, ohne Vorrede. ' +
  'Benenne, WAS GETAN wurde, nicht was gefragt wurde. ' +
  'Beispiel: "Handbuch Netzwerktechnik in zehn Kapiteln", nicht "Frage zu Netzwerken".';

/**
 * Raeumt auf, was ein kleines Modell trotz Anweisung anstellt.
 *
 * Gemessen kommen vor: Anfuehrungszeichen, ein fuehrendes "Titel:", ein Punkt
 * am Ende, mehrere Zeilen, und der ganze Gedankengang davor. Ohne diese Stelle
 * steht das alles in der Seitenleiste.
 *
 * @param {string} roh
 * @returns {string} '' wenn nichts Brauchbares uebrig bleibt
 */
function titelSaeubern(roh) {
  let text =
    String(roh || '')
      // Ein denkendes Modell schickt seinen Gedankengang mit.
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .split('\n')
      .map(z => z.trim())
      .filter(Boolean)
      .pop() || '';
  text = text
    .replace(/^(titel|ueberschrift|überschrift)\s*:\s*/i, '')
    .replace(/^["'\u201e\u201c\u00ab]+|["'\u201c\u201d\u00bb]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .trim();
  if (text.length < 3) {
    return '';
  }
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1).trimEnd()}\u2026` : text;
}

/**
 * Ist ein neuer Titel faellig?
 *
 * Faellig ist er, wenn noch nie einer aus einem Lauf kam, oder wenn sich die
 * Zahl der Nachrichten seit der letzten Benennung verdoppelt hat. Die
 * Verdopplung ist bewusst gewaehlt und nicht eine feste Zahl: sie benennt einen
 * kurzen Chat frueh und einen langen selten, und sie braucht keine Uhr.
 *
 * @param {{titel_quelle:string|null, titel_bei_nachrichten:number|null, message_count:number}} zeile
 * @returns {boolean}
 */
function titelFaellig(zeile) {
  if (!zeile) {
    return false;
  }
  // NULL heisst: von Hand vergeben. Der Mensch hat entschieden.
  if (zeile.titel_quelle === null || zeile.titel_quelle === undefined) {
    return false;
  }
  if (zeile.titel_quelle !== 'lauf') {
    return true;
  }
  const seit = Number(zeile.titel_bei_nachrichten) || 0;
  return seit > 0 && Number(zeile.message_count) >= seit * 2;
}

/**
 * Fragt das Modell nach einer Ueberschrift und schreibt sie, wenn sie faellig ist.
 *
 * Wirft nie. Ein Titel ist eine Bequemlichkeit; er darf nichts gefaehrden.
 *
 * @param {object} p
 * @param {number|string} p.conversationId
 * @param {string} p.modell Ollama-Name des Modells, das gerade geladen ist
 * @param {string} p.frage die Frage des Nutzers
 * @param {string} p.antwort die Antwort des Laufs (gekuerzt)
 * @param {string[]} [p.dateien] Pfade, die der Lauf angefasst hat
 * @param {object} [deps]
 * @returns {Promise<string|null>} der gesetzte Titel oder null
 */
async function benenneNachLauf(
  { conversationId, modell, frage, antwort, dateien = [] },
  deps = {}
) {
  const query = deps.query || db.query;
  const post = deps.post || axios.post;
  const sperre = deps.withGpuLock || withGpuLock;
  try {
    const stand = await query(
      `SELECT title, message_count, titel_quelle, titel_bei_nachrichten
         FROM chat_conversations WHERE id = $1`,
      [conversationId]
    );
    const zeile = stand.rows[0];
    if (!titelFaellig(zeile)) {
      return null;
    }

    const dateiZeile = dateien.length
      ? `\nGeaenderte Dateien: ${dateien.slice(0, 10).join(', ')}`
      : '';
    const rumpf =
      `Frage: ${String(frage || '').slice(0, 400)}\n` +
      `Ergebnis: ${String(antwort || '').slice(0, 800)}${dateiZeile}`;

    const antwortModell = await sperre(async () =>
      post(
        services.llm.chatEndpoint,
        {
          model: modell,
          messages: [
            { role: 'system', content: TITEL_ANWEISUNG },
            { role: 'user', content: rumpf },
          ],
          stream: false,
          think: false,
          options: { num_predict: TITEL_NUM_PREDICT },
        },
        { timeout: TITEL_TIMEOUT_MS }
      )
    );

    const titel = titelSaeubern(antwortModell?.data?.message?.content);
    if (!titel) {
      return null;
    }
    // Die Bedingung im UPDATE ist der Schutz gegen ein Wettrennen: hat der
    // Mensch inzwischen selbst benannt, steht dort NULL und nichts passiert.
    const res = await query(
      `UPDATE chat_conversations
          SET title = $2, titel_quelle = 'lauf', titel_bei_nachrichten = message_count
        WHERE id = $1 AND titel_quelle IS NOT NULL`,
      [conversationId, titel]
    );
    if (res.rowCount > 0) {
      logger.info(`[TITEL] Chat ${conversationId} heisst jetzt "${titel}"`);
      return titel;
    }
    return null;
  } catch (err) {
    // Absichtlich mit `?.`: diese Funktion verspricht, nie zu werfen, und ein
    // Logger ohne `debug` (etwa in einem Test-Doppel) darf dieses Versprechen
    // nicht brechen. Ein Titel ist eine Bequemlichkeit.
    logger.debug?.(`[TITEL] Chat ${conversationId} nicht benannt: ${err.message}`);
    return null;
  }
}

module.exports = {
  ableitenTitel,
  setzeAutoTitel,
  VORGABE_TITEL,
  MAX_LEN,
  titelSaeubern,
  titelFaellig,
  benenneNachLauf,
  TITEL_ANWEISUNG,
};
