/**
 * Der Zustand der Demo (J46, J54, M7): die Firma aus `firma.ts`, ihre fünf
 * Fach-Apps mit dem Bestand aus `bestand.ts`, dazu die Werkstatt mit den
 * Rückmeldungen und Fassungen.
 *
 * Angemeldet ist Miriam Kerschner, Betriebsleiterin, mit dem Recht in der
 * Werkstatt. Es gibt keinen Rollenwechsel (J54): was sie sieht, folgt aus
 * ihren Rechten.
 *
 * Das ist der Zustand, mit dem jeder Besuch anfängt und zu dem „Zurücksetzen"
 * zurückkehrt. Was der Besucher danach tut, liegt in seinem Browser
 * (IndexedDB) und nirgends sonst.
 */
import { anfangsBestand, arbeitszeit, type AppKennung, type Bestand } from './bestand';
import { FIRMA, ICH_ID, name, person, stammAnfang, type Stamm } from './firma';

export type Sprache = 'de' | 'en';

export interface DemoFassung {
  version: string;
  eingespielt_am: string;
  aenderungstext: string | null;
}

/** Die Apps der Demo: fünf Fach-Apps mit Einträgen und die Stammdaten (J55). */
export type DemoAppId = AppKennung | 'stammdaten';

export interface DemoApp {
  id: DemoAppId;
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
  /** 4 seit J55 (Stammdaten, Aufträge, Bestand eines Jahres); ein älterer Stand im Browser fängt neu an. */
  fassung: 4;
  theme: 'light' | 'dark' | 'system';
  reihenfolge: string[];
  apps: DemoApp[];
  meldungen: DemoMeldung[];
  schaltungen: DemoSchaltung[];
  naechsteId: number;
  /** Die Einträge der fünf Fach-Apps. */
  bestand: Bestand;
  /** Die nächste Kennung eines neuen Eintrags, über alle Apps. */
  naechsterEintrag: number;
  /** Kunden, Lieferanten, Maschinen, wie die Stammdaten sie führen (J55). */
  stamm: Stamm;
}

export { FIRMA };

/** Die angemeldete Person, in den Formen des Backends. */
export const ICH = {
  id: ICH_ID,
  username: 'm.kerschner',
  vorname: person(ICH_ID).vorname,
  nachname: person(ICH_ID).nachname,
  kuerzel: person(ICH_ID).kuerzel,
  funktion: person(ICH_ID).aufgabe,
  anzeigeName: name(ICH_ID),
};

/** Die Zeit relativ zum Besuch: Beispieldaten altern nicht. */
function vor(stunden: number, jetzt: number): string {
  return arbeitszeit(jetzt - stunden * 3_600_000, jetzt);
}

function meldung(
  id: number,
  app_id: string,
  von: number,
  text: string,
  stand_meldung: DemoMeldung['stand_meldung'],
  stundenAlt: number,
  jetzt: number,
  extra: Partial<DemoMeldung> = {}
): DemoMeldung {
  return {
    id,
    app_id,
    stand: 'live',
    seite: `/apps/${app_id}/`,
    text,
    bild: null,
    markierung: null,
    person: { id: von, anzeigeName: name(von) },
    stand_meldung,
    grund: null,
    stand_geaendert_am: stand_meldung === 'neu' ? null : vor(Math.max(1, stundenAlt - 20), jetzt),
    erstellt_am: vor(stundenAlt, jetzt),
    ...extra,
  };
}

/**
 * Ein Bildschirmfoto zu einer Meldung, als einfache Zeichnung der App: Kopf,
 * Kennzahlen, eine Tabelle. Die markierte Stelle legt die Werkstatt darüber.
 */
