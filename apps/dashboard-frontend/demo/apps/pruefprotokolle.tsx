/**
 * Prüfprotokolle (J54, M7): Prüfungen je Auftrag und Bauteil nach EN 1090,
 * mit Ergebnis und Messwert; die Betriebsleitung gibt frei oder schickt in
 * die Nacharbeit. Ab Fassung 1.9.0 (in Test) hat Nacharbeit eine Frist.
 */
import { RotateCcw, ShieldCheck, Wrench } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import { AUFTRAEGE, PERSONEN, auftrag, kunde, name } from '../firma';
import { starten, Mono, StammLink, type AppDef, type Ctx } from './fachapp';
import {
  datum,
  imZeitraum,
  isoIn,
  mindestens,
  proWoche,
  proMonat,
  prozent,
  stammOeffnen,
  t,
  tx,
} from './gemeinsam';

const PRUEFARTEN: [string, string][] = [
  ['sicht', t('Sichtprüfung Schweißnähte', 'Visual weld inspection')],
  ['mass', t('Maßprüfung nach Zeichnung', 'Dimensional check to drawing')],
  ['schicht', t('Schichtdicke Beschichtung', 'Coating thickness')],
  ['abnahme', t('Abnahme vor Ort', 'On-site acceptance')],
];
const ERGEBNISSE: [string, string][] = [
  ['io', t('in Ordnung', 'passed')],
  ['auflage', t('mit Auflage', 'passed with condition')],
  ['nio', t('nicht in Ordnung', 'failed')],
];
const artText = (k: unknown) => PRUEFARTEN.find(([x]) => x === k)?.[1] ?? String(k);
const ergebnisText = (k: unknown) => ERGEBNISSE.find(([x]) => x === k)?.[1] ?? t('offen', 'open');
const mitFrist = (ctx: Ctx) => mindestens(ctx.fassung, '1.9.0');
const auftragText = (e: Eintrag) => {
  const a = auftrag(String(e.felder.auftrag));
  return a ? `${a.nr} · ${kunde(a.kunde).name}` : String(e.felder.auftrag ?? '');
};

