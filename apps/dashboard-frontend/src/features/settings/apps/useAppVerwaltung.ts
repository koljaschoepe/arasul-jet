/**
 * Die Apps des Geräts, aus der Sicht dessen, der sie verwaltet (Phase D4).
 *
 * Alle Abfragen und Mutationen der App-Ansicht stehen hier zusammen — je
 * Adresse eine, wie in `personen/usePersonen.ts`. Was sie eint: sie
 * gehen alle auf `/api/apps/…` und tragen alle `requireRole('admin')` im
 * Backend. Die Oberfläche blendet die Sektion für einen Mitarbeiter aus; die
 * Berechtigung ist das nicht.
 *
 * DIE LISTE ALLER APPS KOMMT AUS `personen/useAppFreigaben.ts`
 * (`useAlleApps`, `GET /api/apps`). Sie steht dort, weil die Freigabe-Matrix
 * aus D3 sie zuerst brauchte, und sie ein zweites Mal zu formulieren hieße,
 * zwei Abfragen mit zwei Schlüsseln auf dieselbe Adresse zu haben — React
 * Query dedupliziert dann nichts mehr. Beide Dateien liegen unter
 * `features/settings/`; das ist derselbe Feature-Ordner und kein Querimport.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { STORE_MODELS_KEY, type CatalogModel } from '@/hooks/useStoreCatalog';
import type { Stand } from '../personen/useAppFreigaben';

/** Der Zustand eines App-Containers, wie ihn Docker meldet. */
export interface Backendzustand {
  laeuft: boolean;
  status: string;
  /** `healthy`, `unhealthy`, `starting` — oder null, wenn das Manifest keine Prüfung nennt. */
  gesundheit: string | null;
  seit: string | null;
  image: string | null;
}

/** Ein Flow, wie ihn `GET /api/apps/:id/flows` in der Liste zeigt. */
export interface AppFlow {
  name: string;
  beschreibung: string;
  argumente: Array<{ name: string; typ: string; pflicht: boolean; beschreibung: string }>;
  /** Das Modell, das den Flow WIRKLICH treibt. */
  modell: string | null;
  /** Kommt es vom Administrator (`true`) oder aus dem Paket (`false`)? */
  modell_ueberschrieben: boolean;
  extern: ExternesModell | null;
  /** Die Arten, die der Flow-Kopf nennt (Kontrakt 8); ohne Angabe nur `autonom`. */
  arten: FlowArt[];
  /** Die Art, mit der der nächste Lauf startet. */
  art: FlowArt;
  /** Hat der Administrator gewählt (`true`) oder gilt die Vorgabe des Pakets? */
  art_ueberschrieben: boolean;
  /** Ausgeschaltet startet der Flow nicht, das Backend weist ab (M5, Migration 200). */
  aktiv: boolean;
  /** Die Schritte aus dem Kopf, ohne Auftrag; leer = das Modell führt (M5). */
  schritte: FlowSchritt[];
  /** Wann er startet; ohne Angabe im Kopf `[{ typ: 'hand' }]` (Kontrakt 8). */
  ausloeser: FlowAusloeser[];
  /** Die Freigabestufen, die der Flow nennt. */
  stufen: { name: string; bezeichnung: string | null }[];
  version: string;
  registriert_am: string;
}

interface FlowSchritt {
  name: string;
  typ: 'subagent' | 'werkzeug';
  werkzeug?: string;
  rolle?: string;
}

export type FlowAusloeser =
  { typ: 'hand' } | { typ: 'zeitplan'; zeitplan: string } | { typ: 'ereignis'; ereignis: string };

export type FlowArt = 'autonom' | 'ergebnis_bestaetigen';

/** Was der Mensch liest, nie der Schlüssel. */
export const FLOW_ART_NAME: Record<FlowArt, string> = {
  autonom: 'Autonom',
  ergebnis_bestaetigen: 'Ergebnis bestätigen',
};

