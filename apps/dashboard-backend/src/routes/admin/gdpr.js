/**
 * GDPR Data Export API
 * Provides DSGVO/GDPR-compliant data export for all user-related data.
 * Generates a JSON archive containing all personal data stored in the system.
 */

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

    // Collect all user-related data in parallel
    const [
      profileResult,
      chatsResult,
      messagesResult,
      attachmentsResult,
      documentsResult,
      memoriesResult,
      loginHistoryResult,
      sessionsResult,
      auditResult,
      securityAuditResult,
      spacesResult,
      projekteResult,
    ] = await Promise.all([
      // 1. User profile
      hole(
        'profil',
        `SELECT id, username, email, created_at, last_login, is_active
         FROM admin_users WHERE id = $1`,
        [userId]
      ),

      // 2. Chat conversations
      hole(
        'konversationen',
        `SELECT id, title, preferred_model, created_at, updated_at, message_count
         FROM chat_conversations WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      ),

      // 3. Chat messages (last 10000 to avoid huge exports)
      hole(
        'nachrichten',
        `SELECT m.id, m.conversation_id, m.role, m.content, m.thinking, m.status, m.created_at
         FROM chat_messages m
         JOIN chat_conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
         ORDER BY m.created_at DESC
         LIMIT 10000`,
        [userId]
      ),

      // 4. Chat attachments
      hole(
        'anhaenge',
        `SELECT a.id, a.message_id, a.filename, a.original_filename, a.mime_type,
                a.file_size, a.created_at
         FROM chat_attachments a
         JOIN chat_messages m ON m.id = a.message_id
         JOIN chat_conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
         ORDER BY a.created_at DESC`,
        [userId]
      ),

      // 5. Dokumente. Zwei Spalten, weil die Ablage zwei Wege kennt:
      //    `owner_id` (Migration 089, numerische Id) und `uploaded_by`, das
      //    einen NAMEN enthält ('admin', 'ordner-sync', 'nightrun') und keine
      //    Id. Die alte Abfrage verglich `uploaded_by` mit der Id — das trifft
      //    nie und lieferte still eine leere Liste.
      hole(
        'dokumente',
        `SELECT id, title, filename, original_filename, mime_type, file_size, status,
                uploaded_at, updated_at, category_id, chunk_count, uploaded_by, owner_id
         FROM documents
         WHERE (owner_id = $1 OR uploaded_by = $2) AND deleted_at IS NULL
         ORDER BY uploaded_at DESC`,
        [userId, req.user.username]
      ),

      // 6. KI-Erinnerungen. Die Tabelle hat KEINE Nutzerspalte — auf dieser
      //    Box gehören sie allen. Sie hier wegzulassen wäre die schlechtere
      //    Auskunft, also stehen sie vollständig drin, mit Hinweis.
      hole(
        'ki_erinnerungen',
        `SELECT id, type, content, importance, source_conversation_id, created_at, updated_at
         FROM ai_memories WHERE is_active = TRUE
         ORDER BY created_at DESC`,
        []
      ),

      // 7. Login history (last 500)
      hole(
        'anmeldungen',
        `SELECT username, ip_address, success, user_agent, attempted_at
         FROM login_attempts WHERE username = $1
         ORDER BY attempted_at DESC LIMIT 500`,
        [req.user.username]
      ),

      // 8. Active sessions
      hole(
        'sitzungen',
        `SELECT token_jti, ip_address, user_agent, created_at, expires_at, last_activity
         FROM active_sessions WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      ),

      // 9. API audit trail (last 1000 actions)
      hole(
        'aktivitaet',
        `SELECT timestamp, action_type, target_endpoint, response_status, duration_ms,
                ip_address, user_agent
         FROM api_audit_logs WHERE user_id = $1
         ORDER BY timestamp DESC LIMIT 1000`,
        [userId]
      ),

      // 10. Security audit events
      hole(
        'sicherheitsereignisse',
        `SELECT timestamp, action, details, ip_address
         FROM audit_logs WHERE user_id = $1
         ORDER BY timestamp DESC`,
        [userId]
      ),

      // 11. Wissensräume. `created_by` gibt es nicht; die Spalte heißt seit
      //     Migration 089 `owner_id`.
      hole(
        'wissensraeume',
        `SELECT id, name, slug, description, document_count, created_at, updated_at
         FROM knowledge_spaces WHERE owner_id = $1
         ORDER BY created_at DESC`,
        [userId]
      ),

      // 12. Projekte. Die Doku führt sie seit jeher als Kategorie, der Export
      //     lieferte sie nie. `projects` hat keine Besitzerspalte (Migration 089
      //     hat sie für diese Tabelle nie angelegt), also boxweit mit Hinweis —
      //     wie bei den KI-Erinnerungen.
      hole(
        'projekte',
        `SELECT id, name, slug, description, is_default, created_at, updated_at
         FROM projects ORDER BY created_at DESC`,
        []
      ),
    ]);

    const exportData = {
      _meta: {
        exportDate: new Date().toISOString(),
        exportVersion: '1.0',
        system: 'Arasul Platform',
        systemVersion: process.env.SYSTEM_VERSION || '1.0.0',
        userId,
        username: req.user.username,
        description: 'DSGVO/GDPR-konformer Datenexport aller personenbezogenen Daten',
        // Leer heißt: jede Kategorie konnte gelesen werden. Steht hier etwas,
        // ist der Export unvollständig und die Auskunft entsprechend zu geben.
        unvollstaendig,
      },
      profile: profileResult.rows[0] || null,
      conversations: block('konversationen', chatsResult),
      messages: block('nachrichten', messagesResult, {
        note:
          messagesResult.rows.length >= 10000
            ? 'Export limited to 10,000 most recent messages'
            : undefined,
      }),
      attachments: block('anhaenge', attachmentsResult, {
        note: 'File contents are stored in MinIO — this export contains metadata only. Request file export separately if needed.',
      }),
      documents: block('dokumente', documentsResult, {
        note: 'Document files are stored in MinIO — this export contains metadata only.',
      }),
      aiMemories: block('ki_erinnerungen', memoriesResult, {
        note: 'Diese Box führt KI-Erinnerungen ohne Nutzerbindung — der Export enthält daher alle aktiven Einträge.',
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
      knowledgeSpaces: block('wissensraeume', spacesResult),
      projects: block('projekte', projekteResult, {
        note: 'Projekte sind auf dieser Box nicht nutzergebunden — der Export enthält daher alle.',
      }),
    };

    // Set headers for download
    const filename = `arasul-gdpr-export-${req.user.username}-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.json(exportData);
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
    // Zahlen als die Auskunft. `documents.uploaded_by` enthält einen Namen,
    // keine Id; `ai_memories` hat gar keine Nutzerspalte.
    const [chatCount, docCount, memoryCount, auditCount] = await Promise.all([
      db.query('SELECT count(*) FROM chat_conversations WHERE user_id = $1', [userId]),
      db.query(
        `SELECT count(*) FROM documents
          WHERE (owner_id = $1 OR uploaded_by = $2) AND deleted_at IS NULL`,
        [userId, req.user.username]
      ),
      db.query('SELECT count(*) FROM ai_memories WHERE is_active = TRUE'),
      db.query('SELECT count(*) FROM api_audit_logs WHERE user_id = $1', [userId]),
    ]);

    res.json({
      categories: [
        { name: 'Profil', description: 'Benutzername, E-Mail, Erstelldatum', count: 1 },
        {
          name: 'Chat-Konversationen',
          description: 'Alle Gespräche mit der KI',
          count: parseInt(chatCount.rows[0].count),
        },
        {
          name: 'Dokumente',
          description: 'Hochgeladene Dateien (Metadaten)',
          count: parseInt(docCount.rows[0].count),
        },
        {
          name: 'KI-Erinnerungen',
          description:
            'Vom KI-Assistenten gespeicherte Informationen (boxweit, ohne Nutzerbindung)',
          count: parseInt(memoryCount.rows[0].count),
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
 *   - Persönliche Inhalte werden gelöscht (Chats, Dokumenten-Metadaten,
 *     KI-Memories, Knowledge-Spaces, Projekte).
 *   - Aktive Sessions des Users werden invalidiert.
 *   - Compliance-Trails (audit_logs, api_audit_logs, login_attempts) werden
 *     anonymisiert (user_id/username → NULL) statt gelöscht — DSGVO Art. 17 (3) (b)
 *     erlaubt das, wenn rechtliche Aufbewahrungspflichten greifen.
 *   - rag_query_log: user_id → NULL (Plaintext ist seit Phase 5.2 schon
 *     anonymisiert).
 *   - admin_users: Eigene Row wird gelöscht — ABER nur wenn nicht letzter
 *     Admin (sonst wäre die Box gemauert; Single-Box-Appliance).
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

    // Single-Box-Schutz: letzter Admin darf sich nicht selbst löschen, sonst
    // ist die Appliance unbedienbar. User muss erst einen anderen Admin anlegen.
    const adminCount = await db.query(
      `SELECT COUNT(*)::int AS n FROM admin_users WHERE role = 'admin' AND is_active = true`
    );
    if (req.user.role === 'admin' && (adminCount.rows[0]?.n ?? 0) <= 1) {
      throw new ForbiddenError(
        'Du bist der letzte aktive Admin. Lege erst einen Ersatz-Admin an, sonst ist die Box danach unbedienbar.'
      );
    }

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

      // 1) Chat-Stack
      await del(
        'chat_attachments',
        `DELETE FROM chat_attachments
          WHERE message_id IN (
            SELECT m.id FROM chat_messages m
            JOIN chat_conversations c ON c.id = m.conversation_id
            WHERE c.user_id = $1
          )`,
        [userId]
      );
      await del(
        'chat_messages',
        `DELETE FROM chat_messages
          WHERE conversation_id IN (
            SELECT id FROM chat_conversations WHERE user_id = $1
          )`,
        [userId]
      );
      await del('chat_conversations', `DELETE FROM chat_conversations WHERE user_id = $1`, [
        userId,
      ]);

      // 2) Documents — Metadaten löschen. Single-Box: documents.uploaded_by
      //    ist die einzige user-gebundene Spalte; ai_memories und knowledge_spaces
      //    sind Box-weit (kein user_id-Feld) und werden vom
      //    Single-Box-Schutz oben ohnehin auf einem Nachfolge-Admin "vererbt".
      //    MinIO-Files bleiben (Cleanup ist follow-up Phase 5.7); für DSGVO ist
      //    die DB-Löschung der entscheidende Schritt, weil MinIO-Objekte ohne
      //    Metadata-Referenz nicht mehr addressierbar sind.
      await del('documents', `DELETE FROM documents WHERE uploaded_by = $1`, [userId]);

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
      await anon(
        'login_attempts',
        `UPDATE login_attempts SET username = NULL WHERE username = $1`,
        [username]
      );
      await anon('rag_query_log', `UPDATE rag_query_log SET user_id = NULL WHERE user_id = $1`, [
        userId,
      ]);

      // 5) admin_users — eigene Row löschen (Single-Box-Schutz oben hat
      //    sichergestellt, dass es nicht der letzte Admin ist).
      await del('admin_users', `DELETE FROM admin_users WHERE id = $1`, [userId]);

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
      message: 'Account und alle persönlichen Daten wurden gelöscht.',
      summary,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
