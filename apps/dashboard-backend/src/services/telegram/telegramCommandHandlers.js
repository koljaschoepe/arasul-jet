/**
 * Telegram Command Handlers
 *
 * All bot command handlers (/start, /help, /clear, etc.) and
 * message processing (text, voice, user access control).
 *
 * Extracted from telegramIngressService.js for maintainability.
 */

const database = require('../../database');
const logger = require('../../utils/logger');
const telegramBotService = require('./telegramBotService');
const telegramIntegrationService = require('./telegramIntegrationService');
const cryptoService = require('../core/cryptoService');
const { hashUserId } = require('../../utils/telegramHmac');
const {
  sendMessage,
  sendTypingAction,
  sendFormattedMessage,
  TELEGRAM_API,
} = require('./telegramMessageSender');

// =============================================================================
// DSGVO Consent (Phase 6.2)
// =============================================================================

const CONSENT_NOTICE_VERSION = 'v1';

/**
 * Build the Art. 13 DSGVO notice the bot serves on /start and /datenschutz.
 * The "Verantwortlicher" line is intentionally empty for now — the bot row
 * should carry the customer's controller text once that field is added.
 */
function buildDsgvoNotice(bot) {
  return `🔒 <b>Datenschutz-Hinweis</b>

Bevor du diesen Bot nutzen kannst, müssen wir dich kurz aufklären:

<b>Was wird verarbeitet?</b>
Deine Telegram-Nachrichten werden auf einer Arasul-Appliance lokal verarbeitet, um KI-Antworten zu generieren. Sprachnachrichten werden transkribiert.

<b>Wer ist Verantwortlicher?</b>
${bot.controller_name || bot.name || 'Der Betreiber dieses Bots'}.

<b>Drittlandtransfer:</b>
Telegram (Sitz: VAE/UK) ist die Übertragungsplattform — deine Nachrichten laufen also durch Telegram-Server außerhalb der EU. Rechtsgrundlage hierfür ist Art. 49 (1) lit. a DSGVO (deine ausdrückliche Einwilligung). Mehr Schutz bietet die Web-Chat-Variante im Arasul-Dashboard.

<b>Speicherdauer:</b>
Fehler-Protokolle 14 Tage; deine Chat-Historie wird in deinem Konto auf der Appliance gespeichert, bis du sie mit /loeschen entfernst.

<b>Deine Rechte:</b>
/auskunft — gespeicherte Daten anzeigen
/loeschen — alle Daten löschen
/datenschutz — diesen Hinweis erneut anzeigen

Möchtest du fortfahren?`;
}

function consentKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '✅ Ich willige ein', callback_data: 'consent_grant' },
        { text: '❌ Ablehnen', callback_data: 'consent_deny' },
      ],
    ],
  };
}

/**
 * Returns true if the user has granted consent for this bot. Used as a gate
 * before any free-form text is forwarded to the LLM.
 */
async function hasConsent(botId, telegramUserId) {
  const userIdHash = hashUserId(telegramUserId);
  if (!userIdHash) {
    return false;
  }
  const row = await telegramBotService.getConsentStatus(botId, userIdHash);
  return row?.consent_status === 'granted';
}

/**
 * Handle the consent inline-keyboard callback.
 * @returns {Promise<{handled: boolean}>}
 */
async function handleConsentCallback(bot, token, callbackQuery) {
  const data = callbackQuery.data;
  if (data !== 'consent_grant' && data !== 'consent_deny') {
    return { handled: false };
  }

  const chatId = callbackQuery.message?.chat?.id;
  const userId = callbackQuery.from?.id;
  const userIdHash = hashUserId(userId);

  if (!chatId || !userIdHash) {
    logger.warn('consent callback missing chat/user');
    return { handled: true };
  }

  if (data === 'consent_grant') {
    await telegramBotService.recordConsent(
      bot.id,
      userIdHash,
      chatId,
      'granted',
      CONSENT_NOTICE_VERSION
    );
    await sendMessage(
      token,
      chatId,
      `✅ Vielen Dank — du kannst den Bot jetzt nutzen.\n\nSchreibe einfach eine Nachricht. Mit /help siehst du alle Befehle.`
    );
  } else {
    await telegramBotService.recordConsent(
      bot.id,
      userIdHash,
      chatId,
      'denied',
      CONSENT_NOTICE_VERSION
    );
    await sendMessage(
      token,
      chatId,
      `🙏 Verstanden — der Bot wird deine Nachrichten nicht verarbeiten. Schreibe /start, falls du es dir später anders überlegst.`
    );
  }

  return { handled: true };
}

