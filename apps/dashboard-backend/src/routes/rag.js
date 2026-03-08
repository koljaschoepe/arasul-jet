/**
 * RAG (Retrieval Augmented Generation) API Routes
 * Provides endpoints for querying documents using vector search and LLM
 * Uses Queue System for sequential LLM processing
 *
 * HYBRID SEARCH: Combines vector similarity with keyword matching for better recall
 *
 * RAG 2.0: Hierarchical Context with Knowledge Spaces
 * - Company context (global)
 * - Space routing based on query
 * - Space-filtered document retrieval
 *
 * Core functions extracted to services/rag/ragCore.js for reuse
 * (Telegram bots, future integrations)
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { llmLimiter } = require('../middleware/rateLimit');
const llmJobService = require('../services/llm/llmJobService');
const llmQueueService = require('../services/llm/llmQueueService');
const db = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, ServiceUnavailableError } = require('../utils/errors');
const { initSSE, trackConnection } = require('../utils/sseHelper');
const services = require('../config/services');
const { optimizeQuery } = require('../services/context/queryOptimizer');

// Import core RAG functions from shared module
const ragCore = require('../services/rag/ragCore');
const {
  getEmbedding,
  getEmbeddings,
  getCompanyContext,
  routeToSpaces,
  hybridSearch,
  rerankResults,
  filterByRelevance,
  graphEnrichedRetrieval,
  getParentChunks,
  buildHierarchicalContext,
  ENABLE_RERANKING,
} = ragCore;

// Environment variables (only those needed by routes, not core functions)
const QDRANT_HOST = services.qdrant.host;
const QDRANT_PORT = services.qdrant.port;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';

/**
 * POST /api/rag/query
 * Perform RAG query with Queue support
 * RAG 2.0: Hierarchical context with Knowledge Spaces
 */
