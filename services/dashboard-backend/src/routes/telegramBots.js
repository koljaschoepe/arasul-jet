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
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');
const telegramBotService = require('../services/telegramBotService');
const telegramLLMService = require('../services/telegramLLMService');
const telegramWebhookService = require('../services/telegramWebhookService');

// ============================================================================
// WEBHOOK ENDPOINT (No auth - called by Telegram)
// ============================================================================

// Note: Webhook must ALWAYS return 200 to Telegram to prevent retries.
// We use a try-catch here intentionally rather than letting errors propagate
// to the global error handler (which would return non-200 status codes).
router.post(
  '/webhook/:botId/:secret',
  asyncHandler(async (req, res) => {
    const { botId, secret } = req.params;
    const startTime = Date.now();

    const updateId = req.body?.update_id;
    const messageType = req.body?.message?.text
      ? 'text'
      : req.body?.message?.voice
        ? 'voice'
        : req.body?.callback_query
          ? 'callback'
          : req.body?.message
            ? 'other'
            : 'unknown';

    logger.info(`Webhook received for bot ${botId}`, {
      updateId,
      messageType,
      hasMessage: !!req.body?.message,
      chatId: req.body?.message?.chat?.id,
      textPreview: req.body?.message?.text?.substring(0, 30),
    });

    try {
      // Verify webhook secret
      const bot = await telegramBotService.getBotByWebhookSecret(parseInt(botId), secret);

      if (!bot) {
        logger.warn(`Invalid webhook attempt for bot ${botId} - secret mismatch`, {
          updateId,
          secretLength: secret?.length,
        });
        return res.status(200).send('OK');
      }

      // Process update
      const success = await telegramWebhookService.processUpdate(parseInt(botId), req.body);

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
        messageType,
        requestBodyKeys: Object.keys(req.body || {}),
      });
    }

    // Always return 200 to prevent Telegram from retrying
    res.status(200).send('OK');
  })
);

// ============================================================================
// MODELS (Public endpoints)
// ============================================================================

router.get(
  '/models/ollama',
  asyncHandler(async (req, res) => {
    const models = await telegramLLMService.getOllamaModels();
    res.json({ models });
  })
);

router.get(
  '/models/claude',
  asyncHandler(async (req, res) => {
    const models = telegramLLMService.getClaudeModels();
    res.json({ models });
  })
);

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

// Apply auth to all routes below
router.use(requireAuth);

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
  asyncHandler(async (req, res) => {
    const { name, token, llmProvider, llmModel, systemPrompt, claudeApiKey } = req.body;

    if (!name || !token) {
      throw new ValidationError('Name und Token sind erforderlich');
    }

    const bot = await telegramBotService.createBot(req.user.id, {
      name,
      token,
      llmProvider,
      llmModel,
      systemPrompt,
      claudeApiKey,
    });

    res.status(201).json({ bot });
  })
);

// Get bot details
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
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
  asyncHandler(async (req, res) => {
    const { name, llmProvider, llmModel, systemPrompt, claudeApiKey, token } = req.body;

    const bot = await telegramBotService.updateBot(parseInt(req.params.id), req.user.id, {
      name,
      llmProvider,
      llmModel,
      systemPrompt,
      claudeApiKey,
      token,
    });

    res.json({ bot });
  })
);

// Delete bot
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await telegramBotService.deleteBot(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
  })
);

// Activate bot
router.post(
  '/:id/activate',
  asyncHandler(async (req, res) => {
    const bot = await telegramBotService.activateBot(parseInt(req.params.id), req.user.id);

    // Get webhook secret from DB
    const botDetails = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);

    if (botDetails) {
      if (!botDetails.webhookSecret) {
        logger.warn(`Bot ${bot.id} has no webhookSecret - skipping webhook setup`);
      }
      const fullWebhookUrl = `${process.env.PUBLIC_URL}/api/telegram-bots/webhook/${bot.id}/${botDetails.webhookSecret}`;

      try {
        // Only set webhook if PUBLIC_URL and webhookSecret are configured
        if (process.env.PUBLIC_URL && botDetails.webhookSecret) {
          await telegramWebhookService.setWebhook(bot.id, fullWebhookUrl);
        }
      } catch (webhookError) {
        logger.warn('Could not set webhook, bot will work without it:', webhookError.message);
      }
    }

    res.json({ bot, message: 'Bot aktiviert' });
  })
);

// Deactivate bot
router.post(
  '/:id/deactivate',
  asyncHandler(async (req, res) => {
    const bot = await telegramBotService.deactivateBot(parseInt(req.params.id), req.user.id);

    // Delete webhook
    try {
      await telegramWebhookService.deleteWebhook(bot.id);
    } catch (webhookError) {
      logger.warn('Could not delete webhook:', webhookError.message);
    }

    res.json({ bot, message: 'Bot deaktiviert' });
  })
);

// Validate bot token
router.post(
  '/validate-token',
  asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token) {
      throw new ValidationError('Token ist erforderlich');
    }

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
  asyncHandler(async (req, res) => {
    const { command, description, prompt, sortOrder } = req.body;

    if (!command || !description || !prompt) {
      throw new ValidationError('Command, Beschreibung und Prompt sind erforderlich');
    }

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

    const sessionInfo = await telegramLLMService.getSessionInfo(
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

    await telegramLLMService.clearSession(parseInt(req.params.id), parseInt(req.params.chatId));
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

    const webhookInfo = await telegramWebhookService.getWebhookInfo(parseInt(req.params.id));
    res.json({ webhook: webhookInfo });
  })
);

// Set webhook manually
router.post(
  '/:id/webhook',
  asyncHandler(async (req, res) => {
    const { url } = req.body;

    if (!url) {
      throw new ValidationError('URL ist erforderlich');
    }

    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    await telegramWebhookService.setWebhook(parseInt(req.params.id), url);
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

    await telegramWebhookService.deleteWebhook(parseInt(req.params.id));
    res.json({ success: true, message: 'Webhook gelöscht' });
  })
);

// Send test message
router.post(
  '/:id/test-message',
  asyncHandler(async (req, res) => {
    const { chatId, text } = req.body;

    if (!chatId || !text) {
      throw new ValidationError('Chat-ID und Text sind erforderlich');
    }

    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      throw new NotFoundError('Bot nicht gefunden');
    }

    const result = await telegramWebhookService.sendTestMessage(
      parseInt(req.params.id),
      chatId,
      text
    );
    res.json({ success: true, messageId: result.message_id });
  })
);

module.exports = router;
