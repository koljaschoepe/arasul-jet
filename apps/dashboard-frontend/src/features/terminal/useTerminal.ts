/**
 * Was die Shell über das Terminal wissen muss (`GET /api/terminal`): läuft es
 * am Gerät, ist der Angemeldete Entwickler, und welcher Nutzer ist er dort.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';

export interface TerminalLage {
  /** Fährt das Gerät das Profil `terminal`? */
  an: boolean;
  /** Hat der Angemeldete die Rolle Entwickler? */
  entwickler: boolean;
  /** `ara-<id>`, sein Nutzer am Gerät; `null` ohne die Rolle. */
  linuxNutzer: string | null;
}

export function useTerminalLage() {
  const api = useApi();
  // Je Person: meldet sich ohne Neuladen ein anderer an, gilt seine Lage.
  const id = useAuth().user?.id;
  return useQuery({
    queryKey: ['terminal', id],
    queryFn: async () => {
      const res = await api.get<{ data: TerminalLage }>('/terminal', { showError: false });
      return res.data;
    },
    staleTime: 60_000,
  });
}
