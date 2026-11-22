/**
 * Wartungsplan (J54, M7): welche Maschine wann gewartet wird, was fällig und
 * was überfällig ist. Prüfungen nach Vorschrift macht ein Dienstleister,
 * den Rest die eigene Instandhaltung.
 */
import { CalendarClock, Check, Play } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import { LIEFERANTEN, MASCHINEN, PERSONEN, lieferant, maschine, name } from '../firma';
import { starten, Mono, type AppDef } from './fachapp';
import { datum, isoIn, proMonat, relativTag, t, tageBis, tx } from './gemeinsam';

const ARTEN: [string, string][] = [
  ['wartung', t('Wartung', 'Service')],
  ['inspektion', t('Inspektion', 'Inspection')],
  ['uvv', t('UVV-Prüfung', 'Safety inspection')],
  ['kalibrierung', t('Kalibrierung', 'Calibration')],
  ['reparatur', t('Reparatur', 'Repair')],
];
const artText = (k: unknown) => ARTEN.find(([x]) => x === k)?.[1] ?? String(k);
const ueberfaellig = (e: Eintrag) => e.stand !== 'erledigt' && tageBis(e.felder.faellig) < 0;
const maschinenText = (e: Eintrag) => {
  const m = maschine(String(e.felder.maschine));
  return `${m.id} ${tx(m.name)}`;
};

