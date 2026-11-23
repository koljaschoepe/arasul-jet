/**
 * Die Übersicht des Betriebs auf der Startseite der Demo (J54, M7).
 *
 * Das Produkt zeigt auf der Startseite den Gruß, „Für Sie" (die Freigaben)
 * und eine Kachel je App. Die Demo setzt zwei Teile dazu, ohne `src/`
 * anzufassen, wie das Band früher: unter den Gruß die Firma, Schnellzugriffe
 * und Kennzahlen über alle Apps mit Verlauf; vor die Kacheln, was heute
 * ansteht und was zuletzt geändert wurde. Die Zahlen kommen aus denselben
 * Einträgen, die die Apps zeigen (`/apps/<id>/api/daten`), also passen sie
 * zusammen; nach jeder Änderung in einer App rechnet die Übersicht neu.
 *
 * So sähe die Startseite eines Betriebs aus, der sich dafür eine eigene
 * Übersicht-App baut. In der Demo ist sie gesetzt, damit nichts leer wirkt.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon, Kennzahl } from '@marken';
import { Chart } from '@marken/diagramm';
import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  Hammer,
  PackageCheck,
  Plus,
  Wrench,
  type LucideIcon,
} from '@marken/symbole';
import './uebersicht.css';
import { angebotOffen, txt, type AppKennung, type Eintrag } from './bestand';
import {
  FIRMA,
  kunde,
  lieferant,
  maschine,
  name,
  stammUebernehmen,
  ARTIKEL,
  type Stamm,
} from './firma';
import type { Sprache } from './daten';

type Daten = Record<AppKennung, Eintrag[]> & { meldungen: { stand_meldung: string }[] };

const SYMBOL: Record<AppKennung | 'werkstatt', LucideIcon> = {
  angebote: FileText,
  wareneingang: PackageCheck,
  wartungsplan: Wrench,
  pruefprotokolle: ClipboardCheck,
  urlaub: CalendarDays,
  werkstatt: Hammer,
};

const APP_NAME: Record<AppKennung | 'werkstatt', [string, string]> = {
  angebote: ['Angebote', 'Quotes'],
  wareneingang: ['Wareneingang', 'Goods receipt'],
  wartungsplan: ['Wartungsplan', 'Maintenance plan'],
  pruefprotokolle: ['Prüfprotokolle', 'Inspection reports'],
  urlaub: ['Urlaubsanträge', 'Leave requests'],
  werkstatt: ['Werkstatt', 'Workshop'],
};

let sprache: Sprache = 'de';
const t = (de: string, en: string) => (sprache === 'en' ? en : de);
const ort = () => (sprache === 'en' ? 'en-GB' : 'de-DE');
const euro = (n: number) =>
  new Intl.NumberFormat(ort(), {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
const heute = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const tage = (iso: unknown) =>
  typeof iso === 'string'
    ? Math.round((Date.parse(`${iso}T12:00:00`) - Date.parse(`${heute()}T12:00:00`)) / 86_400_000)
    : 0;
const wann = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return t('gerade eben', 'just now');
  if (min < 60) return t(`vor ${min} Min.`, `${min} min ago`);
  const std = Math.floor(min / 60);
  if (std < 24) return t(`vor ${std} Std.`, `${std} h ago`);
  // Abgerundet wie „wartet seit …" in „Für Sie": sonst stünde dort 2, hier 3.
  const d = Math.floor(std / 24);
  return d === 1 ? t('gestern', 'yesterday') : t(`vor ${d} Tagen`, `${d} days ago`);
};

// ── Daten: einmal geladen, nach jeder Änderung in einer App neu ─────────────

let daten: Daten | null = null;
const hoerer = new Set<() => void>();

async function laden(): Promise<void> {
  const apps: AppKennung[] = [
    'angebote',
    'wareneingang',
    'wartungsplan',
    'pruefprotokolle',
    'urlaub',
  ];
  // Kunden, Lieferanten, Maschinen im Stand der Stammdaten (J55).
  await fetch('/apps/stammdaten/api/stamm')
    .then(r => r.json() as Promise<{ data: Stamm }>)
    .then(j => stammUebernehmen(j.data))
    .catch(() => undefined);
  const [listen, meldungen] = await Promise.all([
    Promise.all(
      apps.map(a =>
        fetch(`/apps/${a}/api/daten`)
          .then(r => r.json() as Promise<{ data: { eintraege: Eintrag[] } }>)
          .then(j => j.data.eintraege)
      )
    ),
    fetch('/api/rueckmeldungen')
      .then(r => r.json() as Promise<{ data: { stand_meldung: string }[] }>)
      .then(j => j.data),
  ]);
  const neu = { meldungen } as Daten;
  apps.forEach((a, i) => {
    neu[a] = listen[i]!;
  });
  daten = neu;
  hoerer.forEach(h => h());
}

function useDaten(): Daten | null {
  const [, setZaehler] = useState(0);
  useEffect(() => {
    const h = () => setZaehler(z => z + 1);
    hoerer.add(h);
    return () => {
      hoerer.delete(h);
    };
  }, []);
  return daten;
}

/** In der Shell zu einer Adresse gehen, wie ein Klick in der Leiste. */
function geheZu(pfad: string) {
  window.history.pushState(null, '', pfad);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function oeffne(app: AppKennung | 'werkstatt', vorgang?: number) {
  geheZu(`/workspace/app/${app}${vorgang ? `?freigabe=${vorgang}` : ''}`);
}

function neuAnlegen(app: AppKennung) {
  try {
    window.localStorage.setItem('arasul-demo-auftrag', JSON.stringify({ app, aktion: 'neu' }));
  } catch {
    /* dann öffnet sie nur die App */
  }
  oeffne(app);
}

// ── Teil 1: Firma, Schnellzugriffe, Kennzahlen ──────────────────────────────

function proMonat(
  liste: Eintrag[],
  tag: (e: Eintrag) => string | null,
  wert: (e: Eintrag) => number
): number[] {
  const jetzt = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth() - (5 - i), 1);
    return liste
      .filter(e => {
        const iso = tag(e);
        if (!iso) return false;
        const x = new Date(`${iso.slice(0, 10)}T12:00:00`);
        return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
      })
      .reduce((s, e) => s + wert(e), 0);
  });
}

