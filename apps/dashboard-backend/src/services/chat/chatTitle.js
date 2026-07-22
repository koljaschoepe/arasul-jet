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

const db = require('../../database');
const logger = require('../../utils/logger');

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
      `UPDATE chat_conversations
          SET title = $2
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

module.exports = { ableitenTitel, setzeAutoTitel, VORGABE_TITEL, MAX_LEN };
