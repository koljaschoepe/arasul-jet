/**
 * Die Ausweise eines Menschen (Brücke, 21.09.2026, J34).
 *
 * Ein Ausweis ist das, was ein Agent am Rechner eines Mitarbeiters mitschickt,
 * damit die Apps dieses Menschen ihm antworten. In der Oberfläche heißt er
 * „angemeldeter Rechner": sie zeigt die Liste und meldet einen Rechner ab
 * (widerruft). Erzeugt wird er hier nie — der Ausweis für das CLI entsteht
 * nicht im Browser, und die Liste kann seinen Wert ohnehin nicht nennen.
 *
 * Abfrage und Mutationen stehen zusammen, wie bei den Mitarbeitern aus D3 und
 * aus demselben Grund: nach jedem Ausgang ist die Liste veraltet, und wer
 * beides trennt, hat die Regel „danach neu laden" an einer anderen Stelle als
 * die Liste.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

/** Ein Ausweis, so wie ihn `GET /api/ausweise` liefert — ohne seinen Wert. */
export interface Ausweis {
  id: number;
  name: string;
  /** Die ersten Zeichen des Wertes. Kein Geheimnis, nur ein Wiedererkennen. */
  praefix: string;
  angelegt_am: string;
  /** `null` heißt „noch nie benutzt" und ist eine Auskunft, kein Fehlwert. */
  zuletzt_benutzt_am: string | null;
}

// Nicht exportiert: niemand ausserhalb dieser Datei entwertet diese Abfragen,
// weil jede Mutation, die sie veraltet, auch hier steht. So wie der
// Benutzer-Schluessel in `settings/personen/usePersonen.ts`.
const AUSWEISE_KEY = ['ausweise'] as const;

/** Meine Ausweise. */
export function useAusweise(aktiv = true) {
  const api = useApi();
  return useQuery({
    queryKey: AUSWEISE_KEY,
    enabled: aktiv,
    queryFn: async () => {
      const res = await api.get<{ data?: Ausweis[] }>('/ausweise');
      return res.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useAusweisWiderrufen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.del(`/ausweise/${id}`);
      return id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: AUSWEISE_KEY });
    },
  });
}
