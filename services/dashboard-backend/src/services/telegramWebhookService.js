/**
 * Telegram Webhook Service
 * Handles incoming Telegram updates (messages, commands, etc.)
 *
 * Features:
 * - Webhook verification
 * - Message routing (text, commands)
 * - Chat registration on /start
 * - Built-in commands (/new, /help)
 */

const database = require('../database');
const logger = require('../utils/logger');
const telegramBotService = require('./telegramBotService');
const telegramLLMService = require('./telegramLLMService');
const telegramVoiceService = require('./telegramVoiceService');
const cryptoService = require('./cryptoService');

// Telegram API
const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Validate a Telegram message object
 * @param {Object} message - Telegram message object
 * @returns {Object} { valid: boolean, error?: string }
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

  // Convert string chat ID to number if needed
  const chatId = typeof message.chat.id === 'string' ? parseInt(message.chat.id, 10) : message.chat.id;
  if (isNaN(chatId)) {
    return { valid: false, error: `Invalid chat.id value: ${message.chat.id}` };
  }

  return { valid: true, chatId };
}

/**
 * Notify active setup sessions when a chat is detected
 * @param {number} chatId - Telegram chat ID
 * @param {string} username - Chat username
 * @param {string} firstName - User's first name
 * @param {string} chatType - Chat type
 */
