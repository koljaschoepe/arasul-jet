/**
 * Telegram Ingress Service
 *
 * Central orchestrator for all inbound Telegram message handling:
 * - Webhook processing (processUpdate, setWebhook, deleteWebhook, etc.)
 * - Runtime polling via getUpdates (for deployments without PUBLIC_URL)
 * - Setup-time polling (detects /start during zero-config wizard)
 *
 * Command handlers are in telegramCommandHandlers.js
 * Message sending logic is in telegramMessageSender.js
 */

// =============================================================================
// Dependencies
// =============================================================================

const axios = require('axios');
const database = require('../../database');
const logger = require('../../utils/logger');
const telegramBotService = require('./telegramBotService');
const { decryptToken } = require('../../utils/tokenCrypto');

// Extracted modules
const {
  sendMessage,
  sendTypingAction,
  sendFormattedMessage,
  formatTelegramMessage,
  TELEGRAM_API,
  maskToken,
} = require('./telegramMessageSender');

const {
  handleStartCommand,
  handleHelpCommand,
  handleNewCommand,
  handleToolsCommand,
  handleStatusCommand,
  handleServicesCommand,
  handleToolCommand,
  handleSpacesCommand,
  handleCommandsCommand,
  handleCustomCommand,
  handleTextMessage,
  handleApiKeyCommand,
  handleVoiceMessage,
  isUserAllowed,
} = require('./telegramCommandHandlers');

// =============================================================================
// Constants
// =============================================================================

const MAX_MESSAGE_LENGTH = parseInt(process.env.TELEGRAM_MAX_MESSAGE_LENGTH) || 4096;

// Polling constants (runtime)
const LONG_POLL_TIMEOUT = 30;
const RESTART_DELAY_MS = 5000;

// Setup polling constants
const SETUP_POLL_INTERVAL_MS = 2000;
const SETUP_SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const sleep = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

// =============================================================================
// State
// =============================================================================

// Active runtime polling loops: botId -> { running, offset }
const activePolls = new Map();

// Active setup polling sessions: setupToken -> { intervalId, timeoutId, offset }
const activeSetupSessions = new Map();

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a Telegram message object
 * @param {Object} message - Telegram message object
 * @returns {Object} { valid: boolean, error?: string, chatId?: number }
 */
function validateTelegramMessage(message) {
  if (!message) {
    return { valid: false, error: 'Message is null or undefined' };
  }

  if (!message.chat) {
    return { valid: false, error: 'Message.chat is missing' };
  }

  if (typeof message.chat.id !== 'number' && typeof message.chat.id !== 'string') {
    return { valid: false, error: `Invalid chat.id type: ${typeof message.chat.id}` };
  }

  const chatId =
    typeof message.chat.id === 'string' ? parseInt(message.chat.id, 10) : message.chat.id;
  if (isNaN(chatId)) {
    return { valid: false, error: `Invalid chat.id value: ${message.chat.id}` };
  }

  return { valid: true, chatId };
}

// =============================================================================
// Setup Session Notification
// =============================================================================

/**
 * Notify active setup sessions when a chat is detected
 */
