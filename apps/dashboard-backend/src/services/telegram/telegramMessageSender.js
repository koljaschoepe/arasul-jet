/**
 * Telegram Message Sender
 *
 * Handles all outbound Telegram messaging:
 * - sendMessage with retry + exponential backoff
 * - sendTypingAction (typing indicator)
 * - formatTelegramMessage (Markdown → HTML conversion)
 * - sendFormattedMessage (format + split long messages)
 *
 * Extracted from telegramIngressService.js for maintainability.
 */

const logger = require('../../utils/logger');

// =============================================================================
// Constants
// =============================================================================

const TELEGRAM_API = 'https://api.telegram.org/bot';

const MAX_MESSAGE_LENGTH = parseInt(process.env.TELEGRAM_MAX_MESSAGE_LENGTH) || 4096;

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  retryableErrors: [408, 429, 500, 502, 503, 504],
};

// Mask bot tokens for safe logging (show first 8 chars only)
const maskToken = token => (token ? token.substring(0, 8) + '***' : 'null');

const sleep = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

function calculateBackoff(attempt) {
  const delay = RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

// =============================================================================
// Message Sending
// =============================================================================

/**
 * Send a message via Telegram API with retry + exponential backoff
 * @param {string} token - Bot token
 * @param {number} chatId - Chat ID
 * @param {string} text - Message text
 * @param {Object} options - Additional sendMessage options
 * @returns {Promise<Object>} Telegram API result
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
        signal: AbortSignal.timeout(30000),
      });

      const data = await response.json();

      if (!data.ok) {
        const errorCode = data.error_code || response.status;
        const isRetryable = RETRY_CONFIG.retryableErrors.includes(errorCode);

        if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
          const delay = calculateBackoff(attempt);
          logger.warn(
            `Telegram API error (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms:`,
            { errorCode, description: data.description, chatId }
          );
          await sleep(delay);
          continue;
        }

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

      if (attempt > 0) {
        logger.info(`Telegram message sent after ${attempt + 1} attempts to chat ${chatId}`);
      }

      return data.result;
    } catch (error) {
      lastError = error;

      const safeErrorMsg = error.message
        ? error.message.replace(token, maskToken(token))
        : error.message;

      const isNetworkError =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message.includes('network') ||
        error.message.includes('fetch');

      if (isNetworkError && attempt < RETRY_CONFIG.maxRetries) {
        const delay = calculateBackoff(attempt);
        logger.warn(
          `Network error (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms:`,
          { error: safeErrorMsg, chatId }
        );
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  const safeLastMsg = lastError?.message
    ? lastError.message.replace(token, maskToken(token))
    : lastError?.message;
  logger.error('Error sending Telegram message after all retries:', {
    error: safeLastMsg,
    chatId,
    maxRetries: RETRY_CONFIG.maxRetries,
  });
  throw lastError;
}

/**
 * Send typing action indicator
 * @param {string} token - Bot token
 * @param {number} chatId - Chat ID
 */
async function sendTypingAction(token, chatId) {
  try {
    await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    // Ignore typing action errors — cosmetic only
  }
}

// =============================================================================
// Message Formatting
// =============================================================================

/**
 * Convert Markdown to Telegram-compatible HTML
 * @param {string} text - Markdown text
 * @returns {string} HTML-formatted text
 */
function formatTelegramMessage(text) {
  if (!text) {
    return text;
  }

  let result = text;

  // Code blocks: ```lang\n...\n``` → <pre>...</pre>
  result = result.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre>$1</pre>');
  // Inline code: `...` → <code>...</code>
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold: **text** → <b>text</b>
  result = result.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  // Italic: *text* → <i>text</i> (but not inside already-processed tags)
  result = result.replace(/(?<![<\w])\*([^*]+)\*(?![>\w])/g, '<i>$1</i>');
  // Blockquotes: > text → <blockquote>text</blockquote>
  result = result.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  // Unordered lists: - item or * item → • item
  result = result.replace(/^[-*] (.+)$/gm, '• $1');
  // Links: [text](url) → <a href="url">text</a>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return result;
}

/**
 * Send a formatted message, splitting if too long (>4096 chars)
 * @param {string} token - Bot token
 * @param {number} chatId - Chat ID
 * @param {string} text - Message text (may be markdown)
 * @param {Object} options - sendMessage options
 */
async function sendFormattedMessage(token, chatId, text, options = {}) {
  const formatted = formatTelegramMessage(text);

  if (formatted.length <= MAX_MESSAGE_LENGTH) {
    return sendMessage(token, chatId, formatted, options);
  }

  // Split on paragraph boundaries
  const chunks = [];
  let remaining = formatted;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf('\n\n', MAX_MESSAGE_LENGTH);
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    }
    if (splitAt <= 0) {
      splitAt = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  for (const chunk of chunks) {
    await sendMessage(token, chatId, chunk, options);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  sendMessage,
  sendTypingAction,
  formatTelegramMessage,
  sendFormattedMessage,
  // Expose for use by other modules
  TELEGRAM_API,
  maskToken,
};
