/**
 * Die Form jeder Fach-App der Demo (J54, M7): so sähe eine App aus, die das
 * Kit für einen Metallbauer baut. Eine Seite, oben der Seitenkopf mit den
 * Aktionen, darunter Kennzahlen mit Verlauf, eine Auswertung als Diagramm,
 * was als Nächstes ansteht, dann die Liste mit Suche, Filter nach Stand und
 * Sortierung. Ein Klick auf eine Zeile öffnet die Einzelansicht als Blatt
 * (am Rechner rechts daneben, am Handy von unten) mit Feldern, Dateien und
 * Verlauf; dort wird bearbeitet, der Stand geändert, freigegeben, gelöscht.
 *
 * Jede App beschreibt nur ihre Fachlichkeit (`AppDef`): Felder, Spalten,
 * Schritte, Kennzahlen, Diagramm. Alles, was sie tut, geht an ihre eigene
 * Schnittstelle (`api/…`); in der Demo antwortet der Service Worker.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Badge,
  Bestaetigung,
  Blatt,
  Button,
  Checkbox,
  Datenliste,
  Dialogform,
  Dokumentanzeige,
  Feld,
  Formular,
  Icon,
  Kennzahl,
  Kennzahlen,
  Knopf,
  Kopf,
  Meldung,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Werkzeug,
  useSchmalesFenster,
  type KennzahlProps,
  type Spalte,
} from '@marken';
import {
  CalendarDays,
  ChartColumn,
  Download,
  FileText,
  Image as BildSymbol,
  LayoutDashboard,
  List as ListIcon,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from '@marken/symbole';
import type { AppKennung, Eintrag, Wert } from '../bestand';
import { STAENDE, FREIGABE_STAND } from '../bestand';
import { name } from '../firma';
import { Auswertung, DiagrammFlaeche, type AuswertungDef } from './auswertung';
import { Druck } from './druck';
import { Kalender, type KalenderDef } from './kalender';
import {
  api,
  csvLaden,
  dateiAdresse,
  pdfAdresse,
  SPRACHE,
  stammLaden,
  stammOeffnen,
  t,
  tx,
  wann,
  type Sprache,
  type StammArt,
} from './gemeinsam';

export type { Teil, RanglistenZeile, AuswertungDef } from './auswertung';
export type { Termin, KalenderDef } from './kalender';

export interface Ctx {
  sp: Sprache;
  /** Die Fassung, die in diesem Stand läuft. */
  fassung: string | undefined;
  stand: 'live' | 'test';
}

export interface FeldDef {
  key: string;
  titel: string;
  art: 'text' | 'textlang' | 'zahl' | 'datum' | 'auswahl';
  optionen?: [string, string][];
  pflicht?: boolean;
  hinweis?: string;
  /** Anzeige in der Einzelansicht; ohne Angabe der Text des Werts. */
  anzeigen?: (w: Wert, e: Eintrag) => ReactNode;
  /** Im Formular nicht gezeigt (berechnet oder vom Ablauf gesetzt). */
  nurAnzeige?: boolean;
  min?: number;
}

export interface Schritt {
  nach: string;
  text: string;
  symbol: LucideIcon;
  haupt?: boolean;
  /** Fragt vorher nach einem Satz, der in den Verlauf geht. */
  mitGrund?: string;
}

export interface Diagramm {
  titel: string;
  satz: string;
  art: 'linie' | 'balken';
  data: { x: number; name: string; [k: string]: number | string }[];
  series: { key: string; name: string; unit?: string }[];
  formatY?: (n: number) => string;
  hoehe?: number;
}

export interface Hinweis {
  e: Eintrag;
  satz: string;
  wichtig?: boolean;
  /** Wartet auf eine Freigabe: blau, nicht rot (Rot heißt Fehler). */
  freigabe?: boolean;
}

export interface AppDef {
  id: AppKennung;
  titel: string;
  satz: (ctx: Ctx) => string;
  einzahl: string;
  neuText: string;
  felder: (ctx: Ctx) => FeldDef[];
  titelVon: (e: Eintrag) => string;
  nebenVon: (e: Eintrag) => string;
  spalten: (ctx: Ctx) => Spalte<Eintrag>[];
  kennzahlen: (liste: Eintrag[], ctx: Ctx) => KennzahlProps[];
  diagramm: (liste: Eintrag[], ctx: Ctx) => Diagramm;
  naechstes: { titel: string; leer: string; liste: (liste: Eintrag[], ctx: Ctx) => Hinweis[] };
  schritte: (e: Eintrag, ctx: Ctx) => Schritt[];
  startStand: string;
  vorbelegung: (ctx: Ctx) => Record<string, Wert>;
  pruefen?: (f: Record<string, Wert>, ctx: Ctx) => Record<string, string>;
  /** Der Stand, mit dem ein neuer Eintrag anlegt wird, aus seinen Feldern. */
  standBeimAnlegen?: (f: Record<string, Wert>) => string;
  csv: (e: Eintrag) => Record<string, string>;
  /** Die Reihenfolge der Liste, bevor jemand eine Spalte sortiert. */
  ordnen?: (a: Eintrag, b: Eintrag) => number;
  /** Der Reiter „Auswertung" (J55): Zeitraum, Kennzahlen, Diagramme, Tabellen. */
  auswertung: AuswertungDef;
  /** Der Reiter „Kalender" (J55), nur wo Termine das Wesentliche sind. */
  kalender?: KalenderDef;
}

const VARIANTE: Record<
  string,
  'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'outline'
> = {
  entwurf: 'outline',
  freigabe: 'warning',
  beantragt: 'warning',
  freigegeben: 'primary',
  versendet: 'default',
  angenommen: 'success',
  genehmigt: 'success',
  abgelehnt: 'destructive',
  erwartet: 'outline',
  eingegangen: 'default',
  geprueft: 'primary',
  eingelagert: 'success',
  reklamiert: 'destructive',
  geplant: 'outline',
  in_arbeit: 'warning',
  erledigt: 'success',
  offen: 'outline',
  nacharbeit: 'destructive',
};

export function StandMarke({ app, stand }: { app: AppKennung; stand: string }) {
  const text = STAENDE[app].find(([k]) => k === stand)?.[1];
  return <Badge variant={VARIANTE[stand] ?? 'default'}>{text ? text[SPRACHE] : stand}</Badge>;
}

/**
 * Ein Verweis auf einen Stammsatz (J55): Kunde, Lieferant, Maschine oder
 * Person öffnet sich in den Stammdaten, mit allen Vorgängen dazu.
 */
