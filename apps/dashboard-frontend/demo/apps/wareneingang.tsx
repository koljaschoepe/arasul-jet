/**
 * Wareneingang (J54, M7): Lieferungen erwarten, annehmen, prüfen,
 * einlagern; eine beschädigte Lieferung wird mit Foto reklamiert. Material
 * für einen Auftrag trägt dessen Nummer, dieselbe wie im Angebot und im
 * Prüfprotokoll.
 */
import { Check, PackageCheck, PackageOpen, TriangleAlert, Warehouse } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import {
  ARTIKEL,
  AUFTRAEGE,
  LIEFERANTEN,
  PERSONEN,
  kunde,
  lieferant,
  name,
  auftrag,
} from '../firma';
import { starten, Mono, type AppDef } from './fachapp';
import { datum, isoIn, proWoche, relativTag, t, tageBis, tx, zahl } from './gemeinsam';

const artikel = (e: Eintrag) => ARTIKEL.find(a => a.nr === e.felder.artikel);
const menge = (e: Eintrag) => {
  const a = artikel(e);
  return `${zahl(Number(e.felder.menge))} ${a ? tx(a.einheit) : ''}`;
};

const def: AppDef = {
  id: 'wareneingang',
  titel: t('Wareneingang', 'Goods receipt'),
  einzahl: t('Lieferung', 'Delivery'),
  neuText: t('Lieferung erfassen', 'Record delivery'),
  satz: () =>
    t(
      'Was kommt, was angekommen ist, was geprüft und eingelagert wird. Tor 2, Murat Yıldız.',
      'What is coming, what has arrived, what is checked and stored. Gate 2, Murat Yıldız.'
    ),
  startStand: 'erwartet',
  standBeimAnlegen: f => (f.eingang ? 'eingegangen' : 'erwartet'),
  titelVon: e => (artikel(e) ? tx(artikel(e)!.name) : String(e.felder.artikel)),
  nebenVon: e => `${lieferant(Number(e.felder.lieferant)).name} · ${menge(e)}`,
  felder: () => [
    {
      key: 'lieferant',
      titel: t('Lieferant', 'Supplier'),
      art: 'auswahl',
      pflicht: true,
      optionen: LIEFERANTEN.map(l => [String(l.id), l.name]),
      anzeigen: w => `${lieferant(Number(w)).name}, ${lieferant(Number(w)).ort}`,
    },
    {
      key: 'artikel',
      titel: t('Artikel', 'Item'),
      art: 'auswahl',
      pflicht: true,
      optionen: ARTIKEL.map(a => [a.nr, `${a.nr} ${tx(a.name)}`]),
      anzeigen: w => {
        const a = ARTIKEL.find(x => x.nr === w);
        return a ? `${a.nr} · ${tx(a.name)}` : String(w);
      },
    },
    {
      key: 'menge',
      titel: t('Menge', 'Quantity'),
      art: 'zahl',
      pflicht: true,
      min: 1,
      anzeigen: (_w, e) => <Mono>{menge(e)}</Mono>,
    },
    {
      key: 'bestellung',
      titel: t('Bestellung', 'Purchase order'),
      art: 'text',
      pflicht: true,
      hinweis: t('Unsere Nummer, etwa B-26-0561.', 'Our number, e.g. B-26-0561.'),
      anzeigen: w => <Mono>{String(w)}</Mono>,
    },
    {
      key: 'auftrag',
      titel: t('Für Auftrag', 'For order'),
      art: 'auswahl',
      optionen: AUFTRAEGE.map(a => [a.nr, `${a.nr} ${kunde(a.kunde).name}`]),
      anzeigen: w => {
        const a = auftrag(String(w));
        return a ? `${a.nr} · ${kunde(a.kunde).name}, ${tx(a.gegenstand)}` : String(w);
      },
    },
    {
      key: 'erwartet',
      titel: t('Erwartet am', 'Expected on'),
      art: 'datum',
      pflicht: true,
      anzeigen: w => `${datum(w)} (${relativTag(w)})`,
    },
    {
      key: 'eingang',
      titel: t('Eingegangen am', 'Received on'),
      art: 'datum',
      hinweis: t(
        'Leer lassen, solange die Ware unterwegs ist.',
        'Leave empty while the goods are on their way.'
      ),
      anzeigen: w => datum(w),
    },
    {
      key: 'lieferschein',
      titel: t('Lieferschein', 'Delivery note'),
      art: 'text',
      anzeigen: w => <Mono>{String(w)}</Mono>,
    },
    {
      key: 'lagerort',
      titel: t('Lagerort', 'Storage location'),
      art: 'text',
      anzeigen: w => <Mono>{String(w)}</Mono>,
    },
    {
      key: 'pruefer',
      titel: t('Angenommen von', 'Received by'),
      art: 'auswahl',
      optionen: PERSONEN.filter(p => p.abteilung === 'einkauf').map(p => [
        String(p.id),
        `${p.vorname} ${p.nachname}`,
      ]),
      anzeigen: w => name(Number(w)),
    },
    { key: 'notiz', titel: t('Bemerkung', 'Note'), art: 'textlang' },
  ],
  vorbelegung: () => ({ erwartet: isoIn(1), pruefer: 7 }),
  pruefen: f => {
    const aus: Record<string, string> = {};
    if (typeof f.bestellung === 'string' && !/^B-\d{2}-\d{3,4}$/.test(f.bestellung)) {
      aus.bestellung = t('Form B-26-0561.', 'Format B-26-0561.');
    }
    if (typeof f.eingang === 'string' && f.eingang > isoIn(0)) {
      aus.eingang = t('Liegt in der Zukunft.', 'Is in the future.');
    }
    return aus;
  },
  spalten: () => [
    {
      schluessel: 'nr',
      titel: t('Nummer', 'Number'),
      breite: '7.5rem',
      wert: e => e.nr,
      zelle: e => e.nr,
    },
    {
      schluessel: 'lieferant',
      titel: t('Lieferant', 'Supplier'),
      breite: '24%',
      kuerzen: true,
      wert: e => lieferant(Number(e.felder.lieferant)).name,
      zelle: e => lieferant(Number(e.felder.lieferant)).name,
    },
    {
      schluessel: 'artikel',
      titel: t('Artikel', 'Item'),
      kuerzen: true,
      wert: e => (artikel(e) ? tx(artikel(e)!.name) : ''),
      zelle: e => (artikel(e) ? tx(artikel(e)!.name) : ''),
    },
    {
      schluessel: 'menge',
      titel: t('Menge', 'Qty'),
      ausrichtung: 'rechts',
      breite: '7rem',
      wert: e => Number(e.felder.menge),
      zelle: e => <Mono>{menge(e)}</Mono>,
    },
    {
      schluessel: 'auftrag',
      titel: t('Auftrag', 'Order'),
      breite: '7rem',
      wert: e => String(e.felder.auftrag ?? ''),
      zelle: e => <Mono>{e.felder.auftrag ? String(e.felder.auftrag) : '–'}</Mono>,
      inKarte: false,
    },
    {
      schluessel: 'erwartet',
      titel: t('Termin', 'Date'),
      breite: '6.5rem',
      wert: e => String(e.felder.eingang ?? e.felder.erwartet),
      zelle: e => <Mono>{datum(e.felder.eingang ?? e.felder.erwartet)}</Mono>,
    },
  ],
  kennzahlen: liste => {
    const wochen = proWoche(
      liste,
      e => (e.felder.eingang ? String(e.felder.eingang) : null),
      7,
      0,
      {
        n: () => 1,
        rekl: e => (e.stand === 'reklamiert' ? 1 : 0),
      }
    );
    const heute = liste.filter(e => e.stand === 'erwartet' && tageBis(e.felder.erwartet) <= 0);
    const eingegangen = liste.filter(e => e.felder.eingang);
    const puenktlich = eingegangen.filter(
      e => String(e.felder.eingang) <= String(e.felder.erwartet)
    );
    const rekl = liste.filter(e => e.stand === 'reklamiert');
    return [
      {
        beschriftung: t('Heute erwartet', 'Expected today'),
        wert: String(heute.length),
        fussnote: t(
          `${liste.filter(e => e.stand === 'erwartet').length} unterwegs`,
          `${liste.filter(e => e.stand === 'erwartet').length} on the way`
        ),
        verlauf: wochen.map(w => Number(w.n)),
      },
      {
        beschriftung: t('Zu prüfen', 'To check'),
        wert: String(liste.filter(e => e.stand === 'eingegangen').length),
        fussnote: t('angenommen, nicht geprüft', 'received, not checked'),
      },
      {
        beschriftung: t('Liefertreue', 'On-time delivery'),
        wert: String(
          eingegangen.length ? Math.round((puenktlich.length / eingegangen.length) * 100) : 100
        ),
        einheit: '%',
        fussnote: t('am erwarteten Tag oder früher', 'on the expected day or earlier'),
      },
      {
        beschriftung: t('Reklamationen', 'Complaints'),
        wert: String(rekl.length),
        fussnote: t('offen beim Lieferanten', 'open with supplier'),
        verlauf: wochen.map(w => Number(w.rekl)),
      },
    ];
  },
  diagramm: liste => ({
    titel: t('Lieferungen je Woche', 'Deliveries per week'),
    satz: t(
      'Eingegangen in den letzten zehn Wochen, dazu die erwarteten.',
      'Received in the last ten weeks, plus those expected.'
    ),
    art: 'balken',
    data: proWoche(liste, e => String(e.felder.eingang ?? e.felder.erwartet), 9, 1, {
      eingegangen: e => (e.felder.eingang ? 1 : 0),
      erwartet: e => (e.felder.eingang ? 0 : 1),
    }),
    series: [
      { key: 'eingegangen', name: t('Eingegangen', 'Received') },
      { key: 'erwartet', name: t('Erwartet', 'Expected') },
    ],
  }),
  naechstes: {
    titel: t('Als Nächstes am Tor', 'Next at the gate'),
    leer: t('Heute und morgen kommt nichts.', 'Nothing arrives today or tomorrow.'),
    liste: liste =>
      liste
        .filter(
          e => e.stand === 'erwartet' || e.stand === 'eingegangen' || e.stand === 'reklamiert'
        )
        .sort((a, b) => String(a.felder.erwartet).localeCompare(String(b.felder.erwartet)))
        .map(e => ({
          e,
          satz:
            e.stand === 'eingegangen'
              ? t(
                  `angenommen, prüfen · ${lieferant(Number(e.felder.lieferant)).name}`,
                  `received, check · ${lieferant(Number(e.felder.lieferant)).name}`
                )
              : e.stand === 'reklamiert'
                ? t('reklamiert, Ersatz offen', 'complaint, replacement pending')
                : `${relativTag(e.felder.erwartet)} · ${lieferant(Number(e.felder.lieferant)).name} · ${menge(e)}`,
          wichtig:
            e.stand === 'reklamiert' || (e.stand === 'erwartet' && tageBis(e.felder.erwartet) < 0),
        })),
  },
  schritte: e => {
    switch (e.stand) {
      case 'erwartet':
        return [
          {
            nach: 'eingegangen',
            text: t('Ware angenommen', 'Goods received'),
            symbol: PackageOpen,
            haupt: true,
          },
        ];
      case 'eingegangen':
        return [
          {
            nach: 'geprueft',
            text: t('Geprüft, in Ordnung', 'Checked, OK'),
            symbol: Check,
            haupt: true,
          },
          {
            nach: 'reklamiert',
            text: t('Reklamieren', 'Raise complaint'),
            symbol: TriangleAlert,
            mitGrund: t('Was ist beschädigt oder fehlt?', 'What is damaged or missing?'),
          },
        ];
      case 'geprueft':
        return [
          { nach: 'eingelagert', text: t('Eingelagert', 'Stored'), symbol: Warehouse, haupt: true },
        ];
      case 'reklamiert':
        return [
          {
            nach: 'geprueft',
            text: t('Ersatz ist da', 'Replacement arrived'),
            symbol: PackageCheck,
            haupt: true,
          },
        ];
      default:
        return [];
    }
  },
  csv: e => ({
    [t('Nummer', 'Number')]: e.nr,
    [t('Lieferant', 'Supplier')]: lieferant(Number(e.felder.lieferant)).name,
    [t('Artikel', 'Item')]: String(e.felder.artikel ?? ''),
    [t('Bezeichnung', 'Description')]: artikel(e) ? tx(artikel(e)!.name) : '',
    [t('Menge', 'Quantity')]: String(e.felder.menge ?? ''),
    [t('Bestellung', 'Purchase order')]: String(e.felder.bestellung ?? ''),
    [t('Auftrag', 'Order')]: String(e.felder.auftrag ?? ''),
    [t('Erwartet', 'Expected')]: String(e.felder.erwartet ?? ''),
    [t('Eingegangen', 'Received')]: String(e.felder.eingang ?? ''),
    [t('Lagerort', 'Location')]: String(e.felder.lagerort ?? ''),
    [t('Stand', 'Status')]: e.stand,
  }),
};

starten(def);
