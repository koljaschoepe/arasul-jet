/**
 * YAML-Frontmatter aus Markdown trennen und wieder zusammenfügen (Plan 016).
 *
 * Warum: Der WYSIWYG-Editor (tiptap-markdown) kennt kein Frontmatter. Fütterte
 * man ihm eine Datei mit `---\nkey: wert\n---`, würde er die drei Striche als
 * Trennlinien und die Zeilen dazwischen als Fließtext interpretieren — das
 * korrumpiert agent-geschriebene Dateien (Ein-Ordner-Modell: die Platte ist die
 * Wahrheit). Deshalb schneiden wir einen etwaigen Frontmatter-Block VOR dem
 * Editor ab, halten ihn wörtlich fest und hängen ihn beim Speichern unverändert
 * wieder an.
 */
export interface SplitMarkdown {
  /** Der wörtliche Frontmatter-Block inkl. abschließendem Zeilenumbruch (oder ''). */
  frontmatter: string;
  /** Der Rest der Datei (der eigentliche Markdown-Text). */
  body: string;
}

// Frontmatter nur ganz am Dateianfang: eine `---`-Zeile, beliebiger Inhalt,
// dann eine schließende `---`- (oder `...`-)Zeile. Non-greedy, damit spätere
// Trennlinien im Text nicht fälschlich als Ende gelten.
const FRONTMATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/** Trennt einen etwaigen Frontmatter-Block vom Rest. Kein Block → alles ist body. */
export function splitFrontmatter(md: string): SplitMarkdown {
  const match = FRONTMATTER_RE.exec(md);
  if (!match) return { frontmatter: '', body: md };
  return { frontmatter: match[0], body: md.slice(match[0].length) };
}

/** Fügt Frontmatter (falls vorhanden) wörtlich vor den Body. */
export function joinFrontmatter(frontmatter: string, body: string): string {
  return frontmatter ? frontmatter + body : body;
}
