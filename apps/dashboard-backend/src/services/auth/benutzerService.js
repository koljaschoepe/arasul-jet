/**
 * Benutzerverwaltung (Phasen C1 und C2 des Umbaus vom 26.08.2026).
 *
 * Das Geraet kennt zwei Rollen, `admin` und `mitarbeiter` (Migration 167).
 * Der Administrator legt Mitarbeiter an, setzt ihr Passwort
 * (`services/auth/passwordService.js`), legt sie still und loescht sie.
 *
 * Die Loeschung ist dieselbe wie die nach Art. 17 ueber `DELETE /api/gdpr/me`,
 * nur dass hier ein anderer sie ausloest. Deshalb liegt sie hier und nicht in
 * der Route: eine Loeschung, zwei Wege.
 *
 * Stilllegen und Loeschen sind zwei verschiedene Dinge und beide gewollt:
 * stillgelegt kommt der Mensch nicht mehr herein, seine Laeufe und Protokolle
 * bleiben; geloescht ist er weg. Wer nur sperren will, soll nicht loeschen
 * muessen.
 */

const db = require('../../database');
const { hashPassword } = require('../../utils/password');
const { blacklistAllUserTokens } = require('../../utils/jwt');
const { invalidateUserCache, ROLLEN } = require('../../middleware/auth');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * Platzhalter fuer anonymisierte Spalten, die NOT NULL sind.
 *
 * Kein Name, den jemand haben koennte, und kein leerer String: ein
 * leerer Wert sieht in einer Auswertung aus wie ein Fehler, ein
 * sprechender Platzhalter sagt, was geschehen ist.
 */
const ANONYM = '(geloescht)';

const SPALTEN = 'id, username, email, role, is_active, created_at, last_login';

async function listeBenutzer() {
  const result = await db.query(`SELECT ${SPALTEN} FROM admin_users ORDER BY id`);
  return result.rows;
}

async function holeBenutzer(userId) {
  const result = await db.query(`SELECT ${SPALTEN} FROM admin_users WHERE id = $1`, [userId]);
  if (result.rows.length === 0) {
    throw new NotFoundError(`Benutzer ${userId} gibt es nicht`);
  }
  return result.rows[0];
}

/**
 * Einen Benutzer anlegen. Ein doppelter Name wird vom Fehler-Handler als
 * 409 CONFLICT gemeldet (PG 23505), hier wird nichts vorab geprueft.
 */
async function legeBenutzerAn({ username, password, email, rolle }) {
  if (!ROLLEN.includes(rolle)) {
    throw new ValidationError(`Unbekannte Rolle ${rolle}; erlaubt sind ${ROLLEN.join(', ')}`);
  }
  const passwordHash = await hashPassword(password);
  const result = await db.query(
    `INSERT INTO admin_users (username, password_hash, email, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, NOW(), NOW())
     RETURNING ${SPALTEN}`,
    [username, passwordHash, email || null, rolle]
  );
  logger.info(`Benutzer ${username} angelegt (Rolle ${rolle})`);
  return result.rows[0];
}

/**
 * Ist das der letzte Administrator, der das Geraet noch bedienen kann?
 *
 * Der Single-Box-Schutz (Plan 023 J4) haengt an dieser einen Frage, und zwei
 * Wege stellen sie: die Loeschung und die Stilllegung. Sie steht deshalb
 * einmal hier und nicht zweimal dort.
 */
async function istLetzterAktiverAdmin(role) {
  if (role !== 'admin') {
    return false;
  }
  const adminCount = await db.query(
    `SELECT COUNT(*)::int AS n FROM admin_users WHERE role = 'admin' AND is_active = true`
  );
  return (adminCount.rows[0]?.n ?? 0) <= 1;
}

