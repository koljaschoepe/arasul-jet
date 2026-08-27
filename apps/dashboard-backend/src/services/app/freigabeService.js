/**
 * Freigaben (Phase C2 des Umbaus vom 26.08.2026).
 *
 * Eine Freigabe ist ein Paar: diese App, dieser Mensch. Mehr steht nicht in
 * `app_members` (Migration 168), und mehr braucht die Plattform auch nicht —
 * wer INNERHALB einer App was darf, entscheidet die App.
 *
 * `app_id` ist bis Phase C3 ein freier Text, weil es die Tabelle `apps` noch
 * nicht gibt. Die Form wird trotzdem geprueft (`schemas/freigaben.js`): eine
 * Kennung, die spaeter auf ein Manifest zeigen soll, darf jetzt schon keine
 * Leerzeichen und keine Umlaute enthalten.
 *
 * Freigegeben wird an JEDEN Benutzer, nicht nur an Mitarbeiter. Die Rolle sagt,
 * wer verwaltet, nicht wer arbeitet; ein Administrator, der eine App benutzen
 * will, braucht sie genauso freigegeben. Eine Sonderregel „Admins sehen alles"
 * waere eine zweite Wahrheit neben dieser Tabelle.
 */

const db = require('../../database');
const { NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');

const SPALTEN = `f.app_id, f.user_id, f.freigegeben_von, f.freigegeben_am,
                 b.username, b.email, b.role, b.is_active`;

/**
 * Freigaben lesen, wahlweise gefiltert nach App oder Benutzer.
 *
 * @param {{appId?: string, benutzerId?: number}} filter
 */
async function listeFreigaben({ appId, benutzerId } = {}) {
  const wo = [];
  const werte = [];
  if (appId) {
    werte.push(appId);
    wo.push(`f.app_id = $${werte.length}`);
  }
  if (benutzerId) {
    werte.push(benutzerId);
    wo.push(`f.user_id = $${werte.length}`);
  }
  const result = await db.query(
    `SELECT ${SPALTEN}
       FROM public.app_members f
       JOIN public.admin_users b ON b.id = f.user_id
      ${wo.length ? `WHERE ${wo.join(' AND ')}` : ''}
      ORDER BY f.app_id, f.user_id`,
    werte
  );
  return result.rows;
}

/**
 * Eine App fuer einen Benutzer freigeben.
 *
 * Zweimal dieselbe Freigabe ist kein Fehler, sondern derselbe Zustand: der
 * zweite Aufruf laesst die erste stehen (samt ihrem Zeitstempel und dem
 * Administrator, der sie gesetzt hat) und meldet `neu: false`. Ein 409 waere
 * hier eine Strafe fuer einen Klick, der nichts kaputt macht.
 *
 * Einen unbekannten Benutzer faengt der Fremdschluessel ab (PG 23503 → 400).
 * Vorab zu pruefen waere ein zweiter Ort, an dem dieselbe Regel steht, und
 * zwischen Pruefung und INSERT liegt ohnehin ein Fenster.
 *
 * @returns {Promise<{freigabe: object, neu: boolean}>}
 */
async function gibFrei({ appId, benutzerId, durch }) {
  const result = await db.query(
    `INSERT INTO public.app_members (app_id, user_id, freigegeben_von)
     VALUES ($1, $2, $3)
     ON CONFLICT (app_id, user_id) DO NOTHING
     RETURNING app_id, user_id, freigegeben_von, freigegeben_am`,
    [appId, benutzerId, durch ?? null]
  );
  if (result.rows.length > 0) {
    logger.info(`Freigabe: App ${appId} fuer Benutzer ${benutzerId}`);
    return { freigabe: result.rows[0], neu: true };
  }
  const bestand = await listeFreigaben({ appId, benutzerId });
  return { freigabe: bestand[0], neu: false };
}

/**
 * Eine Freigabe zuruecknehmen. Was es nicht gibt, kann nicht zurueckgenommen
 * werden: dann 404, damit ein Tippfehler in der App-Kennung nicht wie Erfolg
 * aussieht.
 */
async function nimmZurueck({ appId, benutzerId }) {
  const result = await db.query(
    `DELETE FROM public.app_members WHERE app_id = $1 AND user_id = $2`,
    [appId, benutzerId]
  );
  if (result.rowCount === 0) {
    throw new NotFoundError(`Keine Freigabe von ${appId} fuer Benutzer ${benutzerId}`);
  }
  logger.info(`Freigabe zurueckgenommen: App ${appId} fuer Benutzer ${benutzerId}`);
  return { app_id: appId, user_id: benutzerId };
}

module.exports = { listeFreigaben, gibFrei, nimmZurueck };
