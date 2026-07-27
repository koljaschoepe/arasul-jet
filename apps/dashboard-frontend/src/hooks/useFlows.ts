/**
 * useFlows — die Liste der verfügbaren Flows fürs Slash-Menü (Plan 011, Schritt 13).
 *
 * Server-Daten → React Query. Der Cache-Schlüssel ist der API-Pfad; ändert ein
 * Anlege-/Bearbeiten-Dialog (Schritt 17) einen Flow, invalidiert er diesen
 * Schlüssel, und das Menü ist sofort aktuell.
 *
 * Fehlerhafte Flow-Dateien lassen die Liste NICHT scheitern — das Backend
 * meldet sie separat unter `fehlerhaft` (Schritt 5). Fällt der Abruf ganz aus
 * (z. B. 401-Race beim Login), bleibt die Liste leer statt das Eingabefeld zu
 * blockieren: Ein `/` zeigt dann eben nur die festen Befehle.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { Flow } from '@/types/flows';

const QUERY_KEY = ['flows'];

interface FlowListResponse {
  data: Flow[];
  fehlerhaft?: { name: string; fehler: string }[];
}

export function useFlows() {
  const api = useApi();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<FlowListResponse>('/flows', { showError: false });
      return res;
    },
    retry: 1,
    staleTime: 30_000,
  });

  return {
    flows: data?.data ?? [],
    fehlerhaft: data?.fehlerhaft ?? [],
    isLoading,
  };
}
