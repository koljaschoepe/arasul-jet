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
type OrdnerArt = 'wurzel' | 'geteilt' | 'am_geraet';

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
  /** Die Adresse, die ein Mitarbeiter nehmen soll: die, unter der dieses Fenster das Gerät erreicht. */
  adresse: string | null;
  /** Alle Adressen des Firmenordners, die erste zuerst (J34, 27.09.2026). */
  adressen?: string[];
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

/** Ein Eintrag im Papierkorb eines Hauptordners oder Bereichs (J34, 27.09.2026). */
export interface PapierkorbEintrag {
  id: string;
  /** Wo er lag, relativ zum Ordner — bei einem Projekt `<projekt>/…`. */
  ort: string;
  name: string;
  geloescht_am: string | null;
  ordner: boolean;
  /** Bytes einer Datei; bei einem Ordner `null`. */
  groesse: number | null;
}

/** Wie viel in einem Papierkorb liegt; `anzahl: null`, wenn er gerade nicht antwortet. */
export interface PapierkorbStand {
  ordner_id: number | string;
  kennung: string;
  anzahl: number | null;
  groesse: number | null;
}

/**
 * Belegt, Grenze und frei eines Hauptordners oder Bereichs (J33, 28.09.2026),
 * alles in Bytes. `grenze: null` heißt ohne Grenze, also bis zum freien Platz
 * des Geräts; `frei` ist, was noch hineinpasst, nie mehr als die Platte hat.
 */
export interface PlatzStand {
  ordner_id: number | string;
  kennung: string;
  belegt: number;
  grenze: number | null;
  frei: number | null;
  /** Welche Zahl die engere ist: die Grenze kann der Administrator anheben, die Platte nicht. */
  begrenzt_durch: 'grenze' | 'platte';
  stufe: 'gut' | 'knapp' | 'voll';
  /**
   * Frühere Fassungen von Dateien, die auf der Platte liegen, aber nicht in
   * `belegt` zählen (der Dienst rechnet nur sichtbare Dateien). `null`, wenn
   * das Gerät sie nicht lesen kann.
   */
  revisionen?: { anzahl: number; bytes: number } | null;
}

/** Was `GET /api/firmenordner/platz` liefert. */
export interface PlatzUebersicht {
  platte: { frei: number | null };
  /** Die Grenze, die ein neuer Bereich bekommt. */
  vorgabe: number;
  erreichbar: boolean;
  /** Wie viele frühere Fassungen das Gerät je Datei behält. */
  revisionen_je_datei?: number;
  ordner: PlatzStand[];
}

export const ORDNER_KEY = ['firmenordner', 'ordner'] as const;
const PLATZ_KEY = ['firmenordner', 'platz'] as const;
const PAPIERKORB_KEY = ['firmenordner', 'papierkorb'] as const;
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

/**
 * Wie viel in welchem Papierkorb liegt — je Hauptordner und Bereich, für die
 * Spalte im Ordnerbaum. Eine Anfrage für alle, nicht eine je Zeile.
 */
export function usePapierkorbUebersicht(an: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: PAPIERKORB_KEY,
    enabled: an,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<{ data?: PapierkorbStand[] }>('/firmenordner/papierkorb', {
        showError: false,
      });
      return res.data ?? [];
    },
  });
}

/**
 * Belegt, Grenze und frei je Hauptordner und Bereich — für die Spalte „Platz"
 * im Ordnerbaum und die Warnung darüber. Eine Anfrage für alle.
 */
export function usePlatz(an: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: PLATZ_KEY,
    enabled: an,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<{ data?: PlatzUebersicht }>('/firmenordner/platz', {
        showError: false,
      });
      return res.data ?? null;
    },
  });
}

/**
 * Die Grenze setzen (`grenze` in Bytes) oder wegnehmen (`null`).
 * `showError: false`: der Dialog zeigt den Satz des Geräts selbst (ein 409
 * sagt, wie viel schon darin liegt).
 */
