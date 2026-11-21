/**
 * Beispiel-App „Angebote" der Demo (J46, J51, M7). Ab Fassung 1.5.0 (in Test)
 * kennt ein Angebot einen Rabatt: das ist die Änderung, die der Besucher im
 * Entwickler-Cockpit live schaltet. Seitenkopf, Kennzahlen, kompakte Tabelle
 * wie jede App im neuen Aussehen.
 */
import {
  h,
  rendern,
  useState,
  Badge,
  Datenliste,
  Feld,
  Formular,
  Karte,
  Kennzahl,
  Kennzahlen,
  Knopf,
  Kopf,
  Meldung,
} from '/marken/5/marken.js';
import { t, euro, datum, tag, mindestens, useFassung, SEITE, MONO, unterzeile } from './gemeinsam.js';

const STAND = {
  offen: () => t('offen', 'open'),
  angenommen: () => t('angenommen', 'accepted'),
  abgelehnt: () => t('abgelehnt', 'declined'),
};

const ANFANG = [
  {
    nr: 'A-2026-118',
    kunde: 'Bäckerei am Markt',
    betreff: t('Kühlraum, Wartungsvertrag', 'Cold room, service contract'),
    betrag: 1840,
    rabatt: 0,
    stand: 'offen',
    am: tag(-2),
  },
  {
    nr: 'A-2026-117',
    kunde: 'Hotel Seeblick',
    betreff: t('Lüftung Küche erneuern', 'Replace kitchen ventilation'),
    betrag: 12650,
    rabatt: 3,
    stand: 'offen',
    am: tag(-4),
  },
  {
    nr: 'A-2026-116',
    kunde: 'Stadtwerke Beispielstadt',
    betreff: t('Klimagerät Serverraum tauschen', 'Replace server room AC'),
    betrag: 7380,
    rabatt: 0,
    stand: 'offen',
    am: tag(-6),
  },
  {
    nr: 'A-2026-115',
    kunde: 'Praxis am Park',
    betreff: t('Klimagerät Behandlungsraum', 'Air conditioning, treatment room'),
    betrag: 4320,
    rabatt: 0,
    stand: 'angenommen',
    am: tag(-9),
  },
  {
    nr: 'A-2026-112',
    kunde: 'Hotel Seeblick',
    betreff: t('Notdienst-Pauschale 2027', 'Emergency service flat rate 2027'),
    betrag: 2400,
    rabatt: 3,
    stand: 'angenommen',
    am: tag(-15),
  },
  {
    nr: 'A-2026-109',
    kunde: 'Autohaus Nord',
    betreff: t('Werkstatt-Heizung', 'Workshop heating'),
    betrag: 8900,
    rabatt: 0,
    stand: 'abgelehnt',
    am: tag(-21),
  },
];

const nachRabatt = a => a.betrag * (1 - (a.rabatt || 0) / 100);

