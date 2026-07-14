/**
 * Tests: Session-Modell für Mehrfach-Sitzungen pro Projekt.
 *
 * Erste Session eines Projekts ist rückwärtskompatibel (id === projectId,
 * tmux 'main'); weitere Sessions bekommen distinkte, stabile tmux-Namen, damit
 * sie unabhängige Shells sind (nicht Spiegel eines Screens).
 */

import { describe, it, expect } from 'vitest';
import type { TerminalSession } from '@/stores/workspaceStore';
import { nextTerminalSession, terminalNameForIndex, sessionsForProject } from '../sessionModel';

describe('terminalNameForIndex', () => {
  it('erste Session → main, weitere → main-N', () => {
    expect(terminalNameForIndex(1)).toBe('main');
    expect(terminalNameForIndex(2)).toBe('main-2');
    expect(terminalNameForIndex(3)).toBe('main-3');
  });
});

describe('nextTerminalSession', () => {
  it('erste Session eines Projekts ist rückwärtskompatibel (id === projectId, tmux main)', () => {
    const s = nextTerminalSession('p1', 'Projekt Eins', []);
    expect(s).toEqual({ id: 'p1', projectId: 'p1', title: 'Projekt Eins', terminalName: 'main' });
  });

  it('zweite Session desselben Projekts bekommt distinkte Id und tmux-Namen', () => {
    const existing: TerminalSession[] = [
      { id: 'p1', projectId: 'p1', title: 'Projekt Eins', terminalName: 'main' },
    ];
    const s = nextTerminalSession('p1', 'Projekt Eins', existing);
    expect(s.projectId).toBe('p1');
    expect(s.terminalName).toBe('main-2');
    expect(s.id).toBe('p1#2');
    // Distinkt von der ersten Session
    expect(s.id).not.toBe('p1');
  });

  it('dritte Session bekommt main-3', () => {
    const existing: TerminalSession[] = [
      { id: 'p1', projectId: 'p1', title: 'x', terminalName: 'main' },
      { id: 'p1#2', projectId: 'p1', title: 'x', terminalName: 'main-2' },
    ];
    const s = nextTerminalSession('p1', 'x', existing);
    expect(s.terminalName).toBe('main-3');
    expect(s.id).toBe('p1#3');
  });

  it('füllt eine freigewordene tmux-Lücke wieder auf (Kollisionsfreiheit)', () => {
    // 'main' wurde geschlossen, nur main-2 offen → neue Session nutzt wieder 'main'
    const existing: TerminalSession[] = [
      { id: 'p1#2', projectId: 'p1', title: 'x', terminalName: 'main-2' },
    ];
    const s = nextTerminalSession('p1', 'x', existing);
    expect(s.terminalName).toBe('main');
    expect(s.id).toBe('p1');
  });

  it('behandelt Alt-Sessions ohne terminalName als main', () => {
    const legacy: TerminalSession[] = [{ id: 'p1', projectId: 'p1', title: 'x' }];
    const s = nextTerminalSession('p1', 'x', legacy);
    expect(s.terminalName).toBe('main-2');
    expect(s.id).toBe('p1#2');
  });

  it('trennt Sessions verschiedener Projekte', () => {
    const existing: TerminalSession[] = [
      { id: 'p1', projectId: 'p1', title: 'a', terminalName: 'main' },
    ];
    const s = nextTerminalSession('p2', 'b', existing);
    expect(s).toEqual({ id: 'p2', projectId: 'p2', title: 'b', terminalName: 'main' });
  });
});

describe('sessionsForProject', () => {
  it('filtert nach projectId', () => {
    const sessions: TerminalSession[] = [
      { id: 'p1', projectId: 'p1', title: 'a' },
      { id: 'p1#2', projectId: 'p1', title: 'a' },
      { id: 'p2', projectId: 'p2', title: 'b' },
    ];
    expect(sessionsForProject('p1', sessions).map(s => s.id)).toEqual(['p1', 'p1#2']);
    expect(sessionsForProject('p2', sessions).map(s => s.id)).toEqual(['p2']);
  });
});