// =============================================================================
// Bot Commands
// =============================================================================

/**
 * Handle /start command - register chat
 */
async function handleStartCommand(
  bot,
  token,
  message,
  { validateTelegramMessage, notifySetupSessionIfExists }
) {
  const validation = validateTelegramMessage(message);
  if (!validation.valid) {
    logger.error(`Invalid message in handleStartCommand: ${validation.error}`);
    return false;
  }

  const chatId = validation.chatId;
  const chatType = message.chat.type || 'private';
  const chatTitle = message.chat.title || message.from?.first_name || 'Unknown';
  const chatUsername = message.chat.username || message.from?.username || null;
  const firstName = message.from?.first_name || null;
  const userId = message.from?.id;

  try {
    await telegramBotService.addChat(bot.id, {
      chatId,
      title: chatTitle,
      type: chatType,
      username: chatUsername,
    });

    // Setup-wizard handshake (zero-config): notify any waiting setup session.
    // Runs unconditionally — the wizard is one-shot and only matches its own token.
    await notifySetupSessionIfExists(chatId, chatUsername, firstName, chatType, token);

    // DSGVO consent gate. Existing 'granted' users skip straight to the welcome;
    // anyone else gets the Art. 13 notice + inline keyboard.
    const userIdHash = hashUserId(userId);
    const consent = userIdHash
      ? await telegramBotService.getConsentStatus(bot.id, userIdHash)
      : null;

    if (consent?.consent_status === 'granted') {
      const welcomeText = `🤖 <b>Willkommen zurück bei ${bot.name}!</b>

Schreib mir einfach eine Nachricht — ich antworte dir.

<b>Befehle:</b>
/help — Hilfe · /clear — Kontext leeren · /datenschutz — Datenschutz · /loeschen — Daten löschen
🎤 Sprachnachrichten werden automatisch transkribiert.`;
      await sendMessage(token, chatId, welcomeText);
    } else {
      await sendMessage(token, chatId, buildDsgvoNotice(bot), {
        reply_markup: consentKeyboard(),
      });
    }

    logger.info(`Chat registered: ${chatId} (${chatType}) for bot ${bot.id}`);
    return true;
  } catch (error) {
    logger.error(`Error in handleStartCommand for chat ${chatId}:`, error);
    return false;
  }
}

/**
 * Handle /datenschutz - re-send the Art. 13 notice with the inline keyboard.
 */
async function handleDatenschutzCommand(bot, token, message) {
  const chatId = message.chat?.id;
  if (!chatId) {
    return false;
  }
  await sendMessage(token, chatId, buildDsgvoNotice(bot), {
    reply_markup: consentKeyboard(),
  });
  return true;
}

/**
 * Handle /loeschen - withdraw consent + delete user history.
 * Both the consent row and the chat row are dropped. The user's chat history
 * still lives in n8n.execution_data / message tables until those prune naturally.
 */
async function handleLoeschenCommand(bot, token, message) {
  const chatId = message.chat?.id;
  const userId = message.from?.id;
  if (!chatId) {
    return false;
  }

  const userIdHash = hashUserId(userId);
  if (!userIdHash) {
    await sendMessage(token, chatId, 'Konnte dich nicht identifizieren — bitte schreibe /start.');
    return false;
  }

  try {
    await telegramBotService.recordConsent(
      bot.id,
      userIdHash,
      chatId,
      'withdrawn',
      CONSENT_NOTICE_VERSION
    );
    // Drop the chat row so the bot stops sending messages here. Chat-history
    // tables are pruned by their own retention; the customer's DPO contact
    // can request a manual purge via the dashboard if needed.
    await database.query(`DELETE FROM telegram_user_chats WHERE bot_id = $1 AND chat_id = $2`, [
      bot.id,
      String(chatId),
    ]);
  } catch (err) {
    logger.error(`Error in handleLoeschenCommand: ${err.message}`);
  }

  await sendMessage(
    token,
    chatId,
    '🗑️ Deine Zustimmung wurde widerrufen und der Chat wurde aus dem Bot-Kontext entfernt. Schreibe /start, um es dir anders zu überlegen.'
  );
  return true;
}

