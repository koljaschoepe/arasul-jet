/**
 * Die Liste der eigenen Apps und ihre flache Form (Phase D1).
 *
 * Eine App mit Live- UND Teststand ergibt ZWEI Einträge, keinen mit einem
 * Umschalter: der Stand entscheidet, welche Fassung jemand gerade bedient, und
 * ein Zustand, den man nur sieht, wenn man hinschaut, ist bei einer Fassung,
 * die noch nicht live ist, genau der falsche.
 */
import { describe, it, expect } from 'vitest';
import { zuEintraegen, type MeineApp } from '../meineApps';

const urlaub: MeineApp = {
  id: 'urlaub',
  name: 'Urlaubsantrag',
  beschreibung: 'Anträge stellen und freigeben',
  live: { version: '1.2.0', pfad: '/apps/urlaub/' },
  test: { version: '1.3.0-rc1', pfad: '/apps/urlaub/test/' },
};

describe('zuEintraegen', () => {
  it('macht aus einer App mit beiden Ständen zwei Einträge, Livestand zuerst', () => {
    const e = zuEintraegen([urlaub]);
    expect(e.map(x => x.stand)).toEqual(['live', 'test']);
    expect(e[0]?.version).toBe('1.2.0');
    expect(e[1]?.version).toBe('1.3.0-rc1');
    expect(e.every(x => x.name === 'Urlaubsantrag')).toBe(true);
  });

  it('eine App nur mit Livestand ergibt einen Eintrag', () => {
    expect(zuEintraegen([{ ...urlaub, test: null }])).toHaveLength(1);
  });

  it('ein Tester ohne Livestand sieht seinen Teststand', () => {
    const e = zuEintraegen([{ ...urlaub, live: null }]);
    expect(e).toHaveLength(1);
    expect(e[0]?.stand).toBe('test');
    expect(e[0]?.pfad).toBe('/apps/urlaub/test/');
  });

  it('eine App ohne jeden Stand kommt gar nicht vor', () => {
    expect(zuEintraegen([{ ...urlaub, live: null, test: null }])).toEqual([]);
  });
});
