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

// PHASE3-FIX: Input validation helper for conversation_id
function isValidConversationId(id) {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0 && parsed <= 2147483647 && String(parsed) === String(id);
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
         WHERE deleted_at IS NULL`;
    const params = [];

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
       WHERE c.deleted_at IS NULL
       ORDER BY c.updated_at DESC
       LIMIT 10`
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
                 WHERE c.deleted_at IS NULL
                   AND c.title ILIKE $1`;
    const params = [`%${q.trim()}%`];

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
              p.name as project_name, p.description as project_description,
              p.system_prompt as project_system_prompt, p.icon as project_icon,
              p.color as project_color, p.knowledge_space_id as project_space_id
       FROM chat_conversations c
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [id]
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
      `INSERT INTO chat_conversations (title, project_id, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id, title, project_id, created_at, updated_at, message_count`,
      [title || 'Neuer Chat', resolvedProjectId]
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
    const setClauses = ['updated_at = NOW()'];
    const params = [];
    let paramIdx = 1;

    if (title) {
      setClauses.push(`title = $${paramIdx++}`);
      params.push(title);
    }
    if (project_id !== undefined) {
      setClauses.push(`project_id = $${paramIdx++}`);
      params.push(project_id || null);
    }

    params.push(id);
    const result = await db.query(
      `UPDATE chat_conversations
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIdx} AND deleted_at IS NULL
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

    // Get conversation details
    const chatResult = await db.query(
      `SELECT id, title, created_at, updated_at
         FROM chat_conversations
         WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (chatResult.rows.length === 0) {
      throw new NotFoundError('Chat not found');
    }

    const chat = chatResult.rows[0];

    // Get all messages for the chat
    const messagesResult = await db.query(
      `SELECT role, content, thinking, sources, created_at
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

    // Atomic: soft-delete + cancel active jobs in one transaction
    const result = await db.transaction(async client => {
      const deleteResult = await client.query(
        `UPDATE chat_conversations
           SET deleted_at = NOW()
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING id`,
        [id]
      );

      if (deleteResult.rows.length === 0) {
        throw new NotFoundError('Chat not found');
      }

      return deleteResult;
    });

    // Cancel active jobs outside transaction (involves external abort operations)
    const activeJobs = await llmJobService.getActiveJobsForConversation(parseInt(id));
    for (const job of activeJobs) {
      await llmJobService.cancelJob(job.id);
      logger.info(`Cancelled active job ${job.id} for deleted chat ${id}`);
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