async function notifySetupSessionIfExists(chatId, username, firstName, chatType) {
  // Lazy load to avoid circular dependency
  let telegramWebSocketService;
  try {
    telegramWebSocketService = require('./telegramWebSocketService');
  } catch (err) {
    logger.debug('WebSocket service not available for setup notification');
    return;
  }

  try {
    // Find active setup sessions waiting for /start
    const result = await database.query(`
      SELECT setup_token
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

    // Update each matching session and notify via WebSocket
    for (const row of result.rows) {
      const setupToken = row.setup_token;

      // Update session with chat info
      await database.query(`
        UPDATE telegram_setup_sessions
        SET chat_id = $1,
            chat_username = $2,
            chat_first_name = $3,
            status = 'completed',
            completed_at = NOW()
        WHERE setup_token = $4
          AND status = 'waiting_start'
      `, [chatId, username, firstName, setupToken]);

      // Notify WebSocket clients
      if (telegramWebSocketService.isInitialized()) {
        const notified = telegramWebSocketService.notifySetupComplete(setupToken, {
          chatId,
          username,
          firstName,
          type: chatType
        });

        if (notified) {
          logger.info(`Setup session ${setupToken.substring(0, 8)}... completed for chat ${chatId}`);
        }
      }
    }
  } catch (error) {
    logger.error('Error notifying setup session:', error);
  }
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  retryableErrors: [408, 429, 500, 502, 503, 504], // HTTP status codes to retry
};

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt (0-indexed)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt) {
  const delay = RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt);
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Send a message via Telegram API with retry logic
 * @param {string} token - Bot token
 * @param {number} chatId - Chat ID
 * @param {string} text - Message text
 * @param {Object} options - Additional options (parse_mode, etc.)
 * @returns {Promise<Object>} Telegram API response
 */
async function sendMessage(token, chatId, text, options = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: options.parseMode || 'HTML',
          ...options,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        // Check if error is retryable
        const errorCode = data.error_code || response.status;
        const isRetryable = RETRY_CONFIG.retryableErrors.includes(errorCode);

        if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
          const delay = calculateBackoff(attempt);
          logger.warn(`Telegram API error (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms:`, {
            errorCode,
            description: data.description,
            chatId,
          });
          await sleep(delay);
          continue;
        }

        // Handle rate limiting specifically
        if (errorCode === 429) {
          const retryAfter = data.parameters?.retry_after || 30;
          logger.error(`Telegram rate limit exceeded, retry after ${retryAfter}s:`, {
            chatId,
            description: data.description,
          });
          throw new Error(`Rate limit exceeded. Bitte warte ${retryAfter} Sekunden.`);
        }

        logger.error('Telegram sendMessage error:', {
          errorCode,
          description: data.description,
          chatId,
          attempt: attempt + 1,
        });
        throw new Error(data.description || 'Nachricht konnte nicht gesendet werden');
      }

      // Success
      if (attempt > 0) {
        logger.info(`Telegram message sent after ${attempt + 1} attempts to chat ${chatId}`);
      }

      return data.result;
    } catch (error) {
      lastError = error;

      // Network errors are retryable
      const isNetworkError = error.code === 'ECONNREFUSED' ||
                            error.code === 'ETIMEDOUT' ||
                            error.code === 'ENOTFOUND' ||
                            error.message.includes('network') ||
                            error.message.includes('fetch');

      if (isNetworkError && attempt < RETRY_CONFIG.maxRetries) {
        const delay = calculateBackoff(attempt);
        logger.warn(`Network error (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms:`, {
          error: error.message,
          chatId,
        });
        await sleep(delay);
        continue;
      }

      // Non-retryable error or max retries exceeded
      break;
    }
  }

  // All retries failed
  logger.error('Error sending Telegram message after all retries:', {
    error: lastError?.message,
    chatId,
    maxRetries: RETRY_CONFIG.maxRetries,
  });
  throw lastError;
}

/**
 * Send typing action
 * @param {string} token - Bot token
 * @param {number} chatId - Chat ID
 */
async function sendTypingAction(token, chatId) {
  try {
    await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action: 'typing',
      }),
    });
  } catch (error) {
    // Ignore typing action errors
  }
}

/**
 * Handle /start command - register chat
 * @param {Object} bot - Bot object from DB
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 * @returns {Promise<boolean>} Success
 */
async function handleStartCommand(bot, token, message) {
  // Validate message
  const validation = validateTelegramMessage(message);
  if (!validation.valid) {
    logger.error(`Invalid message in handleStartCommand: ${validation.error}`);
    return false;
  }

  const chatId = validation.chatId;
  const chatType = message.chat.type || 'private';
  const chatTitle = message.chat.title || message.from?.first_name || 'Unknown';
  const chatUsername = message.chat.username || message.from?.username || null;
  const firstName = message.from?.first_name || null;

  try {
    // Register chat
    await telegramBotService.addChat(bot.id, {
      chatId,
      title: chatTitle,
      type: chatType,
      username: chatUsername,
    });

    // Send welcome message
    const welcomeText = `🤖 <b>Willkommen bei ${bot.name}!</b>

Ich bin dein persoenlicher Assistent. Schreib mir einfach eine Nachricht und ich antworte dir.

<b>Verfuegbare Befehle:</b>
/help - Zeigt diese Hilfe
/new - Startet eine neue Konversation
/commands - Zeigt alle verfuegbaren Befehle
/tools - Zeigt System-Tools
/status - Zeigt System-Status
/apikey - API Key Management

🎤 Du kannst mir auch Sprachnachrichten senden!

Wie kann ich dir helfen?`;

    await sendMessage(token, chatId, welcomeText);
    logger.info(`Chat registered: ${chatId} (${chatType}) for bot ${bot.id}`);

    // Notify any waiting setup sessions
    await notifySetupSessionIfExists(chatId, chatUsername, firstName, chatType);

    return true;
  } catch (error) {
    logger.error(`Error in handleStartCommand for chat ${chatId}:`, error);
    return false;
  }
}

/**
 * Handle /help command
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 */
async function handleHelpCommand(bot, token, message) {
  const chatId = message.chat.id;

  // Get custom commands
  const commands = await telegramBotService.getCommands(bot.id);
  const enabledCommands = commands.filter((c) => c.isEnabled);

  let helpText = `🤖 <b>${bot.name} - Hilfe</b>

<b>Standard-Befehle:</b>
/start - Bot starten
/help - Diese Hilfe anzeigen
/new - Neue Konversation starten
/commands - Alle Befehle anzeigen

<b>System-Tools:</b>
/tools - Verfuegbare Tools anzeigen
/status - System-Status anzeigen
/services - Docker-Services anzeigen

<b>Einstellungen:</b>
/apikey - API Key Management

🎤 Sprachnachrichten werden automatisch transkribiert!`;

  if (enabledCommands.length > 0) {
    helpText += '\n\n<b>Custom Commands:</b>';
    for (const cmd of enabledCommands) {
      helpText += `\n/${cmd.command} - ${cmd.description}`;
    }
  }

  helpText += `\n\n💡 Oder schreib mir einfach eine Nachricht!`;

  await sendMessage(token, chatId, helpText);
}

/**
 * Handle /new command - clear session
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 */
async function handleNewCommand(bot, token, message) {
  const chatId = message.chat.id;

  await telegramLLMService.clearSession(bot.id, chatId);

  await sendMessage(token, chatId, '🔄 <b>Neue Konversation gestartet!</b>\n\nDer Kontext wurde gelöscht. Wie kann ich dir helfen?');
}

/**
 * Handle /tools command - list available system tools
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 */
async function handleToolsCommand(bot, token, message) {
  const chatId = message.chat.id;

  try {
    const tools = await telegramLLMService.getAvailableTools();

    if (tools.length === 0) {
      await sendMessage(token, chatId, '🔧 <b>Keine System-Tools verfuegbar.</b>');
      return;
    }

    let text = '🛠️ <b>Verfuegbare System-Tools</b>\n\n';
    text += 'Du kannst mich nach folgenden System-Informationen fragen:\n\n';

    for (const tool of tools) {
      text += `• <b>${tool.name}</b> - ${tool.description}\n`;
    }

    text += '\n💡 <i>Beispiele:</i>\n';
    text += '- "Wie ist der CPU-Status?"\n';
    text += '- "Zeige die laufenden Services"\n';
    text += '- "Zeige mir die Logs vom Backend"';

    await sendMessage(token, chatId, text);
  } catch (error) {
    logger.error('Error fetching tools:', error);
    await sendMessage(token, chatId, '❌ Fehler beim Laden der Tools.');
  }
}

/**
 * Handle /status command - show system status directly
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 */
async function handleStatusCommand(bot, token, message) {
  const chatId = message.chat.id;

  await sendTypingAction(token, chatId);

  try {
    const result = await telegramLLMService.executeTool('status', {}, { botId: bot.id, chatId });
    await sendMessage(token, chatId, result, { parseMode: 'Markdown' });
  } catch (error) {
    logger.error('Status tool error:', error);
    await sendMessage(token, chatId, `❌ Fehler: ${error.message}`);
  }
}

/**
 * Handle /services command - show docker services directly
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 */
async function handleServicesCommand(bot, token, message) {
  const chatId = message.chat.id;

  await sendTypingAction(token, chatId);

  try {
    const result = await telegramLLMService.executeTool('services', {}, { botId: bot.id, chatId });
    await sendMessage(token, chatId, result, { parseMode: 'Markdown' });
  } catch (error) {
    logger.error('Services tool error:', error);
    await sendMessage(token, chatId, `❌ Fehler: ${error.message}`);
  }
}

/**
 * Handle /commands command - list all custom commands
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 */
async function handleCommandsCommand(bot, token, message) {
  const chatId = message.chat.id;

  const commands = await telegramBotService.getCommands(bot.id);
  const enabledCommands = commands.filter((c) => c.isEnabled);

  if (enabledCommands.length === 0) {
    await sendMessage(token, chatId, '📋 <b>Keine Custom Commands konfiguriert.</b>\n\nSchreib mir einfach eine Nachricht!');
    return;
  }

  let text = '📋 <b>Verfügbare Commands:</b>\n';

  for (const cmd of enabledCommands) {
    text += `\n<b>/${cmd.command}</b>\n  ${cmd.description}\n`;
  }

  await sendMessage(token, chatId, text);
}

/**
 * Handle custom command
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 * @param {string} command - Command name
 * @param {string} args - Command arguments
 */
async function handleCustomCommand(bot, token, message, command, args) {
  const chatId = message.chat.id;

  // Show typing
  await sendTypingAction(token, chatId);

  try {
    const response = await telegramLLMService.executeCommand(bot.id, chatId, command, args);

    if (response === null) {
      // Command not found
      await sendMessage(
        token,
        chatId,
        `❓ Unbekannter Befehl: /${command}\n\nNutze /commands für eine Liste aller Befehle.`
      );
      return;
    }

    await sendMessage(token, chatId, response);
  } catch (error) {
    logger.error(`Command execution error (/${command}):`, error);
    await sendMessage(token, chatId, `❌ Fehler: ${error.message}`);
  }
}

/**
 * Handle text message (LLM chat)
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 */
async function handleTextMessage(bot, token, message) {
  const chatId = message.chat.id;
  const text = message.text;

  // Show typing
  await sendTypingAction(token, chatId);

  try {
    const response = await telegramLLMService.chat(bot.id, chatId, text);
    await sendMessage(token, chatId, response);
  } catch (error) {
    logger.error('LLM chat error:', error);
    await sendMessage(token, chatId, `❌ Fehler: ${error.message}`);
  }
}

/**
 * Handle /apikey command - manage API keys
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message
 * @param {string} args - Command arguments
 */
async function handleApiKeyCommand(bot, token, message, args) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  // Parse arguments: /apikey [set|delete|status] [provider] [key]
  const parts = args.trim().split(/\s+/);
  const action = parts[0]?.toLowerCase();
  const provider = parts[1]?.toLowerCase();
  const apiKey = parts.slice(2).join(' ');

  // Delete the message containing the API key for security
  if (action === 'set' && apiKey) {
    try {
      await fetch(`${TELEGRAM_API}${token}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: message.message_id,
        }),
      });
    } catch (error) {
      logger.warn('Could not delete message with API key:', error.message);
    }
  }

  if (!action || action === 'help') {
    const helpText = `🔑 <b>API Key Management</b>

<b>Befehle:</b>
<code>/apikey set claude &lt;key&gt;</code> - Claude API Key setzen
<code>/apikey set openai &lt;key&gt;</code> - OpenAI API Key setzen (fuer Whisper)
<code>/apikey delete claude</code> - Claude API Key loeschen
<code>/apikey delete openai</code> - OpenAI API Key loeschen
<code>/apikey status</code> - Status der API Keys

⚠️ <b>Hinweis:</b> Nachrichten mit API Keys werden automatisch geloescht.`;

    await sendMessage(token, chatId, helpText);
    return;
  }

  if (action === 'status') {
    try {
      const result = await database.query(
        `SELECT
           CASE WHEN claude_api_key_encrypted IS NOT NULL THEN true ELSE false END as has_claude,
           CASE WHEN openai_api_key_encrypted IS NOT NULL THEN true ELSE false END as has_openai
         FROM telegram_bots WHERE id = $1`,
        [bot.id]
      );

      if (result.rows.length === 0) {
        await sendMessage(token, chatId, '❌ Bot nicht gefunden.');
        return;
      }

      const { has_claude, has_openai } = result.rows[0];

      const statusText = `🔑 <b>API Key Status</b>

• Claude API: ${has_claude ? '✅ Konfiguriert' : '❌ Nicht gesetzt'}
• OpenAI API: ${has_openai ? '✅ Konfiguriert' : '❌ Nicht gesetzt'}

${!has_openai ? '💡 Fuer Sprachnachrichten wird ein OpenAI API Key benoetigt.' : ''}`;

      await sendMessage(token, chatId, statusText);
    } catch (error) {
      logger.error('Error checking API key status:', error);
      await sendMessage(token, chatId, '❌ Fehler beim Abrufen des Status.');
    }
    return;
  }

  if (action === 'set') {
    if (!provider || !['claude', 'openai'].includes(provider)) {
      await sendMessage(token, chatId, '❌ Ungueltiger Provider. Nutze: <code>claude</code> oder <code>openai</code>');
      return;
    }

    if (!apiKey) {
      await sendMessage(token, chatId, '❌ Kein API Key angegeben.');
      return;
    }

    try {
      const { encrypted, iv, authTag } = cryptoService.encrypt(apiKey);

      const column = provider === 'claude' ? 'claude_api_key' : 'openai_api_key';

      await database.query(
        `UPDATE telegram_bots
         SET ${column}_encrypted = $1,
             ${column}_iv = $2,
             ${column}_auth_tag = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [encrypted, iv, authTag, bot.id]
      );

      await sendMessage(token, chatId, `✅ ${provider.toUpperCase()} API Key wurde gespeichert.`);
      logger.info(`API key set for bot ${bot.id}: ${provider}`);
    } catch (error) {
      logger.error('Error setting API key:', error);
      await sendMessage(token, chatId, '❌ Fehler beim Speichern des API Keys.');
    }
    return;
  }

  if (action === 'delete') {
    if (!provider || !['claude', 'openai'].includes(provider)) {
      await sendMessage(token, chatId, '❌ Ungueltiger Provider. Nutze: <code>claude</code> oder <code>openai</code>');
      return;
    }

    try {
      const column = provider === 'claude' ? 'claude_api_key' : 'openai_api_key';

      await database.query(
        `UPDATE telegram_bots
         SET ${column}_encrypted = NULL,
             ${column}_iv = NULL,
             ${column}_auth_tag = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [bot.id]
      );

      await sendMessage(token, chatId, `✅ ${provider.toUpperCase()} API Key wurde geloescht.`);
      logger.info(`API key deleted for bot ${bot.id}: ${provider}`);
    } catch (error) {
      logger.error('Error deleting API key:', error);
      await sendMessage(token, chatId, '❌ Fehler beim Loeschen des API Keys.');
    }
    return;
  }

  await sendMessage(token, chatId, '❌ Unbekannte Aktion. Nutze <code>/apikey help</code> fuer Hilfe.');
}