async function notifySetupSessionIfExists(chatId, username, firstName, chatType, botToken) {
  let telegramWebSocketService;
  try {
    telegramWebSocketService = require('./telegramWebSocketService');
  } catch (err) {
    logger.debug('WebSocket service not available for setup notification');
    return;
  }

  try {
    const result = await database.query(`
      SELECT setup_token, bot_token_encrypted
      FROM telegram_setup_sessions
      WHERE status = 'waiting_start'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (result.rows.length === 0) {
      logger.debug('No active setup sessions waiting for chat detection');
      return;
    }

    for (const row of result.rows) {
      const setupToken = row.setup_token;

      if (botToken && row.bot_token_encrypted) {
        try {
          const sessionBotToken = decryptToken(row.bot_token_encrypted);
          if (sessionBotToken !== botToken) {
            continue;
          }
        } catch {
          continue;
        }
      }

      await database.query(
        `
        UPDATE telegram_setup_sessions
        SET chat_id = $1,
            chat_username = $2,
            chat_first_name = $3,
            status = 'completed',
            completed_at = NOW()
        WHERE setup_token = $4 AND status = 'waiting_start'
        `,
        [chatId.toString(), username, firstName, setupToken]
      );

      telegramWebSocketService.notifySetupComplete(setupToken, {
        chatId: chatId.toString(),
        username,
        firstName,
        type: chatType,
      });

      logger.info(
        `Setup session ${setupToken.slice(0, 8)}... completed: chat=${chatId}, user=@${username}`
      );
    }
  } catch (error) {
    logger.error('Error notifying setup session:', error.message);
  }
}

// =============================================================================
// Webhook Processing (main orchestrator)
// =============================================================================

/**
 * Process a Telegram update — routes to the appropriate command/message handler
 * @param {number} botId - Bot ID
 * @param {Object} update - Telegram update object
 * @returns {Promise<boolean>} Success
 */
async function processUpdate(botId, update) {
  const startTime = Date.now();

  if (!update) {
    logger.error(`Received null/undefined update for bot ${botId}`);
    return false;
  }

  logger.debug(`Processing update for bot ${botId}:`, {
    updateId: update.update_id,
    hasMessage: !!update.message,
    hasCallbackQuery: !!update.callback_query,
  });

  // Get bot token
  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    logger.error(`Token decryption failed for bot ${botId} - check encryption key`);
    try {
      const telegramWebSocketService = require('./telegramWebSocketService');
      telegramWebSocketService.broadcast({
        type: 'bot_error',
        botId,
        error: 'Token-Entschlüsselung fehlgeschlagen. Bitte Token neu setzen.',
      });
    } catch (wsErr) {
      /* ignore ws errors */
    }
    return false;
  }

  // Get bot info
  const botResult = await database.query(
    `SELECT id, name, is_active, voice_enabled, tools_enabled FROM telegram_bots WHERE id = $1`,
    [botId]
  );

  if (botResult.rows.length === 0 || !botResult.rows[0].is_active) {
    logger.warn(`Bot ${botId} not found or inactive`);
    return false;
  }

  const bot = botResult.rows[0];

  // Handle message
  if (update.message) {
    const message = update.message;

    const validation = validateTelegramMessage(message);
    if (!validation.valid) {
      logger.error(`Invalid message structure for bot ${botId}: ${validation.error}`, {
        updateId: update.update_id,
        messageKeys: Object.keys(message || {}),
      });
      return false;
    }

    const chatId = validation.chatId;
    const userId = message.from?.id;

    logger.debug(`Processing message from chat ${chatId}:`, {
      userId,
      hasText: !!message.text,
      hasVoice: !!message.voice,
      textPreview: message.text?.substring(0, 50),
    });

    // Check user whitelist (skip for /start to allow new users to register)
    const isStartCommand = message.text?.trim().toLowerCase().startsWith('/start');
    if (!isStartCommand && !(await isUserAllowed(bot, userId))) {
      logger.warn(`User ${userId} not allowed for bot ${botId}`);
      await sendMessage(token, chatId, '⛔ Du bist nicht berechtigt, diesen Bot zu nutzen.');
      return false;
    }

    // Handle text messages
    if (message.text) {
      const text = message.text.trim();

      if (text.length > MAX_MESSAGE_LENGTH) {
        await sendMessage(
          token,
          chatId,
          `⚠️ Nachricht zu lang (${text.length}/${MAX_MESSAGE_LENGTH} Zeichen). Bitte kürze deine Nachricht.`
        );
        return false;
      }

      // Route commands
      if (text.startsWith('/')) {
        const parts = text.slice(1).split(' ');
        const command = parts[0].toLowerCase().split('@')[0];
        const args = parts.slice(1).join(' ');

        // Context passed to handleStartCommand (avoids circular deps)
        const ctx = { validateTelegramMessage, notifySetupSessionIfExists };

        switch (command) {
          case 'start':
            await handleStartCommand(bot, token, message, ctx);
            break;
          case 'help':
            await handleHelpCommand(bot, token, message);
            break;
          case 'new':
          case 'clear':
            await handleNewCommand(bot, token, message);
            break;
          case 'commands':
            await handleCommandsCommand(bot, token, message);
            break;
          case 'tools':
            await handleToolsCommand(bot, token, message);
            break;
          case 'status':
            await handleStatusCommand(bot, token, message);
            break;
          case 'services':
            await handleServicesCommand(bot, token, message);
            break;
          case 'workflows':
            await handleToolCommand(bot, token, message, 'workflows', { action: args || 'list' });
            break;
          case 'alerts':
            await handleToolCommand(bot, token, message, 'check_alerts', {
              action: args || 'list',
            });
            break;
          case 'query':
            await handleToolCommand(bot, token, message, 'query_data', { query: args });
            break;
          case 'spaces':
            await handleSpacesCommand(bot, token, message);
            break;
          case 'apikey':
            await handleApiKeyCommand(bot, token, message, args);
            break;
          default:
            await handleCustomCommand(bot, token, message, command, args);
        }
      } else {
        await handleTextMessage(bot, token, message);
      }
    }

    // Handle voice messages
    if (message.voice) {
      await handleVoiceMessage(bot, token, message);
    }

    // Handle unsupported media types
    if (
      !message.text &&
      !message.voice &&
      (message.document || message.photo || message.video || message.sticker)
    ) {
      const msgChatId = message.chat?.id;
      if (msgChatId) {
        await sendMessage(
          token,
          msgChatId,
          'Datei-Uploads werden noch nicht unterstützt. Bitte sende mir eine Textnachricht.'
        );
      }
    }

    await telegramBotService.updateLastMessage(botId);

    const duration = Date.now() - startTime;
    logger.info(`Update ${update.update_id} processed for bot ${botId} in ${duration}ms`);
  }

  // Handle callback queries (inline button presses)
  if (update.callback_query) {
    const cbQuery = update.callback_query;
    const chatId = cbQuery.message?.chat?.id;
    const callbackData = cbQuery.data;

    logger.info(`Callback query from chat ${chatId}: ${callbackData}`, {
      botId,
      userId: cbQuery.from?.id,
    });

    try {
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cbQuery.id }),
      });
    } catch (err) {
      logger.warn(`Failed to answer callback query: ${err.message}`);
    }
  }

  return true;
}

// =============================================================================
// Webhook Management
// =============================================================================

async function setWebhook(botId, webhookUrl) {
  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    throw new Error('Bot token not found');
  }

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description || 'Failed to set webhook');
    }

    await database.query(`UPDATE telegram_bots SET webhook_url = $1 WHERE id = $2`, [
      webhookUrl,
      botId,
    ]);

    const maskedUrl = webhookUrl.replace(/\/[^/]+$/, '/***');
    logger.info(`Webhook set for bot ${botId}: ${maskedUrl}`);
    return true;
  } catch (error) {
    logger.error('Error setting webhook:', error);
    throw error;
  }
}

async function deleteWebhook(botId) {
  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    throw new Error('Bot token not found');
  }

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/deleteWebhook`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description || 'Failed to delete webhook');
    }

    await database.query(`UPDATE telegram_bots SET webhook_url = NULL WHERE id = $1`, [botId]);

    logger.info(`Webhook deleted for bot ${botId}`);
    return true;
  } catch (error) {
    logger.error('Error deleting webhook:', error);
    throw error;
  }
}

