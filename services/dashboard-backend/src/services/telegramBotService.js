/**
 * Telegram Multi-Bot Service
 * Manages multiple Telegram bots per user with CRUD operations
 *
 * Features:
 * - Create, read, update, delete bots
 * - Encrypted token storage (AES-256-GCM)
 * - Custom commands per bot
 * - Chat management per bot
 * - LLM provider configuration (Ollama/Claude)
 */

const database = require('../database');
const logger = require('../utils/logger');
const cryptoService = require('./cryptoService');
const crypto = require('crypto');

// Telegram API base URL
const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Validate a Telegram bot token by calling getMe API
 * @param {string} token - Bot token to validate
 * @returns {Promise<Object|null>} Bot info or null if invalid
 */
async function validateBotToken(token) {
  try {
    const response = await fetch(`${TELEGRAM_API}${token}/getMe`);
    const data = await response.json();

    if (data.ok) {
      return {
        id: data.result.id,
        username: data.result.username,
        firstName: data.result.first_name,
        canJoinGroups: data.result.can_join_groups,
        canReadAllGroupMessages: data.result.can_read_all_group_messages,
        supportsInlineQueries: data.result.supports_inline_queries,
      };
    }
    return null;
  } catch (error) {
    logger.error('Error validating bot token:', error);
    return null;
  }
}

/**
 * Get all bots for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} List of bots
 */
async function getBotsByUser(userId) {
  const result = await database.query(
    `SELECT
      b.id, b.name, b.bot_username, b.llm_provider, b.llm_model,
      b.is_active, b.created_at, b.updated_at, b.last_message_at,
      b.system_prompt,
      (SELECT COUNT(*) FROM telegram_bot_commands WHERE bot_id = b.id AND is_enabled = true) as command_count,
      (SELECT COUNT(*) FROM telegram_bot_chats WHERE bot_id = b.id AND is_active = true) as chat_count
    FROM telegram_bots b
    WHERE b.user_id = $1
    ORDER BY b.created_at DESC`,
    [userId]
  );

  return result.rows.map((bot) => ({
    id: bot.id,
    name: bot.name,
    username: bot.bot_username,
    llmProvider: bot.llm_provider,
    llmModel: bot.llm_model,
    isActive: bot.is_active,
    systemPrompt: bot.system_prompt,
    commandCount: parseInt(bot.command_count) || 0,
    chatCount: parseInt(bot.chat_count) || 0,
    createdAt: bot.created_at,
    updatedAt: bot.updated_at,
    lastMessageAt: bot.last_message_at,
  }));
}

/**
 * Get a single bot by ID
 * @param {number} botId - Bot ID
 * @param {number} userId - User ID (for authorization)
 * @returns {Promise<Object|null>} Bot details or null
 */
