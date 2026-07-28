/**
 * useFlowRun — startet einen Flow-Lauf und überträgt ihn live (Plan 011, Schritt 12).
 *
 * Der Lauf läuft SERVERSEITIG weiter, unabhängig von diesem Hook. Der Hook ist
 * nur das Fenster darauf:
 *
 *  - `start(flow, args)` stößt den Lauf an und bekommt sofort eine Lauf-ID.
 *  - `verbinden(runId)` öffnet den Ereignis-Strom. Er sendet ZUERST den
 *    gespeicherten Verlauf (Wiederverbinden: man sieht sofort alles bis hierher),
 *    dann die Live-Schritte.
 *  - Bricht die Verbindung ab (Tab zu, Netz weg), läuft der Lauf weiter; ein
 *    erneutes `verbinden(runId)` hängt sich wieder an.
 *  - `abbrechen()` stoppt den Lauf wirklich (serverseitiges Abort-Signal).
 *
 * Die Übertragung läuft über `fetch` + `getReader` (wie der Chat-Stream), nicht
 * über EventSource — nur so lässt sich der Bearer-Token mitschicken.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import { useApi } from './useApi';

/** Ein Schritt eines Laufs, wie ihn der Verlauf/die Live-Ereignisse liefern. */
export interface FlowRunStep {
  /** Postgres BIGSERIAL — kommt je nach Pfad als Zahl ODER String an. */
  id?: number | string;
  position?: number;
  kind: 'werkzeug' | 'subagent' | 'modell' | 'hinweis';
  name: string;
  input?: unknown;
  output?: string | null;
  status: FlowRunStatus;
  /** Zeitstempel (nur im gespeicherten Verlauf/Wiederverbinden) — für die Dauer. */
  created_at?: string;
  finished_at?: string | null;
  /** Eltern-Schritt (Agenten-Baum): innere Werkzeug-Aufrufe eines Subagenten. */
  parent_step_id?: number | string | null;
  /** Das Modell, das diesen Schritt getrieben hat (Subagent-Rolle/Modell-Schritt). */
  modell?: string | null;
}

export type FlowRunStatus = 'laeuft' | 'fertig' | 'fehler' | 'abgebrochen';

/** Eine einzelne Datei-Änderung eines Laufs (Plan 011, Schritt 16). */
export interface FlowRunChange {
  pfad: string;
  art: 'neu' | 'geaendert' | 'geloescht';
  /** Inhalt vorher (null bei neu / zu groß / Binärdatei). */
  vorher: string | null;
  /** Inhalt nachher (null bei gelöscht / zu groß / Binärdatei). */
  nachher: string | null;
  /** Vorschau wurde für die Speicherung gekürzt. */
  gekuerzt?: boolean;
  /** Warum keine Vorschau vorliegt („Binärdatei" / „zu groß für Vorschau"). */
  hinweis?: string | null;
}

export interface FlowRunState {
  runId: number | null;
  /** Name des laufenden Flows (aus dem Verlauf) — für die Kopfzeile der Lauf-Karte. */
  flowName: string | null;
  /** Die eingesetzten Argumente (aus dem Verlauf) — für die Kopfzeile der Lauf-Karte. */
  args: Record<string, string>;
  status: FlowRunStatus | null;
  /** Die bisher gesehenen Schritte, in Reihenfolge. */
  steps: FlowRunStep[];
  /** Das Endergebnis (die Antwort des Flows), sobald vorhanden. */
  result: string | null;
  error: string | null;
  /** Datei-Änderungen des Laufs (leer, solange keine anfielen). */
  changes: FlowRunChange[];
  /** Läuft gerade eine Live-Verbindung? */
  verbunden: boolean;
}

interface StreamEvent {
  type:
    | 'verlauf'
    | 'step_start'
    | 'step_end'
    | 'tool_start'
    | 'tool_result'
    | 'text'
    | 'done'
    | 'error'
    | 'aenderungen'
    | 'ende';
  /** Bei step_start/step_end: die Schritt-Zeile (ohne Rohdaten). */
  step?: FlowRunStep;
  run?: {
    status: FlowRunStatus;
    steps?: FlowRunStep[];
    result?: string | null;
    error?: string | null;
    flow_name?: string;
    arguments?: Record<string, string> | null;
    changes?: FlowRunChange[] | null;
  };
  tool?: string;
  params?: unknown;
  result?: string;
  content?: string;
  message?: string;
  status?: FlowRunStatus;
  changes?: FlowRunChange[];
}

