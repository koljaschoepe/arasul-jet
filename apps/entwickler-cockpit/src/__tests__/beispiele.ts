import type { AppStand, Meldung } from '../typen';

export const meldung = (ueber: Partial<Meldung> = {}): Meldung => ({
  id: 7,
  app_id: 'belege',
  app_name: 'Belege',
  stand: 'live',
  seite: '/apps/belege/?ansicht=offen',
  text: 'Hier fehlt ein Filter nach Monat.',
  hat_bild: true,
  markierung: null,
  person: { id: 2, anzeigeName: 'Mia Muster' },
  stand_meldung: 'neu',
  grund: null,
  stand_geaendert_am: null,
  erstellt_am: '2026-11-20T10:00:00Z',
  ...ueber,
});

export const app = (ueber: Partial<AppStand> = {}): AppStand => ({
  id: 'belege',
  name: 'Belege',
  symbol: null,
  mitgeliefert: false,
  live: {
    version: '1.0.0',
    eingespielt_am: '2026-11-01T10:00:00Z',
    aenderungstext: null,
    vorige_version: null,
  },
  test: {
    version: '1.1.0',
    eingespielt_am: '2026-11-19T10:00:00Z',
    aenderungstext: 'Filter nach Monat.',
  },
  zuletzt_geaendert: '2026-11-19T10:00:00Z',
  test_neuer: true,
  meldungen: { offen: 2, neu: 1, umgesetzt: 1 },
  letzte_schaltung: null,
  ...ueber,
});
