/**
 * Telegram LLM Service
 * Handles LLM conversations for Telegram bots
 *
 * Features:
 * - Ollama integration (local LLM)
 * - Claude integration (Anthropic API)
 * - Session management with context
 * - Custom command execution
 * - Tool/Skill system for system operations
 */

const database = require('../database');
const logger = require('../utils/logger');
const telegramBotService = require('./telegramBotService');
const services = require('../config/services');
const toolRegistry = require('../tools');
const rateLimitService = require('./telegramRateLimitService');

// LLM Service URLs
const OLLAMA_URL = services.llm?.url || process.env.OLLAMA_URL || 'http://llm-service:11434';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Default models
const DEFAULT_OLLAMA_MODEL = process.env.DEFAULT_OLLAMA_MODEL || 'llama3.1:8b';
const DEFAULT_CLAUDE_MODEL = process.env.DEFAULT_CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

// Token limits
const MAX_CONTEXT_TOKENS = parseInt(process.env.TELEGRAM_MAX_CONTEXT_TOKENS || '4096');
const MAX_RESPONSE_TOKENS = parseInt(process.env.TELEGRAM_MAX_RESPONSE_TOKENS || '1024');

/**
 * Estimate token count (rough approximation: 4 chars = 1 token)
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Get or create a session for a bot+chat
 * @param {number} botId - Bot ID
 * @param {number} chatId - Telegram chat ID
 * @returns {Promise<Object>} Session with messages
 */
async function getOrCreateSession(botId, chatId) {
  // Try to get existing session
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

  // Create new session
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
 * @returns {Promise<void>}
 */
async function addMessageToSession(botId, chatId, role, content) {
  const tokens = estimateTokens(content);

  const message = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };

  await database.query(
    `UPDATE telegram_bot_sessions
    SET messages = messages || $3::jsonb,
        token_count = token_count + $4,
        updated_at = NOW()
    WHERE bot_id = $1 AND chat_id = $2`,
    [botId, chatId, JSON.stringify(message), tokens]
  );
}

/**
 * Clear session messages (for /new command)
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<void>}
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

  // Calculate available tokens (reserve for system prompt and response)
  const systemTokens = estimateTokens(systemPrompt);
  const availableTokens = MAX_CONTEXT_TOKENS - systemTokens - MAX_RESPONSE_TOKENS;

  // Trim old messages to fit
  let totalTokens = 0;
  const trimmedMessages = [];

  // Work backwards to keep most recent messages
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
 * Chat with Ollama
 * @param {Object} bot - Bot configuration
 * @param {Array} messages - Conversation messages
 * @param {string} systemPrompt - System prompt
 * @returns {Promise<string>} Response content
 */
async function chatWithOllama(bot, messages, systemPrompt) {
  const model = bot.llm_model || DEFAULT_OLLAMA_MODEL;

  // Format messages for Ollama
  const ollamaMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: ollamaMessages,
        stream: false,
        options: {
          num_predict: MAX_RESPONSE_TOKENS,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error: ${error}`);
    }

    const data = await response.json();
    return data.message?.content || 'Keine Antwort erhalten.';
  } catch (error) {
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
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
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
 * @param {boolean} options.enableTools - Enable tool execution (default: true)
 * @param {boolean} options.skipRateLimit - Skip rate limit check (default: false)
 * @returns {Promise<string>} Assistant's response
 */
async function chat(botId, chatId, userMessage, options = {}) {
  const { enableTools = true, skipRateLimit = false } = options;

  // Check rate limit
  if (!skipRateLimit) {
    const rateLimit = await rateLimitService.checkRateLimit(botId, chatId);
    if (!rateLimit.allowed) {
      const waitTime = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      throw new Error(`Rate-Limit erreicht. Bitte warte ${waitTime} Sekunden.`);
    }
  }

  // Get bot configuration
  const botResult = await database.query(
    `SELECT id, name, llm_provider, llm_model, system_prompt FROM telegram_bots WHERE id = $1`,
    [botId]
  );

  if (botResult.rows.length === 0) {
    throw new Error('Bot nicht gefunden');
  }

  const bot = botResult.rows[0];
  const baseSystemPrompt = bot.system_prompt || 'Du bist ein hilfreicher Assistent.';

  // Build system prompt with tools if enabled
  const systemPrompt = enableTools
    ? await buildSystemPrompt(baseSystemPrompt)
    : baseSystemPrompt;

  // Ensure session exists
  await getOrCreateSession(botId, chatId);

  // Add user message to session
  await addMessageToSession(botId, chatId, 'user', userMessage);

  // Get context messages
  const contextMessages = await getContextMessages(botId, chatId, systemPrompt);

  let response;

  if (bot.llm_provider === 'claude') {
    // Get Claude API key
    const apiKey = await telegramBotService.getClaudeApiKey(botId);
    if (!apiKey) {
      throw new Error('Claude API-Key nicht konfiguriert. Bitte in den Bot-Einstellungen hinzufuegen.');
    }
    response = await chatWithClaude(bot, contextMessages, systemPrompt, apiKey);
  } else {
    // Default to Ollama
    response = await chatWithOllama(bot, contextMessages, systemPrompt);
  }

  // Process tool calls if enabled
  if (enableTools) {
    const context = { botId, chatId };
    const toolResult = await toolRegistry.processToolCalls(response, context);

    if (toolResult.hasTools) {
      // Build response with tool results
      const toolOutputs = toolResult.results
        .map(r => `\n\n---\n${r.result}`)
        .join('');

      response = toolResult.cleanResponse + toolOutputs;

      logger.debug(`Executed ${toolResult.results.length} tools for bot ${botId}`);
    }
  }

  // Add assistant response to session
  await addMessageToSession(botId, chatId, 'assistant', response);

  // Update bot's last message timestamp
  await telegramBotService.updateLastMessage(botId);

  return response;
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
  // Get command from database
  const cmdResult = await database.query(
    `SELECT id, prompt FROM telegram_bot_commands
    WHERE bot_id = $1 AND command = $2 AND is_enabled = true`,
    [botId, command.toLowerCase()]
  );

  if (cmdResult.rows.length === 0) {
    return null; // Command not found
  }

  const cmd = cmdResult.rows[0];

  // Build the prompt with args substitution (supports both {eingabe} and {{args}})
  let prompt = cmd.prompt;
  if (args) {
    prompt = prompt.replace(/\{\{args\}\}/g, args);
    prompt = prompt.replace(/\{eingabe\}/g, args);
  } else {
    prompt = prompt.replace(/\{\{args\}\}/g, '');
    prompt = prompt.replace(/\{eingabe\}/g, '');
  }

  // Update command usage
  await database.query(
    `UPDATE telegram_bot_commands SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = $1`,
    [cmd.id]
  );

  // Execute via chat (uses session context)
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
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      throw new Error('Failed to fetch Ollama models');
    }

    const data = await response.json();
    return (data.models || []).map((m) => ({
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
async function executeTool(toolName, params = {}, context = {}) {
  return toolRegistry.execute(toolName, params, context);
}

module.exports = {
  // Chat
  chat,
  executeCommand,

  // Session
  getOrCreateSession,
  clearSession,
  getSessionInfo,

  // Models
  getOllamaModels,
  getClaudeModels,

  // Tools
  getAvailableTools,
  executeTool,
  toolRegistry,

  // Utilities
  estimateTokens,
};
