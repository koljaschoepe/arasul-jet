/**
 * Bootstrap - runs migrations and ensures admin user exists on startup.
 * Solves two problems:
 * 1. Docker init scripts only run on FIRST database creation — the migration
 *    runner catches new migrations on software updates.
 * 2. No admin user exists on fresh deploy (chicken-and-egg with Setup Wizard).
 */

const db = require('./database');
const { hashPassword } = require('./utils/password');
const { runMigrations } = require('./migrationRunner');
const logger = require('./utils/logger');
const systemSettings = require('./services/system-settings/systemSettingsService');

const DEFAULT_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_EMAIL = process.env.ADMIN_EMAIL || 'admin@arasul.local';

/**
 * Fehler, die "noch nicht bereit" heissen und nicht "kaputt".
 *
 * Postgres startet bei einer FRISCHEN Datenbank zweimal: erst ein
 * Uebergangs-Server fuer die Init-Skripte, dann der richtige. Der
 * Healthcheck kann in der ersten Phase gruen werden, und die Verbindung
 * danach trotzdem abgewiesen. `depends_on: service_healthy` schuetzt davor
 * nicht.
 *
 * 57P03 ist `cannot_connect_now` (Postgres faehrt gerade hoch),
 * 53300 `too_many_connections`.
 */
const NOCH_NICHT_BEREIT = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  '57P03',
  '53300',
]);

// Beim AUFRUF gelesen, nicht beim Laden des Moduls. Zwei Gruende, und der
// zweite wiegt schwerer: ein Wert in der `.env` des Geraets wirkt sofort, und
// ein Test kann die Wartezeit wirklich verkuerzen. Der erste Entwurf las beim
// Laden, und die Bootstrap-Tests warteten trotz `BOOTSTRAP_DB_WARTE_MS=1` je
// drei Sekunden echt; im vollen Lauf lief dadurch eine fremde Testdatei in ihr
// Zeitlimit.
const warteVersuche = () => parseInt(process.env.BOOTSTRAP_DB_VERSUCHE || '10', 10);
const warteMs = () => parseInt(process.env.BOOTSTRAP_DB_WARTE_MS || '3000', 10);

/**
 * Migrationen fahren, und dabei auf die Datenbank warten statt aufzugeben.
 *
 * Der Unterschied ist der ganze Punkt: eine NICHT ERREICHBARE Datenbank ist
 * kein schiefes Schema. Eine gescheiterte Migration wird NICHT wiederholt, die
 * bleibt ein harter Halt.
 *
 * Am 23.08.2026 auf dem Pruefstand zweimal in Folge beobachtet: der Stack kam
 * frisch hoch, `runMigrations` bekam `ECONNREFUSED`, und damit wurde KEIN
 * Administrator ab Werk angelegt. Auf einem Kundengeraet ist das der erste
 * Start nach dem Werksreset: das Geraet zeigt die Ersteinrichtung, und das
 * Konto ab Werk entsteht nie. Es half nur ein Neustart von Hand.
 *
 * @returns {Promise<object>} Ergebnis von `runMigrations`
 */
async function migrationenMitGeduld() {
  const versuche = warteVersuche();
  const pause = warteMs();
  let letzter = null;
  for (let versuch = 1; versuch <= versuche; versuch += 1) {
    try {
      return await runMigrations(db.pool);
    } catch (error) {
      const kennung = error && (error.code || '');
      if (!NOCH_NICHT_BEREIT.has(kennung) || versuch === versuche) {
        throw error;
      }
      letzter = error;
      logger.warn(
        `Bootstrap: Datenbank noch nicht bereit (${kennung}), Versuch ` +
          `${versuch} von ${versuche}, naechster in ${pause} ms`
      );
      await new Promise(r => {
        setTimeout(r, pause);
      });
    }
  }
  throw letzter;
}

/**
 * Run pending database migrations, then ensure admin user exists.
 */
