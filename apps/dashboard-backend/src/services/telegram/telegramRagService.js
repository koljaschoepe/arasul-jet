/**
 * Telegram RAG Service
 *
 * Enriches Telegram bot responses with RAG context from Knowledge Spaces.
 * Uses ragCore.js for embedding, search, reranking, and context building.
 *
 * Master Bot: rag_space_ids = NULL → searches all spaces
 * Custom Bot: rag_space_ids = [uuid1, uuid2] → searches specific spaces
 */

const logger = require('../../utils/logger');
const ragCore = require('../rag/ragCore');

/**
 * Enrich a user query with RAG context for a Telegram bot.
 *
 * @param {string} userQuery - The user's message
 * @param {Object} bot - Bot row from database with RAG fields
 * @param {boolean} bot.rag_enabled - Whether RAG is enabled
 * @param {string[]|null} bot.rag_space_ids - Space UUIDs to search (null = all)
 * @param {boolean} bot.rag_show_sources - Whether to include sources
 * @param {number} bot.rag_context_limit - Max characters of RAG context
 * @returns {Promise<{context: string|null, sources: Object[], sourceText: string|null}>}
 */
async function enrichWithRAG(userQuery, bot) {
  if (!bot.rag_enabled) {
    return { context: null, sources: [], sourceText: null };
  }

  try {
    // 1. Generate embedding for user query
    const embedding = await ragCore.getEmbedding(userQuery);

    // 2. Determine space IDs
    let spaceIds = bot.rag_space_ids; // null = all spaces (Master Bot)

    if (!spaceIds) {
      // Master Bot: use automatic space routing
      const routingResult = await ragCore.routeToSpaces(embedding);
      if (routingResult.method !== 'error') {
        spaceIds = routingResult.spaces.map(s => s.id);
      }
    }

    // 3. Hybrid search with space filter
    const searchResults = await ragCore.hybridSearch(
      userQuery,
      embedding,
      8,
      spaceIds && spaceIds.length > 0 ? spaceIds : null
    );

    if (searchResults.length === 0) {
      logger.debug(`[TG-RAG] No search results for bot ${bot.id}`);
      return { context: null, sources: [], sourceText: null };
    }

    // 4. Rerank results
    const reranked = await ragCore.rerankResults(userQuery, searchResults, 8);

    // 5. Filter by relevance
    const wasReranked = ragCore.ENABLE_RERANKING && reranked.some(r => r.rerankScore != null);
    const { relevant } = ragCore.filterByRelevance(reranked, wasReranked);

    if (relevant.length === 0) {
      logger.debug(`[TG-RAG] No relevant results after filtering for bot ${bot.id}`);
      return { context: null, sources: [], sourceText: null };
    }

    // 5b. MMR diversity selection
    const mmrResults = ragCore.applyMMR(relevant, 0.7, 8);

    // 5c. Deduplicate by document (max 3 chunks per document)
    const deduplicated = ragCore.deduplicateByDocument(mmrResults, 8, 3);

    // 6. Load parent chunks for richer context
    const parentChunks = await ragCore.getParentChunks(deduplicated);

    // 7. Get company context
    const companyContext = await ragCore.getCompanyContext();

    // 8. Build hierarchical context
    const chunks = deduplicated.map(r => ({
      document_name: r.payload.document_name,
      text: r.payload.text,
      space_name: r.payload.space_name,
      category: r.payload.category || null,
      parent_chunk_id: r.payload.parent_chunk_id || null,
    }));

    let context = ragCore.buildHierarchicalContext(
      companyContext,
      null, // spaces descriptions not needed for Telegram (saves tokens)
      chunks,
      parentChunks
    );

    // 9. Trim context to limit
    const contextLimit = bot.rag_context_limit || 2000;
    if (context.length > contextLimit) {
      context = context.substring(0, contextLimit) + '\n\n[...gekürzt]';
    }

    // 10. Extract sources for display
    const sources = deduplicated.map(r => ({
      name: r.payload.document_name,
      space: r.payload.space_name || '',
      preview: (r.payload.text || '').substring(0, 100),
    }));

    // 11. Build source text for Telegram message (if enabled)
    let sourceText = null;
    if (bot.rag_show_sources && sources.length > 0) {
      const uniqueSources = [...new Map(sources.map(s => [s.name, s])).values()];
      sourceText =
        '\n\n📚 <b>Quellen:</b>\n' +
        uniqueSources.map(s => `• ${s.name}${s.space ? ` (${s.space})` : ''}`).join('\n');
    }

    logger.info(
      `[TG-RAG] Bot ${bot.id}: ${relevant.length} relevant results, context ${context.length} chars`
    );

    return { context, sources, sourceText };
  } catch (error) {
    logger.error(`[TG-RAG] Enrichment failed for bot ${bot.id}: ${error.message}`);
    // Non-fatal: return empty context with warning, bot still answers without RAG
    return {
      context: null,
      sources: [],
      sourceText: null,
      ragError: `RAG-Suche fehlgeschlagen: ${error.message}`,
    };
  }
}

module.exports = {
  enrichWithRAG,
};
