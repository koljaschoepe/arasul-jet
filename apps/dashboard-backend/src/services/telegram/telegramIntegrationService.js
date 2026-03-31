/**
 * Telegram Integration Service
 *
 * Consolidated service for LLM, voice, app, and rate-limiting:
 * - LLM conversations (Ollama + Claude)
 * - Voice message transcription (OpenAI Whisper)
 * - Telegram App lifecycle (dashboard icon, settings)
 * - Per-chat rate limiting
 *
 * Consolidated from (now deleted):
 *   telegramLLMService.js       - LLM integration
 *   telegramVoiceService.js     - voice message handling (deleted)
 *   telegramAppService.js       - app integration
 *   telegramRateLimitService.js - rate limiting (deleted)
 */

// =============================================================================
// Dependencies
// =============================================================================

const fs = require('fs');
const path = require('path');
const database = require('../../database');
const logger = require('../../utils/logger');
const telegramBotService = require('./telegramBotService');
const services = require('../../config/services');
const toolRegistry = require('../../tools');
const cryptoService = require('../core/cryptoService');
const telegramRagService = require('./telegramRagService');

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
// Voice Constants
// =============================================================================

const MAX_VOICE_DURATION_SECONDS = parseInt(process.env.TELEGRAM_MAX_VOICE_DURATION) || 120;
const VOICE_ENABLED = process.env.TELEGRAM_VOICE_ENABLED !== 'false';
const WHISPER_MODEL = process.env.TELEGRAM_WHISPER_MODEL || 'whisper-1';
const TEMP_DIR = '/tmp/telegram-voice';

const TELEGRAM_API = 'https://api.telegram.org/bot';
const TELEGRAM_FILE_API = 'https://api.telegram.org/file/bot';
const OPENAI_API = 'https://api.openai.com/v1/audio/transcriptions';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// =============================================================================
// Rate Limit Constants
// =============================================================================

const DEFAULT_MAX_PER_MINUTE = parseInt(process.env.TELEGRAM_RATE_LIMIT_PER_MINUTE) || 10;
const DEFAULT_MAX_PER_HOUR = parseInt(process.env.TELEGRAM_RATE_LIMIT_PER_HOUR) || 100;

// In-memory cache for rate limits (reduces DB queries)
const rateLimitCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache TTL

// =============================================================================
// Rate Limit Section
// =============================================================================

/**
 * Get cache key for bot+chat
 * @param {number} botId
 * @param {number} chatId
 * @returns {string}
 */
function getCacheKey(botId, chatId) {
  return `${botId}:${chatId}`;
}

/**
 * Check if a request is rate limited
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 * @param {number} userId - User ID (optional)
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date}>}
 */
async function checkRateLimit(botId, chatId, userId = null) {
  const cacheKey = getCacheKey(botId, chatId);
  const now = Date.now();

  // Check cache first
  const cached = rateLimitCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    // Update in-memory counter
    cached.count++;

    if (cached.count > cached.maxPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(cached.windowStart + 60000),
      };
    }

    return {
      allowed: true,
      remaining: cached.maxPerMinute - cached.count,
      resetAt: new Date(cached.windowStart + 60000),
    };
  }

  // Query database
  try {
    const result = await database.query(`SELECT * FROM check_rate_limit($1, $2, $3)`, [
      botId,
      chatId,
      userId,
    ]);

    if (result.rows.length === 0) {
      // Function didn't return a row, allow the request
      return {
        allowed: true,
        remaining: DEFAULT_MAX_PER_MINUTE - 1,
        resetAt: new Date(now + 60000),
      };
    }

    const { allowed, remaining, reset_at } = result.rows[0];

    // Update cache
    rateLimitCache.set(cacheKey, {
      count: DEFAULT_MAX_PER_MINUTE - remaining,
      maxPerMinute: DEFAULT_MAX_PER_MINUTE,
      windowStart: now,
      expiresAt: now + CACHE_TTL,
    });

    return {
      allowed,
      remaining: remaining || 0,
      resetAt: reset_at ? new Date(reset_at) : new Date(now + 60000),
    };
  } catch (error) {
    // If rate limit table doesn't exist yet, allow request
    if (error.message.includes('does not exist') || error.message.includes('check_rate_limit')) {
      logger.debug('Rate limit table not yet created, allowing request');
      return {
        allowed: true,
        remaining: DEFAULT_MAX_PER_MINUTE,
        resetAt: new Date(now + 60000),
      };
    }

    logger.error('Rate limit check error:', error);
    // On error, allow the request (fail open)
    return {
      allowed: true,
      remaining: DEFAULT_MAX_PER_MINUTE,
      resetAt: new Date(now + 60000),
    };
  }
}

/**
 * Reset rate limit for a chat (e.g., after cooldown)
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 */
async function resetRateLimit(botId, chatId) {
  const cacheKey = getCacheKey(botId, chatId);
  rateLimitCache.delete(cacheKey);

  try {
    await database.query(
      `UPDATE telegram_rate_limits
       SET request_count = 0,
           window_start = NOW(),
           is_rate_limited = FALSE,
           cooldown_until = NULL
       WHERE bot_id = $1 AND chat_id = $2`,
      [botId, chatId]
    );
  } catch (error) {
    logger.error('Error resetting rate limit:', error);
  }
}

