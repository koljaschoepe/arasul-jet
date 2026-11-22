/**
 * Der Anfangsbestand der fünf Fach-Apps der Demo (J54, M7), erzeugt aus der
 * einen Firma (`firma.ts`). Jede App hat rund 40 Einträge, verteilt über das
 * letzte Jahr und die nächsten Wochen, relativ zum Tag des Besuchs: die
 * Beispieldaten altern nicht. Der Zufall ist fest (gleicher Samen), damit
 * jeder Besuch denselben Betrieb sieht und Tests stabil bleiben.
 *
 * Die Formen hier liest der Service Worker (`antworten.ts`), die Apps
 * (`apps/`) und die Übersicht der Startseite (`uebersicht.tsx`).
 */
import { ARTIKEL, AUFTRAEGE, ICH_ID, KUNDEN, MASCHINEN, PERSONEN, type Text } from './firma';

export type AppKennung =
  'angebote' | 'wareneingang' | 'wartungsplan' | 'pruefprotokolle' | 'urlaub';
export const FACH_APPS: AppKennung[] = [
  'angebote',
  'wareneingang',
  'wartungsplan',
  'pruefprotokolle',
  'urlaub',
];

/** Ein Text der Daten: angelegt in beiden Sprachen, eingegeben als Zeichenkette. */
export type Wert = string | number | boolean | null | Text;

export interface Datei {
  id: string;
  name: Text | string;
  art: 'pdf' | 'bild';
  /** Erzeugt der Service Worker aus dem Eintrag; sonst liegt `data` dabei. */
  vorlage?: 'angebot' | 'lieferschein' | 'wartung' | 'pruefung' | 'antrag' | 'zeichnung' | 'foto';
  /** Hochgeladen: als Data-URL, nur im Browser des Besuchers. */
  data?: string;
  am: string;
  wer: number;
}

export interface Schritt {
  am: string;
  wer: number;
  text: Text | string;
}

export interface Eintrag {
  /** Über alle Apps eindeutig; zugleich die Nummer einer Freigabe. */
  id: number;
  nr: string;
  stand: string;
  felder: Record<string, Wert>;
  dateien: Datei[];
  verlauf: Schritt[];
  angelegt_am: string;
  geaendert_am: string;
}

export type Bestand = Record<AppKennung, Eintrag[]>;

export const PRAEFIX: Record<AppKennung, string> = {
  angebote: 'AN-26-',
  wareneingang: 'WE-26-',
  wartungsplan: 'WA-26-',
  pruefprotokolle: 'PP-26-',
  urlaub: 'UA-26-',
};

/** Welcher Stand eine Freigabe verlangt, und bei wem sie liegt (immer: bei mir). */
export const FREIGABE_STAND: Partial<Record<AppKennung, string>> = {
  angebote: 'freigabe',
  pruefprotokolle: 'freigabe',
  urlaub: 'beantragt',
};

const T = (de: string, en: string): Text => ({ de, en });

// ── Zeit und Zufall ─────────────────────────────────────────────────────────

const TAG = 86_400_000;

/** Ein Tag relativ zu heute, als `JJJJ-MM-TT`. */
export function tagRelativ(abstand: number, jetzt: number): string {
  const d = new Date(jetzt + abstand * TAG);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Ein Zeitpunkt in der Arbeitszeit: an einem Werktag zwischen 7 und 17 Uhr
 * und nie nach jetzt. Ein Metallbauer bucht nicht sonntags um eins.
 */
export function arbeitszeit(ms: number, jetzt: number): string {
  const d = new Date(ms);
  const index = Math.floor(ms / 3_600_000);
  const stunde = d.getHours();
  // Die Minute aus der Stunde gestreut: sonst endete jeder Zeitpunkt auf
  // der Minute des Besuchs.
  if (stunde < 7 || stunde >= 17) d.setHours(7 + (index % 10), (index * 37 + 11) % 60);
  else d.setMinutes((index * 37 + 11) % 60);
  for (let i = 0; i < 10; i += 1) {
    if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    else if (d.getDay() === 0) d.setDate(d.getDate() - 2);
    else if (d.getTime() > jetzt) d.setDate(d.getDate() - 1);
    else break;
  }
  return d.toISOString();
}

/** Ein Zeitpunkt relativ zu heute, Stunden in die Vergangenheit, in der Arbeitszeit. */
function vor(stunden: number, jetzt: number): string {
  return arbeitszeit(jetzt - stunden * 3_600_000, jetzt);
}

/** Ein kleiner Zufall mit festem Samen (mulberry32). */
function zufall(samen: number) {
  let a = samen >>> 0;
  const z = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    z,
    ganz: (von: number, bis: number) => von + Math.floor(z() * (bis - von + 1)),
    eins: <X>(liste: readonly X[]): X => liste[Math.floor(z() * liste.length)]!,
  };
}

