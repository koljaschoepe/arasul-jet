/**
 * Abfragen und Mutationen der Läufe über alle Apps (M5, Verwaltung → Läufe).
 *
 * Die Wege stehen in `routes/admin/laeufe.js`: `GET /api/laeufe` mit Filtern,
 * `GET /api/laeufe/:id`, `POST /api/laeufe/:id/abbrechen`. Die Filter stehen
 * in der Adresse als Abfrage (`?app=…&status=…`), damit ein Link genau diese
 * Auswahl zeigt; hier werden sie gelesen, geschrieben und in die Abfrage ans
 * Gerät übersetzt.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { AppLauf, AppLaufDetail } from '../apps/useAppVerwaltung';

/** Die Auswahl der Liste; ein leerer Text heißt „alle". */
export interface LaeufeFilter {
  app: string;
  status: string;
  /** Die Nummer einer Person, `ohne` für Läufe ohne Mensch dahinter, sonst leer. */
  person: string;
  /** Ein Tag, `JJJJ-MM-TT` in der Zeit des Browsers; der Tag zählt mit. */
  von: string;
  bis: string;
}

export const KEIN_FILTER: LaeufeFilter = { app: '', status: '', person: '', von: '', bis: '' };

/** Die Ergebnisse, die ein Lauf haben kann, mit dem Wort, das die Oberfläche sagt. */
export const ERGEBNISSE: { wert: string; text: string }[] = [
  { wert: 'fehler', text: 'Fehler' },
  { wert: 'nicht_uebergeben', text: 'Nicht übergeben' },
  { wert: 'laeuft', text: 'Läuft' },
  { wert: 'wartend', text: 'Wartet auf Freigabe' },
  { wert: 'fertig', text: 'Fertig' },
  { wert: 'abgebrochen', text: 'Abgebrochen' },
  { wert: 'abgelaufen', text: 'Frist abgelaufen' },
];

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const REIHE = ['app', 'status', 'person', 'von', 'bis'] as const;

/** Die Filter aus der Abfrage der Adresse (ohne `?`). */
export function filterAusAbfrage(abfrage: string | undefined): LaeufeFilter {
  const q = new URLSearchParams(abfrage ?? '');
  const f = { ...KEIN_FILTER };
  for (const k of REIHE) f[k] = q.get(k) ?? '';
  if (!TAG.test(f.von)) f.von = '';
  if (!TAG.test(f.bis)) f.bis = '';
  return f;
}

/** Die Filter als Abfrage der Adresse, in fester Reihenfolge; leer, wenn keiner gesetzt ist. */
export function filterZuAbfrage(f: LaeufeFilter): string {
  const q = new URLSearchParams();
  for (const k of REIHE) if (f[k]) q.set(k, f[k]);
  return q.toString();
}

export function filterGesetzt(f: LaeufeFilter): boolean {
  return REIHE.some(k => f[k] !== '');
}

/** Ein Tag in der Zeit des Browsers als Zeitpunkt, `tage` später um Mitternacht. */
function tagAlsZeitpunkt(tag: string, tage = 0): string {
  const d = new Date(`${tag}T00:00:00`);
  d.setDate(d.getDate() + tage);
  return d.toISOString();
}

function abfrageAnsGeraet(f: LaeufeFilter, offset: number, limit: number): string {
  const q = new URLSearchParams();
  if (f.app) q.set('app', f.app);
  if (f.status) q.set('status', f.status);
  if (f.person) q.set('person', f.person);
  if (f.von) q.set('von', tagAlsZeitpunkt(f.von));
  if (f.bis) q.set('bis', tagAlsZeitpunkt(f.bis, 1));
  q.set('limit', String(limit));
  q.set('offset', String(offset));
  return q.toString();
}

const SEITE = 50;
const LAEUFE_KEY = ['laeufe'] as const;

interface Seite {
  data?: AppLauf[];
  gesamt?: number;
}

/**
 * Die Läufe, Fehler zuerst, in Seiten zu je fünfzig. Solange einer läuft oder
 * auf eine Freigabe wartet, fragt die Liste alle zehn Sekunden nach.
 */
export function useLaeufe(filter: LaeufeFilter) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...LAEUFE_KEY, 'liste', filter],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<Seite>(`/laeufe?${abfrageAnsGeraet(filter, pageParam, SEITE)}`);
      return { laeufe: res.data ?? [], gesamt: res.gesamt ?? 0 };
    },
    getNextPageParam: (letzte, alle) => {
      const geholt = alle.reduce((n, s) => n + s.laeufe.length, 0);
      return letzte.laeufe.length === SEITE && geholt < letzte.gesamt ? geholt : undefined;
    },
    refetchInterval: q =>
      q.state.data?.pages.some(s =>
        s.laeufe.some(l => l.status === 'laeuft' || l.status === 'wartend')
      )
        ? 10_000
        : false,
    staleTime: 5_000,
  });
}

/** Ein Lauf samt Schritten, solange er läuft oder wartet alle fünf Sekunden neu. */
export function useLauf(runId: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...LAEUFE_KEY, 'lauf', runId],
    queryFn: async () => {
      const res = await api.get<{ data?: AppLaufDetail }>(`/laeufe/${runId}`);
      return res.data ?? null;
    },
    enabled: runId != null,
    refetchInterval: q => {
      const l = q.state.data;
      return l && (l.status === 'laeuft' || l.status === 'wartend') ? 5_000 : false;
    },
  });
}

/**
 * Einen Lauf abbrechen, gleich von wem er stammt. Entwertet wird nach jedem
 * Ausgang: ein 404 heißt, dass er inzwischen zu Ende ist.
 */
export function useLaufAbbrechen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: number) => {
      const res = await api.post<{ data?: AppLauf }>(`/laeufe/${runId}/abbrechen`, {});
      return res.data ?? null;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: LAEUFE_KEY });
    },
  });
}
