/**
 * Audit Middleware for Telegram Bot
 * Automatically logs all bot interactions
 */

const auditLogService = require('../services/auditLogService');

/**
 * Extract command from message text
 * @param {string} text - Message text
 * @returns {string|null} - Command without arguments
 */
function extractCommand(text) {
    if (!text || !text.startsWith('/')) return null;
    const match = text.match(/^\/([a-zA-Z0-9_]+)/);
    return match ? `/${match[1]}` : null;
}

/**
 * Create an audited command handler wrapper
 * Wraps a command handler to automatically log the interaction
 *
 * @param {Function} handler - The original command handler (msg, match) => Promise<string|void>
 * @param {Object} options - Options for the wrapper
 * @param {string} options.commandName - Name of the command for logging
 * @param {string} options.interactionType - Type of interaction (default: 'command')
 * @returns {Function} - Wrapped handler function
 */
function withAudit(handler, options = {}) {
    const { commandName, interactionType = 'command' } = options;

    return async (msg, match) => {
        const startTime = Date.now();
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        const username = msg.from?.username;
        const messageText = msg.text || '';
        const command = commandName || extractCommand(messageText);

        let responseText = null;
        let success = true;
        let errorMessage = null;

        try {
            // Execute the original handler
            const result = await handler(msg, match);

            // If handler returns a string, it's the response text
            if (typeof result === 'string') {
                responseText = result;
            }

            return result;
        } catch (error) {
            success = false;
            errorMessage = error.message || 'Unknown error';
            throw error;
        } finally {
            const responseTimeMs = Date.now() - startTime;

            // Log the interaction asynchronously (don't block response)
            auditLogService.logInteraction({
                userId,
                username,
                chatId,
                command,
                messageText,
                responseText,
                responseTimeMs,
                success,
                errorMessage,
                interactionType,
                metadata: {
                    messageId: msg.message_id,
                    chatType: msg.chat.type,
                    date: msg.date
                }
            }).catch(err => {
                console.error('Audit logging failed:', err.message);
            });
        }
    };
}

/**
 * Create an audited callback query handler wrapper
 * Wraps a callback handler to automatically log the interaction
 *
 * @param {Function} handler - The original callback handler (query) => Promise<string|void>
 * @param {Object} options - Options for the wrapper
 * @param {string} options.actionName - Name of the callback action for logging
 * @returns {Function} - Wrapped handler function
 */
function withCallbackAudit(handler, options = {}) {
    const { actionName } = options;

    return async (query) => {
        const startTime = Date.now();
        const chatId = query.message?.chat?.id || query.from?.id;
        const userId = query.from?.id;
        const username = query.from?.username;
        const callbackData = query.data;

        let responseText = null;
        let success = true;
        let errorMessage = null;

        try {
            // Execute the original handler
            const result = await handler(query);

            if (typeof result === 'string') {
                responseText = result;
            }

            return result;
        } catch (error) {
            success = false;
            errorMessage = error.message || 'Unknown error';
            throw error;
        } finally {
            const responseTimeMs = Date.now() - startTime;

            // Log the interaction
            auditLogService.logInteraction({
                userId,
                username,
                chatId,
                command: actionName || callbackData,
                messageText: callbackData,
                responseText,
                responseTimeMs,
                success,
                errorMessage,
                interactionType: 'callback',
                metadata: {
                    callbackQueryId: query.id,
                    inlineMessageId: query.inline_message_id,
                    chatInstance: query.chat_instance
                }
            }).catch(err => {
                console.error('Audit logging failed:', err.message);
            });
        }
    };
}

/**
 * Create an audited message handler wrapper
 * For handling general messages (not commands)
 *
 * @param {Function} handler - The original message handler
 * @param {Object} options - Options for the wrapper
 * @returns {Function} - Wrapped handler function
 */
function withMessageAudit(handler, options = {}) {
    return withAudit(handler, { ...options, interactionType: 'message' });
}

/**
 * Middleware to log all incoming updates (for debugging)
 * Use sparingly as it logs everything
 *
 * @param {Object} bot - Telegram bot instance
 */
function attachDebugLogging(bot) {
    bot.on('message', (msg) => {
        console.log(`[AUDIT] Message from ${msg.from?.username || msg.from?.id}: ${msg.text?.substring(0, 50) || '[non-text]'}`);
    });

    bot.on('callback_query', (query) => {
        console.log(`[AUDIT] Callback from ${query.from?.username || query.from?.id}: ${query.data}`);
    });
}

/**
 * Create a response tracker for bot.sendMessage
 * Patches the bot's sendMessage to capture responses
 *
 * @param {Object} bot - Telegram bot instance
 * @param {Map} responseTracker - Map to store responses by chatId
 */
function createResponseTracker(bot, responseTracker = new Map()) {
    const originalSendMessage = bot.sendMessage.bind(bot);

    bot.sendMessage = async (chatId, text, options) => {
        const result = await originalSendMessage(chatId, text, options);

        // Store the response for audit logging
        responseTracker.set(chatId, {
            text,
            timestamp: Date.now(),
            messageId: result.message_id
        });

        return result;
    };

    return responseTracker;
}

/**
 * Utility to create audit entry manually
 * For cases where the wrappers don't fit
 *
 * @param {Object} context - Telegram context (msg or query)
 * @param {Object} details - Additional details
 * @returns {Function} - Function to finalize the audit entry
 */
function startAuditEntry(context, details = {}) {
    const startTime = Date.now();
    const chatId = context.chat?.id || context.message?.chat?.id || context.from?.id;
    const userId = context.from?.id;
    const username = context.from?.username;

    return {
        /**
         * Finalize the audit entry
         * @param {Object} result - Result details
         */
        finish: async (result = {}) => {
            await auditLogService.logInteraction({
                userId,
                username,
                chatId,
                command: details.command || extractCommand(context.text),
                messageText: context.text || context.data,
                responseText: result.responseText,
                responseTimeMs: Date.now() - startTime,
                success: result.success !== false,
                errorMessage: result.errorMessage,
                interactionType: details.interactionType || 'message',
                metadata: {
                    ...details.metadata,
                    ...result.metadata
                }
            });
        }
    };
}

module.exports = {
    withAudit,
    withCallbackAudit,
    withMessageAudit,
    attachDebugLogging,
    createResponseTracker,
    startAuditEntry,
    extractCommand
};
