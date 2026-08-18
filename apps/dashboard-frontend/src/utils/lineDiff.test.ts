import { describe, it, expect } from 'vitest';
import { lineDiff, diffZusammenfassung } from './lineDiff';

describe('lineDiff (Plan 022)', () => {
  it('erkennt eine geänderte Zeile als minus + plus', () => {
    const d = lineDiff('a\nb\nc', 'a\nB\nc');
    expect(d).toEqual([
      { art: 'gleich', text: 'a' },
      { art: 'minus', text: 'b' },
      { art: 'plus', text: 'B' },
      { art: 'gleich', text: 'c' },
    ]);
    expect(diffZusammenfassung(d)).toEqual({ plus: 1, minus: 1 });
  });

  it('erkennt eine hinzugefügte Zeile', () => {
    const d = lineDiff('a\nc', 'a\nb\nc');
    expect(diffZusammenfassung(d)).toEqual({ plus: 1, minus: 0 });
    expect(d.some(z => z.art === 'plus' && z.text === 'b')).toBe(true);
  });

  it('liefert keinen Diff für identischen Text', () => {
    expect(diffZusammenfassung(lineDiff('x\ny', 'x\ny'))).toEqual({ plus: 0, minus: 0 });
  });
});
