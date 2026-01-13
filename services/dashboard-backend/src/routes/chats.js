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
