/**
 * Der verschluesselte Schluesselspeicher fuer Cloud-Anbieter (Plan 023 D9).
 *
 * Verschluesselt wird mit utils/tokenCrypto (AES-256-GCM, Schluessel aus
 * JWT_SECRET), derselbe Weg, den der Claude-Login seit Plan 008 geht. In der
 * Datenbank steht nie Klartext; was die Oberflaeche zeigen darf, sind die
 * letzten vier Zeichen, und die stehen als eigene Spalte da, damit die Anzeige
 * nichts entschluesseln muss.
 *
 * Geraeteweit, nicht je Nutzer: Entscheidung E1 vom 19.08.2026, ein Zugang je
 * Geraet. Begruendung steht ausfuehrlich an der Migration 153.
 */

const database = require('../../../database');
const logger = require('../../../utils/logger');
const { encryptToken, decryptToken } = require('../../../utils/tokenCrypto');
const { anbieter: anbieterDef, anbieterNamen } = require('./providerRegistry');
const { ValidationError, NotFoundError } = require('../../../utils/errors');

/**
 * Die letzten vier Zeichen, fuer die Anzeige.
 * @param {string} schluessel
 * @returns {string}
 */
function endetAuf(schluessel) {
  return String(schluessel).slice(-4);
}

/**
 * Legt den Schluessel eines Anbieters ab oder ersetzt ihn.
 *
 * Ein bereits eingeschalteter Anbieter bleibt eingeschaltet, wenn nur der
 * Schluessel getauscht wird. Ein neuer Anbieter kommt ausgeschaltet an, so
 * wie der Plan es verlangt: standardmaessig aus.
 *
 * @param {string} name Anbieter-Kennung
 * @param {string} schluessel Klartext-API-Schluessel
 * @returns {Promise<object>} die Zeile ohne Schluessel
 */
async function schluesselSetzen(name, schluessel) {
  if (!anbieterDef(name)) {
    throw new ValidationError(
      `Unbekannter Anbieter "${name}". Bekannt sind: ${anbieterNamen().join(', ')}.`
    );
  }
  const klartext = String(schluessel || '').trim();
  if (!klartext) {
    throw new ValidationError('Der Schlüssel darf nicht leer sein.');
  }

  const ergebnis = await database.query(
    `INSERT INTO arasul.externe_modell_anbieter
       (anbieter, verschluesselter_schluessel, schluessel_endet_auf, aktiv, letzter_fehler)
     VALUES ($1, $2, $3, FALSE, NULL)
     ON CONFLICT (anbieter) DO UPDATE
       SET verschluesselter_schluessel = EXCLUDED.verschluesselter_schluessel,
           schluessel_endet_auf        = EXCLUDED.schluessel_endet_auf,
           letzter_fehler              = NULL,
           zuletzt_geprueft_am         = NULL
     RETURNING anbieter, schluessel_endet_auf, aktiv, zuletzt_geprueft_am,
               letzter_fehler, angelegt_am, geaendert_am`,
    [name, encryptToken(klartext), endetAuf(klartext)]
  );
  logger.info(`[Extern] Schlüssel für ${name} hinterlegt (endet auf ${endetAuf(klartext)})`);
  return ergebnis.rows[0];
}

/**
 * Holt den Klartext-Schluessel eines Anbieters.
 * @param {string} name
 * @returns {Promise<string|null>} null, wenn kein Schluessel hinterlegt ist
 */
async function schluesselLesen(name) {
  const ergebnis = await database.query(
    `SELECT verschluesselter_schluessel FROM arasul.externe_modell_anbieter WHERE anbieter = $1`,
    [name]
  );
  if (ergebnis.rows.length === 0) {
    return null;
  }
  try {
    return decryptToken(ergebnis.rows[0].verschluesselter_schluessel);
  } catch (err) {
    // Das passiert genau dann, wenn JWT_SECRET gewechselt hat. Der Schluessel
    // ist dann unwiederbringlich, und das gehoert gesagt, statt als
    // "Anbieter antwortet nicht" zu erscheinen.
    logger.error(
      `[Extern] Schlüssel für ${name} nicht entschlüsselbar (JWT_SECRET gewechselt?): ${err.message}`
    );
    return null;
  }
}

/**
 * Entfernt den Schluessel eines Anbieters vollstaendig.
 * @param {string} name
 * @returns {Promise<boolean>} ob etwas entfernt wurde
 */