/** Das externe Modell eines Flows. Der Schlüssel steht hier nie. */
export interface ExternesModell {
  anbieter: string;
  modell: string;
  basis_url: string;
  /** Die letzten vier Zeichen des hinterlegten Schlüssels, oder null. */
  endet_auf: string | null;
}

/** Ein Stand einer App, wie ihn `GET /api/apps/:id` liefert. */
export interface AppStandDetail {
  version: string;
  vorige_version: string | null;
  eingespielt_am: string;
  pfad: string | null;
  api: string | null;
  backend: Backendzustand | null;
  /** Liegt auf der Platte, was der Stand verspricht? `frontend` ist null ohne Frontend. */
  dateien: { manifest: boolean; frontend: boolean | null };
  /** Bekommt ein Mensch, der auf die Kachel klickt, diese App? */
  lieferbar: boolean;
  /** Warum nicht — ein Satz, oder null. */
  mangel: string | null;
  /**
   * Auf welcher Fassung des Designsystems die App steht (Phase H6) — `null`,
   * wenn ihr Manifest es nicht sagt. Verglichen wird hier, nicht im Backend:
   * die Fassung des Geräts kennt die Shell, weil sie die Bibliothek
   * mitübersetzt (`FASSUNG` aus `@marken`).
   */
  marken: string | null;
  modelle: Array<{ name: string; vorhanden: boolean }>;
  flows: AppFlow[];
  /** Was der Entwickler beim Ausrollen über diese Fassung schrieb (Kontrakt 8), oder null. */
  aenderungstext?: string | null;
}

/**
 * Ein Versuch, live zu schalten (M5, Migration 199): gesichert, geschaltet,
 * und wenn die neue Fassung nicht hochkam, wieder zurück.
 */
export interface AppSchaltung {
  id: number;
  von_version: string | null;
  nach_version: string;
  ergebnis: 'laeuft' | 'live' | 'zurueckgeschaltet' | 'nicht_gesichert' | 'fehlgeschlagen';
  /** Der Stand der Sicherung davor, oder null. */
  sicherung_id: string | null;
  /** Der eine Satz an den Admin. */
  satz: string | null;
  /** Der zweite: was er tun kann. */
  hilfe: string | null;
  /** Nur aufgeklappt. */
  technik: {
    grund?: string | null;
    exit_code?: number | null;
    neustarts?: number;
    letzte_zeilen?: string;
    ausgabe?: string;
    rueckfall?: {
      daten: { erfolg: boolean } | null;
      fassung: { erfolg: boolean; version: string | null; fehler?: string } | null;
    };
  } | null;
  begonnen_am: string;
  beendet_am: string | null;
}

export interface AppDetail {
  id: string;
  name: string;
  beschreibung: string | null;
  versionen: string[];
  staende: { test: AppStandDetail | null; live: AppStandDetail | null };
  /** Der letzte Versuch, live zu schalten (M5), oder null. */
  letzte_schaltung?: AppSchaltung | null;
}

/** Die Flow-Datei selbst (`GET /api/apps/:id/flows/:name`). */
export interface FlowDefinition {
  name: string;
  app_id: string;
  stand: Stand;
  version: string;
  beschreibung?: string;
  /** Der Auftrag an das Modell. Heißt in der Datei `systemPrompt`. */
  prompt: string;
  werkzeuge?: string[];
  rollen?: Record<string, unknown>;
  schritte?: Array<{ name: string; typ: string; werkzeug?: string; rolle?: string }>;
  grenzen?: Record<string, number>;
  argumente?: Array<{ name: string; typ: string; pflicht: boolean; beschreibung?: string }>;
  /** Was das Paket wollte — daneben steht in `modell`, was gilt. */
  paket_modell: string | null;
  modell: string | null;
  modell_ueberschrieben: boolean;
  extern: ExternesModell | null;
}