/**
 * Handle voice message
 * @param {Object} bot - Bot object
 * @param {string} token - Bot token
 * @param {Object} message - Telegram message with voice
 */
async function handleVoiceMessage(bot, token, message) {
  const chatId = message.chat.id;
  const voice = message.voice;

  // Show typing while processing
  await sendTypingAction(token, chatId);

  // Check if voice is enabled
  if (!telegramVoiceService.isEnabled()) {
    await sendMessage(token, chatId, '🎤 Sprachnachrichten sind deaktiviert.');
    return;
  }

  try {
    // Send processing notification
    await sendMessage(token, chatId, '🎤 <i>Transkribiere Sprachnachricht...</i>');

    // Process voice message
    const result = await telegramVoiceService.processVoiceMessage(bot.id, token, voice);

    if (!result.success) {
      await sendMessage(token, chatId, `❌ ${result.error}`);
      return;
    }

    // Show transcription
    await sendMessage(token, chatId, `📝 <b>Transkript:</b>\n<i>"${result.text}"</i>`);

    // Process transcribed text with LLM
    await sendTypingAction(token, chatId);
    const response = await telegramLLMService.chat(bot.id, chatId, result.text);
    await sendMessage(token, chatId, response);
  } catch (error) {
    logger.error('Voice message error:', error);
    await sendMessage(token, chatId, `❌ Fehler bei der Sprachverarbeitung: ${error.message}`);
  }
}

