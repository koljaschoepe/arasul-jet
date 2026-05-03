/**
 * Projects API routes
 * CRUD operations for project management (grouping conversations with system prompts)
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { CreateProjectBody, UpdateProjectBody } = require('../schemas/projects');
const { ownershipFilter, requireResourceOwner } = require('../middleware/requireOwnership');

// GET /api/projects - List all projects with conversation count (user-scoped, Phase 1.1)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const includeConversations = req.query.include === 'conversations';

    // Phase 1.1: User sieht nur eigene Projects (außer Admin) + Default-Projekt
    // (is_default=TRUE) ist immer für alle sichtbar.
    const { whereOwn, params } = ownershipFilter('projects', req.user, 'p');
    const result = await db.query(
      `SELECT p.id, p.name, p.description, p.system_prompt, p.icon, p.color,
              p.knowledge_space_id, p.sort_order, p.is_default, p.owner_id,
              p.created_at, p.updated_at,
              ks.name as space_name,
              COUNT(c.id) FILTER (WHERE c.deleted_at IS NULL AND c.user_id = $${params.length + 1}) as conversation_count
       FROM projects p
       LEFT JOIN knowledge_spaces ks ON p.knowledge_space_id = ks.id
       LEFT JOIN chat_conversations c ON c.project_id = p.id
       WHERE (${whereOwn}) OR p.is_default = TRUE
       GROUP BY p.id, ks.name
       ORDER BY p.is_default DESC NULLS LAST, p.sort_order, p.created_at DESC`,
      [...params, req.user.id]
    );

    let projects = result.rows;

    if (includeConversations) {
      const convResult = await db.query(
        `SELECT id, title, project_id, updated_at, message_count
         FROM chat_conversations
         WHERE deleted_at IS NULL AND project_id IS NOT NULL AND user_id = $1
         ORDER BY updated_at DESC`,
        [req.user.id]
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
  validateBody(CreateProjectBody),
  asyncHandler(async (req, res) => {
    const { name, description, system_prompt, icon, color, knowledge_space_id } = req.body;

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
      `INSERT INTO projects (name, description, system_prompt, icon, color, knowledge_space_id, is_default, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)
       RETURNING *`,
      [
        name.trim(),
        description || '',
        system_prompt || '',
        icon || 'folder',
        color || '#45ADFF',
        knowledge_space_id || null,
        req.user.id,
      ]
    );

    res.json({ project: result.rows[0], timestamp: new Date().toISOString() });
  })
);

// GET /api/projects/:id - Get project details with conversations (user-scoped)
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Phase 1.1: Owner ODER Admin ODER Default-Projekt sind sichtbar.
    const result = await db.query(
      `SELECT p.*, ks.name as space_name
         FROM projects p
         LEFT JOIN knowledge_spaces ks ON p.knowledge_space_id = ks.id
         WHERE p.id = $1
           AND (p.owner_id = $2 OR p.is_default = TRUE OR $3 = 'admin')`,
      [id, req.user.id, req.user.role]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Projekt nicht gefunden');
    }

    const convResult = await db.query(
      `SELECT id, title, updated_at, message_count
         FROM chat_conversations
         WHERE project_id = $1 AND deleted_at IS NULL AND user_id = $2
         ORDER BY updated_at DESC`,
      [id, req.user.id]
    );

    const project = { ...result.rows[0], conversations: convResult.rows };
    res.json({ project, timestamp: new Date().toISOString() });
  })
);

// PUT /api/projects/:id - Update project (Phase 1.1: nur Owner/Admin)
router.put(
  '/:id',
  requireAuth,
  requireResourceOwner('projects'),
  validateBody(UpdateProjectBody),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, system_prompt, icon, color, knowledge_space_id } = req.body;

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

// DELETE /api/projects/:id - Delete project (Phase 1.1: nur Owner/Admin)
router.delete(
  '/:id',
  requireAuth,
  requireResourceOwner('projects'),
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

    // Atomic: reassign conversations + delete in one transaction
    await db.transaction(async client => {
      const defaultProject = await client.query(
        'SELECT id FROM projects WHERE is_default = TRUE LIMIT 1'
      );
      if (defaultProject.rows.length > 0) {
        await client.query('UPDATE chat_conversations SET project_id = $1 WHERE project_id = $2', [
          defaultProject.rows[0].id,
          id,
        ]);
      }

      await client.query('DELETE FROM projects WHERE id = $1', [id]);
    });

    res.json({ success: true, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
