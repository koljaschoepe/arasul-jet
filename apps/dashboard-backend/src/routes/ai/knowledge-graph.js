/**
 * Knowledge Graph API Routes
 * Provides graph-based entity and relation queries for RAG enrichment
 *
 * Features:
 * - Entity search and listing
 * - Graph traversal (related entities)
 * - Document-entity associations
 * - Graph statistics
 * - Connection path finding
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { requireAuth } = require('../../middleware/auth');
const pool = require('../../database');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, NotFoundError, ServiceUnavailableError } = require('../../utils/errors');
const axios = require('axios');

const DOCUMENT_INDEXER_URL = process.env.DOCUMENT_INDEXER_URL || 'http://document-indexer:9102';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valid entity types for input validation
const VALID_ENTITY_TYPES = [
  'Person',
  'Organisation',
  'Produkt',
  'Technologie',
  'Prozess',
  'Konzept',
  'Ort',
  'Dokument',
];

/**
 * GET /api/knowledge-graph/entities
 * Search entities by name pattern or filter by type
 */
router.get(
  '/entities',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { search, type, limit = 50 } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 200);

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (search) {
      if (search.length > 200) {throw new ValidationError('Suchbegriff zu lang (max. 200 Zeichen)');}
      conditions.push(`name ILIKE $${paramIdx}`);
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (type) {
      if (!VALID_ENTITY_TYPES.includes(type)) {
        throw new ValidationError(`Ungültiger Entity-Typ: ${type}`);
      }
      conditions.push(`entity_type = $${paramIdx}`);
      params.push(type);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(safeLimit);

    const result = await pool.query(
      `
    SELECT id, name, entity_type AS type, mention_count,
           created_at, updated_at
    FROM kg_entities
    ${where}
    ORDER BY mention_count DESC, name
    LIMIT $${paramIdx}
  `,
      params
    );

    res.json({
      entities: result.rows,
      total: result.rows.length,
    });
  })
);

/**
 * GET /api/knowledge-graph/related/:entityName
 * Find entities related to a given entity (graph traversal)
 */
router.get(
  '/related/:entityName',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { entityName } = req.params;
    if (entityName.length > 500)
      {throw new ValidationError('Entity-Name zu lang (max. 500 Zeichen)');}
    const depth = Math.min(parseInt(req.query.depth) || 2, 4);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const result = await pool.query(
      `
    WITH RECURSIVE graph_walk AS (
      SELECT
        e.id, e.name, e.entity_type,
        0 AS distance,
        ''::text AS relation_path,
        ARRAY[e.id] AS visited
      FROM kg_entities e
      WHERE LOWER(e.name) = LOWER($1)

      UNION ALL

      SELECT
        t.id, t.name, t.entity_type,
        gw.distance + 1,
        gw.relation_path || CASE WHEN gw.relation_path = '' THEN '' ELSE ' → ' END || r.relation_type,
        gw.visited || t.id
      FROM graph_walk gw
      JOIN kg_relations r ON r.source_entity_id = gw.id
      JOIN kg_entities t ON t.id = r.target_entity_id
      WHERE gw.distance < $2 AND t.id != ALL(gw.visited)

      UNION ALL

      SELECT
        s.id, s.name, s.entity_type,
        gw.distance + 1,
        gw.relation_path || CASE WHEN gw.relation_path = '' THEN '' ELSE ' → ' END || r.relation_type,
        gw.visited || s.id
      FROM graph_walk gw
      JOIN kg_relations r ON r.target_entity_id = gw.id
      JOIN kg_entities s ON s.id = r.source_entity_id
      WHERE gw.distance < $2 AND s.id != ALL(gw.visited)
    )
    SELECT DISTINCT ON (name)
      name, entity_type AS type, distance, relation_path AS relation
    FROM graph_walk
    WHERE distance > 0
    ORDER BY name, distance
    LIMIT $3
  `,
      [entityName, depth, limit]
    );

    res.json({
      entity: entityName,
      related: result.rows,
      total: result.rows.length,
    });
  })
);

/**
 * GET /api/knowledge-graph/document/:documentId
 * Get all entities linked to a specific document
 */
router.get(
  '/document/:documentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { documentId } = req.params;
    if (!UUID_RE.test(documentId)) {throw new ValidationError('Ungültige Dokument-ID');}

    // Verify document exists
    const docCheck = await pool.query(
      'SELECT id, filename, title FROM documents WHERE id = $1::uuid AND deleted_at IS NULL',
      [documentId]
    );
    if (docCheck.rows.length === 0) {
      throw new NotFoundError('Dokument nicht gefunden');
    }

    const result = await pool.query(
      `
    SELECT e.id, e.name, e.entity_type AS type, ed.mention_count
    FROM kg_entities e
    JOIN kg_entity_documents ed ON ed.entity_id = e.id
    WHERE ed.document_id = $1::uuid
    ORDER BY ed.mention_count DESC, e.name
  `,
      [documentId]
    );

    // Also get relations between entities in this document
    const relations = await pool.query(
      `
    SELECT
      se.name AS source_name, se.entity_type AS source_type,
      r.relation_type,
      te.name AS target_name, te.entity_type AS target_type,
      r.context
    FROM kg_relations r
    JOIN kg_entities se ON se.id = r.source_entity_id
    JOIN kg_entities te ON te.id = r.target_entity_id
    WHERE r.source_document_id = $1::uuid
    ORDER BY r.weight DESC
    LIMIT 100
  `,
      [documentId]
    );

    res.json({
      document: docCheck.rows[0],
      entities: result.rows,
      relations: relations.rows,
    });
  })
);

