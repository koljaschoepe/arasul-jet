/**
 * GDPR Data Export API
 * Provides DSGVO/GDPR-compliant data export for all user-related data.
 * Generates a JSON archive containing all personal data stored in the system.
 */

const { versionFuerAnzeige } = require('../../utils/version');
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, invalidateUserCache } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, ForbiddenError } = require('../../utils/errors');
const { blacklistAllUserTokens } = require('../../utils/jwt');
const { logSecurityEvent } = require('../../utils/auditLog');
const db = require('../../database');
const logger = require('../../utils/logger');

const DELETE_CONFIRMATION_TOKEN = 'LOESCHEN-BESTAETIGT';

/**
 * Platzhalter fuer anonymisierte Spalten, die NOT NULL sind.
 *
 * Kein Name, den jemand haben koennte, und kein leerer String: ein
 * leerer Wert sieht in einer Auswertung aus wie ein Fehler, ein
 * sprechender Platzhalter sagt, was geschehen ist.
 */
const ANONYM = '(geloescht)';

/**
 * GET /api/gdpr/export
 * Export all data associated with the authenticated user.
 * Returns JSON with all personal data categories.
 */
router.get(
  '/export',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    logger.info(`GDPR data export requested by user ${req.user.username}`);

    logSecurityEvent({
      userId,
      action: 'gdpr_data_export',
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    /**
     * Eine Kategorie holen. Fehler werden NICHT verschluckt.
     *
     * Bis zum 19.08.2026 stand an den meisten dieser Abfragen ein
     * `.catch(() => ({ rows: [] }))`. Dadurch sah eine Kategorie, deren SQL
     * gegen ein längst umgebautes Schema lief, im Export exakt so aus wie eine,
     * zu der es wirklich nichts gibt. Live geprüft an dem Tag: von elf
     * Kategorien waren sechs falsch — zwei brachten den Export mit 500 zum
     * Absturz (`column "model" does not exist`), vier lieferten still nichts.
     * Bei einer Auskunft nach Art. 15 ist "leer" eine Aussage. Die darf nicht
     * geraten sein, also wird ein Fehlschlag mitgeliefert und protokolliert.
     */
    //
    // Gefangen wird JEDER Fehler, nicht nur Schema-Drift: auch ein
    // Verbindungsabbruch oder ein Timeout landet als `unvollstaendig` in der
    // Antwort statt als 500. Das ist so gewollt — eine Auskunft, die zehn von
    // elf Kategorien liefert und die elfte benennt, ist mehr wert als gar
    // keine. Still ist sie dabei nie: der Grund steht in der Antwort und im
    // Protokoll.
    const unvollstaendig = [];
    const hole = async (kategorie, sql, params) => {
      try {
        return await db.query(sql, params);
      } catch (err) {
        logger.error(`GDPR-Export: Kategorie "${kategorie}" nicht lesbar: ${err.message}`);
        unvollstaendig.push({ kategorie, grund: err.message });
        return { rows: [], fehler: err.message };
      }
    };
    const block = (kategorie, result, extra = {}) => ({
      count: result.rows.length,
      ...(result.fehler ? { unvollstaendig: result.fehler } : {}),
      ...extra,
      data: result.rows,
    });

    /**
     * Die Kategorien laufen NICHT alle gleichzeitig.
     *
     * `Promise.all` über zwölf Abfragen reißt auf einer Box, auf der nebenher
     * der Ordner-Abgleich und die Metrik-Abfragen laufen, den Verbindungspool
     * leer: `database.js` klinkt bei mehr als zehn wartenden Anfragen aus
     * ("Database pool saturated"). Am 19.08.2026 sofort nach dem Deploy
     * beobachtet — Wissensräume und Projekte kamen als `unvollstaendig`
     * zurück, obwohl beide Abfragen völlig in Ordnung sind.
     *
     * Ein Datenexport ist selten und wird heruntergeladen, nicht angestarrt.
     * Drei gleichzeitig sind schnell genug und lassen dem Rest der Box Luft.
     */
    const nacheinander = async (aufgaben, gleichzeitig = 3) => {
      const ergebnisse = new Array(aufgaben.length);
      let naechste = 0;
      const arbeiter = async () => {
        while (naechste < aufgaben.length) {
          const i = naechste;
          naechste += 1;
          ergebnisse[i] = await aufgaben[i]();
        }
      };
      await Promise.all(Array.from({ length: Math.min(gleichzeitig, aufgaben.length) }, arbeiter));
      return ergebnisse;
    };

    const [
      profileResult,
      laeufeResult,
      loginHistoryResult,
      sessionsResult,
      auditResult,
      securityAuditResult,
    ] = await nacheinander([
      // 1. User profile
      () =>
        hole(
          'profil',
          `SELECT id, username, email, created_at, last_login, is_active
         FROM admin_users WHERE id = $1`,
          [userId]
        ),

      // 2. Flow-Laeufe: was der Nutzer selbst gestartet hat, mit Argumenten
      //    und Ergebnis. Chats, Anhaenge, Dokumente und KI-Erinnerungen gab es
      //    hier bis Phase B4 und B6 (26.08.2026); die Tabellen sind mit 163
      //    und 165 gefallen. Auftraege an das Sprachmodell (`llm_jobs`) leben
      //    eine Stunde und sind keine Auskunftskategorie.
      () =>
        hole(
          'laeufe',
          `SELECT id, flow_name, status, arguments, result, error, steps_used,
                  created_at, finished_at
             FROM flow_runs WHERE user_id = $1
            ORDER BY created_at DESC LIMIT 1000`,
          [userId]
        ),

      // 7. Login history (last 500)
      () =>
        hole(
          'anmeldungen',
          `SELECT username, ip_address, success, user_agent, attempted_at
         FROM login_attempts WHERE username = $1
         ORDER BY attempted_at DESC LIMIT 500`,
          [req.user.username]
        ),

      // 8. Active sessions
      () =>
        hole(
          'sitzungen',
          `SELECT token_jti, ip_address, user_agent, created_at, expires_at, last_activity
         FROM active_sessions WHERE user_id = $1
         ORDER BY created_at DESC`,
          [userId]
        ),

      // 9. API audit trail (last 1000 actions)
      () =>
        hole(
          'aktivitaet',
          `SELECT timestamp, action_type, target_endpoint, response_status, duration_ms,
                ip_address, user_agent
         FROM api_audit_logs WHERE user_id = $1
         ORDER BY timestamp DESC LIMIT 1000`,
          [userId]
        ),

      // 10. Security audit events
      () =>
        hole(
          'sicherheitsereignisse',
          `SELECT timestamp, action, details, ip_address
         FROM audit_logs WHERE user_id = $1
         ORDER BY timestamp DESC`,
          [userId]
        ),
    ]);

    const exportData = {
      _meta: {
        exportDate: new Date().toISOString(),
        exportVersion: '1.0',
        system: 'Arasul Platform',
        // Bewusst die Anzeigefassung, nicht die Vergleichszahl: dieser Export
        // geht an einen Menschen, der wissen will, welches System seine Daten
        // hatte. Auf einem Geraet ohne gesetzte Version steht hier deshalb
        // 'Vorserie' und keine erfundene 1.0.0. Wer das Feld maschinell liest,
        // muss damit rechnen, dass es keine Versionsnummer ist.
        systemVersion: versionFuerAnzeige(),
        userId,
        username: req.user.username,
        description: 'DSGVO/GDPR-konformer Datenexport aller personenbezogenen Daten',
        // Leer heißt: jede Kategorie konnte gelesen werden. Steht hier etwas,
        // ist der Export unvollständig und die Auskunft entsprechend zu geben.
        unvollstaendig,
      },
      profile: profileResult.rows[0] || null,
      flowRuns: block('laeufe', laeufeResult, {
        note:
          laeufeResult.rows.length >= 1000 ? 'Export limited to 1,000 most recent runs' : undefined,
      }),
      loginHistory: block('anmeldungen', loginHistoryResult),
      activeSessions: {
        count: sessionsResult.rows.length,
        ...(sessionsResult.fehler ? { unvollstaendig: sessionsResult.fehler } : {}),
        data: sessionsResult.rows.map(s => ({
          ...s,
          token_jti: s.token_jti ? `${s.token_jti.slice(0, 8)}...` : null, // Truncate JTI for security
        })),
      },
      activityLog: block('aktivitaet', auditResult, {
        note:
          auditResult.rows.length >= 1000
            ? 'Export limited to 1,000 most recent entries'
            : undefined,
      }),
      securityEvents: block('sicherheitsereignisse', securityAuditResult),
    };

    const filename = `arasul-gdpr-export-${req.user.username}-${new Date().toISOString().split('T')[0]}.json`;

    // Plan 023 J3: mit `?ziel=<datentraeger>` landet der Export auf einer
    // angesteckten Platte statt im Browser. Der Export selbst ist derselbe —
    // nur diese letzten Zeilen entscheiden, wohin er geht. Ihn zweimal zu bauen
    // waeren zwei Wahrheiten ueber denselben Datenbestand.
    const ziel = typeof req.query.ziel === 'string' ? req.query.ziel.trim() : '';
    if (ziel) {
      const medien = require('../../services/medien/medienService');
      const geschrieben = await medien.schreibe(
        ziel,
        filename,
        JSON.stringify(exportData, null, 2)
      );
      logSecurityEvent({
        userId,
        action: 'gdpr_data_export',
        details: { ziel: geschrieben.pfad, bytes: geschrieben.bytes },
        ipAddress: req.ip,
        requestId: req.headers['x-request-id'],
      });
      res.json({
        ok: true,
        message: `Export liegt auf "${ziel}".`,
        datei: geschrieben.pfad,
        bytes: geschrieben.bytes,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.json(exportData);
  })
);

/**
 * GET /api/gdpr/ziele
 * Welche Datenträger sind gerade angesteckt (Plan 023 J3)?
 *
 * Die Antwort trägt IMMER einen `hinweis`, wenn nichts da ist — und der
 * unterscheidet „keine Platte angesteckt" von „der Ordner ist gar nicht
 * eingebunden". Ohne diesen Unterschied sucht jemand eine Stunde am falschen
 * Ende.
 */
router.get(
  '/ziele',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = await require('../../services/medien/medienService').liste();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/gdpr/categories
 * List all data categories stored about the user (without the actual data).
 * Useful for transparency before requesting full export.
 */
router.get(
  '/categories',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Dieselben Bedingungen wie im Export — sonst nennt die Übersicht andere
    // Zahlen als die Auskunft.
    const [laeufeCount, auditCount] = await Promise.all([
      db.query('SELECT count(*) FROM flow_runs WHERE user_id = $1', [userId]),
      db.query('SELECT count(*) FROM api_audit_logs WHERE user_id = $1', [userId]),
    ]);

    res.json({
      categories: [
        { name: 'Profil', description: 'Benutzername, E-Mail, Erstelldatum', count: 1 },
        {
          name: 'Flow-Läufe',
          description: 'Selbst gestartete Flows mit Argumenten und Ergebnis',
          count: parseInt(laeufeCount.rows[0].count),
        },
        {
          name: 'Aktivitätsprotokoll',
          description: 'API-Zugriffe und Aktionen',
          count: parseInt(auditCount.rows[0].count),
        },
        { name: 'Anmeldehistorie', description: 'Login-Versuche und Sessions' },
        {
          name: 'Sicherheitsereignisse',
          description: 'Passwortänderungen, Konfigurationsänderungen',
        },
      ],
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/gdpr/me
 * DSGVO Art. 17 — Recht auf Löschung ("right to be forgotten").
 *
 * Body MUSS `{ confirm: 'LOESCHEN-BESTAETIGT' }` enthalten — verhindert
 * versehentliche Trigger via XSS, Mistypes oder fremde Browser-Sessions.
 *
 * Was passiert:
 *   - Persönliche Inhalte: Chats samt Anhängen gab es bis Phase B6, Dokumente,
 *     Wissensräume und Projekte bis Phase B4 (beide 26.08.2026). Übrig sind
 *     die Flow-Läufe des Nutzers.
 *   - Aktive Sessions des Users werden invalidiert.
 *   - Compliance-Trails (audit_logs, api_audit_logs, login_attempts) werden
 *     anonymisiert (user_id/username → NULL) statt gelöscht — DSGVO Art. 17 (3) (b)
 *     erlaubt das, wenn rechtliche Aufbewahrungspflichten greifen.
 *   - admin_users: Eigene Row wird gelöscht — ABER nur wenn nicht letzter
 *     Admin (sonst wäre die Box gemauert; Single-Box-Appliance).
 *
 * GEFUNDEN AM 22.08.2026 (Plan 023 J4): der Letzter-Admin-Schutz machte die
 * Löschung auf einem Kundengerät UNMÖGLICH: mit einem Zugang je Gerät
 * (Entscheidung E1) ist der Antragsteller immer der letzte Admin. Art. 17
 * lief damit in einen 403.
 *
 * Die Daten werden deshalb IMMER gelöscht. Nur die Zugangs-Zeile bleibt
 * stehen, wenn es die letzte ist, und die Antwort sagt das ausdrücklich. Ein
 * gemauertes Gerät wäre die schlechtere Antwort auf einen Löschantrag; ob der
 * Benutzername selbst noch stehen bleiben darf, ist eine Rechtsfrage und keine
 * Frage an den Code.
 */
router.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const username = req.user.username;
    const confirm = req.body && req.body.confirm;

    if (confirm !== DELETE_CONFIRMATION_TOKEN) {
      throw new ValidationError(
        `Bestätigung erforderlich. Body muss { "confirm": "${DELETE_CONFIRMATION_TOKEN}" } enthalten.`
      );
    }

    // Single-Box-Schutz, neu gefasst (Plan 023 J4). Der letzte Admin darf seine
    // Zugangs-Zeile nicht löschen, sonst ist das Gerät unbedienbar — seine
    // DATEN muss er trotzdem löschen können. Mit einem Zugang je Gerät
    // (Entscheidung E1) ist er sonst nämlich immer der letzte, und Art. 17
    // liefe grundsätzlich in einen 403.
    const adminCount = await db.query(
      `SELECT COUNT(*)::int AS n FROM admin_users WHERE role = 'admin' AND is_active = true`
    );
    const letzterAdmin = req.user.role === 'admin' && (adminCount.rows[0]?.n ?? 0) <= 1;

    logger.warn(`[gdpr-delete] user ${username} (id=${userId}) initiates account deletion`);

    // Auth-Invalidierung MUSS vor der Lösch-Transaktion laufen:
    // blacklistAllUserTokens liest active_sessions, um alle JTIs zu ermitteln,
    // sie in token_blacklist einzutragen UND den in-memory verifiedTokenCache
    // (60s TTL) sofort zu leeren. Die Transaktion löscht active_sessions weiter
    // unten — liefe der Aufruf danach, fände er keine Sessions mehr und der
    // aktuelle Token bliebe bis zu 60s aus dem Cache gültig. Bei Rollback der
    // Transaktion ist der User nur ausgeloggt (Account bleibt) — sicheres Fail.
    await blacklistAllUserTokens(userId);

    const summary = await db.transaction(async client => {
      const counts = {};

      // Reihenfolge folgt FK-Abhängigkeiten: erst Kinder, dann Parents.
      // Jede Query nutzt try/catch via separate Helpers wäre nicht atomar —
      // bei einer fehlenden Tabelle (Schema-Drift) lieber crashen und
      // ROLLBACK, damit nichts halb-gelöscht zurückbleibt.

      const del = async (label, sql, params) => {
        const result = await client.query(sql, params);
        counts[label] = result.rowCount || 0;
      };

      // 1) Flow-Läufe des Nutzers (die Schritte hängen per ON DELETE CASCADE
      //    daran). Chats (bis B6) sowie Dokumente, Wissensräume und Projekte
      //    (bis B4) standen hier bis zum 26.08.2026; ihre Tabellen sind mit
      //    163 und 165 gefallen.
      await del('flow_runs', `DELETE FROM flow_runs WHERE user_id = $1`, [userId]);

      // 3) Aktive Sessions invalidieren
      await del('active_sessions', `DELETE FROM active_sessions WHERE user_id = $1`, [userId]);

      // 4) Compliance-Trails anonymisieren (siehe DSGVO Art. 17 (3) (b))
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
      // 5) admin_users — eigene Row löschen (Single-Box-Schutz oben hat
      //    Zeile bleibt beim letzten Admin stehen, siehe oben.
      if (letzterAdmin) {
        counts.admin_users = 0;
      } else {
        await del('admin_users', `DELETE FROM admin_users WHERE id = $1`, [userId]);
      }

      return counts;
    });

    logSecurityEvent({
      userId: null,
      action: 'gdpr_account_deletion',
      details: { deleted_user: username, summary },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    logger.warn(
      `[gdpr-delete] user ${username} (id=${userId}) deleted; summary: ${JSON.stringify(summary)}`
    );

    // userCache (auth.js, 60s TTL) leeren, damit eine warme Cache-Entry den
    // gelöschten User nicht weiter als aktiv authentifiziert, obwohl die
    // admin_users-Row bereits weg ist. Ergänzt die Token-Invalidierung oben.
    invalidateUserCache(userId);

    // Session-Cookie räumen, damit der Client nicht weiter eingeloggt wirkt
    res.clearCookie('arasul_session');

    res.json({
      ok: true,
      message: letzterAdmin
        ? 'Alle persönlichen Daten wurden gelöscht. Der Zugang selbst bleibt ' +
          'bestehen, weil es der letzte ist und das Gerät sonst unbedienbar wäre.'
        : 'Account und alle persönlichen Daten wurden gelöscht.',
      zugangBleibt: letzterAdmin,
      summary,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
