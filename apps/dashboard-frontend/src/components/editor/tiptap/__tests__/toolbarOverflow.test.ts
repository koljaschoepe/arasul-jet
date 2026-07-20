import { describe, it, expect } from 'vitest';
import { computeInlineCount } from '../toolbarOverflow';

describe('computeInlineCount — Editor-Leiste bleibt einzeilig', () => {
  const groups = [80, 140, 60, 120, 60, 50]; // 6 Gruppen

  it('alles passt → alle inline, kein ⋯', () => {
    // Summe = 510 + 5*6 gap = 540
    expect(computeInlineCount(1000, groups, 40)).toBe(groups.length);
  });

  it('exakt passend an der Grenze → alle inline', () => {
    const sum = groups.reduce((a, b) => a + b, 0) + 6 * (groups.length - 1); // 540
    expect(computeInlineCount(sum, groups, 40)).toBe(groups.length);
  });

  it('zu schmal → nur so viele Gruppen wie passen, Rest ins ⋯', () => {
    // 300px, ⋯ reserviert 40 → verfügbar 260: 80 +140(+6)=226 +60(+6)=292 > 260 → 2
    const c = computeInlineCount(300, groups, 40);
    expect(c).toBe(2);
    expect(c).toBeLessThan(groups.length);
  });

  it('sehr schmal → mindestens eine Gruppe bleibt inline (clippt statt umzubrechen)', () => {
    expect(computeInlineCount(30, groups, 40)).toBe(1);
  });

  it('noch nicht gemessen (Breite 0) → optimistisch alle inline', () => {
    expect(computeInlineCount(0, groups, 40)).toBe(groups.length);
  });

  it('keine Gruppen → 0', () => {
    expect(computeInlineCount(500, [], 40)).toBe(0);
  });
});
