/**
 * RAG metrics logging — writes per-query telemetry to rag_query_log
 * (migration 076 + 084) for the Phase 6.2 metrics dashboard.
 *
 * Privacy (Phase 5.2 / DSGVO):
 *   - query_text wird per Default NICHT persistiert. Die Spalte ist seit 084
 *     nullable, ein Cron-Job anonymisiert Bestand nach 24h.
 *   - query_hash (SHA-256 hex) und query_length erlauben Korrelation und
 *     Aggregat-Stats ohne PII.
 *   - Plaintext-Persistenz nur über RAG_LOG_QUERY_TEXT_PLAINTEXT=true
 *     (Debug-/Forschungs-Setup, niemals in Production).
 *
 * Alle Writes sind fire-and-forget: any failure is swallowed and logged at
 * debug level so a telemetry hiccup never breaks a user-facing RAG query.
 */

const crypto = require('crypto');
const db = require('../../database');
const logger = require('../../utils/logger');

// Per-call lookup statt Modul-Konstante: erlaubt Tests, das Verhalten zu
// togglen, ohne resetModules() zu brauchen, und die Kosten (ein env-read)
// sind gegenüber dem Insert vernachlässigbar.
function shouldStorePlaintext() {
  return String(process.env.RAG_LOG_QUERY_TEXT_PLAINTEXT || '').toLowerCase() === 'true';
}

// Lightweight ISO-639-1 best-guess. Avoids extra deps; the 5 buckets that
// matter for an Edge-AI box in DACH are de/en/fr/es/it. Everything else → 'other'.
function detectLanguage(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  const sample = text.slice(0, 400).toLowerCase();
  // German diacritics or telltale function words
  if (/[äöüß]/.test(sample) || /\b(der|die|das|und|nicht|ist|für|wir)\b/.test(sample)) {
    return 'de';
  }
  if (/\b(the|and|is|of|to|that|for|with|this|are)\b/.test(sample)) {
    return 'en';
  }
  if (/\b(le|la|les|et|de|que|pour|avec|dans|est)\b/.test(sample)) {
    return 'fr';
  }
  if (/\b(el|la|los|las|y|de|que|para|con|es)\b/.test(sample)) {
    return 'es';
  }
  if (/\b(il|lo|gli|le|e|di|che|per|con|sono)\b/.test(sample)) {
    return 'it';
  }
  return 'other';
}

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

      const queryText = entry.queryText || '';
      const queryHash = queryText
        ? crypto.createHash('sha256').update(queryText).digest('hex')
        : null;
      const queryLanguage = detectLanguage(queryText);

      await db.query(
        `INSERT INTO rag_query_log (
           conversation_id, user_id, query_text, query_hash, query_length, query_language,
           retrieved_count, top_rerank_score, avg_rerank_score,
           space_ids, routing_method, marginal_results, no_relevant_docs,
           response_length, latency_ms, error
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          entry.conversationId ?? null,
          entry.userId ?? null,
          shouldStorePlaintext() ? queryText : null,
          queryHash,
          queryText.length,
          queryLanguage,
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