async function bootstrap() {
  // Step 1: Run any pending migrations
  //
  // `schemaKaputt` ist kein Protokollvermerk, sondern eine Sperre. Steht das
  // Schema schief, wird KEIN Administrator ab Werk angelegt (Schritt 3).
  // Warum das wichtiger ist, als es klingt: am 20.08.2026 lief auf dem
  // Pruefstand ein fabrikneues Geraet, der Kunde legte sein Konto an, und ein
  // einziger Neustart machte daraus einen Zustand, in dem sein Konto in einer
  // verdeckten Tabelle unsichtbar wurde und an seiner Stelle ein Konto `admin`
  // mit dem Passwort ab Werk entstand. Ein Geraet, das nicht startet, ist ein
  // Ruf beim Support. Ein Geraet, das sich mit einem werksbekannten Passwort
  // oeffnen laesst, waehrend der Besitzer ausgesperrt ist, ist etwas anderes.
  let schemaKaputt = null;
  try {
    const result = await migrationenMitGeduld();
    if (result.failed) {
      schemaKaputt = `Migration ${result.failed} ist gescheitert`;
    } else if (result.schatten && result.schatten.length > 0) {
      schemaKaputt = `${result.schatten.length} Tabelle(n) liegen doppelt in arasul und public (${result.schatten.join(', ')})`;
    }
  } catch (error) {
    schemaKaputt = `Migrationslauf abgebrochen: ${error.message}`;
    logger.error(`Bootstrap: Migration runner error: ${error.message}`);
  }

  // Step 2: Load system_settings cache (after migration 094 has applied its columns)
  try {
    await systemSettings.load();
  } catch (error) {
    logger.error(`Bootstrap: system_settings load error: ${error.message}`);
  }

  // Step 3: Ensure admin user exists
  if (schemaKaputt) {
    logger.error(
      `Bootstrap: KEIN Administrator ab Werk angelegt. ${schemaKaputt}. ` +
        'Solange der Schemastand nicht belegt ist, darf hier kein Konto mit ' +
        'einem werksbekannten Passwort entstehen. Das Geraet zeigt stattdessen ' +
        'die Ersteinrichtung. Ursache beheben, dann neu starten.'
    );
  } else {
    await ensureAdminUser();
  }

  // Step 4: Reconcile optionale App-Container (z. B. n8n) an den gespeicherten
  // Aktivierungszustand. Lizenzsauber: n8n läuft nur, wenn die Extension aktiv
  // ist — ist sie deaktiviert (Default für frische Boxen), wird der Container
  // gestoppt. Best-effort, blockiert den Boot nie.
  try {
    const appLifecycle = require('./services/app/appLifecycleService');
    await appLifecycle.reconcileApps();
  } catch (error) {
    logger.error(`Bootstrap: App-Container-Reconcile error: ${error.message}`);
  }

  // Step 5 ist entfallen (Plan 023 B4, Entscheidung E6): der Start legte hier
  // fünf Beispiel-Flows im Flow-Ordner an. Ab Werk ist nichts enthalten. Die
  // Vorlagen gibt es weiter, aber als Angebot im Anlege-Dialog
  // (`services/flows/beispielKatalog.js`, `GET /api/flows/beispiele`), nicht
  // als Lieferumfang. Ohne diese Streichung stellt ein Werksreset den
  // Auslieferungszustand her und der nächste Start macht ihn wieder kaputt.

  // Step 6: Verwaiste Terminal-Sitzungen schließen (Plan 017 Schritt 1).
  // Nach einem Backend-Neustart ist jede WebSocket-Verbindung tot — 'active'-
  // Zeilen aus der Vorgänger-Instanz sind Geister. Erst die vorhandene
  // SQL-Funktion (Container nicht mehr running), dann der Rest (Container
  // läuft zwar noch, aber niemand ist verbunden). Best-effort.
  try {
    await db.query('SELECT cleanup_stale_sandbox_sessions()');
    const orphaned = await db.query(
      `UPDATE sandbox_terminal_sessions SET status = 'closed', ended_at = NOW()
       WHERE status = 'active'`
    );
    if (orphaned.rowCount > 0) {
      logger.info(`Bootstrap: ${orphaned.rowCount} verwaiste Terminal-Sitzung(en) geschlossen`);
    }
  } catch (error) {
    logger.error(`Bootstrap: Terminal-Sitzungs-Cleanup error: ${error.message}`);
  }

  // Step 7: Sandbox-Container an Workspace-Projekte koppeln (Plan 018:
  // Projekt-Vereinheitlichung). Nach der Umstellung leitet das Terminal seinen
  // Container aus dem aktiven Workspace-Projekt ab — jeder bisher eigenständige
  // Container braucht daher eine 1:1-Kopplung. Idempotent + best-effort.
  try {
    const { backfillProjectLinks } = require('./services/sandbox/sandboxBackfill');
    await backfillProjectLinks();
  } catch (error) {
    logger.error(`Bootstrap: Sandbox-Projekt-Backfill error: ${error.message}`);
  }

  // Step 8: Bruecken-Bibliothek in der kanonischen Werkstatt nachziehen
  // (23.08.2026). Die Vorlagen werden sonst nur EINMAL ausgesaet und danach nie
  // ueberschrieben; eine Werkstatt, die es schon gibt, bekaeme neue
  // Bruecken-Faehigkeiten nie zu sehen. Hier, weil der Start der einzige
  // Zeitpunkt ist, den jedes Geraet durchlaeuft — ein Flow in genau diesem
  // Ordner ist keiner.
  try {
    const path = require('path');
    const { SANDBOX_DATA_DIR } = require('./services/sandbox/sandboxShared');
    const { aktualisiereBrueckeClient } = require('./services/sandbox/sandboxService');
    const werkstatt = path.join(SANDBOX_DATA_DIR, 'werkstatt');
    if (require('fs').existsSync(werkstatt)) {
      aktualisiereBrueckeClient(werkstatt);
    }
  } catch (error) {
    logger.warn(`Bootstrap: Bruecken-Client nicht nachgezogen: ${error.message}`);
  }
}

