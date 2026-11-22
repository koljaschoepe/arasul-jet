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
  Button,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Werkzeug,
  useSchmalesFenster,
  type KennzahlProps,
  type Spalte,
} from '@marken';
import { Chart } from '@marken/diagramm';
import {
  Download,
  FileText,
  Image as BildSymbol,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  type LucideIcon,
} from '@marken/symbole';
import type { AppKennung, Eintrag, Wert } from '../bestand';
import { STAENDE, FREIGABE_STAND } from '../bestand';
import { name } from '../firma';
import { api, csvLaden, dateiAdresse, SPRACHE, t, tx, wann, type Sprache } from './gemeinsam';

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
}

export interface Hinweis {
  e: Eintrag;
  satz: string;
  wichtig?: boolean;
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

const MONO = { fontFamily: 'var(--font-mono)', fontSize: '0.92em' } as const;
export const Mono = ({ children }: { children: ReactNode }) => <span style={MONO}>{children}</span>;

/** Ein Auftrag aus der Startseite: „neu anlegen" (Schnellzugriff). */
const AUFTRAG = 'arasul-demo-auftrag';

function auftragLesen(app: AppKennung): string | null {
  try {
    const roh = window.localStorage.getItem(AUFTRAG);
    if (!roh) return null;
    const a = JSON.parse(roh) as { app?: string; aktion?: string };
    if (a.app !== app) return null;
    window.localStorage.removeItem(AUFTRAG);
    return a.aktion ?? null;
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

function FachApp({ def }: { def: AppDef }) {
  const [liste, setListe] = useState<Eintrag[] | null>(null);
  const [fassung, setFassung] = useState<{ version: string; stand: 'live' | 'test' } | null>(null);
  const [filter, setFilter] = useState<string>('alle');
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [formular, setFormular] = useState<{ e: Eintrag | null } | null>(null);
  const [loeschen, setLoeschen] = useState<Eintrag | null>(null);
  const [grund, setGrund] = useState<{ e: Eintrag; schritt: Schritt | 'ablehnen' } | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const uhr = useRef<number | undefined>(undefined);

  const ctx: Ctx = { sp: SPRACHE, fassung: fassung?.version, stand: fassung?.stand ?? 'live' };
  const eng = useEng();
  // Die Fassung nennt die Seite nur in der Testfassung; im Alltag interessiert sie niemanden.
  const satz = `${def.satz(ctx)}${fassung?.stand === 'test' ? ` ${t('Testfassung', 'Test version')} ${fassung.version}.` : ''}`;

  const melden = useCallback((art: NonNullable<Toast>['art'], text: string) => {
    setToast({ art, text });
    window.clearTimeout(uhr.current);
    uhr.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const laden = useCallback(async () => {
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
      // Aus „Für Sie" auf der Startseite: die App öffnet beim Vorgang.
      const vorgang = Number(new URLSearchParams(window.location.search).get('freigabe'));
      if (vorgang && eintraege.some(e => e.id === vorgang)) setGewaehlt(vorgang);
      if (auftragLesen(def.id) === 'neu') setFormular({ e: null });
    });
    const beiSpeicher = (ev: StorageEvent) => {
      if (ev.key === AUFTRAG && auftragLesen(def.id) === 'neu') setFormular({ e: null });
      if (ev.key === 'arasul-demo-neu') void laden();
    };
    window.addEventListener('storage', beiSpeicher);
    return () => window.removeEventListener('storage', beiSpeicher);
  }, [def.id, laden]);

  /** Nach jeder Änderung: der Eintrag in der Liste, und die Startseite erfährt es. */
  const uebernehmen = useCallback((e: Eintrag) => {
    setListe(l =>
      l ? (l.some(x => x.id === e.id) ? l.map(x => (x.id === e.id ? e : x)) : [e, ...l]) : l
    );
    try {
      window.localStorage.setItem('arasul-demo-neu', String(Date.now()));
    } catch {
      /* ohne Speicher nur hier */
    }
  }, []);

  const eintraege = liste ?? [];
  const gezeigt = useMemo(
    () => (filter === 'alle' ? eintraege : eintraege.filter(e => e.stand === filter)),
    [eintraege, filter]
  );
  const auswahl = eintraege.find(e => e.id === gewaehlt) ?? null;

  const standSetzen = async (e: Eintrag, s: Schritt, notiz?: string) => {
    try {
      const neu = await api.aendern(e.id, { stand: s.nach, notiz });
      uebernehmen(neu);
      melden('erfolg', t(`${e.nr}: ${s.text}.`, `${e.nr}: ${s.text}.`));
    } catch (f) {
      melden('fehler', (f as Error).message);
    }
  };

  const schrittAusfuehren = (e: Eintrag, s: Schritt) => {
    if (s.mitGrund) setGrund({ e, schritt: s });
    else void standSetzen(e, s);
  };

  const exportieren = () => {
    const zeilen = gezeigt.map(def.csv);
    const kopf = Object.keys(zeilen[0] ?? def.csv(eintraege[0]!));
    csvLaden(
      `${def.titel.toLowerCase().replace(/[^a-zäöü0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
      kopf,
      zeilen.map(z => kopf.map(k => z[k] ?? ''))
    );
    melden(
      'erfolg',
      t(
        `${gezeigt.length} Einträge als CSV exportiert.`,
        `${gezeigt.length} entries exported as CSV.`
      )
    );
  };

  const spalten: Spalte<Eintrag>[] = [
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
      kartenText: e => <ZeilenAktionen e={e} />,
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
          onClick={() => setLoeschen(e)}
        />
      </span>
    );
  }

  const diagramm = liste ? def.diagramm(eintraege, ctx) : null;
  const hinweise = liste ? def.naechstes.liste(eintraege, ctx).slice(0, 5) : [];
  const zaehler = (stand: string) => eintraege.filter(e => e.stand === stand).length;

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
              beschriftung={t('Als CSV exportieren', 'Export as CSV')}
              onClick={exportieren}
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
            <h2 id={`${def.id}-diagramm`} className="fa-abschnitt">
              {diagramm.titel}
            </h2>
            <p className="fa-satz">{diagramm.satz}</p>
            <Chart
              data={diagramm.data}
              series={diagramm.series}
              xKey="x"
              xTicks={diagramm.data.map(d => d.x)}
              formatX={(i: number) => String(diagramm.data[i]?.name ?? '')}
              formatY={diagramm.formatY}
              art={diagramm.art}
              height={200}
              label={diagramm.titel}
            />
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
            {t('Alle', 'All')} <Mono>{eintraege.length}</Mono>
          </button>
          {STAENDE[def.id].map(([k, text]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(filter === k ? 'alle' : k)}
              data-treffer-selbst=""
            >
              {text[SPRACHE]} <Mono>{zaehler(k)}</Mono>
            </button>
          ))}
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

      <Einzelansicht
        def={def}
        ctx={ctx}
        e={auswahl}
        schliessen={() => setGewaehlt(null)}
        bearbeiten={e => setFormular({ e })}
        loeschen={e => setLoeschen(e)}
        schritt={schrittAusfuehren}
        ablehnen={e => setGrund({ e, schritt: 'ablehnen' })}
        uebernehmen={uebernehmen}
        melden={melden}
      />

      {formular && (
        <Eingabe
          def={def}
          ctx={ctx}
          e={formular.e}
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
        titel={t(`${def.einzahl} löschen?`, `Delete ${def.einzahl.toLowerCase()}?`)}
        frage={
          loeschen
            ? t(
                `${loeschen.nr} „${def.titelVon(loeschen)}" wird mit Dateien und Verlauf gelöscht.`,
                `${loeschen.nr} “${def.titelVon(loeschen)}” is deleted with its files and history.`
              )
            : ''
        }
        jaText={t('Löschen', 'Delete')}
        neinText={t('Abbrechen', 'Cancel')}
        art="gefahr"
        beiBestaetigen={async () => {
          if (!loeschen) return;
          const weg = loeschen;
          await api.loeschen(weg.id);
          setListe(l => (l ? l.filter(x => x.id !== weg.id) : l));
          if (gewaehlt === weg.id) setGewaehlt(null);
          setLoeschen(null);
          melden('erfolg', t(`${weg.nr} gelöscht.`, `${weg.nr} deleted.`));
          try {
            window.localStorage.setItem('arasul-demo-neu', String(Date.now()));
          } catch {
            /* ohne Speicher nur hier */
          }
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

      {toast && (
        <div className="fa-toast" role="status" aria-live="polite">
          <Meldung art={toast.art}>{toast.text}</Meldung>
        </div>
      )}
    </div>
  );
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
  uebernehmen: (e: Eintrag) => void;
  melden: (art: 'erfolg' | 'fehler' | 'hinweis', text: string) => void;
}) {
  const schmal = useSchmalesFenster();
  const [datei, setDatei] = useState<{ id: string; name: string; art: 'pdf' | 'bild' } | null>(
    null
  );
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
    <Sheet open={e !== null} onOpenChange={o => !o && schliessen()}>
      <SheetContent
        side={schmal ? 'bottom' : 'right'}
        className="fa-blatt"
        data-seite={schmal ? 'unten' : 'rechts'}
        aria-describedby={undefined}
      >
        {x && (
          <div className="fa-blatt-inhalt" data-testid="fa-blatt">
            {schmal && <span className="fa-griff" aria-hidden="true" />}
            <div className="fa-blatt-kopf">
              <span className="fa-blatt-nr">
                {x.nr} <StandMarke app={def.id} stand={x.stand} />
              </span>
              <SheetTitle className="fa-blatt-titel">{def.titelVon(x)}</SheetTitle>
              <SheetDescription className="fa-satz">{def.nebenVon(x)}</SheetDescription>
            </div>

            {wartet && (
              <div className="fa-freigabe" data-testid="fa-freigabe">
                <Meldung
                  art="hinweis"
                  titel={t('Wartet auf Ihre Freigabe', 'Waiting for your approval')}
                >
                  {t(
                    'Sie entscheiden. Eine Ablehnung braucht einen Satz, er steht im Verlauf.',
                    'You decide. Declining needs a sentence; it goes into the history.'
                  )}
                </Meldung>
                <div className="fa-knoepfe">
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
                </div>
              </div>
            )}

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
      </SheetContent>
      {datei && x && (
        <Dialogform
          offen
          beiSchliessen={() => setDatei(null)}
          titel={datei.name}
          groesse={schmal ? 'ganz' : 'gross'}
        >
          <Dokumentanzeige
            quelle={dateiAdresse(x.id, datei.id)}
            art={datei.art}
            name={datei.name}
            hoehe="min(70dvh, 760px)"
            kennzeichen="fa-dokument"
          />
          <div className="fa-knoepfe fa-knoepfe-ende">
            <a className="fa-link" href={dateiAdresse(x.id, datei.id)} download={datei.name}>
              <Icon symbol={Download} />
              {t('Herunterladen', 'Download')}
            </a>
          </div>
        </Dialogform>
      )}
    </Sheet>
  );
}

// ── Formular ────────────────────────────────────────────────────────────────

function Eingabe({
  def,
  ctx,
  e,
  schliessen,
  gespeichert,
}: {
  def: AppDef;
  ctx: Ctx;
  e: Eintrag | null;
  schliessen: () => void;
  gespeichert: (e: Eintrag, neu: boolean) => void;
}) {
  const felder = def.felder(ctx).filter(f => !f.nurAnzeige);
  const [werte, setWerte] = useState<Record<string, string>>(() => {
    const quelle = e ? e.felder : def.vorbelegung(ctx);
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
  if (knoten) createRoot(knoten).render(<FachApp def={def} />);
  // Ändert der Rahmen den Platz der Kapsel (`--ara-kapsel-platz` am <html>),
  // misst der Seitenkopf neu; er hört sonst nur auf Größenänderungen.
  new MutationObserver(() => window.dispatchEvent(new Event('resize'))).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ['style'] }
  );
}
