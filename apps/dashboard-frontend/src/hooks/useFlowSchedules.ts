/**
 * useFlowSchedules — die Flow-Auslöser (Plan 013, B8).
 *
 * Server-Daten → React Query. Ein Auslöser startet einen Flow automatisch: zu
 * festen Zeiten (Cron) oder auf ein benanntes Ereignis hin. Anlegen/Ändern/
 * Löschen invalidieren den Cache, sodass die Chat-Steuerung sofort aktuell ist.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { FlowSchedule } from '@/types/flows';

const QUERY_KEY = ['flow-schedules'];

/** Eingabe zum Anlegen eines Auslösers (Discriminated Union wie im Backend). */
export type CreateScheduleInput =
  | {
      flow: string;
      trigger_type: 'zeitplan';
      cron: string;
      args?: Record<string, string>;
      enabled?: boolean;
    }
  | {
      flow: string;
      trigger_type: 'ereignis';
      event_name: string;
      args?: Record<string, string>;
      enabled?: boolean;
    };

export interface UpdateScheduleInput {
  cron?: string;
  event_name?: string;
  args?: Record<string, string>;
  enabled?: boolean;
}

export function useFlowSchedules() {
  const api = useApi();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.get<{ data: FlowSchedule[] }>('/flows/zeitplaene', { showError: false }),
    retry: 1,
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const create = useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      api.post<{ data: FlowSchedule }>('/flows/zeitplaene', input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateScheduleInput }) =>
      api.put<{ data: FlowSchedule }>(`/flows/zeitplaene/${id}`, patch as Record<string, unknown>),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/flows/zeitplaene/${id}`),
    onSuccess: invalidate,
  });

  return {
    schedules: data?.data ?? [],
    isLoading,
    create,
    update,
    remove,
  };
}
