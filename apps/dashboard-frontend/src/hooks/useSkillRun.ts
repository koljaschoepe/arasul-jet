/**
 * useSkillRun — startet einen Skill-Lauf und überträgt ihn live (Plan 011, Schritt 12).
 *
 * Der Lauf läuft SERVERSEITIG weiter, unabhängig von diesem Hook. Der Hook ist
 * nur das Fenster darauf:
 *
 *  - `start(skill, args)` stößt den Lauf an und bekommt sofort eine Lauf-ID.
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
export interface SkillRunStep {
  id?: number;
  position?: number;
  kind: 'werkzeug' | 'subagent' | 'modell' | 'hinweis';
  name: string;
  input?: unknown;
  output?: string | null;
  status: SkillRunStatus;
}

export type SkillRunStatus = 'laeuft' | 'fertig' | 'fehler' | 'abgebrochen';

export interface SkillRunState {
  runId: number | null;
  status: SkillRunStatus | null;
  /** Die bisher gesehenen Schritte, in Reihenfolge. */
  steps: SkillRunStep[];
  /** Das Endergebnis (die Antwort des Skills), sobald vorhanden. */
  result: string | null;
  error: string | null;
  /** Läuft gerade eine Live-Verbindung? */
  verbunden: boolean;
}

interface StreamEvent {
  type: 'verlauf' | 'tool_start' | 'tool_result' | 'text' | 'done' | 'error' | 'ende';
  run?: {
    status: SkillRunStatus;
    steps?: SkillRunStep[];
    result?: string | null;
    error?: string | null;
  };
  tool?: string;
  params?: unknown;
  result?: string;
  content?: string;
  message?: string;
  status?: SkillRunStatus;
}

const LEER: SkillRunState = {
  runId: null,
  status: null,
  steps: [],
  result: null,
  error: null,
  verbunden: false,
};

export function useSkillRun() {
  const api = useApi();
  const [state, setState] = useState<SkillRunState>(LEER);
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

  const setSicher = useCallback((f: (s: SkillRunState) => SkillRunState) => {
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
              status: run?.status ?? s.status,
              steps: run?.steps ?? [],
              result: run?.result ?? s.result,
              error: run?.error ?? s.error,
            };
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
          case 'ende':
            return { ...s, status: evt.status ?? s.status, verbunden: false };
          default:
            return s;
        }
      });
    },
    [setSicher]
  );

  /** Öffnet den Ereignis-Strom eines Laufs und liest ihn bis zum Ende. */
  const verbinden = useCallback(
    async (runId: number) => {
      // Eine eventuell offene Verbindung zuerst schließen.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSicher(s => ({ ...s, runId, verbunden: true }));

      try {
        const resp = await fetch(`${API_BASE}/skills/laeufe/${runId}/stream`, {
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
                anwenden(JSON.parse(t.replace(/^data:\s*/, '')) as StreamEvent);
              } catch {
                // Kaputtes Frame überspringen, statt den Strom abzureißen.
              }
            }
          }
        }
      } catch (err) {
        // Ein abgebrochener fetch (Unmount/Neu-Verbinden) ist kein Fehler.
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setSicher(s => ({ ...s, error: (err as Error).message }));
        }
      } finally {
        setSicher(s => ({ ...s, verbunden: false }));
      }
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
    async (skill: string, args: Record<string, string> = {}, conversationId?: number) => {
      setSicher(() => ({ ...LEER, status: 'laeuft' }));
      try {
        const antwort = await api.post<{ data: { runId: number } }>('/skills/laeufe', {
          skill,
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
      await api.post(`/skills/laeufe/${runId}/abbrechen`);
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
