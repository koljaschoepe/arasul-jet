/**
 * Chat Management API routes
 * Handles multi-chat conversations and message persistence
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const llmJobService = require('../services/llmJobService');

// PHASE3-FIX: Input validation helper for conversation_id
function isValidConversationId(id) {
    const parsed = parseInt(id, 10);
    return !isNaN(parsed) && parsed > 0 && parsed <= 2147483647 && String(parsed) === String(id);
}

// GET /api/chats - Get all chat conversations
router.get('/', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, title, created_at, updated_at, message_count
             FROM chat_conversations
             WHERE deleted_at IS NULL
             ORDER BY updated_at DESC
             LIMIT 100`,
            []
        );

        res.json({
            chats: result.rows,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error fetching chats: ${error.message}`);
        res.status(500).json({
            error: 'Failed to fetch chats',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/chats - Create new chat conversation
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title } = req.body;

        const result = await db.query(
            `INSERT INTO chat_conversations (title, created_at, updated_at)
             VALUES ($1, NOW(), NOW())
             RETURNING id, title, created_at, updated_at, message_count`,
            [title || 'New Chat']
        );

        res.json({
            chat: result.rows[0],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error creating chat: ${error.message}`);
        res.status(500).json({
            error: 'Failed to create chat',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/chats/:id/messages - Get messages for a chat
// For active streaming jobs, content is fetched from llm_jobs table
router.get('/:id/messages', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // PHASE3-FIX: Validate conversation_id
        if (!isValidConversationId(id)) {
            return res.status(400).json({
                error: 'Invalid conversation_id: must be a positive integer',
                timestamp: new Date().toISOString()
            });
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
             ORDER BY m.created_at ASC`,
            [id]
        );

        res.json({
            messages: result.rows,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error fetching messages: ${error.message}`);
        res.status(500).json({
            error: 'Failed to fetch messages',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/chats/:id/jobs - Get active jobs for a conversation
router.get('/:id/jobs', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // PHASE3-FIX: Validate conversation_id
        if (!isValidConversationId(id)) {
            return res.status(400).json({
                error: 'Invalid conversation_id: must be a positive integer',
                timestamp: new Date().toISOString()
            });
        }

        const jobs = await llmJobService.getActiveJobsForConversation(parseInt(id));

        res.json({
            jobs,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error fetching jobs for chat ${req.params.id}: ${error.message}`);
        res.status(500).json({
            error: 'Failed to fetch jobs',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/chats/:id/messages - Add message to chat
router.post('/:id/messages', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { role, content, thinking } = req.body;

        // PHASE3-FIX: Validate conversation_id
        if (!isValidConversationId(id)) {
            return res.status(400).json({
                error: 'Invalid conversation_id: must be a positive integer',
                timestamp: new Date().toISOString()
            });
        }

        if (!role || !content) {
            return res.status(400).json({
                error: 'Role and content are required',
                timestamp: new Date().toISOString()
            });
        }

        const result = await db.query(
            `INSERT INTO chat_messages (conversation_id, role, content, thinking, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING id, role, content, thinking, created_at`,
            [id, role, content, thinking || null]
        );

        // Update conversation's updated_at timestamp
        await db.query(
            `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
            [id]
        );

        res.json({
            message: result.rows[0],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error adding message: ${error.message}`);
        res.status(500).json({
            error: 'Failed to add message',
            timestamp: new Date().toISOString()
        });
    }
});

// PATCH /api/chats/:id - Update chat title
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;

        // PHASE3-FIX: Validate conversation_id
        if (!isValidConversationId(id)) {
            return res.status(400).json({
                error: 'Invalid conversation_id: must be a positive integer',
                timestamp: new Date().toISOString()
            });
        }

        if (!title) {
            return res.status(400).json({
                error: 'Title is required',
                timestamp: new Date().toISOString()
            });
        }

        const result = await db.query(
            `UPDATE chat_conversations
             SET title = $1, updated_at = NOW()
             WHERE id = $2 AND deleted_at IS NULL
             RETURNING id, title, created_at, updated_at, message_count`,
            [title, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Chat not found',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            chat: result.rows[0],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error updating chat: ${error.message}`);
        res.status(500).json({
            error: 'Failed to update chat',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/chats/:id/export - Export chat conversation
router.get('/:id/export', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { format = 'json' } = req.query;

        // Validate conversation_id
        if (!isValidConversationId(id)) {
            return res.status(400).json({
                error: 'Invalid conversation_id: must be a positive integer',
                timestamp: new Date().toISOString()
            });
        }

        // Validate format
        const validFormats = ['json', 'markdown', 'md'];
        if (!validFormats.includes(format.toLowerCase())) {
            return res.status(400).json({
                error: 'Invalid format: must be json, markdown, or md',
                timestamp: new Date().toISOString()
            });
        }

        // Get conversation details
        const chatResult = await db.query(
            `SELECT id, title, created_at, updated_at
             FROM chat_conversations
             WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );

        if (chatResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Chat not found',
                timestamp: new Date().toISOString()
            });
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
                    updated_at: chat.updated_at
                },
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    thinking: msg.thinking || null,
                    sources: msg.sources || [],
                    created_at: msg.created_at
                })),
                export_info: {
                    exported_at: new Date().toISOString(),
                    format: 'json',
                    version: '1.0',
                    message_count: messages.length
                }
            };

            // Set headers for file download
            const filename = `chat-${chat.id}-${chat.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.json`;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.json(exportData);
        }

    } catch (error) {
        logger.error(`Error exporting chat: ${error.message}`);
        res.status(500).json({
            error: 'Failed to export chat',
            timestamp: new Date().toISOString()
        });
    }
});

// DELETE /api/chats/:id - Soft delete chat conversation
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // PHASE3-FIX: Validate conversation_id
        if (!isValidConversationId(id)) {
            return res.status(400).json({
                error: 'Invalid conversation_id: must be a positive integer',
                timestamp: new Date().toISOString()
            });
        }

        const result = await db.query(
            `UPDATE chat_conversations
             SET deleted_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Chat not found',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error deleting chat: ${error.message}`);
        res.status(500).json({
            error: 'Failed to delete chat',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
