import { describe, expect, it } from 'vitest';
import {
  ansichtAusAdresse,
  appsAusMeldungen,
  filtere,
  grundFehlt,
  wartetAufLive,
  zurueckMoeglich,
} from '../logik';
import { app, meldung } from './beispiele';

describe('logik des Cockpits', () => {
  const liste = [
    meldung({ id: 1, stand_meldung: 'neu' }),
    meldung({ id: 2, stand_meldung: 'angenommen', app_id: 'abschluss', app_name: 'Abschluss' }),
    meldung({ id: 3, stand_meldung: 'umgesetzt' }),
    meldung({ id: 4, stand_meldung: 'abgelehnt', grund: 'gibt es' }),
  ];

  it('offen heißt neu und angenommen, je App filterbar', () => {
    expect(filtere(liste, { app: 'alle', stand: 'offen' }).map(m => m.id)).toEqual([1, 2]);
    expect(filtere(liste, { app: 'belege', stand: 'offen' }).map(m => m.id)).toEqual([1]);
    expect(filtere(liste, { app: 'belege', stand: 'abgelehnt' }).map(m => m.id)).toEqual([4]);
    expect(filtere(liste, { app: 'alle', stand: 'alle' })).toHaveLength(4);
  });

  it('die Apps des Filters kommen aus Apps und Meldungen, nach Namen', () => {
    const apps = appsAusMeldungen(liste, [app({ id: 'zeit', name: 'Zeiterfassung' })]);
    expect(apps.map(a => a.name)).toEqual(['Abschluss', 'Belege', 'Zeiterfassung']);
  });

  it('wer ablehnt, braucht einen Grund; sonst nicht', () => {
    expect(grundFehlt('abgelehnt', '  ')).toBe(true);
    expect(grundFehlt('abgelehnt', 'gibt es schon')).toBe(false);
    expect(grundFehlt('umgesetzt', '')).toBe(false);
  });

  it('auf Live wartet nur, was im Test neuer ist, und nie eine mitgelieferte App', () => {
    const apps = [
      app({
        id: 'a',
        test_neuer: true,
        test: { version: '2', eingespielt_am: '2026-11-18T00:00:00Z', aenderungstext: null },
      }),
      app({ id: 'b', test_neuer: false }),
      app({
        id: 'c',
        test_neuer: true,
        test: { version: '3', eingespielt_am: '2026-11-20T00:00:00Z', aenderungstext: null },
      }),
      app({ id: 'entwickler-cockpit', mitgeliefert: true, test_neuer: true }),
    ];
    expect(wartetAufLive(apps).map(a => a.id)).toEqual(['c', 'a']);
  });

  it('zurück geht nur nach einem Live-Schalten mit einer Fassung davor', () => {
    const geschaltet = app({
      test_neuer: false,
      live: {
        version: '1.1.0',
        eingespielt_am: null,
        aenderungstext: null,
        vorige_version: '1.0.0',
      },
      letzte_schaltung: {
        ergebnis: 'live',
        satz: null,
        nach_version: '1.1.0',
        am: '2026-11-20T11:00:00Z',
      },
    });
    const jetzt = new Date('2026-11-20T12:00:00Z').getTime();
    expect(zurueckMoeglich([geschaltet], jetzt)).toHaveLength(1);
    // Eine Schaltung von vor Wochen bekommt keinen Knopf mehr.
    expect(zurueckMoeglich([geschaltet], jetzt + 30 * 24 * 60 * 60 * 1000)).toHaveLength(0);
    expect(
      zurueckMoeglich(
        [{ ...geschaltet, live: { ...geschaltet.live!, vorige_version: null } }],
        jetzt
      )
    ).toHaveLength(0);
    expect(
      zurueckMoeglich([
        {
          ...geschaltet,
          letzte_schaltung: { ...geschaltet.letzte_schaltung!, ergebnis: 'zurueckgeschaltet' },
        },
      ])
    ).toHaveLength(0);
  });

  it('die Ansicht steht im Fragment, sonst der Eingang', () => {
    expect(ansichtAusAdresse('#apps')).toBe('apps');
    expect(ansichtAusAdresse('#live')).toBe('live');
    expect(ansichtAusAdresse('')).toBe('eingang');
    expect(ansichtAusAdresse('#quatsch')).toBe('eingang');
  });
});
