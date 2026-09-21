/**
 * Der Ausweis eines Mitarbeiters ausserhalb des Browsers (Bruecke, 21.09.2026,
 * J34).
 *
 * WAS ER IST. Ein langlebiger Wert, den ein Mensch sich selbst ausstellt, je
 * Rechner einer, gesendet als `Authorization: Bearer`. Er sagt „ich bin
 * dieser Mensch" und nichts weiter -- was er damit darf, entscheidet wie
 * immer die Freigabe (`app_members`, C2) und nicht der Ausweis.
 *
 * WAS ER NICHT IST. Keine Sitzung. Er kommt nicht durch `requireAuth`, hat
 * keinen Ablauf, dreht kein CSRF-Cookie und erscheint in keiner Sitzungsliste.
 * Genau drei Wege nehmen ihn an, und sie stehen alle drei ausdruecklich im
 * Code:
 *
 *   GET /api/apps/:id/zugang    die Forward-Auth vor dem Backend einer App
 *   GET /api/apps/meine         welche Apps diesem Menschen freigegeben sind
 *   GET /api/auth/session       ob dieser Ausweis gilt, und wem er gehoert
 *
 * Jeder andere Weg des Geraets sieht einen Ausweis als das, was er dort ist:
 * kein gueltiger JWT, also 401. Das ist keine Liste, die jemand pflegen muss,
 * sondern die Bauweise -- wer den Ausweis auf einem vierten Weg annehmen
 * will, muss diese Datei dort ausdruecklich einbinden.
 *
 * DIE DRITTE ROUTE BRAUCHT EINEN SATZ. `GET /api/auth/session` oeffnet
 * nichts: sie antwortet in beiden Faellen mit 200 und sagt, ob der Aufrufer
 * angemeldet ist und wie er heisst. Das CLI der Bruecke fragt dort nach,
 * bevor es einen Ausweis ablegt (`arasul.mjs login --token-stdin`) und bei
 * jedem `status` -- ohne die Antwort legt es ein Token ab, von dem niemand
 * weiss, ob das Geraet es kennt. Eine Auskunft ueber den Ausweis selbst ist
 * kein Zugang, den er gewaehrt.
 */

const crypto = require('crypto');
const db = require('../../database');
const logger = require('../../utils/logger');

/**
 * Der Vorsatz, an dem ein Ausweis zu erkennen ist.
 *
 * Er unterscheidet ihn von den zwei anderen Dingen, die in diesem Geraet in
 * einer Kopfzeile stehen koennen: ein JWT (drei Teile mit Punkten) und ein
 * API-Schluessel (`aras_`, `middleware/apiKeyAuth.js`). Er darf mit `aras_`
 * NICHT anfangen -- sonst liefe ein Ausweis in die Pruefung der
 * API-Schluessel und bekaeme dort eine Antwort, die nichts mit ihm zu tun
 * hat.
 */
const VORSATZ = 'ausweis_';

/** Wie viele Zeichen des Klartexts als Wiedererkennung abgelegt werden. */
const PRAEFIX_LAENGE = VORSATZ.length + 6;

/**
 * Wie oft `zuletzt_benutzt_am` hoechstens nachgefuehrt wird.
 *
 * Die Forward-Auth steht vor JEDEM Aufruf an JEDE App. Ein Schreibvorgang je
 * Aufruf waere ein Schreibvorgang je Aufruf, und die Frage, die die Spalte
 * beantwortet, lautet „wird dieser Ausweis noch gebraucht" -- dafuer ist eine
 * Minute genau genug.
 */
const STEMPEL_ABSTAND = '1 minute';

/** sha256 hex. Warum nicht bcrypt: siehe Migration 182. */
function pruefsummeVon(klartext) {
  return crypto.createHash('sha256').update(klartext, 'utf8').digest('hex');
}

/**
 * Einen Ausweis ausstellen. Der Klartext kommt genau dieses eine Mal heraus.
 *
 * Er wird fuer den Menschen ausgestellt, der ihn anfordert, und fuer keinen
 * anderen -- auch ein Administrator stellt keinen fuer jemanden aus. Der
 * Grund steht im Verfahren selbst: der Wert wird einmal gezeigt, und zwar
 * dem, der vor dem Bildschirm sitzt. Ein Ausweis, den ein Administrator
 * ausstellt und weiterreicht, hat auf dem Weg dorthin in einer Mail
 * gestanden.
 *
 * @param {{benutzerId: number|string, name: string}} was
 * @returns {Promise<{id: number, name: string, praefix: string, angelegt_am: string, ausweis: string}>}
 */
async function stelleAus({ benutzerId, name }) {
  const klartext = `${VORSATZ}${crypto.randomBytes(32).toString('hex')}`;
  const ergebnis = await db.query(
    `INSERT INTO public.mitarbeiter_ausweise (user_id, name, praefix, pruefsumme)
          VALUES ($1, $2, $3, $4)
       RETURNING id, name, praefix, angelegt_am, zuletzt_benutzt_am`,
    [benutzerId, name, klartext.slice(0, PRAEFIX_LAENGE), pruefsummeVon(klartext)]
  );
  logger.info(`Ausweis ausgestellt: ${ergebnis.rows[0].praefix}*** fuer Benutzer ${benutzerId}`);
  return { ...ergebnis.rows[0], ausweis: klartext };
}

