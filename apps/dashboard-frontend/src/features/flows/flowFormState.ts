/**
 * Reiner Formular-Zustand des Flow-Dialogs (Plan 011, Schritt 17).
 *
 * Der Dialog sammelt die Felder eines Flows; die erzeugte Markdown-Datei und
 * ihre Prüfung liefert das Backend (`POST /api/flows/vorschau` bzw. beim
 * Speichern). Dieses Modul hält deshalb nur den Zustand und rechnet ihn in den
 * API-Body um — bewusst ohne React, damit die knifflige Umwandlung (leere Zeilen
 * verwerfen, „auswahl"-Optionen aus Text, Grenzen als Zahlen) direkt testbar ist.
 */
import type {
  FlowArgument,
  FlowArgumentType,
  FlowAusgabe,
  FlowDefinition,
  FlowLimits,
  FlowRole,
  FlowStep,
  FlowTool,
} from '@/types/flows';

export interface FlowFormState {
  name: string;
  beschreibung: string;
  prompt: string;
  argumente: FlowArgument[];
  werkzeuge: FlowTool[];
  ordner: string[];
  rollen: FlowRole[];
  schritte: FlowStep[];
  grenzen: FlowLimits;
  /**
   * Betriebsart (Plan 023 I2). `autonom` ist die Voreinstellung: der Flow fragt
   * nie, er trifft die Annahme und schreibt sie mit.
   */
  betriebsart: 'autonom' | 'rueckfragen';
  /** Die Ausgabe-Sektion (Flows-Umbau 2026-08-02) — immer gesetzt, `format:
   *  'keins'` heißt „nur Text-Antwort, keine Datei". */
  ausgabe: FlowAusgabe;
  /** Eigenes Modell je Flow — leer = Standardmodell (seit dem Umbau im
   *  Erweitert-Bereich sichtbar, vorher nur per Datei editierbar). */
  modell: string;
}

/** Voreinstellung der Grenzen — deckungsgleich mit dem Backend-Schema (FlowLimits). */
export const STANDARD_GRENZEN: FlowLimits = {
  max_aufrufe: 20,
  zeitlimit_s: 900,
  werkzeug_runden: 10,
  max_tiefe: 2,
};

/** Voreinstellung der Ausgabe: keine Datei, mittlere Länge. */
export const STANDARD_AUSGABE: FlowAusgabe = { format: 'keins' };

export const LEER_FORM: FlowFormState = {
  name: '',
  beschreibung: '',
  prompt: '',
  argumente: [],
  werkzeuge: [],
  ordner: [],
  rollen: [],
  schritte: [],
  grenzen: { ...STANDARD_GRENZEN },
  betriebsart: 'autonom',
  ausgabe: { ...STANDARD_AUSGABE },
  modell: '',
};

/** Ein frisches, leeres Argument (für „Zeile hinzufügen"). */
export function leeresArgument(): FlowArgument {
  return { name: '', typ: 'freitext', beschreibung: '', pflicht: false };
}

/** Eine frische, leere Rolle. */
export function leereRolle(): FlowRole {
  return {
    name: '',
    beschreibung: '',
    werkzeuge: [],
    ergebnis: { felder: [], max_zeichen: 2000 },
    prompt: '',
  };
}

/** Ein frischer, leerer Schritt (Voreinstellung: subagent, 1 Durchlauf). */
export function leererSchritt(): FlowStep {
  return { name: '', typ: 'subagent', rolle: '', auftrag: '', iterationen: 1 };
}

/** Werkzeuge, die einen erlaubten Ordner voraussetzen (spiegelt `needsFolder` im Backend). */
export const ORDNER_WERKZEUGE: FlowTool[] = [
  'dateien_lesen',
  'dateien_schreiben',
  'dateien_bearbeiten',
  'dateien_anhaengen',
  'dateien_suchen',
  'symbol_suche',
  'terminal',
];

/** Baut eine Flow-Definition (FlowDefinition) in den Formular-Zustand um (Bearbeiten). */
export function fromDefinition(def: FlowDefinition): FlowFormState {
  return {
    name: def.name,
    beschreibung: def.beschreibung ?? '',
    prompt: def.prompt ?? '',
    argumente: (def.argumente ?? []).map(a => ({ ...a })),
    werkzeuge: [...(def.werkzeuge ?? [])],
    ordner: [...(def.ordner ?? [])],
    rollen: (def.rollen ?? []).map(r => ({
      ...r,
      ergebnis: {
        felder: [...(r.ergebnis?.felder ?? [])],
        max_zeichen: r.ergebnis?.max_zeichen ?? 2000,
      },
      werkzeuge: [...(r.werkzeuge ?? [])],
    })),
    schritte: (def.schritte ?? []).map(s => ({
      ...s,
      iterationen: s.iterationen ?? 1,
      parameter: s.parameter ? { ...s.parameter } : undefined,
    })),
    grenzen: { ...STANDARD_GRENZEN, ...(def.grenzen ?? {}) },
    betriebsart: def.betriebsart ?? 'autonom',
    ausgabe: def.ausgabe
      ? {
          ...def.ausgabe,
          laenge: def.ausgabe.laenge ? { ...def.ausgabe.laenge } : undefined,
          gliederung: def.ausgabe.gliederung ? [...def.ausgabe.gliederung] : undefined,
        }
      : { ...STANDARD_AUSGABE },
    modell: def.modell ?? '',
  };
}

