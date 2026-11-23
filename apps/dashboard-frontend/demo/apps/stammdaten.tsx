/**
 * Stammdaten (J55, M7): Kunden, Lieferanten, Maschinen und Personen der
 * Firma, je als Liste mit Suche und Sortierung und als Einzelansicht mit
 * allen Vorgängen aus den fünf Fach-Apps. Vom Angebot zum Kunden und zurück:
 * ein Feld in einer Fach-App öffnet den Stammsatz hier, ein Vorgang hier
 * öffnet ihn in seiner App.
 *
 * Kunden, Lieferanten und Maschinen lassen sich anlegen und ändern; die
 * Fach-Apps übernehmen den Stand (`stammLaden`). Personen pflegt die
 * Verwaltung, hier stehen sie nur mit ihren Vorgängen.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Badge,
  Blatt,
  Button,
  Datenliste,
  Dialogform,
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
  type KennzahlProps,
  type Spalte,
} from '@marken';
import {
  Building2,
  ClipboardList,
  CalendarDays,
  ClipboardCheck,
  Download,
  Factory,
  FileText,
  PackageCheck,
  Pencil,
  Plus,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from '@marken/symbole';
import { angebotOffen, type AppKennung, type Bestand, type Eintrag } from '../bestand';
import {
  ABTEILUNGEN,
  ARTIKEL,
  AUFTRAEGE,
  KUNDEN,
  LIEFERANTEN,
  MASCHINEN,
  PERSONEN,
  kundeAnschrift,
  kundeTelefon,
  kundeZiel,
  kundenNr,
  lieferantNr,
  lieferantTelefon,
  maschine,
  stammUebernehmen,
  type Kunde,
  type Lieferant,
  type Maschine,
  type Person,
  type Stamm,
} from '../firma';
import { Mono, StandMarke } from './fachapp';
import {
  csvLaden,
  datum,
  euro,
  heuteIso,
  neuIn,
  prozent,
  SPRACHE,
  t,
  tageBis,
  stammOeffnen,
  tx,
  vorgangOeffnen,
  zahl,
} from './gemeinsam';

type Art = 'kunden' | 'lieferanten' | 'maschinen' | 'personen' | 'auftraege';
/** Was sich hier anlegen und ändern lässt. */
type Pflegbar = 'kunden' | 'lieferanten' | 'maschinen';
const pflegbar = (a: Art): a is Pflegbar => a !== 'personen' && a !== 'auftraege';
type Gewaehlt = { art: Art; id: string } | null;

const SYMBOL: Record<AppKennung, LucideIcon> = {
  angebote: FileText,
  wareneingang: PackageCheck,
  wartungsplan: Wrench,
  pruefprotokolle: ClipboardCheck,
  urlaub: CalendarDays,
};
const APP_NAME: Record<AppKennung, string> = {
  angebote: t('Angebote', 'Quotes'),
  wareneingang: t('Wareneingang', 'Goods receipt'),
  wartungsplan: t('Wartungsplan', 'Maintenance plan'),
  pruefprotokolle: t('Prüfprotokolle', 'Inspection reports'),
  urlaub: t('Urlaubsanträge', 'Leave requests'),
};

const abteilung = (p: Person) => tx(ABTEILUNGEN.find(a => a.id === p.abteilung)?.name);
const vollName = (p: Person) => `${p.vorname} ${p.nachname}`;
const nicht = (stand: string) => !['abgelehnt'].includes(stand);

// ── Vorgänge zu einem Stammsatz ─────────────────────────────────────────────

interface Vorgang {
  app: AppKennung;
  e: Eintrag;
  titel: string;
  neben: string;
  tag: string;
}

function vorgangVon(app: AppKennung, e: Eintrag): Vorgang {
  const f = e.felder;
  switch (app) {
    case 'angebote':
      return {
        app,
        e,
        titel: tx(f.betreff),
        neben: `${euro(Number(f.betrag))} · ${datum(f.datum)}`,
        tag: String(f.datum),
      };
    case 'wareneingang': {
      const a = ARTIKEL.find(x => x.nr === f.artikel);
      const tag = String(f.eingang ?? f.erwartet);
      return {
        app,
        e,
        titel: a ? tx(a.name) : String(f.artikel),
        neben: `${zahl(Number(f.menge))} ${a ? tx(a.einheit) : ''} · ${datum(tag)}${f.auftrag ? ` · ${f.auftrag}` : ''}`,
        tag,
      };
    }
    case 'wartungsplan': {
      const tag = String(e.stand === 'erledigt' ? f.erledigt_am : f.faellig);
      const m = maschine(String(f.maschine));
      return {
        app,
        e,
        titel: tx(f.aufgabe),
        neben: `${m.id} ${tx(m.name)} · ${e.stand === 'erledigt' ? t('erledigt', 'done') : t('fällig', 'due')} ${datum(tag)}`,
        tag,
      };
    }
    case 'pruefprotokolle':
      return {
        app,
        e,
        titel: tx(f.bauteil),
        neben: `${String(f.auftrag)} · ${datum(f.datum)}`,
        tag: String(f.datum),
      };
    case 'urlaub':
      return {
        app,
        e,
        titel: `${PERSONEN.find(p => p.id === Number(f.person))?.vorname ?? ''} · ${t(`${f.tage} Tage`, `${f.tage} days`)}`,
        neben: `${datum(f.von)} – ${datum(f.bis)}`,
        tag: String(f.von),
      };
  }
}

function vorgaenge(b: Bestand, g: NonNullable<Gewaehlt>): Vorgang[] {
  const aus: Vorgang[] = [];
  const mit = (app: AppKennung, pruefe: (e: Eintrag) => boolean) => {
    for (const e of b[app]) if (pruefe(e)) aus.push(vorgangVon(app, e));
  };
  if (g.art === 'auftraege') {
    mit('angebote', e => e.felder.auftrag === g.id);
    mit('wareneingang', e => e.felder.auftrag === g.id);
    mit('pruefprotokolle', e => e.felder.auftrag === g.id);
  } else if (g.art === 'kunden') {
    const id = Number(g.id);
    const auftraege = new Set(
      b.angebote
        .filter(e => Number(e.felder.kunde) === id && e.felder.auftrag)
        .map(e => String(e.felder.auftrag))
    );
    mit('angebote', e => Number(e.felder.kunde) === id);
    mit('wareneingang', e => auftraege.has(String(e.felder.auftrag)));
    mit('pruefprotokolle', e => auftraege.has(String(e.felder.auftrag)));
  } else if (g.art === 'lieferanten') {
    const id = Number(g.id);
    mit('wareneingang', e => Number(e.felder.lieferant) === id);
    mit('wartungsplan', e => Number(e.felder.extern) === id);
  } else if (g.art === 'maschinen') {
    mit('wartungsplan', e => e.felder.maschine === g.id);
  } else {
    const id = Number(g.id);
    mit('angebote', e => Number(e.felder.bearbeiter) === id);
    mit('urlaub', e => Number(e.felder.person) === id);
    mit('wartungsplan', e => Number(e.felder.zustaendig) === id);
    mit('pruefprotokolle', e => Number(e.felder.pruefer) === id);
    mit('wareneingang', e => Number(e.felder.pruefer) === id);
  }
  return aus.sort((a, b) => b.tag.localeCompare(a.tag));
}

