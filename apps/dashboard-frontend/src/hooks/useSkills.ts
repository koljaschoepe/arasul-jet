/**
 * useSkills — die Liste der verfügbaren Skills fürs Slash-Menü (Plan 011, Schritt 13).
 *
 * Server-Daten → React Query. Der Cache-Schlüssel ist der API-Pfad; ändert ein
 * Anlege-/Bearbeiten-Dialog (Schritt 17) einen Skill, invalidiert er diesen
 * Schlüssel, und das Menü ist sofort aktuell.
 *
 * Fehlerhafte Skill-Dateien lassen die Liste NICHT scheitern — das Backend
 * meldet sie separat unter `fehlerhaft` (Schritt 5). Fällt der Abruf ganz aus
 * (z. B. 401-Race beim Login), bleibt die Liste leer statt das Eingabefeld zu
 * blockieren: Ein `/` zeigt dann eben nur die festen Befehle.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { Skill } from '@/types/skills';

const QUERY_KEY = ['skills'];

interface SkillListResponse {
  data: Skill[];
  fehlerhaft?: { name: string; fehler: string }[];
}

export function useSkills() {
  const api = useApi();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<SkillListResponse>('/skills', { showError: false });
      return res;
    },
    retry: 1,
    staleTime: 30_000,
  });

  return {
    skills: data?.data ?? [],
    fehlerhaft: data?.fehlerhaft ?? [],
    isLoading,
  };
}
