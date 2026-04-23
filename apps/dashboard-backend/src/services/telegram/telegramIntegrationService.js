/**
 * Telegram Integration Service
 *
 * Consolidated service for LLM and Telegram App lifecycle:
 * - LLM conversations (Ollama + Claude)
 * - Telegram App lifecycle (dashboard icon, settings)
 *
 * Voice handling is in telegramVoiceService.js
 * Rate limiting is in telegramRateLimitService.js
 *
 * Consolidated from (now deleted):
 *   telegramLLMService.js       - LLM integration
 *   telegramAppService.js       - app integration
 */

// =============================================================================
// Dependencies
// =============================================================================

const database = require('../../database');
const logger = require('../../utils/logger');
const telegramBotService = require('./telegramBotService');
const services = require('../../config/services');
const toolRegistry = require('../../tools');
const telegramRagService = require('./telegramRagService');

// Extracted modules
const {
  isVoiceEnabled,
  processVoiceMessage,
  cleanupOldFiles,
  MAX_VOICE_DURATION_SECONDS,
} = require('./telegramVoiceService');

const {
  checkRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  clearCache,
  DEFAULT_MAX_PER_MINUTE,
  DEFAULT_MAX_PER_HOUR,
} = require('./telegramRateLimitService');

// =============================================================================
// LLM Constants
// =============================================================================

const OLLAMA_URL = services.llm?.url || process.env.OLLAMA_URL || 'http://llm-service:11434';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_OLLAMA_MODEL = process.env.DEFAULT_OLLAMA_MODEL || 'llama3.1:8b';
const DEFAULT_CLAUDE_MODEL = process.env.DEFAULT_CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
const MAX_CONTEXT_TOKENS = parseInt(process.env.TELEGRAM_MAX_CONTEXT_TOKENS || '4096');
const MAX_RESPONSE_TOKENS = parseInt(process.env.TELEGRAM_MAX_RESPONSE_TOKENS || '1024');

// =============================================================================
// LLM Section
// =============================================================================

/**
 * Estimate token count (rough approximation: 4 chars = 1 token)
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

/**
 * Get or create a session for a bot+chat
 * @param {number} botId - Bot ID
 * @param {number} chatId - Telegram chat ID
 * @returns {Promise<Object>} Session with messages
 */
async function getOrCreateSession(botId, chatId) {
  let result = await database.query(
    `SELECT id, messages, token_count FROM telegram_bot_sessions WHERE bot_id = $1 AND chat_id = $2`,
    [botId, chatId]
  );

  if (result.rows.length > 0) {
    return {
      id: result.rows[0].id,
      messages: result.rows[0].messages || [],
      tokenCount: result.rows[0].token_count || 0,
    };
  }

  result = await database.query(
    `INSERT INTO telegram_bot_sessions (bot_id, chat_id, messages, token_count)
    VALUES ($1, $2, '[]'::jsonb, 0)
    RETURNING id, messages, token_count`,
    [botId, chatId]
  );

  return {
    id: result.rows[0].id,
    messages: [],
    tokenCount: 0,
  };
}

/**
 * Add message to session and trim if needed
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 */
const MAX_SESSION_MESSAGES = 100;

async function addMessageToSession(botId, chatId, role, content) {
  const tokens = estimateTokens(content);

  const message = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };

  await database.query(
    `UPDATE telegram_bot_sessions
    SET messages = (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      FROM (
        SELECT elem FROM jsonb_array_elements(messages || $3::jsonb) AS elem
        ORDER BY elem->>'timestamp' ASC
        OFFSET GREATEST(0, jsonb_array_length(messages || $3::jsonb) - $5)
      ) sub
    ),
        token_count = token_count + $4,
        updated_at = NOW()
    WHERE bot_id = $1 AND chat_id = $2`,
    [botId, chatId, JSON.stringify(message), tokens, MAX_SESSION_MESSAGES]
  );
}

/**
 * Clear session messages (for /new command)
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 */
async function clearSession(botId, chatId) {
  await database.query(
    `UPDATE telegram_bot_sessions
    SET messages = '[]'::jsonb, token_count = 0, updated_at = NOW()
    WHERE bot_id = $1 AND chat_id = $2`,
    [botId, chatId]
  );

  logger.info(`Session cleared for bot ${botId}, chat ${chatId}`);
}

