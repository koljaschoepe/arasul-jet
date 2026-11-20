/**
 * Beispiel-App „Wartungsplan" der Demo (J46, M7): welche Anlage wann dran
 * ist. Fällige stehen oben; „Erledigt" schiebt den Termin um das Intervall.
 */
import {
  h,
  rendern,
  useState,
  Karte,
  Knopf,
  Kopf,
  Liste,
  ListenEintrag,
} from '/marken/5/marken.js';
import { t, datum, tag, useFassung } from './gemeinsam.js';

const ANFANG = [
  {
    id: 1,
    anlage: t('Kühlraum 2', 'Cold room 2'),
    kunde: 'Bäckerei am Markt',
    ort: t('Hauptstraße, Lager', 'High Street, storage'),
    faellig: -3,
    intervall: 90,
  },
  {
    id: 2,
    anlage: t('Lüftung Küche', 'Kitchen ventilation'),
    kunde: 'Hotel Seeblick',
    ort: t('Seeweg, Küche', 'Lake Road, kitchen'),
    faellig: 1,
    intervall: 180,
  },
  {
    id: 3,
    anlage: t('Wärmepumpe', 'Heat pump'),
    kunde: 'Praxis am Park',
    ort: t('Parkallee, Keller', 'Park Avenue, basement'),
    faellig: 6,
    intervall: 365,
  },
  {
    id: 4,
    anlage: t('Heizkessel Halle', 'Hall boiler'),
    kunde: 'Autohaus Nord',
    ort: t('Gewerbering, Werkstatt', 'Trade Park, workshop'),
    faellig: 19,
    intervall: 365,
  },
  {
    id: 5,
    anlage: t('Klimagerät Serverraum', 'Server room AC'),
    kunde: 'Stadtwerke Beispielstadt',
    ort: t('Am Wasserturm', 'Water Tower Lane'),
    faellig: 34,
    intervall: 180,
  },
];

function lage(abstand) {
  if (abstand < 0) return t(`seit ${-abstand} Tagen fällig`, `overdue by ${-abstand} days`);
  if (abstand === 0) return t('heute fällig', 'due today');
  if (abstand <= 7) return t(`in ${abstand} Tagen`, `in ${abstand} days`);
  return datum(tag(abstand));
}

function App() {
  const fassung = useFassung();
  const [anlagen, setAnlagen] = useState(ANFANG);
  const sortiert = [...anlagen].sort((a, b) => a.faellig - b.faellig);
  const faellig = sortiert.filter(a => a.faellig <= 7);
  const spaeter = sortiert.filter(a => a.faellig > 7);

  const erledigt = id =>
    setAnlagen(anlagen.map(a => (a.id === id ? { ...a, faellig: a.intervall } : a)));

  const eintrag = a =>
    h(ListenEintrag, {
      key: a.id,
      titel: `${a.anlage} · ${a.kunde}`,
      unterzeile: `${a.ort} · ${t('alle', 'every')} ${a.intervall} ${t('Tage', 'days')}`,
      hinweis: h(
        'span',
        {
          style: { display: 'inline-flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
        },
        h('span', null, lage(a.faellig)),
        a.faellig <= 7 && h(Knopf, { onKlick: () => erledigt(a.id) }, t('Erledigt', 'Done'))
      ),
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
      titel: t('Wartungsplan', 'Maintenance plan'),
      beschreibung: fassung ? t(`Fassung ${fassung.version}`, `Version ${fassung.version}`) : null,
    }),
    h(
      Karte,
      { titel: t('Diese Woche', 'This week') },
      faellig.length
        ? h(Liste, { beschriftung: t('Fällig', 'Due') }, ...faellig.map(eintrag))
        : h('p', { style: { margin: 0 } }, t('Nichts fällig.', 'Nothing due.'))
    ),
    h(Liste, { beschriftung: t('Später', 'Later') }, ...spaeter.map(eintrag))
  );
}

rendern(h(App), document.getElementById('app'));