/** Ein Werktag: Samstag und Sonntag rücken auf Montag. */
function werktag(abstand: number, jetzt: number): number {
  const d = new Date(jetzt + abstand * TAG).getDay();
  if (d === 6) return abstand + 2;
  if (d === 0) return abstand + 1;
  return abstand;
}

function schritt(stunden: number, wer: number, text: Text | string, jetzt: number): Schritt {
  return { am: vor(stunden, jetzt), wer, text };
}

// ── Angebote ────────────────────────────────────────────────────────────────

const ANGEBOT_GEGENSTAENDE: [Text, number, number][] = [
  [T('Außentreppe verzinkt, 14 Stufen', 'External stair, galvanised, 14 steps'), 18000, 26000],
  [T('Balkongeländer Edelstahl mit Glas', 'Stainless balcony railing with glass'), 22000, 48000],
  [T('Vordach Eingang, 4 × 2 m', 'Entrance canopy, 4 × 2 m'), 6500, 11000],
  [T('Schiebetor mit Antrieb, 6 m', 'Sliding gate with drive, 6 m'), 9800, 15500],
  [T('Fluchttreppe mit Podesten', 'Escape stair with landings'), 38000, 72000],
  [T('Schweißbaugruppe Rahmen nach Zeichnung', 'Welded frame to drawing'), 7400, 19800],
  [T('Laserteile nach Zeichnung, Serie', 'Laser parts to drawing, batch'), 2800, 9600],
  [T('Bühne mit Gitterrost', 'Grating platform'), 14500, 32000],
  [T('Handlauf Treppenhaus, Edelstahl', 'Stairwell handrail, stainless'), 3200, 7800],
  [T('Maschinenverkleidung, Kantteile', 'Machine guards, bent parts'), 5200, 14200],
  [T('Zaunanlage mit Tor, 48 m', 'Fence with gate, 48 m'), 11800, 21500],
  [T('Wendeltreppe, feuerverzinkt', 'Spiral stair, hot-dip galvanised'), 8900, 14800],
  [T('Stahlstützen und Unterzüge Anbau', 'Steel columns and beams, extension'), 12600, 28400],
  [T('Regalbühne Lager', 'Warehouse mezzanine'), 24000, 52000],
  [T('Absturzsicherung Flachdach', 'Fall protection, flat roof'), 4800, 9900],
  [T('Fahrradüberdachung, 3 Felder', 'Bicycle shelter, 3 bays'), 7600, 12400],
];

