/**
 * Angebote (J54, M7): kalkulieren, zur Freigabe geben (ab 20.000 €),
 * versenden, nachfassen. Ab Fassung 1.5.0 (in Test) kennt ein Angebot einen
 * Rabatt; das ist die Änderung, die in der Werkstatt live geschaltet wird.
 */
import { Check, CircleX, Send, ShieldCheck, Undo2 } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import { KUNDEN, PERSONEN, ansprech, kunde, name } from '../firma';
import { starten, Mono, StammLink, type AppDef, type Ctx } from './fachapp';
import {
  datum,
  euro,
  imZeitraum,
  isoIn,
  mindestens,
  proMonat,
  prozent,
  relativTag,
  stammOeffnen,
  t,
  tageBis,
  tausend,
  tx,
} from './gemeinsam';

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
      anzeigen: w => (
        <StammLink art="kunde" id={Number(w)}>
          {kunde(Number(w)).name}, {kunde(Number(w)).ort}
        </StammLink>
      ),
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
    formatY: n =>
      n >= 1000 ? t(`${Math.round(n / 1000)} Tsd.`, `${Math.round(n / 1000)}k`) : String(n),
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
          wichtig: e.stand !== 'freigabe' && tageBis(e.felder.gueltig) < 3,
          freigabe: e.stand === 'freigabe',
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
  auswertung: {
    rechnen: (alle, ctx, z, oeffnen) => {
      const liste = alle.filter(e => imZeitraum(z, String(e.felder.datum)));
      const an = liste.filter(e => e.stand === 'angenommen');
      const entschieden = liste.filter(e => ['angenommen', 'abgelehnt'].includes(e.stand));
      const summe = (l: Eintrag[]) => l.reduce((s, e) => s + netto(e, ctx), 0);
      const jeKunde = new Map<number, Eintrag[]>();
      for (const e of liste) {
        const k = Number(e.felder.kunde);
        jeKunde.set(k, [...(jeKunde.get(k) ?? []), e]);
      }
      const kundenRang = [...jeKunde.entries()]
        .map(([k, l]) => ({ k, l, wert: summe(l.filter(e => e.stand === 'angenommen')) }))
        .sort((a, b) => b.wert - a.wert || summe(b.l) - summe(a.l))
        .slice(0, 8);
      const bearbeiter = PERSONEN.filter(p =>
        liste.some(e => Number(e.felder.bearbeiter) === p.id)
      );
      const arten = new Map<string, Eintrag[]>();
      for (const e of liste) {
        const art = tx(kunde(Number(e.felder.kunde)).art);
        arten.set(art, [...(arten.get(art) ?? []), e]);
      }
      const monate = proMonat(liste, e => String(e.felder.datum), z.monate, {
        angeboten: e => netto(e, ctx),
        angenommen: e => (e.stand === 'angenommen' ? netto(e, ctx) : 0),
        an: e => (e.stand === 'angenommen' ? 1 : 0),
        ent: e => (['angenommen', 'abgelehnt'].includes(e.stand) ? 1 : 0),
      });
      return {
        kennzahlen: [
          {
            beschriftung: t('Angeboten', 'Quoted'),
            wert: euro(summe(liste)),
            fussnote: t(`${liste.length} Angebote, netto`, `${liste.length} quotes, net`),
            verlauf: monate.map(m => Number(m.angeboten)),
          },
          {
            beschriftung: t('Gewonnen', 'Won'),
            wert: euro(summe(an)),
            fussnote: t(`${an.length} Aufträge`, `${an.length} orders`),
            verlauf: monate.map(m => Number(m.angenommen)),
          },
          {
            beschriftung: t('Annahmequote', 'Win rate'),
            wert: String(prozent(an.length, entschieden.length)),
            einheit: '%',
            fussnote: t(
              `von ${entschieden.length} entschiedenen`,
              `of ${entschieden.length} decided`
            ),
          },
          {
            beschriftung: t('Durchschnitt je Angebot', 'Average per quote'),
            wert: euro(liste.length ? summe(liste) / liste.length : 0),
            fussnote: t('netto', 'net'),
          },
        ],
        teile: [
          {
            art: 'diagramm',
            breit: true,
            monatlich: true,
            titel: t('Angeboten und gewonnen je Monat', 'Quoted and won per month'),
            d: {
              titel: t('Angeboten und gewonnen je Monat', 'Quoted and won per month'),
              satz: t(`Netto in Euro, ${z.text}.`, `Net in euros, ${z.text}.`),
              art: 'balken',
              data: monate,
              series: [
                { key: 'angeboten', name: t('Angeboten', 'Quoted'), unit: ' €' },
                { key: 'angenommen', name: t('Gewonnen', 'Won'), unit: ' €' },
              ],
              formatY: tausend,
            },
          },
          {
            art: 'rangliste',
            titel: t('Umsatz nach Kunde', 'Revenue by customer'),
            satz: t(
              'Gewonnen, netto. Ein Klick öffnet den Kunden.',
              'Won, net. Click to open the customer.'
            ),
            zeilen: kundenRang.map(({ k, l, wert }) => ({
              name: kunde(k).name,
              wert,
              text: euro(wert),
              neben: t(
                `${l.length} ${l.length === 1 ? 'Angebot' : 'Angebote'}, ${l.filter(e => e.stand === 'angenommen').length} gewonnen`,
                `${l.length} ${l.length === 1 ? 'quote' : 'quotes'}, ${l.filter(e => e.stand === 'angenommen').length} won`
              ),
              aufKlick: () => stammOeffnen('kunde', k),
            })),
          },
          {
            art: 'tabelle',
            titel: t('Nach Art des Kunden', 'By customer type'),
            kopf: [
              t('Art', 'Type'),
              t('Angebote', 'Quotes'),
              t('Angeboten', 'Quoted'),
              t('Gewonnen', 'Won'),
              t('Quote', 'Win rate'),
            ],
            rechts: [1, 2, 3, 4],
            zeilen: [...arten.entries()]
              .sort((a, b) => summe(b[1]) - summe(a[1]))
              .map(([art, l]) => {
                const g = l.filter(e => e.stand === 'angenommen');
                const ent = l.filter(e => ['angenommen', 'abgelehnt'].includes(e.stand));
                return [
                  art,
                  String(l.length),
                  euro(summe(l)),
                  euro(summe(g)),
                  `${prozent(g.length, ent.length)} %`,
                ];
              }),
          },
          {
            art: 'rangliste',
            titel: t('Nach Bearbeiter', 'By person'),
            satz: t('Angeboten, netto, mit Annahmequote.', 'Quoted, net, with win rate.'),
            zeilen: bearbeiter
              .map(p => {
                const l = liste.filter(e => Number(e.felder.bearbeiter) === p.id);
                const ent = l.filter(e => ['angenommen', 'abgelehnt'].includes(e.stand));
                return {
                  name: `${p.vorname} ${p.nachname}`,
                  wert: summe(l),
                  text: euro(summe(l)),
                  neben: t(
                    `${l.length} Angebote · Quote ${prozent(l.filter(e => e.stand === 'angenommen').length, ent.length)} %`,
                    `${l.length} quotes · win rate ${prozent(l.filter(e => e.stand === 'angenommen').length, ent.length)}%`
                  ),
                  aufKlick: () => stammOeffnen('person', p.id),
                };
              })
              .sort((a, b) => b.wert - a.wert),
          },
          {
            art: 'rangliste',
            titel: t('Größte offene Angebote', 'Largest open quotes'),
            satz: t(
              'Noch nicht entschieden. Ein Klick öffnet das Angebot.',
              'Not yet decided. Click to open the quote.'
            ),
            leer: t('Kein offenes Angebot im Zeitraum.', 'No open quote in this period.'),
            zeilen: liste
              .filter(offen)
              .sort((a, b) => netto(b, ctx) - netto(a, ctx))
              .slice(0, 6)
              .map(e => ({
                name: `${e.nr} ${kunde(Number(e.felder.kunde)).name}`,
                wert: netto(e, ctx),
                text: euro(netto(e, ctx)),
                neben: `${tx(e.felder.betreff)} · ${t('gültig bis', 'valid until')} ${datum(e.felder.gueltig)}`,
                aufKlick: () => oeffnen(e.id),
              })),
          },
        ],
      };
    },
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
