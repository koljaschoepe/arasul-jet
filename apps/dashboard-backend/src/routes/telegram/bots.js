/**
 * Telegram Multi-Bot API Routes
 *
 * Endpoints:
 * - GET    /api/telegram-bots              - List all bots
 * - POST   /api/telegram-bots              - Create new bot
 * - GET    /api/telegram-bots/:id          - Get bot details
 * - PUT    /api/telegram-bots/:id          - Update bot
 * - DELETE /api/telegram-bots/:id          - Delete bot
 * - POST   /api/telegram-bots/:id/activate - Activate bot
 * - POST   /api/telegram-bots/:id/deactivate - Deactivate bot
 *
 * Commands:
 * - GET    /api/telegram-bots/:id/commands     - List commands
 * - POST   /api/telegram-bots/:id/commands     - Create command
 * - PUT    /api/telegram-bots/:id/commands/:cmdId - Update command
 * - DELETE /api/telegram-bots/:id/commands/:cmdId - Delete command
 *
 * Chats:
 * - GET    /api/telegram-bots/:id/chats        - List chats
 * - DELETE /api/telegram-bots/:id/chats/:chatRowId - Remove chat
 *
 * Webhook:
 * - POST   /api/telegram-bots/webhook/:botId/:secret - Telegram webhook
 *
 * Models:
 * - GET    /api/telegram-bots/models/ollama    - Get Ollama models
 * - GET    /api/telegram-bots/models/claude    - Get Claude models
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../../utils/logger');
const { requireAuth } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const { webhookLimiter } = require('../../middleware/rateLimit');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const {
  CreateBotBody,
  UpdateBotBody,
  ValidateTokenBody,
  CreateCommandBody,
  UpdateCommandBody,
  SetWebhookBody,
  TestMessageBody,
} = require('../../schemas/telegram');
const telegramBotService = require('../../services/telegram/telegramBotService');
const telegramIntegrationService = require('../../services/telegram/telegramIntegrationService');
const telegramIngressService = require('../../services/telegram/telegramIngressService');
const telegramPollingManager = require('../../services/telegram/telegramPollingManager');
const database = require('../../database');

// Mask bot tokens for safe logging (show first 8 chars only)
const maskToken = token => (token ? token.substring(0, 8) + '***' : 'null');

// ============================================================================
// WEBHOOK ENDPOINT (No auth - called by Telegram)
// ============================================================================

// Note: Webhook must ALWAYS return 200 to Telegram to prevent retries.
// We use a try-catch here intentionally rather than letting errors propagate
// to the global error handler (which would return non-200 status codes).
router.post(
  '/webhook/:botId/:secret',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const { botId, secret } = req.params;
    const startTime = Date.now();

    const updateId = req.body?.update_id;

    // Before validation: only log botId and updateId (no message content)
    logger.info(`Webhook received for bot ${botId}`, { updateId });

    try {
      // Verify webhook secret using timing-safe comparison to prevent timing attacks
      const bot = await telegramBotService.getBotByWebhookSecret(parseInt(botId), secret);

      // Perform timing-safe comparison of the webhook secret
      const isValidSecret =
        secret &&
        bot?.webhook_secret &&
        secret.length === bot.webhook_secret.length &&
        crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(bot.webhook_secret));

      if (!bot || !isValidSecret) {
        logger.warn(`Invalid webhook attempt for bot ${botId} - secret mismatch`, {
          updateId,
          secretLength: secret?.length,
        });
        return res.status(200).send('OK');
      }

      // After validation succeeds: log message type and text preview
      const messageType = req.body?.message?.text
        ? 'text'
        : req.body?.message?.voice
          ? 'voice'
          : req.body?.callback_query
            ? 'callback'
            : req.body?.message
              ? 'other'
              : 'unknown';

      logger.info(`Webhook authenticated for bot ${botId}`, {
        updateId,
        messageType,
        hasMessage: !!req.body?.message,
        chatId: req.body?.message?.chat?.id,
        textPreview: req.body?.message?.text?.substring(0, 30),
      });

      // Process update
      const success = await telegramIngressService.processUpdate(parseInt(botId), req.body);

      const duration = Date.now() - startTime;
      if (success) {
        logger.info(`Webhook processed successfully for bot ${botId}`, {
          updateId,
          duration,
          messageType,
        });
      } else {
        logger.warn(`Webhook processing returned false for bot ${botId}`, {
          updateId,
          duration,
          messageType,
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Webhook processing error for bot ${botId}:`, {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        updateId,
        duration,
        requestBodyKeys: Object.keys(req.body || {}),
      });
    }

    // Always return 200 to prevent Telegram from retrying
    res.status(200).send('OK');
  })
);

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

// Apply auth to all routes below
router.use(requireAuth);

// ----------------------------------------------------------------------------
// MODELS (requires auth)
// ----------------------------------------------------------------------------

router.get(
  '/models/ollama',
  asyncHandler(async (req, res) => {
    const models = await telegramIntegrationService.getOllamaModels();
    res.json({ models });
  })
);

router.get(
  '/models/claude',
  asyncHandler(async (req, res) => {
    const models = telegramIntegrationService.getClaudeModels();
    res.json({ models });
  })
);

// ----------------------------------------------------------------------------
// BOT CRUD
// ----------------------------------------------------------------------------

// List all bots for current user
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const bots = await telegramBotService.getBotsByUser(req.user.id);
    res.json({ bots });
  })
);

// Create new bot
router.post(
  '/',
  validateBody(CreateBotBody),
  asyncHandler(async (req, res) => {
    const {
      name,
      token,
      llmProvider,
      llmModel,
      systemPrompt,
      claudeApiKey,
      ragEnabled,
      ragSpaceIds,
      ragShowSources,
      setupToken,
    } = req.body;

    const bot = await telegramBotService.createBot(req.user.id, {
      name,
      token,
      llmProvider,
      llmModel,
      systemPrompt,
      claudeApiKey,
      ragEnabled,
      ragSpaceIds,
      ragShowSources,
    });

    // If created via zero-config setup, register the chat from the setup session
    if (setupToken) {
      try {
        const session = await database.query(
          `SELECT chat_id, chat_username, chat_first_name
           FROM telegram_setup_sessions
           WHERE setup_token = $1 AND status = 'completed'`,
          [setupToken]
        );

        if (session.rows.length > 0 && session.rows[0].chat_id) {
          await telegramBotService.addChat(bot.id, {
            chatId: session.rows[0].chat_id,
            title: session.rows[0].chat_first_name || 'Private Chat',
            type: 'private',
            username: session.rows[0].chat_username,
          });
          logger.info(
            `Chat ${session.rows[0].chat_id} registered for bot ${bot.id} from setup session`
          );
        }
      } catch (chatErr) {
        logger.warn(`Could not register chat from setup session: ${chatErr.message}`);
      }

      // Auto-activate bot created via zero-config wizard
      try {
        await telegramBotService.activateBot(bot.id, req.user.id);
        bot.isActive = true;
        await telegramPollingManager.startPolling(bot.id);
        bot.mode = 'polling';
        logger.info(`Bot ${bot.id} auto-activated from zero-config setup`);
      } catch (activateErr) {
        logger.warn(`Auto-activation failed for bot ${bot.id}: ${activateErr.message}`);
      }
    }

    res.status(201).json({ bot });
  })
);

// Get bot details
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (isNaN(parseInt(req.params.id))) {
      throw new ValidationError('Ungültige Bot-ID');
    }
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);

    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    res.json({ bot });
  })
);

// Update bot
router.put(
  '/:id',
  validateBody(UpdateBotBody),
  asyncHandler(async (req, res) => {
    if (isNaN(parseInt(req.params.id))) {
      throw new ValidationError('Ungültige Bot-ID');
    }
    const {
      name,
      llmProvider,
      llmModel,
      systemPrompt,
      claudeApiKey,
      token,
      ragEnabled,
      ragSpaceIds,
      ragShowSources,
      toolsEnabled,
      voiceEnabled,
      maxContextTokens,
      maxResponseTokens,
      rateLimitPerMinute,
      allowedUsers,
      restrictUsers,
    } = req.body;

    const bot = await telegramBotService.updateBot(parseInt(req.params.id), req.user.id, {
      name,
      llmProvider,
      llmModel,
      systemPrompt,
      claudeApiKey,
      token,
      ragEnabled,
      ragSpaceIds,
      ragShowSources,
      toolsEnabled,
      voiceEnabled,
      maxContextTokens,
      maxResponseTokens,
      rateLimitPerMinute,
      allowedUsers,
      restrictUsers,
    });

    res.json({ bot });
  })
);

// Delete bot
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (isNaN(parseInt(req.params.id))) {
      throw new ValidationError('Ungültige Bot-ID');
    }
    await telegramBotService.deleteBot(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
  })
);

// Activate bot
router.post(
  '/:id/activate',
  asyncHandler(async (req, res) => {
    const botId = parseInt(req.params.id);
    const bot = await telegramBotService.activateBot(botId, req.user.id);

    // Get full bot details for webhook/polling setup
    const botDetails = await telegramBotService.getBotById(botId, req.user.id);
    let mode = 'unknown';

    if (botDetails) {
      // Verify bot token is valid before starting polling/webhook
      const botToken = await telegramBotService.getBotToken(botId);
      if (!botToken) {
        logger.error(`Cannot activate bot ${botId}: token decryption failed`);
        throw new ValidationError('Bot-Token konnte nicht entschlüsselt werden');
      }

      if (process.env.PUBLIC_URL && botDetails.webhookSecret) {
        // Use webhooks when PUBLIC_URL is available
        const fullWebhookUrl = `${process.env.PUBLIC_URL}/api/telegram-bots/webhook/${bot.id}/${botDetails.webhookSecret}`;
        try {
          await telegramIngressService.setWebhook(bot.id, fullWebhookUrl);
          mode = 'webhook';
          logger.info(`Webhook set for bot ${bot.id}: ${fullWebhookUrl}`);
        } catch (webhookError) {
          logger.warn('Could not set webhook, falling back to polling:', webhookError.message);
          await telegramPollingManager.startPolling(bot.id);
          mode = 'polling';
        }
      } else {
        // No PUBLIC_URL: use getUpdates polling (standard for edge devices)
        await telegramPollingManager.startPolling(bot.id);
        mode = 'polling';
        logger.info(`Polling started for bot ${bot.id} (no PUBLIC_URL configured)`);
      }

      // Send welcome message to all registered chats
      try {
        const chats = await telegramBotService.getChats(botId);
        for (const chat of chats) {
          try {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chat.chatId || chat.chat_id,
                text: `🤖 <b>${bot.name} ist jetzt aktiv!</b>\n\nSchreib mir einfach eine Nachricht und ich antworte dir.\n\n/help - Zeigt alle Befehle`,
                parse_mode: 'HTML',
              }),
              signal: AbortSignal.timeout(10000),
            });
          } catch (sendErr) {
            const safeMsg = sendErr.message
              ? sendErr.message.replace(botToken, maskToken(botToken))
              : sendErr.message;
            logger.warn(
              `Could not send welcome to chat ${chat.chatId || chat.chat_id}: ${safeMsg}`
            );
          }
        }
      } catch (chatErr) {
        const safeMsg = chatErr.message
          ? chatErr.message.replace(botToken, maskToken(botToken))
          : chatErr.message;
        logger.warn(`Could not send welcome messages: ${safeMsg}`);
      }
    }

    res.json({ bot, message: 'Bot aktiviert', mode });
  })
);

// Deactivate bot
router.post(
  '/:id/deactivate',
  asyncHandler(async (req, res) => {
    const bot = await telegramBotService.deactivateBot(parseInt(req.params.id), req.user.id);

    // Stop polling if active
    await telegramPollingManager.stopPolling(bot.id);

    // Delete webhook if set
    try {
      await telegramIngressService.deleteWebhook(bot.id);
    } catch (webhookError) {
      logger.warn('Could not delete webhook:', webhookError.message);
    }

    res.json({ bot, message: 'Bot deaktiviert' });
  })
);

// Validate bot token
router.post(
  '/validate-token',
  validateBody(ValidateTokenBody),
  asyncHandler(async (req, res) => {
    const { token } = req.body;

    const botInfo = await telegramBotService.validateBotToken(token);

    if (!botInfo) {
      throw new ValidationError('Ungültiges Token');
    }

    res.json({ valid: true, botInfo });
  })
);

// ----------------------------------------------------------------------------
// COMMANDS
// ----------------------------------------------------------------------------

// List commands for a bot
router.get(
  '/:id/commands',
  asyncHandler(async (req, res) => {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const commands = await telegramBotService.getCommands(parseInt(req.params.id));
    res.json({ commands });
  })
);

// Create command
router.post(
  '/:id/commands',
  validateBody(CreateCommandBody),
  asyncHandler(async (req, res) => {
    const { command, description, prompt, sortOrder } = req.body;

    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const cmd = await telegramBotService.createCommand(parseInt(req.params.id), {
      command,
      description,
      prompt,
      sortOrder,
    });

    res.status(201).json({ command: cmd });
  })
);

// Update command
router.put(
  '/:id/commands/:cmdId',
  validateBody(UpdateCommandBody),
  asyncHandler(async (req, res) => {
    const { command, description, prompt, isEnabled, sortOrder } = req.body;

    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const cmd = await telegramBotService.updateCommand(
      parseInt(req.params.cmdId),
      parseInt(req.params.id),
      {
        command,
        description,
        prompt,
        isEnabled,
        sortOrder,
      }
    );

    res.json({ command: cmd });
  })
);

// Delete command
router.delete(
  '/:id/commands/:cmdId',
  asyncHandler(async (req, res) => {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    await telegramBotService.deleteCommand(parseInt(req.params.cmdId), parseInt(req.params.id));
    res.json({ success: true });
  })
);

// ----------------------------------------------------------------------------
// CHATS
// ----------------------------------------------------------------------------

// List chats for a bot
router.get(
  '/:id/chats',
  asyncHandler(async (req, res) => {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const chats = await telegramBotService.getChats(parseInt(req.params.id));
    res.json({ chats });
  })
);

// Remove chat from bot
router.delete(
  '/:id/chats/:chatRowId',
  asyncHandler(async (req, res) => {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    await telegramBotService.removeChat(parseInt(req.params.chatRowId), parseInt(req.params.id));
    res.json({ success: true });
  })
);

// ----------------------------------------------------------------------------
// SESSIONS
// ----------------------------------------------------------------------------

// Get session info
router.get(
  '/:id/session/:chatId',
  asyncHandler(async (req, res) => {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const sessionInfo = await telegramIntegrationService.getSessionInfo(
      parseInt(req.params.id),
      parseInt(req.params.chatId)
    );
    res.json({ session: sessionInfo });
  })
);

// Clear session
router.delete(
  '/:id/session/:chatId',
  asyncHandler(async (req, res) => {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    await telegramIntegrationService.clearSession(
      parseInt(req.params.id),
      parseInt(req.params.chatId)
    );
    res.json({ success: true, message: 'Session gelöscht' });
  })
);

// ----------------------------------------------------------------------------
// WEBHOOK INFO
// ----------------------------------------------------------------------------

// Get webhook info
router.get(
  '/:id/webhook',
  asyncHandler(async (req, res) => {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const webhookInfo = await telegramIngressService.getWebhookInfo(parseInt(req.params.id));
    res.json({ webhook: webhookInfo });
  })
);

// Set webhook manually
router.post(
  '/:id/webhook',
  validateBody(SetWebhookBody),
  asyncHandler(async (req, res) => {
    const { url } = req.body;

    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    await telegramIngressService.setWebhook(parseInt(req.params.id), url);
    res.json({ success: true, message: 'Webhook gesetzt' });
  })
);

// Delete webhook
router.delete(
  '/:id/webhook',
  asyncHandler(async (req, res) => {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    await telegramIngressService.deleteWebhook(parseInt(req.params.id));
    res.json({ success: true, message: 'Webhook gelöscht' });
  })
);

// Send test message
router.post(
  '/:id/test-message',
  validateBody(TestMessageBody),
  asyncHandler(async (req, res) => {
    const { chatId, text } = req.body;

    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const result = await telegramIngressService.sendTestMessage(
      parseInt(req.params.id),
      chatId,
      text
    );
    res.json({ success: true, messageId: result.message_id });
  })
);

// ----------------------------------------------------------------------------
// DEBUG
// ----------------------------------------------------------------------------

// Get bot health status
router.get(
  '/:id/health',
  asyncHandler(async (req, res) => {
    const botId = parseInt(req.params.id);
    const bot = await telegramBotService.getBotById(botId, req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const telegramIngressService = require('../../services/telegram/telegramIngressService');
    const health = await telegramIngressService.getBotHealth(botId);
    res.json({ health });
  })
);

// Get bot debug info (polling status, webhook status, token validity)
router.get(
  '/:id/debug',
  asyncHandler(async (req, res) => {
    const botId = parseInt(req.params.id);
    const bot = await telegramBotService.getBotById(botId, req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const debug = {
      botId,
      name: bot.name,
      isActive: bot.isActive,
      isPolling: bot.isPolling,
      webhookUrl: bot.webhookUrl || null,
      lastMessageAt: bot.lastMessageAt || null,
      publicUrl: process.env.PUBLIC_URL || null,
      mode: process.env.PUBLIC_URL ? 'webhook' : 'polling',
      pollingActive: telegramPollingManager.isPollingActive?.(botId) || false,
      tokenValid: false,
      telegramWebhookInfo: null,
    };

    // Check token validity and get Telegram webhook info
    try {
      const botToken = await telegramBotService.getBotToken(botId);
      if (botToken) {
        const meResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
          signal: AbortSignal.timeout(10000),
        });
        const meData = await meResponse.json();
        debug.tokenValid = meData.ok === true;
        debug.botUsername = meData.result?.username;

        // Get webhook info from Telegram
        const whResponse = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
          signal: AbortSignal.timeout(10000),
        });
        const whData = await whResponse.json();
        if (whData.ok) {
          debug.telegramWebhookInfo = {
            url: whData.result.url || '(none)',
            hasCustomCertificate: whData.result.has_custom_certificate,
            pendingUpdateCount: whData.result.pending_update_count,
            lastErrorDate: whData.result.last_error_date
              ? new Date(whData.result.last_error_date * 1000).toISOString()
              : null,
            lastErrorMessage: whData.result.last_error_message || null,
          };
        }
      }
    } catch (err) {
      debug.tokenError = err.message;
    }

    // Get chat count
    try {
      const chats = await telegramBotService.getChats(botId);
      debug.chatCount = chats.length;
      debug.chats = chats.map(c => ({
        chatId: c.chatId || c.chat_id,
        title: c.chatTitle || c.chat_title || c.title,
        type: c.chatType || c.chat_type || c.type,
      }));
    } catch {
      debug.chatCount = 0;
    }

    res.json({ debug });
  })
);

module.exports = router;