export function StammLink({
  art,
  id,
  children,
}: {
  art: StammArt;
  id: number | string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="fa-stammlink"
      onClick={ev => {
        ev.stopPropagation();
        stammOeffnen(art, id);
      }}
      data-testid={`fa-stamm-${art}`}
    >
      {children}
    </button>
  );
}

const MONO = { fontFamily: 'var(--font-mono)', fontSize: '0.92em' } as const;
export const Mono = ({ children }: { children: ReactNode }) => <span style={MONO}>{children}</span>;

/** Ein Auftrag aus der Startseite: „neu anlegen" (Schnellzugriff). */
const AUFTRAG = 'arasul-demo-auftrag';

function auftragLesen(app: AppKennung): { felder?: Record<string, Wert> } | null {
  try {
    const roh = window.localStorage.getItem(AUFTRAG);
    if (!roh) return null;
    const a = JSON.parse(roh) as { app?: string; aktion?: string; felder?: Record<string, Wert> };
    if (a.app !== app || a.aktion !== 'neu') return null;
    window.localStorage.removeItem(AUFTRAG);
    return { felder: a.felder };
  } catch {
    return null;
  }
}

/**
 * Eng ist die App unter 640 px: dann stehen neben dem Titel nur Symbole, der
 * Satz darunter über die volle Breite. Neben Kapsel und Titel ist am Handy
 * kein Platz für einen Knopf mit Text.
 */
function useEng(): boolean {
  const [eng, setEng] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const messen = () => setEng(window.innerWidth < 640);
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, []);
  return eng;
}

type Toast = { art: 'erfolg' | 'fehler' | 'hinweis'; text: string } | null;

export type Reiter = 'uebersicht' | 'liste' | 'kalender' | 'auswertung';

/** Der Reiter steht in der Adresse der App (`?ansicht=`), damit Neuladen ihn hält. */
function reiterAusAdresse(mitKalender: boolean): Reiter {
  const r = new URLSearchParams(window.location.search).get('ansicht');
  if (r === 'liste' || r === 'auswertung') return r;
  if (r === 'kalender' && mitKalender) return r;
  return 'uebersicht';
}

function reiterInAdresse(r: Reiter): void {
  const url = new URL(window.location.href);
  if (r === 'uebersicht') url.searchParams.delete('ansicht');
  else url.searchParams.set('ansicht', r);
  url.searchParams.delete('freigabe');
  window.history.replaceState(null, '', url);
}

