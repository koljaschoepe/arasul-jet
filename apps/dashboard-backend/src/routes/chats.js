/**
 * Chat Management API routes
 * Handles multi-chat conversations and message persistence
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const llmJobService = require('../services/llm/llmJobService');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError, ServiceUnavailableError } = require('../utils/errors');
const { buildSetClauses } = require('../utils/queryBuilder');

// PHASE3-FIX: Input validation helper for conversation_id
function isValidConversationId(id) {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0 && parsed <= 2147483647 && String(parsed) === String(id);
}

// Helper: verify conversation belongs to requesting user
async function verifyOwnership(conversationId, userId) {
  const { rows } = await db.query(
    'SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [conversationId, userId]
  );
  if (!rows.length) {
    throw new NotFoundError('Chat not found');
  }
}

// Helper: get default project ID
async function getDefaultProjectId() {
  const { rows } = await db.query('SELECT id FROM projects WHERE is_default = TRUE LIMIT 1');
  if (!rows.length) {
    throw new ServiceUnavailableError('Kein Standard-Projekt gefunden');
  }
  return rows[0].id;
}

// GET /api/chats - Get all chat conversations
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { project_id } = req.query;

    let query = `SELECT id, title, project_id, created_at, updated_at, message_count
         FROM chat_conversations
         WHERE deleted_at IS NULL AND user_id = $1`;
    const params = [req.user.id];

    if (project_id) {
      params.push(project_id);
      query += ` AND project_id = $${params.length}`;
    }

    query += ' ORDER BY updated_at DESC LIMIT 100';

    const result = await db.query(query, params);

    res.json({
      chats: result.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/chats/recent - Get top 10 recent chats with project info
router.get(
  '/recent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT c.id, c.title, c.project_id, c.updated_at, c.message_count,
              p.name as project_name, p.color as project_color
       FROM chat_conversations c
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE c.deleted_at IS NULL AND c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT 10`,
      [req.user.id]
    );

    res.json({
      chats: result.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/chats/search - Search chats by title
router.get(
  '/search',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { q, project_id } = req.query;

    if (!q || !q.trim()) {
      return res.json({ chats: [], timestamp: new Date().toISOString() });
    }

    let query = `SELECT c.id, c.title, c.project_id, c.updated_at, c.message_count,
                        p.name as project_name, p.color as project_color
                 FROM chat_conversations c
                 LEFT JOIN projects p ON c.project_id = p.id
                 WHERE c.deleted_at IS NULL AND c.user_id = $1
                   AND c.title ILIKE $2`;
    const params = [req.user.id, `%${q.trim()}%`];

    if (project_id) {
      params.push(project_id);
      query += ` AND c.project_id = $${params.length}`;
    }

    query += ' ORDER BY c.updated_at DESC LIMIT 50';

    const result = await db.query(query, params);

    res.json({
      chats: result.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/chats/:id - Get single chat with project metadata
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidConversationId(id)) {
      throw new ValidationError('Invalid conversation_id: must be a positive integer');
    }

    const result = await db.query(
      `SELECT c.id, c.title, c.project_id, c.created_at, c.updated_at, c.message_count,
              c.use_rag, c.use_thinking, c.preferred_model, c.preferred_space_id,
              p.name as project_name, p.description as project_description,
              p.system_prompt as project_system_prompt, p.icon as project_icon,
              p.color as project_color, p.knowledge_space_id as project_space_id
       FROM chat_conversations c
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE c.id = $1 AND c.deleted_at IS NULL AND c.user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Chat not found');
    }

    const row = result.rows[0];
    const chat = {
      id: row.id,
      title: row.title,
      project_id: row.project_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      message_count: row.message_count,
      settings: {
        use_rag: row.use_rag ?? false,
        use_thinking: row.use_thinking ?? true,
        preferred_model: row.preferred_model || null,
        preferred_space_id: row.preferred_space_id || null,
      },
    };

    const project = row.project_id
      ? {
          id: row.project_id,
          name: row.project_name,
          description: row.project_description,
          system_prompt: row.project_system_prompt,
          icon: row.project_icon,
          color: row.project_color,
          knowledge_space_id: row.project_space_id,
        }
      : null;

    res.json({
      chat,
      project,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/chats - Create new chat conversation
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { title, project_id } = req.body;

    // Fallback to default project if none specified
    const resolvedProjectId = project_id || (await getDefaultProjectId());

    const result = await db.query(
      `INSERT INTO chat_conversations (title, project_id, user_id, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, title, project_id, created_at, updated_at, message_count`,
      [title || 'Neuer Chat', resolvedProjectId, req.user.id]
    );

    res.json({
      chat: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/chats/:id/messages - Get messages for a chat
// Supports cursor-based pagination: ?limit=50&before=<messageId>
// For active streaming jobs, content is fetched from llm_jobs table
router.get(
  '/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { limit: limitParam, before } = req.query;

    // PHASE3-FIX: Validate conversation_id
    if (!isValidConversationId(id)) {
      throw new ValidationError('Invalid conversation_id: must be a positive integer');
    }

    await verifyOwnership(id, req.user.id);

    const limit = Math.min(Math.max(parseInt(limitParam) || 50, 1), 100);

    // Build query with optional cursor
    let cursorCondition = '';
    const params = [id, limit];

    if (before && isValidConversationId(before)) {
      cursorCondition = 'AND m.id < $3';
      params.push(before);
    }

    // Query that joins with llm_jobs to get live content for streaming messages
    const result = await db.query(
      `SELECT
            m.id,
            m.role,
            -- For streaming messages: get live content from llm_jobs
            CASE
                WHEN m.status = 'streaming' AND j.id IS NOT NULL THEN COALESCE(j.content, '')
                ELSE COALESCE(m.content, '')
            END as content,
            CASE
                WHEN m.status = 'streaming' AND j.id IS NOT NULL THEN j.thinking
                ELSE m.thinking
            END as thinking,
            CASE
                WHEN m.status = 'streaming' AND j.id IS NOT NULL THEN j.sources
                ELSE m.sources
            END as sources,
            CASE
                WHEN m.status = 'streaming' AND j.id IS NOT NULL THEN j.matched_spaces
                ELSE m.matched_spaces
            END as matched_spaces,
            m.created_at,
            COALESCE(m.status, 'completed') as status,
            m.job_id,
            j.status as job_status
         FROM chat_messages m
         LEFT JOIN llm_jobs j ON m.job_id = j.id
         WHERE m.conversation_id = $1
         ${cursorCondition}
         ORDER BY m.id DESC
         LIMIT $2`,
      params
    );

    // Reverse to get chronological order (we fetched DESC for cursor pagination)
    const messages = result.rows.reverse();
    const hasMore = result.rows.length === limit;

    // Inline recovery: fix orphaned streaming messages on read
    // If a message is stuck in 'streaming' but its job is completed/error/gone,
    // recover content from the job or mark as error — prevents permanently invisible messages
    const orphanedMessages = messages.filter(
      m =>
        m.status === 'streaming' &&
        (!m.job_id ||
          !m.job_status ||
          m.job_status === 'completed' ||
          m.job_status === 'error' ||
          m.job_status === 'cancelled')
    );

    if (orphanedMessages.length > 0) {
      for (const msg of orphanedMessages) {
        try {
          if (
            msg.job_id &&
            (msg.job_status === 'completed' ||
              msg.job_status === 'error' ||
              msg.job_status === 'cancelled')
          ) {
            // Job exists with terminal status — transfer content if available
            const jobData = await db.query(
              `SELECT content, thinking, sources, matched_spaces FROM llm_jobs WHERE id = $1`,
              [msg.job_id]
            );
            if (jobData.rows.length > 0 && (jobData.rows[0].content || jobData.rows[0].thinking)) {
              const j = jobData.rows[0];
              await db.query(
                `UPDATE chat_messages SET content = $1, thinking = $2, sources = $3, matched_spaces = $4, status = 'completed' WHERE id = $5`,
                [j.content || '', j.thinking, j.sources, j.matched_spaces, msg.id]
              );
              // Update in-memory for this response
              msg.content = j.content || '';
              msg.thinking = j.thinking;
              msg.sources = j.sources;
              msg.matched_spaces = j.matched_spaces;
              msg.status = 'completed';
            } else {
              // Job has no content — mark message as error
              await db.query(`UPDATE chat_messages SET status = 'error' WHERE id = $1`, [msg.id]);
              msg.status = 'error';
            }
          } else if (!msg.job_id || !msg.job_status) {
            // No job at all — mark as error if older than 5 minutes
            const msgAge = Date.now() - new Date(msg.created_at).getTime();
            if (msgAge > 5 * 60 * 1000) {
              await db.query(`UPDATE chat_messages SET status = 'error' WHERE id = $1`, [msg.id]);
              msg.status = 'error';
            }
          }
        } catch (recoveryErr) {
          // Non-critical — log and continue
          logger.warn(`Inline recovery failed for message ${msg.id}: ${recoveryErr.message}`);
        }
      }
    }

    res.json({
      messages,
      hasMore,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/chats/:id/jobs - Get active jobs for a conversation
router.get(
  '/:id/jobs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // PHASE3-FIX: Validate conversation_id
    if (!isValidConversationId(id)) {
      throw new ValidationError('Invalid conversation_id: must be a positive integer');
    }

    await verifyOwnership(id, req.user.id);

    const jobs = await llmJobService.getActiveJobsForConversation(parseInt(id));

    res.json({
      jobs,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/chats/:id/messages - Add message to chat
router.post(
  '/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role, content, thinking } = req.body;

    // PHASE3-FIX: Validate conversation_id
    if (!isValidConversationId(id)) {
      throw new ValidationError('Invalid conversation_id: must be a positive integer');
    }

    await verifyOwnership(id, req.user.id);

    if (!role || !content) {
      throw new ValidationError('Role and content are required');
    }

    // DB-001 FIX: The trigger_update_message_count on chat_messages already handles
    // both message_count increment and updated_at. Manual increment caused double-counting.
    const result = await db.query(
      `INSERT INTO chat_messages (conversation_id, role, content, thinking, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, role, content, thinking, created_at`,
      [id, role, content, thinking || null]
    );

    res.json({
      message: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

// PATCH /api/chats/:id - Update chat (title, project_id)
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, project_id } = req.body;

    // PHASE3-FIX: Validate conversation_id
    if (!isValidConversationId(id)) {
      throw new ValidationError('Invalid conversation_id: must be a positive integer');
    }

    if (!title && project_id === undefined) {
      throw new ValidationError('Title or project_id is required');
    }

    // Build dynamic update
    const { setClauses, params, paramIndex } = buildSetClauses({
      title: title || undefined,
      project_id: project_id !== undefined ? project_id || null : undefined,
    });

    params.push(id, req.user.id);
    const result = await db.query(
      `UPDATE chat_conversations
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} AND deleted_at IS NULL
         RETURNING id, title, project_id, created_at, updated_at, message_count`,
      params
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Chat not found');
    }

    res.json({
      chat: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

// PATCH /api/chats/:id/settings - Update chat settings (RAG, Think, Model, Space)
router.patch(
  '/:id/settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidConversationId(id)) {
      throw new ValidationError('Invalid conversation_id: must be a positive integer');
    }

    const { use_rag, use_thinking, preferred_model, preferred_space_id } = req.body;

    // Validate: at least one field must be provided
    if (
      use_rag === undefined &&
      use_thinking === undefined &&
      preferred_model === undefined &&
      preferred_space_id === undefined
    ) {
      throw new ValidationError('Mindestens ein Setting muss angegeben werden');
    }

    // Validate types before building query
    if (use_rag !== undefined && typeof use_rag !== 'boolean') {
      throw new ValidationError('use_rag muss ein Boolean sein');
    }
    if (use_thinking !== undefined && typeof use_thinking !== 'boolean') {
      throw new ValidationError('use_thinking muss ein Boolean sein');
    }
    if (
      preferred_model !== undefined &&
      preferred_model !== null &&
      typeof preferred_model !== 'string'
    ) {
      throw new ValidationError('preferred_model muss ein String oder null sein');
    }
    if (
      preferred_space_id !== undefined &&
      preferred_space_id !== null &&
      typeof preferred_space_id !== 'string'
    ) {
      throw new ValidationError('preferred_space_id muss ein String oder null sein');
    }

    // Build dynamic update
    const { setClauses, params, paramIndex } = buildSetClauses({
      use_rag,
      use_thinking,
      preferred_model: preferred_model !== undefined ? preferred_model || null : undefined,
      preferred_space_id: preferred_space_id !== undefined ? preferred_space_id || null : undefined,
    });

    params.push(id, req.user.id);
    const result = await db.query(
      `UPDATE chat_conversations
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} AND deleted_at IS NULL
         RETURNING use_rag, use_thinking, preferred_model, preferred_space_id`,
      params
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Chat not found');
    }

    const row = result.rows[0];
    res.json({
      settings: {
        use_rag: row.use_rag,
        use_thinking: row.use_thinking,
        preferred_model: row.preferred_model,
        preferred_space_id: row.preferred_space_id,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/chats/:id/export - Export chat conversation
router.get(
  '/:id/export',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    // Validate conversation_id
    if (!isValidConversationId(id)) {
      throw new ValidationError('Invalid conversation_id: must be a positive integer');
    }

    // Validate format
    const validFormats = ['json', 'markdown', 'md'];
    if (!validFormats.includes(format.toLowerCase())) {
      throw new ValidationError('Invalid format: must be json, markdown, or md');
    }

    // Get conversation details (user-scoped)
    const chatResult = await db.query(
      `SELECT id, title, created_at, updated_at
         FROM chat_conversations
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, req.user.id]
    );

    if (chatResult.rows.length === 0) {
      throw new NotFoundError('Chat not found');
    }

    const chat = chatResult.rows[0];

    // Get all messages for the chat
    const messagesResult = await db.query(
      `SELECT role, content, thinking, sources, matched_spaces, created_at
         FROM chat_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
      [id]
    );

    const messages = messagesResult.rows;

    // Generate export based on format
    const isMarkdown = format.toLowerCase() === 'markdown' || format.toLowerCase() === 'md';

    if (isMarkdown) {
      // Generate Markdown export
      let markdown = `# ${chat.title}\n\n`;
      markdown += `**Exportiert am:** ${new Date().toISOString()}\n`;
      markdown += `**Erstellt am:** ${chat.created_at}\n`;
      markdown += `**Nachrichten:** ${messages.length}\n\n`;
      markdown += `---\n\n`;

      for (const msg of messages) {
        const roleLabel = msg.role === 'user' ? '**Du:**' : '**AI:**';
        const timestamp = new Date(msg.created_at).toLocaleString('de-DE');

        markdown += `### ${roleLabel} _(${timestamp})_\n\n`;

        // Add thinking block if present
        if (msg.thinking && msg.thinking.trim()) {
          markdown += `<details>\n<summary>💭 Gedankengang</summary>\n\n${msg.thinking}\n\n</details>\n\n`;
        }

        // Add content
        if (msg.content && msg.content.trim()) {
          markdown += `${msg.content}\n\n`;
        }

        // Add matched spaces if present
        if (
          msg.matched_spaces &&
          Array.isArray(msg.matched_spaces) &&
          msg.matched_spaces.length > 0
        ) {
          markdown += `**Durchsuchte Bereiche:** ${msg.matched_spaces.map(s => s.name).join(', ')}\n\n`;
        }

        // Add sources if present
        if (msg.sources && Array.isArray(msg.sources) && msg.sources.length > 0) {
          markdown += `<details>\n<summary>📚 Quellen (${msg.sources.length})</summary>\n\n`;
          for (const source of msg.sources) {
            markdown += `- **${source.document_name || 'Unbekannt'}**\n`;
            if (source.text_preview) {
              markdown += `  > ${source.text_preview.substring(0, 200)}...\n`;
            }
            if (source.score) {
              markdown += `  Relevanz: ${(source.score * 100).toFixed(0)}%\n`;
            }
            markdown += '\n';
          }
          markdown += `</details>\n\n`;
        }

        markdown += `---\n\n`;
      }

      // Set headers for file download
      const filename = `chat-${chat.id}-${chat.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.md`;
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(markdown);
    } else {
      // JSON export
      const exportData = {
        chat: {
          id: chat.id,
          title: chat.title,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
        },
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          thinking: msg.thinking || null,
          sources: msg.sources || [],
          matched_spaces: msg.matched_spaces || [],
          created_at: msg.created_at,
        })),
        export_info: {
          exported_at: new Date().toISOString(),
          format: 'json',
          version: '1.0',
          message_count: messages.length,
        },
      };

      // Set headers for file download
      const filename = `chat-${chat.id}-${chat.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(exportData);
    }
  })
);

// DELETE /api/chats/:id - Soft delete chat conversation (atomic)
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // PHASE3-FIX: Validate conversation_id
    if (!isValidConversationId(id)) {
      throw new ValidationError('Invalid conversation_id: must be a positive integer');
    }

    // Atomic: soft-delete + cancel active jobs in one transaction (user-scoped)
    const result = await db.transaction(async client => {
      const deleteResult = await client.query(
        `UPDATE chat_conversations
           SET deleted_at = NOW()
           WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
           RETURNING id`,
        [id, req.user.id]
      );

      if (deleteResult.rows.length === 0) {
        throw new NotFoundError('Chat not found');
      }

      return deleteResult;
    });

    // Cancel active jobs outside transaction (involves external abort operations)
    const activeJobs = await llmJobService.getActiveJobsForConversation(parseInt(id));
    await Promise.all(
      activeJobs.map(async job => {
        await llmJobService.cancelJob(job.id);
        logger.info(`Cancelled active job ${job.id} for deleted chat ${id}`);
      })
    );

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
