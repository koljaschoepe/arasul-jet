const { nextId } = require('./_seq');

/**
 * telegram_bot_configs row. Stores the encrypted bot token and the chat
 * the bot sends messages to on behalf of the user.
 */
function makeBotConfig(overrides = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    user_id: 1,
    bot_username: `testbot_${id}`,
    bot_token_encrypted: `enc:token-${id}`,
    chat_id: String(900000000 + id),
    is_active: true,
    notifications_enabled: true,
    quiet_hours_start: null,
    quiet_hours_end: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * telegram_notification_rules row.
 */
function makeNotificationRule(overrides = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    user_id: 1,
    name: `Rule ${id}`,
    event_source: 'system',
    event_type: 'cpu_high',
    message_template: 'CPU at {{event.value}}%',
    is_enabled: true,
    min_severity: 'warning',
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * telegram_setup_sessions row (zero-config flow).
 * Status defaults to 'pending'; use 'waiting_start' or 'completed' for
 * further-stage tests.
 */
function makeSetupSession(overrides = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    setup_token: `setup-${id}`,
    user_id: 1,
    status: 'pending',
    bot_username: null,
    bot_token_encrypted: null,
    chat_id: null,
    chat_username: null,
    chat_first_name: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  };
}

module.exports = { makeBotConfig, makeNotificationRule, makeSetupSession };
