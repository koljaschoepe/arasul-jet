/**
 * Urlaubsanträge (J54, M7): beantragen, genehmigen, sehen, wer wann fehlt.
 * Angemeldet ist die Betriebsleiterin; sie genehmigt. Resturlaub je Person
 * aus der Firma (`firma.ts`) abzüglich der genehmigten Tage.
 */
import { Undo2 } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import { ABTEILUNGEN, PERSONEN, person, name } from '../firma';
import { starten, Mono, type AppDef } from './fachapp';
import { datum, datumKurz, heuteIso, kalenderwoche, tagAus, t, tageBis, tx } from './gemeinsam';

const ARTEN: [string, string][] = [
  ['urlaub', t('Urlaub', 'Leave')],
  ['gleitzeit', t('Gleitzeit', 'Flexitime')],
  ['sonder', t('Sonderurlaub', 'Special leave')],
];
const artText = (k: unknown) => ARTEN.find(([x]) => x === k)?.[1] ?? String(k);
const abteilung = (e: Eintrag) => {
  const a = ABTEILUNGEN.find(x => x.id === person(Number(e.felder.person)).abteilung);
  return a ? tx(a.name) : '';
};
const tageText = (n: number) => (n === 1 ? t('1 Tag', '1 day') : t(`${n} Tage`, `${n} days`));
const zeitraum = (e: Eintrag) => `${datumKurz(String(e.felder.von))} – ${datum(e.felder.bis)}`;

/** Arbeitstage zwischen zwei Tagen, Wochenenden ausgenommen. */
function arbeitstage(von: string, bis: string): number {
  const a = new Date(`${von}T12:00:00`);
  const b = new Date(`${bis}T12:00:00`);
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n += 1;
  }
  return n;
}

/** Der Montag in `wochen` Wochen, plus `tage` Tage, als `JJJJ-MM-TT`. */
function montagIn(wochen: number, tage = 0): string {
  const d = tagAus(heuteIso());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + wochen * 7 + tage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Arbeitstage der Abwesenheit je Woche, über die ganze Dauer verteilt: wer
 * Montag bis Mittwoch der Folgewoche fehlt, zählt in beiden Wochen.
 */
function tageJeWoche(liste: Eintrag[], zurueck: number, voraus: number) {
  const montag = tagAus(heuteIso());
  montag.setDate(montag.getDate() - ((montag.getDay() + 6) % 7));
  return Array.from({ length: zurueck + voraus + 1 }, (_, i) => {
    const beginn = new Date(montag);
    beginn.setDate(beginn.getDate() + (i - zurueck) * 7);
    const ende = new Date(beginn);
    ende.setDate(ende.getDate() + 4);
    const zeile = {
      x: i,
      name: `${t('KW', 'Wk')} ${kalenderwoche(beginn)}`,
      genehmigt: 0,
      beantragt: 0,
    };
    for (const e of liste) {
      if (e.stand !== 'genehmigt' && e.stand !== 'beantragt') continue;
      const von = Math.max(beginn.getTime(), tagAus(String(e.felder.von)).getTime());
      const bis = Math.min(ende.getTime(), tagAus(String(e.felder.bis)).getTime());
      for (let d = new Date(von); d.getTime() <= bis; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) zeile[e.stand] += 1;
      }
    }
    return zeile;
  });
}