// Validation constants
const MAX_MESSAGE_LENGTH = parseInt(process.env.TELEGRAM_MAX_MESSAGE_LENGTH) || 4096;

/**
 * Check if user is allowed to use the bot
 * @param {Object} bot - Bot object
 * @param {number} userId - Telegram user ID
 * @returns {Promise<boolean>}
 */
async function isUserAllowed(bot, userId) {
  try {
    const result = await database.query(
      `SELECT restrict_users, allowed_users FROM telegram_bots WHERE id = $1`,
      [bot.id]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const { restrict_users, allowed_users } = result.rows[0];

    // If restrictions not enabled, allow all
    if (!restrict_users) {
      return true;
    }

    // Check if user is in allowed list
    const allowedList = allowed_users || [];
    return allowedList.includes(userId) || allowedList.includes(String(userId));
  } catch (error) {
    // If table/column doesn't exist yet, allow all
    if (error.message.includes('does not exist')) {
      return true;
    }
    logger.error('Error checking user access:', error);
    return true; // Fail open
  }
}

/**
 * Process a Telegram update
 * @param {number} botId - Bot ID
 * @param {Object} update - Telegram update object
 * @returns {Promise<boolean>} Success
 */
async function processUpdate(botId, update) {
  const startTime = Date.now();

  // Basic update validation
  if (!update) {
    logger.error(`Received null/undefined update for bot ${botId}`);
    return false;
  }

  logger.debug(`Processing update for bot ${botId}:`, {
    updateId: update.update_id,
    hasMessage: !!update.message,
    hasCallbackQuery: !!update.callback_query
  });

  // Get bot token
  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    logger.error(`No token found for bot ${botId}`);
    return false;
  }

  // Get bot info
  const botResult = await database.query(`SELECT id, name, is_active FROM telegram_bots WHERE id = $1`, [botId]);

  if (botResult.rows.length === 0 || !botResult.rows[0].is_active) {
    logger.warn(`Bot ${botId} not found or inactive`);
    return false;
  }

  const bot = botResult.rows[0];

  // Handle message
  if (update.message) {
    const message = update.message;

    // Validate message structure
    const validation = validateTelegramMessage(message);
    if (!validation.valid) {
      logger.error(`Invalid message structure for bot ${botId}: ${validation.error}`, {
        updateId: update.update_id,
        messageKeys: Object.keys(message || {})
      });
      return false;
    }

    const chatId = validation.chatId;
    const userId = message.from?.id;

    logger.debug(`Processing message from chat ${chatId}:`, {
      userId,
      hasText: !!message.text,
      hasVoice: !!message.voice,
      textPreview: message.text?.substring(0, 50)
    });

    // Check user whitelist (skip for /start command to allow new users to register)
    const isStartCommand = message.text?.trim().toLowerCase().startsWith('/start');
    if (!isStartCommand && !(await isUserAllowed(bot, userId))) {
      logger.warn(`User ${userId} not allowed for bot ${botId}`);
      await sendMessage(token, chatId, '⛔ Du bist nicht berechtigt, diesen Bot zu nutzen.');
      return false;
    }

    // Handle text messages
    if (message.text) {
      const text = message.text.trim();

      // Input validation: message length
      if (text.length > MAX_MESSAGE_LENGTH) {
        await sendMessage(
          token,
          chatId,
          `⚠️ Nachricht zu lang (${text.length}/${MAX_MESSAGE_LENGTH} Zeichen). Bitte kuerze deine Nachricht.`
        );
        return false;
      }

      // Check for commands
      if (text.startsWith('/')) {
        const parts = text.slice(1).split(' ');
        const command = parts[0].toLowerCase().split('@')[0]; // Remove @botname suffix
        const args = parts.slice(1).join(' ');

        // Built-in commands
        switch (command) {
          case 'start':
            await handleStartCommand(bot, token, message);
            break;
          case 'help':
            await handleHelpCommand(bot, token, message);
            break;
          case 'new':
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
          case 'apikey':
            await handleApiKeyCommand(bot, token, message, args);
            break;
          default:
            // Try custom command
            await handleCustomCommand(bot, token, message, command, args);
        }
      } else {
        // Regular text message -> LLM
        await handleTextMessage(bot, token, message);
      }
    }

    // Handle voice messages
    if (message.voice) {
      await handleVoiceMessage(bot, token, message);
    }

    // Update last message timestamp
    await telegramBotService.updateLastMessage(botId);

    // Log processing time
    const duration = Date.now() - startTime;
    logger.info(`Update ${update.update_id} processed for bot ${botId} in ${duration}ms`);
  }

  return true;
}

