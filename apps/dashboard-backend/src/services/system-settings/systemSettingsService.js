/**
 * System Settings Service — in-memory cache of the singleton system_settings row.
 *
 * Loaded once at boot (after migrations) so request hot-paths can read RAG/LLM
 * defaults from a Map instead of hitting Postgres. Hot-reload of these values
 * is not supported by design: changes flow DB → restart → cache. This matches
 * the env-var convention used elsewhere in the backend and keeps the read path
 * synchronous.
 *
 * Consumers:
 *  - routes/rag.js                  (rag_top_k default)
 *  - services/llm/llmOllamaStream.js (llm_num_predict_default, llm_keep_alive_seconds)
 *  - services/llm/llmJobProcessor.js (future: vision_fallback_enabled, P6)
 *
 * ragCore.js still reads its thresholds from process.env at module load — the
 * migration default and the env default are kept in sync so this is a no-op
 * unless an operator overrides via .env before a deploy.
 */

const db = require('../../database');
const logger = require('../../utils/logger');

const SETTINGS_COLUMNS = [
  'rag_top_k',
  'rag_final_k',
  'rag_score_threshold',
  'rag_relevance_threshold',
  'rag_rerank_enabled',
  'rag_timeout_rerank_ms',
  'llm_num_ctx_default',
  'llm_keep_alive_seconds',
  'llm_num_predict_default',
];

let cache = Object.create(null);
let loaded = false;

/**
 * Load (or reload) the singleton row into the in-memory cache.
 * Safe to call before migration 094 has run — missing columns just stay empty.
 */
async function load() {
  try {
    const select = SETTINGS_COLUMNS.join(', ');
    const result = await db.query(`SELECT ${select} FROM system_settings WHERE id = 1`);
    if (result.rows.length === 0) {
      logger.warn('[system-settings] No row in system_settings (id=1); using env/code defaults');
      cache = Object.create(null);
    } else {
      cache = { ...result.rows[0] };
    }
    loaded = true;
    logger.info(
      `[system-settings] Loaded ${Object.keys(cache).filter(k => cache[k] !== null).length}/${SETTINGS_COLUMNS.length} keys`
    );
  } catch (err) {
    // Column missing → pre-migration boot. Stay empty, consumers fall back.
    if (err.code === '42703' || /column .* does not exist/i.test(err.message || '')) {
      logger.warn(
        '[system-settings] Migration 094 not yet applied — perf settings cache empty, using env defaults'
      );
      cache = Object.create(null);
      loaded = true;
      return;
    }
    logger.error(`[system-settings] Load failed: ${err.message}`);
    // Don't throw — let the backend boot with env defaults.
  }
}

/**
 * Read a cached column. Returns the typed value, or `fallback` if the column
 * is null/undefined/never loaded.
 */
function get(key, fallback = undefined) {
  if (!loaded) {return fallback;}
  const v = cache[key];
  return v === null || v === undefined ? fallback : v;
}

/**
 * Numeric coercion wrapper for callers that get a value from req.body and want
 * to chain cache → default in one expression.
 */
function getNumber(key, fallback) {
  const v = get(key, fallback);
  if (typeof v === 'number') {return v;}
  const parsed = parseFloat(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Boolean coercion wrapper.
 */
function getBool(key, fallback) {
  const v = get(key, fallback);
  if (typeof v === 'boolean') {return v;}
  if (v === 'true') {return true;}
  if (v === 'false') {return false;}
  return fallback;
}

/**
 * Test-helper to inject values without hitting the DB.
 */
function _setForTest(partial) {
  cache = { ...cache, ...partial };
  loaded = true;
}

module.exports = {
  load,
  get,
  getNumber,
  getBool,
  SETTINGS_COLUMNS,
  _setForTest,
};