/** Ein Lauf in der Liste. */
export interface AppLauf {
  id: number;
  flow_name: string;
  stand: Stand;
  status:
    'laeuft' | 'wartend' | 'fertig' | 'fehler' | 'abgebrochen' | 'abgelaufen' | 'nicht_uebergeben';
  steps_used: number | null;
  created_at: string;
  finished_at: string | null;
  arguments: Record<string, string>;
  error: string | null;
  /** Die Übergabe an die Abschluss-Route der App; null bei einem Flow ohne (M5, Kontrakt 11). */
  abschluss?: LaufAbschluss | null;
}

/** Wie weit die Übergabe des Ergebnisses an die App ist. */
interface LaufAbschluss {
  route: string;
  versuche: number;
  letzter_versuch?: string | null;
  status_code?: number | null;
  fehler?: string | null;
  uebergeben_am?: string | null;
}

/**
 * Ein Modellaufruf der App über die Schnittstelle (J35). Ohne Inhalt: kein
 * Dateiname, kein Text, keine Antwort — nur deren sha256.
 */
export interface KiAufruf {
  id: number;
  begonnen_am: string;
  beendet_am: string | null;
  dauer_ms: number | null;
  stand: Stand;
  benutzer_id: number | null;
  benutzer_name: string | null;
  endpunkt: string;
  modell: string | null;
  job_id: string | null;
  /** Der Flow-Lauf, zu dem ein Modellschritt gehört (`endpunkt` ist dann `flows/<name>`). */
  lauf_id: number | null;
  status: 'laeuft' | 'fertig' | 'fehler';
  fehler: string | null;
  antwort_sha256: string | null;
  datei_typ: string | null;
  datei_bytes: number | null;
}

/** Ein Schritt eines Laufs. `modell` ist der Gedankengang. */
export interface LaufSchritt {
  id: number;
  position: number;
  kind: 'werkzeug' | 'subagent' | 'modell' | 'hinweis';
  name: string;
  input: Record<string, unknown> | null;
  output: string | null;
  status: string;
  created_at: string;
  finished_at: string | null;
  parent_step_id: number | null;
  modell: string | null;
}

/**
 * Eine Freigabe des Laufs mit ihren Feldern (M5, Migration 197): was die KI
 * vorschlug und was der Mensch beim Bestätigen änderte.
 */
export interface LaufFreigabe {
  id: number;
  titel: string;
  stufe: string | null;
  status: 'offen' | 'bestaetigt' | 'abgelehnt' | 'abgelaufen' | 'verfallen';
  angefragt_am: string;
  entschieden_am: string | null;
  entschieden_von: string | null;
  begruendung: string | null;
  felder_schritt: string | null;
  felder: { name: string; vorschlag: string; unsicher: boolean; fehlend: boolean }[] | null;
  korrekturen:
    | { feld: string; vorschlag: string; wert: string; von: string | null; am: string | null }[]
    | null;
}

export interface AppLaufDetail extends AppLauf {
  result: string | null;
  steps: LaufSchritt[];
  /** Die Freigaben des Laufs; fehlt bei einem Backend vor Migration 197. */
  freigaben?: LaufFreigabe[];
}

/**
 * Die Modelle, die auf diesem Gerät liegen — für die Modellwahl eines Flows.
 *
 * ÜBER DEN SCHLÜSSEL DER STORE-ANSICHT (`STORE_MODELS_KEY`), damit React Query
 * die Liste nicht ein zweites Mal holt. Und nicht über `useStoreCatalog()`:
 * der fragt neben dem Katalog noch drei weitere Wege ab (geladenes Modell,
 * Standardmodell, `/apps` im alten Store-Format), die für die Frage „welches
 * Modell soll diesen Flow treiben" nichts beitragen. Dieselbe Überlegung wie
 * in `features/workspace/StatusBar.tsx`.
 */
export function useKurzliste() {
  const api = useApi();
  return useQuery({
    queryKey: STORE_MODELS_KEY,
    queryFn: async () => {
      const res = await api.get<{ models?: CatalogModel[] }>('/models/catalog');
      // OCR-Engines gehören nicht in die Modellwahl: sie sind keine
      // Ollama-Modelle (dieselbe Siebung wie im Katalog-Hook).
      return (res.models ?? []).filter(m => m.model_type !== 'ocr');
    },
    staleTime: 30_000,
  });
}