const def: AppDef = {
  id: 'pruefprotokolle',
  titel: t('Prüfprotokolle', 'Inspection reports'),
  einzahl: t('Prüfprotokoll', 'Inspection report'),
  neuText: t('Prüfung erfassen', 'Record inspection'),
  satz: () =>
    t(
      'Prüfungen je Auftrag und Bauteil nach EN 1090, Ausführungsklasse EXC2. Schweißaufsicht: Elena Fischer.',
      'Inspections per order and part to EN 1090, execution class EXC2. Welding supervisor: Elena Fischer.'
    ),
  startStand: 'offen',
  standBeimAnlegen: f => (f.ergebnis ? 'freigabe' : 'offen'),
  titelVon: e => tx(e.felder.bauteil),
  nebenVon: e => `${auftragText(e)} · ${artText(e.felder.pruefart)}`,
  felder: ctx => [
    {
      key: 'auftrag',
      titel: t('Auftrag', 'Order'),
      art: 'auswahl',
      pflicht: true,
      optionen: AUFTRAEGE.map(a => [a.nr, `${a.nr} ${kunde(a.kunde).name}`]),
      anzeigen: w => {
        const a = auftrag(String(w));
        return a ? (
          <StammLink art="auftrag" id={a.nr}>
            {a.nr} · {kunde(a.kunde).name}, {tx(a.gegenstand)}
          </StammLink>
        ) : (
          String(w)
        );
      },
    },
    {
      key: 'bauteil',
      titel: t('Bauteil', 'Part'),
      art: 'text',
      pflicht: true,
      hinweis: t('Etwa „Treppenwange links".', 'E.g. “Left stair stringer”.'),
    },
    {
      key: 'naht',
      titel: t('Naht', 'Weld'),
      art: 'text',
      hinweis: t(
        'Nummer der Naht laut Zeichnung, etwa „N4".',
        'Weld number on the drawing, e.g. “N4”.'
      ),
      anzeigen: w => <Mono>{String(w)}</Mono>,
    },
    {
      key: 'schweisser',
      titel: t('Schweißer', 'Welder'),
      art: 'auswahl',
      optionen: PERSONEN.filter(p => p.abteilung === 'schweiss' && p.id !== 14).map(p => [
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
      key: 'wps',
      titel: t('Schweißanweisung (WPS)', 'Welding procedure (WPS)'),
      art: 'text',
      anzeigen: w => <Mono>{String(w)}</Mono>,
    },
    {
      key: 'bewertungsgruppe',
      titel: t('Bewertungsgruppe', 'Quality level'),
      art: 'auswahl',
      optionen: [
        ['B', t('B nach EN ISO 5817', 'B to EN ISO 5817')],
        ['C', t('C nach EN ISO 5817', 'C to EN ISO 5817')],
        ['D', t('D nach EN ISO 5817', 'D to EN ISO 5817')],
      ],
    },
    {
      key: 'pruefart',
      titel: t('Prüfung', 'Inspection'),
      art: 'auswahl',
      pflicht: true,
      optionen: PRUEFARTEN,
      anzeigen: w => artText(w),
    },
    {
      key: 'pruefer',
      titel: t('Prüfer', 'Inspector'),
      art: 'auswahl',
      pflicht: true,
      optionen: PERSONEN.filter(p => ['qs', 'schweiss'].includes(p.abteilung) && p.id !== 14).map(
        p => [String(p.id), `${p.vorname} ${p.nachname}`]
      ),
      anzeigen: w => (
        <StammLink art="person" id={Number(w)}>
          {name(Number(w))}
        </StammLink>
      ),
    },
    {
      key: 'datum',
      titel: t('Datum', 'Date'),
      art: 'datum',
      pflicht: true,
      anzeigen: w => datum(w),
    },
    {
      key: 'ergebnis',
      titel: t('Ergebnis', 'Result'),
      art: 'auswahl',
      optionen: ERGEBNISSE,
      hinweis: t(
        'Mit Ergebnis geht das Protokoll zur Freigabe.',
        'With a result the report goes for approval.'
      ),
      anzeigen: w => ergebnisText(w),
    },
    {
      key: 'messwert',
      titel: t('Messwert', 'Measurement'),
      art: 'zahl',
      hinweis: t(
        'Schichtdicke in µm oder größte Maßabweichung in mm.',
        'Coating thickness in µm or largest deviation in mm.'
      ),
      anzeigen: (w, e) => <Mono>{`${w} ${e.felder.pruefart === 'schicht' ? 'µm' : 'mm'}`}</Mono>,
    },
    ...(mitFrist(ctx)
      ? [
          {
            key: 'frist',
            titel: t('Nacharbeit bis', 'Rework due'),
            art: 'datum' as const,
            hinweis: t('Neu in 1.9.0.', 'New in 1.9.0.'),
            anzeigen: (w: unknown) => datum(w as string),
          },
          {
            key: 'nacharbeit_von',
            titel: t('Nacharbeit durch', 'Rework by'),
            art: 'auswahl' as const,
            optionen: PERSONEN.filter(p => p.abteilung === 'schweiss').map(
              p => [String(p.id), `${p.vorname} ${p.nachname}`] as [string, string]
            ),
            anzeigen: (w: unknown) => name(Number(w)),
          },
        ]
      : []),
    { key: 'notiz', titel: t('Befund', 'Finding'), art: 'textlang' },
  ],
  vorbelegung: () => ({
    datum: isoIn(0),
    pruefer: 11,
    pruefart: 'sicht',
    schweisser: 16,
    bewertungsgruppe: 'C',
    wps: 'WPS-135-03',
  }),
  pruefen: f => {
    const aus: Record<string, string> = {};
    if (f.ergebnis === 'nio' && !f.notiz)
      aus.notiz = t(
        'Bei „nicht in Ordnung" bitte den Befund beschreiben.',
        'Please describe the finding for “failed”.'
      );
    if (
      f.pruefart === 'schicht' &&
      typeof f.messwert === 'number' &&
      (f.messwert < 20 || f.messwert > 400)
    ) {
      aus.messwert = t(
        'Schichtdicke zwischen 20 und 400 µm.',
        'Coating thickness between 20 and 400 µm.'
      );
    }
    return aus;
  },
  spalten: () => [
    {
      schluessel: 'nr',
      titel: t('Nummer', 'Number'),
      breite: '7rem',
      wert: e => e.nr,
      zelle: e => e.nr,
    },
    {
      schluessel: 'auftrag',
      titel: t('Auftrag', 'Order'),
      breite: '26%',
      kuerzen: true,
      wert: e => auftragText(e),
      zelle: e => auftragText(e),
    },
    {
      schluessel: 'bauteil',
      titel: t('Bauteil', 'Part'),
      kuerzen: true,
      wert: e => tx(e.felder.bauteil),
      zelle: e => tx(e.felder.bauteil),
    },
    {
      schluessel: 'pruefart',
      titel: t('Prüfung', 'Inspection'),
      breite: '15rem',
      kuerzen: true,
      wert: e => artText(e.felder.pruefart),
      zelle: e => artText(e.felder.pruefart),
      inKarte: false,
    },
    {
      schluessel: 'ergebnis',
      titel: t('Ergebnis', 'Result'),
      breite: '8rem',
      wert: e => String(e.felder.ergebnis ?? ''),
      zelle: e => (
        <span style={e.felder.ergebnis === 'nio' ? { color: 'var(--destructive)' } : undefined}>
          {e.felder.ergebnis ? ergebnisText(e.felder.ergebnis) : '–'}
        </span>
      ),
    },
    {
      schluessel: 'datum',
      titel: t('Datum', 'Date'),
      breite: '6.5rem',
      wert: e => String(e.felder.datum),
      zelle: e => <Mono>{datum(e.felder.datum)}</Mono>,
      inKarte: false,
    },
  ],
  kennzahlen: liste => {
    const monate = proMonat(liste, e => String(e.felder.datum), 6, {
      n: () => 1,
      nio: e => (e.felder.ergebnis === 'nio' ? 1 : 0),
    });
    const geprueft = liste.filter(e => e.felder.ergebnis);
    const nio = geprueft.filter(e => e.felder.ergebnis === 'nio');
    return [
      {
        beschriftung: t('Zur Freigabe', 'For approval'),
        wert: String(liste.filter(e => e.stand === 'freigabe').length),
        fussnote: t('bei Ihnen', 'with you'),
      },
      {
        beschriftung: t('Offene Prüfungen', 'Open inspections'),
        wert: String(liste.filter(e => e.stand === 'offen').length),
        fussnote: t('eingeplant, nicht geprüft', 'planned, not inspected'),
      },
      {
        beschriftung: t('Fehlerquote', 'Failure rate'),
        wert: String(geprueft.length ? Math.round((nio.length / geprueft.length) * 100) : 0),
        einheit: '%',
        fussnote: t(
          `${nio.length} von ${geprueft.length} nicht in Ordnung`,
          `${nio.length} of ${geprueft.length} failed`
        ),
        verlauf: monate.map(m =>
          Number(m.n) ? Math.round((Number(m.nio) / Number(m.n)) * 100) : 0
        ),
      },
      {
        beschriftung: t('Diesen Monat', 'This month'),
        wert: String(monate[monate.length - 1]!.n),
        fussnote: t(
          `Prüfungen, ${liste.filter(e => e.stand === 'nacharbeit').length} in Nacharbeit`,
          `inspections, ${liste.filter(e => e.stand === 'nacharbeit').length} in rework`
        ),
        verlauf: monate.map(m => Number(m.n)),
      },
    ];
  },
  diagramm: liste => ({
    titel: t('Ergebnisse je Woche', 'Results per week'),
    satz: t(
      'Geprüfte Bauteile der letzten zwölf Wochen.',
      'Parts inspected in the last twelve weeks.'
    ),
    art: 'balken',
    data: proWoche(liste, e => (e.felder.ergebnis ? String(e.felder.datum) : null), 11, 0, {
      io: e => (e.felder.ergebnis === 'io' || e.felder.ergebnis === 'auflage' ? 1 : 0),
      nio: e => (e.felder.ergebnis === 'nio' ? 1 : 0),
    }),
    series: [
      { key: 'io', name: t('In Ordnung', 'Passed') },
      { key: 'nio', name: t('Nicht in Ordnung', 'Failed') },
    ],
  }),
  naechstes: {
    titel: t('Wartet auf Sie', 'Waiting for you'),
    leer: t('Kein Protokoll wartet.', 'No report is waiting.'),
    liste: liste =>
      liste
        .filter(e => ['freigabe', 'nacharbeit', 'offen'].includes(e.stand))
        .sort(
          (a, b) =>
            ['freigabe', 'nacharbeit', 'offen'].indexOf(a.stand) -
            ['freigabe', 'nacharbeit', 'offen'].indexOf(b.stand)
        )
        .map(e => ({
          e,
          satz:
            e.stand === 'freigabe'
              ? t(
                  `zur Freigabe · ${ergebnisText(e.felder.ergebnis)} · ${auftragText(e)}`,
                  `for approval · ${ergebnisText(e.felder.ergebnis)} · ${auftragText(e)}`
                )
              : e.stand === 'nacharbeit'
                ? t(`Nacharbeit · ${auftragText(e)}`, `rework · ${auftragText(e)}`)
                : t(
                    `zu prüfen · ${name(Number(e.felder.pruefer))}`,
                    `to inspect · ${name(Number(e.felder.pruefer))}`
                  ),
          wichtig: e.stand === 'nacharbeit',
          freigabe: e.stand === 'freigabe',
        })),
  },
  schritte: e => {
    switch (e.stand) {
      case 'offen':
        return [
          {
            nach: 'freigabe',
            text: t('Geprüft, zur Freigabe', 'Inspected, for approval'),
            symbol: ShieldCheck,
            haupt: true,
          },
        ];
      case 'nacharbeit':
        return [
          {
            nach: 'offen',
            text: t('Nacharbeit erledigt, neu prüfen', 'Rework done, re-inspect'),
            symbol: Wrench,
            haupt: true,
          },
        ];
      case 'freigegeben':
        return [{ nach: 'offen', text: t('Neu prüfen', 'Re-inspect'), symbol: RotateCcw }];
      default:
        return [];
    }
  },
  auswertung: {
    rechnen: (alle, _ctx, z) => {
      const liste = alle.filter(e => imZeitraum(z, String(e.felder.datum)));
      const mit = liste.filter(e => e.felder.ergebnis);
      const io = mit.filter(e => e.felder.ergebnis === 'io');
      const auflage = mit.filter(e => e.felder.ergebnis === 'auflage');
      const nio = mit.filter(e => e.felder.ergebnis === 'nio');
      const nacharbeit = liste.filter(
        e => e.stand === 'nacharbeit' || e.verlauf.some(s => /Nacharbeit|rework/i.test(tx(s.text)))
      );
      const monate = proMonat(mit, e => String(e.felder.datum), z.monate, {
        io: e => (e.felder.ergebnis === 'io' ? 1 : 0),
        auflage: e => (e.felder.ergebnis === 'auflage' ? 1 : 0),
        nio: e => (e.felder.ergebnis === 'nio' ? 1 : 0),
      });
      const auftraege = AUFTRAEGE.map(a => {
        const l = liste.filter(e => e.felder.auftrag === a.nr);
        return { a, l, nio: l.filter(e => e.felder.ergebnis === 'nio').length };
      })
        .filter(x => x.l.length)
        .sort((a, b) => b.l.length - a.l.length);
      const pruefer = PERSONEN.map(p => ({
        p,
        l: liste.filter(e => Number(e.felder.pruefer) === p.id),
      }))
        .filter(x => x.l.length)
        .sort((a, b) => b.l.length - a.l.length);
      return {
        kennzahlen: [
          {
            beschriftung: t('Prüfungen', 'Inspections'),
            wert: String(liste.length),
            fussnote: t(
              `${liste.length - mit.length} ohne Ergebnis`,
              `${liste.length - mit.length} without result`
            ),
            verlauf: monate.map(m => Number(m.io) + Number(m.auflage) + Number(m.nio)),
          },
          {
            beschriftung: t('In Ordnung', 'Passed'),
            wert: String(prozent(io.length, mit.length)),
            einheit: '%',
            fussnote: t(`${auflage.length} mit Auflage`, `${auflage.length} with condition`),
            verlauf: monate.map(m =>
              prozent(Number(m.io), Number(m.io) + Number(m.auflage) + Number(m.nio))
            ),
          },
          {
            beschriftung: t('Nicht in Ordnung', 'Failed'),
            wert: String(nio.length),
            fussnote: t(
              `${prozent(nio.length, mit.length)} % der Prüfungen`,
              `${prozent(nio.length, mit.length)}% of inspections`
            ),
            verlauf: monate.map(m => Number(m.nio)),
          },
          {
            beschriftung: t('Nacharbeit', 'Rework'),
            wert: String(nacharbeit.length),
            fussnote: t(
              `${liste.filter(e => e.stand === 'nacharbeit').length} noch offen`,
              `${liste.filter(e => e.stand === 'nacharbeit').length} still open`
            ),
          },
        ],
        teile: [
          {
            art: 'diagramm',
            breit: true,
            monatlich: true,
            titel: t('Ergebnisse je Monat', 'Results per month'),
            d: {
              titel: t('Ergebnisse je Monat', 'Results per month'),
              satz: t(
                `Prüfungen mit Ergebnis, ${z.text}.`,
                `Inspections with a result, ${z.text}.`
              ),
              art: 'balken',
              data: monate,
              series: [
                { key: 'io', name: t('In Ordnung', 'Passed') },
                { key: 'auflage', name: t('Mit Auflage', 'With condition') },
                { key: 'nio', name: t('Nicht in Ordnung', 'Failed') },
              ],
            },
          },
          {
            art: 'tabelle',
            titel: t('Nach Prüfart', 'By inspection type'),
            kopf: [
              t('Prüfung', 'Inspection'),
              t('Anzahl', 'Count'),
              t('In Ordnung', 'Passed'),
              t('Nicht i. O.', 'Failed'),
            ],
            rechts: [1, 2, 3],
            zeilen: PRUEFARTEN.map(([k, text]) => {
              const l = mit.filter(e => e.felder.pruefart === k);
              return [
                text,
                String(liste.filter(e => e.felder.pruefart === k).length),
                `${prozent(l.filter(e => e.felder.ergebnis === 'io').length, l.length)} %`,
                String(l.filter(e => e.felder.ergebnis === 'nio').length),
              ];
            }),
          },
          {
            art: 'rangliste',
            titel: t('Nach Prüfer', 'By inspector'),
            zeilen: pruefer.map(x => ({
              name: `${x.p.vorname} ${x.p.nachname}`,
              wert: x.l.length,
              text: String(x.l.length),
              neben: tx(x.p.aufgabe),
              aufKlick: () => stammOeffnen('person', x.p.id),
            })),
          },
          {
            art: 'rangliste',
            breit: true,
            titel: t('Prüfungen je Auftrag', 'Inspections per order'),
            satz: t(
              'Ein Klick öffnet den Kunden des Auftrags.',
              'Click to open the order’s customer.'
            ),
            zeilen: auftraege.slice(0, 10).map(x => ({
              name: `${x.a.nr} ${kunde(x.a.kunde).name}`,
              wert: x.l.length,
              text: String(x.l.length),
              neben: x.nio
                ? t(
                    `${tx(x.a.gegenstand)} · ${x.nio} nicht i. O.`,
                    `${tx(x.a.gegenstand)} · ${x.nio} failed`
                  )
                : tx(x.a.gegenstand),
              aufKlick: () => stammOeffnen('kunde', x.a.kunde),
            })),
          },
        ],
      };
    },
  },
  csv: e => ({
    [t('Nummer', 'Number')]: e.nr,
    [t('Auftrag', 'Order')]: String(e.felder.auftrag ?? ''),
    [t('Kunde', 'Customer')]: auftrag(String(e.felder.auftrag))
      ? kunde(auftrag(String(e.felder.auftrag))!.kunde).name
      : '',
    [t('Bauteil', 'Part')]: tx(e.felder.bauteil),
    [t('Prüfung', 'Inspection')]: artText(e.felder.pruefart),
    [t('Prüfer', 'Inspector')]: name(Number(e.felder.pruefer)),
    [t('Datum', 'Date')]: String(e.felder.datum ?? ''),
    [t('Ergebnis', 'Result')]: e.felder.ergebnis ? ergebnisText(e.felder.ergebnis) : '',
    [t('Messwert', 'Measurement')]: String(e.felder.messwert ?? ''),
    [t('Stand', 'Status')]: e.stand,
  }),
};

starten(def);