async function getWebhookInfo(botId) {
  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    throw new Error('Bot token not found');
  }

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/getWebhookInfo`, {
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description || 'Failed to get webhook info');
    }

    return {
      url: data.result.url,
      hasCustomCertificate: data.result.has_custom_certificate,
      pendingUpdateCount: data.result.pending_update_count,
      lastErrorDate: data.result.last_error_date,
      lastErrorMessage: data.result.last_error_message,
      maxConnections: data.result.max_connections,
    };
  } catch (error) {
    logger.error('Error getting webhook info:', error);
    throw error;
  }
}

async function sendTestMessage(botId, chatId, text) {
  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    throw new Error('Bot token not found');
  }

  return sendMessage(token, chatId, text);
}

// =============================================================================
// Runtime Polling
// =============================================================================

function shouldUsePollling() {
  return !process.env.PUBLIC_URL;
}

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

async function startPolling(botId) {
  if (activePolls.has(botId)) {
    logger.debug(`Polling already active for bot ${botId}`);
    return;
  }

  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    logger.error(`Cannot start polling for bot ${botId}: token not found or decryption failed`);
    return;
  }

  // Verify token is valid
  try {
    const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(30000),
    });
    const meData = await meResponse.json();
    if (!meData.ok) {
      logger.error(`Bot token invalid for bot ${botId}: ${meData.description}`);
      return;
    }
    logger.info(`Token verified for bot ${botId} (@${meData.result.username}), starting polling`);
  } catch (err) {
    const safeMessage = err.message ? err.message.replace(token, maskToken(token)) : err.message;
    logger.error(`Cannot verify bot token for bot ${botId}: ${safeMessage}`);
    return;
  }

  // Delete any existing webhook so getUpdates works
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (data.ok) {
      logger.info(`Webhook deleted for bot ${botId} to enable polling`);
    } else {
      logger.warn(`deleteWebhook returned ok=false for bot ${botId}: ${data.description}`);
    }
  } catch (err) {
    const safeMessage = err.message ? err.message.replace(token, maskToken(token)) : err.message;
    logger.error(
      `Could not delete webhook for bot ${botId}: ${safeMessage} - polling may fail with 409 Conflict`
    );
  }

  // Mark as polling in DB
  try {
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

      if (!state.running) {
        break;
      }

      const data = await response.json();

      if (!data.ok) {
        logger.error(`Telegram getUpdates error for bot ${botId}: ${data.description}`);
        await sleep(RESTART_DELAY_MS);
        continue;
      }

      if (!data.result || data.result.length === 0) {
        continue;
      }

      for (const update of data.result) {
        state.offset = update.update_id + 1;

        try {
          await processUpdate(botId, update);
        } catch (processError) {
          logger.error(
            `Error processing update ${update.update_id} for bot ${botId}:`,
            processError.message
          );
        }
      }
    } catch (error) {
      if (!state.running) {
        break;
      }

      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        continue;
      }

      const safeMessage = error.message
        ? error.message.replace(token, maskToken(token))
        : error.message;
      logger.error(`Polling error for bot ${botId}: ${safeMessage}`);
      await sleep(RESTART_DELAY_MS);
    }
  }

  logger.info(`Polling loop ended for bot ${botId}`);
}

async function stopPolling(botId) {
  const state = activePolls.get(botId);
  if (!state) {
    return;
  }

  state.running = false;
  activePolls.delete(botId);

  try {
    await database.query('UPDATE telegram_bots SET is_polling = false WHERE id = $1', [botId]);
  } catch (err) {
    logger.warn(`Could not update polling status for bot ${botId}: ${err.message}`);
  }

  logger.info(`Stopped polling for bot ${botId}`);
}

function isPolling(botId) {
  return activePolls.has(botId);
}

function getActiveCount() {
  return activePolls.size;
}

function shutdown() {
  logger.info(`Telegram Polling Manager: Shutting down ${activePolls.size} polling loop(s)`);

  for (const [_botId, state] of activePolls) {
    state.running = false;
  }
  activePolls.clear();
}

// =============================================================================
// Setup Polling
// =============================================================================

async function startSetupPolling(setupToken) {
  if (activeSetupSessions.has(setupToken)) {
    logger.warn(`Polling already active for setup token ${setupToken.slice(0, 8)}...`);
    return;
  }

  const session = await database.query(
    `
        SELECT bot_token_encrypted, bot_username
        FROM telegram_setup_sessions
        WHERE setup_token = $1 AND status = 'waiting_start'
    `,
    [setupToken]
  );

  if (session.rows.length === 0) {
    logger.warn(`No waiting session found for setup token ${setupToken.slice(0, 8)}...`);
    return;
  }

  const botToken = decryptToken(session.rows[0].bot_token_encrypted);
  if (!botToken) {
    logger.error(`Could not decrypt bot token for setup token ${setupToken.slice(0, 8)}...`);
    return;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${botToken}/deleteWebhook`,
      { drop_pending_updates: false },
      { timeout: 10000 }
    );
    logger.info(
      `Webhook deleted for @${session.rows[0].bot_username} to enable getUpdates polling`
    );
  } catch (err) {
    const safeMsg = err.message ? err.message.replace(botToken, maskToken(botToken)) : err.message;
    logger.warn(`Could not delete webhook: ${safeMsg}`);
  }

  const state = { intervalId: null, timeoutId: null, offset: 0 };

  const telegramWebSocketService = require('./telegramWebSocketService');

  state.intervalId = setInterval(async () => {
    try {
      await setupPollUpdates(setupToken, botToken, state, telegramWebSocketService);
    } catch (err) {
      const safeMsg = err.message
        ? err.message.replace(botToken, maskToken(botToken))
        : err.message;
      logger.error(`Polling error for ${setupToken.slice(0, 8)}...: ${safeMsg}`);
    }
  }, SETUP_POLL_INTERVAL_MS);

  state.timeoutId = setTimeout(() => {
    logger.info(`Polling timeout reached for setup token ${setupToken.slice(0, 8)}...`);
    stopSetupPolling(setupToken);
    telegramWebSocketService.notifyError(setupToken, 'Setup-Zeitlimit überschritten (10 Minuten)');
  }, SETUP_SESSION_TIMEOUT_MS);

  activeSetupSessions.set(setupToken, state);
  logger.info(`Started getUpdates polling for setup token ${setupToken.slice(0, 8)}...`);
}

