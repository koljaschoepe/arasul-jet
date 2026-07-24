/**
 * Skill-Typen fürs Frontend (Plan 011, Schritt 13).
 *
 * Ein Skill ist serverseitig eine Markdown-Datei unter `data/skills/`. Nach
 * außen (API `/api/skills`) heißt `systemPrompt` schlicht `prompt`. Hier stehen
 * nur die Felder, die die Chat-Oberfläche braucht — das Slash-Menü zeigt Name,
 * Beschreibung und die Argumente; die grauen Argument-Hinweise (Schritt 14)
 * lesen `typ`/`pflicht`/`optionen`.
 */

/** Argument-Typen, die ein Skill deklarieren kann. Spiegelt `ARG_TYPES` im Backend. */
export type SkillArgumentType = 'freitext' | 'datei' | 'auswahl' | 'wissensbasis';

export interface SkillArgument {
  name: string;
  typ: SkillArgumentType;
  beschreibung: string;
  pflicht: boolean;
  /** Nur bei `typ: 'auswahl'` gesetzt — die erlaubten Werte. */
  optionen?: string[];
  /** Vorbelegung, falls das Argument leer bleibt. */
  standard?: string;
}

/** Ein Skill, wie ihn `GET /api/skills` liefert (nur die im Chat genutzten Felder). */
export interface Skill {
  name: string;
  beschreibung: string;
  argumente: SkillArgument[];
}

/** Werkzeugnamen, die ein Skill deklarieren darf. Spiegelt `VALID_TOOLS` im Backend. */
export type SkillTool =
  | 'dateien_lesen'
  | 'dateien_schreiben'
  | 'dateien_suchen'
  | 'rag_suche'
  | 'web_suche'
  | 'web_lesen'
  | 'terminal'
  | 'subagent';

/** Der Ergebnis-Vertrag einer Subagent-Rolle (§3 Kontext-Sparsamkeit). */
export interface SkillRoleResult {
  felder: string[];
  max_zeichen: number;
}

/** Eine Subagent-Rolle eines Skills. */
export interface SkillRole {
  name: string;
  beschreibung?: string;
  modell?: string;
  werkzeuge: SkillTool[];
  ergebnis: SkillRoleResult;
  prompt: string;
}

/** Die Notbremsen eines Skills (§7). */
export interface SkillLimits {
  max_aufrufe: number;
  zeitlimit_s: number;
  werkzeug_runden: number;
  /** Maximale Verschachtelungstiefe der Subagent-Rollen (Orchestrator = 0). */
  max_tiefe: number;
}

/**
 * Die vollständige Skill-Definition, wie sie der Anlege-/Bearbeiten-Dialog
 * (Schritt 17) bearbeitet und `GET /api/skills/:name` liefert. Nach außen heißt
 * `systemPrompt` schlicht `prompt`.
 */
export interface SkillDefinition {
  name: string;
  beschreibung: string;
  modell?: string;
  argumente: SkillArgument[];
  ordner: string[];
  werkzeuge: SkillTool[];
  rollen: SkillRole[];
  grenzen: SkillLimits;
  prompt: string;
}

/** Ein Werkzeug-Eintrag aus `GET /api/skills/werkzeuge`. */
export interface SkillToolInfo {
  name: SkillTool;
  verfuegbar: boolean;
}
