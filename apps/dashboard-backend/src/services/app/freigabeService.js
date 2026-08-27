/**
 * Freigaben (Phase C2 des Umbaus vom 26.08.2026, Tester-Kreis aus C3).
 *
 * Eine Freigabe ist ein Paar: diese App, dieser Mensch. Dazu ein Wort, wie
 * weit: `live` sieht den Livestand unter `/apps/<id>/`, `test` zusaetzlich den
 * Teststand unter `/apps/<id>/test/`. Mehr steht nicht in `app_members`
 * (Migration 168, Spalte `stand` seit 169), und mehr braucht die Plattform auch
 * nicht — wer INNERHALB einer App was darf, entscheidet die App.
 *
 * `app_id` zeigt seit Migration 169 als Fremdschluessel auf `apps.id`. Eine
 * Freigabe fuer eine App, die es am Geraet nicht gibt, faengt damit die
 * Datenbank ab (PG 23503 -> 400).
 *
 * Freigegeben wird an JEDEN Benutzer, nicht nur an Mitarbeiter. Die Rolle sagt,
 * wer verwaltet, nicht wer arbeitet; ein Administrator, der eine App benutzen
 * will, braucht sie genauso freigegeben. Eine Sonderregel „Admins sehen alles"
 * waere eine zweite Wahrheit neben dieser Tabelle.
 */

const db = require('../../database');
const { NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');

const SPALTEN = `f.app_id, f.user_id, f.stand, f.freigegeben_von, f.freigegeben_am,
                 a.name AS app_name,
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
       JOIN public.apps a ON a.id = f.app_id
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
 * zweite Aufruf laesst den Zeitstempel und den Administrator der ersten stehen
 * und meldet `neu: false`. Ein 409 waere hier eine Strafe fuer einen Klick, der
 * nichts kaputt macht.
 *
 * Der `stand` ist die Ausnahme davon: er wird ueberschrieben. Wer jemanden vom
 * Tester zum normalen Nutzer macht (oder umgekehrt), schickt dieselbe Freigabe
 * noch einmal mit dem anderen Wort; ihn dafuer erst zuruecknehmen zu lassen
 * waere ein Umweg ohne Gewinn.
 *
 * Eine unbekannte App oder einen unbekannten Benutzer faengt der
 * Fremdschluessel ab (PG 23503 -> 400). Vorab zu pruefen waere ein zweiter Ort,
 * an dem dieselbe Regel steht, und zwischen Pruefung und INSERT liegt ohnehin
 * ein Fenster.
 *
 * @returns {Promise<{freigabe: object, neu: boolean}>}
 */
async function gibFrei({ appId, benutzerId, stand = 'live', durch }) {
  // `xmax = 0` unterscheidet die eingefuegte Zeile von der aktualisierten:
  // Postgres traegt in eine frisch eingefuegte Zeile keine loeschende
  // Transaktion ein, in eine per ON CONFLICT aktualisierte schon. Der Umweg
  // ueber ein zweites SELECT waere lesbarer und hatte genau ein Problem: er
  // konnte zwischen INSERT und Nachlese ins Leere greifen, wenn jemand die
  // Freigabe in derselben Sekunde zurueckgenommen hat. Ein Aufruf, eine Zeile,
  // kein Fenster.
  const result = await db.query(
    `INSERT INTO public.app_members (app_id, user_id, stand, freigegeben_von)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (app_id, user_id) DO UPDATE SET stand = EXCLUDED.stand
     RETURNING app_id, user_id, stand, freigegeben_von, freigegeben_am, (xmax = 0) AS neu`,
    [appId, benutzerId, stand, durch ?? null]
  );
  const { neu, ...freigabe } = result.rows[0];
  if (neu) {
    logger.info(`Freigabe: App ${appId} fuer Benutzer ${benutzerId} (${stand})`);
  }
  return { freigabe, neu };
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