function bildschirmfoto(titel: string, zeilen: string[]): string {
  const reihen = zeilen
    .map(
      (z, i) =>
        `<rect x="24" y="${190 + i * 34}" width="752" height="34" fill="${i % 2 ? '#fbfaf7' : '#ffffff'}"/><text x="36" y="${212 + i * 34}" font-size="13" fill="#2b2a26">${z}</text>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420" width="800" height="420" font-family="Helvetica, Arial, sans-serif"><rect width="800" height="420" fill="#f6f3ed"/><text x="24" y="44" font-size="20" font-weight="bold" fill="#1e1b16">${titel}</text><text x="24" y="66" font-size="12" fill="#6b6250">Kerschner Metallbau GmbH</text>${[0, 1, 2, 3].map(i => `<rect x="${24 + i * 192}" y="88" width="176" height="76" rx="10" fill="#fff" stroke="#e3ded3"/><rect x="${38 + i * 192}" y="104" width="70" height="8" rx="4" fill="#d8d2c4"/><rect x="${38 + i * 192}" y="124" width="48" height="16" rx="4" fill="#2b2a26"/>`).join('')}<rect x="24" y="176" width="752" height="14" fill="#efeae0"/>${reihen}</svg>`;
  const bytes = new TextEncoder().encode(svg);
  let binaer = '';
  for (const b of bytes) binaer += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binaer)}`;
}

export function anfangsZustand(jetzt = Date.now()): DemoZustand {
  const bestand = anfangsBestand(jetzt);
  return {
    fassung: 4,
    theme: 'light',
    reihenfolge: [],
    naechsteId: 130,
    naechsterEintrag: 9000,
    bestand,
    // Nach dem Bestand: er gibt den laufenden Aufträgen ihre Nummern.
    stamm: stammAnfang(),
    apps: [
      {
        id: 'angebote',
        name: { de: 'Angebote', en: 'Quotes' },
        beschreibung: {
          de: 'Angebote kalkulieren, versenden und nachfassen; große gehen zur Freigabe.',
          en: 'Estimate, send and follow up quotes; large ones go for approval.',
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
        id: 'wareneingang',
        name: { de: 'Wareneingang', en: 'Goods receipt' },
        beschreibung: {
          de: 'Lieferungen erwarten, annehmen, prüfen und einlagern; Reklamationen mit Foto.',
          en: 'Expect, receive, check and store deliveries; complaints with a photo.',
        },
        symbol: 'package-check',
        live: {
          version: '2.0.1',
          eingespielt_am: vor(24 * 20, jetzt),
          aenderungstext: 'Lagerort aus dem Artikel vorbelegt.',
        },
        test: null,
        vorige_version: '2.0.0',
      },
      {
        id: 'wartungsplan',
        name: { de: 'Wartungsplan', en: 'Maintenance plan' },
        beschreibung: {
          de: 'Welche Maschine wann gewartet wird, was fällig und was überfällig ist.',
          en: 'Which machine is serviced when, what is due and what is overdue.',
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
        id: 'pruefprotokolle',
        name: { de: 'Prüfprotokolle', en: 'Inspection reports' },
        beschreibung: {
          de: 'Prüfungen je Auftrag und Bauteil erfassen und freigeben, nach EN 1090.',
          en: 'Record and approve inspections per order and part, to EN 1090.',
        },
        symbol: 'clipboard-check',
        live: {
          version: '1.8.2',
          eingespielt_am: vor(24 * 9, jetzt),
          aenderungstext: 'Messwert je Prüfung.',
        },
        test: {
          version: '1.9.0',
          eingespielt_am: vor(26, jetzt),
          aenderungstext: 'Nacharbeit mit Frist und zuständiger Person (Rückmeldung #108).',
        },
        vorige_version: '1.8.1',
      },
      {
        id: 'urlaub',
        name: { de: 'Urlaubsanträge', en: 'Leave requests' },
        beschreibung: {
          de: 'Urlaub beantragen, genehmigen und sehen, wer wann fehlt.',
          en: 'Request and approve leave and see who is away when.',
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
      {
        id: 'stammdaten',
        name: { de: 'Stammdaten', en: 'Master data' },
        beschreibung: {
          de: 'Kunden, Lieferanten, Maschinen und Personen, jeweils mit allen Vorgängen.',
          en: 'Customers, suppliers, machines and people, each with all its records.',
        },
        symbol: 'book-user',
        live: {
          version: '1.0.3',
          eingespielt_am: vor(24 * 9, jetzt),
          aenderungstext: 'Lieferanten mit Liefertreue und Reklamationen.',
        },
        test: null,
        vorige_version: '1.0.2',
      },
    ],
    meldungen: [
      meldung(
        100,
        'wartungsplan',
        ICH_ID,
        'Die Telefonnummer des Servicetechnikers direkt in der Zeile wäre praktisch.',
        'angenommen',
        28,
        jetzt
      ),
      meldung(
        101,
        'angebote',
        3,
        'Bei Stammkunden geben wir 3 % Rabatt. Ich rechne das jedes Mal von Hand aus. Kann das Angebot einen Rabatt haben?',
        'umgesetzt',
        53,
        jetzt
      ),
      meldung(
        102,
        'wartungsplan',
        12,
        'Am Handy ist die Spalte mit der Maschine abgeschnitten. In der Halle brauche ich vor allem den Standort.',
        'neu',
        20,
        jetzt,
        {
          bild: bildschirmfoto('Wartungsplan', [
            'WA-26-187  KP-2 Abkantpresse 230 t   Wartung nach Herstellerplan',
            'WA-26-186  KP-1 Abkantpresse 135 t   UVV-Prüfung',
            'WA-26-185  LS-1 Faserlaser 6 kW   Sichtprüfung und Schmierung',
            'WA-26-184  HK-2 Hallenkran 5 t   Kalibrierung',
            'WA-26-183  ST-1 Gabelstapler 3 t   Filter wechseln',
          ]),
          markierung: { x: 0.12, y: 0.44, breite: 0.38, hoehe: 0.42 },
        }
      ),
      meldung(
        103,
        'urlaub',
        16,
        'Brückentage wären als Hinweis im Kalender praktisch.',
        'angenommen',
        72,
        jetzt
      ),
      meldung(104, 'urlaub', 15, 'Bitte eine Farbe pro Abteilung.', 'abgelehnt', 144, jetzt, {
        grund:
          'Die Abteilung steht schon als eigene Spalte; mehr Farben machen die Übersicht unruhig.',
      }),
      meldung(
        105,
        'wareneingang',
        7,
        'Beim Reklamieren will ich das Foto direkt mit dem Handy machen, ohne Umweg über die Galerie.',
        'neu',
        6,
        jetzt,
        {
          bild: bildschirmfoto('Wareneingang', [
            'WE-26-0354  Stahlhandel Rheintal GmbH   U-Profil 120   90 m',
            'WE-26-0353  Stahlhandel Rheintal GmbH   Flachstahl 40 × 8',
            'WE-26-0352  Rohrhandel Nordstern   Quadratrohr 40 × 40 × 3',
            'WE-26-0351  Edelstahl Mertens KG   Edelstahlblech 1.4301',
            'WE-26-0350  Aluprofile Sander GmbH   Aluprofil Handlauf oval',
          ]),
          markierung: { x: 0.7, y: 0.02, breite: 0.28, hoehe: 0.14 },
        }
      ),
      meldung(
        106,
        'wareneingang',
        6,
        'Kann die Bestellnummer aus dem Lieferschein übernommen werden?',
        'angenommen',
        98,
        jetzt
      ),
      meldung(
        107,
        'angebote',
        4,
        'Das Angebots-PDF sollte unsere Referenzbilder anhängen können.',
        'neu',
        30,
        jetzt
      ),
      meldung(
        108,
        'pruefprotokolle',
        11,
        'Bei Nacharbeit brauche ich eine Frist und wer es macht, sonst geht es unter.',
        'umgesetzt',
        120,
        jetzt
      ),
      meldung(
        109,
        'pruefprotokolle',
        8,
        'Die Liste nach Auftrag gruppieren, dann sehe ich, was für eine Baustelle fehlt.',
        'angenommen',
        46,
        jetzt,
        {
          bild: bildschirmfoto('Prüfprotokolle', [
            'PP-26-089  AU-26-084  Pfosten mit Fußplatte   Maßprüfung',
            'PP-26-088  AU-26-083  Treppenwange rechts   Sichtprüfung',
            'PP-26-087  AU-26-082  Kantteil Verkleidung   Schichtdicke',
            'PP-26-086  AU-26-080  Konsole Vordach   Sichtprüfung',
            'PP-26-085  AU-26-081  Torflügel   Abnahme vor Ort',
          ]),
          markierung: { x: 0.12, y: 0.44, breite: 0.2, hoehe: 0.42 },
        }
      ),
      meldung(
        110,
        'urlaub',
        13,
        'Ein Export für die Lohnabrechnung als CSV würde mir viel Abtippen sparen.',
        'umgesetzt',
        300,
        jetzt
      ),
      meldung(
        111,
        'wartungsplan',
        9,
        'Laser LS-1: Schutzglas-Wechsel bitte als eigene Wartung alle zwei Wochen.',
        'umgesetzt',
        400,
        jetzt
      ),
      meldung(
        112,
        'angebote',
        1,
        'Auf der Übersicht hätte ich gern die Annahmequote je Monat.',
        'neu',
        3,
        jetzt
      ),
      meldung(
        113,
        'werkstatt',
        5,
        'Eine App für Arbeitszeiten auf der Baustelle wäre der nächste Schritt.',
        'neu',
        52,
        jetzt
      ),
    ],
    schaltungen: [
      {
        app_id: 'angebote',
        ergebnis: 'live',
        satz: 'Fassung 1.4.0 ist live.',
        nach_version: '1.4.0',
        am: vor(24 * 12, jetzt),
      },
      {
        app_id: 'pruefprotokolle',
        ergebnis: 'live',
        satz: 'Fassung 1.8.2 ist live.',
        nach_version: '1.8.2',
        am: vor(24 * 9, jetzt),
      },
      {
        app_id: 'urlaub',
        ergebnis: 'live',
        satz: 'Fassung 1.2.0 ist live.',
        nach_version: '1.2.0',
        am: vor(24 * 5, jetzt),
      },
    ],
  };
}
