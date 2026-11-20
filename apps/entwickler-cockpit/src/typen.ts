/** Die Formen, die das Cockpit von der Plattform-API bekommt (J44, M7). */

export const STAENDE = ['neu', 'angenommen', 'umgesetzt', 'abgelehnt'] as const;
export type StandMeldung = (typeof STAENDE)[number];

/** Eine Zeile aus `GET /api/rueckmeldungen`. */
export interface Meldung {
  id: number;
  app_id: string;
  app_name: string | null;
  /** In welchem Stand der App gemeldet wurde. */
  stand: 'test' | 'live';
  seite: string;
  text: string;
  hat_bild: boolean;
  markierung: { x: number; y: number; breite: number; hoehe: number } | null;
  person: { id: number; anzeigeName: string } | null;
  stand_meldung: StandMeldung;
  grund: string | null;
  stand_geaendert_am: string | null;
  erstellt_am: string;
}

export interface Fassung {
  version: string;
  eingespielt_am: string | null;
  aenderungstext: string | null;
  vorige_version?: string | null;
}

/** Eine Zeile aus `GET /api/entwickler/apps`. */
export interface AppStand {
  id: string;
  name: string;
  symbol: string | null;
  mitgeliefert: boolean;
  live: Fassung | null;
  test: Fassung | null;
  zuletzt_geaendert: string | null;
  test_neuer: boolean;
  meldungen: { offen: number; neu: number; umgesetzt: number };
  letzte_schaltung: {
    ergebnis: 'laeuft' | 'live' | 'zurueckgeschaltet' | 'nicht_gesichert' | 'fehlgeschlagen';
    satz: string | null;
    nach_version: string;
    am: string;
  } | null;
}

/** Die Ansichten des Cockpits; sie stehen im Fragment der Adresse. */
export type Ansicht = 'eingang' | 'apps' | 'live';