/**
 * Get context messages for LLM (trimmed to fit token limit)
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 * @param {string} systemPrompt - System prompt
 * @returns {Promise<Array>} Messages array for LLM
 */
async function getContextMessages(botId, chatId, systemPrompt) {
  const session = await getOrCreateSession(botId, chatId);
  const messages = session.messages || [];

  const systemTokens = estimateTokens(systemPrompt);
  const availableTokens = MAX_CONTEXT_TOKENS - systemTokens - MAX_RESPONSE_TOKENS;

  let totalTokens = 0;
  const trimmedMessages = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content);

    if (totalTokens + msgTokens > availableTokens) {
      break;
    }

    trimmedMessages.unshift({ role: msg.role, content: msg.content });
    totalTokens += msgTokens;
  }

  return trimmedMessages;
}

/**
 * Chat with Ollama (supports native function calling)
 * @param {Object} bot - Bot configuration
 * @param {Array} messages - Conversation messages
 * @param {string} systemPrompt - System prompt
 * @param {Object} options - Options
 * @returns {Promise<string>} Response content
 */
async function chatWithOllama(bot, messages, systemPrompt, options = {}) {
  const { enableTools = false } = options;
  const model = bot.llm_model || DEFAULT_OLLAMA_MODEL;

  const ollamaMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const requestBody = {
    model,
    messages: ollamaMessages,
    stream: false,
    options: {
      num_predict: MAX_RESPONSE_TOKENS,
    },
  };

  if (enableTools) {
    const toolDefs = await toolRegistry.getOllamaToolDefinitions();
    if (toolDefs.length > 0) {
      requestBody.tools = toolDefs;
    }
  }

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error: ${error}`);
    }

    const data = await response.json();
    const msg = data.message;

    // Handle native tool calls from Ollama
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      const context = { botId: bot.id };
      const { messages: toolMessages } = await toolRegistry.processNativeToolCalls(
        msg.tool_calls,
        context
      );

      const followUpMessages = [...ollamaMessages, msg, ...toolMessages];

      const followUpResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: followUpMessages,
          stream: false,
          options: { num_predict: MAX_RESPONSE_TOKENS },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!followUpResponse.ok) {
        const toolOutputs = toolMessages.map(m => m.content).join('\n\n---\n');
        return (msg.content || '') + '\n\n' + toolOutputs;
      }

      const followUpData = await followUpResponse.json();
      return followUpData.message?.content || 'Keine Antwort erhalten.';
    }

    return msg?.content || 'Keine Antwort erhalten.';
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      logger.error(`Ollama timeout for bot ${bot.id} model ${bot.llm_model}`);
      throw new Error(
        'LLM-Zeitüberschreitung (90s). Bitte versuche es erneut oder wähle ein kleineres Modell.'
      );
    }
    logger.error('Ollama chat error:', error);
    throw new Error(`LLM-Fehler: ${error.message}`);
  }
}

/**
 * Chat with Claude
 * @param {Object} bot - Bot configuration
 * @param {Array} messages - Conversation messages
 * @param {string} systemPrompt - System prompt
 * @param {string} apiKey - Claude API key
 * @returns {Promise<string>} Response content
 */
async function chatWithClaude(bot, messages, systemPrompt, apiKey) {
  const model = bot.llm_model || DEFAULT_CLAUDE_MODEL;

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_RESPONSE_TOKENS,
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 401) {
        throw new Error('Ungültiger Claude API-Key');
      }
      if (response.status === 429) {
        throw new Error('Claude Rate-Limit erreicht. Bitte warte kurz.');
      }
      throw new Error(`Claude error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || 'Keine Antwort erhalten.';
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      logger.error(`Claude timeout for bot ${bot.id}`);
      throw new Error('Claude-Zeitüberschreitung (60s). Bitte versuche es erneut.');
    }
    logger.error('Claude chat error:', error);
    throw error;
  }
}

/**
 * Build enhanced system prompt with tools
 * @param {string} basePrompt - Bot's base system prompt
 * @returns {Promise<string>} Enhanced system prompt
 */
