/**
 * Model Lifecycle Service
 *
 * Adaptive model keep-alive based on hourly usage patterns.
 * Queries llm_jobs history to build a 24h usage profile, then
 * classifies each hour as peak / normal / idle and returns a
 * dynamic keep-alive timeout.
 *
 * Phases:
 *   peak  — historically busy hour  → long keep-alive  (default 30 min)
 *   normal — occasional usage       → medium keep-alive (default 10 min)
 *   idle  — no historical usage     → short keep-alive  (default 2 min)
 */

const database = require('../../database');
const logger = require('../../utils/logger');

// Configurable thresholds (env overrides)
const PEAK_KEEP_ALIVE_MIN = parseInt(process.env.MODEL_PEAK_KEEP_ALIVE_MINUTES || '30');
const NORMAL_KEEP_ALIVE_MIN = parseInt(process.env.MODEL_NORMAL_KEEP_ALIVE_MINUTES || '10');
const IDLE_KEEP_ALIVE_MIN = parseInt(process.env.MODEL_IDLE_KEEP_ALIVE_MINUTES || '2');
const PEAK_THRESHOLD = parseFloat(process.env.MODEL_PEAK_THRESHOLD || '2'); // avg requests/h
const LIFECYCLE_ENABLED = process.env.MODEL_LIFECYCLE_ENABLED !== 'false';

// Cache usage profile (refresh every 15 min)
let cachedProfile = null;
let profileLastRefreshed = 0;
const PROFILE_TTL = 15 * 60 * 1000; // 15 min

