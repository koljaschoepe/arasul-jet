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
const { validateBody } = require('../middleware/validate');
const { RagQueryBody } = require('../schemas/rag');
const { ValidationError, ServiceUnavailableError } = require('../utils/errors');
const { initSSE, trackConnection } = require('../utils/sseHelper');
const services = require('../config/services');
const { optimizeQuery } = require('../services/context/queryOptimizer');

const { logRagQuery } = require('../services/rag/ragMetrics');

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
  deduplicateByDocument,
  applyMMR,
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
  validateBody(RagQueryBody),
  asyncHandler(async (req, res) => {
    const {
      query,
      top_k = 8,
      thinking,
      conversation_id,
      space_ids = null, // RAG 2.0: Optional pre-selected spaces
      auto_routing = true, // RAG 2.0: Enable automatic space routing
      model = null, // Optional: explicit model selection
    } = req.body;
    const enableThinking = thinking !== false;

    // Phase 6.2: telemetry — capture wall-clock start for latency.
    const _ragStartTs = Date.now();

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

      // Steps 2+3: Embed variants AND resolve space routing IN PARALLEL
      const additionalTexts = [];
      if (queryVariants.length > 1) {
        additionalTexts.push(...queryVariants.slice(1));
      }
      if (hydeText) {
        additionalTexts.push(hydeText);
      }

      const [additionalEmbeddingsRaw, spaceRouting] = await Promise.all([
        // Step 2: Embed multi-query variants and HyDE text (batch)
        additionalTexts.length > 0 ? getEmbeddings(additionalTexts) : Promise.resolve([]),
        // Step 3: Space routing (runs in parallel with embedding)
        (async () => {
          let _targetSpaces = [];
          let _routingMethod = 'none';
          let _targetSpaceIds = space_ids;

          if (!space_ids && conversation_id) {
            try {
              const projSpace = await db.query(
                `SELECT p.knowledge_space_id FROM projects p
                 JOIN chat_conversations c ON c.project_id = p.id
                 WHERE c.id = $1 AND p.knowledge_space_id IS NOT NULL`,
                [conversation_id]
              );
              if (projSpace.rows.length > 0) {
                _targetSpaceIds = [projSpace.rows[0].knowledge_space_id];
                logger.debug(`Project space override: ${_targetSpaceIds[0]}`);
              }
            } catch (projErr) {
              logger.debug(`Project space lookup failed: ${projErr.message}`);
            }
          }

          if (_targetSpaceIds && _targetSpaceIds.length > 0) {
            const spacesResult = await db.query(
              'SELECT id, name, slug, description FROM knowledge_spaces WHERE id = ANY($1::uuid[])',
              [_targetSpaceIds]
            );
            _targetSpaces = spacesResult.rows;
            _routingMethod = 'manual';
            logger.debug(`Using ${_targetSpaces.length} pre-selected spaces`);
          } else if (auto_routing) {
            const routingResult = await routeToSpaces(queryEmbedding);
            _targetSpaces = routingResult.spaces;
            _routingMethod = routingResult.method;

            if (
              _routingMethod === 'error' ||
              _routingMethod === 'all' ||
              _routingMethod === 'none' ||
              _routingMethod === 'fallback'
            ) {
              _targetSpaceIds = null;
            } else {
              _targetSpaceIds = _targetSpaces.map(s => s.id);
            }
            logger.debug(`Auto-routing: ${_routingMethod}, ${_targetSpaces.length} spaces`);
          }

          return {
            targetSpaces: _targetSpaces,
            routingMethod: _routingMethod,
            targetSpaceIds: _targetSpaceIds,
          };
        })(),
      ]);

      const { targetSpaces, routingMethod, targetSpaceIds } = spaceRouting;
      // Null-safe: getEmbeddings() may return null on embedding service failure
      const additionalEmbeddings = additionalEmbeddingsRaw || [];

      // Step 4: Hybrid search + Graph enrichment IN PARALLEL
      const spaceFilter = targetSpaceIds && targetSpaceIds.length > 0 ? targetSpaceIds : null;
      logger.info(
        `Space routing: method=${routingMethod}, spaces=${targetSpaces?.length || 0}, filter=${spaceFilter ? spaceFilter.join(',') : 'none'}`
      );
      let searchResults = [];
      let graphEnrichment = [];
      try {
        [searchResults, graphEnrichment] = await Promise.all([
          hybridSearch(query, queryEmbedding, top_k, spaceFilter, {
            additionalEmbeddings,
            decompoundedQuery: decompounded,
          }),
          graphEnrichedRetrieval(correctedQuery),
        ]);
      } catch (searchError) {
        logger.error(`Hybrid search failed (Qdrant may be down): ${searchError.message}`);
        // Continue with empty results — LLM will respond without RAG context
      }

      // Debug: log search result documents
      if (searchResults.length > 0) {
        const docNames = searchResults
          .slice(0, 10)
          .map(r => `${r.payload?.document_name || '?'}(${(r.score || 0).toFixed(3)})`)
          .join(', ');
        logger.info(`Search results (${searchResults.length}): ${docNames}`);
      }

      // Step 5: Rerank results (2-stage: FlashRank → BGE-reranker)
      const rerankedResults = await rerankResults(query, searchResults, top_k);

      // Step 5b: RAG 4.0 - Filter by relevance score (anti-hallucination)
      const wasReranked = ENABLE_RERANKING && rerankedResults.some(r => r.rerankScore != null);
      const { relevant, marginal: marginalResults } = filterByRelevance(
        rerankedResults,
        wasReranked
      );
      let relevantResults = relevant;

      // Anti-hallucination: When no results pass the relevance threshold,
      // use marginal results (if any) but flag them so the LLM knows to be cautious.
      // Previously this used ALL unfiltered results silently — causing hallucination.
      let useMarginalResults = false;
      if (relevantResults.length === 0 && marginalResults.length > 0) {
        logger.info(
          `RAG: no relevant results, using ${marginalResults.length} marginal results (flagged as low-confidence)`
        );
        relevantResults = marginalResults.slice(0, top_k);
        useMarginalResults = true;
      }

      // Step 5c: MMR diversity selection (balance relevance vs diversity)
      relevantResults = applyMMR(relevantResults, 0.7, top_k);

      // Step 5d: Deduplicate by document (max 3 chunks per document)
      relevantResults = deduplicateByDocument(relevantResults, top_k, 3);

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
        logRagQuery({
          conversationId: conversation_id,
          userId: req.user?.id ?? null,
          queryText: query,
          sources: [],
          spaceIds: targetSpaces.map(s => s.id),
          routingMethod,
          marginalResults: false,
          noRelevantDocs: true,
          responseLength: noDocsMessage.length,
          latencyMs: Date.now() - _ragStartTs,
          error: null,
        });
        return res.end();
      }

      // Step 9: Enqueue RAG job (LLM streaming goes through queue)
      const { jobId, messageId, queuePosition } = await llmQueueService.enqueue(
        conversation_id,
        'rag',
        {
          query,
          context,
          thinking: enableThinking,
          sources,
          matchedSpaces: targetSpaces.map(s => ({
            id: s.id,
            name: s.name,
            color: s.color,
            score: s.score,
          })),
          noRelevantDocs,
          marginalResults: useMarginalResults,
        },
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

      // Phase 6.2: accumulate response length for telemetry.
      let _ragResponseLen = 0;
      let _ragLogged = false;
      const _emitRagLog = (errMsg = null) => {
        if (_ragLogged) {
          return;
        }
        _ragLogged = true;
        logRagQuery({
          conversationId: conversation_id,
          userId: req.user?.id ?? null,
          queryText: query,
          sources,
          spaceIds: targetSpaces.map(s => s.id),
          routingMethod,
          marginalResults: useMarginalResults,
          noRelevantDocs,
          responseLength: _ragResponseLen,
          latencyMs: Date.now() - _ragStartTs,
          error: errMsg,
        });
      };

      connection.onClose(() => {
        logger.debug(`[RAG ${jobId}] Client disconnected, job continues in background`);
        if (unsubscribe) {
          unsubscribe();
        }
        _emitRagLog('client_disconnected');
      });

      // Subscribe to job updates and forward to client
      unsubscribe = llmQueueService.subscribeToJob(jobId, event => {
        if (!connection.isConnected()) {
          return;
        }

        try {
          if (event.type === 'response' && typeof event.token === 'string') {
            _ragResponseLen += event.token.length;
          }

          res.write(`data: ${JSON.stringify(event)}\n\n`);

          if (event.done) {
            res.end();
            unsubscribe();
            _emitRagLog(event.type === 'error' ? String(event.error || 'llm_error') : null);
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

    const collection = qdrantResponse.data?.result || {};

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
 * GET /api/rag/metrics — Phase 6.2 dashboard aggregates
 * Query params:
 *   window: '24h' (default) | '7d' | '30d'
 */
router.get(
  '/metrics',
  requireAuth,
  asyncHandler(async (req, res) => {
    const window = String(req.query.window || '24h');
    const interval = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' }[window];
    if (!interval) {
      throw new ValidationError('window must be one of: 24h, 7d, 30d');
    }

    const result = await db.query(
      `SELECT
         COUNT(*)::int                                                AS total_queries,
         COUNT(*) FILTER (WHERE retrieved_count > 0)::int             AS with_results,
         COUNT(*) FILTER (WHERE retrieved_count = 0)::int             AS no_results,
         COUNT(*) FILTER (WHERE no_relevant_docs)::int                AS no_relevant,
         COUNT(*) FILTER (WHERE marginal_results)::int                AS marginal,
         COUNT(*) FILTER (WHERE error IS NOT NULL)::int               AS errored,
         AVG(retrieved_count)::float                                  AS avg_retrieved,
         AVG(top_rerank_score)::float                                 AS avg_top_rerank,
         AVG(avg_rerank_score)::float                                 AS avg_rerank,
         AVG(response_length)::float                                  AS avg_response_length,
         AVG(latency_ms)::float                                       AS avg_latency_ms,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)     AS p95_latency_ms
       FROM rag_query_log
       WHERE created_at >= NOW() - $1::interval`,
      [interval]
    );

    const recent = await db.query(
      `SELECT id, created_at, query_text, retrieved_count, top_rerank_score,
              response_length, latency_ms, no_relevant_docs, error
         FROM rag_query_log
        WHERE created_at >= NOW() - $1::interval
        ORDER BY created_at DESC
        LIMIT 20`,
      [interval]
    );

    const row = result.rows[0] || {};
    const total = row.total_queries || 0;
    const retrievalRate = total > 0 ? row.with_results / total : 0;
    const noDocumentRate = total > 0 ? row.no_results / total : 0;

    res.json({
      window,
      total_queries: total,
      retrieval_rate: Number(retrievalRate.toFixed(3)),
      no_document_rate: Number(noDocumentRate.toFixed(3)),
      no_relevant_rate: total > 0 ? Number((row.no_relevant / total).toFixed(3)) : 0,
      marginal_rate: total > 0 ? Number((row.marginal / total).toFixed(3)) : 0,
      error_rate: total > 0 ? Number((row.errored / total).toFixed(3)) : 0,
      avg_retrieved: row.avg_retrieved != null ? Number(row.avg_retrieved.toFixed(2)) : null,
      avg_top_rerank_score:
        row.avg_top_rerank != null ? Number(row.avg_top_rerank.toFixed(3)) : null,
      avg_rerank_score: row.avg_rerank != null ? Number(row.avg_rerank.toFixed(3)) : null,
      avg_response_length:
        row.avg_response_length != null ? Math.round(row.avg_response_length) : null,
      avg_latency_ms: row.avg_latency_ms != null ? Math.round(row.avg_latency_ms) : null,
      p95_latency_ms: row.p95_latency_ms != null ? Math.round(row.p95_latency_ms) : null,
      recent: recent.rows,
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