const LEER: FlowRunState = {
  runId: null,
  flowName: null,
  args: {},
  status: null,
  steps: [],
  result: null,
  error: null,
  changes: [],
  verbunden: false,
};

export function useFlowRun() {
  const api = useApi();
  const [state, setState] = useState<FlowRunState>(LEER);
  // Der laufende Lese-Vorgang; zum Abbrechen der Verbindung (nicht des Laufs).
  const abortRef = useRef<AbortController | null>(null);
  // Nach dem Unmount nichts mehr setzen.
  const lebtRef = useRef(true);
  useEffect(() => {
    lebtRef.current = true;
    return () => {
      lebtRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const setSicher = useCallback((f: (s: FlowRunState) => FlowRunState) => {
    if (lebtRef.current) {
      setState(f);
    }
  }, []);

  /** Ein einzelnes Stream-Ereignis auf den Zustand anwenden. */
  const anwenden = useCallback(
    (evt: StreamEvent) => {
      setSicher(s => {
        switch (evt.type) {
          case 'verlauf': {
            // Der gespeicherte Verlauf ersetzt den bisherigen Stand — das ist der
            // Wiederverbinden-Fall: die DB ist die Wahrheit.
            const run = evt.run;
            return {
              ...s,
              flowName: run?.flow_name ?? s.flowName,
              args: run?.arguments ?? s.args,
              status: run?.status ?? s.status,
              steps: run?.steps ?? [],
              result: run?.result ?? s.result,
              error: run?.error ?? s.error,
              changes: run?.changes ?? s.changes,
            };
          }
          case 'step_start': {
            // Neuer Schritt (mit ID + Baum-Feldern) — anhängen, falls unbekannt.
            // IDs sind BIGSERIAL und kommen mal als Zahl, mal als String an.
            const step = evt.step;
            if (!step) return s;
            if (step.id != null && s.steps.some(x => String(x.id) === String(step.id))) return s;
            return { ...s, steps: [...s.steps, step] };
          }
          case 'step_end': {
            // Abgeschlossenen Schritt per ID ersetzen (robuster als Namens-Match).
            const step = evt.step;
            if (!step || step.id == null) return s;
            const idx = s.steps.findIndex(x => String(x.id) === String(step.id));
            if (idx < 0) return { ...s, steps: [...s.steps, step] };
            const steps = [...s.steps];
            steps[idx] = step;
            return { ...s, steps };
          }
          case 'tool_start':
            return {
              ...s,
              steps: [
                ...s.steps,
                { kind: 'werkzeug', name: evt.tool || '', input: evt.params, status: 'laeuft' },
              ],
            };
          case 'tool_result': {
            // Den letzten offenen Schritt gleichen Namens abschließen.
            const steps = [...s.steps];
            for (let i = steps.length - 1; i >= 0; i--) {
              const schritt = steps[i];
              if (schritt && schritt.name === evt.tool && schritt.status === 'laeuft') {
                steps[i] = { ...schritt, output: evt.result ?? '', status: 'fertig' };
                break;
              }
            }
            return { ...s, steps };
          }
          case 'text':
            return { ...s, result: evt.content ?? s.result };
          case 'done':
            return { ...s, result: evt.result ?? s.result };
          case 'error':
            return { ...s, error: evt.message ?? s.error };
          case 'aenderungen':
            return { ...s, changes: evt.changes ?? s.changes };
          case 'ende':
            return { ...s, status: evt.status ?? s.status, verbunden: false };
          default:
            return s;
        }
      });
    },
    [setSicher]
  );

  /**
   * Öffnet den Ereignis-Strom eines Laufs und liest ihn bis zum Ende.
   *
   * Reißt die Verbindung ab, BEVOR der Lauf terminal ist (Netz-Wackler,
   * Proxy-Timeout, Backend-Schluckauf), verbindet sich der Hook selbst neu —
   * sonst zeigte die Karte dauerhaft ein eingefrorenes „läuft", obwohl der
   * Lauf serverseitig weiterarbeitet. Terminal erkannt = kein Reconnect.
   */
  const verbinden = useCallback(
    async (runId: number) => {
      // Eine eventuell offene Verbindung zuerst schließen.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSicher(s => ({ ...s, runId, verbunden: true }));

      const RECONNECT_DELAY_MS = 3000;
      const MAX_VERSUCHE = 20;
      // Hat der Strom einen terminalen Stand gemeldet? (ende, done/error oder
      // ein Verlauf mit nicht-laufendem Status)
      let terminal = false;

      for (let versuch = 0; versuch < MAX_VERSUCHE; versuch++) {
        if (versuch > 0) {
          await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS));
          if (controller.signal.aborted || !lebtRef.current) break;
          setSicher(s => ({ ...s, verbunden: true }));
        }
        try {
          const resp = await fetch(`${API_BASE}/flows/laeufe/${runId}/stream`, {
            headers: getAuthHeaders(),
            signal: controller.signal,
          });
          if (!resp.ok || !resp.body) {
            throw new Error(`Stream-Fehler ${resp.status}`);
          }
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let puffer = '';
          // SSE-Frames sind durch eine Leerzeile getrennt; Zeilen beginnen mit "data:".
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            puffer += decoder.decode(value, { stream: true });
            const teile = puffer.split('\n\n');
            puffer = teile.pop() || '';
            for (const block of teile) {
              for (const zeile of block.split('\n')) {
                const t = zeile.trim();
                if (!t.startsWith('data:')) {
                  continue;
                }
                try {
                  const evt = JSON.parse(t.replace(/^data:\s*/, '')) as StreamEvent;
                  if (
                    evt.type === 'ende' ||
                    evt.type === 'done' ||
                    evt.type === 'error' ||
                    (evt.type === 'verlauf' && evt.run?.status && evt.run.status !== 'laeuft')
                  ) {
                    terminal = true;
                  }
                  anwenden(evt);
                } catch {
                  // Kaputtes Frame überspringen, statt den Strom abzureißen.
                }
              }
            }
          }
        } catch (err) {
          // Ein abgebrochener fetch (Unmount/Neu-Verbinden) beendet den Vorgang.
          if (err instanceof DOMException && err.name === 'AbortError') {
            break;
          }
          // Verbindungsfehler: nicht als Lauf-Fehler anzeigen, sondern neu
          // versuchen — erst der letzte gescheiterte Versuch wird gemeldet.
          if (versuch === MAX_VERSUCHE - 1) {
            setSicher(s => ({ ...s, error: (err as Error).message }));
          }
        }
        if (terminal || controller.signal.aborted || !lebtRef.current) break;
      }
      setSicher(s => ({ ...s, verbunden: false }));
    },
    [anwenden, setSicher]
  );

  /**
   * Startet einen Lauf und verbindet sich sofort mit seinem Strom.
   *
   * Der POST läuft über `useApi` (Auth, CSRF, 401-Weiterleitung, Fehler-Hülle) —
   * NUR der Ereignis-Strom unten braucht rohes `fetch`, weil `useApi` keinen
   * Datenstrom liest.
   */
  const start = useCallback(
    async (flow: string, args: Record<string, string> = {}, conversationId?: number) => {
      // Kopfzeile sofort füllen — der Verlauf bestätigt beides gleich darauf.
      setSicher(() => ({ ...LEER, status: 'laeuft', flowName: flow, args }));
      try {
        const antwort = await api.post<{ data: { runId: number } }>('/flows/laeufe', {
          flow,
          args,
          conversation_id: conversationId ?? null,
        });
        const runId = antwort.data.runId;
        void verbinden(runId);
        return runId;
      } catch (err) {
        setSicher(s => ({ ...s, status: 'fehler', error: (err as Error).message }));
        throw err;
      }
    },
    [api, verbinden, setSicher]
  );

  /** Bricht den LAUF ab (nicht nur die Verbindung). */
  const abbrechen = useCallback(async () => {
    const runId = state.runId;
    if (!runId) {
      return;
    }
    try {
      await api.post(`/flows/laeufe/${runId}/abbrechen`);
    } catch (err) {
      // Scheitert der Abbruch, läuft der Lauf weiter — das muss der Nutzer sehen.
      setSicher(s => ({ ...s, error: `Abbruch fehlgeschlagen: ${(err as Error).message}` }));
    }
  }, [api, state.runId, setSicher]);

  const zuruecksetzen = useCallback(() => {
    abortRef.current?.abort();
    setSicher(() => LEER);
  }, [setSicher]);

  return { ...state, start, verbinden, abbrechen, zuruecksetzen };
}
