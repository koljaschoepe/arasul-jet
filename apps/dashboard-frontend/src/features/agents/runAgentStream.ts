/**
 * SSE-Streaming eines Agent-Laufs (Plan 010, Schritt 2).
 *
 * Ausnahme von der „alles über useApi"-Regel: useApi JSON-parst die Antwort und
 * kann keinen `text/event-stream` lesen. Wie der bestehende Chat (ChatContext)
 * nutzt der Lauf daher rohes fetch + ReadableStream-Reader. getAuthHeaders()
 * liefert Authorization UND X-CSRF-Token (der POST ist zustandsändernd).
 */

import { API_BASE, getAuthHeaders } from '@/config/api';
import type { RunEvent } from './types';

export interface RunHandle {
  /** Lauf abbrechen (schließt den Stream). */
  cancel: () => void;
}

/**
 * Startet einen Agent-Lauf und ruft onEvent für jedes SSE-Frame.
 * @returns RunHandle zum Abbrechen. Die Promise resolved, wenn der Stream endet.
 */
export function runAgentStream(
  agentId: number,
  input: string,
  onEvent: (evt: RunEvent) => void
): { handle: RunHandle; done: Promise<void> } {
  const controller = new AbortController();

  const done = (async () => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/agents/${agentId}/run/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!controller.signal.aborted) {
        onEvent({ type: 'error', message: 'Verbindung zum Agent-Lauf fehlgeschlagen.' });
      }
      return;
    }

    if (!res.ok || !res.body) {
      // Fehler VOR dem Stream (401/404/400) kommen als JSON, nicht als SSE.
      let message = `Lauf fehlgeschlagen (HTTP ${res.status}).`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) message = body.error.message;
      } catch {
        /* kein JSON — Standardmeldung */
      }
      onEvent({ type: 'error', message });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE-Frames sind durch \n\n getrennt; jede Datenzeile beginnt mit "data:".
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of frame.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;
            try {
              onEvent(JSON.parse(payload) as RunEvent);
            } catch {
              /* unvollständiges/kein JSON-Frame ignorieren */
            }
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        onEvent({ type: 'error', message: 'Der Agent-Lauf wurde unterbrochen.' });
      }
    }
  })();

  return { handle: { cancel: () => controller.abort() }, done };
}
