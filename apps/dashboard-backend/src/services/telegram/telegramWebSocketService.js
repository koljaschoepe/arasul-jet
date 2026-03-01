// Re-export shim: telegramWebSocketService -> telegramOrchestratorService.webSocketService
// The original exported a singleton TelegramWebSocketService instance
module.exports = require('./telegramOrchestratorService').webSocketService;