/**
 * Steht der Werksreset-Merker? Fehlt die Tabelle (sehr alte Datenbank, bevor
 * Migration 146 lief), gilt: kein Merker. Das ist der Zustand von vorher und
 * damit die richtige Vorgabe.
 */
async function werksresetSteht() {
  try {
    const { rows } = await db.query('SELECT werksreset_am FROM arasul.geraet WHERE id = 1');
    return Boolean(rows[0]?.werksreset_am);
  } catch (error) {
    logger.debug(`Bootstrap: Geraetezustand nicht lesbar (${error.message})`);
    return false;
  }
}

async function ensureAdminUser() {
  try {
    // Check if any admin user exists
    const result = await db.query('SELECT COUNT(*) as count FROM admin_users');
    const count = parseInt(result.rows[0].count, 10);

    if (count > 0) {
      logger.debug(`Bootstrap: ${count} admin user(s) exist, skipping`);
      return;
    }

    // Nach einem Werksreset gibt es absichtlich keinen Administrator. Ohne
    // diese Abfrage legte der naechste Start ihn wieder an, mit dem alten
    // Passwort, und ein weitergegebenes Geraet liesse sich vom Vorbesitzer
    // weiter oeffnen. Gefunden in der Live-Abnahme am 19.08.2026: das
    // Entwerten in der .env allein reicht nicht, dasselbe Passwort kommt
    // zusaetzlich als Docker-Secret (ADMIN_PASSWORD_FILE) herein.
    // Den Merker loescht die Ersteinrichtung (services/auth/setupService.js).
    if (await werksresetSteht()) {
      logger.info(
        'Bootstrap: Werksreset vermerkt, es wird kein Administrator angelegt. ' +
          'Der naechste Aufruf zeigt die Ersteinrichtung.'
      );
      return;
    }

    // No admin users - create one
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password === 'REDACTED_AFTER_BOOTSTRAP') {
      logger.error(
        'Bootstrap: No admin users exist and ADMIN_PASSWORD is not available. ' +
          'Re-run "./arasul setup" and "./arasul bootstrap" to create an admin user.'
      );
      return;
    }

    const passwordHash = await hashPassword(password);

    await db.query(
      `INSERT INTO admin_users (username, password_hash, email, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW())
       ON CONFLICT (username) DO NOTHING`,
      [DEFAULT_USERNAME, passwordHash, DEFAULT_EMAIL]
    );

    logger.info(`Bootstrap: Created initial admin user "${DEFAULT_USERNAME}"`);

    // Remove plaintext password from process environment
    delete process.env.ADMIN_PASSWORD;
    logger.info('Bootstrap: ADMIN_PASSWORD removed from process environment');
  } catch (error) {
    // Table might not exist yet on very first run - don't crash
    if (error.message && error.message.includes('does not exist')) {
      logger.warn('Bootstrap: admin_users table not yet created, will retry on next start');
    } else {
      logger.error(`Bootstrap: Failed to ensure admin user: ${error.message}`);
    }
  }
}

// `migrationenMitGeduld` steht unter Test: der Unterschied zwischen "noch
// nicht bereit" und "kaputt" entscheidet, ob ein frisches Geraet seinen
// Administrator bekommt.
module.exports = { bootstrap, ensureAdminUser, migrationenMitGeduld };
