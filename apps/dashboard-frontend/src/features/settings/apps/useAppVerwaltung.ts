/**
 * Die Apps des Geräts, aus der Sicht dessen, der sie verwaltet (Phase D4).
 *
 * Alle Abfragen und Mutationen der App-Ansicht stehen hier zusammen — je
 * Adresse eine, wie in `mitarbeiter/useMitarbeiter.ts`. Was sie eint: sie
 * gehen alle auf `/api/apps/…` und tragen alle `requireRole('admin')` im
 * Backend. Die Oberfläche blendet die Sektion für einen Mitarbeiter aus; die
 * Berechtigung ist das nicht.
 *
 * DIE LISTE ALLER APPS KOMMT AUS `mitarbeiter/useAppFreigaben.ts`
 * (`useAlleApps`, `GET /api/apps`). Sie steht dort, weil die Freigabe-Matrix
 * aus D3 sie zuerst brauchte, und sie ein zweites Mal zu formulieren hieße,
 * zwei Abfragen mit zwei Schlüsseln auf dieselbe Adresse zu haben — React
 * Query dedupliziert dann nichts mehr. Beide Dateien liegen unter
 * `features/settings/`; das ist derselbe Feature-Ordner und kein Querimport.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { STORE_MODELS_KEY, type CatalogModel } from '@/hooks/useStoreCatalog';
import type { Stand } from '../mitarbeiter/useAppFreigaben';

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
  version: string;
  registriert_am: string;
}

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
  modelle: Array<{ name: string; vorhanden: boolean }>;
  flows: AppFlow[];
}

export interface AppDetail {
  id: string;
  name: string;
  beschreibung: string | null;
  versionen: string[];
  staende: { test: AppStandDetail | null; live: AppStandDetail | null };
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
  status: 'laeuft' | 'wartend' | 'fertig' | 'fehler' | 'abgebrochen' | 'abgelaufen';
  steps_used: number | null;
  created_at: string;
  finished_at: string | null;
  arguments: Record<string, string>;
  error: string | null;
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

export interface AppLaufDetail extends AppLauf {
  result: string | null;
  steps: LaufSchritt[];
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
 * Den Teststand live schalten oder zurücknehmen.
 *
 * Entwertet wird nach JEDEM Ausgang, auch nach einem Fehler — dieselbe Regel
 * wie bei den Freigaben aus D2 und D3. Ein 409 heißt gerade, dass die Ansicht
 * im Browser nicht mehr stimmt.
 */
export function useSchalten(appId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ziel: 'live' | 'zurueck') => api.post(`/apps/${appId}/schalten`, { ziel }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: appKey(appId) });
      void qc.invalidateQueries({ queryKey: ['apps', 'alle'] });
      void qc.invalidateQueries({ queryKey: ['apps', 'meine'] });
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
