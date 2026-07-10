import { describe, it, expect } from 'vitest';
import { collectSubtreeIds } from '../explorer/ExplorerPanel';
import type { TreeSpace } from '../explorer/ExplorerPanel';

function space(id: string, parent_id: string | null): TreeSpace {
  return {
    id,
    name: id,
    slug: id,
    icon: null,
    color: null,
    parent_id,
    is_default: false,
    is_system: false,
    sort_order: 0,
  };
}

describe('collectSubtreeIds', () => {
  const tree = [
    space('root', null),
    space('a', 'root'),
    space('b', 'root'),
    space('a1', 'a'),
    space('a2', 'a'),
    space('a1x', 'a1'),
    space('other', null),
  ];

  it('liefert den kompletten Teilbaum inklusive Wurzel (Wurzel zuerst)', () => {
    const ids = collectSubtreeIds(tree, 'a');
    expect(ids[0]).toBe('a');
    expect(new Set(ids)).toEqual(new Set(['a', 'a1', 'a2', 'a1x']));
  });

  it('Blatt-Ordner → nur er selbst', () => {
    expect(collectSubtreeIds(tree, 'b')).toEqual(['b']);
  });

  it('fremde Wurzeln bleiben außen vor', () => {
    expect(collectSubtreeIds(tree, 'root')).not.toContain('other');
  });
});
