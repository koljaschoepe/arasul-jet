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
const { authenticateToken } = require('../middleware/auth');
const telegramBotService = require('../services/telegramBotService');
const telegramLLMService = require('../services/telegramLLMService');
const telegramWebhookService = require('../services/telegramWebhookService');

// ============================================================================
// WEBHOOK ENDPOINT (No auth - called by Telegram)
// ============================================================================

router.post('/webhook/:botId/:secret', async (req, res) => {
  const { botId, secret } = req.params;

  try {
    // Verify webhook secret
    const bot = await telegramBotService.getBotByWebhookSecret(parseInt(botId), secret);

    if (!bot) {
      logger.warn(`Invalid webhook attempt for bot ${botId}`);
      return res.status(401).json({ error: 'Invalid webhook' });
    }

    // Process update
    await telegramWebhookService.processUpdate(parseInt(botId), req.body);

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Webhook processing error:', error);
    // Always return 200 to prevent Telegram from retrying
    res.status(200).send('OK');
  }
});

// ============================================================================
// MODELS (Public endpoints)
// ============================================================================

router.get('/models/ollama', async (req, res) => {
  try {
    const models = await telegramLLMService.getOllamaModels();
    res.json({ models });
  } catch (error) {
    logger.error('Error fetching Ollama models:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Modelle' });
  }
});

router.get('/models/claude', (req, res) => {
  const models = telegramLLMService.getClaudeModels();
  res.json({ models });
});

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

// Apply auth to all routes below
router.use(authenticateToken);

// ----------------------------------------------------------------------------
// BOT CRUD
// ----------------------------------------------------------------------------

// List all bots for current user
router.get('/', async (req, res) => {
  try {
    const bots = await telegramBotService.getBotsByUser(req.user.id);
    res.json({ bots });
  } catch (error) {
    logger.error('Error fetching bots:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Bots' });
  }
});

// Create new bot
router.post('/', async (req, res) => {
  const { name, token, llmProvider, llmModel, systemPrompt, claudeApiKey } = req.body;

  if (!name || !token) {
    return res.status(400).json({ error: 'Name und Token sind erforderlich' });
  }

  try {
    const bot = await telegramBotService.createBot(req.user.id, {
      name,
      token,
      llmProvider,
      llmModel,
      systemPrompt,
      claudeApiKey,
    });

    res.status(201).json({ bot });
  } catch (error) {
    logger.error('Error creating bot:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get bot details
router.get('/:id', async (req, res) => {
  try {
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);

    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    res.json({ bot });
  } catch (error) {
    logger.error('Error fetching bot:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Bots' });
  }
});

// Update bot
router.put('/:id', async (req, res) => {
  const { name, llmProvider, llmModel, systemPrompt, claudeApiKey, token } = req.body;

  try {
    const bot = await telegramBotService.updateBot(parseInt(req.params.id), req.user.id, {
      name,
      llmProvider,
      llmModel,
      systemPrompt,
      claudeApiKey,
      token,
    });

    res.json({ bot });
  } catch (error) {
    logger.error('Error updating bot:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete bot
router.delete('/:id', async (req, res) => {
  try {
    await telegramBotService.deleteBot(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting bot:', error);
    res.status(400).json({ error: error.message });
  }
});

// Activate bot
router.post('/:id/activate', async (req, res) => {
  try {
    const bot = await telegramBotService.activateBot(parseInt(req.params.id), req.user.id);

    // Set up webhook
    const webhookUrl = `${process.env.PUBLIC_URL || req.protocol + '://' + req.get('host')}/api/telegram-bots/webhook/${bot.id}/${req.body.secret || ''}`;

    // Get webhook secret from DB
    const botDetails = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);

    if (botDetails) {
      const fullWebhookUrl = `${process.env.PUBLIC_URL || 'https://your-domain.com'}/api/telegram-bots/webhook/${bot.id}/${botDetails.webhookSecret || 'secret'}`;

      try {
        // Only set webhook if PUBLIC_URL is configured
        if (process.env.PUBLIC_URL) {
          await telegramWebhookService.setWebhook(bot.id, fullWebhookUrl);
        }
      } catch (webhookError) {
        logger.warn('Could not set webhook, bot will work without it:', webhookError.message);
      }
    }

    res.json({ bot, message: 'Bot aktiviert' });
  } catch (error) {
    logger.error('Error activating bot:', error);
    res.status(400).json({ error: error.message });
  }
});

// Deactivate bot
router.post('/:id/deactivate', async (req, res) => {
  try {
    const bot = await telegramBotService.deactivateBot(parseInt(req.params.id), req.user.id);

    // Delete webhook
    try {
      await telegramWebhookService.deleteWebhook(bot.id);
    } catch (webhookError) {
      logger.warn('Could not delete webhook:', webhookError.message);
    }

    res.json({ bot, message: 'Bot deaktiviert' });
  } catch (error) {
    logger.error('Error deactivating bot:', error);
    res.status(400).json({ error: error.message });
  }
});

// Validate bot token
router.post('/validate-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token ist erforderlich' });
  }

  try {
    const botInfo = await telegramBotService.validateBotToken(token);

    if (!botInfo) {
      return res.status(400).json({ valid: false, error: 'Ungültiges Token' });
    }

    res.json({ valid: true, botInfo });
  } catch (error) {
    logger.error('Error validating token:', error);
    res.status(400).json({ valid: false, error: 'Validierung fehlgeschlagen' });
  }
});

// ----------------------------------------------------------------------------
// COMMANDS
// ----------------------------------------------------------------------------

// List commands for a bot
router.get('/:id/commands', async (req, res) => {
  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    const commands = await telegramBotService.getCommands(parseInt(req.params.id));
    res.json({ commands });
  } catch (error) {
    logger.error('Error fetching commands:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Commands' });
  }
});

