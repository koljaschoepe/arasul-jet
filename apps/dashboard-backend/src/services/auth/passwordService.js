/**
 * Password Service
 * Consolidated dashboard password change logic used by auth and settings routes.
 *
 * Zwei Wege fuehren hier herein, und sie unterscheiden sich in genau einem
 * Punkt (Phase C2, 27.08.2026):
 *
 *   changeDashboardPassword  Der Mensch wechselt SEIN Passwort. Er kennt das
 *                            alte, also wird es geprueft, und das neue muss
 *                            den Komplexitaetsregeln genuegen.
 *   setzePasswort            Der Administrator setzt das Passwort eines
 *                            ANDEREN. Er kennt das alte nicht und soll es
 *                            nicht kennen; geprueft wird nur, dass er
 *                            Administrator ist (`requireRole` an der Route).
 *
 * Geschrieben wird in beiden Faellen durch `schreibePasswort`: ein Hash, eine
 * Transaktion, ein Eintrag in `password_history`. Zwei Schreibwege waeren zwei
 * Gelegenheiten, die Historie zu vergessen.
 */

const db = require('../../database');
const {
  verifyPassword,
  hashPassword,
  validatePasswordComplexity,
} = require('../../utils/password');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * Change dashboard admin password
 *
 * Validates inputs, verifies current password, hashes new password,
 * updates the database and records in password history (atomically).
 *
 * @param {number} userId - admin_users.id
 * @param {string} currentPassword - plaintext current password
 * @param {string} newPassword - plaintext new password
 * @param {object} options
 * @param {string} options.username - for audit logging and history
 * @param {string} [options.ipAddress] - for password history
 * @returns {Promise<string>} the new password hash (for callers that need it)
 */
async function changeDashboardPassword(
  userId,
  currentPassword,
  newPassword,
  { username, ipAddress } = {}
) {
  // Validate input
  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  // Validate new password complexity
  const validation = validatePasswordComplexity(newPassword);
  if (!validation.valid) {
    throw new ValidationError('Password does not meet complexity requirements', validation.errors);
  }

  // Get user's current password hash
  const result = await db.query('SELECT password_hash FROM admin_users WHERE id = $1', [userId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  const { password_hash } = result.rows[0];

  // Verify current password
  const passwordValid = await verifyPassword(currentPassword, password_hash);
  if (!passwordValid) {
    logger.warn(`Failed password change attempt for user: ${username || userId}`);
    throw new UnauthorizedError('Current password is incorrect');
  }

  // Check if new password is same as current
  const sameAsOld = await verifyPassword(newPassword, password_hash);
  if (sameAsOld) {
    throw new ValidationError('New password must be different from current password');
  }

  return schreibePasswort(userId, newPassword, { changedBy: username, ipAddress });
}

/**
 * Ein Passwort setzen, ohne das alte zu kennen — der Weg des Administrators.
 *
 * Die Komplexitaetsregeln gelten hier NICHT, und das ist dieselbe Entscheidung
 * wie beim Anlegen eines Benutzers (`schemas/benutzer.js`, Phase C1): der
 * Administrator vergibt ein Startpasswort, das der Mitarbeiter ueber
 * `POST /api/auth/change-password` wechselt — und dort greifen die Regeln.
 * Eine strengere Regel auf dem Setz-Weg als auf dem Anlege-Weg waere eine
 * Huerde ohne Wirkung: wer ein schwaches Passwort vergeben will, legt sonst
 * den Benutzer neu an.
 *
 * Die Laenge prueft das Zod-Schema an der Route (mindestens acht Zeichen).
 *
 * Gibt den betroffenen Benutzer zurueck, nicht den Hash: der Aufrufer braucht
 * den Namen fuers Protokoll und die Antwort, und diese Abfrage prueft ohnehin,
 * dass es ihn gibt. Ihn davor noch einmal zu holen waere ein zweiter Weg zur
 * Datenbank fuer dieselbe Zeile.
 *
 * @param {number|string} userId - admin_users.id des Benutzers, dessen Passwort gesetzt wird
 * @param {string} neuesPasswort - Klartext
 * @param {object} options
 * @param {string} options.gesetztVon - Benutzername des Administrators, fuer die Historie
 * @param {string} [options.ipAddress]
 * @returns {Promise<{id: string, username: string}>} der betroffene Benutzer
 */
async function setzePasswort(userId, neuesPasswort, { gesetztVon, ipAddress } = {}) {
  if (!neuesPasswort) {
    throw new ValidationError('Passwort fehlt');
  }

  const result = await db.query('SELECT id, username FROM admin_users WHERE id = $1', [userId]);
  if (result.rows.length === 0) {
    throw new NotFoundError(`Benutzer ${userId} gibt es nicht`);
  }
  const ziel = result.rows[0];

  await schreibePasswort(userId, neuesPasswort, { changedBy: gesetztVon, ipAddress });
  logger.warn(
    `Passwort von ${ziel.username} (id=${userId}) gesetzt durch ${gesetztVon || 'unbekannt'}`
  );
  return ziel;
}

/**
 * Der eine Schreibweg: hashen, Zeile aktualisieren, Historie schreiben — in
 * EINER Transaktion. `changed_by` haelt fest, WER geschrieben hat; beim
 * Selbstwechsel ist das der Mensch selbst, beim Setzen der Administrator.
 */
async function schreibePasswort(userId, newPassword, { changedBy, ipAddress } = {}) {
  const newPasswordHash = await hashPassword(newPassword);

  await db.transaction(async client => {
    const geaendert = await client.query(
      'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, userId]
    );

    // Zwischen der Existenzpruefung des Aufrufers und diesem UPDATE kann der
    // Benutzer geloescht worden sein. Ohne diese Zeile aktualisierte das UPDATE
    // still null Zeilen, und der Eintrag in die Historie darunter lief in eine
    // Fremdschluessel-Verletzung -- ein 400 mit einer Meldung ueber eine
    // Datenbankspalte, wo ein 404 hingehoert. Der Wurf rollt die Transaktion
    // zurueck, also bleibt nichts halb geschrieben.
    if (geaendert.rowCount === 0) {
      throw new NotFoundError(`Benutzer ${userId} gibt es nicht (mehr)`);
    }

    await client.query(
      `INSERT INTO password_history (user_id, password_hash, changed_by, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [userId, newPasswordHash, changedBy || null, ipAddress || null]
    );
  });

  // Der Betroffene, nicht der Handelnde. `changedBy` ist beim Selbstwechsel
  // derselbe Mensch, beim Setzen durch den Administrator aber DESSEN Name --
  // die Zeile las sich dann wie "das Passwort von admin wurde geaendert",
  // obwohl es das von mia war. Im Protokoll (`password_history.changed_by`)
  // stand es immer richtig; hier nicht, und wer bei einem Vorfall die Logs
  // liest, liest zuerst hier.
  logger.info(`Passwort geaendert fuer Benutzer id=${userId} (durch ${changedBy || 'ihn selbst'})`);

  return newPasswordHash;
}

module.exports = { changeDashboardPassword, setzePasswort };
