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
   * Abfrageabstand in Millisekunden, oder `false` fuer einmal lesen.
   *
   * Das Modellraster geht waehrend eines laufenden Ladevorgangs auf 2000
   * herunter, die Statusleiste und die Speicherkachel bleiben bei 10000, und
   * die Modell-Detailseite fragt gar nicht nach: sie zeigt einmal an, ob ein
   * Modell in das Budget passt, und dafuer braucht es keinen Takt auf dem
   * Jetson.
   */
  refetchInterval?: number | false;
  staleTime?: number;
  /**
   * Ueberhaupt fragen? Voreinstellung ja.
   *
   * `GET /api/models/memory-budget` traegt `requireRole('admin')`. Die
   * Statusleiste steht aber in JEDER Shell, auch in der eines Mitarbeiters,
   * und fragte bis Phase D3 auch dort: alle zehn Sekunden ein 403, beim Laden
   * wegen `retry: 1` gleich zwei hintereinander. Das waren die zwei Meldungen,
   * die die D2-Abnahme in der Konsole gefunden hat.
   *
   * Nicht die Berechtigung, sondern das Ausblenden: der Wert gehoert zur
   * Modellverwaltung, und die sieht ein Mitarbeiter nicht. Wer trotzdem
   * fragt, bekommt weiterhin 403 aus der Route.
   */
  enabled?: boolean;
}

export function useMemoryBudget({
  refetchInterval = 10_000,
  staleTime = 5_000,
  enabled = true,
}: Optionen = {}) {
  const api = useApi();
  return useQuery({
    queryKey: MEMORY_BUDGET_QUERY_KEY,
    queryFn: () => api.get<MemoryBudget>('/models/memory-budget', { showError: false }),
    refetchInterval,
    staleTime,
    enabled,
    retry: 1,
  });
}
