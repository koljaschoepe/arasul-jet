/**
 * Knowledge Spaces API Routes
 * Provides management of knowledge spaces for hierarchical RAG
 *
 * Features:
 * - CRUD operations for knowledge spaces
 * - Space routing based on description embeddings
 * - Auto-context generation triggers
 * - Space statistics
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { requireAuth } = require('../../middleware/auth');
const pool = require('../../database');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} = require('../../utils/errors');
const {
  CreateSpaceBody,
  UpdateSpaceBody,
  UpsertContextFileBody,
  RouteQueryBody,
  SetActiveWorkspaceBody,
  CreatePinBody,
} = require('../../schemas/spaces');
const workspaceContext = require('../../services/rag/workspaceContext');
const projectService = require('../../services/rag/projectService');
const crypto = require('crypto');
const minioService = require('../../services/documents/minioService');
const { invalidateFolderContext } = require('../../services/rag/folderContextService');
const { buildSetClauses } = require('../../utils/queryBuilder');
const { cacheService, cacheMiddleware } = require('../../services/core/cacheService');
const { generateSlug } = require('../../utils/slugGenerator');
const { getEmbedding } = require('../../services/embeddingService');
const axios = require('axios');
const services = require('../../config/services');

// Cache configuration
const CACHE_KEY_SPACES = 'spaces:list';

// Qdrant configuration for space-deletion vector sync
const QDRANT_HOST = services.qdrant.host;
const QDRANT_PORT = services.qdrant.port;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const CACHE_TTL_SPACES = 30000; // 30 seconds

/**
 * GET /api/spaces
 * List all knowledge spaces with statistics
 * Cached for 30 seconds to reduce database load
 */
