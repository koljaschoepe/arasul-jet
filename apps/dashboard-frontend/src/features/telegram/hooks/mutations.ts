import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import type { Bot, SystemConfig } from '../components/types';
import { telegramKeys } from './queryKeys';

interface ToggleBotPayload {
  botId: string;
  currentActive: boolean;
}

interface ToggleBotResponse {
  bot?: { isActive?: boolean };
}

/**
 * Toggle a bot's active state. Optimistically updates the cache and rolls
 * back on error. The activeBot id (`variables.botId`) is exposed via
 * `mutation.variables` so consumers can show per-bot pending state.
 */
export function useToggleBotMutation(): UseMutationResult<
  ToggleBotResponse,
  Error,
  ToggleBotPayload,
  { previousBots?: Bot[] }
> {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ botId, currentActive }: ToggleBotPayload) => {
      const endpoint = currentActive ? 'deactivate' : 'activate';
      return api.post<ToggleBotResponse>(`/telegram-bots/${botId}/${endpoint}`, undefined, {
        showError: false,
      });
    },
    onMutate: async ({ botId, currentActive }) => {
      await qc.cancelQueries({ queryKey: telegramKeys.bots() });
      const previousBots = qc.getQueryData<Bot[]>(telegramKeys.bots());
      qc.setQueryData<Bot[]>(telegramKeys.bots(), prev =>
        prev?.map(bot => (bot.id === botId ? { ...bot, isActive: !currentActive } : bot))
      );
      return { previousBots };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousBots) {
        qc.setQueryData(telegramKeys.bots(), context.previousBots);
      }
      toast.error('Fehler beim Umschalten des Bots');
    },
    onSuccess: (data, { botId, currentActive }) => {
      // Reconcile with server-confirmed state (in case server differs from optimistic guess)
      const newActive = data?.bot?.isActive ?? !currentActive;
      qc.setQueryData<Bot[]>(telegramKeys.bots(), prev =>
        prev?.map(bot => (bot.id === botId ? { ...bot, isActive: newActive } : bot))
      );
      toast.success(currentActive ? 'Bot deaktiviert' : 'Bot aktiviert');
    },
  });
}

/** Delete a bot. Optimistically removes it from the cache. */
export function useDeleteBotMutation(): UseMutationResult<
  unknown,
  Error,
  string,
  { previousBots?: Bot[] }
> {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (botId: string) => api.del(`/telegram-bots/${botId}`, { showError: false }),
    onMutate: async botId => {
      await qc.cancelQueries({ queryKey: telegramKeys.bots() });
      const previousBots = qc.getQueryData<Bot[]>(telegramKeys.bots());
      qc.setQueryData<Bot[]>(telegramKeys.bots(), prev => prev?.filter(bot => bot.id !== botId));
      return { previousBots };
    },
    onError: (_err, _botId, context) => {
      if (context?.previousBots) {
        qc.setQueryData(telegramKeys.bots(), context.previousBots);
      }
      toast.error('Fehler beim Löschen des Bots');
    },
    onSuccess: () => {
      toast.success('Bot gelöscht');
    },
  });
}

/**
 * Add a freshly-created bot to the cache (consumed by the wizard's onComplete
 * callback). Not strictly a mutation, but exposed here for symmetry.
 */
export function useAddBotToCache() {
  const qc = useQueryClient();
  return (newBot: Bot) => {
    qc.setQueryData<Bot[]>(telegramKeys.bots(), prev => (prev ? [...prev, newBot] : [newBot]));
  };
}

/**
 * Update a single bot in the cache (consumed by BotDetailsModal's onUpdate
 * callback after a successful PUT in the modal).
 */
export function useUpdateBotInCache() {
  const qc = useQueryClient();
  return (updatedBot: Bot) => {
    qc.setQueryData<Bot[]>(telegramKeys.bots(), prev =>
      prev?.map(b => (b.id === updatedBot.id ? updatedBot : b))
    );
  };
}

interface UpdateSystemConfigPayload {
  /** Send only the fields you want to change. bot_token is omitted if empty. */
  chat_id?: string;
  enabled?: boolean;
  bot_token?: string;
}

interface UpdateSystemConfigResponse {
  has_token?: boolean;
  success?: boolean;
}

/** Save the system Telegram config (full or partial). */
export function useUpdateSystemConfigMutation(): UseMutationResult<
  UpdateSystemConfigResponse,
  Error,
  UpdateSystemConfigPayload
> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateSystemConfigPayload) =>
      api.post<UpdateSystemConfigResponse>('/telegram/config', payload as Record<string, unknown>, {
        showError: false,
      }),
    onSuccess: (data, payload) => {
      // Patch the cache with confirmed values; if hasToken changed, reflect it.
      qc.setQueryData<{ config: SystemConfig; hasToken: boolean }>(
        telegramKeys.systemConfig(),
        prev => {
          if (!prev) return prev;
          const nextHasToken =
            data.has_token === true || (Boolean(payload.bot_token) && data.success === true)
              ? true
              : prev.hasToken;
          return {
            config: {
              ...prev.config,
              ...(payload.chat_id !== undefined ? { chat_id: payload.chat_id } : {}),
              ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
              bot_token: '',
            },
            hasToken: nextHasToken,
          };
        }
      );
    },
  });
}

/** Send a test message via the configured Telegram bot. */
export function useTestSystemMutation(): UseMutationResult<unknown, Error, void> {
  const api = useApi();
  return useMutation({
    mutationFn: () => api.post('/telegram/test', undefined, { showError: false }),
  });
}