/**
 * Get rate limit status for a chat
 * @param {number} botId - Bot ID
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>}
 */
async function getRateLimitStatus(botId, chatId) {
  try {
    const result = await database.query(
      `SELECT request_count, max_requests_per_minute, window_start, is_rate_limited, cooldown_until
       FROM telegram_rate_limits
       WHERE bot_id = $1 AND chat_id = $2`,
      [botId, chatId]
    );

    if (result.rows.length === 0) {
      return {
        requestCount: 0,
        maxRequests: DEFAULT_MAX_PER_MINUTE,
        isLimited: false,
        cooldownUntil: null,
      };
    }

    const row = result.rows[0];
    return {
      requestCount: row.request_count,
      maxRequests: row.max_requests_per_minute,
      isLimited: row.is_rate_limited,
      cooldownUntil: row.cooldown_until,
      windowStart: row.window_start,
    };
  } catch (error) {
    logger.error('Error getting rate limit status:', error);
    return {
      requestCount: 0,
      maxRequests: DEFAULT_MAX_PER_MINUTE,
      isLimited: false,
      cooldownUntil: null,
    };
  }
}

/**
 * Clear rate limit cache (for testing)
 */
function clearCache() {
  rateLimitCache.clear();
}

// =============================================================================
// LLM Section (from telegramLLMService.js)
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
 * Chat with Ollama (supports native function calling)
 * @param {Object} bot - Bot configuration
 * @param {Array} messages - Conversation messages
 * @param {string} systemPrompt - System prompt
 * @param {Object} options - Options
 * @param {boolean} options.enableTools - Whether to include native tool definitions
 * @returns {Promise<string>} Response content
 */