const appKey = (id: string) => ['apps', 'detail', id] as const;
const laeufeKey = (id: string) => ['apps', 'laeufe', id] as const;
const kiAufrufeKey = (id: string) => ['apps', 'ki-aufrufe', id] as const;
const laufKey = (id: string, runId: number) => ['apps', 'lauf', id, runId] as const;
const flowKey = (id: string, stand: Stand, name: string) =>
  ['apps', 'flow', id, stand, name] as const;
const logKey = (id: string, stand: Stand) => ['apps', 'logs', id, stand] as const;

/**
 * Eine App im Einzelnen.
 *
 * `staleTime` von zehn Sekunden und nicht dreißig wie bei den Listen: hier
 * steht der Zustand eines Containers drin, und der ändert sich, während
 * jemand zusieht — gerade dann, wenn er eben live geschaltet hat.
 */
export function useApp(appId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: appKey(appId ?? ''),
    queryFn: async () => {
      const res = await api.get<{ data?: AppDetail }>(`/apps/${appId}`);
      return res.data ?? null;
    },
    enabled: Boolean(appId),
    staleTime: 10_000,
  });
}

/** Die Läufe einer App, neueste zuerst. */
export function useAppLaeufe(appId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: laeufeKey(appId ?? ''),
    queryFn: async () => {
      const res = await api.get<{ data?: AppLauf[] }>(`/apps/${appId}/laeufe?limit=25`);
      return res.data ?? [];
    },
    enabled: Boolean(appId),
    staleTime: 5_000,
  });
}

/**
 * Die Modellaufrufe einer App, neueste zuerst (J35) — auch die, die kein Flow
 * sind, etwa `document/extract-structured`.
 */
export function useKiAufrufe(appId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: kiAufrufeKey(appId ?? ''),
    queryFn: async () => {
      const res = await api.get<{ data?: KiAufruf[] }>(`/apps/${appId}/ki-aufrufe?limit=50`);
      return res.data ?? [];
    },
    enabled: Boolean(appId),
    staleTime: 5_000,
  });
}

/**
 * Ein Lauf samt Schritten.
 *
 * `refetchInterval`, solange er noch läuft oder wartet: ein Lauf, der auf eine
 * Freigabe wartet, geht weiter, sobald jemand anderes entschieden hat — und
 * die Ansicht soll das zeigen, ohne dass jemand die Seite neu lädt. Ist er
 * beendet, ändert sich nichts mehr, und dann fragt hier auch niemand mehr.
 */
export function useAppLauf(appId: string | null, runId: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: laufKey(appId ?? '', runId ?? 0),
    queryFn: async () => {
      const res = await api.get<{ data?: AppLaufDetail }>(`/apps/${appId}/laeufe/${runId}`);
      return res.data ?? null;
    },
    enabled: Boolean(appId && runId),
    refetchInterval: q => {
      const lauf = q.state.data as AppLaufDetail | null | undefined;
      return lauf && (lauf.status === 'laeuft' || lauf.status === 'wartend') ? 5_000 : false;
    },
  });
}

/**
 * „Erneut": die Übergabe eines Laufs auf „nicht übergeben" noch einmal an die
 * App schicken (M5). Die Schritte laufen nicht neu. Entwertet wird nach jedem
 * Ausgang: auch ein Fehlschlag schreibt einen neuen Grund an den Lauf.
 */
export function useLaufErneut(appId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: number) => {
      const res = await api.post<{ data?: AppLauf }>(`/apps/${appId}/laeufe/${runId}/erneut`, {});
      return res.data ?? null;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: laeufeKey(appId) });
      void qc.invalidateQueries({ queryKey: ['apps', 'lauf', appId] });
    },
  });
}

