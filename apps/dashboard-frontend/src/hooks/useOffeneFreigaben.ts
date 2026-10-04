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
 * wartet ein Mensch mit einer Frist von in der Regel sieben Tagen
 * (`FLOW_FREIGABE_FRIST_MINUTEN`, Vorgabe 10080). Ein Zähler, der schneller
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
  /** Wer den Lauf ausgelöst hat (J35), sofern die App es genannt hat. */
  einreicher?: string | null;
  /** Der Einreicher ist vom Entscheiden ausgeschlossen (Vier-Augen-Prinzip). */
  ohne_einreicher?: boolean;
  /** Nur benannte Entscheider sehen diese Anfrage (Rolle oder Konten). */
  benannt?: boolean;
  /** Der Name der App aus ihrem Manifest (26.09.2026); `app_id` ist die Kennung. */
  app_name?: string | null;
  /** Die Regel: nur die Rolle oder nur diese Konten; `null` heißt ohne Einengung. */
  entscheider?: { rolle: 'admin' } | { konten: string[] } | null;
  /** Die Konten, die diese Anfrage jetzt entscheiden können. */
  kreis?: string[];
  /** Die benannte Stufe aus dem Kopf des Flows (Kontrakt 8), sonst `null`. */
  stufe?: string | null;
  /** Ihre Bezeichnung aus dem Flow („Prüfung"), sonst `null`. */
  stufe_bezeichnung?: string | null;
  /**
   * Bei wem die Anfrage liegt (M5): ein Benutzername, oder `null` — dann liegt
   * sie bei allen, die sie entscheiden dürfen (keine Standardperson).
   */
  liegt_bei?: string | null;
  liegt_seit?: string | null;
  /**
   * Die erkannten Felder (M5, Migration 197): je Feld der Vorschlag der KI,
   * ob es zu prüfen ist und ob es sich ändern lässt. `null` ohne Erkennung.
   */
  felder?: FreigabeFeldDaten[] | null;
  /** Das Original (Bild oder PDF) als Adresse gleicher Herkunft, sonst `null`. */
  original?: string | null;
  /** Die früheren Freigaben desselben Laufs, älteste zuerst. */
  frueher?: FruehereFreigabe[];
}

/** Ein erkanntes Feld, wie das Backend es an der Anfrage führt. */
interface FreigabeFeldDaten {
  name: string;
  vorschlag: string;
  unsicher: boolean;
  fehlend: boolean;
  aenderbar: boolean;
}

/** Eine Änderung an einem Feld beim Bestätigen: wer, wann, von was zu was. */
interface FreigabeKorrekturDaten {
  feld: string;
  vorschlag: string;
  wert: string;
  von: string | null;
  am: string | null;
}

/** Eine frühere Freigabe desselben Laufs. */
interface FruehereFreigabe {
  id: number;
  titel: string;
  stufe: string | null;
  status: 'offen' | 'bestaetigt' | 'abgelehnt' | 'abgelaufen' | 'verfallen';
  entschieden_von: string | null;
  entschieden_am: string | null;
  begruendung: string | null;
  korrekturen: FreigabeKorrekturDaten[] | null;
}

/**
 * Eine offene Anfrage, die ICH eingereicht habe (26.09.2026), so wie
 * `GET /api/freigabe-anfragen/eingereicht` sie liefert. Kein Zusammenhang und
 * keine Knöpfe: wer eingereicht hat, will wissen, bei wem es liegt.
 */
export interface EingereichteFreigabe {
  id: number;
  run_id: number;
  app_id: string;
  app_name: string | null;
  stand: 'live' | 'test';
  flow_name: string;
  titel: string;
  frist: string;
  angefragt_am: string;
  ohne_einreicher: boolean;
  entscheider: { rolle: 'admin' } | { konten: string[] } | null;
  kreis: string[];
  /** Bei wem sie liegt (M5); `null` = bei allen im Kreis. */
  liegt_bei?: string | null;
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
  /** Was beim Bestätigen geändert wurde; `null` = nichts. */
  korrekturen?: FreigabeKorrekturDaten[] | null;
}

const FREIGABEN_KEY = ['freigabe-anfragen'] as const;
const OFFENE_FREIGABEN_KEY = [...FREIGABEN_KEY, 'offen'] as const;
const EINGEREICHTE_FREIGABEN_KEY = [...FREIGABEN_KEY, 'eingereicht'] as const;
const BEI_ANDEREN_KEY = [...FREIGABEN_KEY, 'bei-anderen'] as const;

/**
 * Die Freigaben, die BEI MIR liegen (M5): bei mir persönlich oder, ohne
 * Standardperson ihrer Stufe, bei allen im Kreis. Die Startseite („Für Sie")
 * und die Zahl am Haus der Aktivitätsleiste lesen diese eine Abfrage.
 */
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

/**
 * Was ich eingereicht habe und noch offen ist (26.09.2026).
 *
 * Unter einem eigenen Schlüssel, damit der Zähler der Statusleiste nicht
 * mitzählt, was gar nicht auf mich wartet — aber unter demselben Präfix, damit
 * eine Entscheidung beide Listen entwertet.
 */
export function useEingereichteFreigaben() {
  const api = useApi();
  return useQuery({
    queryKey: EINGEREICHTE_FREIGABEN_KEY,
    queryFn: async () => {
      const res = await api.get<{ data?: EingereichteFreigabe[] }>(
        '/freigabe-anfragen/eingereicht',
        { showError: false }
      );
      return res.data ?? [];
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Bestätigen oder ablehnen — eine Entscheidung, ein Aufruf. Beim Bestätigen
 * gehen die Felder mit, die der Mensch geändert hat (M5).
 */
export type Entscheidung =
  | { id: number; status: 'bestaetigt'; felder?: Record<string, string> }
  | { id: number; status: 'abgelehnt'; begruendung: string };

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
      const leib =
        e.status === 'abgelehnt'
          ? { begruendung: e.begruendung }
          : e.felder
            ? { felder: e.felder }
            : {};
      const res = await api.post<{ data: FreigabeEntschieden }>(pfad, leib);
      return res.data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: FREIGABEN_KEY });
    },
  });
}

/**
 * Was ich entscheiden dürfte, das aber bei einem anderen liegt (M5). Unter
 * eigenem Schlüssel, damit die Zahl am Haus es nicht mitzählt.
 */
export function useFreigabenBeiAnderen() {
  const api = useApi();
  return useQuery({
    queryKey: BEI_ANDEREN_KEY,
    queryFn: async () => {
      const res = await api.get<{ data?: OffeneFreigabe[] }>('/freigabe-anfragen/bei-anderen', {
        showError: false,
      });
      return res.data ?? [];
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Was das Backend nach Übernehmen oder Weitergeben zurückgibt. */
export interface FreigabeVerlegt {
  id: number;
  titel: string;
  liegt_bei: string;
}

/**
 * Übernehmen (`an` fehlt) oder weitergeben (`an` ist ein Benutzername).
 * Danach sind alle Listen veraltet, auch nach einem Fehler — dieselbe Regel
 * wie beim Entscheiden.
 */
export function useFreigabeVerlegen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, an }: { id: number; an?: string }) => {
      const res = an
        ? await api.post<{ data: FreigabeVerlegt }>(`/freigabe-anfragen/${id}/weitergeben`, { an })
        : await api.post<{ data: FreigabeVerlegt }>(`/freigabe-anfragen/${id}/uebernehmen`, {});
      return res.data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: FREIGABEN_KEY });
    },
  });
}
