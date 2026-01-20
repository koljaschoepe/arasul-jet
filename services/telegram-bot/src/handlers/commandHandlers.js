/**
 * Telegram Bot Command Handlers
 * All handlers are wrapped with audit logging middleware
 */

const { withAudit } = require('../middleware/auditMiddleware');

/**
 * /start command handler
 * Activates the bot and saves chat ID
 */
const handleStart = withAudit(async (msg, match, bot, services) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username || msg.from?.first_name || 'User';

    const response = `Hallo ${username}! 👋

Der Arasul Bot ist aktiviert.

Verfügbare Befehle:
/status - System-Übersicht
/services - Service-Status
/logs <service> - Log-Ausgabe
/disk - Speicher-Details
/help - Befehlsübersicht

Sende eine Nachricht ohne /, um mit Claude Code zu kommunizieren.`;

    await bot.sendMessage(chatId, response);
    return response;
}, { commandName: '/start' });

/**
 * /help command handler
 * Shows available commands
 */
const handleHelp = withAudit(async (msg, match, bot, services) => {
    const chatId = msg.chat.id;

    const response = `📖 *Arasul Bot - Befehlsübersicht*

*System-Befehle:*
/status - System-Übersicht (CPU, RAM, Disk, GPU)
/services - Status aller Services
/logs <service> - Letzte 20 Log-Zeilen
/disk - Detaillierte Speicher-Info

*Workflow-Befehle:*
/workflows - Liste aller n8n Workflows
/workflow <id> status - Workflow-Status
/workflow <id> run - Workflow starten

*Claude Code:*
/ask <nachricht> - An Claude Code senden
/queue - Warteschlange anzeigen
/session - Session-Status

*Sonstige:*
/help - Diese Hilfe
/audit - Letzte Interaktionen`;

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    return response;
}, { commandName: '/help' });

/**
 * /status command handler
 * Shows system metrics overview
 */
const handleStatus = withAudit(async (msg, match, bot, services) => {
    const chatId = msg.chat.id;
    const { metricsService, dockerService } = services;

    try {
        const metrics = await metricsService.getCurrentMetrics();
        const serviceCount = await dockerService.getRunningServiceCount();

        // Create progress bars
        const bar = (percent) => {
            const filled = Math.round(percent / 10);
            return '█'.repeat(filled) + '░'.repeat(10 - filled);
        };

        const response = `📊 *System Status*

CPU:  ${bar(metrics.cpu)}  ${metrics.cpu.toFixed(0)}%
RAM:  ${bar(metrics.ram)}  ${metrics.ram.toFixed(0)}%
Disk: ${bar(metrics.disk)}  ${metrics.disk.toFixed(0)}%
GPU:  ${bar(metrics.gpu)}  ${metrics.gpuTemp?.toFixed(0) || 'N/A'}°C

Services: ${serviceCount.running}/${serviceCount.total} online ✓
Uptime: ${metrics.uptime || 'N/A'}

_Letzte Aktualisierung: ${new Date().toLocaleTimeString('de-DE')}_`;

        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return response;
    } catch (error) {
        const errorResponse = `❌ Fehler beim Abrufen der Metriken: ${error.message}`;
        await bot.sendMessage(chatId, errorResponse);
        throw error;
    }
}, { commandName: '/status' });

/**
 * /services command handler
 * Shows status of all Docker services
 */
const handleServices = withAudit(async (msg, match, bot, services) => {
    const chatId = msg.chat.id;
    const { dockerService } = services;

    try {
        const containerStatuses = await dockerService.getAllContainerStatuses();

        const statusEmoji = (status) => {
            switch (status) {
                case 'running': return '✅';
                case 'healthy': return '✅';
                case 'unhealthy': return '⚠️';
                case 'starting': return '🔄';
                case 'exited': return '❌';
                default: return '❓';
            }
        };

        const lines = containerStatuses.map(c =>
            `${statusEmoji(c.status)} ${c.name}: ${c.status}`
        );

        const response = `🐳 *Service Status*

${lines.join('\n')}

_${containerStatuses.filter(c => c.status === 'running' || c.status === 'healthy').length}/${containerStatuses.length} Services online_`;

        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return response;
    } catch (error) {
        const errorResponse = `❌ Fehler beim Abrufen der Services: ${error.message}`;
        await bot.sendMessage(chatId, errorResponse);
        throw error;
    }
}, { commandName: '/services' });

/**
 * /logs command handler
 * Shows last 20 log lines for a service
 */
