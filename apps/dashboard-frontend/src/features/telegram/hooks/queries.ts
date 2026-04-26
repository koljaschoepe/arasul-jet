import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import type { Bot, AppStatus, SystemConfig, AuditLog } from '../components/types';
import { telegramKeys } from './queryKeys';

interface BotsResponse {
  bots?: Bot[];
}

interface SystemConfigResponse {
  chat_id?: string;
  enabled?: boolean;
  configured?: boolean;
}

interface AuditLogsResponse {
  logs?: AuditLog[];
}

/** All Telegram bots configured in the system. */
export function useBotsQuery(): UseQueryResult<Bot[]> {
  const api = useApi();
  return useQuery({
    queryKey: telegramKeys.bots(),
    queryFn: async ({ signal }) => {
      const data = await api.get<BotsResponse>('/telegram-bots', { showError: false, signal });
      return data.bots ?? [];
    },
  });
}

/** App-level Telegram status (enabled/disabled). */
export function useAppStatusQuery(): UseQueryResult<AppStatus> {
  const api = useApi();
  return useQuery({
    queryKey: telegramKeys.appStatus(),
    queryFn: ({ signal }) =>
      api.get<AppStatus>('/telegram-app/status', { showError: false, signal }),
  });
}

interface SystemConfigState {
  config: SystemConfig;
  hasToken: boolean;
}

/**
 * System Telegram config (token, chat_id, enabled).
 * Note: bot_token is never returned by the backend; we expose `hasToken`
 * as a separate boolean and keep the local form value blank.
 */
export function useSystemConfigQuery(): UseQueryResult<SystemConfigState> {
  const api = useApi();
  return useQuery({
    queryKey: telegramKeys.systemConfig(),
    queryFn: async ({ signal }) => {
      const data = await api.get<SystemConfigResponse>('/telegram/config', {
        showError: false,
        signal,
      });
      return {
        config: {
          bot_token: '',
          chat_id: data.chat_id ?? '',
          enabled: data.enabled ?? false,
        },
        hasToken: data.configured ?? false,
      };
    },
  });
}

/**
 * Recent audit logs. Disabled by default (`enabled: false`); flip when the
 * Logs tab becomes active to defer the fetch.
 */
export function useAuditLogsQuery(enabled: boolean, limit = 50): UseQueryResult<AuditLog[]> {
  const api = useApi();
  return useQuery({
    queryKey: telegramKeys.auditLogs(limit),
    enabled,
    queryFn: async ({ signal }) => {
      const data = await api.get<AuditLogsResponse>(`/telegram/audit-logs?limit=${limit}`, {
        showError: false,
        signal,
      });
      return data.logs ?? [];
    },
  });
}
