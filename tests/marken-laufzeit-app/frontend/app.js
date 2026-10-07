/**
 * Die Probe fuer die Bibliothek zur Laufzeit: eine App ohne Bau und ohne
 * Kopie der Bibliothek.
 *
 * Alles, was hier zu sehen ist, kommt vom Geraet unter `/marken/5/`:
 * Seitenleiste (zuklappbar), Tabelle (`Datenliste`) und `Freigabe`, dazu
 * React selbst. Das Paket traegt nur diese Datei und `index.html`. Nach
 * einem Update des Geraets steht unter derselben Adresse die neue Fassung,
 * und diese Seite zeigt sie, ohne dass jemand sie neu baut oder einspielt.
 *
 * Kein JSX: ohne Bau gibt es keinen Uebersetzer, also `h(...)`.
 */
import {
  h,
  rendern,
  useState,
  FASSUNG,
  Badge,
  Datenliste,
  Freigabe,
  Kopf,
  Seitenleiste,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '/marken/5/marken.js';

const VORGAENGE = [
  { nr: 'V-1041', gegenstand: 'Rechnung Bürobedarf', betrag: 184.2, stand: 'offen' },
  { nr: 'V-1042', gegenstand: 'Reisekosten Messe', betrag: 912.5, stand: 'geprüft' },
  { nr: 'V-1043', gegenstand: 'Wartung Druckmaschine', betrag: 2310, stand: 'offen' },
  { nr: 'V-1044', gegenstand: 'Lizenz Zeichenprogramm', betrag: 449, stand: 'bezahlt' },
];

const STUNDE = 60 * 60 * 1000;
const ANFRAGEN = [
  {
    id: 1,
    titel: 'Wartung Druckmaschine freigeben',
    zusammenhang: 'Die Rechnung liegt über der Grenze von 2.000 Euro.',
    einreicher: 'Probe',
    angefragtAm: new Date(Date.now() - 3 * STUNDE).toISOString(),
    frist: new Date(Date.now() + 2 * 24 * STUNDE).toISOString(),
  },
  {
    id: 2,
    titel: 'Reisekosten Messe bestätigen',
    zusammenhang: 'Zwei Belege fehlen, der Rest ist geprüft.',
    einreicher: 'Probe',
    angefragtAm: new Date(Date.now() - 26 * STUNDE).toISOString(),
    frist: new Date(Date.now() + 5 * 24 * STUNDE).toISOString(),
  },
];

/**
 * Die App schreibt kein Tailwind. Was sie selbst gestaltet, steht als Stil mit
 * den Tokens des Geraets da (`var(--border)`, `var(--font-mono)`), die
 * `marken.css` fuer beide Themes setzt.
 */
const MONO = { fontFamily: 'var(--font-mono)' };

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

const SPALTEN = [
  { schluessel: 'nr', titel: 'Nummer', zelle: z => h('span', { style: MONO }, z.nr) },
  { schluessel: 'gegenstand', titel: 'Gegenstand', zelle: z => z.gegenstand },
  {
    schluessel: 'betrag',
    titel: 'Betrag',
    ausrichtung: 'rechts',
    wert: z => z.betrag,
    zelle: z => h('span', { style: MONO }, euro.format(z.betrag)),
  },
  {
    schluessel: 'stand',
    titel: 'Stand',
    zelle: z => h(Badge, { variant: z.stand === 'offen' ? 'outline' : 'secondary' }, z.stand),
  },
];

/** Ein Buchstabe als Symbol: sichtbar auch, wenn die Leiste zugeklappt ist. */
/**
 * Ein Symbol wie aus dem Lucide-Satz, ohne Bau als `svg` geschrieben: die
 * Leiste setzt jedes `svg` am Eintrag auf 16 px, wie in Verwaltung und
 * Einstellungen. Bis 5.5.0 stand hier ein Buchstabe.
 */
const PFADE = {
  V: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  F: ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
};

function zeichen(buchstabe) {
  return h(
    'svg',
    {
      'aria-hidden': 'true',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    ...(PFADE[buchstabe] ?? []).map(d => h('path', { key: d, d }))
  );
}

function App() {
  const [seite, setzeSeite] = useState('vorgaenge');
  const [anfragen, setzeAnfragen] = useState(ANFRAGEN);

  const entscheiden = status => (eintrag, grund) =>
    setzeAnfragen(alle =>
      alle.map(e =>
        e.id === eintrag.id
          ? {
              ...e,
              status,
              entschiedenVon: 'Probe',
              entschiedenAm: new Date().toISOString(),
              begruendung: grund ?? null,
            }
          : e
      )
    );

  const eintrag = (kennung, name, buchstabe, zahl) => ({
    kennung,
    name,
    symbol: zeichen(buchstabe),
    aktiv: seite === kennung,
    zahl,
    aufKlick: () => setzeSeite(kennung),
  });
  const offen = anfragen.filter(a => (a.status ?? 'offen') === 'offen').length;

  return h(
    SidebarProvider,
    null,
    h(Seitenleiste, {
      // Der Titel oben ist der Name der App, wie in Verwaltung und
      // Einstellungen (5.5.0): dieselbe Leiste für alles auf dem Gerät.
      titel: 'Marken zur Laufzeit',
      gruppen: [
        {
          titel: 'Arbeit',
          eintraege: [
            eintrag('vorgaenge', 'Vorgänge', 'V'),
            eintrag('freigaben', 'Freigaben', 'F', offen || undefined),
          ],
        },
      ],
      fuss: h(
        'div',
        {
          style: {
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            color: 'var(--muted-foreground)',
          },
          'data-testid': 'probe-fassung',
        },
        `Bibliothek ${FASSUNG}`
      ),
    }),
    h(
      SidebarInset,
      null,
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            borderBottom: '1px solid var(--border)',
          },
        },
        h(SidebarTrigger, { 'data-testid': 'probe-umschalten' }),
        h('span', null, seite === 'vorgaenge' ? 'Vorgänge' : 'Freigaben')
      ),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' } },
        seite === 'vorgaenge'
          ? [
              h(Kopf, { key: 'kopf', titel: 'Vorgänge' }),
              h(Datenliste, {
                key: 'liste',
                daten: VORGAENGE,
                spalten: SPALTEN,
                kennung: z => z.nr,
                beschriftung: 'Vorgänge',
                filter: true,
                filterPlatzhalter: 'Vorgänge durchsuchen',
              }),
            ]
          : [
              h(Kopf, { key: 'kopf', titel: 'Freigaben' }),
              h(Freigabe, {
                key: 'freigabe',
                eintraege: anfragen,
                beiBestaetigen: entscheiden('bestaetigt'),
                beiAblehnen: entscheiden('abgelehnt'),
              }),
            ]
      )
    )
  );
}

rendern(h(App), document.getElementById('app'));