/**
 * Handle /auskunft - return what the appliance has on this user.
 * Plain summary, not a full export — that's a separate dashboard flow.
 */
async function handleAuskunftCommand(bot, token, message) {
  const chatId = message.chat?.id;
  const userId = message.from?.id;
  if (!chatId) {
    return false;
  }

  const userIdHash = hashUserId(userId);
  let consentLine = 'Kein Eintrag vorhanden.';
  let chatLine = '–';

  try {
    if (userIdHash) {
      const consent = await telegramBotService.getConsentStatus(bot.id, userIdHash);
      if (consent) {
        consentLine = `${consent.consent_status} (seit ${new Date(consent.consented_at).toISOString().slice(0, 10)})`;
      }
    }
    const chatResult = await database.query(
      `SELECT chat_title, chat_type, registered_at
       FROM telegram_user_chats
       WHERE bot_id = $1 AND chat_id = $2`,
      [bot.id, String(chatId)]
    );
    if (chatResult.rows[0]) {
      chatLine = `${chatResult.rows[0].chat_type} "${chatResult.rows[0].chat_title}" (registriert ${new Date(chatResult.rows[0].registered_at).toISOString().slice(0, 10)})`;
    }
  } catch (err) {
    logger.error(`Error in handleAuskunftCommand: ${err.message}`);
  }

  const text = `📄 <b>Datenauskunft</b>

<b>Pseudonymer User-Hash:</b> <code>${userIdHash ? userIdHash.slice(0, 16) + '…' : '–'}</code>
<b>Einwilligung:</b> ${consentLine}
<b>Chat-Eintrag:</b> ${chatLine}

Volle Auskunft (inkl. Chat-Historie) kannst du beim Verantwortlichen anfordern. Mit /loeschen löschst du sofort.`;

  await sendMessage(token, chatId, text);
  return true;
}

/**
 * Handle /help command
 */
async function handleHelpCommand(bot, token, message) {
  const chatId = message.chat.id;

  const commands = await telegramBotService.getCommands(bot.id);
  const enabledCommands = commands.filter(c => c.isEnabled);

  let helpText = `🤖 <b>${bot.name} - Hilfe</b>

<b>Standard-Befehle:</b>
/start - Bot starten
/help - Diese Hilfe anzeigen
/clear - Kontext leeren (neues Gespräch)
/commands - Alle Befehle anzeigen

<b>System-Tools:</b>
/tools - Verfügbare Tools anzeigen
/status - System-Status (CPU, RAM, GPU)
/services - Docker-Services anzeigen
/workflows - n8n Workflow-Status
/alerts - System-Alerts anzeigen
/query &lt;text&gt; - Datentabellen abfragen
/spaces - Wissens-Spaces anzeigen

<b>Einstellungen:</b>
/apikey - API Key Management

🎤 Sprachnachrichten werden automatisch transkribiert!`;

  if (enabledCommands.length > 0) {
    helpText += '\n\n<b>Eigene Befehle:</b>';
    for (const cmd of enabledCommands) {
      helpText += `\n/${cmd.command} - ${cmd.description}`;
    }
  }

  helpText += `\n\n💡 Oder schreib mir einfach eine Nachricht!`;

  await sendMessage(token, chatId, helpText);
}

/**
 * Handle /new or /clear command - clear session
 */
async function handleNewCommand(bot, token, message) {
  const chatId = message.chat.id;

  await telegramIntegrationService.clearSession(bot.id, chatId);

  await sendMessage(
    token,
    chatId,
    '🔄 <b>Kontext geleert!</b>\n\nNeues Gespräch gestartet. Wie kann ich dir helfen?'
  );
}

/**
 * Handle /tools command - list available system tools
 */
