/**
 * Wie viele Freigaben warten auf mich? (Phase D1)
 *
 * Phase C7 hat den Gegenstand gebaut: ein Flow hält an, legt eine Zeile in
 * `approvals`, und wer die App freigegeben hat, entscheidet. Was fehlte, war
 * der Weg, auf dem jemand davon **erfährt** — die Anfrage stand in der
 * Datenbank und wartete darauf, dass jemand die Adresse kennt.
 *
 * D1 bringt nur die **Zahl** in die Shell. Die Oberfläche zum Entscheiden ist
 * D2 oder später (so steht es im Auftrag der Phase), und eine halbe Oberfläche
 * hier wäre die, die dann noch einmal gebaut wird.
 *
 * Der Abruf läuft alle zwei Minuten, nicht im Sekundentakt: am anderen Ende
 * wartet ein Mensch mit einer Frist von in der Regel einem Tag
 * (`FLOW_FREIGABE_FRIST_MINUTEN`, Vorgabe 1440). Ein Zähler, der schneller
 * atmet als die Sache, die er zählt, kostet nur Strom auf dem Jetson.
 */
import { useQuery } from '@tanstack/react-query';
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

export const OFFENE_FREIGABEN_KEY = ['freigabe-anfragen', 'offen'] as const;

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