function App() {
  const fassung = useFassung();
  const mitRabatt = fassung ? mindestens(fassung.version, '1.5.0') : false;
  const [angebote, setAngebote] = useState(ANFANG);
  const [neu, setNeu] = useState({ kunde: '', betreff: '', betrag: '', rabatt: '' });
  const [hinweis, setHinweis] = useState(null);

  const wert = a => (mitRabatt ? nachRabatt(a) : a.betrag);
  const offen = angebote.filter(a => a.stand === 'offen');
  const summe = offen.reduce((s, a) => s + wert(a), 0);
  const entschieden = angebote.filter(a => a.stand !== 'offen');
  const angenommen = entschieden.filter(a => a.stand === 'angenommen');
  const quote = entschieden.length ? Math.round((angenommen.length / entschieden.length) * 100) : 0;

  const anlegen = () => {
    const betrag = Number(String(neu.betrag).replace(',', '.'));
    if (!neu.kunde.trim() || !neu.betreff.trim() || !(betrag > 0)) {
      setHinweis({
        art: 'fehler',
        text: t(
          'Bitte Kunde, Betreff und Betrag angeben.',
          'Please enter customer, subject and amount.'
        ),
      });
      return;
    }
    const nr = `A-2026-${119 + angebote.length - ANFANG.length}`;
    setAngebote([
      {
        nr,
        kunde: neu.kunde.trim(),
        betreff: neu.betreff.trim(),
        betrag,
        rabatt: mitRabatt ? Number(neu.rabatt) || 0 : 0,
        stand: 'offen',
        am: tag(0),
      },
      ...angebote,
    ]);
    setNeu({ kunde: '', betreff: '', betrag: '', rabatt: '' });
    setHinweis({ art: 'erfolg', text: t(`Angebot ${nr} angelegt.`, `Quote ${nr} created.`) });
  };

  const eingabe = (feld, typ = 'text') =>
    h('input', {
      id: `neu-${feld}`,
      type: typ,
      inputMode: typ === 'number' ? 'decimal' : undefined,
      value: neu[feld],
      onChange: e => setNeu({ ...neu, [feld]: e.target.value }),
    });

  const spalten = [
    { schluessel: 'nr', titel: t('Nummer', 'Number'), breite: '8.5rem', zelle: a => h('span', { style: MONO }, a.nr), inKarteOben: true },
    { schluessel: 'kunde', titel: t('Kunde', 'Customer'), wert: a => a.kunde, zelle: a => a.kunde },
    { schluessel: 'betreff', titel: t('Betreff', 'Subject'), wert: a => a.betreff, zelle: a => a.betreff },
    { schluessel: 'am', titel: t('Datum', 'Date'), breite: '7rem', wert: a => a.am.getTime(), zelle: a => h('span', { style: MONO }, datum(a.am)) },
    {
      schluessel: 'betrag',
      titel: mitRabatt ? t('Betrag nach Rabatt', 'Amount after discount') : t('Betrag', 'Amount'),
      ausrichtung: 'rechts',
      breite: '10rem',
      wert: wert,
      zelle: a =>
        h(
          'span',
          { style: MONO },
          mitRabatt && a.rabatt ? `${euro(nachRabatt(a))} (−${a.rabatt} %)` : euro(a.betrag)
        ),
    },
    {
      schluessel: 'stand',
      titel: t('Stand', 'Status'),
      breite: '7rem',
      wert: a => a.stand,
      zelle: a =>
        h(Badge, { variant: a.stand === 'offen' ? 'outline' : a.stand === 'angenommen' ? 'success' : 'default' }, STAND[a.stand]()),
    },
  ];

  return h(
    'div',
    { style: SEITE },
    h(Kopf, {
      titel: t('Angebote', 'Quotes'),
      beschreibung: unterzeile(
        t('Angebote der Beispielwerk GmbH, Kälte- und Klimatechnik.', 'Quotes of Beispielwerk GmbH, refrigeration and air conditioning.'),
        fassung
      ),
    }),
    h(
      Kennzahlen,
      null,
      h(Kennzahl, {
        beschriftung: t('Offen', 'Open'),
        wert: euro(summe),
        fussnote: mitRabatt
          ? t(`${offen.length} Angebote, nach Rabatt`, `${offen.length} quotes, after discount`)
          : t(`${offen.length} Angebote`, `${offen.length} quotes`),
        verlauf: [14200, 16800, 15100, 19900, 18400, 21870],
      }),
      h(Kennzahl, {
        beschriftung: t('Angenommen', 'Accepted'),
        wert: String(quote),
        einheit: '%',
        fussnote: t(`${angenommen.length} von ${entschieden.length} entschieden`, `${angenommen.length} of ${entschieden.length} decided`),
      })
    ),
    h(Datenliste, {
      daten: angebote,
      spalten,
      kennung: a => a.nr,
      beschriftung: t('Alle Angebote, neueste zuerst', 'All quotes, newest first'),
      filter: true,
      filterPlatzhalter: t('Kunde oder Betreff suchen', 'Search customer or subject'),
      leerGefiltert: t('Kein Angebot passt.', 'No quote matches.'),
    }),
    h(
      Karte,
      { titel: t('Neues Angebot', 'New quote') },
      hinweis && h(Meldung, { art: hinweis.art }, hinweis.text),
      h(
        Formular,
        {
          onAbsenden: anlegen,
          aktionen: h(Knopf, { art: 'haupt', typ: 'absenden' }, t('Anlegen', 'Create')),
        },
        h(Feld, { kennung: 'neu-kunde', beschriftung: t('Kunde', 'Customer') }, eingabe('kunde')),
        h(Feld, { kennung: 'neu-betreff', beschriftung: t('Betreff', 'Subject') }, eingabe('betreff')),
        h(
          Feld,
          { kennung: 'neu-betrag', beschriftung: t('Betrag in Euro', 'Amount in euros') },
          eingabe('betrag', 'number')
        ),
        mitRabatt &&
          h(
            Feld,
            {
              kennung: 'neu-rabatt',
              beschriftung: t('Rabatt in Prozent', 'Discount in percent'),
              hinweis: t('Neu in 1.5.0', 'New in 1.5.0'),
            },
            eingabe('rabatt', 'number')
          )
      )
    )
  );
}

rendern(h(App), document.getElementById('app'));
