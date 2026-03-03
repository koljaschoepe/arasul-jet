/**
 * Projects API routes
 * CRUD operations for project management (grouping conversations with system prompts)
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');

// GET /api/projects - List all projects with conversation count
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const includeConversations = req.query.include === 'conversations';

    const result = await db.query(
      `SELECT p.id, p.name, p.description, p.system_prompt, p.icon, p.color,
              p.knowledge_space_id, p.sort_order, p.is_default,
              p.created_at, p.updated_at,
              ks.name as space_name,
              COUNT(c.id) FILTER (WHERE c.deleted_at IS NULL) as conversation_count
       FROM projects p
       LEFT JOIN knowledge_spaces ks ON p.knowledge_space_id = ks.id
       LEFT JOIN chat_conversations c ON c.project_id = p.id
       GROUP BY p.id, ks.name
       ORDER BY p.is_default DESC NULLS LAST, p.sort_order, p.created_at DESC`
    );

    let projects = result.rows;

    if (includeConversations) {
      const convResult = await db.query(
        `SELECT id, title, project_id, updated_at, message_count
         FROM chat_conversations
         WHERE deleted_at IS NULL AND project_id IS NOT NULL
         ORDER BY updated_at DESC`
      );

      const convByProject = {};
      for (const conv of convResult.rows) {
        if (!convByProject[conv.project_id]) {
          convByProject[conv.project_id] = [];
        }
        convByProject[conv.project_id].push(conv);
      }

      projects = projects.map(p => ({
        ...p,
        conversations: convByProject[p.id] || [],
      }));
    }

    res.json({ projects, timestamp: new Date().toISOString() });
  })
);

// POST /api/projects - Create new project
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, description, system_prompt, icon, color, knowledge_space_id } = req.body;

    if (!name || !name.trim()) {
      throw new ValidationError('Name ist erforderlich');
    }
    if (name.length > 100) {
      throw new ValidationError('Name darf maximal 100 Zeichen lang sein');
    }

    // Validate knowledge_space_id exists if provided
    if (knowledge_space_id) {
      const spaceCheck = await db.query('SELECT id FROM knowledge_spaces WHERE id = $1', [
        knowledge_space_id,
      ]);
      if (spaceCheck.rows.length === 0) {
        throw new ValidationError('Knowledge Space nicht gefunden');
      }
    }

    const result = await db.query(
      `INSERT INTO projects (name, description, system_prompt, icon, color, knowledge_space_id, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       RETURNING *`,
      [
        name.trim(),
        description || '',
        system_prompt || '',
        icon || 'folder',
        color || '#45ADFF',
        knowledge_space_id || null,
      ]
    );

    res.json({ project: result.rows[0], timestamp: new Date().toISOString() });
  })
);

// GET /api/projects/:id - Get project details with conversations
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await db.query(
      `SELECT p.*, ks.name as space_name
       FROM projects p
       LEFT JOIN knowledge_spaces ks ON p.knowledge_space_id = ks.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Projekt nicht gefunden');
    }

    const convResult = await db.query(
      `SELECT id, title, updated_at, message_count
       FROM chat_conversations
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
      [id]
    );

    const project = { ...result.rows[0], conversations: convResult.rows };
    res.json({ project, timestamp: new Date().toISOString() });
  })
);

// PUT /api/projects/:id - Update project
router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, system_prompt, icon, color, knowledge_space_id } = req.body;

    if (name !== undefined && (!name || !name.trim())) {
      throw new ValidationError('Name darf nicht leer sein');
    }
    if (name && name.length > 100) {
      throw new ValidationError('Name darf maximal 100 Zeichen lang sein');
    }

    // Validate knowledge_space_id if provided
    if (knowledge_space_id) {
      const spaceCheck = await db.query('SELECT id FROM knowledge_spaces WHERE id = $1', [
        knowledge_space_id,
      ]);
      if (spaceCheck.rows.length === 0) {
        throw new ValidationError('Knowledge Space nicht gefunden');
      }
    }

    const result = await db.query(
      `UPDATE projects
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           system_prompt = COALESCE($3, system_prompt),
           icon = COALESCE($4, icon),
           color = COALESCE($5, color),
           knowledge_space_id = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        name?.trim(),
        description,
        system_prompt,
        icon,
        color,
        knowledge_space_id !== undefined ? knowledge_space_id || null : undefined,
        id,
      ]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Projekt nicht gefunden');
    }

    res.json({ project: result.rows[0], timestamp: new Date().toISOString() });
  })
);

// DELETE /api/projects/:id - Delete project (conversations reassigned to default)
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if project exists and is not the default
    const projectCheck = await db.query('SELECT id, is_default FROM projects WHERE id = $1', [id]);
    if (projectCheck.rows.length === 0) {
      throw new NotFoundError('Projekt nicht gefunden');
    }
    if (projectCheck.rows[0].is_default) {
      throw new ValidationError('Das Standard-Projekt kann nicht geloescht werden');
    }

    // Reassign conversations to default project
    const defaultProject = await db.query(
      'SELECT id FROM projects WHERE is_default = TRUE LIMIT 1'
    );
    if (defaultProject.rows.length > 0) {
      await db.query('UPDATE chat_conversations SET project_id = $1 WHERE project_id = $2', [
        defaultProject.rows[0].id,
        id,
      ]);
    }

    await db.query('DELETE FROM projects WHERE id = $1', [id]);

    res.json({ success: true, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
