/**
 * Telegram Setup Polling Service
 *
 * Polls Telegram's getUpdates API during zero-config setup to detect
 * /start commands. Used because PUBLIC_URL is not configured, so
 * webhooks cannot receive messages from Telegram.
 *
 * Flow:
 *   1. After token validation, startPolling(setupToken) is called
 *   2. Service deletes any existing webhook, then polls getUpdates every 2s
 *   3. When /start with matching setup token is found, completes setup
 *   4. Notifies frontend via WebSocket
 *   5. Stops after 10 minutes or on explicit cancel
 */

const axios = require('axios');
const db = require('../database');
const logger = require('../utils/logger');
const { decryptToken } = require('../utils/tokenCrypto');
const telegramWebSocketService = require('./telegramWebSocketService');

const POLL_INTERVAL_MS = 2000;
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Active polling sessions: setupToken -> { intervalId, timeoutId, offset }
const activeSessions = new Map();

/**
 * Start polling getUpdates for a setup session
 * @param {string} setupToken - The setup session token
 */
async function startPolling(setupToken) {
    if (activeSessions.has(setupToken)) {
        logger.warn(`Polling already active for setup token ${setupToken.slice(0, 8)}...`);
        return;
    }

    // Load session from DB to get encrypted token
    const session = await db.query(`
        SELECT bot_token_encrypted, bot_username
        FROM telegram_setup_sessions
        WHERE setup_token = $1 AND status = 'waiting_start'
    `, [setupToken]);

    if (session.rows.length === 0) {
        logger.warn(`No waiting session found for setup token ${setupToken.slice(0, 8)}...`);
        return;
    }

    const botToken = decryptToken(session.rows[0].bot_token_encrypted);
    if (!botToken) {
        logger.error(`Could not decrypt bot token for setup token ${setupToken.slice(0, 8)}...`);
        return;
    }

    // Delete any existing webhook so getUpdates works
    try {
        await axios.post(
            `https://api.telegram.org/bot${botToken}/deleteWebhook`,
            { drop_pending_updates: false },
            { timeout: 10000 }
        );
        logger.info(`Webhook deleted for @${session.rows[0].bot_username} to enable getUpdates polling`);
    } catch (err) {
        logger.warn(`Could not delete webhook: ${err.message}`);
    }

    const state = { intervalId: null, timeoutId: null, offset: 0 };

    // Poll loop
    state.intervalId = setInterval(async () => {
        try {
            await pollUpdates(setupToken, botToken, state);
        } catch (err) {
            logger.error(`Polling error for ${setupToken.slice(0, 8)}...: ${err.message}`);
        }
    }, POLL_INTERVAL_MS);

    // Auto-stop after timeout
    state.timeoutId = setTimeout(() => {
        logger.info(`Polling timeout reached for setup token ${setupToken.slice(0, 8)}...`);
        stopPolling(setupToken);
        telegramWebSocketService.notifyError(setupToken, 'Setup-Zeitlimit überschritten (10 Minuten)');
    }, SESSION_TIMEOUT_MS);

    activeSessions.set(setupToken, state);
    logger.info(`Started getUpdates polling for setup token ${setupToken.slice(0, 8)}...`);
}

/**
 * Poll Telegram getUpdates once
 */
async function pollUpdates(setupToken, botToken, state) {
    const response = await axios.get(
        `https://api.telegram.org/bot${botToken}/getUpdates`,
        {
            params: {
                offset: state.offset,
                timeout: 1,
                allowed_updates: JSON.stringify(['message'])
            },
            timeout: 10000
        }
    );

    if (!response.data.ok || !response.data.result || response.data.result.length === 0) {
        return;
    }

    for (const update of response.data.result) {
        // Advance offset past this update
        state.offset = update.update_id + 1;

        const message = update.message;
        if (!message || !message.text) continue;

        const text = message.text.trim();

        // Match /start with our setup token parameter
        const expectedPayload = `setup_${setupToken}`;
        const isStartMatch = text === `/start ${expectedPayload}` || text === '/start';

        if (!isStartMatch) continue;

        // Found matching /start command
        const chatId = message.chat.id;
        const username = message.from?.username || null;
        const firstName = message.from?.first_name || message.chat.first_name || null;

        logger.info(`/start detected from chat ${chatId} (@${username}) for setup ${setupToken.slice(0, 8)}...`);

        // Complete the setup in DB
        try {
            await db.query(`
                SELECT complete_telegram_setup($1, $2, $3, $4)
            `, [setupToken, chatId.toString(), username, firstName]);
        } catch (dbErr) {
            // If the stored procedure doesn't exist, update directly
            if (dbErr.message.includes('complete_telegram_setup')) {
                await db.query(`
                    UPDATE telegram_setup_sessions
                    SET status = 'completed',
                        chat_id = $2,
                        chat_username = $3,
                        chat_first_name = $4,
                        completed_at = NOW()
                    WHERE setup_token = $1
                `, [setupToken, chatId.toString(), username, firstName]);
            } else {
                throw dbErr;
            }
        }

        // Notify frontend via WebSocket
        telegramWebSocketService.notifySetupComplete(setupToken, {
            chatId: chatId.toString(),
            username,
            firstName,
            type: message.chat.type || 'private'
        });

        // Send confirmation to user in Telegram
        try {
            await axios.post(
                `https://api.telegram.org/bot${botToken}/sendMessage`,
                {
                    chat_id: chatId,
                    text: '✅ Verbindung hergestellt! Du kannst jetzt zum Dashboard zurückkehren.',
                    parse_mode: 'HTML'
                },
                { timeout: 10000 }
            );
        } catch (sendErr) {
            logger.warn(`Could not send confirmation message: ${sendErr.message}`);
        }

        // Stop polling — setup is done
        stopPolling(setupToken);
        return;
    }
}

/**
 * Stop polling for a setup session
 * @param {string} setupToken - The setup session token
 */
function stopPolling(setupToken) {
    const state = activeSessions.get(setupToken);
    if (!state) return;

    if (state.intervalId) clearInterval(state.intervalId);
    if (state.timeoutId) clearTimeout(state.timeoutId);

    activeSessions.delete(setupToken);
    logger.info(`Stopped getUpdates polling for setup token ${setupToken.slice(0, 8)}...`);
}

/**
 * Check if polling is active for a setup token
 * @param {string} setupToken
 * @returns {boolean}
 */
function isPolling(setupToken) {
    return activeSessions.has(setupToken);
}

/**
 * Get count of active polling sessions
 * @returns {number}
 */
function getActiveCount() {
    return activeSessions.size;
}

module.exports = { startPolling, stopPolling, isPolling, getActiveCount };