const def: AppDef = {
  id: 'wartungsplan',
  titel: t('Wartungsplan', 'Maintenance plan'),
  einzahl: t('Wartung', 'Maintenance task'),
  neuText: t('Wartung eintragen', 'Add maintenance'),
  satz: () =>
    t(
      `${MASCHINEN.length} Maschinen und Anlagen in drei Hallen. Instandhaltung: Ralf Gerber.`,
      `${MASCHINEN.length} machines and installations in three halls. Maintenance: Ralf Gerber.`
    ),
  startStand: 'geplant',
  // Offenes nach Fälligkeit zuerst, Erledigtes danach, das jüngste oben.
  ordnen: (a, b) => {
    const offenA = a.stand !== 'erledigt';
    const offenB = b.stand !== 'erledigt';
    if (offenA !== offenB) return offenA ? -1 : 1;
    return offenA
      ? String(a.felder.faellig).localeCompare(String(b.felder.faellig))
      : String(b.felder.erledigt_am).localeCompare(String(a.felder.erledigt_am));
  },
  titelVon: e => tx(e.felder.aufgabe) || artText(e.felder.art),
  nebenVon: e => `${maschinenText(e)} · ${t('fällig', 'due')} ${datum(e.felder.faellig)}`,
  felder: () => [
    {
      key: 'maschine',
      titel: t('Maschine', 'Machine'),
      art: 'auswahl',
      pflicht: true,
      optionen: MASCHINEN.map(m => [m.id, `${m.id} ${tx(m.name)}`]),
      anzeigen: w => {
        const m = maschine(String(w));
        return `${m.id} · ${tx(m.name)} · ${tx(m.ort)}, ${t('Baujahr', 'built')} ${m.baujahr}`;
      },
    },
    {
      key: 'art',
      titel: t('Art', 'Type'),
      art: 'auswahl',
      pflicht: true,
      optionen: ARTEN,
      anzeigen: w => artText(w),
    },
    {
      key: 'aufgabe',
      titel: t('Aufgabe', 'Task'),
      art: 'text',
      pflicht: true,
      hinweis: t('Was zu tun ist, in einem Satz.', 'What to do, in one sentence.'),
    },
    {
      key: 'faellig',
      titel: t('Fällig am', 'Due on'),
      art: 'datum',
      pflicht: true,
      anzeigen: w => `${datum(w)} (${relativTag(w)})`,
    },
    {
      key: 'intervall',
      titel: t('Intervall in Monaten', 'Interval in months'),
      art: 'zahl',
      min: 0,
      hinweis: t('0 für einmalig.', '0 for one-off.'),
      anzeigen: w =>
        Number(w) ? t(`alle ${w} Monate`, `every ${w} months`) : t('einmalig', 'one-off'),
    },
    {
      key: 'zustaendig',
      titel: t('Zuständig', 'Responsible'),
      art: 'auswahl',
      pflicht: true,
      optionen: PERSONEN.filter(p => ['ih', 'laser', 'schweiss'].includes(p.abteilung)).map(p => [
        String(p.id),
        `${p.vorname} ${p.nachname}`,
      ]),
      anzeigen: w => name(Number(w)),
    },
    {
      key: 'extern',
      titel: t('Dienstleister', 'Service provider'),
      art: 'auswahl',
      optionen: LIEFERANTEN.filter(l => [12, 14, 15, 13].includes(l.id)).map(l => [
        String(l.id),
        l.name,
      ]),
      anzeigen: w => lieferant(Number(w)).name,
    },
    {
      key: 'dauer',
      titel: t('Dauer in Stunden', 'Duration in hours'),
      art: 'zahl',
      min: 0,
      anzeigen: w => `${w} h`,
    },
    {
      key: 'erledigt_am',
      titel: t('Erledigt am', 'Done on'),
      art: 'datum',
      nurAnzeige: true,
      anzeigen: w => datum(w),
    },
    { key: 'notiz', titel: t('Bemerkung', 'Note'), art: 'textlang' },
  ],
  vorbelegung: () => ({
    faellig: isoIn(14),
    zustaendig: 12,
    intervall: 6,
    dauer: 2,
    art: 'wartung',
  }),
  spalten: () => [
    {
      schluessel: 'nr',
      titel: t('Nummer', 'Number'),
      breite: '7rem',
      wert: e => e.nr,
      zelle: e => e.nr,
    },
    {
      schluessel: 'maschine',
      titel: t('Maschine', 'Machine'),
      breite: '24%',
      kuerzen: true,
      wert: e => maschinenText(e),
      zelle: e => maschinenText(e),
    },
    {
      schluessel: 'aufgabe',
      titel: t('Aufgabe', 'Task'),
      kuerzen: true,
      wert: e => tx(e.felder.aufgabe),
      zelle: e => tx(e.felder.aufgabe),
    },
    {
      schluessel: 'art',
      titel: t('Art', 'Type'),
      breite: '8rem',
      wert: e => artText(e.felder.art),
      zelle: e => artText(e.felder.art),
      inKarte: false,
    },
    {
      schluessel: 'faellig',
      titel: t('Fällig', 'Due'),
      breite: '7.5rem',
      wert: e => String(e.felder.faellig),
      zelle: e => (
        <span style={ueberfaellig(e) ? { color: 'var(--destructive)' } : undefined}>
          <Mono>{datum(e.felder.faellig)}</Mono>
        </span>
      ),
    },
  ],
  kennzahlen: liste => {
    const monate = proMonat(
      liste,
      e => (e.felder.erledigt_am ? String(e.felder.erledigt_am) : null),
      6,
      { n: () => 1, h: e => Number(e.felder.dauer) || 0 }
    );
    const bald = liste.filter(
      e =>
        e.stand !== 'erledigt' && tageBis(e.felder.faellig) >= 0 && tageBis(e.felder.faellig) <= 7
    );
    const ueber = liste.filter(ueberfaellig);
    const erledigt = liste.filter(e => e.stand === 'erledigt');
    const puenktlich = erledigt.filter(
      e => String(e.felder.erledigt_am) <= String(e.felder.faellig)
    );
    return [
      {
        beschriftung: t('Fällig in 7 Tagen', 'Due in 7 days'),
        wert: String(bald.length),
        fussnote: t(
          `${liste.filter(e => e.stand === 'in_arbeit').length} in Arbeit`,
          `${liste.filter(e => e.stand === 'in_arbeit').length} in progress`
        ),
      },
      {
        beschriftung: t('Überfällig', 'Overdue'),
        wert: String(ueber.length),
        fussnote: ueber.length
          ? t('bitte einplanen', 'please schedule')
          : t('nichts überfällig', 'nothing overdue'),
      },
      {
        beschriftung: t('Erledigt diesen Monat', 'Done this month'),
        wert: String(monate[monate.length - 1]!.n),
        fussnote: t(
          `${monate[monate.length - 1]!.h} Stunden`,
          `${monate[monate.length - 1]!.h} hours`
        ),
        verlauf: monate.map(m => Number(m.n)),
      },
      {
        beschriftung: t('Termintreue', 'On schedule'),
        wert: String(
          erledigt.length ? Math.round((puenktlich.length / erledigt.length) * 100) : 100
        ),
        einheit: '%',
        fussnote: t('bis zum Fälligkeitstag erledigt', 'done by the due date'),
        verlauf: monate.map(m => Number(m.h)),
      },
    ];
  },
  diagramm: liste => ({
    titel: t('Wartungsstunden je Monat', 'Maintenance hours per month'),
    satz: t(
      'Erledigt in den letzten sechs Monaten, eigene Leute und Dienstleister.',
      'Done in the last six months, own staff and service providers.'
    ),
    art: 'balken',
    data: proMonat(liste, e => (e.felder.erledigt_am ? String(e.felder.erledigt_am) : null), 6, {
      eigen: e => (e.felder.extern ? 0 : Number(e.felder.dauer) || 0),
      extern: e => (e.felder.extern ? Number(e.felder.dauer) || 0 : 0),
    }),
    series: [
      { key: 'eigen', name: t('Instandhaltung', 'Own staff'), unit: ' h' },
      { key: 'extern', name: t('Dienstleister', 'Service providers'), unit: ' h' },
    ],
  }),
  naechstes: {
    titel: t('Als Nächstes fällig', 'Due next'),
    leer: t('In den nächsten Wochen ist nichts fällig.', 'Nothing is due in the coming weeks.'),
    liste: liste =>
      liste
        .filter(e => e.stand !== 'erledigt')
        .sort((a, b) => String(a.felder.faellig).localeCompare(String(b.felder.faellig)))
        .map(e => ({
          e,
          satz: `${maschinenText(e)} · ${ueberfaellig(e) ? t(`überfällig seit ${-tageBis(e.felder.faellig)} Tagen`, `overdue by ${-tageBis(e.felder.faellig)} days`) : relativTag(e.felder.faellig)}`,
          wichtig: ueberfaellig(e),
        })),
  },
  schritte: e => {
    switch (e.stand) {
      case 'geplant':
        return [
          { nach: 'in_arbeit', text: t('Beginnen', 'Start'), symbol: Play, haupt: true },
          { nach: 'erledigt', text: t('Erledigt', 'Done'), symbol: Check },
        ];
      case 'in_arbeit':
        return [{ nach: 'erledigt', text: t('Erledigt', 'Done'), symbol: Check, haupt: true }];
      case 'erledigt':
        return [
          { nach: 'geplant', text: t('Wieder einplanen', 'Reschedule'), symbol: CalendarClock },
        ];
      default:
        return [];
    }
  },
  csv: e => ({
    [t('Nummer', 'Number')]: e.nr,
    [t('Maschine', 'Machine')]: maschinenText(e),
    [t('Art', 'Type')]: artText(e.felder.art),
    [t('Aufgabe', 'Task')]: tx(e.felder.aufgabe),
    [t('Fällig', 'Due')]: String(e.felder.faellig ?? ''),
    [t('Erledigt', 'Done')]: String(e.felder.erledigt_am ?? ''),
    [t('Zuständig', 'Responsible')]: name(Number(e.felder.zustaendig)),
    [t('Dienstleister', 'Provider')]: e.felder.extern
      ? lieferant(Number(e.felder.extern)).name
      : '',
    [t('Stunden', 'Hours')]: String(e.felder.dauer ?? ''),
    [t('Stand', 'Status')]: e.stand,
  }),
};

starten(def);
