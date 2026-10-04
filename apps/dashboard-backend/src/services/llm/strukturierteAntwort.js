/**
 * JSON lesen rund um `POST /api/v1/external/document/extract-structured`:
 * das Schema der Anfrage und die Felder aus der Antwort des Modells.
 *
 * Aus `routes/external/externalApi.js` hierher gezogen (M5, Auftrag
 * jet-fehlerklassen): Routen fangen keine Fehler.
 */

const { ValidationError } = require('../../utils/errors');

/** Das Schema der Anfrage als Objekt; kein gueltiges JSON ist ein 400. */
function schemaLesen(schema) {
  try {
    return typeof schema === 'string' ? JSON.parse(schema) : schema;
  } catch {
    throw new ValidationError('schema must be valid JSON');
  }
}

/**
 * Die Felder aus der Antwort eines Modells: ein Objekt oder null.
 *
 * Ein Zaun aus ```json darf drumstehen. Eine Liste oder eine Zahl ist keine
 * Antwort auf ein Schema mit Feldern (J35) und wird zu null; die Antwort steht
 * dann unveraendert in `raw_response`.
 */
function felderAus(rawResponse) {
  const cleaned = String(rawResponse || '')
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?\s*```\s*$/m, '')
    .trim();
  try {
    const geparst = JSON.parse(cleaned);
    return geparst && typeof geparst === 'object' && !Array.isArray(geparst) ? geparst : null;
  } catch {
    return null;
  }
}

module.exports = { schemaLesen, felderAus };