// ── Kennzahlen je Satz und je Zeile ─────────────────────────────────────────

function kundeZahlen(b: Bestand, k: Kunde) {
  const l = b.angebote.filter(e => Number(e.felder.kunde) === k.id);
  const an = l.filter(e => e.stand === 'angenommen');
  const ent = l.filter(e => ['angenommen', 'abgelehnt'].includes(e.stand));
  const offen = l.filter(e => angebotOffen(e, heuteIso()));
  const umsatz = an.reduce((s, e) => s + Number(e.felder.betrag), 0);
  const letzt = [...l].sort((x, y) =>
    String(y.felder.datum).localeCompare(String(x.felder.datum))
  )[0];
  return { l, an, ent, offen, umsatz, letzt };
}

function lieferantZahlen(b: Bestand, l: Lieferant) {
  const we = b.wareneingang.filter(e => Number(e.felder.lieferant) === l.id);
  const da = we.filter(e => e.felder.eingang);
  const puenktlich = da.filter(e => String(e.felder.eingang) <= String(e.felder.erwartet));
  const rekl = we.filter(
    e => e.stand === 'reklamiert' || e.verlauf.some(s => /Reklam|complaint/i.test(tx(s.text)))
  );
  const einsaetze = b.wartungsplan.filter(e => Number(e.felder.extern) === l.id);
  return { we, da, treu: prozent(puenktlich.length, da.length), rekl, einsaetze };
}

function maschineZahlen(b: Bestand, m: Maschine) {
  const w = b.wartungsplan.filter(e => e.felder.maschine === m.id);
  const erledigt = w.filter(e => e.stand === 'erledigt');
  const offen = w
    .filter(e => e.stand !== 'erledigt')
    .sort((x, y) => String(x.felder.faellig).localeCompare(String(y.felder.faellig)));
  const stunden = erledigt.reduce((s, e) => s + (Number(e.felder.dauer) || 0), 0);
  return { w, erledigt, offen, stunden, naechste: offen[0] };
}

function personZahlen(b: Bestand, p: Person) {
  const heute = heuteIso();
  const weg = b.urlaub.find(
    e =>
      Number(e.felder.person) === p.id &&
      e.stand === 'genehmigt' &&
      String(e.felder.von) <= heute &&
      String(e.felder.bis) >= heute
  );
  const geplant = b.urlaub
    .filter(
      e =>
        Number(e.felder.person) === p.id &&
        nicht(e.stand) &&
        e.felder.art === 'urlaub' &&
        String(e.felder.von) > heute
    )
    .reduce((s, e) => s + (Number(e.felder.tage) || 0), 0);
  return { weg, geplant };
}

// ── Aufträge ────────────────────────────────────────────────────────────────

interface AuftragZeile {
  nr: string;
  kunde: number;
  gegenstand: string;
  wert: number;
  seit: string;
  /** In Fertigung: einer der zwölf laufenden Aufträge. */
  laufend: boolean;
  angebot: Eintrag;
}

const kundeName = (id: number) => KUNDEN.find(k => k.id === id)?.name ?? '–';

/** Jedes gewonnene Angebot ist ein Auftrag; die zwölf jüngsten laufen noch. */
function auftraegeAus(b: Bestand): AuftragZeile[] {
  const laufend = new Set(AUFTRAEGE.map(a => a.nr));
  return b.angebote
    .filter(e => e.stand === 'angenommen' && e.felder.auftrag)
    .map(e => {
      const an = e.verlauf.find(s => /^(Angenommen|Accepted)/.test(tx(s.text)));
      return {
        nr: String(e.felder.auftrag),
        kunde: Number(e.felder.kunde),
        gegenstand: tx(e.felder.betreff),
        // Wie im Angebot angezeigt: der Betrag netto (Rabatt erst ab Angebote 1.5.0).
        wert: Number(e.felder.betrag),
        seit: (an?.am ?? String(e.felder.datum)).slice(0, 10),
        laufend: laufend.has(String(e.felder.auftrag)),
        angebot: e,
      };
    })
    .sort((x, y) => y.seit.localeCompare(x.seit) || y.nr.localeCompare(x.nr));
}

// ── Die App ─────────────────────────────────────────────────────────────────

interface Daten {
  stamm: Stamm;
  bestand: Bestand;
}

async function rufe<T>(methode: string, pfad: string, koerper?: unknown): Promise<T> {
  const r = await fetch(`api/${pfad}`, {
    method: methode,
    headers: {
      accept: 'application/json',
      ...(koerper ? { 'content-type': 'application/json' } : {}),
    },
    body: koerper ? JSON.stringify(koerper) : undefined,
  });
  const j = (await r.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!r.ok) throw new Error(j?.error?.message ?? t('Das ging nicht.', 'That did not work.'));
  return j?.data as T;
}

const STAMM_AUFTRAG = 'arasul-demo-stamm';
function stammAuftragLesen(): { art: string; id: string } | null {
  try {
    const roh = window.localStorage.getItem(STAMM_AUFTRAG);
    if (!roh) return null;
    window.localStorage.removeItem(STAMM_AUFTRAG);
    return JSON.parse(roh) as { art: string; id: string };
  } catch {
    return null;
  }
}
const AUS_ART: Record<string, Art> = {
  auftrag: 'auftraege',
  kunde: 'kunden',
  lieferant: 'lieferanten',
  maschine: 'maschinen',
  person: 'personen',
};

function useEng(): boolean {
  const [eng, setEng] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const messen = () => setEng(window.innerWidth < 640);
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, []);
  return eng;
}

const NEU_TEXT: Record<Pflegbar, string> = {
  kunden: t('Kunde anlegen', 'New customer'),
  lieferanten: t('Lieferant anlegen', 'New supplier'),
  maschinen: t('Maschine anlegen', 'New machine'),
};