/** Die Flow-Datei eines Standes. */
export function useFlowDefinition(appId: string | null, stand: Stand, name: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: flowKey(appId ?? '', stand, name ?? ''),
    queryFn: async () => {
      const res = await api.get<{ data?: FlowDefinition }>(
        `/apps/${appId}/flows/${name}?stand=${stand}`
      );
      return res.data ?? null;
    },
    enabled: Boolean(appId && name),
    staleTime: 60_000,
  });
}

/**
 * Die letzten Zeilen des App-Backends.
 *
 * Ohne `staleTime`: wer die Logs aufschlägt, will wissen, was GERADE los ist.
 * Ein Zwischenspeicher zeigte ihm den Stand von vorhin, und das ist bei einer
 * Fehlersuche die falsche Antwort.
 */
export function useAppLogs(appId: string | null, stand: Stand, an: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: logKey(appId ?? '', stand),
    queryFn: async () => {
      const res = await api.get<{ data?: { logs: string } }>(
        `/apps/${appId}/logs?stand=${stand}&zeilen=200`
      );
      return res.data?.logs ?? '';
    },
    enabled: Boolean(appId) && an,
    staleTime: 0,
  });
}

/**
 * Wie lange Live schalten höchstens dauern darf: das Backend wartet je bis zu
 * 30 Minuten auf die Sicherung davor und auf das Zurückholen danach. Gibt der
 * Browser früher auf, arbeitet das Gerät weiter, und niemand weiß, wie es
 * ausging (es steht dann trotzdem in der Karte des Livestands).
 */
const SCHALTEN_ZEITGRENZE_MS = 60 * 60_000;

/**
 * Den Teststand live schalten oder zurücknehmen.
 *
 * Entwertet wird nach JEDEM Ausgang, auch nach einem Fehler — dieselbe Regel
 * wie bei den Freigaben aus D2 und D3. Ein 409 heißt gerade, dass die Ansicht
 * im Browser nicht mehr stimmt.
 *
 * Ohne eigene Fehlermeldung (M5): ein Rückfall (`LIVE_ZURUECKGESCHALTET`,
 * `LIVE_NICHT_GESICHERT`) steht danach in der Karte des Livestands, mit
 * zweitem Satz und Technik; alles andere meldet der Aufrufer.
 */
export function useSchalten(appId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ziel: 'live' | 'zurueck') =>
      api.post(
        `/apps/${appId}/schalten`,
        { ziel },
        // Sichern, schalten und abwarten, ob die neue Fassung gesund wird,
        // dauert am Orin um zwei Minuten, mit Rückfall länger.
        { showError: false, signal: AbortSignal.timeout(SCHALTEN_ZEITGRENZE_MS) }
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: appKey(appId) });
      void qc.invalidateQueries({ queryKey: ['apps', 'alle'] });
      void qc.invalidateQueries({ queryKey: ['apps', 'meine'] });
    },
  });
}

/**
 * Eine App vom Gerät entfernen (Auftrag app-leiche, 28.08.2026).
 *
 * MIT DATEIEN. `DELETE /api/apps/:id` lässt die Ordner unter `/arasul/apps/`
 * ohne Angabe liegen, weil das Kit eine App üblicherweise gleich wieder
 * einspielt. Wer sie hier entfernt, ist kein Kit, sondern ein Mensch, der sie
 * loswerden will — samt Container, Ständen, Freigaben, Schlüsseln und Dateien.
 * Derselbe Dienst wie `DELETE /api/v1/external/apps/:id` aus C5.
 *
 * Entwertet wird ALLES unter `['apps']`: die Liste der Verwaltung, die
 * Kacheln der Shell (`meine`), die Freigabe-Matrix. Eine App, die es nicht
 * mehr gibt, darf nirgends stehen bleiben.
 */
export function useEntfernen(appId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del(`/apps/${appId}?dateien=true`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['apps'] });
      void qc.invalidateQueries({ queryKey: ['freigaben'] });
    },
  });
}