async function getBotById(botId, userId) {
  const result = await database.query(
    `SELECT
      b.*,
      (SELECT COUNT(*) FROM telegram_bot_commands WHERE bot_id = b.id) as command_count,
      (SELECT COUNT(*) FROM telegram_bot_chats WHERE bot_id = b.id) as chat_count
    FROM telegram_bots b
    WHERE b.id = $1 AND b.user_id = $2`,
    [botId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const bot = result.rows[0];

  // Check if Claude API key is set (don't return the actual key)
  const hasClaudeKey = !!(bot.claude_api_key_encrypted && bot.claude_api_key_iv && bot.claude_api_key_tag);

  return {
    id: bot.id,
    name: bot.name,
    username: bot.bot_username,
    llmProvider: bot.llm_provider,
    llmModel: bot.llm_model,
    systemPrompt: bot.system_prompt,
    isActive: bot.is_active,
    isPolling: bot.is_polling,
    hasClaudeKey,
    commandCount: parseInt(bot.command_count) || 0,
    chatCount: parseInt(bot.chat_count) || 0,
    createdAt: bot.created_at,
    updatedAt: bot.updated_at,
    lastMessageAt: bot.last_message_at,
    webhookUrl: bot.webhook_url,
  };
}

/**
 * Create a new bot
 * @param {number} userId - User ID
 * @param {Object} botData - Bot configuration
 * @returns {Promise<Object>} Created bot
 */
async function createBot(userId, botData) {
  const { name, token, llmProvider = 'ollama', llmModel, systemPrompt, claudeApiKey } = botData;

  // Validate token format
  if (!cryptoService.isValidTokenFormat(token)) {
    throw new Error('Ungültiges Bot-Token Format');
  }

  // Validate token with Telegram API
  const botInfo = await validateBotToken(token);
  if (!botInfo) {
    throw new Error('Bot-Token ist ungültig oder Bot nicht erreichbar');
  }

  // Encrypt the bot token
  const { encrypted, iv, authTag } = cryptoService.encrypt(token);

  // Encrypt Claude API key if provided
  let claudeEncrypted = null,
    claudeIv = null,
    claudeTag = null;
  if (claudeApiKey) {
    const claudeCrypto = cryptoService.encrypt(claudeApiKey);
    claudeEncrypted = claudeCrypto.encrypted;
    claudeIv = claudeCrypto.iv;
    claudeTag = claudeCrypto.authTag;
  }

  // Generate webhook secret
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  const result = await database.query(
    `INSERT INTO telegram_bots (
      user_id, name, bot_username,
      bot_token_encrypted, bot_token_iv, bot_token_tag,
      llm_provider, llm_model, system_prompt,
      claude_api_key_encrypted, claude_api_key_iv, claude_api_key_tag,
      webhook_secret
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, name, bot_username, llm_provider, llm_model, is_active, created_at`,
    [
      userId,
      name,
      botInfo.username,
      Buffer.from(encrypted, 'hex'),
      iv,
      authTag,
      llmProvider,
      llmModel || null,
      systemPrompt || 'Du bist ein hilfreicher Assistent. Antworte freundlich und auf Deutsch.',
      claudeEncrypted ? Buffer.from(claudeEncrypted, 'hex') : null,
      claudeIv,
      claudeTag,
      webhookSecret,
    ]
  );

  const bot = result.rows[0];

  logger.info(`Bot created: ${bot.name} (@${bot.bot_username}) for user ${userId}`);

  return {
    id: bot.id,
    name: bot.name,
    username: bot.bot_username,
    llmProvider: bot.llm_provider,
    llmModel: bot.llm_model,
    isActive: bot.is_active,
    createdAt: bot.created_at,
  };
}

/**
 * Update a bot
 * @param {number} botId - Bot ID
 * @param {number} userId - User ID (for authorization)
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated bot
 */
async function updateBot(botId, userId, updates) {
  const { name, llmProvider, llmModel, systemPrompt, claudeApiKey, token } = updates;

  // Build dynamic update query
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  if (name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(name);
  }

  if (llmProvider !== undefined) {
    setClauses.push(`llm_provider = $${paramIndex++}`);
    values.push(llmProvider);
  }

  if (llmModel !== undefined) {
    setClauses.push(`llm_model = $${paramIndex++}`);
    values.push(llmModel);
  }

  if (systemPrompt !== undefined) {
    setClauses.push(`system_prompt = $${paramIndex++}`);
    values.push(systemPrompt);
  }

  // Handle Claude API key update
  if (claudeApiKey !== undefined) {
    if (claudeApiKey === null || claudeApiKey === '') {
      // Remove Claude API key
      setClauses.push(`claude_api_key_encrypted = NULL`);
      setClauses.push(`claude_api_key_iv = NULL`);
      setClauses.push(`claude_api_key_tag = NULL`);
    } else {
      // Encrypt and store new key
      const { encrypted, iv, authTag } = cryptoService.encrypt(claudeApiKey);
      setClauses.push(`claude_api_key_encrypted = $${paramIndex++}`);
      values.push(Buffer.from(encrypted, 'hex'));
      setClauses.push(`claude_api_key_iv = $${paramIndex++}`);
      values.push(iv);
      setClauses.push(`claude_api_key_tag = $${paramIndex++}`);
      values.push(authTag);
    }
  }

  // Handle token update
  if (token !== undefined) {
    if (!cryptoService.isValidTokenFormat(token)) {
      throw new Error('Ungültiges Bot-Token Format');
    }

    const botInfo = await validateBotToken(token);
    if (!botInfo) {
      throw new Error('Bot-Token ist ungültig');
    }

    const { encrypted, iv, authTag } = cryptoService.encrypt(token);
    setClauses.push(`bot_token_encrypted = $${paramIndex++}`);
    values.push(Buffer.from(encrypted, 'hex'));
    setClauses.push(`bot_token_iv = $${paramIndex++}`);
    values.push(iv);
    setClauses.push(`bot_token_tag = $${paramIndex++}`);
    values.push(authTag);
    setClauses.push(`bot_username = $${paramIndex++}`);
    values.push(botInfo.username);
  }

  if (setClauses.length === 0) {
    throw new Error('Keine Änderungen angegeben');
  }

  // Add WHERE clause parameters
  values.push(botId, userId);

  const result = await database.query(
    `UPDATE telegram_bots
    SET ${setClauses.join(', ')}, updated_at = NOW()
    WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
    RETURNING id, name, bot_username, llm_provider, llm_model, system_prompt, is_active`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Bot nicht gefunden');
  }

  const bot = result.rows[0];
  logger.info(`Bot updated: ${bot.id} (${bot.name})`);

  return {
    id: bot.id,
    name: bot.name,
    username: bot.bot_username,
    llmProvider: bot.llm_provider,
    llmModel: bot.llm_model,
    systemPrompt: bot.system_prompt,
    isActive: bot.is_active,
  };
}

/**
 * Delete a bot
 * @param {number} botId - Bot ID
 * @param {number} userId - User ID (for authorization)
 * @returns {Promise<boolean>} Success
 */
async function deleteBot(botId, userId) {
  const result = await database.query(`DELETE FROM telegram_bots WHERE id = $1 AND user_id = $2 RETURNING id, name`, [
    botId,
    userId,
  ]);

  if (result.rows.length === 0) {
    throw new Error('Bot nicht gefunden');
  }

  logger.info(`Bot deleted: ${result.rows[0].id} (${result.rows[0].name})`);
  return true;
}

/**
 * Activate a bot (start polling/webhook)
 * @param {number} botId - Bot ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Updated bot
 */
async function activateBot(botId, userId) {
  const result = await database.query(
    `UPDATE telegram_bots
    SET is_active = true, updated_at = NOW()
    WHERE id = $1 AND user_id = $2
    RETURNING id, name, is_active`,
    [botId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Bot nicht gefunden');
  }

  logger.info(`Bot activated: ${result.rows[0].id} (${result.rows[0].name})`);
  return result.rows[0];
}

/**
 * Deactivate a bot (stop polling/webhook)
 * @param {number} botId - Bot ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Updated bot
 */
async function deactivateBot(botId, userId) {
  const result = await database.query(
    `UPDATE telegram_bots
    SET is_active = false, is_polling = false, updated_at = NOW()
    WHERE id = $1 AND user_id = $2
    RETURNING id, name, is_active`,
    [botId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Bot nicht gefunden');
  }

  logger.info(`Bot deactivated: ${result.rows[0].id} (${result.rows[0].name})`);
  return result.rows[0];
}

/**
 * Get decrypted bot token (internal use only)
 * @param {number} botId - Bot ID
 * @returns {Promise<string|null>} Decrypted token
 */
async function getBotToken(botId) {
  const result = await database.query(
    `SELECT bot_token_encrypted, bot_token_iv, bot_token_tag FROM telegram_bots WHERE id = $1`,
    [botId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const { bot_token_encrypted, bot_token_iv, bot_token_tag } = result.rows[0];

  try {
    return cryptoService.decrypt(bot_token_encrypted.toString('hex'), bot_token_iv, bot_token_tag);
  } catch (error) {
    logger.error(`Failed to decrypt bot token for bot ${botId}:`, error);
    return null;
  }
}

/**
 * Get decrypted Claude API key (internal use only)
 * @param {number} botId - Bot ID
 * @returns {Promise<string|null>} Decrypted API key
 */
async function getClaudeApiKey(botId) {
  const result = await database.query(
    `SELECT claude_api_key_encrypted, claude_api_key_iv, claude_api_key_tag FROM telegram_bots WHERE id = $1`,
    [botId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const { claude_api_key_encrypted, claude_api_key_iv, claude_api_key_tag } = result.rows[0];

  if (!claude_api_key_encrypted) {
    return null;
  }

  try {
    return cryptoService.decrypt(claude_api_key_encrypted.toString('hex'), claude_api_key_iv, claude_api_key_tag);
  } catch (error) {
    logger.error(`Failed to decrypt Claude API key for bot ${botId}:`, error);
    return null;
  }
}

// ============================================================================
// CUSTOM COMMANDS
// ============================================================================

/**
 * Get all commands for a bot
 * @param {number} botId - Bot ID
 * @returns {Promise<Array>} List of commands
 */
async function getCommands(botId) {
  const result = await database.query(
    `SELECT id, command, description, prompt, is_enabled, sort_order, usage_count, last_used_at
    FROM telegram_bot_commands
    WHERE bot_id = $1
    ORDER BY sort_order ASC, command ASC`,
    [botId]
  );

  return result.rows.map((cmd) => ({
    id: cmd.id,
    command: cmd.command,
    description: cmd.description,
    prompt: cmd.prompt,
    isEnabled: cmd.is_enabled,
    sortOrder: cmd.sort_order,
    usageCount: cmd.usage_count,
    lastUsedAt: cmd.last_used_at,
  }));
}

/**
 * Create a new command
 * @param {number} botId - Bot ID
 * @param {Object} commandData - Command configuration
 * @returns {Promise<Object>} Created command
 */
async function createCommand(botId, commandData) {
  const { command, description, prompt, sortOrder = 0 } = commandData;

  // Validate command format (alphanumeric, lowercase, max 32 chars)
  const cleanCommand = command.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (cleanCommand.length === 0 || cleanCommand.length > 32) {
    throw new Error('Command muss 1-32 alphanumerische Zeichen sein');
  }

  const result = await database.query(
    `INSERT INTO telegram_bot_commands (bot_id, command, description, prompt, sort_order)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, command, description, prompt, is_enabled, sort_order`,
    [botId, cleanCommand, description, prompt, sortOrder]
  );

  logger.info(`Command created: /${cleanCommand} for bot ${botId}`);
  return result.rows[0];
}

/**
 * Update a command
 * @param {number} commandId - Command ID
 * @param {number} botId - Bot ID (for authorization)
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated command
 */
async function updateCommand(commandId, botId, updates) {
  const { command, description, prompt, isEnabled, sortOrder } = updates;

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  if (command !== undefined) {
    const cleanCommand = command.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setClauses.push(`command = $${paramIndex++}`);
    values.push(cleanCommand);
  }

  if (description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(description);
  }

  if (prompt !== undefined) {
    setClauses.push(`prompt = $${paramIndex++}`);
    values.push(prompt);
  }

  if (isEnabled !== undefined) {
    setClauses.push(`is_enabled = $${paramIndex++}`);
    values.push(isEnabled);
  }

  if (sortOrder !== undefined) {
    setClauses.push(`sort_order = $${paramIndex++}`);
    values.push(sortOrder);
  }

  if (setClauses.length === 0) {
    throw new Error('Keine Änderungen angegeben');
  }

  values.push(commandId, botId);

  const result = await database.query(
    `UPDATE telegram_bot_commands
    SET ${setClauses.join(', ')}, updated_at = NOW()
    WHERE id = $${paramIndex++} AND bot_id = $${paramIndex}
    RETURNING id, command, description, prompt, is_enabled, sort_order`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Command nicht gefunden');
  }

  return result.rows[0];
}

/**
 * Delete a command
 * @param {number} commandId - Command ID
 * @param {number} botId - Bot ID (for authorization)
 * @returns {Promise<boolean>} Success
 */
async function deleteCommand(commandId, botId) {
  const result = await database.query(
    `DELETE FROM telegram_bot_commands WHERE id = $1 AND bot_id = $2 RETURNING command`,
    [commandId, botId]
  );

  if (result.rows.length === 0) {
    throw new Error('Command nicht gefunden');
  }

  logger.info(`Command deleted: /${result.rows[0].command}`);
  return true;
}

// ============================================================================
// CHATS
// ============================================================================

/**
 * Get all chats for a bot
 * @param {number} botId - Bot ID
 * @returns {Promise<Array>} List of chats
 */
async function getChats(botId) {
  const result = await database.query(
    `SELECT id, chat_id, chat_title, chat_type, chat_username, is_active, is_admin, added_at, last_message_at
    FROM telegram_bot_chats
    WHERE bot_id = $1
    ORDER BY last_message_at DESC NULLS LAST`,
    [botId]
  );

  return result.rows.map((chat) => ({
    id: chat.id,
    chatId: chat.chat_id,
    title: chat.chat_title,
    type: chat.chat_type,
    username: chat.chat_username,
    isActive: chat.is_active,
    isAdmin: chat.is_admin,
    addedAt: chat.added_at,
    lastMessageAt: chat.last_message_at,
  }));
}

/**
 * Add a chat to a bot
 * @param {number} botId - Bot ID
 * @param {Object} chatData - Chat info
 * @returns {Promise<Object>} Added chat
 */
async function addChat(botId, chatData) {
  const { chatId, title, type = 'private', username } = chatData;

  const result = await database.query(
    `INSERT INTO telegram_bot_chats (bot_id, chat_id, chat_title, chat_type, chat_username)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (bot_id, chat_id) DO UPDATE
    SET chat_title = COALESCE(EXCLUDED.chat_title, telegram_bot_chats.chat_title),
        chat_type = EXCLUDED.chat_type,
        is_active = true,
        last_message_at = NOW()
    RETURNING id, chat_id, chat_title, chat_type, is_active`,
    [botId, chatId, title, type, username]
  );

  return result.rows[0];
}

/**
 * Remove a chat from a bot
 * @param {number} chatRowId - Chat row ID
 * @param {number} botId - Bot ID (for authorization)
 * @returns {Promise<boolean>} Success
 */
async function removeChat(chatRowId, botId) {
  const result = await database.query(
    `DELETE FROM telegram_bot_chats WHERE id = $1 AND bot_id = $2 RETURNING chat_id`,
    [chatRowId, botId]
  );

  if (result.rows.length === 0) {
    throw new Error('Chat nicht gefunden');
  }

  return true;
}

/**
 * Get bot by webhook secret (for webhook validation)
 * @param {number} botId - Bot ID
 * @param {string} secret - Webhook secret
 * @returns {Promise<Object|null>} Bot if valid, null otherwise
 */
async function getBotByWebhookSecret(botId, secret) {
  const result = await database.query(
    `SELECT id, name, bot_username, llm_provider, llm_model, system_prompt, is_active
    FROM telegram_bots
    WHERE id = $1 AND webhook_secret = $2 AND is_active = true`,
    [botId, secret]
  );

  return result.rows[0] || null;
}

/**
 * Get all active bots (for polling manager)
 * @returns {Promise<Array>} List of active bots
 */
async function getActiveBots() {
  const result = await database.query(
    `SELECT id, name, bot_username, llm_provider, llm_model, system_prompt, is_polling
    FROM telegram_bots
    WHERE is_active = true`
  );

  return result.rows;
}

/**
 * Update bot's last message timestamp
 * @param {number} botId - Bot ID
 */
async function updateLastMessage(botId) {
  await database.query(`UPDATE telegram_bots SET last_message_at = NOW() WHERE id = $1`, [botId]);
}

module.exports = {
  // Bot CRUD
  getBotsByUser,
  getBotById,
  createBot,
  updateBot,
  deleteBot,
  activateBot,
  deactivateBot,
  validateBotToken,

  // Token access (internal)
  getBotToken,
  getClaudeApiKey,

  // Commands
  getCommands,
  createCommand,
  updateCommand,
  deleteCommand,

  // Chats
  getChats,
  addChat,
  removeChat,

  // Webhook
  getBotByWebhookSecret,

  // Polling
  getActiveBots,
  updateLastMessage,
};
