// Re-export shim: telegramVoiceService -> telegramIntegrationService
// Maps old function names to new names
const integration = require('./telegramIntegrationService');
module.exports = {
  isEnabled: integration.isVoiceEnabled,
  processVoiceMessage: integration.processVoiceMessage,
  cleanupOldFiles: integration.cleanupOldFiles,
  MAX_VOICE_DURATION_SECONDS: integration.MAX_VOICE_DURATION_SECONDS,
};
