const TelegramBot = require('node-telegram-bot-api');
const logger = require('./utils/logger');

class Bot {
  constructor(token, options = {}) {
    this.token = token;
    this.options = {
      polling: options.polling !== false,
      ...options
    };
    this.bot = null;
    this.commands = new Map();
    this.messageHandlers = [];
  }

  async initialize() {
    if (!this.token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new TelegramBot(this.token, this.options);
    
    // Get bot info
    const me = await this.bot.getMe();
    logger.info(`Bot initialized: @${me.username} (ID: ${me.id})`);
    
    return me;
  }

  registerCommand(command, handler, description = '') {
    this.commands.set(command, { handler, description });
    
    // Register regex handler for the command
    const regex = new RegExp(`^/${command}(?:@\\w+)?(?:\\s+(.*))?$`);
    this.bot.onText(regex, async (msg, match) => {
      const chatId = msg.chat.id;
      const args = match[1] ? match[1].trim() : '';
      
      try {
        await handler(msg, args, this);
        logger.info(`Command /${command} executed`, { chatId, args });
      } catch (error) {
        logger.error(`Command /${command} failed`, { chatId, error: error.message });
        await this.sendMessage(chatId, `❌ Fehler: ${error.message}`);
      }
    });
  }

  registerMessageHandler(handler) {
    this.messageHandlers.push(handler);
  }

  setupMessageListener() {
    this.bot.on('message', async (msg) => {
      // Skip if it's a command
      if (msg.text && msg.text.startsWith('/')) {
        return;
      }

      for (const handler of this.messageHandlers) {
        try {
          await handler(msg, this);
        } catch (error) {
          logger.error('Message handler failed', { error: error.message });
        }
      }
    });
  }

  async sendMessage(chatId, text, options = {}) {
    const defaultOptions = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options
    };
    
    return this.bot.sendMessage(chatId, text, defaultOptions);
  }

  async setMyCommands() {
    const commands = [];
    for (const [name, { description }] of this.commands) {
      if (description) {
        commands.push({ command: name, description });
      }
    }
    
    if (commands.length > 0) {
      await this.bot.setMyCommands(commands);
      logger.info(`Registered ${commands.length} commands with Telegram`);
    }
  }

  getBot() {
    return this.bot;
  }

  async stop() {
    if (this.bot) {
      await this.bot.stopPolling();
      logger.info('Bot polling stopped');
    }
  }
}

module.exports = Bot;