router.post(
  '/query',
  requireAuth,
  llmLimiter,
  asyncHandler(async (req, res) => {
    const {
      query,
      top_k = 5,
      thinking,
      conversation_id,
      space_ids = null, // RAG 2.0: Optional pre-selected spaces
      auto_routing = true, // RAG 2.0: Enable automatic space routing
      model = null, // Optional: explicit model selection
    } = req.body;
    const enableThinking = thinking !== false;

    if (!query || typeof query !== 'string') {
      throw new ValidationError('Query is required and must be a string');
    }

    if (!conversation_id) {
      throw new ValidationError('conversation_id is required for RAG queries');
    }

    try {
      const HYBRID_SEARCH_ENABLED = process.env.RAG_HYBRID_SEARCH !== 'false';
      logger.info(
        `RAG query: "${query}" (top_k=${top_k}, thinking=${enableThinking}, hybrid=${HYBRID_SEARCH_ENABLED}, reranking=${ENABLE_RERANKING})`
      );

      // Step 0: Spell correction (typo tolerance)
      let correctedQuery = query;
      let spellCorrections = [];
      try {
        const DOCUMENT_INDEXER_URL = services.documentIndexer.url;
        const spellResult = await axios.post(
          `${DOCUMENT_INDEXER_URL}/spellcheck`,
          { text: query },
          { timeout: 3000 }
        );
        if (spellResult.data.corrections && spellResult.data.corrections.length > 0) {
          correctedQuery = spellResult.data.corrected;
          spellCorrections = spellResult.data.corrections;
          logger.info(
            `Spell correction: "${query}" → "${correctedQuery}" (${spellCorrections.length} fixes)`
          );
        }
      } catch (spellErr) {
        logger.debug(`Spell check unavailable: ${spellErr.message}`);
      }

      // Step 1: Query optimization + embedding + company context in parallel
      const [queryOptResult, queryEmbedding, companyContext] = await Promise.all([
        optimizeQuery(correctedQuery),
        getEmbedding(correctedQuery),
        getCompanyContext(),
      ]);

      const { decompounded, queryVariants, hydeText, details: queryOptDetails } = queryOptResult;

      // Step 2: Embed multi-query variants and HyDE text (batch)
      const additionalTexts = [];
      if (queryVariants.length > 1) {
        additionalTexts.push(...queryVariants.slice(1));
      }
      if (hydeText) {
        additionalTexts.push(hydeText);
      }

      const additionalEmbeddings =
        additionalTexts.length > 0 ? await getEmbeddings(additionalTexts) : [];

      // Step 3: Space routing
      let targetSpaces = [];
      let routingMethod = 'none';
      let targetSpaceIds = space_ids;

      // Project-level space override: if conversation belongs to a project with a knowledge_space_id
      if (!space_ids && conversation_id) {
        try {
          const projSpace = await db.query(
            `SELECT p.knowledge_space_id FROM projects p
             JOIN chat_conversations c ON c.project_id = p.id
             WHERE c.id = $1 AND p.knowledge_space_id IS NOT NULL`,
            [conversation_id]
          );
          if (projSpace.rows.length > 0) {
            targetSpaceIds = [projSpace.rows[0].knowledge_space_id];
            logger.debug(`Project space override: ${targetSpaceIds[0]}`);
          }
        } catch (projErr) {
          logger.debug(`Project space lookup failed: ${projErr.message}`);
        }
      }

      if (targetSpaceIds && targetSpaceIds.length > 0) {
        const spacesResult = await db.query(
          'SELECT id, name, slug, description FROM knowledge_spaces WHERE id = ANY($1::uuid[])',
          [targetSpaceIds]
        );
        targetSpaces = spacesResult.rows;
        routingMethod = 'manual';
        logger.debug(`Using ${targetSpaces.length} pre-selected spaces`);
      } else if (auto_routing) {
        const routingResult = await routeToSpaces(queryEmbedding);
        targetSpaces = routingResult.spaces;
        routingMethod = routingResult.method;

        if (routingMethod === 'error' || routingMethod === 'all') {
          targetSpaceIds = null;
        } else {
          targetSpaceIds = targetSpaces.map(s => s.id);
        }
        logger.debug(`Auto-routing: ${routingMethod}, ${targetSpaces.length} spaces`);
      }

      // Step 4: Hybrid search + Graph enrichment IN PARALLEL
      const spaceFilter = targetSpaceIds && targetSpaceIds.length > 0 ? targetSpaceIds : null;
      const [searchResults, graphEnrichment] = await Promise.all([
        hybridSearch(query, queryEmbedding, top_k, spaceFilter, {
          additionalEmbeddings,
          decompoundedQuery: decompounded,
        }),
        graphEnrichedRetrieval(correctedQuery),
      ]);

      // Step 5: Rerank results (2-stage: FlashRank → BGE-reranker)
      const rerankedResults = await rerankResults(query, searchResults, top_k);

      // Step 5b: RAG 4.0 - Filter by relevance score
      const wasReranked = ENABLE_RERANKING && rerankedResults.some(r => r.rerankScore != null);
      const { relevant: relevantResults } = filterByRelevance(rerankedResults, wasReranked);

      // Step 6: Load parent chunks for richer LLM context
      const parentChunks = await getParentChunks(relevantResults);

      // Step 7: Build sources from relevant results only
      const sources = relevantResults.map(result => {
        const payload = result.payload;
        return {
          document_name: payload.document_name,
          chunk_index: payload.chunk_index,
          score: result.score,
          rerank_score: result.rerankScore || null,
          hybrid_score: result.hybridScore || null,
          text_preview: payload.text.substring(0, 200) + (payload.text.length > 200 ? '...' : ''),
          space_id: payload.space_id,
          space_name: payload.space_name || '',
          document_id: payload.document_id,
        };
      });

      // Step 8: Build hierarchical context with parent chunks (RAG 3.0)
      const chunks = relevantResults.map(r => ({
        document_name: r.payload.document_name,
        text: r.payload.text,
        space_name: r.payload.space_name,
        category: r.payload.category || null,
        parent_chunk_id: r.payload.parent_chunk_id || null,
      }));

      const context = buildHierarchicalContext(
        companyContext,
        targetSpaces.length > 0 ? targetSpaces : null,
        chunks,
        parentChunks,
        graphEnrichment.graphContext
      );

      // RAG 4.0: Detect "docs exist but none relevant" case
      const noRelevantDocs = relevantResults.length === 0 && rerankedResults.length > 0;

      // Set up SSE headers early
      initSSE(res);

      // Handle no documents case - respond immediately without queue
      if (rerankedResults.length === 0) {
        const noDocsMessage =
          'Es wurden keine relevanten Dokumente gefunden. Bitte laden Sie Dokumente in den MinIO-Bucket "documents" hoch, um das RAG-System zu nutzen.';

        const { jobId, messageId } = await llmJobService.createJob(conversation_id, 'rag', {
          query,
          top_k,
          thinking: enableThinking,
          sources: [],
        });

        await llmJobService.updateJobContent(jobId, noDocsMessage, null, []);
        await llmJobService.completeJob(jobId);

        res.write(`data: ${JSON.stringify({ type: 'job_started', jobId, messageId })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'sources', sources: [] })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'response', token: noDocsMessage })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', done: true, jobId })}\n\n`);
        return res.end();
      }

      // Step 9: Enqueue RAG job (LLM streaming goes through queue)
      const { jobId, messageId, queuePosition } = await llmQueueService.enqueue(
        conversation_id,
        'rag',
        { query, context, thinking: enableThinking, sources, noRelevantDocs },
        { model }
      );

      logger.info(`[QUEUE] RAG job ${jobId} enqueued at position ${queuePosition}`);

      // Send SSE events
      res.write(
        `data: ${JSON.stringify({
          type: 'job_started',
          jobId,
          messageId,
          queuePosition,
          status: queuePosition > 1 ? 'queued' : 'pending',
        })}\n\n`
      );

      // Combined RAG metadata event (reduces 3 SSE events → 1 re-render)
      res.write(
        `data: ${JSON.stringify({
          type: 'rag_metadata',
          queryOptimization: queryOptDetails,
          spellCorrection:
            spellCorrections.length > 0
              ? {
                  original: query,
                  corrected: correctedQuery,
                  corrections: spellCorrections,
                }
              : null,
          matchedSpaces: targetSpaces.map(s => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            score: s.score,
          })),
          routingMethod,
          sources,
          graphEnrichment:
            graphEnrichment.graphEntities.length > 0
              ? {
                  entities: graphEnrichment.graphEntities.map(e => ({
                    name: e.name,
                    type: e.type,
                  })),
                  hasContext: !!graphEnrichment.graphContext,
                }
              : null,
        })}\n\n`
      );

      // Track client connection with single close handler
      const connection = trackConnection(res);
      let unsubscribe = null;

      connection.onClose(() => {
        logger.debug(`[RAG ${jobId}] Client disconnected, job continues in background`);
        if (unsubscribe) {
          unsubscribe();
        }
      });

      // Subscribe to job updates and forward to client
      unsubscribe = llmQueueService.subscribeToJob(jobId, event => {
        if (!connection.isConnected()) {
          return;
        }

        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);

          if (event.done) {
            res.end();
            unsubscribe();
          }
        } catch (err) {
          logger.debug(`[RAG ${jobId}] Write error: ${err.message}`);
        }
      });
    } catch (error) {
      logger.error(`RAG query error: ${error.message}`);

      if (!res.headersSent) {
        throw error;
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      }
    }
  })
);

