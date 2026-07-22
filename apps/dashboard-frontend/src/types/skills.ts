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