function proWoche(liste: Eintrag[], tag: (e: Eintrag) => string | null): number[] {
  return Array.from({ length: 8 }, (_, i) => {
    const von = -(7 - i) * 7 - 6;
    const bis = -(7 - i) * 7;
    return liste.filter(e => {
      const n = tage(tag(e));
      return n >= von && n <= bis;
    }).length;
  });
}

function Kachel({ app, children }: { app: AppKennung | 'werkstatt'; children: ReactNode }) {
  return (
    <button
      type="button"
      className="demo-kachel"
      onClick={() => oeffne(app)}
      aria-label={t(`${APP_NAME[app][0]} öffnen`, `Open ${APP_NAME[app][1]}`)}
      data-testid={`demo-kennzahl-${app}`}
    >
      {children}
    </button>
  );
}

function Oben() {
  const d = useDaten();
  const datum = new Date().toLocaleDateString(ort(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const schnell: [AppKennung, string][] = [
    ['angebote', t('Angebot anlegen', 'New quote')],
    ['wareneingang', t('Lieferung erfassen', 'Record delivery')],
    ['wartungsplan', t('Wartung eintragen', 'Add maintenance')],
    ['pruefprotokolle', t('Prüfung erfassen', 'Record inspection')],
    ['urlaub', t('Urlaub beantragen', 'Request leave')],
  ];

  let kacheln: ReactNode = <div className="demo-kacheln-platz" />;
  if (d) {
    const offen = d.angebote.filter(e => angebotOffen(e, heute()));
    // Am Wochenende zählt der nächste Werktag als „heute" für das Tor.
    const bisWerktag = [1, 0, 0, 0, 0, 0, 2][new Date().getDay()]!;
    // Wie die Woche darunter: alles mit diesem Tag, schon da oder erwartet.
    const heuteErwartet = d.wareneingang.filter(
      e => tage(e.felder.eingang ?? e.felder.erwartet) === bisWerktag
    );
    const schonDa = heuteErwartet.filter(e => e.felder.eingang);
    const faellig = d.wartungsplan.filter(
      e => e.stand !== 'erledigt' && tage(e.felder.faellig) <= 7
    );
    const ueberfaellig = faellig.filter(e => tage(e.felder.faellig) < 0);
    const pruefFreigabe = d.pruefprotokolle.filter(e => e.stand === 'freigabe');
    const nacharbeit = d.pruefprotokolle.filter(e => e.stand === 'nacharbeit');
    const weg = d.urlaub.filter(
      e => e.stand === 'genehmigt' && tage(e.felder.von) <= 0 && tage(e.felder.bis) >= 0
    );
    const urlaubOffen = d.urlaub.filter(e => e.stand === 'beantragt');
    const meldungen = d.meldungen.filter(
      m => m.stand_meldung === 'neu' || m.stand_meldung === 'angenommen'
    );
    kacheln = (
      <div className="demo-kacheln">
        <Kachel app="angebote">
          <Kennzahl
            beschriftung={t('Offene Angebote', 'Open quotes')}
            wert={euro(offen.reduce((s, e) => s + Number(e.felder.betrag), 0))}
            fussnote={t(`${offen.length} Angebote, netto`, `${offen.length} quotes, net`)}
            verlauf={proMonat(
              d.angebote,
              e => String(e.felder.datum),
              e => Number(e.felder.betrag)
            )}
          />
        </Kachel>
        <Kachel app="wareneingang">
          <Kennzahl
            beschriftung={
              bisWerktag
                ? t('Lieferungen Montag', 'Deliveries Monday')
                : t('Lieferungen heute', 'Deliveries today')
            }
            wert={String(heuteErwartet.length)}
            fussnote={t(
              `${schonDa.length} da, ${heuteErwartet.length - schonDa.length} erwartet`,
              `${schonDa.length} in, ${heuteErwartet.length - schonDa.length} expected`
            )}
            verlauf={proWoche(d.wareneingang, e =>
              e.felder.eingang ? String(e.felder.eingang) : null
            )}
          />
        </Kachel>
        <Kachel app="wartungsplan">
          <Kennzahl
            beschriftung={t('Wartungen fällig', 'Maintenance due')}
            wert={String(faellig.length)}
            fussnote={
              ueberfaellig.length
                ? t(`${ueberfaellig.length} überfällig`, `${ueberfaellig.length} overdue`)
                : t('in den nächsten 7 Tagen', 'in the next 7 days')
            }
            verlauf={proMonat(
              d.wartungsplan,
              e => (e.felder.erledigt_am ? String(e.felder.erledigt_am) : null),
              () => 1
            )}
          />
        </Kachel>
        <Kachel app="pruefprotokolle">
          <Kennzahl
            beschriftung={t('Prüfprotokolle', 'Inspections')}
            wert={String(pruefFreigabe.length)}
            fussnote={t(
              `zur Freigabe, ${nacharbeit.length} in Nacharbeit`,
              `to approve, ${nacharbeit.length} in rework`
            )}
            verlauf={proMonat(
              d.pruefprotokolle,
              e => String(e.felder.datum),
              () => 1
            )}
          />
        </Kachel>
        <Kachel app="urlaub">
          <Kennzahl
            beschriftung={t('Heute abwesend', 'Away today')}
            wert={String(weg.length)}
            fussnote={t(
              `${urlaubOffen.length} Anträge offen`,
              `${urlaubOffen.length} requests open`
            )}
            verlauf={proWoche(d.urlaub, e =>
              e.stand === 'genehmigt' ? String(e.felder.von) : null
            )}
          />
        </Kachel>
        <Kachel app="werkstatt">
          <Kennzahl
            beschriftung={t('Meldungen', 'Feedback')}
            wert={String(meldungen.length)}
            fussnote={t('zu den Apps, noch offen', 'on the apps, still open')}
          />
        </Kachel>
      </div>
    );
  }

  return (
    <div className="demo-oben" data-testid="demo-uebersicht">
      <p className="demo-firma">
        <span>{FIRMA.name}</span> · {FIRMA.ort} · {datum}
      </p>
      <div className="demo-schnell" role="group" aria-label={t('Schnellzugriffe', 'Quick actions')}>
        {schnell.map(([app, text]) => (
          <button
            key={app}
            type="button"
            onClick={() => neuAnlegen(app)}
            data-testid={`demo-schnell-${app}`}
          >
            <Icon symbol={Plus} groesse="klein" />
            {text}
          </button>
        ))}
      </div>
      {kacheln}
    </div>
  );
}

// ── Teil 3 (J55): zwei Diagramme über alle Apps, die Woche ──────────────────

const FACH: AppKennung[] = [
  'angebote',
  'wareneingang',
  'wartungsplan',
  'pruefprotokolle',
  'urlaub',
];

/** Kurze Namen für die Achse: am Handy fielen sonst drei von fünf weg. */
const KURZ: Record<AppKennung, [string, string]> = {
  angebote: ['Angebote', 'Quotes'],
  wareneingang: ['Waren', 'Goods'],
  wartungsplan: ['Wartung', 'Service'],
  pruefprotokolle: ['Prüfung', 'Checks'],
  urlaub: ['Urlaub', 'Leave'],
};

/** Was in einer App offen ist, und was davon dringt (bei Ihnen oder überfällig). */
function offenJeApp(d: Daten) {
  const offen: Record<AppKennung, (e: Eintrag) => boolean> = {
    angebote: e => angebotOffen(e, heute()),
    wareneingang: e => ['erwartet', 'eingegangen', 'geprueft', 'reklamiert'].includes(e.stand),
    // Wie die Kachel „Wartungen fällig": in den nächsten sieben Tagen.
    wartungsplan: e => e.stand !== 'erledigt' && tage(e.felder.faellig) <= 7,
    pruefprotokolle: e => ['offen', 'freigabe', 'nacharbeit'].includes(e.stand),
    urlaub: e => e.stand === 'beantragt',
  };
  const dringend: Record<AppKennung, (e: Eintrag) => boolean> = {
    angebote: e =>
      e.stand === 'freigabe' || (e.stand === 'versendet' && tage(e.felder.gueltig) <= 3),
    wareneingang: e =>
      e.stand === 'reklamiert' || (e.stand === 'erwartet' && tage(e.felder.erwartet) < 0),
    wartungsplan: e => e.stand !== 'erledigt' && tage(e.felder.faellig) < 0,
    pruefprotokolle: e => e.stand === 'freigabe' || e.stand === 'nacharbeit',
    urlaub: e => e.stand === 'beantragt',
  };
  return FACH.map((app, x) => ({
    x,
    name: KURZ[app][sprache === 'en' ? 1 : 0],
    offen: d[app].filter(offen[app]).length,
    dringend: d[app].filter(e => offen[app](e) && dringend[app](e)).length,
  }));
}

const ENDE: Record<AppKennung, string[]> = {
  angebote: ['angenommen', 'abgelehnt'],
  wareneingang: ['eingelagert'],
  wartungsplan: ['erledigt'],
  pruefprotokolle: ['freigegeben'],
  urlaub: ['genehmigt', 'abgelehnt'],
};

/** Je Woche: angelegt und abgeschlossen, über alle fünf Apps, acht Wochen. */
function bewegungJeWoche(d: Daten) {
  const montag = new Date(`${heute()}T12:00:00`);
  montag.setDate(montag.getDate() - ((montag.getDay() + 6) % 7));
  const wochen = Array.from({ length: 8 }, (_, i) => {
    const beginn = new Date(montag);
    // Die acht abgeschlossenen Wochen vor dieser: die laufende fiele sonst ab.
    beginn.setDate(beginn.getDate() - (8 - i) * 7);
    return {
      x: i,
      beginn: beginn.getTime(),
      name: `${t('KW', 'Wk')} ${kw(beginn)}`,
      neu: 0,
      fertig: 0,
    };
  });
  const zaehle = (iso: string | undefined, feld: 'neu' | 'fertig') => {
    if (!iso) return;
    const ms = Date.parse(iso);
    const w = wochen.find(x => ms >= x.beginn && ms < x.beginn + 7 * 86_400_000);
    if (w) w[feld] += 1;
  };
  for (const app of FACH) {
    for (const e of d[app]) {
      zaehle(e.verlauf[0]?.am, 'neu');
      if (ENDE[app].includes(e.stand)) zaehle(e.verlauf[e.verlauf.length - 1]?.am, 'fertig');
    }
  }
  return wochen.map(({ beginn: _b, ...rest }) => rest);
}

function kw(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const tag = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - tag);
  const jahr = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - jahr.getTime()) / 86_400_000 + 1) / 7);
}

