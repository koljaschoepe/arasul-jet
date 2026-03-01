// Re-export shim: telegramSetupPollingService -> telegramIngressService
// Maps old function names to new prefixed names
const ingress = require('./telegramIngressService');
module.exports = {
  startPolling: ingress.startSetupPolling,
  stopPolling: ingress.stopSetupPolling,
  isPolling: ingress.isSetupPolling,
  getActiveCount: ingress.getSetupActiveCount,
};
