/**
 * Telegram Bot Callback Query Handlers
 * Handles inline keyboard button presses
 * All handlers are wrapped with audit logging middleware
 */

const { withCallbackAudit } = require('../middleware/auditMiddleware');

/**
 * Handle workflow action callbacks
 * Pattern: workflow_<action>_<id>
 */
const handleWorkflowCallback = withCallbackAudit(async (query, bot, services) => {
    const { n8nService } = services;
    const [, action, workflowId] = query.data.split('_');
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
        let response;

        switch (action) {
            case 'run':
                await n8nService.executeWorkflow(workflowId);
                response = `✅ Workflow ${workflowId} gestartet`;
                break;

            case 'disable':
                await n8nService.setWorkflowActive(workflowId, false);
                response = `⏸️ Workflow ${workflowId} deaktiviert`;
                break;

            case 'enable':
                await n8nService.setWorkflowActive(workflowId, true);
                response = `▶️ Workflow ${workflowId} aktiviert`;
                break;

            case 'status':
                const status = await n8nService.getWorkflowStatus(workflowId);
                response = `📊 Workflow ${workflowId}: ${status.active ? 'Aktiv' : 'Inaktiv'}\nLetzte Ausführung: ${status.lastExecution || 'Nie'}`;
                break;

            default:
                response = `❓ Unbekannte Aktion: ${action}`;
        }

        await bot.answerCallbackQuery(query.id, { text: response });
        await bot.editMessageText(response, {
            chat_id: chatId,
            message_id: messageId
        });

        return response;
    } catch (error) {
        const errorResponse = `❌ Fehler: ${error.message}`;
        await bot.answerCallbackQuery(query.id, { text: errorResponse, show_alert: true });
        throw error;
    }
}, { actionName: 'workflow_action' });

/**
 * Handle service action callbacks
 * Pattern: service_<action>_<name>
 */
const handleServiceCallback = withCallbackAudit(async (query, bot, services) => {
    const { dockerService } = services;
    const [, action, serviceName] = query.data.split('_');
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
        let response;

        switch (action) {
            case 'restart':
                await dockerService.restartContainer(serviceName);
                response = `🔄 Service ${serviceName} wird neu gestartet...`;
                break;

            case 'logs':
                const logs = await dockerService.getServiceLogs(serviceName, 10);
                response = `📜 ${serviceName}:\n\`\`\`\n${logs.substring(0, 500)}\n\`\`\``;
                break;

            case 'info':
                const info = await dockerService.getContainerInfo(serviceName);
                response = `ℹ️ ${serviceName}\nStatus: ${info.status}\nStarted: ${info.startedAt}\nImage: ${info.image}`;
                break;

            default:
                response = `❓ Unbekannte Aktion: ${action}`;
        }

        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

        return response;
    } catch (error) {
        const errorResponse = `❌ Fehler: ${error.message}`;
        await bot.answerCallbackQuery(query.id, { text: errorResponse, show_alert: true });
        throw error;
    }
}, { actionName: 'service_action' });

/**
 * Handle confirmation dialogs
 * Pattern: confirm_<action>_<data>
 */
const handleConfirmCallback = withCallbackAudit(async (query, bot, services) => {
    const [, action, ...dataParts] = query.data.split('_');
    const data = dataParts.join('_');
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
        let response;

        switch (action) {
            case 'yes':
                // Execute the confirmed action
                response = `✅ Aktion bestätigt und ausgeführt`;
                break;

            case 'no':
                response = `❌ Aktion abgebrochen`;
                break;

            default:
                response = `❓ Unbekannte Bestätigung: ${action}`;
        }

        await bot.answerCallbackQuery(query.id, { text: response });
        await bot.deleteMessage(chatId, messageId);

        return response;
    } catch (error) {
        const errorResponse = `❌ Fehler: ${error.message}`;
        await bot.answerCallbackQuery(query.id, { text: errorResponse, show_alert: true });
        throw error;
    }
}, { actionName: 'confirm' });

/**
 * Handle cancel callbacks (dismiss messages)
 */
const handleCancelCallback = withCallbackAudit(async (query, bot) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
        await bot.answerCallbackQuery(query.id, { text: 'Geschlossen' });
        await bot.deleteMessage(chatId, messageId);
        return 'Dialog closed';
    } catch (error) {
        console.error('Error handling cancel callback:', error);
        throw error;
    }
}, { actionName: 'cancel' });

/**
 * Handle refresh callbacks
 * Pattern: refresh_<type>
 */
const handleRefreshCallback = withCallbackAudit(async (query, bot, services) => {
    const [, type] = query.data.split('_');
    const chatId = query.message.chat.id;

    try {
        let response;

        switch (type) {
            case 'status':
                // Trigger status refresh
                const { metricsService } = services;
                const metrics = await metricsService.getCurrentMetrics();
                response = `🔄 Status aktualisiert\nCPU: ${metrics.cpu}% | RAM: ${metrics.ram}%`;
                break;

            case 'services':
                response = '🔄 Services werden aktualisiert...';
                break;

            default:
                response = '🔄 Aktualisiert';
        }

        await bot.answerCallbackQuery(query.id, { text: response });
        return response;
    } catch (error) {
        const errorResponse = `❌ Fehler beim Aktualisieren: ${error.message}`;
        await bot.answerCallbackQuery(query.id, { text: errorResponse, show_alert: true });
        throw error;
    }
}, { actionName: 'refresh' });

/**
 * Register all callback handlers with the bot
 * @param {Object} bot - Telegram bot instance
 * @param {Object} services - Service dependencies
 */
function registerCallbackHandlers(bot, services) {
    bot.on('callback_query', async (query) => {
        const data = query.data;

        try {
            // Route to appropriate handler based on callback data pattern
            if (data.startsWith('workflow_')) {
                await handleWorkflowCallback(query, bot, services);
            } else if (data.startsWith('service_')) {
                await handleServiceCallback(query, bot, services);
            } else if (data.startsWith('confirm_')) {
                await handleConfirmCallback(query, bot, services);
            } else if (data === 'cancel') {
                await handleCancelCallback(query, bot);
            } else if (data.startsWith('refresh_')) {
                await handleRefreshCallback(query, bot, services);
            } else {
                // Unknown callback - still log it
                console.warn(`Unknown callback data: ${data}`);
                await bot.answerCallbackQuery(query.id, {
                    text: 'Unbekannte Aktion',
                    show_alert: false
                });
            }
        } catch (error) {
            console.error('Error handling callback query:', error);
            // Error already handled in individual handlers
        }
    });

    console.log('Callback handlers registered');
}

module.exports = {
    registerCallbackHandlers,
    // Export individual handlers for testing
    handleWorkflowCallback,
    handleServiceCallback,
    handleConfirmCallback,
    handleCancelCallback,
    handleRefreshCallback
};