/** Ein Argument in die API-Form bringen; verwirft leere Zusatzfelder. */
function argToBody(a: FlowArgument): FlowArgument {
  const out: FlowArgument = {
    name: a.name.trim(),
    typ: a.typ,
    beschreibung: (a.beschreibung ?? '').trim(),
    pflicht: Boolean(a.pflicht),
  };
  if (a.typ === 'auswahl' && a.optionen && a.optionen.length > 0) {
    out.optionen = a.optionen.map(o => o.trim()).filter(Boolean);
  }
  // Ein Pflichtargument mit Standard ist im Backend ein Widerspruch — nur den
  // Standard eines optionalen Arguments mitschicken.
  const std = (a.standard ?? '').trim();
  if (!out.pflicht && std) out.standard = std;
  return out;
}

/** Eine Rolle in die API-Form bringen. */
function roleToBody(r: FlowRole) {
  const out: Record<string, unknown> = {
    name: r.name.trim(),
    beschreibung: (r.beschreibung ?? '').trim(),
    werkzeuge: [...r.werkzeuge],
    ergebnis: {
      felder: (r.ergebnis?.felder ?? []).map(f => f.trim()).filter(Boolean),
      max_zeichen: r.ergebnis?.max_zeichen ?? 2000,
    },
    prompt: (r.prompt ?? '').trim(),
  };
  const modell = (r.modell ?? '').trim();
  if (modell) out.modell = modell;
  return out;
}

/** Einen Schritt in die API-Form bringen; verwirft die für den Typ irrelevanten Felder. */
function stepToBody(s: FlowStep): Record<string, unknown> {
  const wiederholeUeber = (s.wiederhole_ueber ?? '').trim();
  const out: Record<string, unknown> = {
    name: s.name.trim(),
    typ: s.typ,
    // Backend lehnt wiederhole_ueber + iterationen > 1 zusammen ab — mit
    // gesetzter Liste ist der Zähler bedeutungslos und wird auf 1 gezwungen.
    iterationen: wiederholeUeber ? 1 : (s.iterationen ?? 1),
  };
  if (wiederholeUeber) out.wiederhole_ueber = wiederholeUeber;
  if (s.typ === 'subagent') {
    out.rolle = (s.rolle ?? '').trim();
    out.auftrag = (s.auftrag ?? '').trim();
    // Schritt-eigenes Modell (optional) — nur senden, wenn gesetzt.
    const modell = (s.modell ?? '').trim();
    if (modell) out.modell = modell;
  } else {
    if (s.werkzeug) out.werkzeug = s.werkzeug;
    // Leere Parameterwerte fallen weg, damit eine halb ausgefüllte Zeile nicht die Prüfung sprengt.
    const params = Object.fromEntries(
      Object.entries(s.parameter ?? {}).filter(([k, v]) => k.trim() && v !== '')
    );
    if (Object.keys(params).length > 0) out.parameter = params;
  }
  return out;
}

/** Die Ausgabe in die API-Form bringen; leere Zusatzfelder fallen weg. */
function ausgabeToBody(a: FlowAusgabe): Record<string, unknown> {
  const out: Record<string, unknown> = { format: a.format };
  const dateiname = (a.dateiname ?? '').trim();
  if (dateiname) out.dateiname = dateiname;
  const vorlage = (a.vorlage ?? '').trim();
  if (vorlage) out.vorlage = vorlage;
  if (a.laenge) {
    out.laenge = {
      stufe: a.laenge.stufe,
      ...(a.laenge.wortzahl ? { wortzahl: a.laenge.wortzahl } : {}),
    };
  }
  const sprache = (a.sprache ?? '').trim();
  if (sprache) out.sprache = sprache;
  if (a.tonalitaet) out.tonalitaet = a.tonalitaet;
  const gliederung = (a.gliederung ?? []).map(g => g.trim()).filter(Boolean);
  if (gliederung.length > 0) out.gliederung = gliederung;
  return out;
}

/**
 * Rechnet den Formular-Zustand in den API-Body (CreateFlowBody/SaveFlowBody).
 * Leere Zeilen (Ordner, Argumente ohne Namen, Rollen ohne Namen, Schritte ohne
 * Namen) fallen weg — so sprengt eine noch nicht ausgefüllte Zusatzzeile nicht
 * die Prüfung.
 */
export function toBody(state: FlowFormState): Record<string, unknown> {
  return {
    name: state.name.trim(),
    beschreibung: state.beschreibung.trim(),
    prompt: state.prompt,
    argumente: state.argumente.filter(a => a.name.trim()).map(argToBody),
    werkzeuge: [...state.werkzeuge],
    ordner: state.ordner.map(o => o.trim()).filter(Boolean),
    rollen: state.rollen.filter(r => r.name.trim()).map(roleToBody),
    schritte: state.schritte.filter(s => s.name.trim()).map(stepToBody),
    grenzen: {
      max_aufrufe: state.grenzen.max_aufrufe,
      zeitlimit_s: state.grenzen.zeitlimit_s,
      werkzeug_runden: state.grenzen.werkzeug_runden,
      max_tiefe: state.grenzen.max_tiefe,
    },
    betriebsart: state.betriebsart,
    ausgabe: ausgabeToBody(state.ausgabe),
    // Leeres Modell wird MITGESCHICKT: der zusammenführende PUT übernimmt es
    // und der Serializer lässt '' weg — so lässt sich ein gesetztes Modell
    // über das Formular auch wieder entfernen.
    modell: state.modell.trim(),
  };
}

/** Braucht der aktuelle Zustand einen Ordner (Datei-/Terminal-Werkzeug gewählt)? */
export function brauchtOrdner(werkzeuge: FlowTool[]): boolean {
  return werkzeuge.some(w => ORDNER_WERKZEUGE.includes(w));
}

export type { FlowArgumentType };