function angebote(jetzt: number): Eintrag[] {
  const r = zufall(87);
  const liste: Eintrag[] = [];
  // Die Aufträge zuerst: aus genau diesen Angeboten entstanden sie.
  const ausAuftrag = new Map(AUFTRAEGE.map(a => [a.angebot, a]));
  for (let i = 0; i < 42; i += 1) {
    const nummer = 74 + i;
    const nr = `AN-26-${String(nummer).padStart(3, '0')}`;
    const auftrag = ausAuftrag.get(nr);
    const alter = Math.round((41 - i) * 8.6) + r.ganz(0, 4); // Tage, älteste zuerst
    const [gegenstand, min, max] = r.eins(ANGEBOT_GEGENSTAENDE);
    const kunde = auftrag ? auftrag.kunde : r.eins(KUNDEN).id;
    const betrag = Math.round((min + r.z() * (max - min)) / 10) * 10;
    let stand: string;
    if (auftrag) stand = 'angenommen';
    else if (alter > 60) stand = r.z() < 0.55 ? 'angenommen' : 'abgelehnt';
    else if (alter > 14) stand = r.eins(['versendet', 'versendet', 'angenommen', 'abgelehnt']);
    else if (alter > 4) stand = r.eins(['versendet', 'versendet', 'entwurf']);
    else stand = 'entwurf';
    const wer = r.z() < 0.6 ? 3 : 4;
    const datum = tagRelativ(werktag(-alter, jetzt), jetzt);
    const felder: Record<string, Wert> = {
      kunde,
      betreff: auftrag ? auftrag.gegenstand : gegenstand,
      bearbeiter: wer,
      betrag,
      rabatt: [1, 5, 12, 18].includes(kunde) ? 3 : 0,
      datum,
      gueltig: tagRelativ(-alter + 30, jetzt),
      auftrag: auftrag?.nr ?? null,
      notiz: null,
    };
    const verlauf: Schritt[] = [
      schritt(alter * 24 + 6, wer, T('Angebot angelegt', 'Quote created'), jetzt),
    ];
    if (stand !== 'entwurf') {
      verlauf.push(
        schritt(
          alter * 24 - 2,
          wer,
          T('Als PDF an den Kunden versendet', 'Sent to the customer as PDF'),
          jetzt
        )
      );
    }
    if (stand === 'angenommen') {
      verlauf.push(
        schritt(
          Math.max(1, alter - 9) * 24,
          wer,
          auftrag
            ? T(
                `Angenommen, Auftrag ${auftrag.nr} angelegt`,
                `Accepted, order ${auftrag.nr} created`
              )
            : T('Vom Kunden angenommen', 'Accepted by the customer'),
          jetzt
        )
      );
    }
    if (stand === 'abgelehnt') {
      verlauf.push(
        schritt(
          Math.max(1, alter - 12) * 24,
          wer,
          T('Abgelehnt: Kunde hat anders vergeben', 'Declined: customer chose another supplier'),
          jetzt
        )
      );
    }
    const dateien: Datei[] = [
      { id: 'angebot', name: `${nr}.pdf`, art: 'pdf', vorlage: 'angebot', am: verlauf[0]!.am, wer },
    ];
    if (i % 3 === 0) {
      dateien.push({
        id: 'zeichnung',
        name: T(`Skizze-${nr}.svg`, `Sketch-${nr}.svg`),
        art: 'bild',
        vorlage: 'zeichnung',
        am: verlauf[0]!.am,
        wer,
      });
    }
    liste.push({
      id: 1000 + i,
      nr,
      stand,
      felder,
      dateien,
      verlauf,
      angelegt_am: verlauf[0]!.am,
      geaendert_am: verlauf[verlauf.length - 1]!.am,
    });
  }
  // Zwei große Angebote warten auf die Freigabe der Betriebsleitung.
  for (const [k, betrag, kunde, gegenstand] of [
    [
      40,
      48600,
      16,
      T('Fluchttreppe Schulzentrum, Bauteil C', 'Escape stair, school centre, section C'),
    ],
    [41, 31250, 6, T('Bühnen und Treppen Kesselhaus', 'Platforms and stairs, boiler house')],
  ] as const) {
    const e = liste[k]!;
    e.stand = 'freigabe';
    e.felder.betrag = betrag;
    e.felder.kunde = kunde;
    e.felder.betreff = gegenstand;
    e.verlauf.push(
      schritt(
        5 - (k - 40) * 3,
        3,
        T(
          'Zur Freigabe an Miriam Kerschner (über 20.000 €)',
          'Sent to Miriam Kerschner for approval (over €20,000)'
        ),
        jetzt
      )
    );
    e.geaendert_am = e.verlauf[e.verlauf.length - 1]!.am;
  }
  return liste.reverse();
}

// ── Wareneingang ────────────────────────────────────────────────────────────

