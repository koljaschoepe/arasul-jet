/**
 * Ein Stand in Worten (Auftrag sicherung-zurueckholen, M5): nach Zeitpunkt,
 * nie nach Kennung, und so, wie man es am Telefon sagt.
 */
import { describe, it, expect } from 'vitest';
import { standInWorten, standNamen, standZusatz } from '../sicherung/standInWorten';

const JETZT = new Date(2026, 9, 4, 23, 50); // Sonntag, 4. Oktober 2026, 23:50 Ortszeit

describe('standInWorten', () => {
  it.each([
    [new Date(2026, 9, 4, 23, 12), 'Heute, 23:12 Uhr'],
    [new Date(2026, 9, 3, 2, 0), 'Gestern, 2:00 Uhr'],
    [new Date(2026, 9, 2, 2, 0), 'Freitag, 2. Oktober, 2:00 Uhr'],
    [new Date(2025, 11, 31, 2, 5), 'Mittwoch, 31. Dezember 2025, 2:05 Uhr'],
  ])('%s -> %s', (zeit, erwartet) => {
    expect(standInWorten(zeit.toISOString(), JETZT)).toBe(erwartet);
  });

  it('sagt es, wenn der Zeitpunkt kaputt ist', () => {
    expect(standInWorten('kein Datum', JETZT)).toBe('unbekannter Zeitpunkt');
  });
});

describe('standZusatz', () => {
  const namen = { apps: new Map([['belege', 'Belege']]), bereiche: new Map<string, string>() };
  it('nur fuer einen Stand vor dem Zurueckholen, mit dem Namen', () => {
    expect(standZusatz({ vorher: false, fuer: null }, namen)).toBeNull();
    expect(standZusatz({ vorher: true, fuer: { art: 'app', id: 'belege' } }, namen)).toBe(
      'vor dem Zurückholen der App „Belege“'
    );
    expect(standZusatz({ vorher: true, fuer: { art: 'bereich', id: 'projekte' } }, namen)).toBe(
      'vor dem Zurückholen des Bereichs „projekte“'
    );
    expect(standZusatz({ vorher: true, fuer: { art: 'geraet', id: null } }, namen)).toBe(
      'vor dem Zurückholen des ganzen Geräts'
    );
  });
});

describe('standNamen', () => {
  it('nimmt die Sekunden nur dazu, wenn zwei Staende in derselben Minute liegen', () => {
    const namen = standNamen(
      [
        { id: 'a', zeitpunkt: new Date(2026, 9, 4, 0, 36, 5).toISOString() },
        { id: 'b', zeitpunkt: new Date(2026, 9, 4, 0, 36, 41).toISOString() },
        { id: 'c', zeitpunkt: new Date(2026, 9, 3, 2, 0, 9).toISOString() },
      ],
      JETZT
    );
    expect(namen.get('a')).toBe('Heute, 0:36:05 Uhr');
    expect(namen.get('b')).toBe('Heute, 0:36:41 Uhr');
    expect(namen.get('c')).toBe('Gestern, 2:00 Uhr');
  });
});
