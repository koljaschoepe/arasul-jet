/**
 * Die Freigaben, die auf mich warten (Phase D1, entschieden ab D2).
 *
 * Phase C7 hat den Gegenstand gebaut: ein Flow hält an, legt eine Zeile in
 * `approvals`, und wer die App freigegeben hat, entscheidet. Was fehlte, war
 * der Weg, auf dem jemand davon **erfährt** — die Anfrage stand in der
 * Datenbank und wartete darauf, dass jemand die Adresse kennt.
 *
 * D1 brachte die **Zahl** in die Statusleiste, D2 die **Entscheidung** in die
 * Übersicht (`features/freigaben/OffeneFreigaben.tsx`). Beide lesen dieselbe
 * Abfrage unter demselben Schlüssel; React Query dedupliziert.
 *
 * WARUM DIE MUTATIONEN HIER NEBEN DER ABFRAGE STEHEN und nicht im Feature, das
 * sie als einziges benutzt: sie gehören zu derselben Adresse. Wer
 * `/freigabe-anfragen` in zwei Dateien aufteilt, hat die Regel „nach dem
 * Entscheiden ist die Liste veraltet" an einer Stelle stehen und die Liste an
 * einer anderen — und genau diese Invalidierung ist das, was die Phase misst
 * („Aktualisierung ohne Neuladen").
 *
 * Der Abruf läuft alle zwei Minuten, nicht im Sekundentakt: am anderen Ende
 * wartet ein Mensch mit einer Frist von in der Regel einem Tag
 * (`FLOW_FREIGABE_FRIST_MINUTEN`, Vorgabe 1440). Ein Zähler, der schneller
 * atmet als die Sache, die er zählt, kostet nur Strom auf dem Jetson.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

/** Eine offene Anfrage, so wie `GET /api/freigabe-anfragen` sie liefert. */
export interface OffeneFreigabe {
  id: number;
  run_id: number;
  app_id: string;
  stand: 'live' | 'test';
  flow_name: string;
  titel: string;
  zusammenhang: string | null;
  frist: string;
  angefragt_am: string;
}

/**
 * Was das Backend nach einer Entscheidung zurückgibt.
 *
 * `fortgesetzt: false` heißt: die Entscheidung steht, aber niemand hat den Lauf
 * mehr weitergeführt (das Backend ist zwischendurch neu gestartet). Das wird
 * gesagt und nicht verschwiegen — sonst wartet jemand auf ein Ergebnis, das
 * nie kommt.
 */
export interface FreigabeEntschieden {
  id: number;
  run_id: number;
  app_id: string;
  stand: 'live' | 'test';
  titel: string;
  status: 'bestaetigt' | 'abgelehnt';
  fortgesetzt: boolean;
  benutzer: string;
}

const OFFENE_FREIGABEN_KEY = ['freigabe-anfragen', 'offen'] as const;

export function useOffeneFreigaben() {
  const api = useApi();
  return useQuery({
    queryKey: OFFENE_FREIGABEN_KEY,
    queryFn: async () => {
      // `showError: false`: ein Zähler in der Statusleiste darf nicht mit einer
      // roten Meldung dazwischenfahren, wenn das Gerät gerade neu startet.
      const res = await api.get<{ data?: OffeneFreigabe[] }>('/freigabe-anfragen', {
        showError: false,
      });
      return res.data ?? [];
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Bestätigen oder ablehnen — eine Entscheidung, ein Aufruf. */
export type Entscheidung =
  { id: number; status: 'bestaetigt' } | { id: number; status: 'abgelehnt'; begruendung: string };

/**
 * Die Entscheidung über eine Freigabe.
 *
 * NACH JEDEM AUSGANG WIRD DIE LISTE ENTWERTET, auch nach einem Fehler. Das ist
 * kein Übereifer: die häufigsten Fehler an dieser Stelle sind „ein anderer war
 * schneller" (409) und „die Frist ist abgelaufen" (409) — beide heißen, dass
 * die Liste im Browser nicht mehr stimmt. Nur bei Erfolg neu zu laden ließe
 * genau die Zeile stehen, die weg gehört.
 *
 * Die Fehlermeldung kommt aus dem Backend (`erklaereFehlschlag` nennt vier
 * Gründe beim Namen) und läuft über den Toast von `useApi` — hier wird sie
 * nicht noch einmal formuliert.
 */
export function useFreigabeEntscheiden() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: Entscheidung) => {
      const pfad =
        e.status === 'bestaetigt'
          ? `/freigabe-anfragen/${e.id}/bestaetigen`
          : `/freigabe-anfragen/${e.id}/ablehnen`;
      const leib = e.status === 'abgelehnt' ? { begruendung: e.begruendung } : {};
      const res = await api.post<{ data: FreigabeEntschieden }>(pfad, leib);
      return res.data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: OFFENE_FREIGABEN_KEY });
    },
  });
}
