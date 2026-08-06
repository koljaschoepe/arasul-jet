import type { ChatMessage } from './ChatContext';

/**
 * Reihenfolge-Logik für ausgehende Chat-Nachrichten (Plan 016).
 *
 * Historischer Bug: `sendMessage` ersetzte den gesamten Nachrichten-Zustand aus
 * einer vom Aufrufer übergebenen Momentaufnahme (`messages`). War diese veraltet
 * oder leer (schnelle Folge-Nachricht, Hintergrund→Vordergrund-Wechsel), wurde
 * der Verlauf abgeschnitten — sichtbar als „2. Nachricht überschreibt 1.".
 *
 * Fix: An den LIVE-Zustand (`prev`) anhängen statt ersetzen. Die Momentaufnahme
 * dient nur noch als Untergrenze für den seltenen Fall, dass `prev` (z. B. beim
 * Wiedereinhängen einer Hintergrund-Session) kürzer ist als der bekannte Stand.
 */
export interface OutgoingUpdate {
  /** Der neue Nachrichten-Zustand (Verlauf + Nutzer-Nachricht + leere Antwort). */
  messages: ChatMessage[];
  /** Index der (leeren) Assistenten-Nachricht — die Streaming-Zweige schreiben dorthin. */
  assistantIndex: number;
}

/**
 * Hängt Nutzer- und (leere) Assistenten-Nachricht an den Live-Zustand an, ohne
 * je zu kürzen. `assistantIndex` zeigt auf die tatsächliche Position der
 * Assistenten-Nachricht im zurückgegebenen Array.
 */
export function appendOutgoingMessages(
  prev: ChatMessage[],
  snapshot: ChatMessage[],
  userMessage: ChatMessage,
  assistantMessage: ChatMessage
): OutgoingUpdate {
  // Nie kürzen: der längere von beiden ist die Basis. Normalfall = `prev`.
  const base = prev.length >= snapshot.length ? prev : snapshot;
  return {
    messages: [...base, userMessage, assistantMessage],
    assistantIndex: base.length + 1, // hinter der gerade angehängten Nutzer-Nachricht
  };
}