// Create command
router.post('/:id/commands', async (req, res) => {
  const { command, description, prompt, sortOrder } = req.body;

  if (!command || !description || !prompt) {
    return res.status(400).json({ error: 'Command, Beschreibung und Prompt sind erforderlich' });
  }

  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    const cmd = await telegramBotService.createCommand(parseInt(req.params.id), {
      command,
      description,
      prompt,
      sortOrder,
    });

    res.status(201).json({ command: cmd });
  } catch (error) {
    logger.error('Error creating command:', error);
    res.status(400).json({ error: error.message });
  }
});

// Update command
router.put('/:id/commands/:cmdId', async (req, res) => {
  const { command, description, prompt, isEnabled, sortOrder } = req.body;

  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    const cmd = await telegramBotService.updateCommand(parseInt(req.params.cmdId), parseInt(req.params.id), {
      command,
      description,
      prompt,
      isEnabled,
      sortOrder,
    });

    res.json({ command: cmd });
  } catch (error) {
    logger.error('Error updating command:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete command
router.delete('/:id/commands/:cmdId', async (req, res) => {
  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    await telegramBotService.deleteCommand(parseInt(req.params.cmdId), parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting command:', error);
    res.status(400).json({ error: error.message });
  }
});

// ----------------------------------------------------------------------------
// CHATS
// ----------------------------------------------------------------------------

// List chats for a bot
router.get('/:id/chats', async (req, res) => {
  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    const chats = await telegramBotService.getChats(parseInt(req.params.id));
    res.json({ chats });
  } catch (error) {
    logger.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Chats' });
  }
});

// Remove chat from bot
router.delete('/:id/chats/:chatRowId', async (req, res) => {
  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    await telegramBotService.removeChat(parseInt(req.params.chatRowId), parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing chat:', error);
    res.status(400).json({ error: error.message });
  }
});

// ----------------------------------------------------------------------------
// SESSIONS
// ----------------------------------------------------------------------------

// Get session info
router.get('/:id/session/:chatId', async (req, res) => {
  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    const sessionInfo = await telegramLLMService.getSessionInfo(parseInt(req.params.id), parseInt(req.params.chatId));
    res.json({ session: sessionInfo });
  } catch (error) {
    logger.error('Error fetching session:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Session' });
  }
});

// Clear session
router.delete('/:id/session/:chatId', async (req, res) => {
  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    await telegramLLMService.clearSession(parseInt(req.params.id), parseInt(req.params.chatId));
    res.json({ success: true, message: 'Session gelöscht' });
  } catch (error) {
    logger.error('Error clearing session:', error);
    res.status(400).json({ error: error.message });
  }
});

// ----------------------------------------------------------------------------
// WEBHOOK INFO
// ----------------------------------------------------------------------------

// Get webhook info
router.get('/:id/webhook', async (req, res) => {
  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    const webhookInfo = await telegramWebhookService.getWebhookInfo(parseInt(req.params.id));
    res.json({ webhook: webhookInfo });
  } catch (error) {
    logger.error('Error fetching webhook info:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Webhook-Info' });
  }
});

// Set webhook manually
router.post('/:id/webhook', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL ist erforderlich' });
  }

  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    await telegramWebhookService.setWebhook(parseInt(req.params.id), url);
    res.json({ success: true, message: 'Webhook gesetzt' });
  } catch (error) {
    logger.error('Error setting webhook:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete webhook
router.delete('/:id/webhook', async (req, res) => {
  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    await telegramWebhookService.deleteWebhook(parseInt(req.params.id));
    res.json({ success: true, message: 'Webhook gelöscht' });
  } catch (error) {
    logger.error('Error deleting webhook:', error);
    res.status(400).json({ error: error.message });
  }
});

// Send test message
router.post('/:id/test-message', async (req, res) => {
  const { chatId, text } = req.body;

  if (!chatId || !text) {
    return res.status(400).json({ error: 'Chat-ID und Text sind erforderlich' });
  }

  try {
    // Verify bot ownership
    const bot = await telegramBotService.getBotById(parseInt(req.params.id), req.user.id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot nicht gefunden' });
    }

    const result = await telegramWebhookService.sendTestMessage(parseInt(req.params.id), chatId, text);
    res.json({ success: true, messageId: result.message_id });
  } catch (error) {
    logger.error('Error sending test message:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