function wareneingang(jetzt: number): Eintrag[] {
  const r = zufall(42);
  const liste: Eintrag[] = [];
  // Unregelmäßig wie im echten Betrieb: mal zwei Lieferungen am Tag, mal
  // drei Tage keine.
  let tag = -72;
  for (let i = 0; i < 44; i += 1) {
    tag += r.eins([0, 1, 2, 2, 3, 3]);
    const artikel = r.eins(ARTIKEL);
    // Von 70 Tagen zurück bis 6 Tage voraus; die letzten sind erwartet.
    // Die letzten fünf: heute und in den nächsten Tagen erwartet, an jedem Wochentag.
    // Heute erwartet nur an einem Werktag; am Wochenende rückt es auf Montag.
    const letzter = [-2, 0, 0, 0, 0, 0, -1][new Date(jetzt).getDay()]!;
    const abstand =
      i >= 39
        ? i === 41
          ? letzter
          : werktag([0, 0, 0, 1, 2][i - 39]!, jetzt)
        : werktag(Math.min(tag, -1), jetzt);
    const auftrag = r.z() < 0.65 ? r.eins(AUFTRAEGE) : null;
    let stand: string;
    if (abstand > 0) stand = 'erwartet';
    else if (abstand === 0) stand = i === 41 ? 'eingegangen' : 'erwartet';
    else if (abstand > -3) stand = r.eins(['eingegangen', 'geprueft']);
    else stand = r.z() < 0.07 ? 'reklamiert' : 'eingelagert';
    const menge =
      artikel.lagerort === 'L-30'
        ? r.ganz(4, 12)
        : artikel.einheit.de === 'Stück'
          ? r.ganz(2, 40) * 10
          : artikel.einheit.de === 'm'
            ? r.ganz(4, 30) * 6
            : r.ganz(2, 24);
    const nr = `WE-26-${String(311 + i).padStart(4, '0')}`;
    const felder: Record<string, Wert> = {
      lieferant: artikel.lieferant,
      bestellung: `B-26-${String(520 + Math.floor(i * 0.9)).padStart(4, '0')}`,
      lieferschein: abstand <= 0 ? `LS ${r.ganz(10000, 99999)}` : null,
      artikel: artikel.nr,
      menge,
      auftrag: auftrag?.nr ?? null,
      erwartet: tagRelativ(abstand, jetzt),
      // Jede siebte Lieferung kam einen Tag zu spät.
      eingang:
        stand === 'erwartet'
          ? null
          : tagRelativ(i % 7 === 3 && abstand < -1 ? abstand + 1 : abstand, jetzt),
      pruefer: 7,
      lagerort: artikel.lagerort,
      notiz: null,
    };
    const verlauf: Schritt[] = [
      schritt(
        (-abstand + 9) * 24,
        6,
        T(
          `Bestellt bei Lieferant, ${felder.bestellung}`,
          `Ordered from supplier, ${felder.bestellung}`
        ),
        jetzt
      ),
    ];
    if (stand !== 'erwartet')
      verlauf.push(
        schritt(
          -abstand * 24 + 2,
          7,
          T('Ware angenommen, Lieferschein erfasst', 'Goods received, delivery note recorded'),
          jetzt
        )
      );
    if (['geprueft', 'eingelagert', 'reklamiert'].includes(stand))
      verlauf.push(
        schritt(
          -abstand * 24 + 1,
          7,
          T('Menge und Zustand geprüft', 'Quantity and condition checked'),
          jetzt
        )
      );
    if (stand === 'eingelagert')
      verlauf.push(
        schritt(
          -abstand * 24,
          7,
          T(`Eingelagert auf ${artikel.lagerort}`, `Stored at ${artikel.lagerort}`),
          jetzt
        )
      );
    if (stand === 'reklamiert') {
      felder.notiz = T(
        'Kanten verbogen, zwei Tafeln unbrauchbar. Ersatz angefragt.',
        'Edges bent, two sheets unusable. Replacement requested.'
      );
      verlauf.push(
        schritt(
          -abstand * 24,
          7,
          T(
            'Beim Lieferanten reklamiert, Foto angehängt',
            'Complaint sent to supplier, photo attached'
          ),
          jetzt
        )
      );
    }
    const dateien: Datei[] = [];
    if (stand !== 'erwartet')
      dateien.push({
        id: 'lieferschein',
        name: T(`Lieferschein-${nr}.pdf`, `Delivery note-${nr}.pdf`),
        art: 'pdf',
        vorlage: 'lieferschein',
        am: verlauf[1]!.am,
        wer: 7,
      });
    if (stand === 'reklamiert')
      dateien.push({
        id: 'foto',
        name: `Foto-${nr}.svg`,
        art: 'bild',
        vorlage: 'foto',
        am: verlauf[verlauf.length - 1]!.am,
        wer: 7,
      });
    liste.push({
      id: 2000 + i,
      nr,
      stand,
      felder,
      dateien,
      verlauf,
      angelegt_am: verlauf[0]!.am,
      geaendert_am: verlauf[verlauf.length - 1]!.am,
    });
  }
  return liste.reverse();
}

