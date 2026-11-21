/**
 * Beispiel-App „Urlaubsanträge" der Demo (J46, M7): Resturlaub, Antrag
 * stellen, wer wann fehlt. Personen tragen keine Namen, nur ihre Abteilung.
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
import { t, datum, tag, useFassung, SEITE, MONO, unterzeile } from './gemeinsam.js';

const ABWESEND = [
  { wer: t('Werkstatt', 'Workshop'), von: 2, bis: 6, art: 'urlaub' },
  { wer: t('Vertrieb Innendienst', 'Inside sales'), von: 9, bis: 13, art: 'urlaub' },
  { wer: t('Buchhaltung', 'Accounting'), von: 16, bis: 16, art: 'gleittag' },
  { wer: t('Kundendienst Außendienst', 'Field service'), von: 23, bis: 34, art: 'urlaub' },
  { wer: t('Lager', 'Warehouse'), von: 30, bis: 31, art: 'schulung' },
];

const ART = {
  urlaub: () => t('Urlaub', 'Leave'),
  gleittag: () => t('Gleittag', 'Flexi day'),
  schulung: () => t('Schulung', 'Training'),
  antrag: () => t('wartet auf Freigabe', 'awaiting approval'),
};

const iso = d => d.toISOString().slice(0, 10);

function arbeitstage(von, bis) {
  let n = 0;
  for (let d = new Date(von); d <= bis; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n += 1;
  }
  return n;
}

function App() {
  const fassung = useFassung();
  const [rest, setRest] = useState(17);
  const [antraege, setAntraege] = useState([]);
  const [von, setVon] = useState(iso(tag(14)));
  const [bis, setBis] = useState(iso(tag(18)));
  const [hinweis, setHinweis] = useState(null);

  const stellen = () => {
    const a = new Date(von);
    const b = new Date(bis);
    const tage =
      Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a ? 0 : arbeitstage(a, b);
    if (!tage) {
      setHinweis({
        art: 'fehler',
        text: t('Bitte einen gültigen Zeitraum wählen.', 'Please choose a valid period.'),
      });
      return;
    }
    if (tage > rest) {
      setHinweis({
        art: 'fehler',
        text: t(`Es sind nur noch ${rest} Tage übrig.`, `Only ${rest} days left.`),
      });
      return;
    }
    setAntraege([{ von: a, bis: b, tage }, ...antraege]);
    setRest(rest - tage);
    setHinweis({
      art: 'erfolg',
      text: t(
        `Antrag über ${tage} Tage gestellt. Die Freigabe liegt bei der Leitung.`,
        `Request for ${tage} days submitted. Approval is with management.`
      ),
    });
  };

  const zeilen = [
    ...antraege.map((a, i) => ({
      kennung: `antrag-${i}`,
      wer: t('Sie', 'You'),
      von: a.von,
      bis: a.bis,
      tage: a.tage,
      art: 'antrag',
    })),
    ...ABWESEND.map(a => ({
      kennung: a.wer,
      wer: a.wer,
      von: tag(a.von),
      bis: tag(a.bis),
      tage: arbeitstage(tag(a.von), tag(a.bis)),
      art: a.art,
    })),
  ];
  const genommen = 30 - rest;

  const spalten = [
    {
      schluessel: 'wer',
      titel: t('Wer', 'Who'),
      wert: z => z.wer,
      zelle: z => z.wer,
      inKarteOben: true,
    },
    {
      schluessel: 'zeitraum',
      titel: t('Zeitraum', 'Period'),
      breite: '15rem',
      wert: z => z.von.getTime(),
      zelle: z =>
        h(
          'span',
          { style: MONO },
          z.tage === 1 ? datum(z.von) : `${datum(z.von)} – ${datum(z.bis)}`
        ),
    },
    {
      schluessel: 'tage',
      titel: t('Arbeitstage', 'Working days'),
      ausrichtung: 'rechts',
      breite: '8rem',
      wert: z => z.tage,
      zelle: z =>
        h(
          'span',
          { style: MONO },
          z.tage === 1 ? t('1 Tag', '1 day') : t(`${z.tage} Tage`, `${z.tage} days`)
        ),
    },
    {
      schluessel: 'art',
      titel: t('Art', 'Type'),
      breite: '10rem',
      wert: z => z.art,
      zelle: z =>
        h(Badge, { variant: z.art === 'antrag' ? 'outline' : 'default' }, ART[z.art]()),
    },
  ];

  return h(
    'div',
    { style: SEITE },
    h(Kopf, {
      titel: t('Urlaubsanträge', 'Leave requests'),
      beschreibung: unterzeile(
        t('Urlaub beantragen und sehen, wer wann fehlt.', 'Request leave and see who is away when.'),
        fassung
      ),
    }),
    h(
      Kennzahlen,
      null,
      h(Kennzahl, {
        beschriftung: t('Ihr Resturlaub', 'Your remaining leave'),
        wert: String(rest),
        einheit: t('Tage', 'days'),
        fussnote: t(`${genommen} von 30 genommen oder beantragt`, `${genommen} of 30 taken or requested`),
      }),
      h(Kennzahl, {
        beschriftung: t('Abwesend in 4 Wochen', 'Away in 4 weeks'),
        wert: String(ABWESEND.length),
        einheit: t('Abteilungen', 'teams'),
      })
    ),
    h(Datenliste, {
      daten: zeilen,
      spalten,
      kennung: z => z.kennung,
      beschriftung: t('Wer fehlt in den nächsten Wochen', 'Who is away in the coming weeks'),
    }),
    h(
      Karte,
      { titel: t('Urlaub beantragen', 'Request leave') },
      hinweis && h(Meldung, { art: hinweis.art }, hinweis.text),
      h(
        Formular,
        {
          onAbsenden: stellen,
          aktionen: h(Knopf, { art: 'haupt', typ: 'absenden' }, t('Beantragen', 'Submit')),
        },
        h(
          Feld,
          { kennung: 'von', beschriftung: t('Von', 'From') },
          h('input', { id: 'von', type: 'date', value: von, onChange: e => setVon(e.target.value) })
        ),
        h(
          Feld,
          { kennung: 'bis', beschriftung: t('Bis', 'To') },
          h('input', { id: 'bis', type: 'date', value: bis, onChange: e => setBis(e.target.value) })
        )
      )
    )
  );
}

rendern(h(App), document.getElementById('app'));