const def: AppDef = {
  id: 'urlaub',
  titel: t('Urlaubsanträge', 'Leave requests'),
  einzahl: t('Antrag', 'Request'),
  neuText: t('Urlaub beantragen', 'Request leave'),
  satz: () =>
    t(
      'Beantragen, genehmigen und sehen, wer wann fehlt. Genehmigt wird von der Betriebsleitung.',
      'Request, approve and see who is away when. Operations management approves.'
    ),
  startStand: 'beantragt',
  titelVon: e => `${name(Number(e.felder.person))} · ${artText(e.felder.art)}`,
  nebenVon: e => `${zeitraum(e)} · ${tageText(Number(e.felder.tage))} · ${abteilung(e)}`,
  felder: () => [
    {
      key: 'person',
      titel: t('Person', 'Person'),
      art: 'auswahl',
      pflicht: true,
      optionen: PERSONEN.map(p => [String(p.id), `${p.vorname} ${p.nachname}`]),
      anzeigen: w => `${name(Number(w))}, ${tx(person(Number(w)).aufgabe)}`,
    },
    {
      key: 'art',
      titel: t('Art', 'Type'),
      art: 'auswahl',
      pflicht: true,
      optionen: ARTEN,
      anzeigen: w => artText(w),
    },
    { key: 'von', titel: t('Von', 'From'), art: 'datum', pflicht: true, anzeigen: w => datum(w) },
    { key: 'bis', titel: t('Bis', 'To'), art: 'datum', pflicht: true, anzeigen: w => datum(w) },
    {
      key: 'tage',
      titel: t('Arbeitstage', 'Working days'),
      art: 'zahl',
      nurAnzeige: true,
      anzeigen: w => tageText(Number(w)),
    },
    {
      key: 'vertretung',
      titel: t('Vertretung', 'Cover'),
      art: 'auswahl',
      pflicht: true,
      optionen: PERSONEN.map(p => [String(p.id), `${p.vorname} ${p.nachname}`]),
      anzeigen: w => name(Number(w)),
    },
    { key: 'notiz', titel: t('Bemerkung', 'Note'), art: 'textlang' },
  ],
  vorbelegung: () => ({
    person: 16,
    art: 'urlaub',
    von: montagIn(3),
    bis: montagIn(3, 4),
    vertretung: 8,
  }),
  pruefen: f => {
    const aus: Record<string, string> = {};
    if (typeof f.von === 'string' && typeof f.bis === 'string') {
      if (f.bis < f.von) aus.bis = t('Liegt vor dem ersten Tag.', 'Is before the first day.');
      else if (arbeitstage(f.von, f.bis) === 0)
        aus.bis = t(
          'Der Zeitraum enthält keinen Arbeitstag.',
          'The period contains no working day.'
        );
      else {
        const p = person(Number(f.person));
        const tage = arbeitstage(f.von, f.bis);
        if (f.art === 'urlaub' && tage > p.urlaub)
          aus.bis = t(
            `${p.vorname} hat noch ${p.urlaub} Tage Resturlaub.`,
            `${p.vorname} has ${p.urlaub} days of leave left.`
          );
      }
      // Die Arbeitstage rechnet das Formular selbst.
      f.tage = f.bis >= f.von ? arbeitstage(f.von, f.bis) : 0;
    }
    if (f.person !== null && f.person === f.vertretung)
      aus.vertretung = t('Die Vertretung ist eine andere Person.', 'Cover must be another person.');
    return aus;
  },
  spalten: () => [
    {
      schluessel: 'nr',
      titel: t('Nummer', 'Number'),
      breite: '7rem',
      wert: e => e.nr,
      zelle: e => e.nr,
      inKarte: false,
    },
    {
      schluessel: 'person',
      titel: t('Person', 'Person'),
      breite: '22%',
      kuerzen: true,
      wert: e => name(Number(e.felder.person)),
      zelle: e => name(Number(e.felder.person)),
    },
    {
      schluessel: 'abteilung',
      titel: t('Abteilung', 'Department'),
      kuerzen: true,
      wert: e => abteilung(e),
      zelle: e => abteilung(e),
      inKarte: false,
    },
    {
      schluessel: 'art',
      titel: t('Art', 'Type'),
      breite: '8rem',
      wert: e => artText(e.felder.art),
      zelle: e => artText(e.felder.art),
    },
    {
      schluessel: 'von',
      titel: t('Zeitraum', 'Period'),
      breite: '12rem',
      wert: e => String(e.felder.von),
      zelle: e => <Mono>{zeitraum(e)}</Mono>,
    },
    {
      schluessel: 'tage',
      titel: t('Tage', 'Days'),
      breite: '4.5rem',
      ausrichtung: 'rechts',
      wert: e => Number(e.felder.tage),
      zelle: e => <Mono>{String(e.felder.tage)}</Mono>,
    },
  ],
  kennzahlen: liste => {
    const wochen = tageJeWoche(liste, 5, 0).map(w => w.genehmigt);
    const weg = liste.filter(
      e => e.stand === 'genehmigt' && tageBis(e.felder.von) <= 0 && tageBis(e.felder.bis) >= 0
    );
    // Wer in den nächsten 14 Tagen fehlt, heute mitgezählt.
    const bald = liste.filter(
      e => e.stand === 'genehmigt' && tageBis(e.felder.von) <= 14 && tageBis(e.felder.bis) >= 0
    );
    const rest = PERSONEN.reduce((s, p) => s + p.urlaub, 0) / PERSONEN.length;
    return [
      {
        beschriftung: t('Heute abwesend', 'Away today'),
        wert: String(weg.length),
        fussnote: weg.length
          ? weg.map(e => person(Number(e.felder.person)).vorname).join(', ')
          : t('alle da', 'everyone in'),
      },
      {
        beschriftung: t('Zu genehmigen', 'To approve'),
        wert: String(liste.filter(e => e.stand === 'beantragt').length),
        fussnote: t('bei Ihnen', 'with you'),
      },
      {
        beschriftung: t('Nächste 14 Tage', 'Next 14 days'),
        wert: String(bald.length),
        fussnote: t('genehmigte Abwesenheiten', 'approved absences'),
        verlauf: wochen,
      },
      {
        beschriftung: t('Resturlaub', 'Leave left'),
        wert: String(Math.round(rest)),
        einheit: t('Tage', 'days'),
        fussnote: t('im Schnitt je Person', 'average per person'),
      },
    ];
  },
  diagramm: liste => ({
    titel: t('Abwesenheit je Woche', 'Absence per week'),
    satz: t(
      'Arbeitstage genehmigt und beantragt, sechs Wochen zurück und sechs voraus.',
      'Working days approved and requested, six weeks back and six ahead.'
    ),
    art: 'balken',
    data: tageJeWoche(liste, 5, 6),
    series: [
      { key: 'genehmigt', name: t('Genehmigt', 'Approved'), unit: t(' Tage', ' days') },
      { key: 'beantragt', name: t('Beantragt', 'Requested'), unit: t(' Tage', ' days') },
    ],
  }),
  naechstes: {
    titel: t('Wer demnächst fehlt', 'Who is away soon'),
    leer: t('In den nächsten Wochen fehlt niemand.', 'Nobody is away in the coming weeks.'),
    liste: liste =>
      liste
        .filter(
          e => (e.stand === 'genehmigt' && tageBis(e.felder.bis) >= 0) || e.stand === 'beantragt'
        )
        .sort(
          (a, b) =>
            (a.stand === 'beantragt' ? -1 : 0) - (b.stand === 'beantragt' ? -1 : 0) ||
            String(a.felder.von).localeCompare(String(b.felder.von))
        )
        .map(e => ({
          e,
          satz:
            e.stand === 'beantragt'
              ? t(
                  `beantragt, ${zeitraum(e)} · wartet auf Sie`,
                  `requested, ${zeitraum(e)} · waiting for you`
                )
              : tageBis(e.felder.von) <= 0
                ? t(
                    `heute abwesend, bis ${datum(e.felder.bis)} · Vertretung ${name(Number(e.felder.vertretung))}`,
                    `away today, until ${datum(e.felder.bis)} · cover ${name(Number(e.felder.vertretung))}`
                  )
                : `${zeitraum(e)} · ${tageText(Number(e.felder.tage))}`,
          freigabe: e.stand === 'beantragt',
        })),
  },
  schritte: e =>
    e.stand === 'abgelehnt'
      ? [{ nach: 'beantragt', text: t('Neu beantragen', 'Request again'), symbol: Undo2 }]
      : [],
  csv: e => ({
    [t('Nummer', 'Number')]: e.nr,
    [t('Person', 'Person')]: name(Number(e.felder.person)),
    [t('Abteilung', 'Department')]: abteilung(e),
    [t('Art', 'Type')]: artText(e.felder.art),
    [t('Von', 'From')]: String(e.felder.von ?? ''),
    [t('Bis', 'To')]: String(e.felder.bis ?? ''),
    [t('Arbeitstage', 'Working days')]: String(e.felder.tage ?? ''),
    [t('Vertretung', 'Cover')]: name(Number(e.felder.vertretung)),
    [t('Stand', 'Status')]: e.stand,
  }),
};

starten(def);