async function chatWithOllama(bot, messages, systemPrompt, options = {}) {
  const { enableTools = false } = options;
  const model = bot.llm_model || DEFAULT_OLLAMA_MODEL;

  const ollamaMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  // Build request with optional native tools
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

      // Send tool results back to Ollama for final answer
      const followUpMessages = [
        ...ollamaMessages,
        msg, // assistant message with tool_calls
        ...toolMessages, // tool results
      ];

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
        // Fallback: return tool results directly
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
 * @param {boolean} options.enableTools - Enable tool execution (default: true)
 * @param {boolean} options.skipRateLimit - Skip rate limit check (default: false)
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
    // Get Claude API key
    const apiKey = await telegramBotService.getClaudeApiKey(botId);
    if (!apiKey) {
      throw new Error(
        'Claude API-Key nicht konfiguriert. Bitte in den Bot-Einstellungen hinzufuegen.'
      );
    }
    response = await chatWithClaude(bot, contextMessages, systemPrompt, apiKey);
  } else {
    // Default to Ollama - use native function calling when tools enabled
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
async function executeTool(toolName, params = {}, context = {}) {
  return toolRegistry.execute(toolName, params, context);
}

// =============================================================================
// Voice Section
// =============================================================================

/**
 * Check if voice feature is enabled
 * @returns {boolean}
 */
function isVoiceEnabled() {
  return VOICE_ENABLED;
}

/**
 * Get OpenAI API key for a bot
 * @param {number} botId - Bot ID
 * @returns {Promise<string|null>}
 */
async function getOpenAIKey(botId) {
  try {
    // First check if bot has its own OpenAI key
    const result = await database.query(
      `SELECT openai_api_key_encrypted, openai_api_key_iv, openai_api_key_auth_tag
       FROM telegram_bots WHERE id = $1`,
      [botId]
    );

    if (result.rows.length > 0 && result.rows[0].openai_api_key_encrypted) {
      const row = result.rows[0];
      return cryptoService.decrypt(
        row.openai_api_key_encrypted,
        row.openai_api_key_iv,
        row.openai_api_key_auth_tag
      );
    }

    // Fall back to global OpenAI key
    const globalKey = process.env.OPENAI_API_KEY;
    if (globalKey) {
      return globalKey;
    }

    return null;
  } catch (error) {
    logger.error('Error getting OpenAI key:', error);
    return null;
  }
}

/**
 * Download voice file from Telegram
 * @param {string} token - Bot token
 * @param {string} fileId - Telegram file ID
 * @returns {Promise<string>} Local file path
 */
async function downloadVoiceFile(token, fileId) {
  try {
    // Get file info from Telegram
    const fileInfoResponse = await fetch(`${TELEGRAM_API}${token}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
      throw new Error(fileInfo.description || 'Failed to get file info');
    }

    const filePath = fileInfo.result.file_path;
    const fileUrl = `${TELEGRAM_FILE_API}${token}/${filePath}`;

    // Download file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    // Save to temp file
    const localPath = path.join(TEMP_DIR, `voice_${Date.now()}_${fileId}.ogg`);
    fs.writeFileSync(localPath, Buffer.from(buffer));

    logger.debug(`Voice file downloaded: ${localPath}`);
    return localPath;
  } catch (error) {
    logger.error('Error downloading voice file:', error);
    throw error;
  }
}

/**
 * Transcribe audio file using OpenAI Whisper API
 * @param {string} filePath - Local file path
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<string>} Transcription text
 */
async function transcribeWithWhisper(filePath, apiKey) {
  try {
    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Create form data
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);
    formData.append('model', WHISPER_MODEL);
    formData.append('language', 'de'); // German by default
    formData.append('response_format', 'json');

    // Call OpenAI API
    const response = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      // fire-and-forget: error response may not be valid JSON; fallback to empty object
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
    }

    const data = await response.json();
    return data.text || '';
  } catch (error) {
    logger.error('Error transcribing with Whisper:', error);
    throw error;
  }
}

/**
 * Clean up temporary voice file
 * @param {string} filePath - File to delete
 */
function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug(`Cleaned up voice file: ${filePath}`);
    }
  } catch (error) {
    logger.warn('Failed to cleanup voice file:', error);
  }
}

/**
 * Process a voice message
 * @param {number} botId - Bot ID
 * @param {string} token - Bot token
 * @param {Object} voice - Telegram voice object
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
async function processVoiceMessage(botId, token, voice) {
  // Check if voice feature is enabled
  if (!VOICE_ENABLED) {
    return {
      success: false,
      error: 'Sprachnachrichten sind deaktiviert.',
    };
  }

  // Check duration limit
  if (voice.duration > MAX_VOICE_DURATION_SECONDS) {
    return {
      success: false,
      error: `Sprachnachricht zu lang. Maximum: ${MAX_VOICE_DURATION_SECONDS} Sekunden.`,
    };
  }

  // Get OpenAI API key
  const apiKey = await getOpenAIKey(botId);
  if (!apiKey) {
    return {
      success: false,
      error: 'Kein OpenAI API-Key konfiguriert. Bitte setze einen API-Key fuer Sprachnachrichten.',
    };
  }

  let localFilePath = null;

  try {
    // Download voice file
    localFilePath = await downloadVoiceFile(token, voice.file_id);

    // Transcribe
    const text = await transcribeWithWhisper(localFilePath, apiKey);

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'Keine Sprache erkannt. Bitte versuche es erneut.',
      };
    }

    logger.info(`Voice transcription complete: ${text.substring(0, 50)}...`);

    return {
      success: true,
      text: text.trim(),
    };
  } catch (error) {
    logger.error('Voice processing error:', error);
    return {
      success: false,
      error: error.message || 'Fehler bei der Sprachverarbeitung.',
    };
  } finally {
    // Always cleanup
    if (localFilePath) {
      cleanupFile(localFilePath);
    }
  }
}

/**
 * Clean up old voice files (for cron job)
 * @param {number} maxAgeMinutes - Max age in minutes
 */
function cleanupOldFiles(maxAgeMinutes = 30) {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      return;
    }

    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        logger.debug(`Cleaned up old voice file: ${file}`);
      }
    }
  } catch (error) {
    logger.warn('Error cleaning up old voice files:', error);
  }
}

// =============================================================================
// App Section (from telegramAppService.js)
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
      // If table doesn't exist yet, check for bots directly
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
      // Ensure status record exists
      await database.query(`SELECT ensure_telegram_app_status($1)`, [userId]);

      // Get status
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

      // Get bot counts
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

      // Get total chats and messages
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
      // Handle case where table doesn't exist
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

      // Also check if the telegram-bot is installed via the App Store
      let appInstalled = false;
      try {
        const installResult = await database.query(
          `SELECT status FROM app_installations WHERE app_id = 'telegram-bot' AND status NOT IN ('available', 'uninstalling')`
        );
        appInstalled = installResult.rows.length > 0;
      } catch {
        // Table might not exist, ignore
      }

      // Show card if: app is installed OR icon is visible OR user has bots
      if (!appInstalled && !status.iconVisible && status.botCount.total === 0) {
        return null;
      }

      // Build description based on state
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
      // Fallback if function doesn't exist
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
      // Merge with existing settings
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
        // Create record if doesn't exist
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
      // Non-critical, just log
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
  // --- LLM (from telegramLLMService) ---
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

  // --- Voice ---
  isVoiceEnabled,
  processVoiceMessage,
  cleanupOldFiles,
  MAX_VOICE_DURATION_SECONDS,

  // --- App (from telegramAppService) ---
  // The app service is a class singleton; export its methods bound
  isIconVisible: userId => telegramAppServiceInstance.isIconVisible(userId),
  getAppStatus: userId => telegramAppServiceInstance.getAppStatus(userId),
  getDashboardAppData: userId => telegramAppServiceInstance.getDashboardAppData(userId),
  activateApp: userId => telegramAppServiceInstance.activateApp(userId),
  updateSettings: (userId, settings) => telegramAppServiceInstance.updateSettings(userId, settings),
  recordActivity: userId => telegramAppServiceInstance.recordActivity(userId),
  getGlobalStats: () => telegramAppServiceInstance.getGlobalStats(),

  // --- Rate Limit ---
  checkRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  clearCache,
  DEFAULT_MAX_PER_MINUTE,
  DEFAULT_MAX_PER_HOUR,
};