export function useGrenzeSetzen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { ordnerId: Ordner['id']; grenze: number | null }>({
    mutationFn: async ({ ordnerId, grenze }) =>
      api.put(`/firmenordner/ordner/${ordnerId}/grenze`, { grenze }, { showError: false }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: PLATZ_KEY });
    },
  });
}

/** Was im Papierkorb eines Ordners liegt — erst geholt, wenn ihn jemand öffnet. */
export function usePapierkorb(ordnerId: Ordner['id'] | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...PAPIERKORB_KEY, String(ordnerId)],
    enabled: ordnerId !== null,
    staleTime: 0,
    queryFn: async () => {
      const res = await api.get<{ data?: { ordner: string; eintraege: PapierkorbEintrag[] } }>(
        `/firmenordner/ordner/${ordnerId}/papierkorb`,
        { showError: false }
      );
      return res.data?.eintraege ?? [];
    },
  });
}

/**
 * Leeren, einen Eintrag endgültig entfernen oder ihn zurückholen. Eine
 * Mutation für alle drei, weil sie dasselbe entwerten: den Papierkorb und die
 * Zahl daneben. `showError: false` — der Dialog zeigt den Satz des Geräts an
 * der Stelle, an der geklickt wurde (ein 409 sagt, was im Weg liegt).
 */
export function usePapierkorbHandgriff() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<
    unknown,
    ApiError,
    { ordnerId: Ordner['id']; was: 'leeren' | 'entfernen' | 'wiederherstellen'; eintrag?: string }
  >({
    mutationFn: async ({ ordnerId, was, eintrag }) => {
      const weg = `/firmenordner/ordner/${ordnerId}/papierkorb`;
      // Das Leeren darf lange dauern wie das Wegwerfen (am Gerät lagen 700 MB darin).
      const lang = { showError: false, signal: AbortSignal.timeout(16 * 60 * 1000) };
      if (was === 'leeren') return api.del(weg, lang);
      const stueck = encodeURIComponent(eintrag ?? '');
      if (was === 'entfernen') return api.del(`${weg}/${stueck}`, lang);
      return api.post(`${weg}/${stueck}/wiederherstellen`, {}, lang);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: PAPIERKORB_KEY });
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
    // Auch die Rechte: wer einen Bereich anlegt, schreibt seither darin
    // (J34, 28.09.2026), und die Matrix soll das zeigen, ohne neu zu laden.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ORDNER_KEY });
      void qc.invalidateQueries({ queryKey: RECHTE_KEY });
      void qc.invalidateQueries({ queryKey: PLATZ_KEY });
    },
  });
}

/**
 * Wegwerfen, samt allem, was darin liegt. Die Kennung geht als Abfrage mit —
 * derselbe Riegel wie beim Entfernen einer App: wer sie tippt, hat gelesen,
 * was er wegwirft. `showError: false`, weil der Dialog den Satz selbst zeigt
 * (ein 409 sagt, was zuerst weg muss).
 *
 * Das eigene Recht des Administrators fällt mit dem Ordner (das Backend kennt
 * `durch`). Das Recht eines anderen Kontos nicht: das bleibt ein 409, der die
 * Konten nennt (J33, 28.09.2026) — darum geht hier kein `rechte=entziehen` mit.
 */
export function useOrdnerLoeschen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, kennung }: { id: Ordner['id']; kennung: string }) =>
      api.del<{ data: { kennung: string; rechte_entzogen?: string[] } }>(
        `/firmenordner/ordner/${id}?kennung=${encodeURIComponent(kennung)}`,
        {
          showError: false,
          // Das Wegwerfen darf lange dauern (bis zu 15 Minuten, siehe die Route);
          // die 30 s von `useApi` wären hier genau der Schnitt, gegen den es
          // gebaut ist.
          signal: AbortSignal.timeout(16 * 60 * 1000),
        }
      ),
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
