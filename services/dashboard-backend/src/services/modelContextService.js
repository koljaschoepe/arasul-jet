/**
 * Model Context Service
 * Dynamic context window detection per model via Ollama /api/show.
 *
 * Features:
 *  - Queries Ollama for actual model context_length
 *  - Caches results for 10 minutes (model switches are rare)
 *  - Falls back to catalog values or hardcoded defaults
 *  - Returns structured token budget breakdown
 */

const logger = require('../utils/logger');
const services = require('../config/services');
const database = require('../database');

const LLM_SERVICE_URL = services.llm.url;

// Cache: modelName -> { contextWindow, timestamp }
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 10;

// Hardcoded fallbacks if both /api/show and catalog fail
const FALLBACK_CONTEXT_WINDOWS = {
  qwen3: 32768,
  'qwen2.5': 32768,
  'llama3.1': 131072,
  llama3: 8192,
  mistral: 32768,
  gemma2: 8192,
  'deepseek-coder': 16384,
  deepseek: 16384,
  phi3: 4096,
};
const DEFAULT_CONTEXT_WINDOW = 4096;

// Budget allocation constants
const SYSTEM_PROMPT_TOKENS = 200;
const TIER1_PROFILE_TOKENS = 150;

/**
 * Get context window size for a model.
 * Priority: cache -> /api/show -> catalog DB -> fallback map -> default
 * @param {string} modelName - Ollama model name (e.g. 'qwen3:14b-q8')
 * @returns {Promise<number>}
 */
async function getModelContextSize(modelName) {
  if (!modelName) {return DEFAULT_CONTEXT_WINDOW;}

  // Check cache
  const cached = cache.get(modelName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.contextWindow;
  }

  let contextWindow = null;

  // 1. Try Ollama /api/show
  try {
    const response = await fetch(`${LLM_SERVICE_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = await response.json();
      // context_length can be in model_info or parameters
      if (data.model_info) {
        // Different model architectures use different key names
        const info = data.model_info;
        contextWindow =
          info['context_length'] ||
          info['llama.context_length'] ||
          info['qwen2.context_length'] ||
          info['gemma.context_length'] ||
          null;
      }
      if (!contextWindow && data.parameters) {
        // Parse num_ctx from parameter string
        const match = data.parameters.match(/num_ctx\s+(\d+)/);
        if (match) {contextWindow = parseInt(match[1]);}
      }
    }
  } catch (err) {
    logger.debug(`[ModelContext] /api/show failed for ${modelName}: ${err.message}`);
  }

  // 2. Try catalog DB
  if (!contextWindow) {
    try {
      const result = await database.query(
        `SELECT context_window, recommended_ctx FROM llm_model_catalog WHERE id = $1`,
        [modelName]
      );
      if (result.rows.length > 0 && result.rows[0].context_window) {
        contextWindow = result.rows[0].context_window;
      }
    } catch (err) {
      logger.debug(`[ModelContext] Catalog lookup failed for ${modelName}: ${err.message}`);
    }
  }

  // 3. Fallback to hardcoded map based on model family
  if (!contextWindow) {
    const family = modelName.split(':')[0];
    contextWindow = FALLBACK_CONTEXT_WINDOWS[family] || DEFAULT_CONTEXT_WINDOW;
  }

  // Cache the result
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Remove oldest entry
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(modelName, { contextWindow, timestamp: Date.now() });

  logger.info(`[ModelContext] ${modelName}: context_window = ${contextWindow}`);
  return contextWindow;
}

/**
 * Get recommended context size for a model (what to actually set as num_ctx).
 * Uses catalog recommended_ctx, falls back to model context window.
 * @param {string} modelName
 * @returns {Promise<number>}
 */
async function getRecommendedCtx(modelName) {
  try {
    const result = await database.query(
      `SELECT recommended_ctx FROM llm_model_catalog WHERE id = $1`,
      [modelName]
    );
    if (result.rows.length > 0 && result.rows[0].recommended_ctx) {
      return result.rows[0].recommended_ctx;
    }
  } catch {
    // Fall through
  }

  const contextWindow = await getModelContextSize(modelName);
  // Default: use half of max context for VRAM safety, at least 4096
  return Math.max(4096, Math.min(contextWindow, 16384));
}

/**
 * Get effective budget (context_window minus response reserve).
 * @param {string} modelName
 * @returns {Promise<number>}
 */
async function getEffectiveBudget(modelName) {
  const contextWindow = await getModelContextSize(modelName);
  const responseReserve = getResponseReserve(contextWindow);
  return contextWindow - responseReserve;
}

/**
 * Calculate response reserve based on context window size.
 * Larger context windows get more reserve.
 * @param {number} contextWindow
 * @returns {number}
 */
function getResponseReserve(contextWindow) {
  if (contextWindow >= 32768) {return 4096;}
  if (contextWindow >= 16384) {return 2048;}
  if (contextWindow >= 8192) {return 2048;}
  return 1024;
}

/**
 * Get full token budget breakdown for a model.
 * @param {string} modelName
 * @returns {Promise<Object>}
 */
async function getTokenBudget(modelName) {
  const contextWindow = await getModelContextSize(modelName);
  const responseReserve = getResponseReserve(contextWindow);

  // Scale memory tiers based on context window
  const tier2Memory = contextWindow >= 16384 ? 400 : 200;
  const tier3Summary = contextWindow >= 16384 ? 600 : 300;

  // RAG budget scales with context
  const maxRagTokens = contextWindow >= 32768 ? 8000 : contextWindow >= 16384 ? 4000 : 1500;

  const fixedOverhead = SYSTEM_PROMPT_TOKENS + TIER1_PROFILE_TOKENS + tier2Memory + tier3Summary;
  const availableForHistory = contextWindow - responseReserve - fixedOverhead - maxRagTokens;

  return {
    contextWindow,
    systemPrompt: SYSTEM_PROMPT_TOKENS,
    tier1Memory: TIER1_PROFILE_TOKENS,
    tier2Memory,
    tier3Summary,
    maxRagTokens,
    responseReserve,
    availableForHistory: Math.max(0, availableForHistory),
    compactionThreshold: 0.7,
  };
}

/**
 * Clear the cache (for testing or after model changes).
 */
function clearCache() {
  cache.clear();
}

module.exports = {
  getModelContextSize,
  getRecommendedCtx,
  getEffectiveBudget,
  getTokenBudget,
  getResponseReserve,
  clearCache,
  // Constants exported for testing
  FALLBACK_CONTEXT_WINDOWS,
  DEFAULT_CONTEXT_WINDOW,
};
