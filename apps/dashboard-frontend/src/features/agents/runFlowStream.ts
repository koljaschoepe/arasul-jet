/**
 * SSE-Streaming eines Fluss-Laufs (Plan 010, Schritt 5).
 *
 * Wie runAgentStream (Ausnahme von useApi, da text/event-stream): rohes fetch +
 * ReadableStream-Reader, getAuthHeaders() liefert Authorization + CSRF für den
 * zustandsändernden POST. Frames tragen die Knoten-ID (`node`).
 */

import { API_BASE, getAuthHeaders } from '@/config/api';
import type { FlowRunEvent } from './types';

export interface FlowRunHandle {
  cancel: () => void;
}

export function runFlowStream(
  flowId: number,
  input: string,
  onEvent: (evt: FlowRunEvent) => void
): { handle: FlowRunHandle; done: Promise<void> } {
  const controller = new AbortController();

  const done = (async () => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/agents/flows/${flowId}/run/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });
    } catch {
      if (!controller.signal.aborted) {
        onEvent({ type: 'flow_error', message: 'Verbindung zum Fluss-Lauf fehlgeschlagen.' });
      }
      return;
    }

    if (!res.ok || !res.body) {
      // Validierungs-/Auth-Fehler (400/401/404) kommen als JSON, nicht als SSE.
      let message = `Fluss-Lauf fehlgeschlagen (HTTP ${res.status}).`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) message = body.error.message;
      } catch {
        /* kein JSON */
      }
      onEvent({ type: 'flow_error', message });
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
              onEvent(JSON.parse(payload) as FlowRunEvent);
            } catch {
              /* unvollständiges Frame ignorieren */
            }
          }
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        onEvent({ type: 'flow_error', message: 'Der Fluss-Lauf wurde unterbrochen.' });
      }
    } finally {
      // Reader defensiv freigeben (der abort teardown erledigt es i. d. R. schon).
      try {
        reader.releaseLock();
      } catch {
        /* bereits freigegeben */
      }
    }
  })();

  return { handle: { cancel: () => controller.abort() }, done };
}