// ── Wartungsplan ────────────────────────────────────────────────────────────

const WARTUNG_ARTEN: [string, Text, number][] = [
  ['wartung', T('Wartung nach Herstellerplan', 'Service to manufacturer schedule'), 6],
  ['inspektion', T('Sichtprüfung und Schmierung', 'Visual check and lubrication'), 1],
  ['uvv', T('UVV-Prüfung', 'Statutory safety inspection'), 12],
  ['kalibrierung', T('Kalibrierung', 'Calibration'), 12],
  ['wartung', T('Filter und Betriebsstoffe wechseln', 'Change filters and fluids'), 3],
];

function wartungsplan(jetzt: number): Eintrag[] {
  const r = zufall(7);
  const liste: Eintrag[] = [];
  for (let i = 0; i < 40; i += 1) {
    const maschine = MASCHINEN[i % MASCHINEN.length]!;
    const [art, was, intervall] = r.eins(WARTUNG_ARTEN);
    const abstand = werktag(-120 + i * 4 + r.ganz(0, 3), jetzt);
    let stand: string;
    if (abstand < -6) stand = 'erledigt';
    else if (abstand < 0) stand = r.eins(['erledigt', 'geplant', 'in_arbeit']);
    else if (abstand < 3) stand = r.eins(['geplant', 'in_arbeit']);
    else stand = 'geplant';
    const extern = art === 'uvv' ? (maschine.id.startsWith('HK') ? 14 : 12) : null;
    const nr = `WA-26-${String(150 + i).padStart(3, '0')}`;
    const felder: Record<string, Wert> = {
      maschine: maschine.id,
      art,
      aufgabe: was,
      faellig: tagRelativ(abstand, jetzt),
      intervall,
      zustaendig: 12,
      extern,
      dauer: r.ganz(1, 6),
      erledigt_am: stand === 'erledigt' ? tagRelativ(abstand + r.ganz(-1, 1), jetzt) : null,
      notiz: null,
    };
    const verlauf: Schritt[] = [
      schritt(
        (-abstand + 30) * 24,
        12,
        T('Aus dem Intervall eingeplant', 'Scheduled from the interval'),
        jetzt
      ),
    ];
    if (stand === 'in_arbeit')
      verlauf.push(
        schritt(
          Math.max(2, -abstand * 24),
          12,
          T('Begonnen, Maschine gesperrt', 'Started, machine locked out'),
          jetzt
        )
      );
    if (stand === 'erledigt') {
      verlauf.push(
        schritt(
          -abstand * 24,
          12,
          T('Erledigt, Protokoll angehängt', 'Done, report attached'),
          jetzt
        )
      );
      if (i % 5 === 0)
        felder.notiz = T(
          'Keilriemen nachgespannt, Ersatz zur nächsten Wartung bestellen.',
          'V-belt re-tensioned, order replacement for next service.'
        );
    }
    const dateien: Datei[] =
      stand === 'erledigt'
        ? [
            {
              id: 'protokoll',
              name: T(`Wartungsprotokoll-${nr}.pdf`, `Service report-${nr}.pdf`),
              art: 'pdf',
              vorlage: 'wartung',
              am: verlauf[verlauf.length - 1]!.am,
              wer: 12,
            },
          ]
        : [];
    liste.push({
      id: 3000 + i,
      nr,
      stand,
      felder,
      dateien,
      verlauf,
      angelegt_am: verlauf[0]!.am,
      geaendert_am: verlauf[verlauf.length - 1]!.am,
    });
  }
  // Zwei sind überfällig: geplant, Termin vorbei. Die Übersicht zeigt sie oben.
  for (const k of [28, 29]) {
    const e = liste[k]!;
    e.stand = 'geplant';
    e.felder.erledigt_am = null;
    e.felder.faellig = tagRelativ(werktag(-3 - (k - 28) * 4, jetzt), jetzt);
    e.dateien = [];
    e.verlauf = e.verlauf.slice(0, 1);
  }
  return liste.reverse();
}

// ── Prüfprotokolle ──────────────────────────────────────────────────────────

