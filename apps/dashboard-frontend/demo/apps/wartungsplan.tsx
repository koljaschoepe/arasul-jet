/**
 * Wartungsplan (J54, M7): welche Maschine wann gewartet wird, was fällig und
 * was überfällig ist. Prüfungen nach Vorschrift macht ein Dienstleister,
 * den Rest die eigene Instandhaltung.
 */
import { CalendarClock, Check, Play } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import { LIEFERANTEN, MASCHINEN, PERSONEN, lieferant, maschine, name } from '../firma';
import { starten, Mono, StammLink, type AppDef } from './fachapp';
import {
  datum,
  imZeitraum,
  isoIn,
  proMonat,
  prozent,
  relativTag,
  stammOeffnen,
  t,
  tageBis,
  tx,
  zahl,
} from './gemeinsam';

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
        return (
          <StammLink art="maschine" id={m.id}>
            {m.id} · {tx(m.name)} · {tx(m.ort)}, {t('Baujahr', 'built')} {m.baujahr}
          </StammLink>
        );
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
      anzeigen: w => (
        <StammLink art="person" id={Number(w)}>
          {name(Number(w))}
        </StammLink>
      ),
    },
    {
      key: 'extern',
      titel: t('Dienstleister', 'Service provider'),
      art: 'auswahl',
      optionen: LIEFERANTEN.filter(l => [12, 14, 15, 13].includes(l.id)).map(l => [
        String(l.id),
        l.name,
      ]),
      anzeigen: w => (
        <StammLink art="lieferant" id={Number(w)}>
          {lieferant(Number(w)).name}
        </StammLink>
      ),
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
  kalender: {
    satz: t(
      'Fällige und erledigte Wartungen. Rot ist überfällig, ein Klick öffnet die Wartung.',
      'Due and completed maintenance. Red is overdue; click to open.'
    ),
    termine: liste =>
      liste.map(e => {
        const tag = String(e.stand === 'erledigt' ? e.felder.erledigt_am : e.felder.faellig);
        return {
          e,
          von: tag,
          bis: tag,
          // Wie auf der Startseite: die Aufgabe, nicht nur die Art.
          text: `${String(e.felder.maschine)} ${tx(e.felder.aufgabe) || artText(e.felder.art)}`,
          ton:
            e.stand === 'erledigt'
              ? ('erledigt' as const)
              : ueberfaellig(e)
                ? ('warnung' as const)
                : e.stand === 'in_arbeit'
                  ? ('offen' as const)
                  : ('fest' as const),
        };
      }),
    legende: [
      ['fest', t('Geplant', 'Planned')],
      ['offen', t('In Arbeit', 'In progress')],
      ['warnung', t('Überfällig', 'Overdue')],
      ['erledigt', t('Erledigt', 'Done')],
    ],
    tagSatz: l =>
      l.length === 1 ? t('1 Wartung', '1 task') : t(`${l.length} Wartungen`, `${l.length} tasks`),
  },
  auswertung: {
    voraus: 90,
    rechnen: (alle, _ctx, z) => {
      const liste = alle.filter(e =>
        imZeitraum(z, String(e.stand === 'erledigt' ? e.felder.erledigt_am : e.felder.faellig))
      );
      const erledigt = liste.filter(e => e.stand === 'erledigt');
      const puenktlich = erledigt.filter(
        e => String(e.felder.erledigt_am) <= String(e.felder.faellig)
      );
      const stunden = (l: Eintrag[]) => l.reduce((s, e) => s + (Number(e.felder.dauer) || 0), 0);
      const extern = erledigt.filter(e => e.felder.extern);
      const geplant = liste.filter(e => e.stand !== 'erledigt');
      const monate = proMonat(erledigt, e => String(e.felder.erledigt_am), z.monate, {
        eigen: e => (e.felder.extern ? 0 : Number(e.felder.dauer) || 0),
        extern: e => (e.felder.extern ? Number(e.felder.dauer) || 0 : 0),
      });
      const jeMaschine = MASCHINEN.map(m => {
        const l = erledigt.filter(e => e.felder.maschine === m.id);
        return { m, l, h: stunden(l) };
      })
        .filter(x => x.l.length)
        .sort((a, b) => b.h - a.h);
      const dienstleister = LIEFERANTEN.map(l => {
        const von = erledigt.filter(e => Number(e.felder.extern) === l.id);
        return { l, von, h: stunden(von) };
      })
        .filter(x => x.von.length)
        .sort((a, b) => b.h - a.h);
      return {
        kennzahlen: [
          {
            beschriftung: t('Erledigt', 'Completed'),
            wert: String(erledigt.length),
            fussnote: t(`${zahl(stunden(erledigt))} Stunden`, `${zahl(stunden(erledigt))} hours`),
            verlauf: monate.map(m => Number(m.eigen) + Number(m.extern)),
          },
          {
            beschriftung: t('Termintreue', 'On schedule'),
            wert: String(prozent(puenktlich.length, erledigt.length)),
            einheit: '%',
            fussnote: t('bis zum Fälligkeitstag', 'by the due date'),
          },
          {
            beschriftung: t('Anteil Dienstleister', 'Share of providers'),
            wert: String(prozent(stunden(extern), stunden(erledigt))),
            einheit: '%',
            fussnote: t(
              `der Stunden, ${extern.length} Einsätze`,
              `of hours, ${extern.length} jobs`
            ),
          },
          {
            beschriftung: t('Geplant', 'Planned'),
            wert: String(geplant.length),
            fussnote: t(
              `bis ${datum(z.bis)}, ${geplant.filter(ueberfaellig).length} überfällig`,
              `until ${datum(z.bis)}, ${geplant.filter(ueberfaellig).length} overdue`
            ),
          },
        ],
        teile: [
          {
            art: 'diagramm',
            breit: true,
            monatlich: true,
            titel: t('Stunden je Monat', 'Hours per month'),
            d: {
              titel: t('Stunden je Monat', 'Hours per month'),
              satz: t(
                `Erledigte Wartungen, eigene Leute und Dienstleister, ${z.text}.`,
                `Completed maintenance, own staff and providers, ${z.text}.`
              ),
              art: 'balken',
              data: monate,
              series: [
                { key: 'eigen', name: t('Instandhaltung', 'Own staff'), unit: ' h' },
                { key: 'extern', name: t('Dienstleister', 'Service providers'), unit: ' h' },
              ],
            },
          },
          {
            art: 'rangliste',
            titel: t('Stunden nach Maschine', 'Hours by machine'),
            satz: t('Ein Klick öffnet die Maschine.', 'Click to open the machine.'),
            zeilen: jeMaschine.slice(0, 8).map(x => ({
              name: `${x.m.id} ${tx(x.m.name)}`,
              wert: x.h,
              text: `${zahl(x.h)} h`,
              neben: t(
                `${x.l.length} Wartungen · ${tx(x.m.ort)}`,
                `${x.l.length} tasks · ${tx(x.m.ort)}`
              ),
              aufKlick: () => stammOeffnen('maschine', x.m.id),
            })),
          },
          {
            art: 'tabelle',
            titel: t('Nach Art', 'By type'),
            kopf: [
              t('Art', 'Type'),
              t('Anzahl', 'Count'),
              t('Stunden', 'Hours'),
              t('Pünktlich', 'On time'),
            ],
            rechts: [1, 2, 3],
            zeilen: ARTEN.map(([k, text]) => {
              const l = erledigt.filter(e => e.felder.art === k);
              return { text, l };
            })
              .filter(x => x.l.length)
              .map(x => [
                x.text,
                String(x.l.length),
                zahl(stunden(x.l)),
                `${prozent(x.l.filter(e => String(e.felder.erledigt_am) <= String(e.felder.faellig)).length, x.l.length)} %`,
              ]),
          },
          {
            art: 'rangliste',
            breit: true,
            titel: t('Dienstleister', 'Service providers'),
            satz: t(
              'Stunden je Dienstleister, mit Zahl der Einsätze.',
              'Hours per provider, with number of jobs.'
            ),
            leer: t('Kein Dienstleister im Zeitraum.', 'No provider in this period.'),
            zeilen: dienstleister.map(x => ({
              name: x.l.name,
              wert: x.h,
              text: `${zahl(x.h)} h`,
              neben: t(
                `${x.von.length} Einsätze · ${tx(x.l.was)}`,
                `${x.von.length} jobs · ${tx(x.l.was)}`
              ),
              aufKlick: () => stammOeffnen('lieferant', x.l.id),
            })),
          },
        ],
      };
    },
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
