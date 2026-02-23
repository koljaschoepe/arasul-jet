/**
 * Telegram Polling Manager
 *
 * Manages long-polling (getUpdates) for all active bots when PUBLIC_URL
 * is not configured (i.e., webhooks cannot be used).
 *
 * This is the runtime message receiver for local/offline deployments.
 *
 * Flow:
 *   1. On backend startup, checks if PUBLIC_URL is set
 *   2. If not, starts polling for all active bots
 *   3. When a bot is activated, starts polling for it
 *   4. When a bot is deactivated, stops polling for it
 *   5. Routes received updates to telegramWebhookService.processUpdate()
 */

const logger = require('../utils/logger');
const telegramBotService = require('./telegramBotService');
const telegramWebhookService = require('./telegramWebhookService');

const LONG_POLL_TIMEOUT = 30; // Telegram long-polling timeout in seconds
const RESTART_DELAY_MS = 5000; // Delay before restarting a failed polling loop

// Active polling loops: botId -> { abortController, running }
const activePolls = new Map();

/**
 * Check if polling mode should be used (no PUBLIC_URL)
 * @returns {boolean}
 */
function shouldUsePollling() {
  return !process.env.PUBLIC_URL;
}

/**
 * Initialize the polling manager
 * Starts polling for all active bots if PUBLIC_URL is not configured
 */
async function initialize() {
  if (!shouldUsePollling()) {
    logger.info('Telegram Polling Manager: PUBLIC_URL is set, using webhooks instead of polling');
    return;
  }

  logger.info(
    'Telegram Polling Manager: No PUBLIC_URL configured, starting getUpdates polling for active bots'
  );

  try {
    const activeBots = await telegramBotService.getActiveBots();

    if (activeBots.length === 0) {
      logger.info('Telegram Polling Manager: No active bots found');
      return;
    }

    for (const bot of activeBots) {
      await startPolling(bot.id);
    }

    logger.info(`Telegram Polling Manager: Started polling for ${activeBots.length} active bot(s)`);
  } catch (error) {
    logger.error('Telegram Polling Manager: Failed to initialize:', error.message);
  }
}

/**
 * Start polling for a specific bot
 * @param {number} botId - Bot ID
 */
async function startPolling(botId) {
  if (activePolls.has(botId)) {
    logger.debug(`Polling already active for bot ${botId}`);
    return;
  }

  if (!shouldUsePollling()) {
    logger.debug(`Polling not needed for bot ${botId} (PUBLIC_URL is set)`);
    return;
  }

  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    logger.error(`Cannot start polling for bot ${botId}: token not found`);
    return;
  }

  // Delete any existing webhook so getUpdates works
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const data = await response.json();
    if (data.ok) {
      logger.info(`Webhook deleted for bot ${botId} to enable polling`);
    }
  } catch (err) {
    logger.warn(`Could not delete webhook for bot ${botId}: ${err.message}`);
  }

  // Mark as polling in DB
  try {
    const database = require('../database');
    await database.query('UPDATE telegram_bots SET is_polling = true WHERE id = $1', [botId]);
  } catch (err) {
    logger.warn(`Could not update polling status for bot ${botId}: ${err.message}`);
  }

  const state = { running: true, offset: 0 };
  activePolls.set(botId, state);

  // Start the polling loop (non-blocking)
  pollLoop(botId, token, state);

  logger.info(`Started getUpdates polling for bot ${botId}`);
}

/**
 * The main polling loop for a single bot
 * Uses Telegram's long-polling (timeout parameter) for efficiency
 * @param {number} botId - Bot ID
 * @param {string} token - Decrypted bot token
 * @param {Object} state - Mutable state object { running, offset }
 */
async function pollLoop(botId, token, state) {
  while (state.running) {
    try {
      const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
      url.searchParams.set('offset', state.offset.toString());
      url.searchParams.set('timeout', LONG_POLL_TIMEOUT.toString());
      url.searchParams.set('allowed_updates', JSON.stringify(['message', 'callback_query']));

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout((LONG_POLL_TIMEOUT + 5) * 1000),
      });

      if (!state.running) {break;}

      const data = await response.json();

      if (!data.ok) {
        logger.error(`Telegram getUpdates error for bot ${botId}: ${data.description}`);
        await sleep(RESTART_DELAY_MS);
        continue;
      }

      if (!data.result || data.result.length === 0) {
        continue; // No new updates, loop again (long-poll will wait)
      }

      // Process each update
      for (const update of data.result) {
        // Advance offset past this update
        state.offset = update.update_id + 1;

        try {
          await telegramWebhookService.processUpdate(botId, update);
        } catch (processError) {
          logger.error(
            `Error processing update ${update.update_id} for bot ${botId}:`,
            processError.message
          );
        }
      }
    } catch (error) {
      if (!state.running) {break;}

      // Distinguish between timeout (normal) and actual errors
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        // Timeout is normal for long-polling, just retry
        continue;
      }

      logger.error(`Polling error for bot ${botId}: ${error.message}`);
      await sleep(RESTART_DELAY_MS);
    }
  }

  logger.info(`Polling loop ended for bot ${botId}`);
}

/**
 * Stop polling for a specific bot
 * @param {number} botId - Bot ID
 */
async function stopPolling(botId) {
  const state = activePolls.get(botId);
  if (!state) {return;}

  state.running = false;
  activePolls.delete(botId);

  // Mark as not polling in DB
  try {
    const database = require('../database');
    await database.query('UPDATE telegram_bots SET is_polling = false WHERE id = $1', [botId]);
  } catch (err) {
    logger.warn(`Could not update polling status for bot ${botId}: ${err.message}`);
  }

  logger.info(`Stopped polling for bot ${botId}`);
}

/**
 * Check if a bot is currently being polled
 * @param {number} botId - Bot ID
 * @returns {boolean}
 */
function isPolling(botId) {
  return activePolls.has(botId);
}

/**
 * Get count of actively polled bots
 * @returns {number}
 */
function getActiveCount() {
  return activePolls.size;
}

/**
 * Shutdown all polling loops (for graceful server shutdown)
 */
function shutdown() {
  logger.info(`Telegram Polling Manager: Shutting down ${activePolls.size} polling loop(s)`);

  for (const [_botId, state] of activePolls) {
    state.running = false;
  }
  activePolls.clear();
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  initialize,
  startPolling,
  stopPolling,
  isPolling,
  getActiveCount,
  shutdown,
  shouldUsePollling,
};
