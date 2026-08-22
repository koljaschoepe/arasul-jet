/**
 * Flow-Werkzeug `symbol_suche` (Plan 021, Schritt 5 — agentic RAG).
 *
 * Findet die DEFINITIONSstelle eines Symbols (Funktion, Klasse, Methode,
 * Konstante, `def`) über die erlaubten Ordner — genau das, was eine reine
 * Text-Suche (`dateien_suchen`) verfehlt: Wer nach `berechneSumme` grept,
 * ertrinkt in Aufrufstellen; `symbol_suche` liefert die eine Zeile, an der es
 * DEKLARIERT wird. Das ist der Symbolindex-Anteil des agentischen Navigierens.
 *
 * Kein externer Indexer (ctags/tree-sitter): der würde — wie ein Roh-ripgrep —
 * ohne die Symlink-/TOCTOU-Absicherung aus dem erlaubten Ordner heraus lesen
 * können (§8-Linie aus Schritt 4). Stattdessen dieselbe symlink-sichere
 * Traversierung wie `dateien_suchen`: Symlinks werden nie verfolgt, jede Datei
 * wird über `O_NOFOLLOW` + `assertFdWithinRoots` geöffnet, alles ist gedeckelt.
 * Die Extraktion ist bewusst leichtgewichtig (zeilenweise Muster je Sprache) —
 * kein voller Parser, aber zuverlässig für JS/TS und Python plus ein
 * generischer Fallback. Grenzen der Heuristik (bewusst): ein Klassenfeld mit
 * Pfeilfunktion OHNE const/let/var (`foo = (x) => {`) fällt durch beide Raster
 * und wird nicht als Definition gemeldet — wer solche Fälle braucht, greppt mit
 * dateien_suchen. Das Werkzeug wirft NIE in die Schleife.
 */

const fs = require('fs').promises;
const fsc = require('fs').constants;
const path = require('path');
const BaseTool = require('../../../tools/baseTool');
const { resolveRealWithinRoots, normalizeRoots, assertFdWithinRoots } = require('../pathSafe');
const { IGNORE_DIRS } = require('./suche');

const MAX_SCAN_FILES = 4000; // so viele Dateien werden höchstens angesehen
const MAX_MATCHES = 100; // so viele Definitionsstellen werden gemeldet
const MAX_FILE_BYTES = 512 * 1024; // pro Datei nur die ersten 512 KB ansehen
const MAX_LINE_LEN = 240; // eine Fundzeile wird hierauf gekürzt
const MAX_NAME_LEN = 200; // Obergrenze für den gesuchten Namen

/** Quell-Endungen, in denen nach Definitionen gesucht wird. */
const SOURCE_EXT = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.rb',
  '.php',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.cs',
]);

/**
 * Schlüsselwörter, die wie ein Methoden-Kopf aussehen (`name(args) {`), aber
 * keine Definition sind — für den generischen Methoden-Fall ausgeschlossen,
 * damit `if (…) {` / `for (…) {` nicht als Symbol „if" auftauchen.
 */
const NICHT_SYMBOL = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'function',
  'do',
  'else',
  'with',
  'await',
  'typeof',
  'new',
  'in',
  'of',
  'case',
]);

const IDENT = '([A-Za-z_$][\\w$]*)';

/**
 * Definitions-Muster. Jedes liefert bei Treffer den Symbolnamen in Gruppe 1.
 * `art` benennt die Sorte für die Ausgabe. Reihenfolge = Priorität (erstes
 * greifendes Muster gewinnt pro Zeile).
 */
