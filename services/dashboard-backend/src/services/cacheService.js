/**
 * CacheService - Simple In-Memory Caching
 *
 * Provides fast response times for frequently accessed, rarely changing data.
 * Uses a simple TTL (time-to-live) based eviction strategy.
 *
 * Usage:
 * - cacheService.get(key) - Get cached value (returns null if expired/missing)
 * - cacheService.set(key, value, ttlMs) - Cache a value
 * - cacheService.invalidate(key) - Invalidate specific key
 * - cacheService.invalidatePattern(pattern) - Invalidate keys matching pattern
 * - cacheService.clear() - Clear all cache
 */

const logger = require('../utils/logger');

class CacheService {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            invalidations: 0
        };

        // Clean up expired entries every 60 seconds
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }

    /**
     * Get a cached value
     * @param {string} key - Cache key
     * @returns {any|null} Cached value or null if not found/expired
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return entry.value;
    }

    /**
     * Set a cached value
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttlMs - Time to live in milliseconds (default: 30 seconds)
     */
    set(key, value, ttlMs = 30000) {
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
            createdAt: Date.now()
        });
        this.stats.sets++;
    }

    /**
     * Invalidate a specific key
     * @param {string} key - Cache key to invalidate
     */
    invalidate(key) {
        if (this.cache.delete(key)) {
            this.stats.invalidations++;
            logger.debug(`[Cache] Invalidated: ${key}`);
        }
    }

    /**
     * Invalidate keys matching a pattern
     * @param {string} pattern - Pattern to match (supports * wildcard)
     */
    invalidatePattern(pattern) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        let count = 0;

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
            }
        }

        if (count > 0) {
            this.stats.invalidations += count;
            logger.debug(`[Cache] Invalidated ${count} keys matching: ${pattern}`);
        }
    }

    /**
     * Clear all cache entries
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        logger.info(`[Cache] Cleared ${size} entries`);
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getStats() {
        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: this.stats.hits + this.stats.misses > 0
                ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug(`[Cache] Cleaned up ${cleaned} expired entries`);
        }
    }

    /**
     * Graceful shutdown
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.clear();
    }
}

// Singleton instance
const cacheService = new CacheService();

// Middleware factory for route-level caching
const cacheMiddleware = (keyGenerator, ttlMs = 30000) => {
    return async (req, res, next) => {
        // Generate cache key
        const key = typeof keyGenerator === 'function'
            ? keyGenerator(req)
            : keyGenerator;

        // Try to get from cache
        const cached = cacheService.get(key);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json(cached);
        }

        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json to cache the response
        res.json = (data) => {
            // Only cache successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cacheService.set(key, data, ttlMs);
            }
            res.set('X-Cache', 'MISS');
            return originalJson(data);
        };

        next();
    };
};

module.exports = {
    cacheService,
    cacheMiddleware
};