/**
 * Einen Benutzer stilllegen oder wieder zulassen (Phase C2).
 *
 * Stilllegen ist die kleinere Schwester der Loeschung: der Mensch kommt nicht
 * mehr herein (`login` antwortet 403, `requireAuth` ebenfalls), seine Daten
 * bleiben aber stehen. Fuer einen Mitarbeiter, der das Unternehmen verlaesst,
 * ist das der richtige erste Schritt — was mit seinen Laeufen geschieht,
 * entscheidet man danach in Ruhe.
 *
 * Zwei Dinge muessen dabei mitgehen, sonst ist die Stilllegung erst in einer
 * Minute wirksam: die Sitzungen (sonst laeuft sein Token weiter) und der
 * Identitaets-Zwischenspeicher in `auth.js` (60 s TTL, prueft `is_active` auf
 * dem zwischengespeicherten Stand).
 *
 * @returns {Promise<object>} die Benutzerzeile nach der Aenderung
 */
async function setzeAktiv({ userId, aktiv }) {
  const ziel = await holeBenutzer(userId);

  if (!aktiv && (await istLetzterAktiverAdmin(ziel.role))) {
    throw new ValidationError(
      'Der letzte aktive Administrator kann nicht stillgelegt werden; das Geraet waere unbedienbar'
    );
  }

  const result = await db.query(
    `UPDATE admin_users SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING ${SPALTEN}`,
    [userId, aktiv]
  );

  if (!aktiv) {
    await blacklistAllUserTokens(userId);
  }
  invalidateUserCache(userId);

  logger.warn(
    `Benutzer ${ziel.username} (id=${userId}) ${aktiv ? 'wieder zugelassen' : 'stillgelegt'}`
  );
  return result.rows[0];
}

/**
 * Einen Benutzer samt seiner Daten loeschen.
 *
 * Single-Box-Schutz (Plan 023 J4): der letzte aktive Administrator darf seine
 * Zugangs-Zeile nicht verlieren, sonst ist das Geraet unbedienbar. Seine
 * DATEN werden trotzdem geloescht, und `zugangBleibt` sagt es dem Aufrufer.
 * Mit einem Zugang je Geraet war er sonst immer der letzte, und Art. 17 lief
 * grundsaetzlich in einen 403.
 *
 * @returns {Promise<{summary: object, zugangBleibt: boolean}>}
 */