async function handleToolsCommand(bot, token, message) {
  const chatId = message.chat.id;

  try {
    const tools = await telegramIntegrationService.getAvailableTools();

    if (tools.length === 0) {
      await sendMessage(token, chatId, '🔧 <b>Keine System-Tools verfügbar.</b>');
      return;
    }

    let text = '🛠️ <b>Verfügbare System-Tools</b>\n\n';
    text += 'Du kannst mich nach folgenden System-Informationen fragen:\n\n';

    for (const tool of tools) {
      text += `• <b>${tool.name}</b> - ${tool.description}\n`;
    }

    text += '\n💡 <i>Beispiele:</i>\n';
    text += '- "Wie ist der CPU-Status?"\n';
    text += '- "Zeige die laufenden Services"\n';
    text += '- "Zeige mir die Logs vom Backend"';

    await sendMessage(token, chatId, text);
  } catch (error) {
    logger.error('Error fetching tools:', error);
    await sendMessage(token, chatId, '❌ Fehler beim Laden der Tools.');
  }
}

/**
 * Handle /status command - show system status directly
 */
async function handleStatusCommand(bot, token, message) {
  const chatId = message.chat.id;
  await sendTypingAction(token, chatId);

  try {
    const result = await telegramIntegrationService.executeTool(
      'status',
      {},
      { botId: bot.id, chatId }
    );
    await sendMessage(token, chatId, result, { parseMode: 'Markdown' });
  } catch (error) {
    logger.error('Status tool error:', error);
    await sendMessage(token, chatId, `❌ Fehler: ${error.message}`);
  }
}

/**
 * Handle /services command - show docker services
 */
async function handleServicesCommand(bot, token, message) {
  const chatId = message.chat.id;
  await sendTypingAction(token, chatId);

  try {
    const result = await telegramIntegrationService.executeTool(
      'services',
      {},
      { botId: bot.id, chatId }
    );
    await sendMessage(token, chatId, result, { parseMode: 'Markdown' });
  } catch (error) {
    logger.error('Services tool error:', error);
    await sendMessage(token, chatId, `❌ Fehler: ${error.message}`);
  }
}

/**
 * Handle generic tool command (for /workflows, /alerts, /query)
 */
async function handleToolCommand(bot, token, message, toolName, params = {}) {
  const chatId = message.chat.id;
  await sendTypingAction(token, chatId);

  try {
    const result = await telegramIntegrationService.executeTool(toolName, params, {
      botId: bot.id,
      chatId,
    });
    await sendFormattedMessage(token, chatId, result);
  } catch (error) {
    logger.error(`Tool ${toolName} error:`, error);
    await sendMessage(token, chatId, `❌ Fehler: ${error.message}`);
  }
}

/**
 * Handle /spaces command - show available knowledge spaces
 */
async function handleSpacesCommand(bot, token, message) {
  const chatId = message.chat.id;

  try {
    const result = await database.query(
      `SELECT name, description,
              (SELECT COUNT(*) FROM documents d WHERE d.space_id = ks.id) as doc_count
       FROM knowledge_spaces ks
       ORDER BY name`
    );

    if (result.rows.length === 0) {
      await sendMessage(token, chatId, '📚 Keine Wissens-Spaces vorhanden.');
      return;
    }

    let text = '📚 <b>Verfügbare Wissens-Spaces:</b>\n';
    for (const space of result.rows) {
      text += `\n• <b>${space.name}</b> (${space.doc_count} Dok.)`;
      if (space.description) {
        text += `\n  <i>${space.description.substring(0, 80)}</i>`;
      }
    }

    await sendMessage(token, chatId, text);
  } catch (error) {
    if (error.message.includes('does not exist')) {
      await sendMessage(token, chatId, '📚 Wissens-Spaces sind nicht verfügbar.');
    } else {
      logger.error('Spaces command error:', error);
      await sendMessage(token, chatId, `❌ Fehler: ${error.message}`);
    }
  }
}

/**
 * Handle /commands command - list all custom commands
 */
async function handleCommandsCommand(bot, token, message) {
  const chatId = message.chat.id;

  const commands = await telegramBotService.getCommands(bot.id);
  const enabledCommands = commands.filter(c => c.isEnabled);

  if (enabledCommands.length === 0) {
    await sendMessage(
      token,
      chatId,
      '📋 <b>Keine eigenen Befehle konfiguriert.</b>\n\nSchreib mir einfach eine Nachricht!'
    );
    return;
  }

  let text = '📋 <b>Verfügbare Befehle:</b>\n';

  for (const cmd of enabledCommands) {
    text += `\n<b>/${cmd.command}</b>\n  ${cmd.description}\n`;
  }

  await sendMessage(token, chatId, text);
}

/**
 * Handle custom command (user-defined)
 */
