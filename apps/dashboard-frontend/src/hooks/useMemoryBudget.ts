import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { MemoryBudget } from '@/types';

/**
 * Das KI-RAM-Budget, eine Quelle fuer alle Anzeigen davon.
 *
 * Es gibt vier Verbraucher: die Statusleiste, das Modellraster, die
 * Modell-Detailseite und seit Plan 023 C5 die Speicherkachel im Systemstatus.
 * Bis dahin trugen zwei von ihnen den Abfrageschluessel als eigene Zeichenkette
 * und der vierte importierte ihn quer aus `features/workspace/StatusBar`, was
 * `apps/dashboard-frontend/CLAUDE.md` ausdruecklich verbietet. Beides fuehrt
 * zum selben Ende: vier Stellen, die auseinanderlaufen koennen, obwohl sie
 * dieselbe Zahl zeigen sollen. Nach der Platzierungsregel des Repos gehoert
 * geteilter Code nach `hooks/`, sobald ihn zwei Bereiche brauchen.
 *
 * Der Schluessel ist bewusst weiter ausgefuehrt: React Query vergleicht
 * strukturell, ein gleich aussehendes Feld traefe denselben Cache-Eintrag. Der
 * Punkt ist nicht der Cache, sondern dass es eine Stelle gibt, an der steht,
 * wie er heisst.
 */
export const MEMORY_BUDGET_QUERY_KEY = ['models', 'memory-budget'] as const;

interface Optionen {
  /**
   * Abfrageabstand in Millisekunden. Das Modellraster geht waehrend eines
   * laufenden Ladevorgangs auf 2000 herunter, alle anderen bleiben bei 10000.
   */
  refetchInterval?: number;
  staleTime?: number;
}

export function useMemoryBudget({ refetchInterval = 10_000, staleTime = 5_000 }: Optionen = {}) {
  const api = useApi();
  return useQuery({
    queryKey: MEMORY_BUDGET_QUERY_KEY,
    queryFn: () => api.get<MemoryBudget>('/models/memory-budget', { showError: false }),
    refetchInterval,
    staleTime,
    retry: 1,
  });
}
