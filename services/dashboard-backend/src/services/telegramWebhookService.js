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

// Telegram API
const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Send a message via Telegram API
 * @param {string} token - Bot token
 * @param {number} chatId - Chat ID
 * @param {string} text - Message text
 * @param {Object} options - Additional options (parse_mode, etc.)
 * @returns {Promise<Object>} Telegram API response
 */
async function sendMessage(token, chatId, text, options = {}) {
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
      logger.error('Telegram sendMessage error:', data);
      throw new Error(data.description || 'Failed to send message');
    }

    return data.result;
  } catch (error) {
    logger.error('Error sending Telegram message:', error);
    throw error;
  }
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
 */
async function handleStartCommand(bot, token, message) {
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const chatTitle = message.chat.title || message.from.first_name;
  const chatUsername = message.chat.username || message.from.username;

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

Wie kann ich dir helfen?`;

  await sendMessage(token, chatId, welcomeText);
  logger.info(`Chat registered: ${chatId} for bot ${bot.id}`);
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
/services - Docker-Services anzeigen`;

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
 * Process a Telegram update
 * @param {number} botId - Bot ID
 * @param {Object} update - Telegram update object
 * @returns {Promise<boolean>} Success
 */
async function processUpdate(botId, update) {
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

    // Handle text messages
    if (message.text) {
      const text = message.text.trim();

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
          default:
            // Try custom command
            await handleCustomCommand(bot, token, message, command, args);
        }
      } else {
        // Regular text message -> LLM
        await handleTextMessage(bot, token, message);
      }
    }

    // Update last message timestamp
    await telegramBotService.updateLastMessage(botId);
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