function StammApp() {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [reiter, setReiter] = useState<Art>('kunden');
  const [gewaehlt, setGewaehlt] = useState<Gewaehlt>(null);
  const [formular, setFormular] = useState<{ art: Pflegbar; satz: unknown } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const eng = useEng();

  const laden = useCallback(async () => {
    const d = await rufe<Daten>('GET', 'daten');
    stammUebernehmen(d.stamm);
    setDaten(d);
  }, []);

  const auftragAusfuehren = useCallback(() => {
    const a = stammAuftragLesen();
    const art = a ? AUS_ART[a.art] : undefined;
    if (a && art) {
      setReiter(art);
      setGewaehlt({ art, id: a.id });
    }
  }, []);

  useEffect(() => {
    void laden().then(auftragAusfuehren);
    const beiSpeicher = (ev: StorageEvent) => {
      if (ev.key === STAMM_AUFTRAG && ev.newValue) auftragAusfuehren();
      if (ev.key === 'arasul-demo-neu') void laden();
    };
    window.addEventListener('storage', beiSpeicher);
    return () => window.removeEventListener('storage', beiSpeicher);
  }, [laden, auftragAusfuehren]);

  const melden = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 3200);
  };

  const b = daten?.bestand;

  // ── Spalten je Liste ──────────────────────────────────────────────────────
  const kundenSpalten: Spalte<Kunde>[] = [
    {
      schluessel: 'nr',
      titel: t('Nummer', 'Number'),
      breite: '6.5rem',
      wert: k => kundenNr(k),
      zelle: k => <Mono>{kundenNr(k)}</Mono>,
      inKarte: false,
    },
    {
      schluessel: 'name',
      titel: t('Name', 'Name'),
      kuerzen: true,
      wert: k => k.name,
      zelle: k => k.name,
    },
    {
      schluessel: 'art',
      titel: t('Art', 'Type'),
      breite: '9rem',
      wert: k => tx(k.art),
      zelle: k => tx(k.art),
    },
    {
      schluessel: 'ort',
      titel: t('Ort', 'Town'),
      breite: '9rem',
      wert: k => k.ort,
      zelle: k => k.ort,
    },
    {
      schluessel: 'umsatz',
      titel: t('Umsatz', 'Revenue'),
      ausrichtung: 'rechts',
      breite: '8rem',
      wert: k => (b ? kundeZahlen(b, k).umsatz : 0),
      zelle: k => <Mono>{b ? euro(kundeZahlen(b, k).umsatz) : ''}</Mono>,
    },
    {
      schluessel: 'offen',
      titel: t('Offen', 'Open'),
      ausrichtung: 'rechts',
      breite: '5rem',
      wert: k => (b ? kundeZahlen(b, k).offen.length : 0),
      zelle: k => {
        const n = b ? kundeZahlen(b, k).offen.length : 0;
        return n ? <Badge variant="outline">{t(`${n} offen`, `${n} open`)}</Badge> : '–';
      },
      kartenText: k => {
        const n = b ? kundeZahlen(b, k).offen.length : 0;
        return n ? t(`${n} Angebote offen`, `${n} quotes open`) : null;
      },
    },
  ];

  const lieferantenSpalten: Spalte<Lieferant>[] = [
    {
      schluessel: 'nr',
      titel: t('Nummer', 'Number'),
      breite: '6.5rem',
      wert: l => lieferantNr(l),
      zelle: l => <Mono>{lieferantNr(l)}</Mono>,
      inKarte: false,
    },
    {
      schluessel: 'name',
      titel: t('Name', 'Name'),
      kuerzen: true,
      wert: l => l.name,
      zelle: l => l.name,
    },
    {
      schluessel: 'was',
      titel: t('Liefert', 'Supplies'),
      kuerzen: true,
      breite: '30%',
      wert: l => tx(l.was),
      zelle: l => tx(l.was),
    },
    {
      schluessel: 'lieferungen',
      titel: t('Lieferungen', 'Deliveries'),
      ausrichtung: 'rechts',
      breite: '6.5rem',
      wert: l => (b ? lieferantZahlen(b, l).we.length : 0),
      zelle: l => <Mono>{b ? String(lieferantZahlen(b, l).we.length) : ''}</Mono>,
      kartenText: l =>
        b
          ? t(
              `${lieferantZahlen(b, l).we.length} Lieferungen`,
              `${lieferantZahlen(b, l).we.length} deliveries`
            )
          : null,
    },
    {
      schluessel: 'treu',
      titel: t('Pünktlich', 'On time'),
      ausrichtung: 'rechts',
      breite: '6rem',
      wert: l => (b ? lieferantZahlen(b, l).treu : 0),
      zelle: l => {
        const z = b ? lieferantZahlen(b, l) : null;
        return <Mono>{z && z.da.length ? `${z.treu} %` : '–'}</Mono>;
      },
      kartenText: l => {
        const z = b ? lieferantZahlen(b, l) : null;
        return z && z.da.length ? t(`${z.treu} % pünktlich`, `${z.treu}% on time`) : null;
      },
    },
  ];

  const maschinenSpalten: Spalte<Maschine>[] = [
    {
      schluessel: 'id',
      titel: t('Kennung', 'ID'),
      breite: '5.5rem',
      wert: m => m.id,
      zelle: m => <Mono>{m.id}</Mono>,
      inKarte: false,
    },
    {
      schluessel: 'name',
      titel: t('Maschine', 'Machine'),
      kuerzen: true,
      wert: m => `${m.id} ${tx(m.name)}`,
      zelle: m => tx(m.name),
      kartenText: m => `${m.id} ${tx(m.name)}`,
    },
    {
      schluessel: 'ort',
      titel: t('Standort', 'Location'),
      breite: '9rem',
      wert: m => tx(m.ort),
      zelle: m => tx(m.ort),
    },
    {
      schluessel: 'baujahr',
      titel: t('Baujahr', 'Built'),
      breite: '5.5rem',
      ausrichtung: 'rechts',
      wert: m => m.baujahr,
      zelle: m => <Mono>{String(m.baujahr)}</Mono>,
      inKarte: false,
    },
    {
      schluessel: 'naechste',
      titel: t('Nächste Wartung', 'Next service'),
      breite: '9rem',
      wert: m => String(b ? (maschineZahlen(b, m).naechste?.felder.faellig ?? '9') : ''),
      zelle: m => {
        const n = b ? maschineZahlen(b, m).naechste : undefined;
        if (!n) return '–';
        const ueber = tageBis(n.felder.faellig) < 0;
        return (
          <span style={ueber ? { color: 'var(--destructive)' } : undefined}>
            <Mono>{datum(n.felder.faellig)}</Mono>
          </span>
        );
      },
      kartenText: m => {
        const n = b ? maschineZahlen(b, m).naechste : undefined;
        return n ? `${t('Wartung', 'Service')} ${datum(n.felder.faellig)}` : null;
      },
    },
  ];

  const auftraege = useMemo(() => (b ? auftraegeAus(b) : []), [b]);
  const auftragSpalten: Spalte<AuftragZeile>[] = [
    {
      schluessel: 'nr',
      titel: t('Auftrag', 'Order'),
      breite: '7rem',
      wert: a => a.nr,
      zelle: a => <Mono>{a.nr}</Mono>,
    },
    {
      schluessel: 'kunde',
      titel: t('Kunde', 'Customer'),
      breite: '26%',
      kuerzen: true,
      wert: a => kundeName(a.kunde),
      zelle: a => kundeName(a.kunde),
    },
    {
      schluessel: 'gegenstand',
      titel: t('Gegenstand', 'Subject'),
      kuerzen: true,
      wert: a => a.gegenstand,
      zelle: a => a.gegenstand,
    },
    {
      schluessel: 'wert',
      titel: t('Wert', 'Value'),
      ausrichtung: 'rechts',
      breite: '8rem',
      wert: a => a.wert,
      zelle: a => <Mono>{euro(a.wert)}</Mono>,
    },
    {
      schluessel: 'seit',
      titel: t('Seit', 'Since'),
      breite: '6.5rem',
      wert: a => a.seit,
      zelle: a => <Mono>{datum(a.seit)}</Mono>,
      inKarte: false,
    },
    {
      schluessel: 'stand',
      titel: t('Stand', 'Status'),
      breite: '8rem',
      wert: a => (a.laufend ? 0 : 1),
      zelle: a =>
        a.laufend ? (
          <Badge variant="warning">{t('in Fertigung', 'in production')}</Badge>
        ) : (
          <Badge variant="success">{t('abgeschlossen', 'completed')}</Badge>
        ),
      inKarteOben: true,
    },
  ];

  const personenSpalten: Spalte<Person>[] = [
    {
      schluessel: 'konto',
      titel: 'Arasul',
      breite: '5.5rem',
      wert: p => (p.konto === false ? 0 : 1),
      zelle: p =>
        p.konto === false ? (
          <span className="st-leise">–</span>
        ) : (
          <Badge variant="outline">{t('Konto', 'Account')}</Badge>
        ),
      inKarte: false,
    },
    {
      schluessel: 'name',
      titel: t('Name', 'Name'),
      kuerzen: true,
      wert: p => `${p.nachname} ${p.vorname}`,
      zelle: p => vollName(p),
    },
    {
      schluessel: 'abteilung',
      titel: t('Abteilung', 'Department'),
      breite: '24%',
      kuerzen: true,
      wert: p => abteilung(p),
      zelle: p => abteilung(p),
    },
    {
      schluessel: 'aufgabe',
      titel: t('Aufgabe', 'Role'),
      breite: '28%',
      kuerzen: true,
      wert: p => tx(p.aufgabe),
      zelle: p => tx(p.aufgabe),
      inKarte: false,
    },
    {
      schluessel: 'rest',
      titel: t('Resturlaub', 'Leave left'),
      ausrichtung: 'rechts',
      breite: '7rem',
      wert: p => p.urlaub,
      zelle: p => <Mono>{t(`${p.urlaub} Tage`, `${p.urlaub} days`)}</Mono>,
      inKarte: false,
    },
    {
      schluessel: 'heute',
      titel: t('Heute', 'Today'),
      breite: '7rem',
      wert: p => (b && personZahlen(b, p).weg ? 1 : 0),
      zelle: p =>
        b && personZahlen(b, p).weg ? (
          <Badge variant="warning">{t('abwesend', 'away')}</Badge>
        ) : (
          <span className="st-leise">{t('im Haus', 'in')}</span>
        ),
      inKarteOben: true,
    },
  ];

  const zahlen: Record<Art, number> = {
    kunden: KUNDEN.length,
    lieferanten: LIEFERANTEN.length,
    maschinen: MASCHINEN.length,
    personen: PERSONEN.length,
    auftraege: auftraege.length,
  };

  const exportieren = () => {
    const heute = heuteIso();
    if (reiter === 'kunden')
      csvLaden(
        `kunden-${heute}.csv`,
        [
          t('Nummer', 'Number'),
          'Name',
          t('Art', 'Type'),
          t('Ort', 'Town'),
          t('Ansprechpartner', 'Contact'),
          t('Telefon', 'Phone'),
          t('Zahlungsziel', 'Payment terms'),
        ],
        KUNDEN.map(k => [
          kundenNr(k),
          k.name,
          tx(k.art),
          k.ort,
          k.ansprechpartner,
          kundeTelefon(k),
          String(kundeZiel(k)),
        ])
      );
    else if (reiter === 'lieferanten')
      csvLaden(
        `lieferanten-${heute}.csv`,
        [
          t('Nummer', 'Number'),
          'Name',
          t('Liefert', 'Supplies'),
          t('Ort', 'Town'),
          t('Telefon', 'Phone'),
        ],
        LIEFERANTEN.map(l => [lieferantNr(l), l.name, tx(l.was), l.ort, lieferantTelefon(l)])
      );
    else if (reiter === 'maschinen')
      csvLaden(
        `maschinen-${heute}.csv`,
        [
          t('Kennung', 'ID'),
          t('Maschine', 'Machine'),
          t('Standort', 'Location'),
          t('Baujahr', 'Built'),
        ],
        MASCHINEN.map(m => [m.id, tx(m.name), tx(m.ort), String(m.baujahr)])
      );
    else
      csvLaden(
        `personen-${heute}.csv`,
        [
          t('Name', 'Name'),
          t('Abteilung', 'Department'),
          t('Aufgabe', 'Role'),
          t('Resturlaub', 'Leave left'),
        ],
        PERSONEN.map(p => [vollName(p), abteilung(p), tx(p.aufgabe), String(p.urlaub)])
      );
    melden(t('Als CSV exportiert.', 'Exported as CSV.'));
  };

  const liste = <Z,>(art: Art, daten: Z[], spalten: Spalte<Z>[], kennung: (z: Z) => string) => (
    <Datenliste
      daten={daten}
      spalten={spalten}
      kennung={kennung}
      beschriftung={t('Stammdaten', 'Master data')}
      laedt={!b}
      filter
      filterPlatzhalter={t('Suchen: Name, Ort, Nummer', 'Search: name, town, number')}
      aufZeile={z => setGewaehlt({ art, id: kennung(z) })}
      gewaehlt={gewaehlt?.art === art ? gewaehlt.id : null}
      zeilenKennzeichen={z => `st-zeile-${art}-${kennung(z)}`}
    />
  );

  const neuKnopf = pflegbar(reiter) ? (
    eng ? (
      <Werkzeug
        symbol={<Icon symbol={Plus} />}
        beschriftung={NEU_TEXT[reiter]}
        onClick={() => setFormular({ art: reiter, satz: null })}
        data-testid="st-neu"
      />
    ) : null
  ) : null;

  return (
    <div className={eng ? 'fa-seite fa-eng' : 'fa-seite'}>
      <Kopf
        titel={t('Stammdaten', 'Master data')}
        beschreibung={
          eng
            ? undefined
            : t(
                `Kunden, Aufträge, Lieferanten, Maschinen und Personen der Firma, jeweils mit allen Vorgängen aus den Apps.`,
                `The company’s customers, orders, suppliers, machines and people, each with all its records from the apps.`
              )
        }
        werkzeuge={
          <>
            {neuKnopf}
            <Werkzeug
              symbol={<Icon symbol={Download} />}
              beschriftung={t('Liste als CSV exportieren', 'Export list as CSV')}
              onClick={exportieren}
            />
          </>
        }
        aktionen={
          !eng && pflegbar(reiter) ? (
            <Button
              variant="solid"
              onClick={() => setFormular({ art: reiter, satz: null })}
              data-testid="st-neu"
            >
              <Icon symbol={Plus} />
              {NEU_TEXT[reiter]}
            </Button>
          ) : undefined
        }
      />
      {eng && (
        <p className="fa-satz fa-satz-oben">
          {t(
            'Kunden, Lieferanten, Maschinen und Personen, jeweils mit allen Vorgängen.',
            'Customers, suppliers, machines and people, each with all its records.'
          )}
        </p>
      )}

      <Tabs value={reiter} onValueChange={v => setReiter(v as Art)} className="fa-reiter">
        <TabsList aria-label={t('Stammdaten', 'Master data')}>
          {(
            [
              ['kunden', t('Kunden', 'Customers'), Building2],
              ['auftraege', t('Aufträge', 'Orders'), ClipboardList],
              ['lieferanten', t('Lieferanten', 'Suppliers'), Truck],
              ['maschinen', t('Maschinen', 'Machines'), Factory],
              ['personen', t('Personen', 'People'), Users],
            ] as [Art, string, LucideIcon][]
          ).map(([k, text, symbol]) => (
            <TabsTrigger key={k} value={k} data-testid={`st-reiter-${k}`}>
              <Icon symbol={symbol} groesse="klein" />
              {text}
              <span className="fa-reiter-zahl">{zahlen[k]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="kunden" className="fa-tab">
          {liste('kunden', KUNDEN, kundenSpalten, k => String(k.id))}
        </TabsContent>
        <TabsContent value="auftraege" className="fa-tab">
          {liste('auftraege', auftraege, auftragSpalten, a => a.nr)}
        </TabsContent>
        <TabsContent value="lieferanten" className="fa-tab">
          {liste('lieferanten', LIEFERANTEN, lieferantenSpalten, l => String(l.id))}
        </TabsContent>
        <TabsContent value="maschinen" className="fa-tab">
          {liste('maschinen', MASCHINEN, maschinenSpalten, m => m.id)}
        </TabsContent>
        <TabsContent value="personen" className="fa-tab">
          <p className="fa-satz st-satz">
            {t(
              `Alle ${PERSONEN.length} Leute der Firma; ${PERSONEN.filter(p => p.konto !== false).length} davon arbeiten mit Arasul. Konten und Rechte pflegt die Verwaltung.`,
              `All ${PERSONEN.length} people of the company; ${PERSONEN.filter(p => p.konto !== false).length} of them work with Arasul. Accounts and rights are managed in Administration.`
            )}
          </p>
          {liste('personen', PERSONEN, personenSpalten, p => String(p.id))}
        </TabsContent>
      </Tabs>

      <Einzelansicht
        b={b}
        g={gewaehlt}
        schliessen={() => setGewaehlt(null)}
        bearbeiten={(art, satz) => setFormular({ art, satz })}
      />

      {formular && (
        <StammFormular
          art={formular.art}
          satz={formular.satz}
          schliessen={() => setFormular(null)}
          gespeichert={(id, neu) => {
            setFormular(null);
            void laden().then(() => {
              setGewaehlt({ art: formular.art, id });
              try {
                window.localStorage.setItem('arasul-demo-neu', String(Date.now()));
              } catch {
                /* nur hier */
              }
            });
            melden(neu ? t('Angelegt.', 'Created.') : t('Gespeichert.', 'Saved.'));
          }}
        />
      )}

      {toast && (
        <div className="fa-toast" role="status" aria-live="polite">
          <Meldung art="erfolg">{toast}</Meldung>
        </div>
      )}
    </div>
  );
}

// ── Einzelansicht ───────────────────────────────────────────────────────────

function Felder({ zeilen }: { zeilen: [string, ReactNode][] }) {
  return (
    <dl className="fa-felder">
      {zeilen
        .filter(([, w]) => w !== null && w !== undefined && w !== '')
        .map(([k, w]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{w}</dd>
          </div>
        ))}
    </dl>
  );
}

function Einzelansicht({
  b,
  g,
  schliessen,
  bearbeiten,
}: {
  b: Bestand | undefined;
  g: Gewaehlt;
  schliessen: () => void;
  bearbeiten: (art: Pflegbar, satz: unknown) => void;
}) {
  const [letzt, setLetzt] = useState<Gewaehlt>(g);
  useEffect(() => {
    if (g) setLetzt(g);
  }, [g]);
  const x = g ?? letzt;
  const liste = useMemo(() => (b && x ? vorgaenge(b, x) : []), [b, x]);

  let oben: ReactNode = null;
  let titel = '';
  let neben = '';
  let zahlen: KennzahlProps[] = [];
  let felder: [string, ReactNode][] = [];
  let fuss: ReactNode = null;

  if (b && x?.art === 'kunden') {
    const k = KUNDEN.find(y => String(y.id) === x.id);
    if (k) {
      const z = kundeZahlen(b, k);
      oben = <Mono>{kundenNr(k)}</Mono>;
      titel = k.name;
      neben = `${tx(k.art)} · ${k.ort}`;
      zahlen = [
        {
          beschriftung: t('Umsatz', 'Revenue'),
          wert: euro(z.umsatz),
          fussnote: t(
            `${z.an.length} ${z.an.length === 1 ? 'Auftrag' : 'Aufträge'}, netto`,
            `${z.an.length} ${z.an.length === 1 ? 'order' : 'orders'}, net`
          ),
        },
        {
          beschriftung: t('Offene Angebote', 'Open quotes'),
          wert: String(z.offen.length),
          fussnote: euro(z.offen.reduce((s, e) => s + Number(e.felder.betrag), 0)),
        },
        {
          beschriftung: t('Annahmequote', 'Win rate'),
          wert: String(prozent(z.an.length, z.ent.length)),
          einheit: '%',
          fussnote: t(`${z.l.length} Angebote`, `${z.l.length} quotes`),
        },
      ];
      felder = [
        [
          t('Ansprechpartner', 'Contact'),
          SPRACHE === 'en'
            ? (k.ansprechpartner ?? '').replace(/^Herr /, 'Mr ').replace(/^Frau /, 'Ms ')
            : k.ansprechpartner,
        ],
        [t('Telefon', 'Phone'), <Mono key="t">{kundeTelefon(k)}</Mono>],
        [t('Anschrift', 'Address'), kundeAnschrift(k)],
        [
          t('Zahlungsziel', 'Payment terms'),
          t(`${kundeZiel(k)} Tage netto`, `${kundeZiel(k)} days net`),
        ],
        [t('Letztes Angebot', 'Last quote'), z.letzt ? datum(z.letzt.felder.datum) : '–'],
        [t('Notiz', 'Note'), k.notiz],
      ];
      fuss = (
        <>
          <Button
            variant="solid"
            size="sm"
            onClick={() => neuIn('angebote', { kunde: k.id })}
            data-testid="st-angebot"
          >
            <Icon symbol={Plus} />
            {t('Angebot anlegen', 'New quote')}
          </Button>
          <Button size="sm" onClick={() => bearbeiten('kunden', k)} data-testid="st-bearbeiten">
            <Icon symbol={Pencil} />
            {t('Bearbeiten', 'Edit')}
          </Button>
        </>
      );
    }
  } else if (b && x?.art === 'lieferanten') {
    const l = LIEFERANTEN.find(y => String(y.id) === x.id);
    if (l) {
      const z = lieferantZahlen(b, l);
      oben = <Mono>{lieferantNr(l)}</Mono>;
      titel = l.name;
      neben = `${tx(l.was)} · ${l.ort}`;
      zahlen = [
        {
          beschriftung: t('Lieferungen', 'Deliveries'),
          wert: String(z.we.length),
          fussnote: t(`${z.da.length} eingegangen`, `${z.da.length} received`),
        },
        {
          beschriftung: t('Liefertreue', 'On-time delivery'),
          wert: z.da.length ? String(z.treu) : '–',
          einheit: z.da.length ? '%' : undefined,
          fussnote: t('am erwarteten Tag oder früher', 'on the expected day or earlier'),
        },
        {
          beschriftung: t('Reklamationen', 'Complaints'),
          wert: String(z.rekl.length),
          fussnote: z.einsaetze.length
            ? t(`${z.einsaetze.length} Wartungseinsätze`, `${z.einsaetze.length} service jobs`)
            : t('bei Lieferungen', 'on deliveries'),
        },
      ];
      felder = [
        [t('Liefert', 'Supplies'), tx(l.was)],
        [t('Ort', 'Town'), l.ort],
        [t('Telefon', 'Phone'), <Mono key="t">{lieferantTelefon(l)}</Mono>],
        [t('Ansprechpartner', 'Contact'), l.ansprechpartner],
        [t('Notiz', 'Note'), l.notiz],
      ];
      fuss = (
        <>
          <Button
            variant="solid"
            size="sm"
            onClick={() => neuIn('wareneingang', { lieferant: l.id })}
          >
            <Icon symbol={Plus} />
            {t('Lieferung erfassen', 'Record delivery')}
          </Button>
          <Button
            size="sm"
            onClick={() => bearbeiten('lieferanten', l)}
            data-testid="st-bearbeiten"
          >
            <Icon symbol={Pencil} />
            {t('Bearbeiten', 'Edit')}
          </Button>
        </>
      );
    }
  } else if (b && x?.art === 'maschinen') {
    const m = MASCHINEN.find(y => y.id === x.id);
    if (m) {
      const z = maschineZahlen(b, m);
      oben = <Mono>{m.id}</Mono>;
      titel = tx(m.name);
      neben = `${tx(m.ort)} · ${t('Baujahr', 'built')} ${m.baujahr}`;
      zahlen = [
        {
          beschriftung: t('Wartungen erledigt', 'Services done'),
          wert: String(z.erledigt.length),
          fussnote: t(`${zahl(z.stunden)} Stunden`, `${zahl(z.stunden)} hours`),
        },
        {
          beschriftung: t('Offen', 'Open'),
          wert: String(z.offen.length),
          fussnote: z.offen.some(e => tageBis(e.felder.faellig) < 0)
            ? t('davon überfällig', 'some overdue')
            : t('geplant', 'planned'),
        },
        {
          beschriftung: t('Nächste Wartung', 'Next service'),
          wert: z.naechste ? datum(z.naechste.felder.faellig) : '–',
          fussnote: z.naechste
            ? tx(z.naechste.felder.aufgabe)
            : t('nichts geplant', 'nothing planned'),
        },
      ];
      felder = [
        [t('Kennung', 'ID'), <Mono key="i">{m.id}</Mono>],
        [t('Standort', 'Location'), tx(m.ort)],
        [t('Baujahr', 'Built'), String(m.baujahr)],
        [
          t('Alter', 'Age'),
          t(
            `${new Date().getFullYear() - m.baujahr} Jahre`,
            `${new Date().getFullYear() - m.baujahr} years`
          ),
        ],
        [t('Notiz', 'Note'), m.notiz],
      ];
      fuss = (
        <>
          <Button
            variant="solid"
            size="sm"
            onClick={() => neuIn('wartungsplan', { maschine: m.id })}
          >
            <Icon symbol={Plus} />
            {t('Wartung eintragen', 'Add maintenance')}
          </Button>
          <Button size="sm" onClick={() => bearbeiten('maschinen', m)} data-testid="st-bearbeiten">
            <Icon symbol={Pencil} />
            {t('Bearbeiten', 'Edit')}
          </Button>
        </>
      );
    }
  } else if (b && x?.art === 'auftraege') {
    const a = auftraegeAus(b).find(y => y.nr === x.id);
    if (a) {
      const we = b.wareneingang.filter(e => e.felder.auftrag === a.nr);
      const pp = b.pruefprotokolle.filter(e => e.felder.auftrag === a.nr);
      const mitErgebnis = pp.filter(e => e.felder.ergebnis);
      oben = (
        <>
          <Mono>{a.nr}</Mono>{' '}
          {a.laufend ? (
            <Badge variant="warning">{t('in Fertigung', 'in production')}</Badge>
          ) : (
            <Badge variant="success">{t('abgeschlossen', 'completed')}</Badge>
          )}
        </>
      );
      titel = a.gegenstand;
      neben = `${kundeName(a.kunde)} · ${t('seit', 'since')} ${datum(a.seit)}`;
      zahlen = [
        {
          beschriftung: t('Auftragswert', 'Order value'),
          wert: euro(a.wert),
          fussnote: t('netto, aus dem Angebot', 'net, from the quote'),
        },
        {
          beschriftung: t('Material', 'Material'),
          wert: String(we.length),
          fussnote: t(
            `${we.length === 1 ? 'Lieferung' : 'Lieferungen'}, ${we.filter(e => !e.felder.eingang).length} erwartet`,
            `${we.length === 1 ? 'delivery' : 'deliveries'}, ${we.filter(e => !e.felder.eingang).length} expected`
          ),
        },
        {
          beschriftung: t('Prüfungen', 'Inspections'),
          wert: String(pp.length),
          fussnote: mitErgebnis.length
            ? t(
                `${prozent(mitErgebnis.filter(e => e.felder.ergebnis === 'io').length, mitErgebnis.length)} % in Ordnung`,
                `${prozent(mitErgebnis.filter(e => e.felder.ergebnis === 'io').length, mitErgebnis.length)}% passed`
              )
            : t('noch keine', 'none yet'),
        },
      ];
      felder = [
        [
          t('Kunde', 'Customer'),
          <button
            key="k"
            type="button"
            className="fa-stammlink"
            onClick={() => stammOeffnen('kunde', a.kunde)}
          >
            {kundeName(a.kunde)}
          </button>,
        ],
        [
          t('Aus Angebot', 'From quote'),
          <button
            key="a"
            type="button"
            className="fa-stammlink"
            onClick={() => vorgangOeffnen('angebote', a.angebot.id)}
          >
            {a.angebot.nr}
          </button>,
        ],
        [t('Gegenstand', 'Subject'), a.gegenstand],
        [t('Auftragswert', 'Order value'), <Mono key="w">{euro(a.wert)}</Mono>],
        [t('Angenommen am', 'Accepted on'), datum(a.seit)],
        [t('Ausführung', 'Execution'), t('EN 1090, EXC2', 'EN 1090, EXC2')],
      ];
      fuss = a.laufend ? (
        <>
          <Button
            variant="solid"
            size="sm"
            onClick={() => neuIn('pruefprotokolle', { auftrag: a.nr })}
          >
            <Icon symbol={Plus} />
            {t('Prüfung erfassen', 'Record inspection')}
          </Button>
          <Button size="sm" onClick={() => neuIn('wareneingang', { auftrag: a.nr })}>
            <Icon symbol={Plus} />
            {t('Material erfassen', 'Record material')}
          </Button>
        </>
      ) : null;
    }
  } else if (b && x?.art === 'personen') {
    const p = PERSONEN.find(y => String(y.id) === x.id);
    if (p) {
      const z = personZahlen(b, p);
      oben = <Mono>{p.kuerzel}</Mono>;
      titel = vollName(p);
      neben = `${tx(p.aufgabe)} · ${abteilung(p)}`;
      zahlen = [
        {
          beschriftung: t('Resturlaub', 'Leave left'),
          wert: String(p.urlaub),
          einheit: t('Tage', 'days'),
          fussnote: t(`${z.geplant} davon verplant`, `${z.geplant} of them planned`),
        },
        {
          beschriftung: t('Heute', 'Today'),
          wert: z.weg ? t('abwesend', 'away') : t('im Haus', 'in'),
          fussnote: z.weg
            ? t(`bis ${datum(z.weg.felder.bis)}`, `until ${datum(z.weg.felder.bis)}`)
            : abteilung(p),
        },
        {
          beschriftung: t('Vorgänge', 'Records'),
          wert: String(liste.length),
          fussnote: t('in allen Apps', 'across all apps'),
        },
      ];
      felder = [
        [t('Aufgabe', 'Role'), tx(p.aufgabe)],
        [t('Abteilung', 'Department'), abteilung(p)],
        [t('Kürzel', 'Initials'), <Mono key="k">{p.kuerzel}</Mono>],
        [t('Konto', 'Account'), t('wird in der Verwaltung gepflegt', 'managed in Administration')],
      ];
      fuss = (
        <Button variant="solid" size="sm" onClick={() => neuIn('urlaub', { person: p.id })}>
          <Icon symbol={Plus} />
          {t('Urlaub eintragen', 'Enter leave')}
        </Button>
      );
    }
  }

  const gruppen = (Object.keys(APP_NAME) as AppKennung[])
    .map(app => ({ app, l: liste.filter(v => v.app === app) }))
    .filter(x => x.l.length);

  return (
    <Blatt
      offen={g !== null}
      beiSchliessen={schliessen}
      oben={oben}
      titel={titel}
      beschreibung={neben}
      breite="breit"
      fuss={fuss}
      kennzeichen="st-blatt-flaeche"
    >
      <div className="fa-blatt-inhalt" data-testid="st-blatt">
        {zahlen.length > 0 && (
          <div className="st-zahlen">
            <Kennzahlen className="st-drei">
              {zahlen.map(k => (
                <Kennzahl key={k.beschriftung} {...k} />
              ))}
            </Kennzahlen>
          </div>
        )}
        <Felder zeilen={felder} />
        <section aria-labelledby="st-vorgaenge">
          <h3 id="st-vorgaenge" className="fa-abschnitt">
            {t('Vorgänge', 'Records')} <Mono>{liste.length}</Mono>
          </h3>
          {gruppen.length === 0 ? (
            <p className="fa-satz">{t('Noch kein Vorgang.', 'No record yet.')}</p>
          ) : (
            gruppen.map(gr => (
              <div key={gr.app} className="st-gruppe">
                <p className="st-gruppe-titel">
                  <Icon symbol={SYMBOL[gr.app]} groesse="klein" />
                  {APP_NAME[gr.app]} · {gr.l.length}
                </p>
                <ul className="fa-hinweise">
                  {gr.l.slice(0, 8).map(v => (
                    <li key={v.e.id}>
                      <button
                        type="button"
                        onClick={() => vorgangOeffnen(v.app, v.e.id)}
                        data-testid={`st-vorgang-${v.e.nr}`}
                      >
                        <span className="st-vorgang-kopf">
                          <span className="fa-hinweis-titel">
                            {v.e.nr} {v.titel}
                          </span>
                          <StandMarke app={v.app} stand={v.e.stand} />
                        </span>
                        <span className="fa-hinweis-satz">{v.neben}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {gr.l.length > 8 && (
                  <p className="fa-satz">
                    {t(`und ${gr.l.length - 8} ältere`, `and ${gr.l.length - 8} older`)}
                  </p>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </Blatt>
  );
}

// ── Formular ────────────────────────────────────────────────────────────────

interface FeldBeschreibung {
  key: string;
  titel: string;
  pflicht?: boolean;
  nurNeu?: boolean;
  zahl?: boolean;
  lang?: boolean;
  hinweis?: string;
  aus: (satz: Record<string, unknown>) => string;
}

const FORMULARE: Record<Pflegbar, FeldBeschreibung[]> = {
  kunden: [
    { key: 'name', titel: t('Name', 'Name'), pflicht: true, aus: s => String(s.name ?? '') },
    {
      key: 'art',
      titel: t('Art', 'Type'),
      pflicht: true,
      hinweis: t(
        'Etwa Bauträger, Maschinenbau, Gemeinde.',
        'E.g. developer, machine builder, municipality.'
      ),
      aus: s => tx(s.art as never),
    },
    { key: 'ort', titel: t('Ort', 'Town'), pflicht: true, aus: s => String(s.ort ?? '') },
    {
      key: 'ansprechpartner',
      titel: t('Ansprechpartner', 'Contact'),
      aus: s => String(s.ansprechpartner ?? ''),
    },
    {
      key: 'telefon',
      titel: t('Telefon', 'Phone'),
      aus: s => (s.id ? kundeTelefon(s as unknown as Kunde) : ''),
    },
    {
      key: 'zahlungsziel',
      titel: t('Zahlungsziel in Tagen', 'Payment terms in days'),
      zahl: true,
      aus: s => (s.id ? String(kundeZiel(s as unknown as Kunde)) : '30'),
    },
    { key: 'notiz', titel: t('Notiz', 'Note'), lang: true, aus: s => String(s.notiz ?? '') },
  ],
  lieferanten: [
    { key: 'name', titel: t('Name', 'Name'), pflicht: true, aus: s => String(s.name ?? '') },
    { key: 'was', titel: t('Liefert', 'Supplies'), pflicht: true, aus: s => tx(s.was as never) },
    { key: 'ort', titel: t('Ort', 'Town'), pflicht: true, aus: s => String(s.ort ?? '') },
    {
      key: 'ansprechpartner',
      titel: t('Ansprechpartner', 'Contact'),
      aus: s => String(s.ansprechpartner ?? ''),
    },
    {
      key: 'telefon',
      titel: t('Telefon', 'Phone'),
      aus: s => (s.id ? lieferantTelefon(s as unknown as Lieferant) : ''),
    },
    { key: 'notiz', titel: t('Notiz', 'Note'), lang: true, aus: s => String(s.notiz ?? '') },
  ],
  maschinen: [
    {
      key: 'id',
      titel: t('Kennung', 'ID'),
      pflicht: true,
      nurNeu: true,
      hinweis: t('Etwa „SB-3": Kürzel und Nummer.', 'E.g. “SB-3”: code and number.'),
      aus: s => String(s.id ?? ''),
    },
    { key: 'name', titel: t('Bezeichnung', 'Name'), pflicht: true, aus: s => tx(s.name as never) },
    { key: 'ort', titel: t('Standort', 'Location'), pflicht: true, aus: s => tx(s.ort as never) },
    {
      key: 'baujahr',
      titel: t('Baujahr', 'Year built'),
      zahl: true,
      aus: s => String(s.baujahr ?? new Date().getFullYear()),
    },
    { key: 'notiz', titel: t('Notiz', 'Note'), lang: true, aus: s => String(s.notiz ?? '') },
  ],
};

function StammFormular({
  art,
  satz,
  schliessen,
  gespeichert,
}: {
  art: Pflegbar;
  satz: unknown;
  schliessen: () => void;
  gespeichert: (id: string, neu: boolean) => void;
}) {
  const alt = (satz ?? {}) as Record<string, unknown>;
  const neu = satz === null;
  const felder = FORMULARE[art].filter(f => neu || !f.nurNeu);
  const [werte, setWerte] = useState<Record<string, string>>(() =>
    Object.fromEntries(felder.map(f => [f.key, f.aus(alt)]))
  );
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);

  const absenden = async () => {
    const fe: Record<string, string> = {};
    for (const f of felder) {
      const v = werte[f.key]?.trim() ?? '';
      if (f.pflicht && !v) fe[f.key] = t('Bitte ausfüllen.', 'Please fill in.');
      if (f.zahl && v && !/^\d+$/.test(v))
        fe[f.key] = t('Bitte eine Zahl.', 'Please enter a number.');
    }
    setFehler(fe);
    if (Object.keys(fe).length) return;
    setLaeuft(true);
    try {
      const r = neu
        ? await rufe<{ id: string | number }>('POST', `stamm/${art}`, { felder: werte })
        : await rufe<{ id: string | number }>('PATCH', `stamm/${art}/${String(alt.id)}`, {
            felder: werte,
          });
      gespeichert(String(r.id), neu);
    } catch (f) {
      setFehler({ _: (f as Error).message });
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialogform
      offen
      beiSchliessen={schliessen}
      titel={neu ? NEU_TEXT[art] : t('Bearbeiten', 'Edit')}
      groesse="mittel"
      schliesstBeiKlickDaneben={false}
    >
      <div className="fa-formular" data-testid="st-formular">
        {fehler._ && <Meldung art="fehler">{fehler._}</Meldung>}
        <Formular
          onAbsenden={() => void absenden()}
          aktionen={
            <>
              <Knopf art="still" onKlick={schliessen}>
                {t('Abbrechen', 'Cancel')}
              </Knopf>
              <Knopf art="haupt" typ="absenden" gesperrt={laeuft} kennzeichen="st-speichern">
                {neu ? t('Anlegen', 'Create') : t('Speichern', 'Save')}
              </Knopf>
            </>
          }
        >
          {felder.map(f => {
            const kennung = `st-feld-${f.key}`;
            const gemeinsam = {
              id: kennung,
              value: werte[f.key] ?? '',
              'aria-invalid': fehler[f.key] ? true : undefined,
              onChange: (ev: { target: { value: string } }) =>
                setWerte(w => ({ ...w, [f.key]: ev.target.value })),
            };
            return (
              <Feld
                key={f.key}
                kennung={kennung}
                beschriftung={f.pflicht ? `${f.titel} *` : f.titel}
                hinweis={
                  fehler[f.key] ? <span className="fa-fehler">{fehler[f.key]}</span> : f.hinweis
                }
              >
                {f.lang ? (
                  <textarea {...gemeinsam} rows={3} />
                ) : (
                  <input {...gemeinsam} type="text" inputMode={f.zahl ? 'numeric' : undefined} />
                )}
              </Feld>
            );
          })}
        </Formular>
      </div>
    </Dialogform>
  );
}

document.title = t('Stammdaten', 'Master data');
const knoten = document.getElementById('app');
if (knoten) createRoot(knoten).render(<StammApp />);
new MutationObserver(() => window.dispatchEvent(new Event('resize'))).observe(
  document.documentElement,
  { attributes: true, attributeFilter: ['style'] }
);
