/**
 * Beispiel-App „Angebote" der Demo (J46, M7). Ab Fassung 1.5.0 (in Test)
 * kennt ein Angebot einen Rabatt: das ist die Änderung, die der Besucher im
 * Entwickler-Cockpit live schaltet.
 */
import {
  h,
  rendern,
  useState,
  Feld,
  Formular,
  Karte,
  Knopf,
  Kopf,
  Liste,
  ListenEintrag,
  Meldung,
} from '/marken/5/marken.js';
import { t, euro, datum, tag, mindestens, useFassung } from './gemeinsam.js';

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
  const [kunde, setKunde] = useState('');
  const [neu, setNeu] = useState({ kunde: '', betreff: '', betrag: '', rabatt: '' });
  const [hinweis, setHinweis] = useState(null);

  const kunden = [...new Set(angebote.map(a => a.kunde))].sort();
  const sichtbar = angebote.filter(a => !kunde || a.kunde === kunde);
  const offen = sichtbar.filter(a => a.stand === 'offen');
  const summe = offen.reduce((s, a) => s + (mitRabatt ? nachRabatt(a) : a.betrag), 0);

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

  return h(
    'div',
    {
      style: {
        maxWidth: '56rem',
        margin: '0 auto',
        padding: 'var(--ara-abstand-4, 1rem)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 'var(--ara-abstand-4, 1rem)',
      },
    },
    h(Kopf, {
      titel: t('Angebote', 'Quotes'),
      beschreibung: fassung
        ? t(
            `Fassung ${fassung.version}${fassung.stand === 'test' ? ' · Test' : ''}`,
            `Version ${fassung.version}${fassung.stand === 'test' ? ' · test' : ''}`
          )
        : null,
    }),
    h(
      Karte,
      {
        titel: t('Offen', 'Open'),
        hinweis: mitRabatt ? t('nach Rabatt', 'after discount') : null,
      },
      h('p', { style: { margin: 0, fontSize: '1.25rem' } }, euro(summe)),
      h(
        'p',
        { style: { margin: 0, opacity: 0.7 } },
        t(`${offen.length} offene Angebote`, `${offen.length} open quotes`)
      )
    ),
    h(
      Feld,
      { kennung: 'filter-kunde', beschriftung: t('Kunde', 'Customer') },
      h(
        'select',
        { id: 'filter-kunde', value: kunde, onChange: e => setKunde(e.target.value) },
        h('option', { value: '' }, t('Alle Kunden', 'All customers')),
        ...kunden.map(k => h('option', { key: k, value: k }, k))
      )
    ),
    h(
      Liste,
      { beschriftung: t('Angebote', 'Quotes') },
      ...sichtbar.map(a =>
        h(ListenEintrag, {
          key: a.nr,
          titel: `${a.kunde} · ${a.betreff}`,
          unterzeile: `${a.nr} · ${datum(a.am)} · ${STAND[a.stand]()}`,
          hinweis:
            mitRabatt && a.rabatt ? `${euro(nachRabatt(a))} (−${a.rabatt} %)` : euro(a.betrag),
        })
      )
    ),
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
        h(
          Feld,
          { kennung: 'neu-betreff', beschriftung: t('Betreff', 'Subject') },
          eingabe('betreff')
        ),
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
