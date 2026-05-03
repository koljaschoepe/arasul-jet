/**
 * Feature-Flag Gates (Phase 1.4 + 1.6)
 *
 * Cached lookup against system_settings. Updates propagate after
 * FEATURE_FLAG_TTL_MS (default 30s) — short enough that an admin toggle
 * is reflected almost immediately, long enough to avoid hot-path DB hits.
 */

const db = require('../database');
const { ServiceUnavailableError } = require('../utils/errors');

const FEATURE_FLAG_TTL_MS = 30_000;
let cache = { value: null, expiresAt: 0 };

async function getFeatureFlags() {
  const now = Date.now();
  if (cache.value && now < cache.expiresAt) {
    return cache.value;
  }
  const result = await db.query(
    'SELECT telegram_enabled, ai_transparency_enabled FROM system_settings WHERE id = 1'
  );
  const row = result.rows[0] || {};
  const flags = {
    telegram_enabled: row.telegram_enabled ?? false,
    ai_transparency_enabled: row.ai_transparency_enabled ?? true,
  };
  cache = { value: flags, expiresAt: now + FEATURE_FLAG_TTL_MS };
  return flags;
}

function invalidateFeatureFlagsCache() {
  cache = { value: null, expiresAt: 0 };
}

/**
 * Block requests when Telegram is globally disabled.
 * Apply to write/mutation endpoints in telegram routers.
 * GET endpoints stay open so admins can inspect/clean-up legacy state.
 */
async function requireTelegramEnabled(req, res, next) {
  try {
    const flags = await getFeatureFlags();
    if (!flags.telegram_enabled) {
      return res.status(403).json({
        error: {
          code: 'TELEGRAM_DISABLED',
          message:
            'Telegram ist deaktiviert. Bitte unter Einstellungen → Compliance aktivieren (Drittland-Disclaimer erforderlich).',
        },
        timestamp: new Date().toISOString(),
      });
    }
    next();
  } catch (err) {
    next(new ServiceUnavailableError('Feature-Flag-Check fehlgeschlagen'));
  }
}

module.exports = {
  getFeatureFlags,
  invalidateFeatureFlagsCache,
  requireTelegramEnabled,
};
