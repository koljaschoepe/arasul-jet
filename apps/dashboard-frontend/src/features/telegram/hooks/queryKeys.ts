/**
 * Centralized TanStack Query keys for the Telegram feature.
 *
 * Hierarchical keys allow targeted invalidation:
 *   qc.invalidateQueries({ queryKey: telegramKeys.all })   // everything
 *   qc.invalidateQueries({ queryKey: telegramKeys.bots() }) // only bots
 */
export const telegramKeys = {
  all: ['telegram'] as const,
  bots: () => [...telegramKeys.all, 'bots'] as const,
  appStatus: () => [...telegramKeys.all, 'appStatus'] as const,
  systemConfig: () => [...telegramKeys.all, 'systemConfig'] as const,
  auditLogs: (limit: number) => [...telegramKeys.all, 'auditLogs', { limit }] as const,
};