router.get(
  '/',
  requireAuth,
  cacheMiddleware(CACHE_KEY_SPACES, CACHE_TTL_SPACES),
  asyncHandler(async (req, res) => {
    // Batch 2: Ordner sind auf das AKTIVE Projekt gescopt. Der Cache ist statisch
    // (spaces:list) und wird beim Projektwechsel invalidiert (siehe routes/ai/projects).
    const activeProjectId = await projectService.getActiveProjectId();
    const result = await pool.query(
      `
        SELECT
            ks.*,
            COALESCE(doc_stats.doc_count, 0) as actual_document_count,
            COALESCE(doc_stats.indexed_count, 0) as indexed_document_count
        FROM knowledge_spaces ks
        LEFT JOIN (
            SELECT
                space_id,
                COUNT(*) FILTER (WHERE status != 'deleted') as doc_count,
                COUNT(*) FILTER (WHERE status = 'indexed') as indexed_count
            FROM documents
            WHERE is_context_file = FALSE
            GROUP BY space_id
        ) doc_stats ON ks.id = doc_stats.space_id
        -- Plan 008 Schritt 13: die unsichtbaren Workspace-Wissensräume gehören
        -- nicht in die Dokumenten-UI. Batch 2: nur Ordner des aktiven Projekts.
        WHERE ks.is_workspace = FALSE AND ks.project_id = $1
        ORDER BY ks.sort_order, ks.name
    `,
      [activeProjectId]
    );

    res.json({
      spaces: result.rows,
      total: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/spaces/tree
 * Workspace-Explorer (Plan ide-workspace-shell): flacher Baum-Datensatz aus
 * allen Spaces (mit parent_id) und allen Dokumenten. Der Client baut daraus
 * den Ordnerbaum. Kontextdateien werden mitgeliefert (is_context_file), damit
 * der Explorer sie kennzeichnen kann.
 */
router.get(
  '/tree',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Batch 2: der Explorer zeigt nur die Ordner des AKTIVEN Projekts. Dokumente
    // werden anschließend auf die sichtbaren (projekt-gescopten) Ordner gefiltert.
    const activeProjectId = await projectService.getActiveProjectId();
    const [spacesResult, docsResult] = await Promise.all([
      pool.query(
        `
        SELECT id, name, slug, icon, color, parent_id, is_default, is_system, sort_order
          FROM knowledge_spaces
         WHERE is_workspace = FALSE AND project_id = $1
         ORDER BY sort_order, name
      `,
        [activeProjectId]
      ),
      pool.query(`
        SELECT id, filename, title, status, space_id, is_context_file,
               mime_type, file_extension, file_size
          FROM documents
         WHERE deleted_at IS NULL AND status <> 'deleted'
         ORDER BY filename
      `),
    ]);

    // Plan 008 Schritt 13: Dokumente aus unsichtbaren Workspace-Wissensräumen
    // gehören nicht in den Dokumenten-Explorer. Da die Spaces-Abfrage die
    // is_workspace-Spaces bereits ausblendet, ist deren id nicht in der
    // sichtbaren Menge — ein Dokument mit einer solchen (nicht sichtbaren)
    // space_id wird hier herausgefiltert. Dokumente ohne space_id (null)
    // bleiben erhalten.
    const visibleSpaceIds = new Set(spacesResult.rows.map(s => s.id));
    const documents = docsResult.rows.filter(
      d => d.space_id == null || visibleSpaceIds.has(d.space_id)
    );

    res.json({
      spaces: spacesResult.rows,
      documents,
      timestamp: new Date().toISOString(),
    });
  })
);

// =============================================================================
// AKTIVER WORKSPACE + PINS (Plan 012 Phase A) — literale Routen VOR GET /:id,
// damit sie nicht als :id verschluckt werden.
// =============================================================================

/**
 * GET /api/spaces/active-workspace
 * Liefert den aktiven Top-Level-Workspace + seinen Teilbaum (space_ids).
 */
router.get(
  '/active-workspace',
  requireAuth,
  asyncHandler(async (req, res) => {
    const activeId = await workspaceContext.getActiveWorkspaceId();
    const subtreeIds = activeId ? await workspaceContext.expandSubtree(activeId) : [];

    let space = null;
    if (activeId) {
      const result = await pool.query(
        'SELECT id, name, slug, icon, color FROM knowledge_spaces WHERE id = $1',
        [activeId]
      );
      space = result.rows[0] || null;
    }

    res.json({
      active_workspace: space,
      subtree_ids: subtreeIds,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/spaces/active-workspace
 * Setzt (oder löscht mit space_id=null) den aktiven Workspace.
 */
router.put(
  '/active-workspace',
  requireAuth,
  validateBody(SetActiveWorkspaceBody),
  asyncHandler(async (req, res) => {
    const activeId = await workspaceContext.setActiveWorkspaceId(req.body.space_id);
    const subtreeIds = activeId ? await workspaceContext.expandSubtree(activeId) : [];

    res.json({
      active_workspace_id: activeId,
      subtree_ids: subtreeIds,
      message: activeId ? 'Aktiver Workspace gesetzt' : 'Aktiver Workspace aufgehoben',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/spaces/pins
 * Angeheftete Dokumente/Unterordner des Nutzers.
 */
router.get(
  '/pins',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pins = await workspaceContext.getPins(req.user.id);
    res.json({ pins, total: pins.length, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/spaces/pins
 * Heftet ein Dokument ODER einen Unterordner an (idempotent).
 */
router.post(
  '/pins',
  requireAuth,
  validateBody(CreatePinBody),
  asyncHandler(async (req, res) => {
    const id = await workspaceContext.addPin(req.user.id, {
      documentId: req.body.document_id || null,
      spaceId: req.body.space_id || null,
    });
    res.status(201).json({ id, message: 'Angeheftet', timestamp: new Date().toISOString() });
  })
);

/**
 * DELETE /api/spaces/pins/:pinId
 * Entfernt einen Pin.
 */
router.delete(
  '/pins/:pinId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pinId = Number.parseInt(req.params.pinId, 10);
    if (!Number.isInteger(pinId) || pinId <= 0) {
      throw new ValidationError('Ungültige Pin-ID');
    }
    await workspaceContext.removePin(req.user.id, pinId);
    res.json({ status: 'deleted', message: 'Entfernt', timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/spaces/:id
 * Get single space details
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
      `
        SELECT ks.*
        FROM knowledge_spaces ks
        WHERE ks.id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Wissensbereich nicht gefunden');
    }

    // Get documents in this space
    const docsResult = await pool.query(
      `
        SELECT id, filename, title, status, file_size, uploaded_at
        FROM documents
        WHERE space_id = $1 AND deleted_at IS NULL AND is_context_file = FALSE
        ORDER BY uploaded_at DESC
        LIMIT 100
    `,
      [id]
    );

    res.json({
      space: result.rows[0],
      documents: docsResult.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/spaces
 * Create a new knowledge space
 */
router.post(
  '/',
  requireAuth,
  validateBody(CreateSpaceBody),
  asyncHandler(async (req, res) => {
    const { name, description, icon = 'folder', color = '#6366f1', parent_id = null } = req.body;

    // Batch 2: Ein neuer Ordner gehört zu einem Projekt. Unterordner erben das
    // Projekt ihres Elternordners; ein neuer Top-Level-Ordner landet im AKTIVEN
    // Projekt.
    let projectId;
    if (parent_id) {
      const parentCheck = await pool.query(
        'SELECT id, project_id FROM knowledge_spaces WHERE id = $1',
        [parent_id]
      );
      if (parentCheck.rows.length === 0) {
        throw new ValidationError('Übergeordneter Ordner nicht gefunden');
      }
      projectId = parentCheck.rows[0].project_id;
    }
    if (!projectId) {
      projectId = await projectService.getActiveProjectId();
    }

    // Generate slug
    let slug = generateSlug(name);

    // Check for existing slug and make unique
    const existingSlug = await pool.query('SELECT slug FROM knowledge_spaces WHERE slug LIKE $1', [
      slug + '%',
    ]);

    if (existingSlug.rows.length > 0) {
      const existingSlugs = existingSlug.rows.map(r => r.slug);
      let counter = 1;
      while (existingSlugs.includes(slug)) {
        slug = `${generateSlug(name)}-${counter}`;
        counter++;
      }
    }

    // Check for duplicate name
    const existingName = await pool.query(
      'SELECT id FROM knowledge_spaces WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );

    if (existingName.rows.length > 0) {
      throw new ConflictError('Ein Wissensbereich mit diesem Namen existiert bereits');
    }

    // Generate embedding for description (for routing)
    const embedding = await getEmbedding(description);
    const embeddingJson = embedding ? JSON.stringify(embedding) : null;

    // Get max sort order
    const sortResult = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM knowledge_spaces'
    );
    const sortOrder = sortResult.rows[0].next_order;

    // Insert new space
    const result = await pool.query(
      `
        INSERT INTO knowledge_spaces (
            name, slug, description, description_embedding,
            icon, color, sort_order, parent_id, project_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
    `,
      [
        name.trim(),
        slug,
        description.trim(),
        embeddingJson,
        icon,
        color,
        sortOrder,
        parent_id,
        projectId,
      ]
    );

    logger.info(`Created knowledge space: ${name} (${slug})`);

    // Invalidate spaces cache
    cacheService.invalidate(CACHE_KEY_SPACES);

    res.status(201).json({
      space: result.rows[0],
      message: 'Wissensbereich erfolgreich erstellt',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/spaces/:id
 * Update a knowledge space
 */
router.put(
  '/:id',
  requireAuth,
  validateBody(UpdateSpaceBody),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, icon, color, sort_order, parent_id, project_id } = req.body;

    // Check if space exists and is not system
    const existingResult = await pool.query('SELECT * FROM knowledge_spaces WHERE id = $1', [id]);

    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Wissensbereich nicht gefunden');
    }

    const existing = existingResult.rows[0];

    // Batch 2: Ordner (samt Unterbaum) in ein anderes Projekt verschieben. Der
    // ganze Teilbaum muss mitwandern — sonst verschwänden Unterordner aus dem
    // Ziel- wie aus dem Quell-Projekt (project_id gescopte Tree-Abfrage).
    if (project_id !== undefined) {
      const projCheck = await pool.query('SELECT id FROM projects WHERE id = $1', [project_id]);
      if (projCheck.rows.length === 0) {
        throw new ValidationError('Projekt nicht gefunden');
      }
      await pool.query(
        `WITH RECURSIVE subtree AS (
           SELECT id FROM knowledge_spaces WHERE id = $1
           UNION ALL
           SELECT ks.id FROM knowledge_spaces ks JOIN subtree s ON ks.parent_id = s.id
         )
         UPDATE knowledge_spaces SET project_id = $2 WHERE id IN (SELECT id FROM subtree)`,
        [id, project_id]
      );
    }

    // System spaces have limited edits
    if (existing.is_system && name && name !== existing.name) {
      throw new ForbiddenError('Systembereich kann nicht umbenannt werden');
    }

    // Ordnerbaum: Verschieben mit Zyklus-Schutz (ein Ordner darf nicht in
    // sich selbst oder einen seiner Unterordner verschoben werden)
    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id === id) {
        throw new ValidationError('Ein Ordner kann nicht in sich selbst verschoben werden');
      }
      const cycleCheck = await pool.query(
        `WITH RECURSIVE subtree AS (
           SELECT id FROM knowledge_spaces WHERE id = $1
           UNION ALL
           SELECT ks.id FROM knowledge_spaces ks JOIN subtree s ON ks.parent_id = s.id
         )
         SELECT 1 AS hit FROM subtree WHERE id = $2
         UNION ALL
         SELECT 2 AS hit WHERE NOT EXISTS (SELECT 1 FROM knowledge_spaces WHERE id = $2)`,
        [id, parent_id]
      );
      if (cycleCheck.rows.length > 0) {
        const hit = cycleCheck.rows[0].hit;
        if (hit === 2) {
          throw new ValidationError('Übergeordneter Ordner nicht gefunden');
        }
        throw new ValidationError(
          'Ein Ordner kann nicht in einen seiner Unterordner verschoben werden'
        );
      }
    }

    // Re-generate embedding if description changed
    let descriptionEmbedding;
    if (description !== undefined && description.trim()) {
      const embedding = await getEmbedding(description);
      if (embedding) {
        descriptionEmbedding = JSON.stringify(embedding);
      }
    }

    // Build update query
    const { setClauses, params, paramIndex } = buildSetClauses(
      {
        name: name !== undefined && name.trim() ? name.trim() : undefined,
        description:
          description !== undefined && description.trim() ? description.trim() : undefined,
        description_embedding: descriptionEmbedding,
        icon,
        color,
        sort_order,
        parent_id,
      },
      { includeUpdatedAt: false }
    );

    // Nur ein Projekt-Move (ohne weitere Felder) ist eine gültige Änderung.
    if (setClauses.length === 0) {
      if (project_id !== undefined) {
        const moved = await pool.query('SELECT * FROM knowledge_spaces WHERE id = $1', [id]);
        cacheService.invalidate(CACHE_KEY_SPACES);
        return res.json({
          space: moved.rows[0],
          message: 'Ordner verschoben',
          timestamp: new Date().toISOString(),
        });
      }
      throw new ValidationError('Keine Änderungen angegeben');
    }

    params.push(id);
    const result = await pool.query(
      `
        UPDATE knowledge_spaces
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `,
      params
    );

    logger.info(`Updated knowledge space: ${id}`);

    // Invalidate spaces cache
    cacheService.invalidate(CACHE_KEY_SPACES);

    res.json({
      space: result.rows[0],
      message: 'Wissensbereich erfolgreich aktualisiert',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/spaces/:id
 * Delete a knowledge space (moves documents to "Allgemein")
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if space exists
    const existingResult = await pool.query('SELECT * FROM knowledge_spaces WHERE id = $1', [id]);

    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Wissensbereich nicht gefunden');
    }

    const existing = existingResult.rows[0];

    // Cannot delete system spaces
    if (existing.is_system) {
      throw new ForbiddenError('Systembereich kann nicht gelöscht werden');
    }

    // Ordnerbaum: Löschen nur, wenn keine Unterordner existieren (sicherer
    // Default aus dem Plan ide-workspace-shell — erst Unterordner auflösen)
    const childCheck = await pool.query(
      'SELECT COUNT(*)::int AS child_count FROM knowledge_spaces WHERE parent_id = $1',
      [id]
    );
    if ((childCheck.rows[0]?.child_count ?? 0) > 0) {
      throw new ConflictError(
        'Ordner enthält Unterordner — bitte zuerst die Unterordner löschen oder verschieben'
      );
    }

    // DB-003: Use transaction for atomic move + delete
    const { movedCount, contextFileDeleted } = await pool.transaction(async client => {
      // Get default space ID
      const defaultResult = await client.query(
        'SELECT id FROM knowledge_spaces WHERE is_default = TRUE'
      );

      const defaultSpaceId = defaultResult.rows.length > 0 ? defaultResult.rows[0].id : null;

      // Kontextdatei gehört zum Ordner, nicht zu den Dokumenten: beim Löschen
      // des Ordners soft-deleten (gleiches Muster wie DELETE /:id/context-file;
      // das MinIO-Objekt bleibt liegen — Soft-Delete-Konvention). Mitverschieben
      // würde eine unsichtbare zweite Kontextdatei im Zielspace erzeugen und
      // den UNIQUE-Index idx_documents_context_file_unique (Migration 099)
      // verletzen.
      const contextResult = await client.query(
        `
            UPDATE documents
            SET deleted_at = NOW(), status = 'deleted'
            WHERE space_id = $1 AND is_context_file = TRUE AND deleted_at IS NULL
            RETURNING id
        `,
        [id]
      );

      // Move normal documents (not the context file) to default space
      const moveResult = await client.query(
        `
            UPDATE documents
            SET space_id = $1
            WHERE space_id = $2 AND deleted_at IS NULL AND is_context_file = FALSE
            RETURNING id
        `,
        [defaultSpaceId, id]
      );

      // Delete the space
      await client.query('DELETE FROM knowledge_spaces WHERE id = $1', [id]);

      return {
        movedCount: moveResult.rows.length,
        contextFileDeleted: contextResult.rows.length > 0,
      };
    });

    if (contextFileDeleted) {
      // Prompt-Cache des gelöschten Ordners invalidieren (Muster wie bei
      // PUT/DELETE /:id/context-file)
      invalidateFolderContext(id);
    }

    logger.info(
      `Deleted knowledge space: ${id}, moved ${movedCount} documents` +
        (contextFileDeleted ? ', context file soft-deleted' : '')
    );

    // QDRANT-SYNC: Update Qdrant payloads for documents moved from deleted space
    if (movedCount > 0) {
      const defaultResult = await pool.query(
        'SELECT id, name, slug FROM knowledge_spaces WHERE is_default = TRUE'
      );
      const defaultSpace = defaultResult.rows[0];
      try {
        await axios.post(
          `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/payload`,
          {
            payload: {
              space_id: defaultSpace?.id || null,
              space_name: defaultSpace?.name || '',
              space_slug: defaultSpace?.slug || '',
            },
            filter: { must: [{ key: 'space_id', match: { value: id } }] },
          },
          { timeout: 15000 }
        );
        logger.info(`Updated Qdrant payloads for ${movedCount} docs from deleted space ${id}`);
      } catch (e) {
        logger.error(`Failed to update Qdrant payloads after space deletion ${id}: ${e.message}`);
      }
    }

    // Invalidate spaces cache
    cacheService.invalidate(CACHE_KEY_SPACES);

    res.json({
      status: 'deleted',
      moved_documents: movedCount,
      message: `Wissensbereich gelöscht. ${movedCount} Dokument(e) verschoben.`,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/spaces/:id/regenerate
 * Trigger auto-context regeneration for a space
 */
router.post(
  '/:id/regenerate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if space exists
    const existingResult = await pool.query('SELECT id, name FROM knowledge_spaces WHERE id = $1', [
      id,
    ]);

    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Wissensbereich nicht gefunden');
    }

    // Reset indexing status for all documents in this space so the
    // document-indexer will re-process them on its next polling cycle.
    const resetResult = await pool.query(
      `
        UPDATE documents
        SET indexing_status = 'pending',
            content_hash = NULL
        WHERE space_id = $1 AND indexing_status = 'completed'
        RETURNING id
      `,
      [id]
    );

    // Mark space auto-generation as pending
    await pool.query(
      `
        UPDATE knowledge_spaces
        SET auto_generation_status = 'pending',
            auto_generation_error = NULL
        WHERE id = $1
      `,
      [id]
    );

    const docCount = resetResult.rows.length;
    logger.info(
      `Regeneration requested for space ${id}: ${docCount} documents queued for re-indexing`
    );

    res.json({
      status: 'queued',
      documents_queued: docCount,
      message: `${docCount} Dokument(e) werden neu indexiert`,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/spaces/route
 * Find relevant spaces for a query (used by RAG)
 */
router.post(
  '/route',
  requireAuth,
  validateBody(RouteQueryBody),
  asyncHandler(async (req, res) => {
    const { query, top_k = 3, threshold = 0.5 } = req.body;

    // Get query embedding
    const queryEmbedding = await getEmbedding(query);

    if (!queryEmbedding) {
      // Fallback: return all spaces if embedding fails
      const allSpaces = await pool.query(`
            SELECT id, name, slug, description
            FROM knowledge_spaces
            ORDER BY sort_order, name
        `);

      return res.json({
        spaces: allSpaces.rows,
        method: 'fallback',
        timestamp: new Date().toISOString(),
      });
    }

    // Get all spaces with embeddings
    const spacesResult = await pool.query(`
        SELECT id, name, slug, description, description_embedding
        FROM knowledge_spaces
        WHERE description_embedding IS NOT NULL
    `);

    // Calculate cosine similarity for each space
    const scoredSpaces = spacesResult.rows
      .map(space => {
        const spaceEmbedding = JSON.parse(space.description_embedding);
        const similarity = cosineSimilarity(queryEmbedding, spaceEmbedding);
        return {
          id: space.id,
          name: space.name,
          slug: space.slug,
          description: space.description,
          score: similarity,
        };
      })
      .filter(space => space.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, top_k);

    // If no spaces meet threshold, return default space
    if (scoredSpaces.length === 0) {
      const defaultSpace = await pool.query(`
            SELECT id, name, slug, description
            FROM knowledge_spaces
            WHERE is_default = TRUE
        `);

      if (defaultSpace.rows.length > 0) {
        scoredSpaces.push({
          ...defaultSpace.rows[0],
          score: 0,
          fallback: true,
        });
      }
    }

    res.json({
      query,
      spaces: scoredSpaces,
      method: 'embedding_similarity',
      threshold,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/spaces/:id/context-file
 * Kontextdatei eines Ordners lesen (Plan ide-workspace-shell).
 * Liefert { document: null, content: null }, wenn keine existiert.
 */
router.get(
  '/:id/context-file',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const spaceCheck = await pool.query('SELECT id FROM knowledge_spaces WHERE id = $1', [id]);
    if (spaceCheck.rows.length === 0) {
      throw new NotFoundError('Wissensbereich nicht gefunden');
    }

    const docResult = await pool.query(
      `SELECT id, filename, file_path, file_size, updated_at
         FROM documents
        WHERE space_id = $1 AND is_context_file = TRUE AND deleted_at IS NULL
        LIMIT 1`,
      [id]
    );

    if (docResult.rows.length === 0) {
      res.json({ document: null, content: null, timestamp: new Date().toISOString() });
      return;
    }

    const doc = docResult.rows[0];
    if (!minioService.isValidMinioPath(doc.file_path)) {
      logger.error(`Invalid file path for context file: ${doc.file_path}`);
      throw new ValidationError('Ungültiger Dateipfad');
    }

    const stream = await minioService.getObject(doc.file_path);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    res.json({
      document: { id: doc.id, filename: doc.filename, updated_at: doc.updated_at },
      content: Buffer.concat(chunks).toString('utf-8'),
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/spaces/:id/context-file
 * Kontextdatei eines Ordners anlegen oder aktualisieren (Upsert).
 * Kontextdateien bekommen status 'context' — der Document-Indexer pollt nur
 * 'pending' und überspringt sie damit (kein Qdrant-Index, kein RAG-Zitat).
 */
router.put(
  '/:id/context-file',
  requireAuth,
  validateBody(UpsertContextFileBody),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;

    const contentBuffer = Buffer.from(content, 'utf-8');
    const contentHash = crypto.createHash('sha256').update(contentBuffer).digest('hex');

    // Upsert in einer Transaktion (Muster wie DELETE /:id, DB-003): der
    // FOR-UPDATE-Lock auf der Space-Zeile serialisiert parallele PUTs für
    // denselben Ordner — der SELECT-then-INSERT-Race aus PR #178 kann keine
    // zweite Kontextdatei mehr anlegen. Backstop: der UNIQUE partial index
    // idx_documents_context_file_unique (Migration 099); eine dennoch
    // auftretende Unique-Violation (PG 23505) mappt der globale ErrorHandler
    // auf 409/CONFLICT.
    const { documentId } = await pool.transaction(async client => {
      const spaceCheck = await client.query(
        'SELECT id, name FROM knowledge_spaces WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (spaceCheck.rows.length === 0) {
        throw new NotFoundError('Wissensbereich nicht gefunden');
      }

      const existingResult = await client.query(
        `SELECT id, file_path FROM documents
          WHERE space_id = $1 AND is_context_file = TRUE AND deleted_at IS NULL
          LIMIT 1
            FOR UPDATE`,
        [id]
      );

      if (existingResult.rows.length > 0) {
        // Update: gleicher MinIO-Pfad, neuer Inhalt
        const existing = existingResult.rows[0];
        if (!minioService.isValidMinioPath(existing.file_path)) {
          logger.error(`Invalid file path for context file: ${existing.file_path}`);
          throw new ValidationError('Ungültiger Dateipfad');
        }
        await client.query(
          `UPDATE documents
              SET file_size = $1, content_hash = $2, char_count = $3, updated_at = NOW()
            WHERE id = $4`,
          [contentBuffer.length, contentHash, content.length, existing.id]
        );
        // MinIO-Upload zuletzt: schlägt er fehl, rollt die DB-Änderung zurück
        // und der alte Objekt-Inhalt bleibt konsistent stehen.
        await minioService.uploadObject(existing.file_path, contentBuffer, contentBuffer.length, {
          'Content-Type': 'text/markdown',
        });
        return { documentId: existing.id };
      }

      // Create: neues Markdown-Dokument mit is_context_file-Flag
      const objectName = `${Date.now()}_kontext_${id}.md`;
      const newDocumentId = crypto.randomUUID();
      const fileHash = crypto
        .createHash('sha256')
        .update(`${objectName}:${contentBuffer.length}`)
        .digest('hex');

      await client.query(
        `INSERT INTO documents (
             id, filename, original_filename, file_path, file_size,
             mime_type, file_extension, content_hash, file_hash,
             status, space_id, title, is_context_file, char_count
         ) VALUES ($1, $2, $2, $3, $4, 'text/markdown', '.md', $5, $6,
                   'context', $7, $8, TRUE, $9)`,
        [
          newDocumentId,
          'KONTEXT.md',
          objectName,
          contentBuffer.length,
          contentHash,
          fileHash,
          id,
          `Kontextdatei: ${spaceCheck.rows[0].name}`,
          content.length,
        ]
      );
      // MinIO-Upload zuletzt: schlägt er fehl, rollt der INSERT zurück und es
      // bleibt weder DB-Zeile noch Objekt-Referenz zurück.
      await minioService.uploadObject(objectName, contentBuffer, contentBuffer.length, {
        'Content-Type': 'text/markdown',
      });
      return { documentId: newDocumentId };
    });

    // Prompt-Cache dieses Ordners invalidieren — Änderungen wirken sofort
    invalidateFolderContext(id);

    logger.info(`Upserted context file for space ${id} (document ${documentId})`);

    res.json({
      document: { id: documentId },
      message: 'Kontextdatei gespeichert',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/spaces/:id/context-file
 * Kontextdatei eines Ordners entfernen (Soft-Delete wie normale Dokumente).
 */
router.delete(
  '/:id/context-file',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE documents
          SET deleted_at = NOW(), status = 'deleted'
        WHERE space_id = $1 AND is_context_file = TRUE AND deleted_at IS NULL
        RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Keine Kontextdatei für diesen Ordner vorhanden');
    }

    invalidateFolderContext(id);

    res.json({
      status: 'deleted',
      message: 'Kontextdatei gelöscht',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * Helper: Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

module.exports = router;
