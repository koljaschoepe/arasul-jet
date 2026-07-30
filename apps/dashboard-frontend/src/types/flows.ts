/**
 * Flow-Typen fürs Frontend (Plan 011, Schritt 13).
 *
 * Ein Flow ist serverseitig eine Markdown-Datei unter `data/flows/`. Nach
 * außen (API `/api/flows`) heißt `systemPrompt` schlicht `prompt`. Hier stehen
 * nur die Felder, die die Chat-Oberfläche braucht — das Slash-Menü zeigt Name,
 * Beschreibung und die Argumente; die grauen Argument-Hinweise (Schritt 14)
 * lesen `typ`/`pflicht`/`optionen`.
 */

/** Argument-Typen, die ein Flow deklarieren kann. Spiegelt `ARG_TYPES` im Backend. */
export type FlowArgumentType = 'freitext' | 'datei' | 'auswahl' | 'wissensbasis';

export interface FlowArgument {
  name: string;
  typ: FlowArgumentType;
  beschreibung: string;
  pflicht: boolean;
  /** Nur bei `typ: 'auswahl'` gesetzt — die erlaubten Werte. */
  optionen?: string[];
  /** Vorbelegung, falls das Argument leer bleibt. */
  standard?: string;
}

/** Ein Flow, wie ihn `GET /api/flows` liefert (nur die im Chat genutzten Felder). */
export interface Flow {
  name: string;
  beschreibung: string;
  argumente: FlowArgument[];
}

/** Werkzeugnamen, die ein Flow deklarieren darf. Spiegelt `VALID_TOOLS` im Backend. */
export type FlowTool =
  | 'dateien_lesen'
  | 'dateien_schreiben'
  | 'dateien_bearbeiten'
  | 'dateien_anhaengen'
  | 'dateien_suchen'
  | 'rag_suche'
  | 'web_suche'
  | 'web_lesen'
  | 'terminal'
  | 'subagent';

/** Der Ergebnis-Vertrag einer Subagent-Rolle (§3 Kontext-Sparsamkeit). */
export interface FlowRoleResult {
  felder: string[];
  max_zeichen: number;
}

/** Eine Subagent-Rolle eines Flows. */
export interface FlowRole {
  name: string;
  beschreibung?: string;
  modell?: string;
  werkzeuge: FlowTool[];
  ergebnis: FlowRoleResult;
  prompt: string;
}

/** Art eines deklarativen Schritts (B7). */
export type FlowStepType = 'subagent' | 'werkzeug';

/**
 * Ein deterministischer Schritt der Orchestrierungs-Kette (B7). `subagent`
 * delegiert an eine deklarierte Rolle mit einem `auftrag` (Vorlage), `werkzeug`
 * ruft ein Werkzeug direkt mit `parameter` auf. `iterationen` wiederholt den
 * Schritt bis zu N-mal und reicht die vorige Ausgabe als {{vorher}} weiter.
 *
 * `wiederhole_ueber` (Harness v2) macht den Schritt zur Schleife über eine
 * Liste (Argument oder Ausgabe eines früheren Schritts; {{element}}, {{index}},
 * {{anzahl}} im Scope) — schließt `iterationen` > 1 aus. `modell` überschreibt
 * das Flow-Modell nur für diesen (Subagent-)Schritt.
 */
export interface FlowStep {
  name: string;
  typ: FlowStepType;
  rolle?: string;
  auftrag?: string;
  werkzeug?: FlowTool;
  parameter?: Record<string, string | number | boolean>;
  iterationen: number;
  wiederhole_ueber?: string;
  modell?: string;
}

/** Die Notbremsen eines Flows (§7). */
export interface FlowLimits {
  max_aufrufe: number;
  zeitlimit_s: number;
  werkzeug_runden: number;
  /** Maximale Verschachtelungstiefe der Subagent-Rollen (Orchestrator = 0). */
  max_tiefe: number;
}

/**
 * Die vollständige Flow-Definition, wie sie der Anlege-/Bearbeiten-Dialog
 * (Schritt 17) bearbeitet und `GET /api/flows/:name` liefert. Nach außen heißt
 * `systemPrompt` schlicht `prompt`.
 */
export interface FlowDefinition {
  name: string;
  beschreibung: string;
  modell?: string;
  argumente: FlowArgument[];
  ordner: string[];
  werkzeuge: FlowTool[];
  rollen: FlowRole[];
  /** Optionale deterministische Schritt-Kette (B7). Leer → modellgetrieben. */
  schritte: FlowStep[];
  grenzen: FlowLimits;
  prompt: string;
}

/** Ein Werkzeug-Eintrag aus `GET /api/flows/werkzeuge`. */
export interface FlowToolInfo {
  name: FlowTool;
  verfuegbar: boolean;
}

/** Status eines Flow-Laufs (spiegelt `flow_run_status` im Backend). */
export type FlowRunStatus = 'laeuft' | 'fertig' | 'fehler' | 'abgebrochen';

/** Eine Lauf-Zeile aus `GET /api/flows/laeufe` (ohne Schritte, für Übersichten). */
export interface FlowRunSummary {
  id: number | string;
  flow_name: string;
  conversation_id: number | string | null;
  status: FlowRunStatus;
  steps_used: number;
  created_at: string;
  finished_at: string | null;
}