class ModelLifecycleService {
  /**
   * Get the 24-hour usage profile from llm_jobs history.
   * Returns array of { hour, avgRequests, peakRequests, activeDays, phase }.
   */
  async getUsageProfile() {
    const now = Date.now();
    if (cachedProfile && now - profileLastRefreshed < PROFILE_TTL) {
      return cachedProfile;
    }

    try {
      // Query the view (or inline if view not yet created)
      const result = await database.query(`
        SELECT
          hour,
          avg_requests,
          peak_requests,
          active_days
        FROM v_llm_usage_profile
      `);

      // Build full 24-hour profile (fill missing hours with zeros)
      const profileMap = new Map();
      for (const row of result.rows) {
        profileMap.set(row.hour, {
          hour: row.hour,
          avgRequests: parseFloat(row.avg_requests),
          peakRequests: parseInt(row.peak_requests),
          activeDays: parseInt(row.active_days),
        });
      }

      const profile = [];
      for (let h = 0; h < 24; h++) {
        const data = profileMap.get(h) || {
          hour: h,
          avgRequests: 0,
          peakRequests: 0,
          activeDays: 0,
        };
        data.phase = this._classifyHour(data.avgRequests);
        profile.push(data);
      }

      cachedProfile = profile;
      profileLastRefreshed = now;
      return profile;
    } catch (err) {
      logger.warn(`[ModelLifecycle] Failed to fetch usage profile: ${err.message}`);
      // Return a default profile (all normal) so the system still works
      return Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        avgRequests: 0,
        peakRequests: 0,
        activeDays: 0,
        phase: 'idle',
      }));
    }
  }

  /**
   * Classify an hour based on average request count.
   */
  _classifyHour(avgRequests) {
    if (avgRequests >= PEAK_THRESHOLD) {
      return 'peak';
    }
    if (avgRequests > 0) {
      return 'normal';
    }
    return 'idle';
  }

  /**
   * Get current phase and dynamic keep-alive in seconds.
   */
  async getCurrentKeepAlive() {
    if (!LIFECYCLE_ENABLED) {
      // Fallback to env-based static value
      return {
        keepAliveSeconds: parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300'),
        phase: 'normal',
        keepAliveMinutes: 5,
      };
    }

    const profile = await this.getUsageProfile();
    const currentHour = new Date().getHours();
    const hourData = profile.find(p => p.hour === currentHour) || { phase: 'normal' };

    let keepAliveMinutes;
    switch (hourData.phase) {
      case 'peak':
        keepAliveMinutes = PEAK_KEEP_ALIVE_MIN;
        break;
      case 'normal':
        keepAliveMinutes = NORMAL_KEEP_ALIVE_MIN;
        break;
      case 'idle':
        keepAliveMinutes = IDLE_KEEP_ALIVE_MIN;
        break;
      default:
        keepAliveMinutes = NORMAL_KEEP_ALIVE_MIN;
    }

    return {
      keepAliveSeconds: keepAliveMinutes * 60,
      keepAliveMinutes,
      phase: hourData.phase,
    };
  }

  /**
   * Check if models should be unloaded based on adaptive timeout.
   * Called every 30s from ollamaReadiness.
   *
   * @param {Object} params
   * @param {Function} params.getLoadedModels - Returns array of loaded models from Ollama /api/ps
   * @param {Map} params.modelUsageTracker - modelId → { lastUsed, activeRequests }
   * @param {Function} params.unloadModel - Unloads a model by id
   */
  async checkAndUnload({ getLoadedModels, modelUsageTracker, unloadModel }) {
    try {
      const loadedModels = await getLoadedModels();
      if (!loadedModels || loadedModels.length === 0) {
        return;
      }

      const { keepAliveSeconds, phase } = await this.getCurrentKeepAlive();
      const keepAliveMs = keepAliveSeconds * 1000;
      const now = Date.now();

      for (const model of loadedModels) {
        const modelId = model.name || model.model;
        const usage = modelUsageTracker.get(modelId);

        // Skip models with active requests
        if (usage?.activeRequests > 0) {
          continue;
        }

        // Respect Ollama's own expires_at (accounts for direct external usage,
        // e.g. document-indexer calling Ollama directly)
        if (model.expires_at) {
          const expiresAt = new Date(model.expires_at).getTime();
          if (expiresAt > now) {
            continue;
          }
        }

        const lastUsed = usage?.lastUsed ? usage.lastUsed.getTime() : 0;
        const inactiveMs = lastUsed > 0 ? now - lastUsed : Infinity;

        // If we have no usage data but Ollama still has the model loaded,
        // initialize the tracker instead of unloading (external caller may be using it)
        if (inactiveMs === Infinity) {
          modelUsageTracker.set(modelId, { lastUsed: new Date(), activeRequests: 0 });
          logger.debug(`[ModelLifecycle] Initialized tracker for externally-loaded ${modelId}`);
          continue;
        }

        if (inactiveMs > keepAliveMs) {
          logger.info(
            `[ModelLifecycle] Unloading ${modelId} — inactive ${Math.round(inactiveMs / 60000)}min > ` +
              `${Math.round(keepAliveMs / 60000)}min (${phase} phase)`
          );
          await unloadModel(modelId, `adaptive_${phase}`);
        }
      }
    } catch (err) {
      logger.error(`[ModelLifecycle] checkAndUnload error: ${err.message}`);
    }
  }

  /**
   * Determine if we should preload model at startup.
   * Skip preload during idle phases (e.g. night reboot).
   */
  async shouldPreloadOnStartup() {
    if (!LIFECYCLE_ENABLED) {
      return true;
    }

    const profile = await this.getUsageProfile();
    const currentHour = new Date().getHours();
    const hourData = profile.find(p => p.hour === currentHour);

    // If no data yet (fresh install), always preload
    const hasAnyData = profile.some(p => p.avgRequests > 0);
    if (!hasAnyData) {
      return true;
    }

    // Preload in peak or normal phases, skip in idle
    return hourData?.phase !== 'idle';
  }

  /**
   * Get full lifecycle status for the API / frontend.
   */
  async getLifecycleStatus() {
    const profile = await this.getUsageProfile();
    const { keepAliveMinutes, phase } = await this.getCurrentKeepAlive();
    const currentHour = new Date().getHours();

    // Find next phase change
    let nextPhase = phase;
    let nextPhaseChangeHour = currentHour;
    for (let i = 1; i <= 24; i++) {
      const h = (currentHour + i) % 24;
      const hourData = profile.find(p => p.hour === h) || { phase: 'idle' };
      if (hourData.phase !== phase) {
        nextPhase = hourData.phase;
        nextPhaseChangeHour = h;
        break;
      }
    }

    return {
      enabled: LIFECYCLE_ENABLED,
      currentPhase: phase,
      keepAliveMinutes,
      nextPhaseChange: `${String(nextPhaseChangeHour).padStart(2, '0')}:00`,
      nextPhase,
      currentHour,
      usageProfile: profile.map(p => ({
        hour: p.hour,
        avgRequests: p.avgRequests,
        phase: p.phase,
      })),
      thresholds: {
        peakThreshold: PEAK_THRESHOLD,
        peakKeepAliveMin: PEAK_KEEP_ALIVE_MIN,
        normalKeepAliveMin: NORMAL_KEEP_ALIVE_MIN,
        idleKeepAliveMin: IDLE_KEEP_ALIVE_MIN,
      },
    };
  }

  /**
   * Invalidate cached profile (e.g. after manual override).
   */
  invalidateCache() {
    cachedProfile = null;
    profileLastRefreshed = 0;
  }
}

const instance = new ModelLifecycleService();
module.exports = instance;
