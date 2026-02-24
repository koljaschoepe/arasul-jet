/**
 * Token Service
 * Tiered token counting for context management.
 *
 * Strategy:
 *  1. Ollama /api/tokenize (exact, if available)
 *  2. Heuristic chars/4 fallback (~90% accurate)
 *
 * No external npm packages needed.
 */

const logger = require('../utils/logger');
const services = require('../config/services');

const LLM_SERVICE_URL = services.llm.url;

// Cache whether /api/tokenize is available (checked once at startup)
let tokenizeAvailable = null;

/**
 * Check if Ollama /api/tokenize endpoint is available.
 * Called once, result cached for the process lifetime.
 */
async function checkTokenizeAvailability() {
  if (tokenizeAvailable !== null) {return tokenizeAvailable;}

  try {
    const response = await fetch(`${LLM_SERVICE_URL}/api/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'test', text: 'hello' }),
      signal: AbortSignal.timeout(5000),
    });
    // 200 or 400 (bad model) means endpoint exists
    tokenizeAvailable = response.status !== 404;
  } catch {
    tokenizeAvailable = false;
  }

  logger.info(`[TokenService] /api/tokenize available: ${tokenizeAvailable}`);
  return tokenizeAvailable;
}

/**
 * Estimate token count using chars/4 heuristic.
 * Applies a small correction for German text (compound words = more tokens).
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) {return 0;}
  // Base: ~4 chars per token (works well for English + mixed content)
  return Math.ceil(text.length / 4);
}

/**
 * Count tokens exactly via Ollama /api/tokenize.
 * Falls back to heuristic if endpoint unavailable.
 * @param {string} model - Ollama model name
 * @param {string} text - Text to tokenize
 * @returns {Promise<number>}
 */
async function countTokensExact(model, text) {
  if (!text) {return 0;}

  const available = await checkTokenizeAvailability();
  if (!available) {
    return estimateTokens(text);
  }

  try {
    const response = await fetch(`${LLM_SERVICE_URL}/api/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, text }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return estimateTokens(text);
    }

    const data = await response.json();
    if (data.tokens && Array.isArray(data.tokens)) {
      return data.tokens.length;
    }

    return estimateTokens(text);
  } catch (err) {
    logger.debug(`[TokenService] /api/tokenize failed, using heuristic: ${err.message}`);
    return estimateTokens(text);
  }
}

/**
 * Check if text fits within a token budget.
 * Uses fast heuristic (no API call).
 * @param {string} text
 * @param {number} budget - Max tokens allowed
 * @returns {boolean}
 */
function fitsInBudget(text, budget) {
  return estimateTokens(text) <= budget;
}

/**
 * Estimate tokens for an array of chat messages.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {number}
 */
function estimateMessagesTokens(messages) {
  if (!messages || !Array.isArray(messages)) {return 0;}
  let total = 0;
  for (const msg of messages) {
    // ~4 tokens overhead per message (role, formatting)
    total += 4 + estimateTokens(msg.content || '');
  }
  return total;
}

/**
 * Truncate text to approximately fit within a token budget.
 * @param {string} text
 * @param {number} maxTokens
 * @returns {string}
 */
function truncateToTokens(text, maxTokens) {
  if (!text) {return '';}
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) {return text;}
  return text.substring(0, maxChars);
}

module.exports = {
  estimateTokens,
  countTokensExact,
  fitsInBudget,
  estimateMessagesTokens,
  truncateToTokens,
  // Exported for testing
  _checkTokenizeAvailability: checkTokenizeAvailability,
  _resetCache: () => {
    tokenizeAvailable = null;
  },
};