async function handleCustomCommand(bot, token, message, command, args) {
  const chatId = message.chat.id;
  await sendTypingAction(token, chatId);

  try {
    const response = await telegramIntegrationService.executeCommand(bot.id, chatId, command, args);

    if (response === null) {
      await sendMessage(
        token,
        chatId,
        `❓ Unbekannter Befehl: /${command}\n\nNutze /commands für eine Liste aller Befehle.`
      );
      return;
    }

    await sendMessage(token, chatId, response);
  } catch (error) {
    logger.error(`Command execution error (/${command}):`, error);
    await sendMessage(token, chatId, `❌ Fehler: ${error.message}`);
  }
}

// =============================================================================
// Message Handlers
// =============================================================================

/**
 * Handle text message (LLM chat)
 */
async function handleTextMessage(bot, token, message) {
  const chatId = message.chat.id;
  const text = message.text;

  await sendTypingAction(token, chatId);
  const typingInterval = setInterval(() => {
    sendTypingAction(token, chatId).catch(() => {});
  }, 4000);

  try {
    const response = await telegramIntegrationService.chat(bot.id, chatId, text);
    await sendFormattedMessage(token, chatId, response);
  } catch (error) {
    logger.error('LLM chat error:', error);
    await sendMessage(token, chatId, `❌ Fehler: ${error.message}`).catch(() => {});
  } finally {
    clearInterval(typingInterval);
  }
}

/**
 * Handle /apikey command - manage API keys
 */
