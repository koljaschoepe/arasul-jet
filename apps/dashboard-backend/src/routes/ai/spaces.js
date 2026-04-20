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
const { CreateSpaceBody, UpdateSpaceBody, RouteQueryBody } = require('../../schemas/spaces');
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
    const result = await pool.query(`
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
            GROUP BY space_id
        ) doc_stats ON ks.id = doc_stats.space_id
        ORDER BY ks.sort_order, ks.name
    `);

    res.json({
      spaces: result.rows,
      total: result.rows.length,
      timestamp: new Date().toISOString(),
    });
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
        WHERE space_id = $1 AND deleted_at IS NULL
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
    const { name, description, icon = 'folder', color = '#6366f1' } = req.body;

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
            icon, color, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `,
      [name.trim(), slug, description.trim(), embeddingJson, icon, color, sortOrder]
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
    const { name, description, icon, color, sort_order } = req.body;

    // Check if space exists and is not system
    const existingResult = await pool.query('SELECT * FROM knowledge_spaces WHERE id = $1', [id]);

    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Wissensbereich nicht gefunden');
    }

    const existing = existingResult.rows[0];

    // System spaces have limited edits
    if (existing.is_system && name && name !== existing.name) {
      throw new ForbiddenError('Systembereich kann nicht umbenannt werden');
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
      },
      { includeUpdatedAt: false }
    );

    if (setClauses.length === 0) {
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

    // DB-003: Use transaction for atomic move + delete
    const { movedCount } = await pool.transaction(async client => {
      // Get default space ID
      const defaultResult = await client.query(
        'SELECT id FROM knowledge_spaces WHERE is_default = TRUE'
      );

      const defaultSpaceId = defaultResult.rows.length > 0 ? defaultResult.rows[0].id : null;

      // Move documents to default space
      const moveResult = await client.query(
        `
            UPDATE documents
            SET space_id = $1
            WHERE space_id = $2 AND deleted_at IS NULL
            RETURNING id
        `,
        [defaultSpaceId, id]
      );

      // Delete the space
      await client.query('DELETE FROM knowledge_spaces WHERE id = $1', [id]);

      return { movedCount: moveResult.rows.length };
    });

    logger.info(`Deleted knowledge space: ${id}, moved ${movedCount} documents`);

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