const PATTERNS = [
  {
    art: 'function',
    re: new RegExp(
      `^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s+${IDENT}`
    ),
  },
  {
    art: 'class',
    re: new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+${IDENT}`),
  },
  { art: 'interface', re: new RegExp(`^\\s*(?:export\\s+)?interface\\s+${IDENT}`) },
  { art: 'type', re: new RegExp(`^\\s*(?:export\\s+)?type\\s+${IDENT}\\s*[=<]`) },
  { art: 'enum', re: new RegExp(`^\\s*(?:export\\s+)?(?:const\\s+)?enum\\s+${IDENT}`) },
  {
    art: 'const',
    re: new RegExp(
      `^\\s*(?:export\\s+)?(?:const|let|var)\\s+${IDENT}\\s*=\\s*(?:async\\s*)?(?:function\\b|\\*|\\([^)]*\\)\\s*(?::[^=]+)?=>|[A-Za-z_$][\\w$]*\\s*=>)`
    ),
  },
  { art: 'def', re: new RegExp(`^\\s*(?:async\\s+)?def\\s+${IDENT}`) }, // Python
  { art: 'func', re: new RegExp(`^\\s*func\\s+(?:\\([^)]*\\)\\s*)?${IDENT}`) }, // Go
  // Generischer Methoden-/Objektmethoden-Kopf: `name(args) {` (kein Aufruf mit ;).
  // NICHT_SYMBOL filtert Kontrollstrukturen aus.
  {
    art: 'method',
    re: new RegExp(
      `^\\s*(?:public\\s+|private\\s+|protected\\s+|static\\s+|async\\s+|get\\s+|set\\s+|\\*\\s*)*${IDENT}\\s*\\([^;{)]*\\)\\s*\\{`
    ),
  },
  {
    art: 'method',
    re: new RegExp(`^\\s*${IDENT}\\s*:\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>)`),
  }, // obj: function/arrow
];

/** Holt die erlaubten Ordner aus dem Kontext; wirft nie, sondern liefert null. */
function rootsFrom(context) {
  try {
    return normalizeRoots(context && context.roots);
  } catch {
    return null;
  }
}

/** Posix-Relativpfad von `base` zu `abs` (für Anzeige). */
function toPosixRel(base, abs) {
  return path.relative(base, abs).split(path.sep).join('/');
}

/**
 * Eine Quellzeile gegen alle Definitions-Muster prüfen.
 * @returns {{art:string, symbol:string}|null}
 */
function symbolInZeile(line) {
  for (const { art, re } of PATTERNS) {
    const m = re.exec(line);
    if (m && m[1]) {
      if (art === 'method' && NICHT_SYMBOL.has(m[1])) {
        continue;
      }
      return { art, symbol: m[1] };
    }
  }
  return null;
}

class SymbolSuchenTool extends BaseTool {
  get name() {
    return 'symbol_suche';
  }

  get description() {
    return (
      'Findet, WO ein Symbol (Funktion, Klasse, Methode, Konstante) DEFINIERT ' +
      'ist, und liefert Datei:Zeile. dateien_suchen liefert dagegen jede ' +
      'Erwähnung.'
    );
  }

  get parameters() {
    return {
      name: {
        type: 'string',
        description: 'Name des Symbols, z. B. "berechneSumme".',
        required: true,
      },
      pfad: {
        type: 'string',
        description: 'Unterordner, in dem gesucht wird. Standard: Arbeitsverzeichnis.',
        required: false,
      },
      ungefaehr: {
        type: 'boolean',
        description:
          'true vergleicht als Teilzeichenkette ohne Groß-/Kleinschreibung ' +
          '(Standard false: exakt).',
        required: false,
      },
    };
  }

  async execute(params = {}, context = {}) {
    const roots = rootsFrom(context);
    if (!roots) {
      return 'Fehler: Für diesen Flow ist kein erlaubter Ordner hinterlegt.';
    }

    const gesucht = typeof params.name === 'string' ? params.name.trim() : '';
    if (!gesucht) {
      return 'Fehler: Bitte "name" (gesuchtes Symbol) angeben.';
    }
    if (gesucht.length > MAX_NAME_LEN) {
      return `Fehler: Name ist zu lang (max. ${MAX_NAME_LEN} Zeichen).`;
    }
    const ungefaehr = params.ungefaehr === true || params.ungefaehr === 'true';
    const nadelLower = gesucht.toLowerCase();
    const passt = symbol =>
      ungefaehr ? symbol.toLowerCase().includes(nadelLower) : symbol === gesucht;

    let base;
    try {
      base = resolveRealWithinRoots(roots, params.pfad || '.');
    } catch (err) {
      return `Fehler: ${err.message}`;
    }

    let baseStat;
    try {
      baseStat = await fs.stat(base);
    } catch {
      return `Fehler: "${params.pfad || '.'}" existiert nicht.`;
    }
    if (!baseStat.isDirectory()) {
      return `Fehler: "${params.pfad || '.'}" ist kein Verzeichnis.`;
    }

    const hits = []; // { rel, no, art, symbol, line }
    let scanned = 0;
    let truncated = false;
    const readBuf = Buffer.allocUnsafe(MAX_FILE_BYTES);

    // Iterativer Tiefendurchlauf; dieselbe Symlink-/TOCTOU-Absicherung wie
    // dateien_suchen (Symlinks nie verfolgen, O_NOFOLLOW + assertFdWithinRoots).
    const stack = [base];
    outer: while (stack.length > 0) {
      const dir = stack.pop();
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.isSymbolicLink()) {
          continue;
        }
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (IGNORE_DIRS.has(e.name)) {
            continue;
          }
          stack.push(abs);
          continue;
        }
        if (!e.isFile()) {
          continue;
        }
        if (!SOURCE_EXT.has(path.extname(e.name).toLowerCase())) {
          continue;
        }
        scanned++;
        if (scanned > MAX_SCAN_FILES) {
          truncated = true;
          break outer;
        }

        const rel = toPosixRel(base, abs);
        let handle;
        let bytesRead = 0;
        try {
          handle = await fs.open(abs, fsc.O_RDONLY | fsc.O_NOFOLLOW);
          assertFdWithinRoots(roots, handle.fd, rel);
          const res = await handle.read(readBuf, 0, MAX_FILE_BYTES, 0);
          bytesRead = res.bytesRead;
        } catch {
          if (handle) {
            await handle.close().catch(() => {});
          }
          continue;
        }
        await handle.close().catch(() => {});
        const content = readBuf.subarray(0, bytesRead).toString('utf8');
        if (content.indexOf('\u0000') !== -1) {
          continue; // Binärdatei
        }
        const lines = content.split(/\r?\n/);
        for (let ln = 0; ln < lines.length; ln++) {
          const found = symbolInZeile(lines[ln]);
          if (found && passt(found.symbol)) {
            hits.push({ rel, no: ln + 1, art: found.art, symbol: found.symbol, line: lines[ln] });
            if (hits.length >= MAX_MATCHES) {
              truncated = true;
              break outer;
            }
          }
        }
      }
    }

    const wo = params.pfad ? ` in "${params.pfad}"` : '';
    if (hits.length === 0) {
      return (
        `Keine Definition für "${gesucht}"${wo} gefunden. ` +
        'Tipp: mit ungefaehr=true unscharf suchen, oder dateien_suchen (Textsuche) ' +
        'für Erwähnungen/Aufrufstellen nutzen.'
      );
    }

    const shown = hits.map(h => {
      let line = h.line.trim();
      if (line.length > MAX_LINE_LEN) {
        line = line.slice(0, MAX_LINE_LEN) + '…';
      }
      return `${h.rel}:${h.no}: [${h.art}] ${line}`;
    });
    const note = truncated ? `\n... (weitere ausgelassen, Grenze ${MAX_MATCHES})` : '';
    return `${hits.length} Definition(en) für "${gesucht}"${wo}:\n${shown.join('\n')}${note}`;
  }
}

module.exports = { SymbolSuchenTool };
