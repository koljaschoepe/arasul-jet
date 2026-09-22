/**
 * Der Firmenordner, für den Administrator (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026, J33).
 *
 * Die Wege stehen seit PR 765 (`GET/POST /api/firmenordner/ordner`,
 * `DELETE /api/firmenordner/ordner/:id?kennung=…`, `GET/POST
 * /api/firmenordner/rechte`, `DELETE /api/firmenordner/rechte/:o/:b`) und seit
 * diesem Auftrag (`GET …/ordner/:id/aenderungen`). Was fehlte, war die
 * Oberfläche davor: ein Administrator legte einen Ordner mit `curl` an und gab
 * ein Recht mit einem zweiten.
 *
 * Abfragen und Mutationen stehen zusammen, wie bei den Mitarbeitern aus D3
 * und aus demselben Grund: nach jedem Ausgang ist die Liste veraltet, und wer
 * beides trennt, hat die Regel „danach neu laden" an einer anderen Stelle als
 * die Liste. Entwertet wird nach JEDEM Ausgang, auch nach einem Fehler — ein
 * 409 heißt gerade, dass das Bild im Browser nicht mehr stimmt.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi, type ApiError } from '@/hooks/useApi';
import type { BenutzerId } from '../mitarbeiter/useMitarbeiter';

/** Die drei Arten eines Ordners am Gerät. */
export type OrdnerArt = 'wurzel' | 'geteilt' | 'am_geraet';

/** Die zwei Stufen, die eine Zeile tragen kann. „keine" ist keine Zeile. */
export type Recht = 'lesen' | 'schreiben';

/** Ein Ordner, so wie `GET /api/firmenordner/ordner` ihn liefert. */
export interface Ordner {
  id: number | string;
  kennung: string;
  name: string;
  ebene: 0 | 1 | 2;
  eltern_id: number | string | null;
  eltern_kennung: string | null;
  art: OrdnerArt;
  /** `null`, solange der Dienst den Raum nicht kennt (angelegt, während er stand). */
  raum_id: string | null;
  pfad: string;
  angelegt_am: string;
  rechte_anzahl: number;
}

/** Der Zustand des Dienstes, wie die Route ihn neben die Liste legt. */
export interface Zustand {
  an: boolean;
  erreichbar: boolean;
  grund: string | null;
  adresse: string | null;
  ordner: number;
  am_geraet: number;
  nutzer: number;
  nutzer_offen: number;
  rechte: number;
  rechte_offen: number;
  /** Die Kennung der Wurzel, oder `null`, solange es keine gibt. */
  wurzel: string | null;
}

/** Eine Rechte-Zeile, so wie `GET /api/firmenordner/rechte` sie liefert. */
export interface RechtZeile {
  ordner_id: number | string;
  user_id: BenutzerId;
  recht: Recht;
  erteilt_am: string;
  abgleich_offen: string | null;
  ordner_kennung: string;
  ebene: 1 | 2;
  art: OrdnerArt;
  eltern_kennung: string | null;
  username: string;
}

/** Eine Zeile aus dem Protokoll des Dienstes: wer wann was. */
export interface Aenderung {
  wann: string;
  wer: string | null;
  text: string;
  datei: string | null;
}

export const ORDNER_KEY = ['firmenordner', 'ordner'] as const;
export const RECHTE_KEY = ['firmenordner', 'rechte'] as const;

export function useOrdner() {
  const api = useApi();
  return useQuery({
    queryKey: ORDNER_KEY,
    queryFn: async () => {
      const res = await api.get<{ data?: Ordner[]; zustand?: Zustand }>('/firmenordner/ordner');
      return { ordner: res.data ?? [], zustand: res.zustand ?? null };
    },
    staleTime: 30_000,
  });
}

export function useRechte() {
  const api = useApi();
  return useQuery({
    queryKey: RECHTE_KEY,
    queryFn: async () => {
      const res = await api.get<{ data?: RechtZeile[] }>('/firmenordner/rechte');
      return res.data ?? [];
    },
    staleTime: 30_000,
  });
}

/**
 * Wer zuletzt wann etwas geändert hat — erst geholt, wenn jemand die Übersicht
 * eines Ordners öffnet. Nicht zwischengespeichert: die Frage lautet „was ist
 * gerade los", und eine Antwort von vor einer Minute wäre keine.
 */
export function useAenderungen(ordnerId: Ordner['id'] | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['firmenordner', 'aenderungen', String(ordnerId)],
    enabled: ordnerId !== null,
    staleTime: 0,
    queryFn: async () => {
      const res = await api.get<{ data?: { ordner: string; aenderungen: Aenderung[] } }>(
        `/firmenordner/ordner/${ordnerId}/aenderungen`
      );
      return res.data?.aenderungen ?? [];
    },
  });
}

