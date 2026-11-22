/**
 * Die Beispieldaten der Demo (J46, M7): eine erfundene Firma mit drei kleinen
 * Apps, wie ein Mittelständler sie baut. Keine echten Namen, keine echten
 * Kundendaten, kein Name aus den Apps eines Geräts. Personen tragen keine
 * Namen, nur ihre Rolle.
 *
 * Das ist der Zustand, mit dem jeder Besuch anfängt und zu dem „Zurücksetzen"
 * zurückkehrt. Was der Besucher danach tut, liegt in seinem Browser
 * (IndexedDB) und nirgends sonst.
 */

export type Sprache = 'de' | 'en';
export type Rolle = 'mitarbeiter' | 'entwickler';

export interface DemoFassung {
  version: string;
  eingespielt_am: string;
  aenderungstext: string | null;
}

export interface DemoApp {
  id: string;
  name: { de: string; en: string };
  beschreibung: { de: string; en: string };
  symbol: string;
  live: DemoFassung;
  test: DemoFassung | null;
  vorige_version: string | null;
}

export interface DemoMeldung {
  id: number;
  app_id: string;
  stand: 'test' | 'live';
  seite: string;
  text: string;
  /** Das Bildschirmfoto als Data-URL, nur im Browser des Besuchers. */
  bild: string | null;
  markierung: { x: number; y: number; breite: number; hoehe: number } | null;
  person: { id: number; anzeigeName: string } | null;
  stand_meldung: 'neu' | 'angenommen' | 'umgesetzt' | 'abgelehnt';
  grund: string | null;
  stand_geaendert_am: string | null;
  erstellt_am: string;
}

export interface DemoSchaltung {
  app_id: string;
  ergebnis: 'live' | 'zurueckgeschaltet';
  satz: string;
  nach_version: string;
  am: string;
}

export interface DemoZustand {
  fassung: 1;
  rolle: Rolle;
  theme: 'light' | 'dark' | 'system';
  reihenfolge: string[];
  apps: DemoApp[];
  meldungen: DemoMeldung[];
  schaltungen: DemoSchaltung[];
  naechsteId: number;
}

export const FIRMA = 'Beispielwerk GmbH';

/**
 * Die beiden Menschen der Demo; nur die Aufgabe, kein Name. Dieselbe Art
 * Konto (J52): die App-Betreuung hat dazu das Recht in der Werkstatt.
 */
export const PERSONEN = {
  mitarbeiter: {
    id: 7,
    username: 'beispiel-mitarbeiter',
    de: 'Beispiel-Mitarbeiter',
    en: 'Sample employee',
  },
  entwickler: {
    id: 3,
    username: 'beispiel-app-betreuung',
    de: 'Beispiel-App-Betreuung',
    en: 'Sample app support',
  },
} as const;

/** Die Zeit relativ zum Besuch: Beispieldaten altern nicht. */
function vor(stunden: number, jetzt: number): string {
  return new Date(jetzt - stunden * 3_600_000).toISOString();
}

