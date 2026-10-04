/**
 * Die Ansichten der Verwaltung und die drei Breiten -- an einer Stelle.
 * Phase H5 des Plans vom 29.08.2026.
 *
 * WARUM DIESE DATEI. Seit D6 gilt in diesem Repo: das Breitenraster steht an
 * EINER Stelle, sonst laufen sechs Skripte mit sechs Wahrheiten darueber
 * auseinander, welche Breiten ein Gerät eigentlich koennen muss (die
 * Begruendung steht im Kopf von `oberflaeche-abnahme.mjs`). Mit dem
 * Bilderbogen aus H5 gibt es einen zweiten Leser -- er fotografiert dieselben
 * Ansichten in beiden Themes --, und zwei Leser sind genau der Augenblick, in
 * dem eine Liste in zwei Dateien beginnt zu driften.
 *
 * Hier steht deshalb, was BEIDE brauchen und keiner allein besitzt: die
 * Breiten und die Verwaltungsansichten, die ueber eine Adresse zu erreichen
 * sind. Was nur die Reihe kann -- den Mitarbeiter anlegen, eine Freigabe
 * herstellen, die Tastatur ablaufen --, bleibt bei ihr; was nur der
 * Bilderbogen kann -- das Theme umstellen --, bleibt bei ihm.
 */

/** Die drei Breiten aus dem Auftrag der Phase D6 (Telefon, Tablet, Arbeitsplatz). */
export const BREITEN = [
  { px: 390, hoehe: 844, name: 'telefon' },
  { px: 1024, hoehe: 768, name: 'tablet' },
  { px: 1440, hoehe: 900, name: 'arbeitsplatz' },
];

/** Unter dieser Fensterbreite gibt es keine drei Spalten (`useSchmalesFenster`). */
export const SCHMAL_AB_PX = 900;

/**
 * Die Verwaltungsansichten: Name, Dateiname des Bildes, Adresse, Kennzeichen.
 *
 * Nur die, die ein Administrator ueber eine ADRESSE erreicht -- eine Ansicht,
 * die erst nach drei Klicks dasteht, gehoert dem Skript, das die Klicks kennt.
 */
export const VERWALTUNG = [
  [
    'Verwaltung · Personen',
    'verwaltung-personen',
    '/workspace/verwaltung/benutzer',
    '[data-testid="personen-seite"]',
  ],
  [
    'Verwaltung · Apps',
    'verwaltung-apps',
    '/workspace/verwaltung/apps',
    '[data-testid="apps-seite"]',
  ],
  [
    'Verwaltung · Läufe',
    'verwaltung-laeufe',
    '/workspace/verwaltung/laeufe',
    '[data-testid="laeufe-seite"]',
  ],
  [
    'Verwaltung · Firmenordner',
    'verwaltung-firmenordner',
    '/workspace/verwaltung/firmenordner',
    '[data-testid="firmenordner-seite"]',
  ],
  [
    'Verwaltung · Modelle',
    'verwaltung-modelle',
    '/workspace/verwaltung/modelle',
    '[data-testid="modelle-seite"]',
  ],
  [
    'Verwaltung · System',
    'verwaltung-system',
    '/workspace/verwaltung/system',
    '[data-testid="system-seite"]',
  ],
  [
    'Verwaltung · Daten',
    'verwaltung-daten',
    '/workspace/verwaltung/daten',
    '[data-testid="daten-seite"]',
  ],
  [
    'Verwaltung · Gerät',
    'verwaltung-geraet',
    '/workspace/verwaltung/geraet',
    '[data-testid="geraet-seite"]',
  ],
];