/**
 * Set webhook for a bot
 * @param {number} botId - Bot ID
 * @param {string} webhookUrl - Full webhook URL
 * @returns {Promise<boolean>} Success
 */
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
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description || 'Failed to set webhook');
    }

    // Update webhook URL in database
    await database.query(`UPDATE telegram_bots SET webhook_url = $1 WHERE id = $2`, [webhookUrl, botId]);

    logger.info(`Webhook set for bot ${botId}: ${webhookUrl}`);
    return true;
  } catch (error) {
    logger.error('Error setting webhook:', error);
    throw error;
  }
}

/**
 * Delete webhook for a bot
 * @param {number} botId - Bot ID
 * @returns {Promise<boolean>} Success
 */
async function deleteWebhook(botId) {
  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    throw new Error('Bot token not found');
  }

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/deleteWebhook`, {
      method: 'POST',
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description || 'Failed to delete webhook');
    }

    // Clear webhook URL in database
    await database.query(`UPDATE telegram_bots SET webhook_url = NULL WHERE id = $1`, [botId]);

    logger.info(`Webhook deleted for bot ${botId}`);
    return true;
  } catch (error) {
    logger.error('Error deleting webhook:', error);
    throw error;
  }
}

/**
 * Get webhook info for a bot
 * @param {number} botId - Bot ID
 * @returns {Promise<Object>} Webhook info
 */
async function getWebhookInfo(botId) {
  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    throw new Error('Bot token not found');
  }

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/getWebhookInfo`);
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

/**
 * Send a test message
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 * @param {string} text - Message text
 * @returns {Promise<Object>} Sent message
 */
async function sendTestMessage(botId, chatId, text) {
  const token = await telegramBotService.getBotToken(botId);
  if (!token) {
    throw new Error('Bot token not found');
  }

  return sendMessage(token, chatId, text);
}

module.exports = {
  // Update processing
  processUpdate,

  // Webhook management
  setWebhook,
  deleteWebhook,
  getWebhookInfo,

  // Messaging
  sendMessage,
  sendTypingAction,
  sendTestMessage,
};
