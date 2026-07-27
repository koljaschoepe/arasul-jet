/**
 * Sprach-Zuordnung für den CodeMirror-Editor (Plan 013, B10).
 *
 * Bildet eine Dateiendung auf die passende CodeMirror-Sprach-Erweiterung ab. Nur
 * die tatsächlich installierten Sprachpakete werden geladen; alles andere fällt
 * auf „einfacher Text" (kein Highlighting, aber editierbar).
 */
import type { Extension } from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';

/** Endungen (mit führendem Punkt), die der Code-Editor öffnet — Spiegel des
 * Backend-Whitelists in `routes/documents.js` (CODE_EXTENSIONS). */
export const CODE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.json',
  '.css',
  '.scss',
  '.less',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.java',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.cs',
  '.kt',
  '.swift',
  '.toml',
  '.ini',
  '.conf',
  '.env',
  '.xml',
  '.csv',
  '.log',
  '.dockerfile',
  '.gitignore',
]);

/** Menschliches Sprachlabel für die Kopfzeile. */
export function spracheLabel(ext: string): string {
  const e = ext.toLowerCase();
  if (['.ts', '.tsx'].includes(e)) return 'TypeScript';
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(e)) return 'JavaScript';
  if (e === '.py') return 'Python';
  if (['.html', '.htm'].includes(e)) return 'HTML';
  if (['.css', '.scss', '.less'].includes(e)) return 'CSS';
  if (e === '.json') return 'JSON';
  if (['.md', '.markdown'].includes(e)) return 'Markdown';
  if (['.sh', '.bash', '.zsh'].includes(e)) return 'Shell';
  if (e === '.sql') return 'SQL';
  if (['.yaml', '.yml'].includes(e)) return 'YAML';
  return e.replace('.', '').toUpperCase() || 'Text';
}

/**
 * CodeMirror-Sprach-Erweiterung(en) für eine Endung. Leeres Array = kein
 * Highlighting (unbekannte, aber textbasierte Endung).
 */
export function spracheFuer(ext: string): Extension[] {
  const e = ext.toLowerCase();
  if (['.ts', '.tsx'].includes(e)) return [javascript({ jsx: e === '.tsx', typescript: true })];
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(e)) return [javascript({ jsx: e === '.jsx' })];
  if (e === '.py') return [python()];
  if (['.html', '.htm', '.xml'].includes(e)) return [html()];
  if (['.css', '.scss', '.less'].includes(e)) return [css()];
  if (e === '.json') return [json()];
  if (['.md', '.markdown'].includes(e)) return [markdown()];
  return [];
}