async function loescheBenutzer({ userId, username, role }) {
  const letzterAdmin = await istLetzterAktiverAdmin(role);

  logger.warn(`[benutzer-loeschung] ${username} (id=${userId}) wird geloescht`);

  // Auth-Invalidierung MUSS vor der Loesch-Transaktion laufen:
  // blacklistAllUserTokens liest active_sessions, um alle JTIs zu ermitteln,
  // sie in token_blacklist einzutragen UND den in-memory verifiedTokenCache
  // (60s TTL) sofort zu leeren. Die Transaktion loescht active_sessions weiter
  // unten; liefe der Aufruf danach, faende er keine Sessions mehr und der
  // aktuelle Token bliebe bis zu 60s aus dem Cache gueltig. Bei Rollback der
  // Transaktion ist der Nutzer nur ausgeloggt (Konto bleibt): sicheres Fail.
  await blacklistAllUserTokens(userId);

  const summary = await db.transaction(async client => {
    const counts = {};

    // Reihenfolge folgt FK-Abhaengigkeiten: erst Kinder, dann Parents. Eine
    // fehlende Tabelle (Schema-Drift) laesst die Transaktion absichtlich
    // scheitern und zurueckrollen, damit nichts halb geloescht zurueckbleibt.
    const del = async (label, sql, params) => {
      const result = await client.query(sql, params);
      counts[label] = result.rowCount || 0;
    };

    // 1) Flow-Laeufe des Nutzers (die Schritte haengen per ON DELETE CASCADE
    //    daran). Chats (bis B6) sowie Dokumente, Wissensraeume und Projekte
    //    (bis B4) standen hier bis zum 26.08.2026; ihre Tabellen sind mit
    //    163 und 165 gefallen.
    await del('flow_runs', `DELETE FROM flow_runs WHERE user_id = $1`, [userId]);

    // 2) Seine API-Schluessel. Der FK stuende sonst auf NULL (037), und ein
    //    Schluessel ohne Eigentuemer oeffnete die externe API weiter, obwohl
    //    der Mensch dahinter weg ist.
    await del('api_keys', `DELETE FROM api_keys WHERE created_by = $1`, [userId]);

    // 3) Seine Freigaben (Phase C2). `app_members.user_id` haengt per
    //    ON DELETE CASCADE an der Zeile in admin_users, waere also auch ohne
    //    diese Zeile weg. Sie steht hier, weil die Zusammenfassung sonst
    //    schweigt: eine Loeschung, die eine Kategorie nicht nennt, sieht in
    //    der Auskunft aus wie eine, zu der es nichts gab.
    await del('app_members', `DELETE FROM public.app_members WHERE user_id = $1`, [userId]);

    // 4) Aktive Sessions invalidieren
    await del('active_sessions', `DELETE FROM active_sessions WHERE user_id = $1`, [userId]);

    // 5) Compliance-Trails anonymisieren (siehe DSGVO Art. 17 (3) (b))
    const anon = async (label, sql, params) => {
      const result = await client.query(sql, params);
      counts[`anon_${label}`] = result.rowCount || 0;
    };
    await anon('audit_logs', `UPDATE audit_logs SET user_id = NULL WHERE user_id = $1`, [userId]);
    await anon('api_audit_logs', `UPDATE api_audit_logs SET user_id = NULL WHERE user_id = $1`, [
      userId,
    ]);
    // `login_attempts.username` ist NOT NULL (23.08.2026 auf dem Pruefstand
    // gefunden). Ein `SET username = NULL` liess die ganze Transaktion
    // zurueckrollen:
    //
    //   null value in column "username" of relation "login_attempts"
    //   violates not-null constraint
    //
    // Da jedes Geraet Anmeldeversuche hat, ist das kein Sonderfall: die
    // Loeschung nach Art. 17 scheiterte daran immer. Anonymisiert wird
    // deshalb mit einem festen Platzhalter statt mit NULL; die Zeile bleibt
    // fuer die Aufbewahrungspflicht erhalten und zeigt auf niemanden mehr.
    //
    // OFFEN, und ausdruecklich eine Entscheidung und keine Auslassung: die
    // Spalte `ip_address` ist ebenfalls NOT NULL und bleibt stehen. Eine
    // IP-Adresse ist ein personenbezogenes Datum. Ob die
    // Aufbewahrungspflicht (Art. 17 (3) (b)) sie deckt oder ob auch sie zu
    // ersetzen ist, ist eine Rechtsfrage und keine Frage an den Code.
    await anon('login_attempts', `UPDATE login_attempts SET username = $2 WHERE username = $1`, [
      username,
      ANONYM,
    ]);

    // 6) admin_users: die Zeile bleibt beim letzten Admin stehen, siehe oben.
    if (letzterAdmin) {
      counts.admin_users = 0;
    } else {
      await del('admin_users', `DELETE FROM admin_users WHERE id = $1`, [userId]);
    }

    return counts;
  });

  // userCache (auth.js, 60s TTL) leeren, damit eine warme Cache-Entry den
  // geloeschten Nutzer nicht weiter als aktiv authentifiziert, obwohl die
  // admin_users-Zeile bereits weg ist. Ergaenzt die Token-Invalidierung oben.
  invalidateUserCache(userId);

  logger.warn(
    `[benutzer-loeschung] ${username} (id=${userId}) geloescht; summary: ${JSON.stringify(summary)}`
  );
  return { summary, zugangBleibt: letzterAdmin };
}

module.exports = {
  listeBenutzer,
  holeBenutzer,
  legeBenutzerAn,
  setzeAktiv,
  loescheBenutzer,
  ANONYM,
};