const BAUTEILE: Text[] = [
  T('Treppenwange links', 'Left stair stringer'),
  T('Treppenwange rechts', 'Right stair stringer'),
  T('Podest mit Gitterrost', 'Landing with grating'),
  T('Geländerfeld 2,4 m', 'Railing panel 2.4 m'),
  T('Pfosten mit Fußplatte', 'Post with base plate'),
  T('Rahmen RF-200', 'Frame RF-200'),
  T('Konsole Vordach', 'Canopy bracket'),
  T('Torflügel', 'Gate leaf'),
  T('Kantteil Verkleidung', 'Bent guard part'),
  T('Stütze HEA 160', 'Column HEA 160'),
];

const PRUEFARTEN: [string, Text][] = [
  ['sicht', T('Sichtprüfung Schweißnähte', 'Visual weld inspection')],
  ['mass', T('Maßprüfung nach Zeichnung', 'Dimensional check to drawing')],
  ['schicht', T('Schichtdicke Beschichtung', 'Coating thickness')],
  ['abnahme', T('Abnahme vor Ort', 'On-site acceptance')],
];

function pruefprotokolle(jetzt: number): Eintrag[] {
  const r = zufall(11);
  const liste: Eintrag[] = [];
  for (let i = 0; i < 41; i += 1) {
    const auftrag = AUFTRAEGE[i % AUFTRAEGE.length]!;
    const [pruefart, pruefartText] = r.eins(PRUEFARTEN);
    const abstand = werktag(-90 + Math.round(i * 2.2), jetzt);
    const ergebnis = r.z() < 0.12 ? 'nio' : r.z() < 0.12 ? 'auflage' : 'io';
    let stand: string;
    if (abstand > -2) stand = 'offen';
    else if (ergebnis === 'nio') stand = r.z() < 0.5 ? 'nacharbeit' : 'freigegeben';
    else stand = 'freigegeben';
    const pruefer = r.z() < 0.7 ? 11 : 8;
    const nr = `PP-26-${String(210 + i).padStart(3, '0')}`;
    const felder: Record<string, Wert> = {
      auftrag: auftrag.nr,
      bauteil: r.eins(BAUTEILE),
      pruefart,
      pruefer,
      datum: tagRelativ(abstand, jetzt),
      ergebnis: stand === 'offen' ? null : ergebnis,
      messwert:
        pruefart === 'schicht'
          ? r.ganz(78, 132)
          : pruefart === 'mass'
            ? Number((r.z() * 1.6).toFixed(1))
            : null,
      notiz:
        ergebnis === 'nio'
          ? T(
              'Naht 3 mit Einbrandkerbe, nachschweißen und erneut prüfen.',
              'Weld 3 shows undercut, re-weld and inspect again.'
            )
          : null,
    };
    const verlauf: Schritt[] = [
      schritt(
        (-abstand + 2) * 24,
        5,
        T(`Prüfung eingeplant: ${pruefartText.de}`, `Inspection planned: ${pruefartText.en}`),
        jetzt
      ),
    ];
    if (stand !== 'offen')
      verlauf.push(
        schritt(
          -abstand * 24 + 3,
          pruefer,
          T('Geprüft und Messwerte erfasst', 'Inspected and measurements recorded'),
          jetzt
        )
      );
    if (stand === 'freigabe')
      verlauf.push(
        schritt(
          -abstand * 24 + 2,
          pruefer,
          T('Zur Freigabe an Miriam Kerschner', 'Sent to Miriam Kerschner for approval'),
          jetzt
        )
      );
    if (stand === 'freigegeben')
      verlauf.push(schritt(-abstand * 24, ICH_ID, T('Freigegeben', 'Approved'), jetzt));
    if (stand === 'nacharbeit')
      verlauf.push(
        schritt(
          -abstand * 24,
          ICH_ID,
          T('Zur Nacharbeit zurück an die Schweißerei', 'Returned to the welding shop for rework'),
          jetzt
        )
      );
    const dateien: Datei[] = [];
    if (stand !== 'offen')
      dateien.push({
        id: 'protokoll',
        name: `${nr}.pdf`,
        art: 'pdf',
        vorlage: 'pruefung',
        am: verlauf[1]!.am,
        wer: pruefer,
      });
    if (i % 2 === 0)
      dateien.push({
        id: 'zeichnung',
        name: T(`Zeichnung-${auftrag.nr}.svg`, `Drawing-${auftrag.nr}.svg`),
        art: 'bild',
        vorlage: 'zeichnung',
        am: verlauf[0]!.am,
        wer: 5,
      });
    liste.push({
      id: 4000 + i,
      nr,
      stand,
      felder,
      dateien,
      verlauf,
      angelegt_am: verlauf[0]!.am,
      geaendert_am: verlauf[verlauf.length - 1]!.am,
    });
  }
  // Drei warten auf die Freigabe.
  for (const k of [38, 39, 40]) {
    const e = liste[k]!;
    if (e.stand === 'freigabe') continue;
    e.stand = 'freigabe';
    e.felder.ergebnis = 'io';
    e.verlauf = [
      e.verlauf[0]!,
      schritt(
        20 - (k - 38) * 6,
        11,
        T('Geprüft und Messwerte erfasst', 'Inspected and measurements recorded'),
        jetzt
      ),
      schritt(
        19 - (k - 38) * 6,
        11,
        T('Zur Freigabe an Miriam Kerschner', 'Sent to Miriam Kerschner for approval'),
        jetzt
      ),
    ];
    if (!e.dateien.some(d => d.id === 'protokoll')) {
      e.dateien.unshift({
        id: 'protokoll',
        name: `${e.nr}.pdf`,
        art: 'pdf',
        vorlage: 'pruefung',
        am: e.verlauf[1]!.am,
        wer: 11,
      });
    }
    e.geaendert_am = e.verlauf[2]!.am;
  }
  return liste.reverse();
}