const handleLogs = withAudit(async (msg, match, bot, services) => {
    const chatId = msg.chat.id;
    const { dockerService } = services;

    const serviceName = match?.[1]?.trim();

    if (!serviceName) {
        const response = '⚠️ Bitte Service-Namen angeben: `/logs <service>`\n\nBeispiel: `/logs llm-service`';
        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return response;
    }

    try {
        const logs = await dockerService.getServiceLogs(serviceName, 20);

        if (!logs || logs.length === 0) {
            const response = `ℹ️ Keine Logs für Service \`${serviceName}\` gefunden.`;
            await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
            return response;
        }

        // Truncate long logs for Telegram (max 4096 chars)
        let logText = logs;
        if (logText.length > 3500) {
            logText = logText.substring(logText.length - 3500);
            logText = '...\n' + logText.substring(logText.indexOf('\n') + 1);
        }

        const response = `📜 *Logs: ${serviceName}*\n\n\`\`\`\n${logText}\n\`\`\``;

        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return `[Logs for ${serviceName}]`;
    } catch (error) {
        const errorResponse = `❌ Fehler beim Abrufen der Logs: ${error.message}`;
        await bot.sendMessage(chatId, errorResponse);
        throw error;
    }
}, { commandName: '/logs' });

/**
 * /disk command handler
 * Shows detailed disk usage
 */
const handleDisk = withAudit(async (msg, match, bot, services) => {
    const chatId = msg.chat.id;
    const { metricsService } = services;

    try {
        const diskInfo = await metricsService.getDiskInfo();

        const formatBytes = (bytes) => {
            const gb = bytes / (1024 * 1024 * 1024);
            return `${gb.toFixed(1)} GB`;
        };

        const response = `💾 *Speicher-Details*

*Haupt-Volume:*
Verwendet: ${formatBytes(diskInfo.used)}
Verfügbar: ${formatBytes(diskInfo.free)}
Gesamt: ${formatBytes(diskInfo.total)}
Auslastung: ${diskInfo.percent.toFixed(1)}%

${diskInfo.percent > 85 ? '⚠️ Speicherplatz wird knapp!' : '✅ Speicherplatz OK'}`;

        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return response;
    } catch (error) {
        const errorResponse = `❌ Fehler beim Abrufen der Disk-Info: ${error.message}`;
        await bot.sendMessage(chatId, errorResponse);
        throw error;
    }
}, { commandName: '/disk' });

/**
 * /audit command handler
 * Shows recent bot interactions
 */
const handleAudit = withAudit(async (msg, match, bot, services) => {
    const chatId = msg.chat.id;
    const auditLogService = require('../services/auditLogService');

    try {
        const { logs } = await auditLogService.getAuditLogs({ limit: 10 });

        if (logs.length === 0) {
            const response = 'ℹ️ Keine Audit-Einträge gefunden.';
            await bot.sendMessage(chatId, response);
            return response;
        }

        const lines = logs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString('de-DE');
            const cmd = log.command || 'msg';
            const status = log.success ? '✅' : '❌';
            const duration = log.response_time_ms ? `${log.response_time_ms}ms` : '-';
            return `${status} ${time} ${cmd} (${duration})`;
        });

        const response = `📋 *Letzte Interaktionen*

${lines.join('\n')}

_Zeige letzte 10 Einträge_`;

        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return response;
    } catch (error) {
        const errorResponse = `❌ Fehler beim Abrufen der Audit-Logs: ${error.message}`;
        await bot.sendMessage(chatId, errorResponse);
        throw error;
    }
}, { commandName: '/audit' });

/**
 * Register all command handlers with the bot
 * @param {Object} bot - Telegram bot instance
 * @param {Object} services - Service dependencies
 */
function registerCommandHandlers(bot, services) {
    // Inject bot and services into handlers
    const wrapHandler = (handler) => (msg, match) => handler(msg, match, bot, services);

    bot.onText(/\/start/, wrapHandler(handleStart));
    bot.onText(/\/help/, wrapHandler(handleHelp));
    bot.onText(/\/status/, wrapHandler(handleStatus));
    bot.onText(/\/services/, wrapHandler(handleServices));
    bot.onText(/\/logs(?:\s+(.+))?/, wrapHandler(handleLogs));
    bot.onText(/\/disk/, wrapHandler(handleDisk));
    bot.onText(/\/audit/, wrapHandler(handleAudit));

    console.log('Command handlers registered');
}

module.exports = {
    registerCommandHandlers,
    // Export individual handlers for testing
    handleStart,
    handleHelp,
    handleStatus,
    handleServices,
    handleLogs,
    handleDisk,
    handleAudit
};
