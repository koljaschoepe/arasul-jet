// Re-export shim: telegramAppService -> telegramIntegrationService
// Exposes app methods as an object (original was `new TelegramAppService()`)
const integration = require('./telegramIntegrationService');
module.exports = {
  isIconVisible: integration.isIconVisible,
  getAppStatus: integration.getAppStatus,
  getDashboardAppData: integration.getDashboardAppData,
  activateApp: integration.activateApp,
  updateSettings: integration.updateSettings,
  recordActivity: integration.recordActivity,
  getGlobalStats: integration.getGlobalStats,
};
