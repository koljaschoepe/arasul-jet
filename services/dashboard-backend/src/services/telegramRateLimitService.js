/**
 * Telegram Rate Limit Service
 * Provides rate limiting for LLM API calls per chat
 *
 * Features:
 * - Per-chat rate limiting
 * - Configurable limits per bot
 * - Cooldown tracking
 * - Database-backed persistence
 */

const database = require('../database');
const logger = require('../utils/logger');

// Default limits
const DEFAULT_MAX_PER_MINUTE = parseInt(process.env.TELEGRAM_RATE_LIMIT_PER_MINUTE) || 10;
const DEFAULT_MAX_PER_HOUR = parseInt(process.env.TELEGRAM_RATE_LIMIT_PER_HOUR) || 100;

// In-memory cache for rate limits (reduces DB queries)
const rateLimitCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache TTL

/**
 * Get cache key for bot+chat
 * @param {number} botId
 * @param {number} chatId
 * @returns {string}
 */
function getCacheKey(botId, chatId) {
  return `${botId}:${chatId}`;
}

/**
 * Check if a request is rate limited
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 * @param {number} userId - User ID (optional)
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date}>}
 */
async function checkRateLimit(botId, chatId, userId = null) {
  const cacheKey = getCacheKey(botId, chatId);
  const now = Date.now();

  // Check cache first
  const cached = rateLimitCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    // Update in-memory counter
    cached.count++;

    if (cached.count > cached.maxPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(cached.windowStart + 60000),
      };
    }

    return {
      allowed: true,
      remaining: cached.maxPerMinute - cached.count,
      resetAt: new Date(cached.windowStart + 60000),
    };
  }

  // Query database
  try {
    const result = await database.query(`SELECT * FROM check_rate_limit($1, $2, $3)`, [botId, chatId, userId]);

    if (result.rows.length === 0) {
      // Function didn't return a row, allow the request
      return {
        allowed: true,
        remaining: DEFAULT_MAX_PER_MINUTE - 1,
        resetAt: new Date(now + 60000),
      };
    }

    const { allowed, remaining, reset_at } = result.rows[0];

    // Update cache
    rateLimitCache.set(cacheKey, {
      count: DEFAULT_MAX_PER_MINUTE - remaining,
      maxPerMinute: DEFAULT_MAX_PER_MINUTE,
      windowStart: now,
      expiresAt: now + CACHE_TTL,
    });

    return {
      allowed,
      remaining: remaining || 0,
      resetAt: reset_at ? new Date(reset_at) : new Date(now + 60000),
    };
  } catch (error) {
    // If rate limit table doesn't exist yet, allow request
    if (error.message.includes('does not exist') || error.message.includes('check_rate_limit')) {
      logger.debug('Rate limit table not yet created, allowing request');
      return {
        allowed: true,
        remaining: DEFAULT_MAX_PER_MINUTE,
        resetAt: new Date(now + 60000),
      };
    }

    logger.error('Rate limit check error:', error);
    // On error, allow the request (fail open)
    return {
      allowed: true,
      remaining: DEFAULT_MAX_PER_MINUTE,
      resetAt: new Date(now + 60000),
    };
  }
}

/**
 * Reset rate limit for a chat (e.g., after cooldown)
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 */
async function resetRateLimit(botId, chatId) {
  const cacheKey = getCacheKey(botId, chatId);
  rateLimitCache.delete(cacheKey);

  try {
    await database.query(
      `UPDATE telegram_rate_limits
       SET request_count = 0,
           window_start = NOW(),
           is_rate_limited = FALSE,
           cooldown_until = NULL
       WHERE bot_id = $1 AND chat_id = $2`,
      [botId, chatId]
    );
  } catch (error) {
    logger.error('Error resetting rate limit:', error);
  }
}

/**
 * Get rate limit status for a chat
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>}
 */
async function getRateLimitStatus(botId, chatId) {
  try {
    const result = await database.query(
      `SELECT request_count, max_requests_per_minute, window_start, is_rate_limited, cooldown_until
       FROM telegram_rate_limits
       WHERE bot_id = $1 AND chat_id = $2`,
      [botId, chatId]
    );

    if (result.rows.length === 0) {
      return {
        requestCount: 0,
        maxRequests: DEFAULT_MAX_PER_MINUTE,
        isLimited: false,
        cooldownUntil: null,
      };
    }

    const row = result.rows[0];
    return {
      requestCount: row.request_count,
      maxRequests: row.max_requests_per_minute,
      isLimited: row.is_rate_limited,
      cooldownUntil: row.cooldown_until,
      windowStart: row.window_start,
    };
  } catch (error) {
    logger.error('Error getting rate limit status:', error);
    return {
      requestCount: 0,
      maxRequests: DEFAULT_MAX_PER_MINUTE,
      isLimited: false,
      cooldownUntil: null,
    };
  }
}

/**
 * Clear cache (for testing)
 */
function clearCache() {
  rateLimitCache.clear();
}

module.exports = {
  checkRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  clearCache,
  DEFAULT_MAX_PER_MINUTE,
  DEFAULT_MAX_PER_HOUR,
};
