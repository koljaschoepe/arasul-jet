/**
 * Prüfprotokolle (J54, M7): Prüfungen je Auftrag und Bauteil nach EN 1090,
 * mit Ergebnis und Messwert; die Betriebsleitung gibt frei oder schickt in
 * die Nacharbeit. Ab Fassung 1.9.0 (in Test) hat Nacharbeit eine Frist.
 */
import { RotateCcw, ShieldCheck, Wrench } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import { AUFTRAEGE, PERSONEN, auftrag, kunde, name } from '../firma';
import { starten, Mono, type AppDef, type Ctx } from './fachapp';
import { datum, isoIn, mindestens, proWoche, proMonat, t, tx } from './gemeinsam';

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
        return a ? `${a.nr} · ${kunde(a.kunde).name}, ${tx(a.gegenstand)}` : String(w);
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
      anzeigen: w => name(Number(w)),
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
  vorbelegung: () => ({ datum: isoIn(0), pruefer: 11, pruefart: 'sicht' }),
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
      breite: '12rem',
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
          wichtig: e.stand !== 'offen',
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
