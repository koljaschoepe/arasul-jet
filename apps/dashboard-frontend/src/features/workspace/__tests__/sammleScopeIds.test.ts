import { describe, it, expect } from 'vitest';
import { sammleScopeIds } from '../explorer/ExplorerPanel';
import type { AblageEintrag } from '../explorer/ExplorerPanel';

/** Ordner-Eintrag mit optionalem Wissensraum-Spiegel. */
function ordner(pfad: string, spaceId?: string): AblageEintrag {
  return {
    pfad,
    name: pfad.split('/').pop() ?? pfad,
    typ: 'ordner',
    groesse: null,
    geaendert: null,
    ...(spaceId ? { space_id: spaceId } : {}),
  };
}

function datei(pfad: string): AblageEintrag {
  return {
    pfad,
    name: pfad.split('/').pop() ?? pfad,
    typ: 'datei',
    groesse: 1,
    geaendert: null,
  };
}

describe('sammleScopeIds (Chat-Scope eines Ordners, Pfad-basiert)', () => {
  const baum: AblageEintrag[] = [
    ordner('docs', 'ks-1'),
    ordner('docs/sub', 'ks-2'),
    ordner('docs/sub/tief', 'ks-3'),
    // Unterordner ohne Spiegel wird übersprungen
    ordner('docs/frisch'),
    // Ähnlich benannter Nachbar ist KEIN Nachfahre (Präfix-Falle)
    ordner('docs-alt', 'ks-9'),
    datei('docs/notiz.md'),
  ];

  it('liefert die space_id des Ordners samt aller gesyncten Unterordner', () => {
    expect(sammleScopeIds(baum, ordner('docs', 'ks-1'))).toEqual(['ks-1', 'ks-2', 'ks-3']);
  });

  it('zählt ähnlich benannte Nachbarordner nicht als Nachfahren', () => {
    expect(sammleScopeIds(baum, ordner('docs', 'ks-1'))).not.toContain('ks-9');
  });

  it('Ordner ohne eigenen Spiegel liefert nur die gesyncten Unterordner', () => {
    expect(sammleScopeIds(baum, ordner('docs'))).toEqual(['ks-2', 'ks-3']);
  });

  it('Blatt-Ordner liefert genau seine eigene space_id', () => {
    expect(sammleScopeIds(baum, ordner('docs/sub/tief', 'ks-3'))).toEqual(['ks-3']);
  });
});