async function buildSystemPrompt(basePrompt) {
  const toolsPrompt = await toolRegistry.generateToolsPrompt();

  if (!toolsPrompt) {
    return basePrompt;
  }

  return `${basePrompt}\n\n${toolsPrompt}`;
}

/**
 * Main chat function - routes to appropriate provider
 * @param {number} botId - Bot ID
 * @param {number} chatId - Telegram chat ID
 * @param {string} userMessage - User's message
 * @param {Object} options - Additional options
 * @returns {Promise<string>} Assistant's response
 */
async function chat(botId, chatId, userMessage, options = {}) {
  const { enableTools: enableToolsOverride, skipRateLimit = false } = options;

  // Check rate limit
  if (!skipRateLimit) {
    const rateLimit = await checkRateLimit(botId, chatId);
    if (!rateLimit.allowed) {
      const waitTime = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      throw new Error(`Rate-Limit erreicht. Bitte warte ${waitTime} Sekunden.`);
    }
  }

  // Get bot configuration (including RAG fields and capabilities)
  const botResult = await database.query(
    `SELECT id, name, llm_provider, llm_model, system_prompt,
            rag_enabled, rag_space_ids, rag_show_sources, rag_context_limit,
            tools_enabled, voice_enabled, max_context_tokens, max_response_tokens
     FROM telegram_bots WHERE id = $1`,
    [botId]
  );

  if (botResult.rows.length === 0) {
    throw new Error('Bot nicht gefunden');
  }

  const bot = botResult.rows[0];
  const enableTools =
    enableToolsOverride !== undefined ? enableToolsOverride : bot.tools_enabled !== false;
  const baseSystemPrompt = bot.system_prompt || 'Du bist ein hilfreicher Assistent.';

  // RAG enrichment: inject document context into system prompt
  let ragResult = { context: null, sources: [], sourceText: null };
  if (bot.rag_enabled) {
    ragResult = await telegramRagService.enrichWithRAG(userMessage, bot);
    if (ragResult.ragError) {
      logger.warn(
        `[TG] Bot ${botId}: RAG enrichment failed, answering without context: ${ragResult.ragError}`
      );
    }
  }

  // Build system prompt: base + RAG context + tools
  let enrichedPrompt = baseSystemPrompt;
  if (ragResult.context) {
    enrichedPrompt += `\n\n--- Relevanter Kontext aus Dokumenten ---\n${ragResult.context}\n--- Ende Kontext ---\n\nNutze den obigen Kontext, um die Frage zu beantworten. Wenn der Kontext nicht relevant ist, antworte basierend auf deinem Wissen.`;
  }
  const systemPrompt = enableTools ? await buildSystemPrompt(enrichedPrompt) : enrichedPrompt;

  // Ensure session exists
  await getOrCreateSession(botId, chatId);

  // Add user message to session
  await addMessageToSession(botId, chatId, 'user', userMessage);

  // Get context messages
  const contextMessages = await getContextMessages(botId, chatId, systemPrompt);

  let response;
  let usedNativeTools = false;

  if (bot.llm_provider === 'claude') {
    const apiKey = await telegramBotService.getClaudeApiKey(botId);
    if (!apiKey) {
      throw new Error(
        'Claude API-Key nicht konfiguriert. Bitte in den Bot-Einstellungen hinzufuegen.'
      );
    }
    response = await chatWithClaude(bot, contextMessages, systemPrompt, apiKey);
  } else {
    response = await chatWithOllama(bot, contextMessages, systemPrompt, { enableTools });
    usedNativeTools = enableTools;
  }

  // Text-based tool fallback (for Claude or when native tools miss a call)
  if (enableTools && !usedNativeTools) {
    const context = { botId, chatId };
    const toolResult = await toolRegistry.processToolCalls(response, context);

    if (toolResult.hasTools) {
      const toolOutputs = toolResult.results.map(r => `\n\n---\n${r.result}`).join('');
      response = toolResult.cleanResponse + toolOutputs;
      logger.debug(`Executed ${toolResult.results.length} tools (text-based) for bot ${botId}`);
    }
  }

  // Append RAG sources to response (if enabled and sources exist)
  const fullResponse = ragResult.sourceText ? response + ragResult.sourceText : response;

  // Add assistant response to session (without sources for cleaner context)
  await addMessageToSession(botId, chatId, 'assistant', response);

  // Update bot's last message timestamp
  await telegramBotService.updateLastMessage(botId);

  return fullResponse;
}

