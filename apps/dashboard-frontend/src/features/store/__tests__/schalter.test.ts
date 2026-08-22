/**
 * Plan 023 H5: der Schalter bedeutet ueberall dasselbe.
 *
 * Zwei Sorten teilen sich die Flaeche, Kern-Apps und selbst gebaute oder
 * importierte Pakete. Neben demselben Schalter an derselben Stelle stand
 * vorher zweierlei:
 *
 *   Kern-App   "Im Workspace sichtbar"   Zustand des Schalters
 *   Paket      "Selbst gebaut"           Herkunft des Pakets
 *
 * Die Herkunft ist ein Merkmal und gehoert zu den Merkmalen oben.
 */
import { describe, it, expect } from 'vitest';
import { schalterText, betroffeneTabs, schliessFrage } from '../schalter';
import type { WorkspaceTab } from '@/stores/workspaceStore';

function tab(t: Partial<WorkspaceTab>): WorkspaceTab {
  return { id: 'x', type: 'chat', title: 'X', ...t } as WorkspaceTab;
}

describe('schalterText', () => {
  it('sagt in beiden Zustaenden dasselbe ueber denselben Schalter', () => {
    expect(schalterText(true)).toBe('Im Workspace sichtbar');
    expect(schalterText(false)).toBe('Im Workspace ausgeblendet');
  });
});

describe('betroffeneTabs', () => {
  const tabs = [
    tab({ id: 'a', type: 'automationen' }),
    tab({ id: 'b', type: 'chat' }),
    tab({ id: 'c', type: 'extension', extensionId: 'e1' }),
    tab({ id: 'd', type: 'extension', extensionId: 'e2' }),
  ];

  it('findet die Tabs einer Kern-App ueber ihren Tab-Typ', () => {
    expect(betroffeneTabs(tabs, { tabTyp: 'automationen' }).map(t => t.id)).toEqual(['a']);
  });

  it('findet die Tabs eines Pakets ueber seine Kennung', () => {
    expect(betroffeneTabs(tabs, { extensionId: 'e1' }).map(t => t.id)).toEqual(['c']);
  });

  it('verwechselt zwei Pakete nicht', () => {
    expect(betroffeneTabs(tabs, { extensionId: 'e2' }).map(t => t.id)).toEqual(['d']);
  });

  it('findet nichts, wenn nichts offen ist', () => {
    expect(betroffeneTabs([], { extensionId: 'e1' })).toEqual([]);
    expect(betroffeneTabs(tabs, {})).toEqual([]);
  });
});

describe('schliessFrage', () => {
  it('nennt die Zahl, statt den Nutzer selbst nachsehen zu lassen', () => {
    expect(schliessFrage('n8n', 1)).toContain('ein offener Tab');
    expect(schliessFrage('n8n', 4)).toContain('4 offene Tabs');
  });

  it('nennt den Namen der Erweiterung', () => {
    expect(schliessFrage('Mein Paket', 2)).toContain('Mein Paket');
  });
});