/** Was ein Flow-Modell werden soll: eines vom Gerät, keines, oder eines draußen. */
export type ModellWunsch =
  | { modell: string | null }
  | {
      extern: { anbieter: string; modell: string; basis_url: string; schluessel?: string };
    };

/**
 * Das Modell eines Flows setzen.
 *
 * EIN Aufruf für alle drei Fälle, weil es EINE Entscheidung ist (siehe
 * `schemas/apps.js`). Nach ihr ist sowohl die App-Ansicht veraltet (dort steht
 * das Modell in jeder Flow-Liste) als auch die Flow-Datei.
 *
 * ENTWERTET WIRD OHNE `stand`, und das ist kein Versehen: die Überschreibung
 * gilt dem Flow und nicht der Fassung (`flow_settings` hat den Stand nicht im
 * Schlüssel, C6). Wer nur den geöffneten Stand entwertete, ließe im anderen
 * das alte Modell stehen — sichtbar falsch, sobald jemand umschaltet.
 * `['apps', 'flow', appId]` trifft als Präfix beide.
 */
export function useFlowModell(appId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flow, wunsch }: { flow: string; wunsch: ModellWunsch }) =>
      api.put(`/apps/${appId}/flows/${flow}/modell`, wunsch),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: appKey(appId) });
      void qc.invalidateQueries({ queryKey: ['apps', 'flow', appId] });
    },
  });
}

/**
 * Die Art eines Flows schalten (M5, `PUT /api/apps/:id/flows/:name/art`). Gilt
 * ab dem nächsten Lauf; das Backend weist eine Art ab, die der Kopf nicht nennt.
 */
export function useFlowArt(appId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flow, art }: { flow: string; art: FlowArt | null }) =>
      api.put(`/apps/${appId}/flows/${flow}/art`, { art }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: appKey(appId) });
      void qc.invalidateQueries({ queryKey: ['apps', 'flow', appId] });
    },
  });
}

/**
 * Einen Flow aus- oder einschalten (M5, `PUT /api/apps/:id/flows/:name/aktiv`).
 * Aus heißt: er startet nicht; ein Lauf, der schon läuft oder wartet, geht zu Ende.
 */
export function useFlowAktiv(appId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flow, aktiv }: { flow: string; aktiv: boolean }) =>
      api.put(`/apps/${appId}/flows/${flow}/aktiv`, { aktiv }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: appKey(appId) });
      void qc.invalidateQueries({ queryKey: ['apps', 'flow', appId] });
    },
  });
}

/** Eine Freigabestufe der App mit ihrer Standardperson (M5, `GET /api/apps/:id/stufen`). */
export interface AppStufe {
  stufe: string;
  bezeichnung: string | null;
  flows: string[];
  person: { id: number; username: string } | null;
  /** Die Person ist gesetzt UND hat noch Zugang zur App. */
  gilt: boolean;
  gesetzt_am: string | null;
  /** Der Satz für den Admin, wenn neue Freigaben bei allen mit Zugang liegen. */
  hinweis: string | null;
}

export interface AppStufen {
  stufen: AppStufe[];
  /** Wer Standardperson sein kann: alle aktiven mit Zugang zur App. */
  personen: { id: number; username: string }[];
}

const stufenKey = (id: string) => ['apps', 'stufen', id] as const;

export function useAppStufen(appId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: stufenKey(appId ?? ''),
    queryFn: async () => {
      const res = await api.get<{ data?: AppStufen }>(`/apps/${appId}/stufen`);
      return res.data ?? { stufen: [], personen: [] };
    },
    enabled: Boolean(appId),
    staleTime: 10_000,
  });
}

/** Die Standardperson einer Stufe setzen; `null` nimmt sie zurück. */
export function useStufePersonSetzen(appId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stufe, benutzerId }: { stufe: string; benutzerId: number | null }) =>
      api.put(`/apps/${appId}/stufen/${stufe}`, { benutzer_id: benutzerId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: stufenKey(appId) });
    },
  });
}