async function schluesselEntfernen(name) {
  const ergebnis = await database.query(
    `DELETE FROM arasul.externe_modell_anbieter WHERE anbieter = $1`,
    [name]
  );
  if (ergebnis.rowCount > 0) {
    logger.info(`[Extern] Schlüssel für ${name} entfernt`);
  }
  return ergebnis.rowCount > 0;
}

/**
 * Schaltet einen Anbieter ein oder aus.
 * @param {string} name
 * @param {boolean} aktiv
 * @returns {Promise<object>}
 */
async function aktivSetzen(name, aktiv) {
  const ergebnis = await database.query(
    `UPDATE arasul.externe_modell_anbieter SET aktiv = $2 WHERE anbieter = $1
     RETURNING anbieter, schluessel_endet_auf, aktiv, zuletzt_geprueft_am,
               letzter_fehler, angelegt_am, geaendert_am`,
    [name, aktiv === true]
  );
  if (ergebnis.rows.length === 0) {
    throw new NotFoundError(`Für "${name}" ist kein Schlüssel hinterlegt.`);
  }
  logger.info(`[Extern] ${name} ist jetzt ${aktiv ? 'eingeschaltet' : 'ausgeschaltet'}`);
  return ergebnis.rows[0];
}

/**
 * Haelt fest, wie der letzte Kontakt zum Anbieter ausgegangen ist.
 * @param {string} name
 * @param {string|null} fehler null bei Erfolg
 */
async function ergebnisFesthalten(name, fehler = null) {
  // Der Typ von $2 steht ausdruecklich da. Ohne den Cast kann Postgres ihn
  // nicht ableiten, weil der Parameter einmal zugewiesen und einmal nur auf
  // IS NULL geprueft wird, und antwortet mit "could not determine data type of
  // parameter $2". Am 22.08.2026 am Geraet passiert, und zwar mit Folgen:
  // dieser Aufruf steht im catch-Zweig von schluesselPruefen, sein Fehler hat
  // also die ehrliche 401-Meldung des Anbieters ueberschrieben. Der Nutzer las
  // "Internal server error" statt "Anthropic weist den Schluessel zurueck".
  await database.query(
    `UPDATE arasul.externe_modell_anbieter
        SET letzter_fehler = $2::text,
            zuletzt_geprueft_am = CASE WHEN $2::text IS NULL THEN NOW() ELSE zuletzt_geprueft_am END
      WHERE anbieter = $1`,
    [name, fehler]
  );
}

/**
 * Der Stand aller Anbieter, fuer die Oberflaeche.
 *
 * Enthaelt jeden bekannten Anbieter, auch die ohne Schluessel, damit die
 * Einstellungen zeigen koennen, was man hinterlegen KANN. Der Schluessel
 * selbst kommt nie mit.
 *
 * @returns {Promise<object[]>}
 */
async function anbieterStand() {
  const ergebnis = await database.query(
    `SELECT anbieter, schluessel_endet_auf, aktiv, zuletzt_geprueft_am,
            letzter_fehler, angelegt_am, geaendert_am
       FROM arasul.externe_modell_anbieter`
  );
  const nachName = new Map(ergebnis.rows.map(r => [r.anbieter, r]));
  return anbieterNamen().map(name => {
    const def = anbieterDef(name);
    const zeile = nachName.get(name);
    return {
      anbieter: name,
      name: def.name,
      schluessel_hinweis: def.schluesselHinweis,
      schluessel_hinterlegt: Boolean(zeile),
      schluessel_endet_auf: zeile ? zeile.schluessel_endet_auf : null,
      aktiv: zeile ? zeile.aktiv : false,
      zuletzt_geprueft_am: zeile ? zeile.zuletzt_geprueft_am : null,
      letzter_fehler: zeile ? zeile.letzter_fehler : null,
    };
  });
}

/**
 * Welche Anbieter sind eingeschaltet UND haben einen Schluessel?
 * @returns {Promise<string[]>}
 */
async function aktiveAnbieter() {
  const ergebnis = await database.query(
    `SELECT anbieter FROM arasul.externe_modell_anbieter WHERE aktiv = TRUE`
  );
  return ergebnis.rows.map(r => r.anbieter).filter(name => Boolean(anbieterDef(name)));
}

module.exports = {
  schluesselSetzen,
  schluesselLesen,
  schluesselEntfernen,
  aktivSetzen,
  ergebnisFesthalten,
  anbieterStand,
  aktiveAnbieter,
  endetAuf,
};
