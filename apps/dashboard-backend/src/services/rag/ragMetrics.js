/**
 * RAG metrics logging — writes per-query telemetry to rag_query_log
 * (migration 076) for the Phase 6.2 metrics dashboard.
 *
 * All writes are fire-and-forget: any failure is swallowed and logged at
 * debug level so a telemetry hiccup never breaks a user-facing RAG query.
 */

const db = require('../../database');
const logger = require('../../utils/logger');

/**
 * @typedef {Object} RagLogEntry
 * @property {number|null} conversationId
 * @property {number|null} userId
 * @property {string}      queryText
 * @property {Array<{document_name:string, rerank_score:number|null}>} sources
 * @property {number[]|null} spaceIds
 * @property {string|null} routingMethod
 * @property {boolean}     marginalResults
 * @property {boolean}     noRelevantDocs
 * @property {number|null} responseLength
 * @property {number}      latencyMs
 * @property {string|null} error
 */

/**
 * Insert one telemetry row. Fire-and-forget.
 * @param {RagLogEntry} entry
 */
function logRagQuery(entry) {
  // Defer the insert so we never block the SSE stream close path.
  setImmediate(async () => {
    try {
      const rerankScores = (entry.sources || [])
        .map(s => (typeof s.rerank_score === 'number' ? s.rerank_score : null))
        .filter(v => v != null);
      const topRerank = rerankScores.length > 0 ? Math.max(...rerankScores) : null;
      const avgRerank =
        rerankScores.length > 0
          ? rerankScores.reduce((a, b) => a + b, 0) / rerankScores.length
          : null;

      await db.query(
        `INSERT INTO rag_query_log (
           conversation_id, user_id, query_text, query_length,
           retrieved_count, top_rerank_score, avg_rerank_score,
           space_ids, routing_method, marginal_results, no_relevant_docs,
           response_length, latency_ms, error
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          entry.conversationId ?? null,
          entry.userId ?? null,
          entry.queryText,
          entry.queryText?.length || 0,
          (entry.sources || []).length,
          topRerank,
          avgRerank,
          entry.spaceIds && entry.spaceIds.length > 0 ? entry.spaceIds : null,
          entry.routingMethod || null,
          !!entry.marginalResults,
          !!entry.noRelevantDocs,
          entry.responseLength ?? null,
          entry.latencyMs,
          entry.error || null,
        ]
      );
    } catch (err) {
      logger.debug(`[rag-metrics] log insert failed: ${err.message}`);
    }
  });
}

module.exports = { logRagQuery };
