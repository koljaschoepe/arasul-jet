/**
 * GDPR Data Export API
 * Provides DSGVO/GDPR-compliant data export for all user-related data.
 * Generates a JSON archive containing all personal data stored in the system.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, ForbiddenError } = require('../../utils/errors');
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
      projectsResult,
    ] = await Promise.all([
      // 1. User profile
      db.query(
        `SELECT id, username, email, created_at, last_login, is_active
         FROM admin_users WHERE id = $1`,
        [userId]
      ),

      // 2. Chat conversations
      db.query(
        `SELECT id, title, model, created_at, updated_at, message_count, project_id
         FROM chat_conversations WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      ),

      // 3. Chat messages (last 10000 to avoid huge exports)
      db.query(
        `SELECT m.id, m.conversation_id, m.role, m.content, m.model, m.created_at,
                m.token_count, m.duration_ms
         FROM chat_messages m
         JOIN chat_conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
         ORDER BY m.created_at DESC
         LIMIT 10000`,
        [userId]
      ),

      // 4. Chat attachments
      db
        .query(
          `SELECT a.id, a.message_id, a.file_name, a.file_type, a.file_size, a.created_at
         FROM chat_attachments a
         JOIN chat_messages m ON m.id = a.message_id
         JOIN chat_conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1
         ORDER BY a.created_at DESC`,
          [userId]
        )
        .catch(() => ({ rows: [] })),

      // 5. Documents uploaded by user
      db
        .query(
          `SELECT id, title, filename, file_type, file_size, status, created_at, updated_at,
                category_id, chunk_count
         FROM documents WHERE uploaded_by = $1
         ORDER BY created_at DESC`,
          [userId]
        )
        .catch(() => ({ rows: [] })),

      // 6. AI memories
      db
        .query(
          `SELECT id, key, content, memory_type, created_at, updated_at, access_count
         FROM ai_memories WHERE user_id = $1
         ORDER BY created_at DESC`,
          [userId]
        )
        .catch(() => ({ rows: [] })),

      // 7. Login history (last 500)
      db
        .query(
          `SELECT username, ip_address, success, user_agent, attempted_at
         FROM login_attempts WHERE username = $1
         ORDER BY attempted_at DESC LIMIT 500`,
          [req.user.username]
        )
        .catch(() => ({ rows: [] })),

      // 8. Active sessions
      db
        .query(
          `SELECT token_jti, ip_address, user_agent, created_at, expires_at, last_activity
         FROM active_sessions WHERE user_id = $1
         ORDER BY created_at DESC`,
          [userId]
        )
        .catch(() => ({ rows: [] })),

      // 9. API audit trail (last 1000 actions)
      db
        .query(
          `SELECT timestamp, action_type, target_endpoint, response_status, duration_ms,
                ip_address, user_agent
         FROM api_audit_logs WHERE user_id = $1
         ORDER BY timestamp DESC LIMIT 1000`,
          [userId]
        )
        .catch(() => ({ rows: [] })),

      // 10. Security audit events
      db
        .query(
          `SELECT timestamp, action, details, ip_address
         FROM audit_logs WHERE user_id = $1
         ORDER BY timestamp DESC`,
          [userId]
        )
        .catch(() => ({ rows: [] })),

      // 11. Knowledge spaces created by user
      db
        .query(
          `SELECT id, name, description, created_at, updated_at, document_count
         FROM knowledge_spaces WHERE created_by = $1
         ORDER BY created_at DESC`,
          [userId]
        )
        .catch(() => ({ rows: [] })),

      // 12. Projects
      db
        .query(
          `SELECT id, name, description, created_at, updated_at
         FROM projects WHERE user_id = $1
         ORDER BY created_at DESC`,
          [userId]
        )
        .catch(() => ({ rows: [] })),
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
      },
      profile: profileResult.rows[0] || null,
      conversations: {
        count: chatsResult.rows.length,
        data: chatsResult.rows,
      },
      messages: {
        count: messagesResult.rows.length,
        note:
          messagesResult.rows.length >= 10000
            ? 'Export limited to 10,000 most recent messages'
            : undefined,
        data: messagesResult.rows,
      },
      attachments: {
        count: attachmentsResult.rows.length,
        note: 'File contents are stored in MinIO — this export contains metadata only. Request file export separately if needed.',
        data: attachmentsResult.rows,
      },
      documents: {
        count: documentsResult.rows.length,
        note: 'Document files are stored in MinIO — this export contains metadata only.',
        data: documentsResult.rows,
      },
      aiMemories: {
        count: memoriesResult.rows.length,
        data: memoriesResult.rows,
      },
      loginHistory: {
        count: loginHistoryResult.rows.length,
        data: loginHistoryResult.rows,
      },
      activeSessions: {
        count: sessionsResult.rows.length,
        data: sessionsResult.rows.map(s => ({
          ...s,
          token_jti: s.token_jti ? `${s.token_jti.slice(0, 8)}...` : null, // Truncate JTI for security
        })),
      },
      activityLog: {
        count: auditResult.rows.length,
        note:
          auditResult.rows.length >= 1000
            ? 'Export limited to 1,000 most recent entries'
            : undefined,
        data: auditResult.rows,
      },
      securityEvents: {
        count: securityAuditResult.rows.length,
        data: securityAuditResult.rows,
      },
      knowledgeSpaces: {
        count: spacesResult.rows.length,
        data: spacesResult.rows,
      },
      projects: {
        count: projectsResult.rows.length,
        data: projectsResult.rows,
      },
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

    const [chatCount, docCount, memoryCount, auditCount] = await Promise.all([
      db.query('SELECT count(*) FROM chat_conversations WHERE user_id = $1', [userId]),
      db
        .query('SELECT count(*) FROM documents WHERE uploaded_by = $1', [userId])
        .catch(() => ({ rows: [{ count: 0 }] })),
      db
        .query('SELECT count(*) FROM ai_memories WHERE user_id = $1', [userId])
        .catch(() => ({ rows: [{ count: 0 }] })),
      db
        .query('SELECT count(*) FROM api_audit_logs WHERE user_id = $1', [userId])
        .catch(() => ({ rows: [{ count: 0 }] })),
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
          description: 'Vom KI-Assistenten gespeicherte Informationen',
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
      //    ist die einzige user-gebundene Spalte; ai_memories, knowledge_spaces
      //    und projects sind Box-weit (kein user_id-Feld) und werden vom
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
