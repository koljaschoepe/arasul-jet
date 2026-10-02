/**
 * Der Ausgang der Apps und der Plattform ins Internet, für den Administrator
 * (J38). Ein Weg aus `routes/admin/ausgang.js`: `GET /api/ausgang`.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

export interface Ziel {
  host: string;
  anzahl: number;
  zuletzt: string | null;
  staende: ('live' | 'test')[];
}

export interface AppVerbindungen {
  id: string;
  name: string;
  /** Was das Manifest in `verbindungen` fordert, je Name mit den Ständen. */
  eingetragen: { host: string; staende: ('live' | 'test')[] }[];
  genutzt: Ziel[];
  abgewiesen: Ziel[];
}

export interface Verbindungen {
  apps: AppVerbindungen[];
  plattform: { genutzt: Ziel[] };
}

export function useVerbindungen() {
  const api = useApi();
  return useQuery({
    queryKey: ['ausgang'],
    queryFn: async () =>
      (await api.get<{ data: Verbindungen }>('/ausgang', { showError: false })).data,
    // Die Zahlen laufen weiter, auch während die Seite offen ist.
    refetchInterval: 15000,
  });
}