/**
 * Execute a custom command
 * @param {number} botId - Bot ID
 * @param {number} chatId - Telegram chat ID
 * @param {string} command - Command name (without /)
 * @param {string} args - Command arguments
 * @returns {Promise<string|null>} Response or null if command not found
 */
async function executeCommand(botId, chatId, command, args) {
  const cmdResult = await database.query(
    `SELECT id, prompt FROM telegram_bot_commands
    WHERE bot_id = $1 AND command = $2 AND is_enabled = true`,
    [botId, command.toLowerCase()]
  );

  if (cmdResult.rows.length === 0) {
    return null;
  }

  const cmd = cmdResult.rows[0];

  let prompt = cmd.prompt;
  if (args) {
    prompt = prompt.replace(/\{\{args\}\}/g, args);
    prompt = prompt.replace(/\{eingabe\}/g, args);
  } else {
    prompt = prompt.replace(/\{\{args\}\}/g, '');
    prompt = prompt.replace(/\{eingabe\}/g, '');
  }

  await database.query(
    `UPDATE telegram_bot_commands SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = $1`,
    [cmd.id]
  );

  return chat(botId, chatId, prompt);
}

/**
 * Get session info for a bot+chat
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} Session info
 */
async function getSessionInfo(botId, chatId) {
  const session = await getOrCreateSession(botId, chatId);

  return {
    messageCount: session.messages.length,
    tokenCount: session.tokenCount,
    maxTokens: MAX_CONTEXT_TOKENS,
    createdAt: session.messages[0]?.timestamp || null,
    lastMessageAt: session.messages[session.messages.length - 1]?.timestamp || null,
  };
}

/**
 * Get available Ollama models
 * @returns {Promise<Array>} List of models
 */
async function getOllamaModels() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch Ollama models');
    }

    const data = await response.json();
    return (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }));
  } catch (error) {
    logger.error('Error fetching Ollama models:', error);
    return [];
  }
}

/**
 * Get available Claude models
 * @returns {Array} List of Claude models
 */
function getClaudeModels() {
  return [
    { name: 'claude-3-5-sonnet-20241022', description: 'Claude 3.5 Sonnet (Latest)' },
    { name: 'claude-3-opus-20240229', description: 'Claude 3 Opus (Most capable)' },
    { name: 'claude-3-sonnet-20240229', description: 'Claude 3 Sonnet (Balanced)' },
    { name: 'claude-3-haiku-20240307', description: 'Claude 3 Haiku (Fast)' },
  ];
}

/**
 * Get available tools list
 * @returns {Promise<Array>} List of available tools with descriptions
 */
