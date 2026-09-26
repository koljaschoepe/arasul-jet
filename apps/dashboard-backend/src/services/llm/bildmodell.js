/**
 * Welches Modell ein Bild bekommt, wenn eine App eines schickt (J35, 26.09.2026).
 *
 * Die Warteschlange konnte Bilder schon immer (`llmJobProcessor`, aus der Zeit
 * des Chats in der Oberflaeche): ein Bildmodell bekommt sie unveraendert, ein
 * Textmodell bekommt eine Beschreibung, die ein kleines Bildmodell vorher
 * geschrieben hat, und ohne Bildmodell faellt das Bild weg -- mit einer
 * Warnung an Abonnenten, die es bei der externen Schnittstelle nicht gibt.
 * Fuer eine App ist beides falsch: eine Beschreibung ist nicht das Bild (eine
 * Tankquittung wird zu „ein Kassenbon mit Zahlen"), und ein still verlorenes
 * Bild ist eine Antwort auf eine Frage, die niemand gestellt hat.
 *
 * Deshalb entscheidet hier die Schnittstelle, BEVOR sie einreiht:
 *   - nennt die App ein Modell, muss es Bilder lesen (`supports_vision_input`),
 *     sonst 400 mit den Bildmodellen dieses Geraets;
 *   - nennt sie keines, nimmt das Geraet sein Bildmodell -- zuerst das der
 *     Aufgabe `vision` (die Kurzliste: `llava-phi3`), dann jedes andere, das
 *     Bilder liest; gibt es keines, 503.
 * Damit laeuft ein Bild im Auftrag immer ueber den ersten der drei Wege in
 * `llmJobProcessor` und nie ueber die Beschreibung.
 */

const database = require('../../database');
const { ValidationError, ServiceUnavailableError } = require('../../utils/errors');

/** Die Bildmodelle, die am Geraet liegen -- das bevorzugte zuerst. */
async function bildmodelleAmGeraet() {
  const ergebnis = await database.query(
    `SELECT c.id
       FROM llm_model_catalog c
       JOIN llm_installed_models i ON i.id = c.id
      WHERE i.status = 'available'
        AND c.supports_vision_input = true
      ORDER BY (c.task = 'vision' AND c.is_task_default) DESC,
               (c.task = 'vision') DESC,
               c.ram_required_gb ASC,
               c.id ASC`
  );
  return ergebnis.rows.map(zeile => zeile.id);
}

/**
 * Das Modell, das die Bilder dieses Aufrufs bekommt.
 *
 * @param {string|null|undefined} modell - was die App genannt hat
 * @returns {Promise<string>} die Kennung des Modells
 */
async function bildmodellFuer(modell) {
  const vorhanden = await bildmodelleAmGeraet();

  if (!modell) {
    if (vorhanden.length === 0) {
      throw new ServiceUnavailableError(
        'An diesem Gerät liegt kein Bildmodell. Ein Administrator lädt eines unter Modelle (llava-phi3).'
      );
    }
    return vorhanden[0];
  }

  const ergebnis = await database.query(
    `SELECT supports_vision_input FROM llm_model_catalog WHERE id = $1`,
    [modell]
  );
  if (ergebnis.rows[0]?.supports_vision_input !== true) {
    const liste = vorhanden.length > 0 ? vorhanden.join(', ') : 'keines';
    throw new ValidationError(
      `Modell "${modell}" liest keine Bilder. Bildmodelle an diesem Gerät: ${liste}. ` +
        'Ohne `model` nimmt das Gerät sein Bildmodell selbst.'
    );
  }
  return modell;
}

module.exports = { bildmodellFuer, bildmodelleAmGeraet };