/**
 * GET /api/knowledge-graph/connections
 * Find shortest path between two entities
 */
router.get(
  '/connections',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { entity1, entity2, maxDepth = 4 } = req.query;

    if (!entity1 || !entity2) {
      throw new ValidationError('entity1 und entity2 sind erforderlich');
    }
    if (entity1.length > 500 || entity2.length > 500) {
      throw new ValidationError('Entity-Name zu lang (max. 500 Zeichen)');
    }

    const depth = Math.min(parseInt(maxDepth) || 4, 4);

    const result = await pool.query(
      `
    WITH RECURSIVE path_search AS (
      SELECT
        e.id, e.name,
        ARRAY[e.name] AS path_names,
        ARRAY[e.id] AS visited,
        ARRAY[]::text[] AS relations,
        0 AS depth
      FROM kg_entities e
      WHERE LOWER(e.name) = LOWER($1)

      UNION ALL

      SELECT
        next_e.id, next_e.name,
        ps.path_names || next_e.name,
        ps.visited || next_e.id,
        ps.relations || r.relation_type,
        ps.depth + 1
      FROM path_search ps
      JOIN kg_relations r ON r.source_entity_id = ps.id
                          OR r.target_entity_id = ps.id
      JOIN kg_entities next_e ON next_e.id = CASE
        WHEN r.source_entity_id = ps.id THEN r.target_entity_id
        ELSE r.source_entity_id
      END
      WHERE ps.depth < $3 AND next_e.id != ALL(ps.visited)
    )
    SELECT path_names AS nodes, relations
    FROM path_search
    WHERE LOWER(name) = LOWER($2)
    ORDER BY depth
    LIMIT 5
  `,
      [entity1, entity2, depth]
    );

    res.json({
      from: entity1,
      to: entity2,
      paths: result.rows,
      found: result.rows.length > 0,
    });
  })
);

/**
 * GET /api/knowledge-graph/stats
 * Knowledge graph statistics overview
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [stats, entityTypes, relationTypes, topEntities] = await Promise.all([
      pool.query(`
      SELECT
        (SELECT COUNT(*) FROM kg_entities) AS entity_count,
        (SELECT COUNT(*) FROM kg_relations) AS relation_count,
        (SELECT COUNT(DISTINCT document_id) FROM kg_entity_documents) AS document_count
    `),
      pool.query(`
      SELECT entity_type, COUNT(*) AS count
      FROM kg_entities
      GROUP BY entity_type
      ORDER BY count DESC
    `),
      pool.query(`
      SELECT relation_type, COUNT(*) AS count
      FROM kg_relations
      GROUP BY relation_type
      ORDER BY count DESC
    `),
      pool.query(`
      SELECT name, entity_type AS type, mention_count
      FROM kg_entities
      ORDER BY mention_count DESC
      LIMIT 20
    `),
    ]);

    const row = stats.rows[0];
    res.json({
      entities: parseInt(row.entity_count),
      relations: parseInt(row.relation_count),
      documents: parseInt(row.document_count),
      entity_types: entityTypes.rows.reduce((acc, r) => {
        acc[r.entity_type] = parseInt(r.count);
        return acc;
      }, {}),
      relation_types: relationTypes.rows.reduce((acc, r) => {
        acc[r.relation_type] = parseInt(r.count);
        return acc;
      }, {}),
      top_entities: topEntities.rows,
    });
  })
);

/**
 * POST /api/knowledge-graph/query
 * Free-text question → graph-enriched context (for n8n workflows)
 * Extracts entities from the question, traverses the graph,
 * and optionally returns linked documents.
 */