/**
 * Sieht dieser Wert aus einer Kopfzeile ueberhaupt wie ein Ausweis aus?
 *
 * Die Frage steht vor jeder Datenbankabfrage, damit ein gewoehnlicher JWT --
 * also der Normalfall -- nicht bei jedem Aufruf eine Suche nach einer
 * Pruefsumme ausloest, die es nie geben kann.
 */
function siehtAusWieAusweis(wert) {
  return typeof wert === 'string' && wert.startsWith(VORSATZ);
}

/**
 * Den Menschen hinter einem Ausweis holen, und dabei die Benutzung stempeln.
 *
 * EIN Hin und Her mit der Datenbank, nicht zwei: die Forward-Auth steht vor
 * jedem Aufruf, und zwei Abfragen waeren zwei Abfragen. Der Stempel laeuft
 * als CTE mit, und die Bedingung darin ist der Grund, warum das billig bleibt
 * -- ohne sie schriebe jede Anfrage eine Zeile.
 *
 * @returns {Promise<{benutzer: object, ausweisId: number}|null>} `null`, wenn
 *   es den Ausweis nicht (mehr) gibt oder das Konto abgeschaltet ist. Der
 *   Aufrufer macht daraus eine Antwort; hier gibt es keine.
 */
async function pruefe(klartext) {
  if (!siehtAusWieAusweis(klartext)) {
    return null;
  }
  const ergebnis = await db.query(
    `WITH treffer AS (
       SELECT id, user_id FROM public.mitarbeiter_ausweise WHERE pruefsumme = $1
     ), gestempelt AS (
       UPDATE public.mitarbeiter_ausweise
          SET zuletzt_benutzt_am = NOW()
        WHERE id IN (SELECT id FROM treffer)
          AND (zuletzt_benutzt_am IS NULL
               OR zuletzt_benutzt_am < NOW() - INTERVAL '${STEMPEL_ABSTAND}')
     )
     SELECT u.id, u.username, u.email, u.role, u.is_active,
            u.passwort_vom_admin, u.theme, t.id AS ausweis_id
       FROM treffer t
       JOIN public.admin_users u ON u.id = t.user_id`,
    [pruefsummeVon(klartext)]
  );
  const zeile = ergebnis.rows[0];
  if (!zeile || !zeile.is_active) {
    return null;
  }
  const { ausweis_id: ausweisId, ...benutzer } = zeile;
  return { benutzer, ausweisId };
}

/** Die Ausweise eines Menschen, der juengste zuerst. Ohne Pruefsumme. */
async function liste(benutzerId) {
  const ergebnis = await db.query(
    `SELECT id, name, praefix, angelegt_am, zuletzt_benutzt_am
       FROM public.mitarbeiter_ausweise
      WHERE user_id = $1
      ORDER BY angelegt_am DESC`,
    [benutzerId]
  );
  return ergebnis.rows;
}

/**
 * Alle Ausweise am Geraet, mit dem Menschen, dem sie gehoeren.
 *
 * Fuer den Administrator: er sieht, wer wo einen Ausweis liegen hat und wann
 * er zuletzt gebraucht wurde. Den Wert sieht auch er nicht -- es gibt ihn
 * nicht mehr.
 */
async function listeAlle() {
  const ergebnis = await db.query(
    `SELECT a.id, a.name, a.praefix, a.angelegt_am, a.zuletzt_benutzt_am,
            a.user_id, u.username, u.role
       FROM public.mitarbeiter_ausweise a
       JOIN public.admin_users u ON u.id = a.user_id
      ORDER BY a.angelegt_am DESC`
  );
  return ergebnis.rows;
}

/**
 * Einen Ausweis widerrufen: die Zeile faellt weg.
 *
 * `nurBenutzer` schneidet den Aufruf auf den Eigentuemer zu. Ein
 * Administrator ruft ohne ihn auf und darf damit jeden widerrufen -- das ist
 * der Sinn der Liste, die er sieht: ein Rechner, der abhanden kommt, gehoert
 * jemandem, der vielleicht gerade nicht am Geraet ist.
 *
 * @returns {Promise<object|null>} die weggefallene Zeile, oder `null`, wenn
 *   es sie nicht gab (oder sie einem anderen gehoert -- die zwei Faelle sind
 *   fuer den Aufrufer bewusst derselbe: sonst waere die Antwort eine Auskunft
 *   darueber, welche Nummern es gibt).
 */
async function widerrufe({ ausweisId, nurBenutzer = null }) {
  const bedingung = nurBenutzer === null ? '' : ' AND user_id = $2';
  const werte = nurBenutzer === null ? [ausweisId] : [ausweisId, nurBenutzer];
  const ergebnis = await db.query(
    `DELETE FROM public.mitarbeiter_ausweise
      WHERE id = $1${bedingung}
      RETURNING id, name, praefix, user_id`,
    werte
  );
  return ergebnis.rows[0] ?? null;
}

module.exports = {
  VORSATZ,
  stelleAus,
  pruefe,
  siehtAusWieAusweis,
  liste,
  listeAlle,
  widerrufe,
};
