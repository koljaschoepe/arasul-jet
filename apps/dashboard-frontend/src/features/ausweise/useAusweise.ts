/**
 * Die Ausweise eines Menschen (Brücke, 21.09.2026, J34).
 *
 * Ein Ausweis ist das, was ein Agent am Rechner eines Mitarbeiters mitschickt,
 * damit die Apps dieses Menschen ihm antworten. Er entsteht hier, wird EINMAL
 * gezeigt und liegt danach nur noch als Prüfsumme am Gerät — die Liste kann
 * ihn also nie wieder nennen, und keine Abfrage bringt ihn zurück.
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

/** Derselbe Ausweis in der Sicht des Administrators: mit seinem Menschen. */
export interface FremderAusweis extends Ausweis {
  user_id: number | string;
  username: string;
  role: 'admin' | 'mitarbeiter';
}

export const AUSWEISE_KEY = ['ausweise'] as const;
export const AUSWEISE_ALLE_KEY = ['ausweise', 'alle'] as const;

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

/**
 * Alle Ausweise am Gerät — nur für den Administrator.
 *
 * `aktiv` und nicht „wird schon nicht aufgerufen": die Route trägt
 * `requireRole('admin')`, und eine Abfrage aus der Sicht eines Mitarbeiters
 * wäre ein 403 in seiner Konsole. Genau dieser Fund steht in D2 und D3
 * (`DownloadContext`, `useMemoryBudget`) — er soll sich nicht wiederholen.
 */
export function useAlleAusweise(aktiv: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: AUSWEISE_ALLE_KEY,
    enabled: aktiv,
    queryFn: async () => {
      const res = await api.get<{ data?: FremderAusweis[] }>('/ausweise/alle');
      return res.data ?? [];
    },
    staleTime: 30_000,
  });
}

/** Ein Ausweis, wie er aus `POST /api/ausweise` kommt: mit seinem Wert. */
export interface AusgestellterAusweis extends Ausweis {
  /** Der Klartext. Er steht genau in dieser einen Antwort und nirgends sonst. */
  ausweis: string;
}

export function useAusweisAusstellen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post<{ data: AusgestellterAusweis }>('/ausweise', { name });
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: AUSWEISE_KEY });
      void qc.invalidateQueries({ queryKey: AUSWEISE_ALLE_KEY });
    },
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
      void qc.invalidateQueries({ queryKey: AUSWEISE_ALLE_KEY });
    },
  });
}