function isoTag(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Die fünf Werktage dieser Woche (am Wochenende: der nächsten). */
function woche(d: Daten) {
  const start = new Date(`${heute()}T12:00:00`);
  const wt = start.getDay();
  if (wt === 6) start.setDate(start.getDate() + 2);
  else if (wt === 0) start.setDate(start.getDate() + 1);
  else start.setDate(start.getDate() - (wt - 1));
  return Array.from({ length: 5 }, (_, i) => {
    const tag = new Date(start);
    tag.setDate(start.getDate() + i);
    const iso = isoTag(tag);
    const weg = d.urlaub.filter(
      e => e.stand === 'genehmigt' && String(e.felder.von) <= iso && String(e.felder.bis) >= iso
    );
    return {
      iso,
      name: tag.toLocaleDateString(ort(), { weekday: 'short', day: '2-digit', month: '2-digit' }),
      weg,
      lieferungen: d.wareneingang.filter(
        e => String(e.felder.eingang ?? e.felder.erwartet) === iso
      ),
      wartungen: d.wartungsplan.filter(
        e =>
          (e.stand === 'erledigt' ? String(e.felder.erledigt_am) : String(e.felder.faellig)) === iso
      ),
      pruefungen: d.pruefprotokolle.filter(e => String(e.felder.datum) === iso),
      angebote: d.angebote.filter(e => e.stand === 'versendet' && String(e.felder.gueltig) === iso),
    };
  });
}

function Mitte({ d }: { d: Daten }) {
  const offen = offenJeApp(d);
  const bewegung = bewegungJeWoche(d);
  const tage5 = woche(d);
  const h = heute();
  const zeilen: {
    titel: string;
    app: AppKennung;
    wert: (x: (typeof tage5)[number]) => number;
    text?: (x: (typeof tage5)[number]) => string;
  }[] = [
    {
      titel: t('Im Haus', 'In'),
      app: 'urlaub',
      wert: x => FIRMA.leute - x.weg.length,
      text: x =>
        t(
          `${FIRMA.leute - x.weg.length} von ${FIRMA.leute}`,
          `${FIRMA.leute - x.weg.length} of ${FIRMA.leute}`
        ),
    },
    { titel: t('Lieferungen', 'Deliveries'), app: 'wareneingang', wert: x => x.lieferungen.length },
    { titel: t('Wartungen', 'Maintenance'), app: 'wartungsplan', wert: x => x.wartungen.length },
    {
      titel: t('Prüfungen', 'Inspections'),
      app: 'pruefprotokolle',
      wert: x => x.pruefungen.length,
    },
    {
      titel: t('Angebote laufen ab', 'Quotes expire'),
      app: 'angebote',
      wert: x => x.angebote.length,
    },
  ];
  const summe = (x: (typeof tage5)[number]) =>
    x.lieferungen.length + x.wartungen.length + x.pruefungen.length + x.angebote.length;
  const voll = Math.max(1, ...tage5.map(summe));
  const kwNr = kw(new Date(`${tage5[0]!.iso}T12:00:00`));

  return (
    <>
      <section className="demo-flaeche demo-diagramm" aria-labelledby="demo-offen">
        <h2 id="demo-offen">{t('Offen je App', 'Open per app')}</h2>
        <p className="demo-leise demo-satz">
          {t(
            'Was gerade offen ist, und was davon dringt: bei Ihnen zur Freigabe, überfällig oder kurz vor Ablauf.',
            'What is open right now, and what is pressing: waiting for your approval, overdue or about to expire.'
          )}
        </p>
        <Chart
          data={offen}
          series={[
            { key: 'offen', name: t('Offen', 'Open') },
            { key: 'dringend', name: t('Davon dringend', 'Of which pressing') },
          ]}
          xKey="x"
          xTicks={offen.map(o => o.x)}
          formatX={(i: number) => String(offen[i]?.name ?? '')}
          art="balken"
          height={190}
          label={t('Offen je App', 'Open per app')}
        />
      </section>
      <section className="demo-flaeche demo-diagramm" aria-labelledby="demo-bewegung">
        <h2 id="demo-bewegung">{t('Bewegung je Woche', 'Activity per week')}</h2>
        <p className="demo-leise demo-satz">
          {t(
            'Vorgänge angelegt und abgeschlossen, alle fünf Apps, die letzten acht vollen Wochen.',
            'Records created and closed, all five apps, the last eight full weeks.'
          )}
        </p>
        <Chart
          data={bewegung}
          series={[
            { key: 'neu', name: t('Angelegt', 'Created') },
            { key: 'fertig', name: t('Abgeschlossen', 'Closed') },
          ]}
          xKey="x"
          xTicks={bewegung.map(b => b.x)}
          formatX={(i: number) => String(bewegung[i]?.name ?? '')}
          art="linie"
          height={190}
          label={t('Bewegung je Woche', 'Activity per week')}
        />
      </section>
      <section
        className="demo-flaeche demo-woche"
        aria-labelledby="demo-woche"
        data-testid="demo-woche"
      >
        <h2 id="demo-woche">
          {t(`Auslastung der Woche, KW ${kwNr}`, `This week’s workload, wk ${kwNr}`)}
        </h2>
        <div className="demo-woche-kasten">
          <table className="demo-woche-tabelle">
            <thead>
              <tr>
                <th scope="col">
                  <span className="demo-unsichtbar">{t('Was', 'What')}</span>
                </th>
                {tage5.map(x => (
                  <th key={x.iso} scope="col" data-heute={x.iso === h ? 'ja' : undefined}>
                    {x.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="demo-woche-last">
                <th scope="row">{t('Termine', 'Appointments')}</th>
                {tage5.map(x => (
                  <td key={x.iso} data-heute={x.iso === h ? 'ja' : undefined}>
                    <span className="demo-last" aria-hidden="true">
                      <span style={{ height: `${Math.max(6, (summe(x) / voll) * 100)}%` }} />
                    </span>
                    <span className="demo-zahl">{summe(x)}</span>
                  </td>
                ))}
              </tr>
              {zeilen.map(z => (
                <tr key={z.titel}>
                  <th scope="row">
                    <button type="button" onClick={() => oeffne(z.app)}>
                      <Icon symbol={SYMBOL[z.app]} groesse="klein" />
                      {z.titel}
                    </button>
                  </th>
                  {tage5.map(x => (
                    <td
                      key={x.iso}
                      data-heute={x.iso === h ? 'ja' : undefined}
                      data-null={z.wert(x) === 0 ? 'ja' : undefined}
                    >
                      <span className="demo-zahl">{z.text ? z.text(x) : z.wert(x) || '–'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ol className="demo-woche-liste">
          {tage5.map(x => (
            <li key={x.iso} data-heute={x.iso === h ? 'ja' : undefined}>
              <span className="demo-woche-tag">{x.name}</span>
              <span className="demo-leise">
                {[
                  t(`Termine ${summe(x)}`, `Appointments ${summe(x)}`),
                  t(`im Haus ${FIRMA.leute - x.weg.length}`, `in ${FIRMA.leute - x.weg.length}`),
                  ...zeilen
                    .slice(1)
                    .filter(z => z.wert(x) > 0)
                    .map(z => `${z.titel} ${z.wert(x)}`),
                ].join(' · ')}
              </span>
            </li>
          ))}
        </ol>
        <p className="demo-leise demo-satz">
          {tage5.some(x => x.weg.length)
            ? t(
                `Abwesend: ${[...new Set(tage5.flatMap(x => x.weg.map(e => name(Number(e.felder.person)))))].join(', ')}.`,
                `Away: ${[...new Set(tage5.flatMap(x => x.weg.map(e => name(Number(e.felder.person)))))].join(', ')}.`
              )
            : t('Diese Woche fehlt niemand.', 'Nobody is away this week.')}
        </p>
      </section>
    </>
  );
}

// ── Teil 2: heute, zuletzt geändert ─────────────────────────────────────────

interface Punkt {
  app: AppKennung;
  e: Eintrag;
  text: string;
  neben: string;
  wichtig?: boolean;
  rang: number;
}

function heuteListe(d: Daten): Punkt[] {
  const aus: Punkt[] = [];
  for (const e of d.wartungsplan) {
    if (e.stand === 'erledigt') continue;
    const n = tage(e.felder.faellig);
    if (n > 3) continue;
    const m = maschine(String(e.felder.maschine));
    aus.push({
      app: 'wartungsplan',
      e,
      text: `${m.id} ${m.name[sprache]}: ${txt(e.felder.aufgabe, sprache)}`,
      neben:
        n < 0
          ? t(`seit ${-n} Tagen überfällig`, `overdue by ${-n} days`)
          : n === 0
            ? t('heute fällig', 'due today')
            : t(`fällig in ${n} Tagen`, `due in ${n} days`),
      wichtig: n < 0,
      rang: n,
    });
  }
  for (const e of d.wareneingang) {
    if (e.stand !== 'erwartet' || tage(e.felder.erwartet) > 1) continue;
    const a = ARTIKEL.find(x => x.nr === e.felder.artikel);
    aus.push({
      app: 'wareneingang',
      e,
      text: `${lieferant(Number(e.felder.lieferant)).name}: ${a ? a.name[sprache] : ''}`,
      neben: `${tage(e.felder.erwartet) <= 0 ? t('heute erwartet', 'expected today') : t('morgen erwartet', 'expected tomorrow')} · ${e.felder.menge} ${a ? a.einheit[sprache] : ''}${e.felder.auftrag ? ` · ${e.felder.auftrag}` : ''}`,
      rang: tage(e.felder.erwartet),
    });
  }
  for (const e of d.angebote) {
    if (e.stand !== 'versendet') continue;
    const n = tage(e.felder.gueltig);
    if (n < -2 || n > 3) continue;
    aus.push({
      app: 'angebote',
      e,
      text: `${e.nr} ${kunde(Number(e.felder.kunde)).name}`,
      neben:
        n < 0
          ? t('abgelaufen, nachfassen', 'expired, follow up')
          : t(`gültig noch ${n} Tage, nachfassen`, `valid ${n} more days, follow up`),
      wichtig: n < 0,
      rang: n,
    });
  }
  for (const e of d.urlaub) {
    if (e.stand !== 'genehmigt') continue;
    const n = tage(e.felder.von);
    if (n < 0 || n > 2) continue;
    aus.push({
      app: 'urlaub',
      e,
      text: t(
        `${name(Number(e.felder.person))} im Urlaub`,
        `${name(Number(e.felder.person))} on leave`
      ),
      neben: `${n === 0 ? t('ab heute', 'from today') : t(`ab ${n === 1 ? 'morgen' : 'übermorgen'}`, `from ${n === 1 ? 'tomorrow' : 'the day after'}`)}, ${Number(e.felder.tage) === 1 ? t('1 Tag', '1 day') : `${e.felder.tage} ${t('Tage', 'days')}`} · ${t('Vertretung', 'cover')} ${name(Number(e.felder.vertretung))}`,
      rang: n + 0.5,
    });
  }
  for (const e of d.pruefprotokolle) {
    if (e.stand !== 'offen') continue;
    aus.push({
      app: 'pruefprotokolle',
      e,
      text: `${e.nr} ${txt(e.felder.bauteil, sprache)}`,
      neben: `${t('Prüfung offen', 'Inspection open')} · ${e.felder.auftrag} · ${name(Number(e.felder.pruefer))}`,
      rang: 1,
    });
  }
  return aus.sort((a, b) => a.rang - b.rang).slice(0, 7);
}

function zuletzt(d: Daten) {
  const aus: { app: AppKennung; e: Eintrag; am: string; wer: number; text: string }[] = [];
  for (const app of [
    'angebote',
    'wareneingang',
    'wartungsplan',
    'pruefprotokolle',
    'urlaub',
  ] as AppKennung[]) {
    for (const e of d[app]) {
      for (const s of e.verlauf)
        aus.push({ app, e, am: s.am, wer: s.wer, text: txt(s.text, sprache) });
    }
  }
  return aus.sort((a, b) => b.am.localeCompare(a.am)).slice(0, 7);
}

function Unten() {
  const d = useDaten();
  if (!d) return null;
  const heutePunkte = heuteListe(d);
  const geaendert = zuletzt(d);
  return (
    <div className="demo-unten">
      <Mitte d={d} />
      <section className="demo-flaeche" aria-labelledby="demo-heute">
        <h2 id="demo-heute">{t('Heute steht an', 'Today')}</h2>
        {heutePunkte.length === 0 ? (
          <p className="demo-leise">
            {t('Heute steht nichts Besonderes an.', 'Nothing special today.')}
          </p>
        ) : (
          <ul className="demo-punkte">
            {heutePunkte.map(p => (
              <li key={`${p.app}-${p.e.id}`}>
                <button
                  type="button"
                  onClick={() => oeffne(p.app, p.e.id)}
                  data-wichtig={p.wichtig ? 'ja' : undefined}
                >
                  <span className="demo-symbol" aria-hidden="true">
                    <Icon symbol={SYMBOL[p.app]} />
                  </span>
                  <span className="demo-punkt-text">{p.text}</span>
                  <span className="demo-punkt-neben">{p.neben}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="demo-flaeche" aria-labelledby="demo-zuletzt">
        <h2 id="demo-zuletzt">{t('Zuletzt geändert', 'Recently changed')}</h2>
        <ul className="demo-punkte">
          {geaendert.map((g, i) => (
            <li key={`${g.e.id}-${g.am}-${i}`}>
              <button type="button" onClick={() => oeffne(g.app, g.e.id)}>
                <span className="demo-symbol" aria-hidden="true">
                  <Icon symbol={SYMBOL[g.app]} />
                </span>
                <span className="demo-punkt-text">
                  {g.e.nr} · {g.text}
                </span>
                <span className="demo-punkt-neben">
                  {name(g.wer)} · {APP_NAME[g.app][sprache === 'en' ? 1 : 0]} · {wann(g.am)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ── Einsetzen und an Ort und Stelle halten ──────────────────────────────────

export function uebersichtSetzen(s: Sprache): void {
  sprache = s;
  const oben = document.createElement('div');
  oben.dataset.demoNichtUebersetzen = '';
  const unten = document.createElement('div');
  unten.dataset.demoNichtUebersetzen = '';
  createRoot(oben).render(<Oben />);
  createRoot(unten).render(<Unten />);

  let geladen = false;
  const einsetzen = () => {
    const seite = document.querySelector('[data-testid="uebersicht-seite"]');
    if (!seite) return;
    if (!geladen) {
      geladen = true;
      void laden();
    }
    const kopf = seite.querySelector(':scope > header');
    if (kopf && oben.previousElementSibling !== kopf) kopf.after(oben);
    const apps = seite.querySelector(':scope > [data-testid="uebersicht-apps"]');
    if (apps && unten.nextElementSibling !== apps) apps.before(unten);
  };
  new MutationObserver(einsetzen).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('storage', e => {
    if (e.key === 'arasul-demo-neu') void laden();
  });
  // Zurück auf die Startseite: frisch rechnen, was sich in den Apps geändert hat.
  window.addEventListener('popstate', () => {
    if (window.location.pathname === '/workspace') void laden();
  });
  einsetzen();
}