function FachApp({ def }: { def: AppDef }) {
  const [liste, setListe] = useState<Eintrag[] | null>(null);
  const [fassung, setFassung] = useState<{ version: string; stand: 'live' | 'test' } | null>(null);
  const [reiter, setReiter] = useState<Reiter>(() => reiterAusAdresse(Boolean(def.kalender)));
  const [filter, setFilter] = useState<string>('alle');
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [markiert, setMarkiert] = useState<Set<number>>(() => new Set());
  const [formular, setFormular] = useState<{
    e: Eintrag | null;
    vorbelegt?: Record<string, Wert>;
  } | null>(null);
  const [loeschen, setLoeschen] = useState<Eintrag[] | null>(null);
  const [grund, setGrund] = useState<{ e: Eintrag; schritt: Schritt | 'ablehnen' } | null>(null);
  const [druck, setDruck] = useState<Eintrag[] | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const uhr = useRef<number | undefined>(undefined);
  const ctx: Ctx = useMemo(
    () => ({ sp: SPRACHE, fassung: fassung?.version, stand: fassung?.stand ?? 'live' }),
    [fassung]
  );
  const eng = useEng();
  // Die Fassung nennt die Seite nur in der Testfassung; im Alltag interessiert sie niemanden.
  const satz = `${def.satz(ctx)}${fassung?.stand === 'test' ? ` ${t('Testfassung', 'Test version')} ${fassung.version}.` : ''}`;

  const wechseln = useCallback((r: Reiter) => {
    setReiter(r);
    reiterInAdresse(r);
  }, []);

  const melden = useCallback((art: NonNullable<Toast>['art'], text: string) => {
    setToast({ art, text });
    window.clearTimeout(uhr.current);
    uhr.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const laden = useCallback(async () => {
    await stammLaden();
    const d = await api.daten();
    setListe(d.eintraege);
    return d.eintraege;
  }, []);

  useEffect(() => {
    void api
      .fassung()
      .then(setFassung)
      .catch(() => setFassung(null));
    void laden().then(eintraege => {
      // Aus „Für Sie" auf der Startseite oder aus den Stammdaten: die App öffnet beim Vorgang.
      const vorgang = Number(new URLSearchParams(window.location.search).get('freigabe'));
      if (vorgang && eintraege.some(e => e.id === vorgang)) setGewaehlt(vorgang);
      const auftrag = auftragLesen(def.id);
      if (auftrag) setFormular({ e: null, vorbelegt: auftrag.felder });
    });
    const beiSpeicher = (ev: StorageEvent) => {
      if (ev.key === AUFTRAG) {
        const auftrag = auftragLesen(def.id);
        if (auftrag) setFormular({ e: null, vorbelegt: auftrag.felder });
      }
      if (ev.key === 'arasul-demo-neu') void laden();
    };
    window.addEventListener('storage', beiSpeicher);
    return () => window.removeEventListener('storage', beiSpeicher);
  }, [def.id, laden]);

  const bescheidGeben = () => {
    try {
      window.localStorage.setItem('arasul-demo-neu', String(Date.now()));
    } catch {
      /* ohne Speicher nur hier */
    }
  };

  /** Nach jeder Änderung: der Eintrag in der Liste, und die Startseite erfährt es. */
  const uebernehmen = useCallback((e: Eintrag) => {
    setListe(l =>
      l ? (l.some(x => x.id === e.id) ? l.map(x => (x.id === e.id ? e : x)) : [e, ...l]) : l
    );
    bescheidGeben();
  }, []);

  const eintraege = useMemo(
    () => (liste && def.ordnen ? [...liste].sort(def.ordnen) : (liste ?? [])),
    [liste, def]
  );
  const gezeigt = useMemo(
    () => (filter === 'alle' ? eintraege : eintraege.filter(e => e.stand === filter)),
    [eintraege, filter]
  );
  const auswahl = eintraege.find(e => e.id === gewaehlt) ?? null;
  const gewaehlte = eintraege.filter(e => markiert.has(e.id));

  const standSetzen = async (e: Eintrag, s: Schritt, notiz?: string) => {
    try {
      const neu = await api.aendern(e.id, { stand: s.nach, notiz });
      uebernehmen(neu);
      melden('erfolg', `${e.nr}: ${s.text}.`);
    } catch (f) {
      melden('fehler', (f as Error).message);
    }
  };

  const schrittAusfuehren = (e: Eintrag, s: Schritt) => {
    if (s.mitGrund) setGrund({ e, schritt: s });
    else void standSetzen(e, s);
  };

  const exportieren = (welche: Eintrag[]) => {
    const zeilen = welche.map(def.csv);
    const kopf = Object.keys(zeilen[0] ?? def.csv(eintraege[0]!));
    csvLaden(
      `${def.titel.toLowerCase().replace(/[^a-zäöü0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
      kopf,
      zeilen.map(z => kopf.map(k => z[k] ?? ''))
    );
    melden(
      'erfolg',
      t(
        `${welche.length} Einträge als CSV exportiert.`,
        `${welche.length} entries exported as CSV.`
      )
    );
  };

  // ── Mehrfachauswahl ──────────────────────────────────────────────────────
  const markieren = (id: number, an: boolean) =>
    setMarkiert(m => {
      const neu = new Set(m);
      if (an) neu.add(id);
      else neu.delete(id);
      return neu;
    });
  const alleGezeigtMarkiert = gezeigt.length > 0 && gezeigt.every(e => markiert.has(e.id));
  const sammelSchritte = useMemo(() => {
    const [erste, ...rest] = gewaehlte;
    if (!erste) return [];
    return def
      .schritte(erste, ctx)
      .filter(
        s => !s.mitGrund && rest.every(e => def.schritte(e, ctx).some(x => x.nach === s.nach))
      );
  }, [gewaehlte, def, ctx]);
  const alleWarten =
    gewaehlte.length > 0 && gewaehlte.every(e => FREIGABE_STAND[def.id] === e.stand);

  /** Eine Aktion für jeden gewählten Eintrag, nacheinander, dann eine Meldung. */
  const sammeln = async (
    tun: (e: Eintrag) => Promise<Eintrag | null>,
    satzFertig: (n: number) => string
  ) => {
    let n = 0;
    for (const e of gewaehlte) {
      try {
        const neu = await tun(e);
        if (neu) uebernehmen(neu);
        n += 1;
      } catch (f) {
        melden('fehler', `${e.nr}: ${(f as Error).message}`);
        return;
      }
    }
    setMarkiert(new Set());
    melden('erfolg', satzFertig(n));
  };

  const wahlSpalte: Spalte<Eintrag> = {
    schluessel: 'wahl',
    titel: '',
    breite: '2.25rem',
    inKarteOben: true,
    zelle: e => (
      // Ein Klick hier öffnet nicht die Zeile.
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <span className="fa-wahl" onClick={ev => ev.stopPropagation()}>
        <Checkbox
          checked={markiert.has(e.id)}
          onCheckedChange={an => markieren(e.id, an === true)}
          aria-label={t(`${e.nr} auswählen`, `Select ${e.nr}`)}
          data-testid={`fa-wahl-${e.nr}`}
        />
      </span>
    ),
  };

  const spalten: Spalte<Eintrag>[] = [
    wahlSpalte,
    ...def.spalten(ctx),
    {
      schluessel: 'stand',
      titel: t('Stand', 'Status'),
      breite: '8.5rem',
      wert: e => STAENDE[def.id].findIndex(([k]) => k === e.stand),
      zelle: e => <StandMarke app={def.id} stand={e.stand} />,
      inKarteOben: true,
    },
    {
      schluessel: 'aktionen',
      titel: t('Aktionen', 'Actions'),
      breite: '7rem',
      ausrichtung: 'rechts',
      // Am Handy keine Knöpfe in der Karte: ein Tipp öffnet das Blatt mit
      // allen Aktionen, und „31.250 € ·" mit Symbolen dahinter las sich wie
      // ein abgebrochener Satz (Prüfer J55).
      inKarte: false,
      zelle: e => <ZeilenAktionen e={e} />,
    },
  ];

  function ZeilenAktionen({ e }: { e: Eintrag }) {
    const haupt = def.schritte(e, ctx).find(s => s.haupt);
    return (
      // Ein Klick hier öffnet nicht die Zeile.
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <span className="fa-zeilenaktionen" onClick={ev => ev.stopPropagation()}>
        {haupt && (
          <Werkzeug
            symbol={<Icon symbol={haupt.symbol} />}
            beschriftung={`${haupt.text}: ${e.nr}`}
            onClick={() => schrittAusfuehren(e, haupt)}
          />
        )}
        <Werkzeug
          symbol={<Icon symbol={Pencil} />}
          beschriftung={t(`${e.nr} bearbeiten`, `Edit ${e.nr}`)}
          onClick={() => setFormular({ e })}
        />
        <Werkzeug
          symbol={<Icon symbol={Trash2} />}
          beschriftung={t(`${e.nr} löschen`, `Delete ${e.nr}`)}
          onClick={() => setLoeschen([e])}
        />
      </span>
    );
  }

  const diagramm = liste ? def.diagramm(eintraege, ctx) : null;
  const hinweise = liste ? def.naechstes.liste(eintraege, ctx).slice(0, 5) : [];
  const zaehler = (stand: string) => eintraege.filter(e => e.stand === stand).length;
  const zuletzt = useMemo(
    () =>
      eintraege
        .flatMap(e => e.verlauf.map(s => ({ e, s })))
        .sort((a, b) => b.s.am.localeCompare(a.s.am))
        .slice(0, 6),
    [eintraege]
  );

  return (
    <div className={eng ? 'fa-seite fa-eng' : 'fa-seite'}>
      <Kopf
        titel={def.titel}
        beschreibung={eng ? undefined : satz}
        werkzeuge={
          <>
            {eng && (
              <Werkzeug
                symbol={<Icon symbol={Plus} />}
                beschriftung={def.neuText}
                onClick={() => setFormular({ e: null })}
                data-testid="fa-neu"
              />
            )}
            <Werkzeug
              symbol={<Icon symbol={Download} />}
              beschriftung={t('Liste als CSV exportieren', 'Export list as CSV')}
              onClick={() => exportieren(gezeigt)}
              data-testid="fa-export"
            />
          </>
        }
        aktionen={
          eng ? undefined : (
            <Button variant="solid" onClick={() => setFormular({ e: null })} data-testid="fa-neu">
              <Icon symbol={Plus} />
              {def.neuText}
            </Button>
          )
        }
      />
      {eng && <p className="fa-satz fa-satz-oben">{satz}</p>}

      <Tabs value={reiter} onValueChange={v => wechseln(v as Reiter)} className="fa-reiter">
        <TabsList aria-label={t('Ansichten', 'Views')} className="fa-nicht-drucken">
          <TabsTrigger value="uebersicht" data-testid="fa-reiter-uebersicht">
            <Icon symbol={LayoutDashboard} groesse="klein" />
            {t('Übersicht', 'Overview')}
          </TabsTrigger>
          <TabsTrigger value="liste" data-testid="fa-reiter-liste">
            <Icon symbol={ListIcon} groesse="klein" />
            {t('Liste', 'List')}
            <span className="fa-reiter-zahl">{eintraege.length || ''}</span>
          </TabsTrigger>
          {def.kalender && (
            <TabsTrigger value="kalender" data-testid="fa-reiter-kalender">
              <Icon symbol={CalendarDays} groesse="klein" />
              {t('Kalender', 'Calendar')}
            </TabsTrigger>
          )}
          <TabsTrigger value="auswertung" data-testid="fa-reiter-auswertung">
            <Icon symbol={ChartColumn} groesse="klein" />
            {t('Auswertung', 'Report')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uebersicht" className="fa-tab">
          {liste ? (
            <Kennzahlen>
              {def.kennzahlen(eintraege, ctx).map(k => (
                <Kennzahl key={k.beschriftung} {...k} />
              ))}
            </Kennzahlen>
          ) : (
            <div className="fa-platzhalter" />
          )}

          {diagramm && (
            <div className="fa-reihe">
              <section className="fa-flaeche" aria-labelledby={`${def.id}-diagramm`}>
                <DiagrammFlaeche d={diagramm} kennung={`${def.id}-diagramm`} />
              </section>
              <section className="fa-flaeche" aria-labelledby={`${def.id}-naechstes`}>
                <h2 id={`${def.id}-naechstes`} className="fa-abschnitt">
                  {def.naechstes.titel}
                </h2>
                {hinweise.length === 0 ? (
                  <p className="fa-satz">{def.naechstes.leer}</p>
                ) : (
                  <ul className="fa-hinweise">
                    {hinweise.map(h => (
                      <li key={h.e.id}>
                        <button
                          type="button"
                          onClick={() => setGewaehlt(h.e.id)}
                          data-wichtig={h.wichtig ? 'ja' : undefined}
                          data-freigabe={h.freigabe ? 'ja' : undefined}
                        >
                          <span className="fa-hinweis-titel">
                            {h.e.nr} {def.titelVon(h.e)}
                          </span>
                          <span className="fa-hinweis-satz">{h.satz}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {liste && (
            <div className="fa-reihe fa-reihe-gleich">
              <section className="fa-flaeche" aria-labelledby={`${def.id}-staende`}>
                <h2 id={`${def.id}-staende`} className="fa-abschnitt">
                  {t('Nach Stand', 'By status')}
                </h2>
                <p className="fa-satz">
                  {t(
                    `${eintraege.length} Einträge. Ein Klick zeigt sie in der Liste.`,
                    `${eintraege.length} entries. Click to see them in the list.`
                  )}
                </p>
                <ol className="fa-rangliste">
                  {STAENDE[def.id].map(([k, text]) => (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => {
                          setFilter(k);
                          wechseln('liste');
                        }}
                      >
                        <span className="fa-rang-name">{text[SPRACHE]}</span>
                        <span className="fa-rang-wert">{zaehler(k)}</span>
                        <span className="fa-rang-balken" aria-hidden="true">
                          <span
                            style={{
                              width: `${Math.max(1, (zaehler(k) / Math.max(1, eintraege.length)) * 100)}%`,
                            }}
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="fa-flaeche" aria-labelledby={`${def.id}-zuletzt`}>
                <h2 id={`${def.id}-zuletzt`} className="fa-abschnitt">
                  {t('Zuletzt geändert', 'Recently changed')}
                </h2>
                <ul className="fa-hinweise">
                  {zuletzt.map(({ e, s }, i) => (
                    <li key={`${e.id}-${s.am}-${i}`}>
                      <button type="button" onClick={() => setGewaehlt(e.id)}>
                        <span className="fa-hinweis-titel">
                          {e.nr} · {tx(s.text)}
                        </span>
                        <span className="fa-hinweis-satz">
                          {def.titelVon(e)} · {name(s.wer)} · {wann(s.am)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </TabsContent>

        <TabsContent value="liste" className="fa-tab">
          <section className="fa-liste" aria-label={t('Liste', 'List')}>
            <div
              className="fa-filter"
              role="group"
              aria-label={t('Nach Stand filtern', 'Filter by status')}
            >
              <button
                type="button"
                aria-pressed={filter === 'alle'}
                onClick={() => setFilter('alle')}
                data-treffer-selbst=""
              >
                {t('Alle', 'All')} <span>{eintraege.length}</span>
              </button>
              {STAENDE[def.id].map(([k, text]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={filter === k}
                  onClick={() => setFilter(filter === k ? 'alle' : k)}
                  data-treffer-selbst=""
                >
                  {text[SPRACHE]} <span>{zaehler(k)}</span>
                </button>
              ))}
            </div>

            <div
              className="fa-sammel"
              data-aktiv={gewaehlte.length ? 'ja' : undefined}
              data-testid="fa-sammel"
            >
              <label className="fa-sammel-alle">
                <Checkbox
                  checked={alleGezeigtMarkiert ? true : gewaehlte.length ? 'indeterminate' : false}
                  onCheckedChange={an =>
                    setMarkiert(an === true ? new Set(gezeigt.map(e => e.id)) : new Set())
                  }
                  data-testid="fa-wahl-alle"
                />
                {gewaehlte.length
                  ? t(`${gewaehlte.length} ausgewählt`, `${gewaehlte.length} selected`)
                  : t(`Alle ${gezeigt.length} auswählen`, `Select all ${gezeigt.length}`)}
              </label>
              {gewaehlte.length > 0 && (
                <div className="fa-knoepfe">
                  {alleWarten && (
                    <Button
                      size="sm"
                      variant="solid"
                      data-testid="fa-sammel-freigeben"
                      onClick={() =>
                        void sammeln(
                          async e => (await api.freigabe(e.id, 'ja')).eintrag,
                          n => t(`${n} freigegeben.`, `${n} approved.`)
                        )
                      }
                    >
                      <Icon symbol={ShieldCheck} />
                      {t('Alle freigeben', 'Approve all')}
                    </Button>
                  )}
                  {!alleWarten &&
                    sammelSchritte.map(s => (
                      <Button
                        key={s.nach}
                        size="sm"
                        variant={s.haupt ? 'solid' : 'default'}
                        data-testid={`fa-sammel-${s.nach}`}
                        onClick={() =>
                          void sammeln(
                            e => api.aendern(e.id, { stand: s.nach }),
                            n => `${s.text}: ${n} ${n === 1 ? def.einzahl : def.titel}.`
                          )
                        }
                      >
                        <Icon symbol={s.symbol} />
                        {s.text}
                      </Button>
                    ))}
                  <Button size="sm" onClick={() => setDruck(gewaehlte)}>
                    <Icon symbol={Printer} />
                    {t('Drucken', 'Print')}
                  </Button>
                  <Button size="sm" onClick={() => exportieren(gewaehlte)}>
                    <Icon symbol={Download} />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setLoeschen(gewaehlte)}
                    data-testid="fa-sammel-loeschen"
                  >
                    <Icon symbol={Trash2} />
                    {t('Löschen', 'Delete')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMarkiert(new Set())}>
                    {t('Auswahl aufheben', 'Clear selection')}
                  </Button>
                </div>
              )}
            </div>

            <Datenliste
              daten={gezeigt}
              spalten={spalten}
              kennung={e => String(e.id)}
              beschriftung={t(`${def.titel}, neueste zuerst`, `${def.titel}, newest first`)}
              laedt={!liste}
              filter
              filterPlatzhalter={t('Suchen: Nummer, Name, Text', 'Search: number, name, text')}
              leer={{
                titel: t('Hier steht noch nichts.', 'Nothing here yet.'),
                beschreibung: t('Legen Sie den ersten Eintrag an.', 'Create the first entry.'),
                aktion: (
                  <Button variant="solid" onClick={() => setFormular({ e: null })}>
                    {def.neuText}
                  </Button>
                ),
              }}
              leerGefiltert={t(
                'Kein Eintrag passt zu Suche und Filter.',
                'No entry matches search and filter.'
              )}
              aufZeile={e => setGewaehlt(e.id)}
              gewaehlt={gewaehlt === null ? null : String(gewaehlt)}
              zeilenKennzeichen={e => `fa-zeile-${e.nr}`}
            />
          </section>
        </TabsContent>

        {def.kalender && (
          <TabsContent value="kalender" className="fa-tab">
            <section className="fa-flaeche">
              <Kalender def={def.kalender} liste={eintraege} oeffnen={setGewaehlt} />
            </section>
          </TabsContent>
        )}

        <TabsContent value="auswertung" className="fa-tab">
          {liste && (
            <Auswertung
              appId={def.id}
              titel={def.titel}
              def={def.auswertung}
              liste={eintraege}
              ctx={ctx}
              oeffnen={setGewaehlt}
            />
          )}
        </TabsContent>
      </Tabs>

      <Einzelansicht
        def={def}
        ctx={ctx}
        e={auswahl}
        schliessen={() => setGewaehlt(null)}
        bearbeiten={e => setFormular({ e })}
        loeschen={e => setLoeschen([e])}
        schritt={schrittAusfuehren}
        ablehnen={e => setGrund({ e, schritt: 'ablehnen' })}
        drucken={e => setDruck([e])}
        uebernehmen={uebernehmen}
        melden={melden}
      />

      {formular && (
        <Eingabe
          def={def}
          ctx={ctx}
          e={formular.e}
          vorbelegt={formular.vorbelegt}
          schliessen={() => setFormular(null)}
          gespeichert={(e, neu) => {
            uebernehmen(e);
            setFormular(null);
            setGewaehlt(e.id);
            melden(
              'erfolg',
              neu
                ? t(`${def.einzahl} ${e.nr} angelegt.`, `${def.einzahl} ${e.nr} created.`)
                : t(`${e.nr} gespeichert.`, `${e.nr} saved.`)
            );
          }}
        />
      )}

      <Bestaetigung
        offen={loeschen !== null}
        beiSchliessen={() => setLoeschen(null)}
        titel={
          loeschen && loeschen.length > 1
            ? t(`${loeschen.length} Einträge löschen?`, `Delete ${loeschen.length} entries?`)
            : t(`${def.einzahl} löschen?`, `Delete ${def.einzahl.toLowerCase()}?`)
        }
        frage={
          loeschen?.length === 1
            ? t(
                `${loeschen[0]!.nr} „${def.titelVon(loeschen[0]!)}" wird mit Dateien und Verlauf gelöscht.`,
                `${loeschen[0]!.nr} “${def.titelVon(loeschen[0]!)}” is deleted with its files and history.`
              )
            : loeschen
              ? t(
                  `${loeschen.map(e => e.nr).join(', ')} werden mit Dateien und Verlauf gelöscht.`,
                  `${loeschen.map(e => e.nr).join(', ')} are deleted with their files and history.`
                )
              : ''
        }
        jaText={t('Löschen', 'Delete')}
        neinText={t('Abbrechen', 'Cancel')}
        art="gefahr"
        beiBestaetigen={async () => {
          if (!loeschen) return;
          const weg = loeschen;
          for (const e of weg) await api.loeschen(e.id);
          const ids = new Set(weg.map(e => e.id));
          setListe(l => (l ? l.filter(x => !ids.has(x.id)) : l));
          setMarkiert(m => new Set([...m].filter(id => !ids.has(id))));
          if (gewaehlt !== null && ids.has(gewaehlt)) setGewaehlt(null);
          setLoeschen(null);
          melden(
            'erfolg',
            weg.length === 1
              ? t(`${weg[0]!.nr} gelöscht.`, `${weg[0]!.nr} deleted.`)
              : t(`${weg.length} Einträge gelöscht.`, `${weg.length} entries deleted.`)
          );
          bescheidGeben();
        }}
      />

      {grund && (
        <GrundDialog
          titel={grund.schritt === 'ablehnen' ? t('Ablehnen', 'Decline') : grund.schritt.text}
          frage={
            grund.schritt === 'ablehnen'
              ? t(
                  'Warum lehnen Sie ab? Der Satz steht im Verlauf.',
                  'Why are you declining? The sentence goes into the history.'
                )
              : (grund.schritt.mitGrund ?? '')
          }
          pflicht={grund.schritt === 'ablehnen'}
          schliessen={() => setGrund(null)}
          bestaetigen={async satz => {
            const { e, schritt } = grund;
            setGrund(null);
            if (schritt === 'ablehnen') {
              try {
                const r = await api.freigabe(e.id, 'nein', satz);
                uebernehmen(r.eintrag);
                melden('erfolg', t(`${e.nr} abgelehnt.`, `${e.nr} declined.`));
              } catch (f) {
                melden('fehler', (f as Error).message);
              }
            } else {
              await standSetzen(e, schritt, satz || undefined);
            }
          }}
        />
      )}

      {druck && <Druck def={def} ctx={ctx} eintraege={druck} fertig={druckFertig(setDruck)} />}

      {toast && (
        <div className="fa-toast" role="status" aria-live="polite">
          <Meldung art={toast.art}>{toast.text}</Meldung>
        </div>
      )}
    </div>
  );
}

/** Ein fester Rückruf je Setzer, damit der Druck nicht bei jedem Bild neu beginnt. */
const druckFertige = new WeakMap<object, () => void>();
function druckFertig(setzen: (x: null) => void): () => void {
  let f = druckFertige.get(setzen);
  if (!f) {
    f = () => setzen(null);
    druckFertige.set(setzen, f);
  }
  return f;
}

// ── Einzelansicht ───────────────────────────────────────────────────────────

function Einzelansicht({
  def,
  ctx,
  e,
  schliessen,
  bearbeiten,
  loeschen,
  schritt,
  ablehnen,
  drucken,
  uebernehmen,
  melden,
}: {
  def: AppDef;
  ctx: Ctx;
  e: Eintrag | null;
  schliessen: () => void;
  bearbeiten: (e: Eintrag) => void;
  loeschen: (e: Eintrag) => void;
  schritt: (e: Eintrag, s: Schritt) => void;
  ablehnen: (e: Eintrag) => void;
  drucken: (e: Eintrag) => void;
  uebernehmen: (e: Eintrag) => void;
  melden: (art: 'erfolg' | 'fehler' | 'hinweis', text: string) => void;
}) {
  const schmal = useSchmalesFenster();
  const [datei, setDatei] = useState<{
    id: string;
    name: string;
    art: 'pdf' | 'bild';
    adresse?: string;
  } | null>(null);
  const [notiz, setNotiz] = useState('');
  const eingabe = useRef<HTMLInputElement>(null);
  const [letzte, setLetzte] = useState<Eintrag | null>(e);
  useEffect(() => {
    if (e) setLetzte(e);
    setNotiz('');
  }, [e]);
  const x = e ?? letzte;
  const wartet = x && FREIGABE_STAND[def.id] === x.stand;

  const hochladen = (liste: FileList | null) => {
    const f = liste?.[0];
    if (!f || !x) return;
    if (f.size > 2_000_000) {
      melden('fehler', t('Die Datei ist größer als 2 MB.', 'The file is larger than 2 MB.'));
      return;
    }
    const leser = new FileReader();
    leser.onload = async () => {
      try {
        uebernehmen(await api.dateiAnhaengen(x.id, f.name, String(leser.result)));
        melden('erfolg', t(`${f.name} angehängt.`, `${f.name} attached.`));
      } catch (fe) {
        melden('fehler', (fe as Error).message);
      }
    };
    leser.readAsDataURL(f);
  };

  return (
    <>
      <Blatt
        offen={e !== null}
        beiSchliessen={schliessen}
        oben={
          x && (
            <span className="fa-blatt-nr">
              {x.nr} <StandMarke app={def.id} stand={x.stand} />
            </span>
          )
        }
        titel={x ? def.titelVon(x) : ''}
        beschreibung={x ? def.nebenVon(x) : undefined}
        breite="breit"
        kennzeichen="fa-blatt-flaeche"
        fuss={
          x &&
          (wartet ? (
            <>
              <Button
                variant="solid"
                data-testid="fa-freigeben"
                onClick={async () => {
                  try {
                    const r = await api.freigabe(x.id, 'ja');
                    uebernehmen(r.eintrag);
                    melden('erfolg', t(`${x.nr} freigegeben.`, `${x.nr} approved.`));
                  } catch (f) {
                    melden('fehler', (f as Error).message);
                  }
                }}
              >
                {t('Freigeben', 'Approve')}
              </Button>
              <Button onClick={() => ablehnen(x)}>{t('Ablehnen', 'Decline')}</Button>
            </>
          ) : (
            <>
              {def
                .schritte(x, ctx)
                .filter(s => !(wartet && s.nach === x.stand))
                .map(s => (
                  <Button
                    key={s.nach}
                    variant={s.haupt && !wartet ? 'solid' : 'default'}
                    size="sm"
                    onClick={() => schritt(x, s)}
                  >
                    <Icon symbol={s.symbol} />
                    {s.text}
                  </Button>
                ))}
              <Button size="sm" onClick={() => bearbeiten(x)} data-testid="fa-bearbeiten">
                <Icon symbol={Pencil} />
                {t('Bearbeiten', 'Edit')}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => loeschen(x)}>
                <Icon symbol={Trash2} />
                {t('Löschen', 'Delete')}
              </Button>
            </>
          ))
        }
      >
        {x && (
          <div className="fa-blatt-inhalt" data-testid="fa-blatt">
            {wartet && (
              <div className="fa-freigabe" data-testid="fa-freigabe">
                <Meldung
                  art="hinweis"
                  titel={t('Wartet auf Ihre Freigabe', 'Waiting for your approval')}
                >
                  {t(
                    'Bei einer Ablehnung nennen Sie kurz den Grund, er steht danach im Verlauf.',
                    'If you decline, give a short reason; it is kept in the history.'
                  )}
                </Meldung>
                {/* Freigeben und Ablehnen stehen unten im Fuß des Blatts, in
                    Daumenreichweite; die übrigen Aktionen hier. */}
                <div className="fa-knoepfe">
                  {def
                    .schritte(x, ctx)
                    .filter(s => !(wartet && s.nach === x.stand))
                    .map(s => (
                      <Button
                        key={s.nach}
                        variant={s.haupt && !wartet ? 'solid' : 'default'}
                        size="sm"
                        onClick={() => schritt(x, s)}
                      >
                        <Icon symbol={s.symbol} />
                        {s.text}
                      </Button>
                    ))}
                  <Button size="sm" onClick={() => bearbeiten(x)} data-testid="fa-bearbeiten">
                    <Icon symbol={Pencil} />
                    {t('Bearbeiten', 'Edit')}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => loeschen(x)}>
                    <Icon symbol={Trash2} />
                    {t('Löschen', 'Delete')}
                  </Button>
                </div>
              </div>
            )}

            <div className="fa-knoepfe fa-vorgang-knoepfe">
              <Button
                size="sm"
                onClick={() =>
                  setDatei({
                    id: 'pdf',
                    name: `${x.nr}.pdf`,
                    art: 'pdf',
                    adresse: pdfAdresse(x.id),
                  })
                }
                data-testid="fa-pdf"
              >
                <Icon symbol={FileText} />
                PDF
              </Button>
              <Button size="sm" onClick={() => drucken(x)} data-testid="fa-drucken">
                <Icon symbol={Printer} />
                {t('Drucken', 'Print')}
              </Button>
            </div>

            <dl className="fa-felder">
              {def
                .felder(ctx)
                .filter(
                  f =>
                    x.felder[f.key] !== null &&
                    x.felder[f.key] !== undefined &&
                    x.felder[f.key] !== ''
                )
                .map(f => (
                  <div key={f.key}>
                    <dt>{f.titel}</dt>
                    <dd>
                      {f.anzeigen
                        ? f.anzeigen(x.felder[f.key] ?? null, x)
                        : f.optionen
                          ? (f.optionen.find(([k]) => k === String(x.felder[f.key]))?.[1] ??
                            tx(x.felder[f.key]))
                          : tx(x.felder[f.key])}
                    </dd>
                  </div>
                ))}
            </dl>

            <section aria-labelledby="fa-dateien">
              <div className="fa-zeile">
                <h3 id="fa-dateien" className="fa-abschnitt">
                  {t('Dateien', 'Files')} <Mono>{x.dateien.length}</Mono>
                </h3>
                <Button size="sm" onClick={() => eingabe.current?.click()}>
                  <Icon symbol={Paperclip} />
                  {t('Datei anhängen', 'Attach file')}
                </Button>
                <input
                  ref={eingabe}
                  type="file"
                  accept="application/pdf,image/*"
                  hidden
                  onChange={ev => {
                    hochladen(ev.target.files);
                    ev.target.value = '';
                  }}
                />
              </div>
              {x.dateien.length === 0 ? (
                <p className="fa-satz">
                  {t(
                    'Noch keine Datei. PDF oder Bild bis 2 MB.',
                    'No file yet. PDF or image up to 2 MB.'
                  )}
                </p>
              ) : (
                <ul className="fa-dateiliste">
                  {x.dateien.map(d => (
                    <li key={d.id}>
                      <button
                        type="button"
                        className="fa-datei"
                        onClick={() => setDatei({ id: d.id, name: tx(d.name), art: d.art })}
                        data-testid={`fa-datei-${d.id}`}
                      >
                        <Icon symbol={d.art === 'pdf' ? FileText : BildSymbol} />
                        <span className="fa-datei-name">{tx(d.name)}</span>
                        <span className="fa-datei-wann">
                          {name(d.wer)} · {wann(d.am)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="fa-verlauf">
              <h3 id="fa-verlauf" className="fa-abschnitt">
                {t('Verlauf', 'History')}
              </h3>
              <ol className="fa-verlauf">
                {[...x.verlauf].reverse().map((s, i) => (
                  <li key={`${s.am}-${i}`}>
                    <span className="fa-verlauf-text">{tx(s.text)}</span>
                    <span className="fa-verlauf-wer">
                      {name(s.wer)} · {wann(s.am)}
                    </span>
                  </li>
                ))}
              </ol>
              <form
                className="fa-notiz"
                onSubmit={async ev => {
                  ev.preventDefault();
                  if (!notiz.trim()) return;
                  uebernehmen(await api.aendern(x.id, { notiz }));
                  setNotiz('');
                }}
              >
                <input
                  value={notiz}
                  onChange={ev => setNotiz(ev.target.value)}
                  placeholder={t('Notiz zum Verlauf hinzufügen', 'Add a note to the history')}
                  aria-label={t('Notiz zum Verlauf', 'Note for the history')}
                />
                <Button size="sm" type="submit" disabled={!notiz.trim()}>
                  <Icon symbol={MessageSquarePlus} />
                  {t('Notieren', 'Add')}
                </Button>
              </form>
            </section>
          </div>
        )}
      </Blatt>
      {datei && x && (
        <Dialogform
          offen
          beiSchliessen={() => setDatei(null)}
          titel={datei.name}
          groesse={schmal ? 'ganz' : 'gross'}
        >
          <Dokumentanzeige
            quelle={datei.adresse ?? dateiAdresse(x.id, datei.id)}
            art={datei.art}
            name={datei.name}
            hoehe="min(70dvh, 760px)"
            kennzeichen="fa-dokument"
          />
          <div className="fa-knoepfe fa-knoepfe-ende">
            <a
              className="fa-link"
              href={datei.adresse ?? dateiAdresse(x.id, datei.id)}
              download={datei.name}
            >
              <Icon symbol={Download} />
              {t('Herunterladen', 'Download')}
            </a>
          </div>
        </Dialogform>
      )}
    </>
  );
}

// ── Formular ────────────────────────────────────────────────────────────────

function Eingabe({
  def,
  ctx,
  e,
  vorbelegt,
  schliessen,
  gespeichert,
}: {
  def: AppDef;
  ctx: Ctx;
  e: Eintrag | null;
  vorbelegt?: Record<string, Wert>;
  schliessen: () => void;
  gespeichert: (e: Eintrag, neu: boolean) => void;
}) {
  const felder = def.felder(ctx).filter(f => !f.nurAnzeige);
  const [werte, setWerte] = useState<Record<string, string>>(() => {
    const quelle = e ? e.felder : { ...def.vorbelegung(ctx), ...(vorbelegt ?? {}) };
    const aus: Record<string, string> = {};
    for (const f of felder) {
      const w = quelle[f.key];
      aus[f.key] = w === null || w === undefined ? '' : tx(w);
    }
    return aus;
  });
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);

  const umwandeln = (): Record<string, Wert> => {
    const aus: Record<string, Wert> = {};
    for (const f of felder) {
      const roh = werte[f.key]?.trim() ?? '';
      if (f.art === 'zahl')
        aus[f.key] = roh === '' ? null : Number(roh.replace(/\./g, '').replace(',', '.'));
      else if (f.art === 'auswahl' && /^\d+$/.test(roh) && f.optionen?.some(([k]) => k === roh))
        aus[f.key] = Number(roh);
      else aus[f.key] = roh === '' ? null : roh;
      // Unverändert gelassene Texte aus dem Bestand bleiben zweisprachig.
      const vorher = e?.felder[f.key];
      if (vorher && typeof vorher === 'object' && tx(vorher) === roh) aus[f.key] = vorher;
    }
    return aus;
  };

  const pruefen = (f: Record<string, Wert>): Record<string, string> => {
    const aus: Record<string, string> = {};
    for (const d of felder) {
      const w = f[d.key];
      if (d.pflicht && (w === null || w === ''))
        aus[d.key] = t('Bitte ausfüllen.', 'Please fill in.');
      if (d.art === 'zahl' && w !== null && (typeof w !== 'number' || Number.isNaN(w)))
        aus[d.key] = t('Bitte eine Zahl.', 'Please enter a number.');
      if (d.art === 'zahl' && typeof w === 'number' && d.min !== undefined && w < d.min)
        aus[d.key] = t(`Mindestens ${d.min}.`, `At least ${d.min}.`);
    }
    return { ...aus, ...(def.pruefen?.(f, ctx) ?? {}) };
  };

  const absenden = async () => {
    const f = umwandeln();
    const fe = pruefen(f);
    setFehler(fe);
    if (Object.keys(fe).length) return;
    setLaeuft(true);
    try {
      const neu = e
        ? await api.aendern(e.id, { felder: f })
        : await api.anlegen(f, def.standBeimAnlegen?.(f) ?? def.startStand);
      gespeichert(neu, !e);
    } catch (fehlerObj) {
      setFehler({ _: (fehlerObj as Error).message });
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialogform
      offen
      beiSchliessen={schliessen}
      titel={e ? t(`${e.nr} bearbeiten`, `Edit ${e.nr}`) : def.neuText}
      groesse="mittel"
      schliesstBeiKlickDaneben={false}
    >
      <div className="fa-formular" data-testid="fa-formular">
        {fehler._ && <Meldung art="fehler">{fehler._}</Meldung>}
        {Object.keys(fehler).length > 0 && !fehler._ && (
          <Meldung art="fehler">
            {t('Bitte die markierten Felder prüfen.', 'Please check the marked fields.')}
          </Meldung>
        )}
        <Formular
          onAbsenden={() => void absenden()}
          aktionen={
            <>
              <Knopf art="still" onKlick={schliessen}>
                {t('Abbrechen', 'Cancel')}
              </Knopf>
              <Knopf art="haupt" typ="absenden" gesperrt={laeuft} kennzeichen="fa-speichern">
                {e ? t('Speichern', 'Save') : t('Anlegen', 'Create')}
              </Knopf>
            </>
          }
        >
          {felder.map(f => {
            const kennung = `feld-${f.key}`;
            const gemeinsam = {
              id: kennung,
              value: werte[f.key] ?? '',
              'aria-invalid': fehler[f.key] ? true : undefined,
              'aria-describedby': fehler[f.key] ? `${kennung}-fehler` : undefined,
            };
            const setzen = (v: string) => setWerte(w => ({ ...w, [f.key]: v }));
            const eingabe =
              f.art === 'auswahl' ? (
                <select {...gemeinsam} onChange={ev => setzen(ev.target.value)}>
                  <option value="">{t('Bitte wählen', 'Please choose')}</option>
                  {f.optionen?.map(([k, text]) => (
                    <option key={k} value={k}>
                      {text}
                    </option>
                  ))}
                </select>
              ) : f.art === 'textlang' ? (
                <textarea {...gemeinsam} rows={3} onChange={ev => setzen(ev.target.value)} />
              ) : (
                <input
                  {...gemeinsam}
                  type={f.art === 'datum' ? 'date' : 'text'}
                  inputMode={f.art === 'zahl' ? 'decimal' : undefined}
                  onChange={ev => setzen(ev.target.value)}
                />
              );
            return (
              <Feld
                key={f.key}
                kennung={kennung}
                beschriftung={f.pflicht ? `${f.titel} *` : f.titel}
                hinweis={
                  fehler[f.key] ? (
                    <span id={`${kennung}-fehler`} className="fa-fehler">
                      {fehler[f.key]}
                    </span>
                  ) : (
                    f.hinweis
                  )
                }
              >
                {eingabe}
              </Feld>
            );
          })}
        </Formular>
      </div>
    </Dialogform>
  );
}

function GrundDialog({
  titel,
  frage,
  pflicht,
  schliessen,
  bestaetigen,
}: {
  titel: string;
  frage: string;
  pflicht: boolean;
  schliessen: () => void;
  bestaetigen: (satz: string) => void;
}) {
  const [satz, setSatz] = useState('');
  const [fehlt, setFehlt] = useState(false);
  return (
    <Dialogform offen beiSchliessen={schliessen} titel={titel} groesse="klein">
      <Formular
        onAbsenden={() => {
          if (pflicht && !satz.trim()) {
            setFehlt(true);
            return;
          }
          bestaetigen(satz.trim());
        }}
        aktionen={
          <>
            <Knopf art="still" onKlick={schliessen}>
              {t('Abbrechen', 'Cancel')}
            </Knopf>
            <Knopf art="haupt" typ="absenden" kennzeichen="fa-grund-ok">
              {titel}
            </Knopf>
          </>
        }
      >
        <Feld
          kennung="fa-grund"
          beschriftung={frage}
          hinweis={
            fehlt ? (
              <span className="fa-fehler">{t('Bitte einen Satz.', 'Please add a sentence.')}</span>
            ) : undefined
          }
        >
          <textarea id="fa-grund" rows={3} value={satz} onChange={ev => setSatz(ev.target.value)} />
        </Feld>
      </Formular>
    </Dialogform>
  );
}

/** Eine App an `#app` hängen. */
export function starten(def: AppDef): void {
  document.title = def.titel;
  const knoten = document.getElementById('app');
  // Erst die Stammdaten, dann das erste Bild: ein eben angelegter Kunde
  // steht sonst als „Kunde 26" in der Liste.
  if (knoten) void stammLaden().then(() => createRoot(knoten).render(<FachApp def={def} />));
  // Ändert der Rahmen den Platz der Kapsel (`--ara-kapsel-platz` am <html>),
  // misst der Seitenkopf neu; er hört sonst nur auf Größenänderungen.
  new MutationObserver(() => window.dispatchEvent(new Event('resize'))).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ['style'] }
  );
}