async function setupPollUpdates(setupToken, botToken, state, telegramWebSocketService) {
  const response = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`, {
    params: {
      offset: state.offset,
      timeout: 1,
      allowed_updates: JSON.stringify(['message']),
    },
    timeout: 10000,
  });

  if (!response.data.ok || !response.data.result || response.data.result.length === 0) {
    return;
  }

  for (const update of response.data.result) {
    state.offset = update.update_id + 1;

    const message = update.message;
    if (!message || !message.text) {
      continue;
    }

    const text = message.text.trim();

    const expectedPayload = `setup_${setupToken}`;
    const isStartMatch = text === `/start ${expectedPayload}`;

    if (!isStartMatch) {
      continue;
    }

    const chatId = message.chat.id;
    const username = message.from?.username || null;
    const firstName = message.from?.first_name || message.chat.first_name || null;

    logger.info(
      `/start detected from chat ${chatId} (@${username}) for setup ${setupToken.slice(0, 8)}...`
    );

    try {
      await database.query(`SELECT complete_telegram_setup($1, $2, $3, $4)`, [
        setupToken,
        chatId.toString(),
        username,
        firstName,
      ]);
    } catch (dbErr) {
      if (dbErr.message.includes('complete_telegram_setup')) {
        await database.query(
          `
                    UPDATE telegram_setup_sessions
                    SET status = 'completed',
                        chat_id = $2,
                        chat_username = $3,
                        chat_first_name = $4,
                        completed_at = NOW()
                    WHERE setup_token = $1
                `,
          [setupToken, chatId.toString(), username, firstName]
        );
      } else {
        throw dbErr;
      }
    }

    telegramWebSocketService.notifySetupComplete(setupToken, {
      chatId: chatId.toString(),
      username,
      firstName,
      type: message.chat.type || 'private',
    });

    try {
      await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          chat_id: chatId,
          text: '✅ Verbindung hergestellt! Du kannst jetzt zum Dashboard zurückkehren.',
          parse_mode: 'HTML',
        },
        { timeout: 10000 }
      );
    } catch (sendErr) {
      const safeMsg = sendErr.message
        ? sendErr.message.replace(botToken, maskToken(botToken))
        : sendErr.message;
      logger.warn(`Could not send confirmation message: ${safeMsg}`);
    }

    stopSetupPolling(setupToken);
    return;
  }
}

function stopSetupPolling(setupToken) {
  const state = activeSetupSessions.get(setupToken);
  if (!state) {
    return;
  }

  if (state.intervalId) {
    clearInterval(state.intervalId);
  }
  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
  }

  activeSetupSessions.delete(setupToken);
  logger.info(`Stopped getUpdates polling for setup token ${setupToken.slice(0, 8)}...`);
}

function isSetupPolling(setupToken) {
  return activeSetupSessions.has(setupToken);
}

function getSetupActiveCount() {
  return activeSetupSessions.size;
}

// =============================================================================
// Health
// =============================================================================

async function getBotHealth(botId) {
  const result = await database.query(
    `SELECT is_active, is_polling, last_message_at FROM telegram_bots WHERE id = $1`,
    [botId]
  );

  if (result.rows.length === 0) {
    return { status: 'not_found' };
  }

  const bot = result.rows[0];

  if (!bot.is_active) {
    return { status: 'inactive', isActive: false, isPolling: false };
  }

  const pollingActive = activePolls.has(botId);
  const lastMsg = bot.last_message_at ? new Date(bot.last_message_at) : null;
  const hoursAgo = lastMsg ? (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60) : null;

  let status = 'healthy';
  if (!pollingActive && !bot.is_polling) {
    status = 'error';
  } else if (hoursAgo !== null && hoursAgo > 24) {
    status = 'degraded';
  }

  return {
    status,
    isActive: bot.is_active,
    isPolling: pollingActive,
    lastMessageAt: bot.last_message_at,
  };
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // --- Webhook ---
  processUpdate,
  setWebhook,
  deleteWebhook,
  getWebhookInfo,
  sendMessage,
  sendFormattedMessage,
  formatTelegramMessage,
  sendTypingAction,
  sendTestMessage,

  // --- Runtime Polling ---
  initialize,
  startPolling,
  stopPolling,
  isPolling,
  isPollingActive: isPolling,
  getActiveCount,
  shutdown,
  shouldUsePollling,

  // --- Setup Polling ---
  startSetupPolling,
  stopSetupPolling,
  isSetupPolling,
  getSetupActiveCount,

  // --- Health ---
  getBotHealth,
};
