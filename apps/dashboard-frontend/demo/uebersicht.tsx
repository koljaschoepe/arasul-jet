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
import { txt, type AppKennung, type Eintrag } from './bestand';
import { FIRMA, kunde, lieferant, maschine, name, ARTIKEL } from './firma';
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
  const std = Math.round(min / 60);
  if (std < 24) return t(`vor ${std} Std.`, `${std} h ago`);
  const d = Math.round(std / 24);
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
    const offen = d.angebote.filter(e =>
      ['entwurf', 'freigabe', 'freigegeben', 'versendet'].includes(e.stand)
    );
    const heuteErwartet = d.wareneingang.filter(
      e => e.stand === 'erwartet' && tage(e.felder.erwartet) <= 0
    );
    const zuPruefen = d.wareneingang.filter(e => e.stand === 'eingegangen');
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
            beschriftung={t('Lieferungen heute', 'Deliveries today')}
            wert={String(heuteErwartet.length)}
            fussnote={t(
              `${zuPruefen.length} warten auf Prüfung`,
              `${zuPruefen.length} awaiting check`
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
            beschriftung={t('Prüfungen zur Freigabe', 'Inspections to approve')}
            wert={String(pruefFreigabe.length)}
            fussnote={t(`${nacharbeit.length} in Nacharbeit`, `${nacharbeit.length} in rework`)}
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
            beschriftung={t('Rückmeldungen offen', 'Open feedback')}
            wert={String(meldungen.length)}
            fussnote={t('in der Werkstatt', 'in the workshop')}
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
      neben: `${n === 0 ? t('ab heute', 'from today') : t(`ab ${n === 1 ? 'morgen' : 'übermorgen'}`, `from ${n === 1 ? 'tomorrow' : 'the day after'}`)}, ${e.felder.tage} ${t('Tage', 'days')} · ${t('Vertretung', 'cover')} ${name(Number(e.felder.vertretung))}`,
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