/** Was `POST /api/firmenordner/ordner` braucht — als `type`, siehe `useMitarbeiter.ts`. */
export type NeuerOrdner = {
  kennung: string;
  name: string;
  ebene: 0 | 1 | 2;
  art: OrdnerArt;
  eltern?: string;
};

export function useOrdnerAnlegen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (neu: NeuerOrdner) => {
      const res = await api.post<{ data: Ordner }>('/firmenordner/ordner', neu);
      return res.data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ORDNER_KEY });
    },
  });
}

/**
 * Wegwerfen, samt allem, was darin liegt. Die Kennung geht als Abfrage mit —
 * derselbe Riegel wie beim Entfernen einer App: wer sie tippt, hat gelesen,
 * was er wegwirft. `showError: false`, weil der Dialog den Satz selbst zeigt
 * (ein 409 sagt, was zuerst weg muss).
 */
export function useOrdnerLoeschen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, kennung }: { id: Ordner['id']; kennung: string }) =>
      api.del(`/firmenordner/ordner/${id}?kennung=${encodeURIComponent(kennung)}`, {
        showError: false,
        // Das Wegwerfen darf lange dauern (bis zu 15 Minuten, siehe die Route);
        // die 30 s von `useApi` wären hier genau der Schnitt, gegen den es
        // gebaut ist.
        signal: AbortSignal.timeout(16 * 60 * 1000),
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ORDNER_KEY });
      void qc.invalidateQueries({ queryKey: RECHTE_KEY });
    },
  });
}

/**
 * Eine Zelle der Matrix setzen oder räumen.
 *
 * `recht: null` heißt „keine" und wird zum DELETE; alles andere ist ein POST,
 * auch wenn schon eine Zeile steht (der Server überschreibt dann nur die
 * Stufe). Dieselbe Regel wie bei der Freigabe-Matrix aus D3.
 *
 * `showError: false`: die Matrix zeigt den Satz des Backends selbst, an der
 * Stelle, an der geklickt wurde — ein 409 trägt den Ausweg („das Recht auf
 * dem Elternordner zurücknehmen und die Ordner darunter einzeln vergeben"),
 * und der gehört neben die Zelle und nicht in eine Meldung, die nach fünf
 * Sekunden weg ist.
 */
export function useRechtSetzen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<
    unknown,
    ApiError,
    { ordnerId: Ordner['id']; benutzerId: BenutzerId; recht: Recht | null }
  >({
    mutationFn: async ({ ordnerId, benutzerId, recht }) => {
      if (recht === null) {
        return api.del(`/firmenordner/rechte/${ordnerId}/${benutzerId}`, { showError: false });
      }
      return api.post(
        '/firmenordner/rechte',
        { ordner_id: ordnerId, benutzer_id: benutzerId, recht },
        { showError: false }
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: RECHTE_KEY });
      void qc.invalidateQueries({ queryKey: ORDNER_KEY });
    },
  });
}

/** Die Zeile eines Paars aus der flachen Liste, oder `undefined`. Über `String(...)`, wie in D3. */
export function rechtVon(
  rechte: RechtZeile[],
  ordnerId: Ordner['id'],
  benutzerId: BenutzerId
): RechtZeile | undefined {
  return rechte.find(
    r => String(r.ordner_id) === String(ordnerId) && String(r.user_id) === String(benutzerId)
  );
}

/**
 * Der Baum aus der flachen Liste: die Wurzel zuerst, dann jeder geteilte
 * Bereich der Ebene 1 mit seinen Projekten darunter, zuletzt die Ordner am
 * Gerät. Die Ordner am Gerät stehen hinten, weil sie zu keinem Menschen
 * gehören — im abgeglichenen Baum kommen sie nicht vor. Reine Funktion,
 * damit Baum und Matrix dieselbe Reihenfolge zeigen.
 */
export function alsBaum(ordner: Ordner[]): Ordner[] {
  const wurzel = ordner.filter(o => o.art === 'wurzel');
  const nachKennung = (a: Ordner, b: Ordner) => a.kennung.localeCompare(b.kennung);
  const oben = [
    ...ordner.filter(o => o.ebene === 1 && o.art === 'geteilt').sort(nachKennung),
    ...ordner.filter(o => o.ebene === 1 && o.art === 'am_geraet').sort(nachKennung),
  ];
  const kinderVon = (id: Ordner['id']) =>
    ordner
      .filter(o => o.ebene === 2 && String(o.eltern_id) === String(id))
      .sort((a, b) => a.kennung.localeCompare(b.kennung));
  return [...wurzel, ...oben.flatMap(o => [o, ...kinderVon(o.id)])];
}