// ── Urlaubsanträge ──────────────────────────────────────────────────────────

const URLAUB_ARTEN = ['urlaub', 'urlaub', 'urlaub', 'gleitzeit', 'sonder'] as const;

function urlaub(jetzt: number): Eintrag[] {
  const r = zufall(5);
  const liste: Eintrag[] = [];
  const leute = PERSONEN.filter(p => p.id !== ICH_ID);
  for (let i = 0; i < 40; i += 1) {
    const p = leute[(i * 7) % leute.length]!;
    const art = r.eins(URLAUB_ARTEN);
    const beginn =
      i >= 38 ? werktag(9 + (i - 38) * 13, jetzt) : werktag(-80 + i * 4 + r.ganz(0, 3), jetzt);
    const tage = art === 'urlaub' ? r.ganz(2, 10) : art === 'gleitzeit' ? 1 : r.ganz(1, 2);
    const kalender = tage + Math.floor((tage - 1) / 5) * 2;
    const vertretung =
      PERSONEN.find(x => x.abteilung === p.abteilung && x.id !== p.id && x.id !== ICH_ID)?.id ?? 5;
    // Beantragt wird immer vor dem Besuch; offen sind nur die zwei jüngsten.
    const antrag = Math.min(beginn - r.ganz(10, 30), -1 - (i % 4));
    let stand: string;
    if (i >= 38) stand = 'beantragt';
    else stand = r.z() < 0.92 ? 'genehmigt' : 'abgelehnt';
    const nr = `UA-26-${String(80 + i).padStart(3, '0')}`;
    const felder: Record<string, Wert> = {
      person: p.id,
      art,
      von: tagRelativ(beginn, jetzt),
      bis: tagRelativ(beginn + kalender - 1, jetzt),
      tage,
      vertretung,
      notiz:
        stand === 'abgelehnt'
          ? T(
              'In der Woche ist Montage Schulzentrum, bitte eine Woche später.',
              'Installation at the school centre that week, please one week later.'
            )
          : null,
    };
    const verlauf: Schritt[] = [schritt(-antrag * 24, p.id, T('Beantragt', 'Requested'), jetzt)];
    if (stand === 'genehmigt')
      verlauf.push(schritt((-antrag - 1) * 24, ICH_ID, T('Genehmigt', 'Approved'), jetzt));
    if (stand === 'abgelehnt')
      verlauf.push(
        schritt(
          (-antrag - 1) * 24,
          ICH_ID,
          T('Abgelehnt, Grund im Antrag', 'Declined, reason in the request'),
          jetzt
        )
      );
    const dateien: Datei[] =
      stand === 'genehmigt'
        ? [
            {
              id: 'antrag',
              name: T(`Urlaubsantrag-${nr}.pdf`, `Leave request-${nr}.pdf`),
              art: 'pdf',
              vorlage: 'antrag',
              am: verlauf[1]!.am,
              wer: ICH_ID,
            },
          ]
        : [];
    liste.push({
      id: 5000 + i,
      nr,
      stand,
      felder,
      dateien,
      verlauf,
      angelegt_am: verlauf[0]!.am,
      geaendert_am: verlauf[verlauf.length - 1]!.am,
    });
  }
  // Zwei sind heute im Urlaub, damit die Startseite zeigt, wer fehlt.
  for (const [k, von, tage] of [
    [20, -2, 5],
    [21, -1, 3],
  ] as const) {
    const e = liste[k]!;
    e.stand = 'genehmigt';
    e.felder.art = 'urlaub';
    e.felder.von = tagRelativ(von, jetzt);
    e.felder.bis = tagRelativ(von + tage + 1, jetzt);
    e.felder.tage = tage;
    e.felder.notiz = null;
    e.verlauf = [
      e.verlauf[0]!,
      schritt(24 * (5 + k - 20), ICH_ID, T('Genehmigt', 'Approved'), jetzt),
    ];
    if (!e.dateien.length) {
      e.dateien = [
        {
          id: 'antrag',
          name: T(`Urlaubsantrag-${e.nr}.pdf`, `Leave request-${e.nr}.pdf`),
          art: 'pdf',
          vorlage: 'antrag',
          am: e.verlauf[1]!.am,
          wer: ICH_ID,
        },
      ];
    }
  }
  return liste.reverse();
}