async function getAvailableTools() {
  const tools = await toolRegistry.getAvailable();
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Execute a tool directly
 * @param {string} toolName - Tool name
 * @param {Object} params - Tool parameters
 * @param {Object} context - Execution context
 * @returns {Promise<string>} Tool result
 */
function executeTool(toolName, params = {}, context = {}) {
  return toolRegistry.execute(toolName, params, context);
}

// =============================================================================
// App Section
// =============================================================================

class TelegramAppService {
  /**
   * Check if the Telegram app icon should be visible for a user
   * @param {number} userId - User ID
   * @returns {Promise<boolean>}
   */
  async isIconVisible(userId) {
    try {
      const result = await database.query(
        `SELECT icon_visible FROM telegram_app_status WHERE user_id = $1`,
        [userId]
      );
      return result.rows[0]?.icon_visible || false;
    } catch (error) {
      if (error.message.includes('does not exist')) {
        const botsResult = await database.query(
          `SELECT COUNT(*) as count FROM telegram_bots WHERE user_id = $1`,
          [userId]
        );
        return parseInt(botsResult.rows[0]?.count || 0) > 0;
      }
      logger.error('Error checking icon visibility:', error);
      return false;
    }
  }

  /**
   * Get comprehensive app status for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object>}
   */
  async getAppStatus(userId) {
    try {
      await database.query(`SELECT ensure_telegram_app_status($1)`, [userId]);

      const statusResult = await database.query(
        `
        SELECT
          is_enabled,
          icon_visible,
          first_bot_created_at,
          last_activity_at,
          settings
        FROM telegram_app_status
        WHERE user_id = $1
      `,
        [userId]
      );

      const botsResult = await database.query(
        `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = TRUE) as active
        FROM telegram_bots
        WHERE user_id = $1
      `,
        [userId]
      );

      const statsResult = await database.query(
        `
        SELECT
          COALESCE(SUM(c.chat_count), 0) as total_chats,
          COALESCE(SUM(b.message_count), 0) as total_messages
        FROM telegram_bots b
        LEFT JOIN (
          SELECT bot_id, COUNT(*) as chat_count
          FROM telegram_bot_chats
          WHERE is_active = TRUE
          GROUP BY bot_id
        ) c ON c.bot_id = b.id
        WHERE b.user_id = $1
      `,
        [userId]
      );

      const status = statusResult.rows[0] || {
        is_enabled: false,
        icon_visible: false,
        settings: {},
      };

      return {
        isEnabled: status.is_enabled,
        iconVisible: status.icon_visible,
        firstBotCreatedAt: status.first_bot_created_at,
        lastActivityAt: status.last_activity_at,
        settings: status.settings || {},
        botCount: {
          total: parseInt(botsResult.rows[0]?.total || 0),
          active: parseInt(botsResult.rows[0]?.active || 0),
        },
        stats: {
          totalChats: parseInt(statsResult.rows[0]?.total_chats || 0),
          totalMessages: parseInt(statsResult.rows[0]?.total_messages || 0),
        },
      };
    } catch (error) {
      if (error.message.includes('does not exist')) {
        logger.warn('telegram_app_status table not found, returning defaults');
        return {
          isEnabled: false,
          iconVisible: false,
          settings: {},
          botCount: { total: 0, active: 0 },
          stats: { totalChats: 0, totalMessages: 0 },
        };
      }
      logger.error('Error getting app status:', error);
      throw error;
    }
  }

  /**
   * Get data for dashboard icon display
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} App data or null if icon shouldn't show
   */
  async getDashboardAppData(userId) {
    try {
      const status = await this.getAppStatus(userId);

      let appInstalled = false;
      try {
        const installResult = await database.query(
          `SELECT status FROM app_installations WHERE app_id = 'telegram-bot' AND status NOT IN ('available', 'uninstalling')`
        );
        appInstalled = installResult.rows.length > 0;
      } catch {
        // Table might not exist, ignore
      }

      if (!appInstalled && !status.iconVisible && status.botCount.total === 0) {
        return null;
      }

      let description;
      if (status.botCount.active > 0) {
        description = `${status.botCount.active} aktive${status.botCount.active === 1 ? 'r' : ''} Bot${status.botCount.active !== 1 ? 's' : ''}`;
      } else if (status.botCount.total > 0) {
        description = `${status.botCount.total} Bot${status.botCount.total !== 1 ? 's' : ''} konfiguriert`;
      } else {
        description = 'Bot erstellen';
      }

      return {
        id: 'telegram-bot',
        name: 'Telegram Bot',
        description,
        icon: 'FiSend',
        status: status.botCount.active > 0 ? 'running' : 'installed',
        hasCustomPage: true,
        customPageRoute: '/telegram-app',
        badge: status.botCount.total > 0 ? status.botCount.total.toString() : null,
        stats: status.stats,
      };
    } catch (error) {
      logger.error('Error getting dashboard app data:', error);
      return null;
    }
  }

  /**
   * Activate the app for a user
   * @param {number} userId - User ID
   * @returns {Promise<boolean>}
   */
  async activateApp(userId) {
    try {
      await database.query(`SELECT activate_telegram_app($1)`, [userId]);
      logger.info(`Telegram App activated for user ${userId}`);
      return true;
    } catch (error) {
      if (error.message.includes('does not exist')) {
        await database.query(
          `
          INSERT INTO telegram_app_status (user_id, is_enabled, icon_visible)
          VALUES ($1, TRUE, TRUE)
          ON CONFLICT (user_id) DO UPDATE SET
            is_enabled = TRUE,
            icon_visible = TRUE,
            last_activity_at = NOW()
        `,
          [userId]
        );
        logger.info(`Telegram App activated for user ${userId} (fallback)`);
        return true;
      }
      logger.error('Error activating app:', error);
      throw error;
    }
  }

  /**
   * Update app settings for a user
   * @param {number} userId - User ID
   * @param {Object} settings - Settings to update
   * @returns {Promise<Object>} Updated settings
   */
  async updateSettings(userId, settings) {
    try {
      const result = await database.query(
        `
        UPDATE telegram_app_status
        SET settings = settings || $2::jsonb,
            last_activity_at = NOW()
        WHERE user_id = $1
        RETURNING settings
      `,
        [userId, JSON.stringify(settings)]
      );

      if (result.rows.length === 0) {
        const insertResult = await database.query(
          `
          INSERT INTO telegram_app_status (user_id, settings)
          VALUES ($1, $2::jsonb)
          RETURNING settings
        `,
          [userId, JSON.stringify(settings)]
        );
        return insertResult.rows[0].settings;
      }

      return result.rows[0].settings;
    } catch (error) {
      logger.error('Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Record activity (updates last_activity_at)
   * @param {number} userId - User ID
   */
  async recordActivity(userId) {
    try {
      await database.query(
        `
        UPDATE telegram_app_status
        SET last_activity_at = NOW()
        WHERE user_id = $1
      `,
        [userId]
      );
    } catch (error) {
      logger.debug('Error recording activity:', error.message);
    }
  }

  /**
   * Get quick stats for all users (admin endpoint)
   * @returns {Promise<Object>}
   */
  async getGlobalStats() {
    try {
      const result = await database.query(`
        SELECT
          COUNT(DISTINCT user_id) as users_with_bots,
          COUNT(*) as total_bots,
          COUNT(*) FILTER (WHERE is_active = TRUE) as active_bots,
          (SELECT COUNT(*) FROM telegram_bot_chats WHERE is_active = TRUE) as total_chats
        FROM telegram_bots
      `);

      return {
        usersWithBots: parseInt(result.rows[0]?.users_with_bots || 0),
        totalBots: parseInt(result.rows[0]?.total_bots || 0),
        activeBots: parseInt(result.rows[0]?.active_bots || 0),
        totalChats: parseInt(result.rows[0]?.total_chats || 0),
      };
    } catch (error) {
      logger.error('Error getting global stats:', error);
      return {
        usersWithBots: 0,
        totalBots: 0,
        activeBots: 0,
        totalChats: 0,
      };
    }
  }
}

// Singleton instance for TelegramAppService
const telegramAppServiceInstance = new TelegramAppService();

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // --- LLM ---
  chat,
  executeCommand,
  getOrCreateSession,
  clearSession,
  getSessionInfo,
  getOllamaModels,
  getClaudeModels,
  getAvailableTools,
  executeTool,
  toolRegistry,
  estimateTokens,

  // --- Voice (re-exported from telegramVoiceService) ---
  isVoiceEnabled,
  processVoiceMessage,
  cleanupOldFiles,
  MAX_VOICE_DURATION_SECONDS,

  // --- App ---
  isIconVisible: userId => telegramAppServiceInstance.isIconVisible(userId),
  getAppStatus: userId => telegramAppServiceInstance.getAppStatus(userId),
  getDashboardAppData: userId => telegramAppServiceInstance.getDashboardAppData(userId),
  activateApp: userId => telegramAppServiceInstance.activateApp(userId),
  updateSettings: (userId, settings) => telegramAppServiceInstance.updateSettings(userId, settings),
  recordActivity: userId => telegramAppServiceInstance.recordActivity(userId),
  getGlobalStats: () => telegramAppServiceInstance.getGlobalStats(),

  // --- Rate Limit (re-exported from telegramRateLimitService) ---
  checkRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  clearCache,
  DEFAULT_MAX_PER_MINUTE,
  DEFAULT_MAX_PER_HOUR,
};