router.post(
  '/query',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { question, include_documents = true, max_depth = 2, max_entities = 5 } = req.body;

    if (!question || typeof question !== 'string') {
      throw new ValidationError('question ist erforderlich');
    }
    if (question.length > 5000) {
      throw new ValidationError('Frage zu lang (max. 5000 Zeichen)');
    }

    const depth = Math.min(parseInt(max_depth) || 2, 4);
    const entityLimit = Math.min(parseInt(max_entities) || 5, 10);

    // 1. Extract entities from question via document-indexer
    let queryEntities = [];
    try {
      const entityResponse = await axios.post(
        `${DOCUMENT_INDEXER_URL}/extract-entities`,
        { text: question },
        { timeout: 5000 }
      );
      queryEntities = (entityResponse.data.entities || []).slice(0, entityLimit);
    } catch (err) {
      logger.warn(`Entity extraction for n8n query failed: ${err.message}`);
    }

    // 2. Traverse the graph for each entity
    const graphRelations = [];
    for (const entity of queryEntities) {
      const result = await pool.query(
        `
      WITH RECURSIVE graph_walk AS (
        SELECT
          e.id, e.name, e.entity_type,
          0 AS distance,
          ''::text AS relation_path,
          ARRAY[e.id] AS visited
        FROM kg_entities e
        WHERE LOWER(e.name) = LOWER($1)

        UNION ALL

        SELECT
          t.id, t.name, t.entity_type,
          gw.distance + 1,
          gw.relation_path || CASE WHEN gw.relation_path = '' THEN '' ELSE ' → ' END || r.relation_type,
          gw.visited || t.id
        FROM graph_walk gw
        JOIN kg_relations r ON r.source_entity_id = gw.id
        JOIN kg_entities t ON t.id = r.target_entity_id
        WHERE gw.distance < $2 AND t.id != ALL(gw.visited)

        UNION ALL

        SELECT
          s.id, s.name, s.entity_type,
          gw.distance + 1,
          gw.relation_path || CASE WHEN gw.relation_path = '' THEN '' ELSE ' → ' END || r.relation_type,
          gw.visited || s.id
        FROM graph_walk gw
        JOIN kg_relations r ON r.target_entity_id = gw.id
        JOIN kg_entities s ON s.id = r.source_entity_id
        WHERE gw.distance < $2 AND s.id != ALL(gw.visited)
      )
      SELECT DISTINCT ON (name)
        name, entity_type AS type, distance, relation_path AS relation
      FROM graph_walk
      WHERE distance > 0
      ORDER BY name, distance
      LIMIT 15
    `,
        [entity.name, depth]
      );

      for (const row of result.rows) {
        graphRelations.push({
          source: entity.name,
          source_type: entity.type,
          target: row.name,
          target_type: row.type,
          relation: row.relation,
          distance: row.distance,
        });
      }
    }

    // 3. Build text context
    let graphContext = null;
    if (graphRelations.length > 0) {
      graphContext = 'Wissensverknüpfungen:\n';
      for (const r of graphRelations) {
        const relLabel = r.relation.replace(/_/g, ' ').toLowerCase() || 'verwandt mit';
        graphContext += `- ${r.source} → ${relLabel} → ${r.target} (${r.target_type})\n`;
      }
    }

    // 4. Optionally get linked documents
    let linkedDocuments = [];
    if (include_documents && queryEntities.length > 0) {
      const entityNames = queryEntities.map(e => e.name);
      const docResult = await pool.query(
        `
      SELECT DISTINCT d.id, d.filename, d.title, e.name AS entity_name
      FROM documents d
      JOIN kg_entity_documents ed ON ed.document_id = d.id
      JOIN kg_entities e ON e.id = ed.entity_id
      WHERE LOWER(e.name) = ANY($1::text[]) AND d.deleted_at IS NULL
      ORDER BY d.title
      LIMIT 20
    `,
        [entityNames.map(n => n.toLowerCase())]
      );
      linkedDocuments = docResult.rows;
    }

    res.json({
      question,
      entities: queryEntities,
      graph_relations: graphRelations,
      graph_context: graphContext,
      linked_documents: linkedDocuments,
    });
  })
);

/**
 * POST /api/knowledge-graph/refine
 * Trigger LLM-based graph refinement (entity resolution + relation refinement)
 * Calls document-indexer service which runs the refinement in background
 */
router.post(
  '/refine',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const response = await axios.post(
        `${DOCUMENT_INDEXER_URL}/refine-graph`,
        {},
        { timeout: 10000 }
      );
      res.json(response.data);
    } catch (err) {
      if (err.response && err.response.status === 409) {
        res.status(409).json(err.response.data);
      } else {
        logger.error(`Graph refinement trigger failed: ${err.message}`);
        throw new ServiceUnavailableError('Graph-Verfeinerung konnte nicht gestartet werden');
      }
    }
  })
);

/**
 * GET /api/knowledge-graph/refine/status
 * Get graph refinement status and statistics
 */
router.get(
  '/refine/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const response = await axios.get(`${DOCUMENT_INDEXER_URL}/refine-graph/status`, {
        timeout: 5000,
      });
      res.json(response.data);
    } catch (err) {
      logger.warn(`Graph refinement status fetch failed: ${err.message}`);

      // Fallback: get basic stats from database directly
      const stats = await pool.query(`
      SELECT
        COUNT(*) AS total_entities,
        COUNT(*) FILTER (WHERE refined = TRUE) AS refined_entities,
        COUNT(*) FILTER (WHERE canonical_id IS NOT NULL) AS merged_entities
      FROM kg_entities
    `);
      const relStats = await pool.query(`
      SELECT
        COUNT(*) AS total_relations,
        COUNT(*) FILTER (WHERE refined = TRUE) AS refined_relations,
        COUNT(*) FILTER (WHERE relation_type = 'VERWANDT_MIT' AND refined = FALSE) AS unrefined_generic
      FROM kg_relations
    `);
      res.json({
        entities: stats.rows[0],
        relations: relStats.rows[0],
        is_running: false,
        last_result: null,
        source: 'database_fallback',
      });
    }
  })
);

module.exports = router;
