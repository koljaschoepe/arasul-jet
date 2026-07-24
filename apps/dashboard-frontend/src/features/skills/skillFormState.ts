/**
 * Reiner Formular-Zustand des Skill-Dialogs (Plan 011, Schritt 17).
 *
 * Der Dialog sammelt die Felder eines Skills; die erzeugte Markdown-Datei und
 * ihre Prüfung liefert das Backend (`POST /api/skills/vorschau` bzw. beim
 * Speichern). Dieses Modul hält deshalb nur den Zustand und rechnet ihn in den
 * API-Body um — bewusst ohne React, damit die knifflige Umwandlung (leere Zeilen
 * verwerfen, „auswahl"-Optionen aus Text, Grenzen als Zahlen) direkt testbar ist.
 */
import type {
  SkillArgument,
  SkillArgumentType,
  SkillDefinition,
  SkillLimits,
  SkillRole,
  SkillTool,
} from '@/types/skills';

export interface SkillFormState {
  name: string;
  beschreibung: string;
  prompt: string;
  argumente: SkillArgument[];
  werkzeuge: SkillTool[];
  ordner: string[];
  rollen: SkillRole[];
  grenzen: SkillLimits;
  // Hinweis: `SkillDefinition.modell` (eigenes Modell je Skill) ist in Schritt 17
  // BEWUSST nicht im Formular — der Dialog fasst es nicht an. Beim Bearbeiten
  // bleibt ein gesetztes Modell erhalten, weil PUT zusammenführt (fehlende
  // Felder unverändert). Ein späterer Schritt kann das Feld ergänzen.
}

/** Voreinstellung der Grenzen — deckungsgleich mit dem Backend-Schema (SkillLimits). */
export const STANDARD_GRENZEN: SkillLimits = {
  max_aufrufe: 20,
  zeitlimit_s: 900,
  werkzeug_runden: 10,
  max_tiefe: 2,
};

export const LEER_FORM: SkillFormState = {
  name: '',
  beschreibung: '',
  prompt: '',
  argumente: [],
  werkzeuge: [],
  ordner: [],
  rollen: [],
  grenzen: { ...STANDARD_GRENZEN },
};

/** Ein frisches, leeres Argument (für „Zeile hinzufügen"). */
export function leeresArgument(): SkillArgument {
  return { name: '', typ: 'freitext', beschreibung: '', pflicht: false };
}

/** Eine frische, leere Rolle. */
export function leereRolle(): SkillRole {
  return {
    name: '',
    beschreibung: '',
    werkzeuge: [],
    ergebnis: { felder: [], max_zeichen: 2000 },
    prompt: '',
  };
}

/** Werkzeuge, die einen erlaubten Ordner voraussetzen. */
export const ORDNER_WERKZEUGE: SkillTool[] = [
  'dateien_lesen',
  'dateien_schreiben',
  'dateien_suchen',
  'terminal',
];

/** Baut eine Skill-Definition (SkillDefinition) in den Formular-Zustand um (Bearbeiten). */
export function fromDefinition(def: SkillDefinition): SkillFormState {
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
    grenzen: { ...STANDARD_GRENZEN, ...(def.grenzen ?? {}) },
  };
}

/** Ein Argument in die API-Form bringen; verwirft leere Zusatzfelder. */
function argToBody(a: SkillArgument): SkillArgument {
  const out: SkillArgument = {
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
function roleToBody(r: SkillRole) {
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

/**
 * Rechnet den Formular-Zustand in den API-Body (CreateSkillBody/SaveSkillBody).
 * Leere Zeilen (Ordner, Argumente ohne Namen, Rollen ohne Namen) fallen weg —
 * so sprengt eine noch nicht ausgefüllte Zusatzzeile nicht die Prüfung.
 */
export function toBody(state: SkillFormState): Record<string, unknown> {
  return {
    name: state.name.trim(),
    beschreibung: state.beschreibung.trim(),
    prompt: state.prompt,
    argumente: state.argumente.filter(a => a.name.trim()).map(argToBody),
    werkzeuge: [...state.werkzeuge],
    ordner: state.ordner.map(o => o.trim()).filter(Boolean),
    rollen: state.rollen.filter(r => r.name.trim()).map(roleToBody),
    grenzen: {
      max_aufrufe: state.grenzen.max_aufrufe,
      zeitlimit_s: state.grenzen.zeitlimit_s,
      werkzeug_runden: state.grenzen.werkzeug_runden,
      max_tiefe: state.grenzen.max_tiefe,
    },
  };
}

/** Braucht der aktuelle Zustand einen Ordner (Datei-/Terminal-Werkzeug gewählt)? */
export function brauchtOrdner(werkzeuge: SkillTool[]): boolean {
  return werkzeuge.some(w => ORDNER_WERKZEUGE.includes(w));
}

export type { SkillArgumentType };