export function anfangsZustand(jetzt = Date.now()): DemoZustand {
  return {
    fassung: 1,
    rolle: 'mitarbeiter',
    theme: 'light',
    reihenfolge: [],
    naechsteId: 105,
    apps: [
      {
        id: 'angebote',
        name: { de: 'Angebote', en: 'Quotes' },
        beschreibung: {
          de: 'Angebote anlegen, Stand verfolgen, Summe auf einen Blick.',
          en: 'Create quotes, track their status, see the total at a glance.',
        },
        symbol: 'file-text',
        live: {
          version: '1.4.0',
          eingespielt_am: vor(24 * 12, jetzt),
          aenderungstext: 'Angebote nach Kunde filtern.',
        },
        test: {
          version: '1.5.0',
          eingespielt_am: vor(3, jetzt),
          aenderungstext:
            'Rabatt je Angebot, darunter die Summe nach Rabatt (Rückmeldung #101 umgesetzt).',
        },
        vorige_version: '1.3.2',
      },
      {
        id: 'wartungsplan',
        name: { de: 'Wartungsplan', en: 'Maintenance plan' },
        beschreibung: {
          de: 'Welche Anlage wann gewartet wird und was fällig ist.',
          en: 'Which machine is serviced when, and what is due.',
        },
        symbol: 'wrench',
        live: {
          version: '2.1.0',
          eingespielt_am: vor(24 * 30, jetzt),
          aenderungstext: 'Fällige Wartungen stehen oben.',
        },
        test: null,
        vorige_version: '2.0.3',
      },
      {
        id: 'urlaub',
        name: { de: 'Urlaubsanträge', en: 'Leave requests' },
        beschreibung: {
          de: 'Urlaub beantragen und sehen, wer wann fehlt.',
          en: 'Request leave and see who is away when.',
        },
        symbol: 'calendar-days',
        live: {
          version: '1.2.0',
          eingespielt_am: vor(24 * 5, jetzt),
          aenderungstext: 'Resturlaub steht über dem Formular.',
        },
        test: null,
        vorige_version: '1.1.0',
      },
    ],
    meldungen: [
      {
        // Die eine Meldung des Mitarbeiters selbst: seine Werkstatt zeigt sie
        // mit Stand (J52), die anderen sieht er nicht.
        id: 100,
        app_id: 'wartungsplan',
        stand: 'live',
        seite: '/apps/wartungsplan/',
        text: 'Ich hätte gern die Telefonnummer des Kunden direkt in der Zeile.',
        bild: null,
        markierung: null,
        person: { id: 7, anzeigeName: 'Beispiel-Mitarbeiter' },
        stand_meldung: 'angenommen',
        grund: null,
        stand_geaendert_am: vor(6, jetzt),
        erstellt_am: vor(24 + 4, jetzt),
      },
      {
        id: 101,
        app_id: 'angebote',
        stand: 'live',
        seite: '/apps/angebote/',
        text: 'Bei Stammkunden geben wir oft 3 % Rabatt. Ich rechne das jedes Mal von Hand aus. Kann das Angebot einen Rabatt haben?',
        bild: null,
        markierung: null,
        person: { id: 11, anzeigeName: 'Vertrieb Innendienst' },
        stand_meldung: 'umgesetzt',
        grund: null,
        stand_geaendert_am: vor(3, jetzt),
        erstellt_am: vor(24 * 2 + 5, jetzt),
      },
      {
        id: 102,
        app_id: 'wartungsplan',
        stand: 'live',
        seite: '/apps/wartungsplan/',
        text: 'Am Handy ist die Spalte mit dem Kunden abgeschnitten. Unterwegs brauche ich vor allem den Ort.',
        bild: null,
        markierung: null,
        person: { id: 12, anzeigeName: 'Kundendienst Außendienst' },
        stand_meldung: 'neu',
        grund: null,
        stand_geaendert_am: null,
        erstellt_am: vor(20, jetzt),
      },
      {
        id: 103,
        app_id: 'urlaub',
        stand: 'live',
        seite: '/apps/urlaub/',
        text: 'Brückentage wären als Hinweis im Kalender praktisch.',
        bild: null,
        markierung: null,
        person: { id: 13, anzeigeName: 'Fertigung' },
        stand_meldung: 'angenommen',
        grund: null,
        stand_geaendert_am: vor(26, jetzt),
        erstellt_am: vor(24 * 3, jetzt),
      },
      {
        id: 104,
        app_id: 'urlaub',
        stand: 'live',
        seite: '/apps/urlaub/',
        text: 'Bitte eine Farbe pro Abteilung.',
        bild: null,
        markierung: null,
        person: { id: 14, anzeigeName: 'Buchhaltung' },
        stand_meldung: 'abgelehnt',
        grund:
          'Abteilungen stehen schon als eigene Spalte; mehr Farben machen die Übersicht unruhig.',
        stand_geaendert_am: vor(24 * 4, jetzt),
        erstellt_am: vor(24 * 6, jetzt),
      },
    ],
    schaltungen: [],
  };
}