/**
 * GET /api/rag/status
 * Check if RAG system is operational
 */
router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    let qdrantResponse;
    try {
      qdrantResponse = await axios.get(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}`,
        { timeout: 5000 }
      );
    } catch (error) {
      logger.error(`RAG status check error: ${error.message}`);
      throw new ServiceUnavailableError('RAG system is degraded');
    }

    const collection = qdrantResponse.data.result;

    res.json({
      status: 'operational',
      qdrant: {
        connected: true,
        collection: QDRANT_COLLECTION,
        points_count: collection.points_count || 0,
        vectors_count: collection.vectors_count || 0,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/rag/fix-space-ids
 * One-time migration: fix Qdrant points with empty string space_id
 * Reads correct space_id from PostgreSQL and updates Qdrant payloads
 */
router.post(
  '/fix-space-ids',
  requireAuth,
  asyncHandler(async (req, res) => {
    logger.info('[MIGRATION] Starting fix-space-ids migration...');

    let fixed = 0;
    const skipped = 0;
    let errors = 0;
    let offset = null;

    while (true) {
      const scrollBody = {
        filter: {
          must: [{ key: 'space_id', match: { value: '' } }],
        },
        limit: 100,
        with_payload: true,
      };
      if (offset) {
        scrollBody.offset = offset;
      }

      const scrollResponse = await axios.post(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/scroll`,
        scrollBody,
        { timeout: 30000 }
      );

      const points = scrollResponse.data.result.points || [];
      offset = scrollResponse.data.result.next_page_offset;

      if (points.length === 0) {
        break;
      }

      const docIds = [...new Set(points.map(p => p.payload.document_id).filter(Boolean))];

      for (const docId of docIds) {
        try {
          const result = await db.query(
            `
                    SELECT d.space_id, ks.name as space_name, ks.slug as space_slug
                    FROM documents d
                    LEFT JOIN knowledge_spaces ks ON d.space_id = ks.id
                    WHERE d.id = $1
                `,
            [docId]
          );

          const row = result.rows[0];
          const newSpaceId = row?.space_id ? String(row.space_id) : null;
          const newSpaceName = row?.space_name || '';
          const newSpaceSlug = row?.space_slug || '';

          await axios.post(
            `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/payload`,
            {
              payload: {
                space_id: newSpaceId,
                space_name: newSpaceName,
                space_slug: newSpaceSlug,
              },
              filter: {
                must: [{ key: 'document_id', match: { value: docId } }],
              },
            },
            { timeout: 10000 }
          );

          fixed++;
          logger.debug(`[MIGRATION] Fixed space_id for document ${docId}: ${newSpaceId || 'null'}`);
        } catch (err) {
          errors++;
          logger.warn(`[MIGRATION] Failed to fix document ${docId}: ${err.message}`);
        }
      }

      if (!offset) {
        break;
      }
    }

    logger.info(
      `[MIGRATION] fix-space-ids complete: ${fixed} fixed, ${skipped} skipped, ${errors} errors`
    );

    res.json({
      status: 'completed',
      fixed,
      skipped,
      errors,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
