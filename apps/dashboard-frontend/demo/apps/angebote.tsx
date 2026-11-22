/**
 * Angebote (J54, M7): kalkulieren, zur Freigabe geben (ab 20.000 €),
 * versenden, nachfassen. Ab Fassung 1.5.0 (in Test) kennt ein Angebot einen
 * Rabatt; das ist die Änderung, die in der Werkstatt live geschaltet wird.
 */
import { Check, CircleX, Send, ShieldCheck, Undo2 } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import { KUNDEN, PERSONEN, ansprech, kunde, name } from '../firma';
import { starten, Mono, type AppDef, type Ctx } from './fachapp';
import { datum, euro, isoIn, mindestens, proMonat, relativTag, t, tageBis, tx } from './gemeinsam';

const FREIGABE_AB = 20000;
const mitRabatt = (ctx: Ctx) => mindestens(ctx.fassung, '1.5.0');
const netto = (e: Eintrag, ctx: Ctx) =>
  Number(e.felder.betrag) * (1 - (mitRabatt(ctx) ? Number(e.felder.rabatt) || 0 : 0) / 100);
const offen = (e: Eintrag) => ['entwurf', 'freigabe', 'freigegeben', 'versendet'].includes(e.stand);

const def: AppDef = {
  id: 'angebote',
  titel: t('Angebote', 'Quotes'),
  einzahl: t('Angebot', 'Quote'),
  neuText: t('Angebot anlegen', 'New quote'),
  satz: () =>
    t(
      `Kalkulieren, versenden, nachfassen. Ab ${euro(FREIGABE_AB)} gibt die Betriebsleitung frei.`,
      `Estimate, send, follow up. From ${euro(FREIGABE_AB)} operations management approves.`
    ),
  startStand: 'entwurf',
  standBeimAnlegen: f => (Number(f.betrag) >= FREIGABE_AB ? 'freigabe' : 'entwurf'),
  titelVon: e => tx(e.felder.betreff),
  nebenVon: e => `${kunde(Number(e.felder.kunde)).name} · ${datum(e.felder.datum)}`,
  felder: ctx => [
    {
      key: 'kunde',
      titel: t('Kunde', 'Customer'),
      art: 'auswahl',
      pflicht: true,
      optionen: KUNDEN.map(k => [String(k.id), k.name]),
      anzeigen: w => `${kunde(Number(w)).name}, ${kunde(Number(w)).ort}`,
    },
    {
      key: 'betreff',
      titel: t('Betreff', 'Subject'),
      art: 'text',
      pflicht: true,
      hinweis: t(
        'Was angeboten wird, etwa „Außentreppe verzinkt, 14 Stufen".',
        'What is quoted, e.g. “External stair, galvanised, 14 steps”.'
      ),
    },
    {
      key: 'betrag',
      titel: t('Betrag netto in Euro', 'Net amount in euros'),
      art: 'zahl',
      pflicht: true,
      min: 100,
      hinweis: t(
        `Ab ${euro(FREIGABE_AB)} geht das Angebot zur Freigabe.`,
        `From ${euro(FREIGABE_AB)} the quote goes for approval.`
      ),
      anzeigen: w => <Mono>{euro(Number(w))}</Mono>,
    },
    ...(mitRabatt(ctx)
      ? [
          {
            key: 'rabatt',
            titel: t('Rabatt in Prozent', 'Discount in percent'),
            art: 'zahl' as const,
            hinweis: t(
              'Neu in 1.5.0. Stammkunden bekommen meist 3 %.',
              'New in 1.5.0. Regular customers usually get 3%.'
            ),
            anzeigen: (w: unknown) => (Number(w) ? `${w} %` : '–'),
          },
        ]
      : []),
    {
      key: 'bearbeiter',
      titel: t('Bearbeitet von', 'Prepared by'),
      art: 'auswahl',
      pflicht: true,
      optionen: PERSONEN.filter(p => ['vertrieb', 'gf'].includes(p.abteilung)).map(p => [
        String(p.id),
        `${p.vorname} ${p.nachname}`,
      ]),
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
      key: 'gueltig',
      titel: t('Gültig bis', 'Valid until'),
      art: 'datum',
      pflicht: true,
      anzeigen: w => `${datum(w)} (${relativTag(w)})`,
    },
    {
      key: 'auftrag',
      titel: t('Auftrag', 'Order'),
      art: 'text',
      nurAnzeige: true,
      anzeigen: w => <Mono>{String(w)}</Mono>,
    },
    { key: 'notiz', titel: t('Notiz', 'Note'), art: 'textlang' },
  ],
  vorbelegung: () => ({ datum: isoIn(0), gueltig: isoIn(30), bearbeiter: 3, rabatt: 0 }),
  pruefen: f => {
    const aus: Record<string, string> = {};
    if (typeof f.gueltig === 'string' && typeof f.datum === 'string' && f.gueltig < f.datum) {
      aus.gueltig = t('Liegt vor dem Datum des Angebots.', 'Is before the quote date.');
    }
    if (typeof f.rabatt === 'number' && (f.rabatt < 0 || f.rabatt > 15)) {
      aus.rabatt = t('Zwischen 0 und 15 %.', 'Between 0 and 15%.');
    }
    return aus;
  },
  spalten: ctx => [
    {
      schluessel: 'nr',
      titel: t('Nummer', 'Number'),
      breite: '7.5rem',
      wert: e => e.nr,
      zelle: e => e.nr,
    },
    {
      schluessel: 'kunde',
      titel: t('Kunde', 'Customer'),
      wert: e => kunde(Number(e.felder.kunde)).name,
      zelle: e => kunde(Number(e.felder.kunde)).name,
      kuerzen: true,
      breite: '28%',
    },
    {
      schluessel: 'betreff',
      titel: t('Betreff', 'Subject'),
      wert: e => tx(e.felder.betreff),
      zelle: e => tx(e.felder.betreff),
      kuerzen: true,
    },
    {
      schluessel: 'datum',
      titel: t('Datum', 'Date'),
      breite: '6.5rem',
      wert: e => String(e.felder.datum),
      zelle: e => <Mono>{datum(e.felder.datum)}</Mono>,
      inKarte: false,
    },
    {
      schluessel: 'betrag',
      titel: mitRabatt(ctx) ? t('Netto nach Rabatt', 'Net after discount') : t('Netto', 'Net'),
      ausrichtung: 'rechts',
      breite: '8.5rem',
      wert: e => netto(e, ctx),
      zelle: e => <Mono>{euro(netto(e, ctx))}</Mono>,
    },
  ],
  kennzahlen: (liste, ctx) => {
    const offene = liste.filter(offen);
    const monate = proMonat(liste, e => String(e.felder.datum), 6, {
      wert: e => netto(e, ctx),
      an: e => (e.stand === 'angenommen' ? 1 : 0),
      ent: e => (['angenommen', 'abgelehnt'].includes(e.stand) ? 1 : 0),
    });
    const entschieden = liste.filter(e => ['angenommen', 'abgelehnt'].includes(e.stand));
    const quote = entschieden.length
      ? Math.round(
          (entschieden.filter(e => e.stand === 'angenommen').length / entschieden.length) * 100
        )
      : 0;
    const diesen = monate[monate.length - 1]!;
    return [
      {
        beschriftung: t('Offenes Volumen', 'Open volume'),
        wert: euro(offene.reduce((s, e) => s + netto(e, ctx), 0)),
        fussnote: t(`${offene.length} Angebote offen`, `${offene.length} quotes open`),
        verlauf: monate.map(m => Number(m.wert)),
      },
      {
        beschriftung: t('Annahmequote', 'Win rate'),
        wert: String(quote),
        einheit: '%',
        fussnote: t(`${entschieden.length} entschieden`, `${entschieden.length} decided`),
        verlauf: monate.map(m =>
          Number(m.ent) ? Math.round((Number(m.an) / Number(m.ent)) * 100) : 0
        ),
      },
      {
        beschriftung: t('Diesen Monat', 'This month'),
        wert: euro(Number(diesen.wert)),
        fussnote: t('angeboten, netto', 'quoted, net'),
        verlauf: monate.map(m => Number(m.wert)),
      },
      {
        beschriftung: t('Zur Freigabe', 'For approval'),
        wert: String(liste.filter(e => e.stand === 'freigabe').length),
        fussnote: t(`ab ${euro(FREIGABE_AB)}`, `from ${euro(FREIGABE_AB)}`),
      },
    ];
  },
  diagramm: (liste, ctx) => ({
    titel: t('Angebote und Aufträge je Monat', 'Quotes and orders per month'),
    satz: t('Netto in Euro, die letzten zwölf Monate.', 'Net in euros, the last twelve months.'),
    art: 'balken',
    data: proMonat(liste, e => String(e.felder.datum), 12, {
      angeboten: e => netto(e, ctx),
      angenommen: e => (e.stand === 'angenommen' ? netto(e, ctx) : 0),
    }),
    series: [
      { key: 'angeboten', name: t('Angeboten', 'Quoted'), unit: ' €' },
      { key: 'angenommen', name: t('Angenommen', 'Accepted'), unit: ' €' },
    ],
    formatY: n => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)),
  }),
  naechstes: {
    titel: t('Nachfassen', 'Follow up'),
    leer: t('Kein Angebot läuft bald ab.', 'No quote expires soon.'),
    liste: liste =>
      liste
        .filter(e => e.stand === 'versendet' || e.stand === 'freigabe')
        .sort((a, b) => String(a.felder.gueltig).localeCompare(String(b.felder.gueltig)))
        .map(e => ({
          e,
          satz:
            e.stand === 'freigabe'
              ? t('wartet auf Ihre Freigabe', 'waiting for your approval')
              : tageBis(e.felder.gueltig) < 0
                ? t(
                    `abgelaufen ${relativTag(e.felder.gueltig)}, nachfassen`,
                    `expired ${relativTag(e.felder.gueltig)}, follow up`
                  )
                : t(
                    `gültig bis ${datum(e.felder.gueltig)}, ${kunde(Number(e.felder.kunde)).ansprechpartner} anrufen`,
                    `valid until ${datum(e.felder.gueltig)}, call ${ansprech(kunde(Number(e.felder.kunde)), 'en')}`
                  ),
          wichtig: e.stand === 'freigabe' || tageBis(e.felder.gueltig) < 3,
        })),
  },
  schritte: e => {
    switch (e.stand) {
      case 'entwurf':
        return Number(e.felder.betrag) >= FREIGABE_AB
          ? [
              {
                nach: 'freigabe',
                text: t('Zur Freigabe geben', 'Send for approval'),
                symbol: ShieldCheck,
                haupt: true,
              },
            ]
          : [{ nach: 'versendet', text: t('Versenden', 'Send'), symbol: Send, haupt: true }];
      case 'freigegeben':
        return [{ nach: 'versendet', text: t('Versenden', 'Send'), symbol: Send, haupt: true }];
      case 'versendet':
        return [
          { nach: 'angenommen', text: t('Angenommen', 'Accepted'), symbol: Check, haupt: true },
          {
            nach: 'abgelehnt',
            text: t('Abgelehnt', 'Declined'),
            symbol: CircleX,
            mitGrund: t('Woran lag es? (freiwillig)', 'What was the reason? (optional)'),
          },
        ];
      case 'abgelehnt':
        return [{ nach: 'entwurf', text: t('Neu bearbeiten', 'Revise'), symbol: Undo2 }];
      default:
        return [];
    }
  },
  csv: e => ({
    [t('Nummer', 'Number')]: e.nr,
    [t('Kunde', 'Customer')]: kunde(Number(e.felder.kunde)).name,
    [t('Betreff', 'Subject')]: tx(e.felder.betreff),
    [t('Datum', 'Date')]: String(e.felder.datum ?? ''),
    [t('Gültig bis', 'Valid until')]: String(e.felder.gueltig ?? ''),
    [t('Netto', 'Net')]: String(e.felder.betrag ?? ''),
    [t('Rabatt %', 'Discount %')]: String(e.felder.rabatt ?? 0),
    [t('Stand', 'Status')]: e.stand,
    [t('Bearbeiter', 'Prepared by')]: name(Number(e.felder.bearbeiter)),
    [t('Auftrag', 'Order')]: String(e.felder.auftrag ?? ''),
  }),
};

starten(def);
