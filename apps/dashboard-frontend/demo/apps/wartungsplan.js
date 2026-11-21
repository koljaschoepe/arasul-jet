/**
 * Beispiel-App „Wartungsplan" der Demo (J46, M7): welche Anlage wann dran
 * ist. Fällige stehen oben; „Erledigt" schiebt den Termin um das Intervall.
 */
import {
  h,
  rendern,
  useState,
  Badge,
  Datenliste,
  Kennzahl,
  Kennzahlen,
  Knopf,
  Kopf,
} from '/marken/5/marken.js';
import { t, datum, tag, useFassung, SEITE, MONO, unterzeile } from './gemeinsam.js';

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
  const [erledigtZahl, setErledigtZahl] = useState(11);
  const sortiert = [...anlagen].sort((a, b) => a.faellig - b.faellig);
  const faellig = sortiert.filter(a => a.faellig <= 7);
  const ueberfaellig = sortiert.filter(a => a.faellig < 0);

  const erledigt = id => {
    setAnlagen(anlagen.map(a => (a.id === id ? { ...a, faellig: a.intervall } : a)));
    setErledigtZahl(erledigtZahl + 1);
  };

  const spalten = [
    { schluessel: 'anlage', titel: t('Anlage', 'Machine'), wert: a => a.anlage, zelle: a => a.anlage, inKarteOben: true },
    { schluessel: 'kunde', titel: t('Kunde', 'Customer'), wert: a => a.kunde, zelle: a => a.kunde },
    { schluessel: 'ort', titel: t('Ort', 'Location'), kuerzen: true, wert: a => a.ort, zelle: a => a.ort },
    {
      schluessel: 'intervall',
      titel: t('Intervall', 'Interval'),
      ausrichtung: 'rechts',
      breite: '7rem',
      wert: a => a.intervall,
      zelle: a => h('span', { style: MONO }, t(`${a.intervall} Tage`, `${a.intervall} days`)),
    },
    {
      schluessel: 'faellig',
      titel: t('Fällig', 'Due'),
      breite: '11rem',
      wert: a => a.faellig,
      zelle: a =>
        a.faellig <= 7
          ? h(Badge, { variant: a.faellig < 0 ? 'destructive' : 'outline' }, lage(a.faellig))
          : h('span', { style: MONO }, lage(a.faellig)),
    },
    {
      schluessel: 'aktion',
      titel: t('Aktion', 'Action'),
      breite: '7.5rem',
      zelle: a =>
        a.faellig <= 7 ? h(Knopf, { onKlick: () => erledigt(a.id) }, t('Erledigt', 'Done')) : null,
    },
  ];

  return h(
    'div',
    { style: SEITE },
    h(Kopf, {
      titel: t('Wartungsplan', 'Maintenance plan'),
      beschreibung: unterzeile(
        t('Welche Anlage wann dran ist, fällige zuerst.', 'Which machine is due when, due ones first.'),
        fassung
      ),
    }),
    h(
      Kennzahlen,
      null,
      h(Kennzahl, {
        beschriftung: t('Diese Woche fällig', 'Due this week'),
        wert: String(faellig.length),
        fussnote: t(`davon ${ueberfaellig.length} überfällig`, `${ueberfaellig.length} of them overdue`),
      }),
      h(Kennzahl, {
        beschriftung: t('Erledigt im Monat', 'Done this month'),
        wert: String(erledigtZahl),
        fussnote: t('Wartungen', 'services'),
        verlauf: [6, 9, 8, 12, 10, erledigtZahl],
      })
    ),
    h(Datenliste, {
      daten: sortiert,
      spalten,
      kennung: a => String(a.id),
      beschriftung: t('Anlagen, fällige zuerst', 'Machines, due ones first'),
    })
  );
}

rendern(h(App), document.getElementById('app'));
