/**
 * Regressionstest für Plan 016 — „2. Nachricht überschreibt 1.".
 *
 * Prüft die reine Reihenfolge-Logik (ohne den OOM-anfälligen ChatProvider):
 * Nachrichten werden an den LIVE-Zustand angehängt, nie aus einer veralteten
 * Momentaufnahme ersetzt, und der Assistenten-Index zeigt korrekt auf die
 * neue Antwort.
 */

import { describe, it, expect } from 'vitest';
import { appendOutgoingMessages } from '../../contexts/chatMessageOrder';
import type { ChatMessage } from '../../contexts/ChatContext';

const user = (content: string): ChatMessage => ({ role: 'user', content });
const assistant = (content: string): ChatMessage => ({ role: 'assistant', content });
const emptyAssistant = (): ChatMessage => ({ role: 'assistant', content: '', status: 'streaming' });

describe('appendOutgoingMessages', () => {
  it('hängt an einen leeren Verlauf an (erste Nachricht)', () => {
    const { messages, assistantIndex } = appendOutgoingMessages(
      [],
      [],
      user('hallo'),
      emptyAssistant()
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe('hallo');
    expect(messages[1]?.role).toBe('assistant');
    expect(assistantIndex).toBe(1);
  });

  it('überschreibt die erste Nachricht NICHT bei der zweiten (Kern-Regression)', () => {
    // Live-Zustand nach der 1. Runde: [u1, a1]
    const prev: ChatMessage[] = [user('erste'), assistant('antwort 1')];
    const { messages, assistantIndex } = appendOutgoingMessages(
      prev,
      prev,
      user('zweite'),
      emptyAssistant()
    );
    expect(messages).toHaveLength(4);
    expect(messages.map(m => m.content)).toEqual(['erste', 'antwort 1', 'zweite', '']);
    // Der Assistenten-Index zeigt auf die NEUE (leere) Antwort, nicht auf a1.
    expect(assistantIndex).toBe(3);
    expect(messages[assistantIndex]?.role).toBe('assistant');
    expect(messages[assistantIndex]?.content).toBe('');
  });

  it('kürzt nie: veraltete/leere Momentaufnahme darf den Live-Verlauf nicht ersetzen', () => {
    // prev (Live) ist länger als der vom Aufrufer übergebene Snapshot.
    const prev: ChatMessage[] = [user('a'), assistant('A'), user('b'), assistant('B')];
    const staleSnapshot: ChatMessage[] = []; // z. B. veralteter Ref-Wert
    const { messages, assistantIndex } = appendOutgoingMessages(
      prev,
      staleSnapshot,
      user('c'),
      emptyAssistant()
    );
    // Der komplette Live-Verlauf bleibt erhalten.
    expect(messages.slice(0, 4)).toEqual(prev);
    expect(messages[4]?.content).toBe('c');
    expect(assistantIndex).toBe(5);
  });

  it('nutzt die Momentaufnahme als Untergrenze, wenn prev kürzer ist (Wiedereinhängen)', () => {
    // prev leer (Fläche gerade neu gemountet), Snapshot kennt den Verlauf noch.
    const snapshot: ChatMessage[] = [user('x'), assistant('X')];
    const { messages, assistantIndex } = appendOutgoingMessages(
      [],
      snapshot,
      user('y'),
      emptyAssistant()
    );
    expect(messages.map(m => m.content)).toEqual(['x', 'X', 'y', '']);
    expect(assistantIndex).toBe(3);
  });
});
