/**
 * Die Restzeit einer Freigabe, in Worten (Phase D2).
 *
 * Die Grenzen sind die interessanten Stellen: die Abnahme fährt mit einer
 * Frist von zwölf Sekunden, der Beispiel-Flow mit einer Stunde, die Vorgabe
 * des Geräts ist ein Tag (`FLOW_FREIGABE_FRIST_MINUTEN`). Alle drei müssen
 * einen Satz ergeben, den jemand vor dem Knopf lesen kann.
 */
import { describe, it, expect } from 'vitest';
import { restzeit, istKnapp } from '../frist';

const JETZT = Date.parse('2026-08-28T12:00:00.000Z');
const in_ = (ms: number) => new Date(JETZT + ms).toISOString();

describe('restzeit', () => {
  it('zählt unter einer Stunde in Minuten', () => {
    expect(restzeit(in_(47 * 60_000), JETZT)).toBe('noch 47 Minuten');
    expect(restzeit(in_(60_000), JETZT)).toBe('noch 1 Minute');
  });

  /** Die Frist der Abnahme ist zwölf Sekunden — „noch 0 Minuten" wäre falsch. */
  it('sagt bei Sekunden, dass es Sekunden sind', () => {
    expect(restzeit(in_(12_000), JETZT)).toBe('noch unter einer Minute');
  });

  it('zählt darüber in Stunden und Tagen', () => {
    expect(restzeit(in_(60 * 60_000), JETZT)).toBe('noch 1 Stunde');
    expect(restzeit(in_(5 * 60 * 60_000), JETZT)).toBe('noch 5 Stunden');
    expect(restzeit(in_(24 * 60 * 60_000), JETZT)).toBe('noch 1 Tag');
    expect(restzeit(in_(3 * 24 * 60 * 60_000), JETZT)).toBe('noch 3 Tage');
  });

  /**
   * Abgelaufen und trotzdem in der Liste: der Zeitgeber im Backend schreibt
   * den Status erst, wenn der Lauf ihn braucht. Zu schweigen hieße, jemanden
   * in ein 409 laufen zu lassen.
   */
  it('nennt eine abgelaufene Frist beim Namen', () => {
    expect(restzeit(in_(-1000), JETZT)).toBe('Frist abgelaufen');
  });

  it('erfindet nichts, wenn der Zeitpunkt keiner ist', () => {
    expect(restzeit('morgen vielleicht', JETZT)).toBe('ohne Frist');
  });
});

describe('istKnapp', () => {
  it('ist knapp innerhalb der letzten Stunde', () => {
    expect(istKnapp(in_(59 * 60_000), JETZT)).toBe(true);
    expect(istKnapp(in_(61 * 60_000), JETZT)).toBe(false);
  });
});