export function anfangsBestand(jetzt = Date.now()): Bestand {
  return {
    angebote: angebote(jetzt),
    wareneingang: wareneingang(jetzt),
    wartungsplan: wartungsplan(jetzt),
    pruefprotokolle: pruefprotokolle(jetzt),
    urlaub: urlaub(jetzt),
  };
}

/** Ein Text der Daten in der Sprache des Besuchers. */
export function txt(w: Wert | undefined, sprache: 'de' | 'en'): string {
  if (w === null || w === undefined) return '';
  if (typeof w === 'object') return w[sprache];
  return String(w);
}

/** Die Stände je App, in der Reihenfolge des Ablaufs, mit Namen. */
export const STAENDE: Record<AppKennung, [string, Text][]> = {
  angebote: [
    ['entwurf', T('Entwurf', 'Draft')],
    ['freigabe', T('Zur Freigabe', 'For approval')],
    ['freigegeben', T('Freigegeben', 'Approved')],
    ['versendet', T('Versendet', 'Sent')],
    ['angenommen', T('Angenommen', 'Accepted')],
    ['abgelehnt', T('Abgelehnt', 'Declined')],
  ],
  wareneingang: [
    ['erwartet', T('Erwartet', 'Expected')],
    ['eingegangen', T('Eingegangen', 'Received')],
    ['geprueft', T('Geprüft', 'Checked')],
    ['eingelagert', T('Eingelagert', 'Stored')],
    ['reklamiert', T('Reklamiert', 'Complaint')],
  ],
  wartungsplan: [
    ['geplant', T('Geplant', 'Planned')],
    ['in_arbeit', T('In Arbeit', 'In progress')],
    ['erledigt', T('Erledigt', 'Done')],
  ],
  pruefprotokolle: [
    ['offen', T('Offen', 'Open')],
    ['freigabe', T('Zur Freigabe', 'For approval')],
    ['freigegeben', T('Freigegeben', 'Approved')],
    ['nacharbeit', T('Nacharbeit', 'Rework')],
  ],
  urlaub: [
    ['beantragt', T('Beantragt', 'Requested')],
    ['genehmigt', T('Genehmigt', 'Approved')],
    ['abgelehnt', T('Abgelehnt', 'Declined')],
  ],
};

export function standText(app: AppKennung, stand: string): Text {
  return STAENDE[app].find(([k]) => k === stand)?.[1] ?? T(stand, stand);
}

/** Was eine Entscheidung über eine Freigabe aus dem Stand macht. */
export const NACH_FREIGABE: Partial<Record<AppKennung, { ja: string; nein: string }>> = {
  angebote: { ja: 'freigegeben', nein: 'entwurf' },
  pruefprotokolle: { ja: 'freigegeben', nein: 'nacharbeit' },
  urlaub: { ja: 'genehmigt', nein: 'abgelehnt' },
};