async function handleApiKeyCommand(bot, token, message, args) {
  const chatId = message.chat.id;

  const parts = args.trim().split(/\s+/);
  const action = parts[0]?.toLowerCase();
  const provider = parts[1]?.toLowerCase();
  const apiKey = parts.slice(2).join(' ');

  // Delete the message containing the API key for security
  if (action === 'set' && apiKey) {
    try {
      await fetch(`${TELEGRAM_API}${token}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: message.message_id,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      logger.warn('Could not delete message with API key:', error.message);
    }
  }

  if (!action || action === 'help') {
    const helpText = `🔑 <b>API Key Management</b>

<b>Befehle:</b>
<code>/apikey set claude &lt;key&gt;</code> - Claude API Key setzen
<code>/apikey set openai &lt;key&gt;</code> - OpenAI API Key setzen (für Whisper)
<code>/apikey delete claude</code> - Claude API Key löschen
<code>/apikey delete openai</code> - OpenAI API Key löschen
<code>/apikey status</code> - Status der API Keys

⚠️ <b>Hinweis:</b> Nachrichten mit API Keys werden automatisch geloescht.`;

    await sendMessage(token, chatId, helpText);
    return;
  }

  if (action === 'status') {
    try {
      const result = await database.query(
        `SELECT
           CASE WHEN claude_api_key_encrypted IS NOT NULL THEN true ELSE false END as has_claude,
           CASE WHEN openai_api_key_encrypted IS NOT NULL THEN true ELSE false END as has_openai
         FROM telegram_bots WHERE id = $1`,
        [bot.id]
      );

      if (result.rows.length === 0) {
        await sendMessage(token, chatId, '❌ Bot nicht gefunden.');
        return;
      }

      const { has_claude, has_openai } = result.rows[0];

      const statusText = `🔑 <b>API Key Status</b>

• Claude API: ${has_claude ? '✅ Konfiguriert' : '❌ Nicht gesetzt'}
• OpenAI API: ${has_openai ? '✅ Konfiguriert' : '❌ Nicht gesetzt'}

${!has_openai ? '💡 Fuer Sprachnachrichten wird ein OpenAI API Key benoetigt.' : ''}`;

      await sendMessage(token, chatId, statusText);
    } catch (error) {
      logger.error('Error checking API key status:', error);
      await sendMessage(token, chatId, '❌ Fehler beim Abrufen des Status.');
    }
    return;
  }

  if (action === 'set') {
    if (!provider || !['claude', 'openai'].includes(provider)) {
      await sendMessage(
        token,
        chatId,
        '❌ Ungültiger Provider. Nutze: <code>claude</code> oder <code>openai</code>'
      );
      return;
    }

    if (!apiKey) {
      await sendMessage(token, chatId, '❌ Kein API Key angegeben.');
      return;
    }

    try {
      const { encrypted, iv, authTag } = cryptoService.encrypt(apiKey);
      const column = provider === 'claude' ? 'claude_api_key' : 'openai_api_key';

      await database.query(
        `UPDATE telegram_bots
         SET ${column}_encrypted = $1,
             ${column}_iv = $2,
             ${column}_auth_tag = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [encrypted, iv, authTag, bot.id]
      );

      await sendMessage(token, chatId, `✅ ${provider.toUpperCase()} API Key wurde gespeichert.`);
      logger.info(`API key set for bot ${bot.id}: ${provider}`);
    } catch (error) {
      logger.error('Error setting API key:', error);
      await sendMessage(token, chatId, '❌ Fehler beim Speichern des API Keys.');
    }
    return;
  }

  if (action === 'delete') {
    if (!provider || !['claude', 'openai'].includes(provider)) {
      await sendMessage(
        token,
        chatId,
        '❌ Ungültiger Provider. Nutze: <code>claude</code> oder <code>openai</code>'
      );
      return;
    }

    try {
      const column = provider === 'claude' ? 'claude_api_key' : 'openai_api_key';

      await database.query(
        `UPDATE telegram_bots
         SET ${column}_encrypted = NULL,
             ${column}_iv = NULL,
             ${column}_auth_tag = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [bot.id]
      );

      await sendMessage(token, chatId, `✅ ${provider.toUpperCase()} API Key wurde geloescht.`);
      logger.info(`API key deleted for bot ${bot.id}: ${provider}`);
    } catch (error) {
      logger.error('Error deleting API key:', error);
      await sendMessage(token, chatId, '❌ Fehler beim Löschen des API Keys.');
    }
    return;
  }

  await sendMessage(
    token,
    chatId,
    '❌ Unbekannte Aktion. Nutze <code>/apikey help</code> für Hilfe.'
  );
}

/**
 * Handle voice message
 */
async function handleVoiceMessage(bot, token, message) {
  const chatId = message.chat.id;

  await sendTypingAction(token, chatId);

  if (bot.voice_enabled === false || !telegramIntegrationService.isVoiceEnabled()) {
    await sendMessage(token, chatId, '🎤 Sprachnachrichten sind für diesen Bot deaktiviert.');
    return;
  }

  try {
    await sendMessage(token, chatId, '🎤 <i>Transkribiere Sprachnachricht...</i>');

    const result = await telegramIntegrationService.processVoiceMessage(
      bot.id,
      token,
      message.voice
    );

    if (!result.success) {
      await sendMessage(token, chatId, `❌ ${result.error}`);
      return;
    }

    await sendMessage(token, chatId, `📝 <b>Transkript:</b>\n<i>"${result.text}"</i>`);

    await sendTypingAction(token, chatId);
    const response = await telegramIntegrationService.chat(bot.id, chatId, result.text);
    await sendMessage(token, chatId, response);
  } catch (error) {
    logger.error('Voice message error:', error);
    await sendMessage(token, chatId, `❌ Fehler bei der Sprachverarbeitung: ${error.message}`);
  }
}

// =============================================================================
// Access Control
// =============================================================================

/**
 * Check if user is allowed to use the bot
 */
async function isUserAllowed(bot, userId) {
  try {
    const result = await database.query(
      `SELECT restrict_users, allowed_users FROM telegram_bots WHERE id = $1`,
      [bot.id]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const { restrict_users, allowed_users } = result.rows[0];

    if (!restrict_users) {
      return true;
    }

    const allowedList = allowed_users || [];
    return allowedList.includes(userId) || allowedList.includes(String(userId));
  } catch (error) {
    if (error.message.includes('does not exist')) {
      return true;
    }
    logger.error('Error checking user access:', error);
    return true; // Fail open
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  handleStartCommand,
  handleHelpCommand,
  handleNewCommand,
  handleToolsCommand,
  handleStatusCommand,
  handleServicesCommand,
  handleToolCommand,
  handleSpacesCommand,
  handleCommandsCommand,
  handleCustomCommand,
  handleTextMessage,
  handleApiKeyCommand,
  handleVoiceMessage,
  isUserAllowed,
  // Phase 6.2 DSGVO consent
  handleDatenschutzCommand,
  handleLoeschenCommand,
  handleAuskunftCommand,
  handleConsentCallback,
  hasConsent,
};
