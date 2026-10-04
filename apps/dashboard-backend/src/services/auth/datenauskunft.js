/**
 * Die Kategorien der DSGVO-Auskunft (Art. 15) holen, `GET /api/gdpr/export`.
 *
 * Aus `routes/admin/gdpr.js` hierher gezogen (M5, Auftrag jet-fehlerklassen):
 * Routen fangen keine Fehler. Was die Route damit macht, steht dort.
 */

const db = require('../../database');
const logger = require('../../utils/logger');

/**
 * Ein Holer fuer die Kategorien einer Auskunft. Fehler werden NICHT
 * verschluckt.
 *
 * Bis zum 19.08.2026 stand an den meisten dieser Abfragen ein
 * `.catch(() => ({ rows: [] }))`. Dadurch sah eine Kategorie, deren SQL
 * gegen ein längst umgebautes Schema lief, im Export exakt so aus wie eine,
 * zu der es wirklich nichts gibt. Live geprüft an dem Tag: von elf
 * Kategorien waren sechs falsch — zwei brachten den Export mit 500 zum
 * Absturz (`column "model" does not exist`), vier lieferten still nichts.
 * Bei einer Auskunft nach Art. 15 ist "leer" eine Aussage. Die darf nicht
 * geraten sein, also wird ein Fehlschlag mitgeliefert und protokolliert.
 *
 * Gefangen wird JEDER Fehler, nicht nur Schema-Drift: auch ein
 * Verbindungsabbruch oder ein Timeout landet als `unvollstaendig` in der
 * Antwort statt als 500. Das ist so gewollt — eine Auskunft, die zehn von
 * elf Kategorien liefert und die elfte benennt, ist mehr wert als gar
 * keine. Still ist sie dabei nie: der Grund steht in der Antwort und im
 * Protokoll.
 *
 * @param {Array<{kategorie: string, grund: string}>} unvollstaendig
 *   Liste, in die jeder Fehlschlag eingetragen wird
 * @returns {(kategorie: string, sql: string, params?: any[]) => Promise<{rows: any[], fehler?: string}>}
 */
function kategorieHoler(unvollstaendig) {
  return async (kategorie, sql, params) => {
    try {
      return await db.query(sql, params);
    } catch (err) {
      logger.error(`GDPR-Export: Kategorie "${kategorie}" nicht lesbar: ${err.message}`);
      unvollstaendig.push({ kategorie, grund: err.message });
      return { rows: [], fehler: err.message };
    }
  };
}

module.exports = { kategorieHoler };
