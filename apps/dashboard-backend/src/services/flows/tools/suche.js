/**
 * Flow-Werkzeug „dateien_suchen" (Plan 012, komplexe Flows).
 *
 * Ergänzt `dateien_lesen`/`dateien_schreiben` um das, was bisher fehlte, um in
 * einem größeren Ordner überhaupt etwas zu FINDEN, ohne ihn Datei für Datei
 * durchzulesen: eine Suche nach Dateinamen (Glob) und/oder nach Textinhalt
 * (grep). Erst damit lohnt sich eine höhere Verschachtelungstiefe — ein
 * Subagent kann gezielt die relevanten Dateien auftreiben, statt blind zu listen.
 *
 * Sicherheit wie bei den anderen Datei-Werkzeugen: JEDER Pfad läuft durch
 * `resolveRealWithinRoots` (symlink-sicher, mehrere erlaubte Ordner). Symlinks
 * werden beim Ablaufen NICHT verfolgt — ein Flow mit Terminal-Recht könnte
 * sonst einen Symlink aus dem Ordner heraus legen und ihn mitdurchsuchen. Das
 * Werkzeug wirft NIE in die Schleife hinein; Fehler und Grenzen kommen als
 * kurzer Text zurück.
 */

const fs = require('fs').promises;
const fsc = require('fs').constants;
const path = require('path');
const BaseTool = require('../../../tools/baseTool');
const { resolveRealWithinRoots, normalizeRoots, assertFdWithinRoots } = require('../pathSafe');

const MAX_SCAN_FILES = 4000; // so viele Dateien werden höchstens angesehen
const MAX_GLOB_RESULTS = 200; // so viele Namens-Treffer werden gemeldet
const MAX_GREP_MATCHES = 100; // so viele Text-Trefferzeilen werden gemeldet
const MAX_FILE_BYTES = 256 * 1024; // pro Datei nur die ersten 256 KB durchsuchen
const MAX_LINE_LEN = 240; // eine Trefferzeile wird hierauf gekürzt
const MAX_TEXT_LEN = 2000; // Obergrenze für den Suchtext
const MAX_KONTEXT = 3; // höchstens so viele Kontextzeilen je Seite einer Fundstelle

/**
 * Rausch-Verzeichnisse, die beim agentischen Code-Suchen (Plan 021) nur die
 * Scan-Grenze aushungern und echte Treffer verdrängen. Werden standardmäßig
 * übersprungen — wie es ein Werkzeug wie ripgrep von Haus aus tut. Mit
 * `alles: true` wird auch hier gesucht. Vergleich rein über den Verzeichnisnamen
 * (kein Pfad), damit die Symlink-/TOCTOU-Absicherung unberührt bleibt.
 */
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.gradle',
  'target',
  '.idea',
  '.vscode',
]);

/** Holt die erlaubten Ordner aus dem Kontext; wirft nie, sondern liefert null. */
function rootsFrom(context) {
  try {
    return normalizeRoots(context && context.roots);
  } catch {
    return null;
  }
}

/**
 * Übersetzt ein einfaches Glob in einen Regulären Ausdruck.
 * Unterstützt `*` (beliebig, aber kein Schrägstrich), `**` (beliebig inkl.
 * Schrägstrich), `**` gefolgt von einem Schrägstrich (null oder mehr
 * Pfadsegmente) und `?` (ein Zeichen). Alles andere wird wörtlich genommen. Die
 * Auswertung ist absichtlich klein gehalten — die üblichen Muster wie `*.md`
 * oder `**` + `/*.js` reichen für Flow-Ordner.
 */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?'; // Doppelstern + Schrägstrich → null oder mehr Segmente
        } else {
          re += '.*'; // ** → beliebig, auch über Ordnergrenzen
        }
      } else {
        re += '[^/]*'; // * → beliebig innerhalb eines Segments
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '/') {
      re += '/';
    } else if ('\\^$+.()|{}[]'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$', 'i');
}

/**
 * Baut den Text-Matcher. BEWUSST wörtliche Teilzeichenketten-Suche (kein
 * Regulärer Ausdruck): ein aus Nutzer-/Modell-Eingabe kompiliertes RegExp mit
 * katastrophalem Backtracking (ReDoS) würde den EINEN Node-Prozess des Backends
 * synchron blockieren — ein Promise-Timeout hilft dagegen nicht, weil der
 * Event-Loop steht. Groß-/Kleinschreibung wird ignoriert; die Suche ist linear
 * und kann nicht ausufern.
 */
function buildTextMatcher(text) {
  const needle = text.toLowerCase();
  return { test: line => line.toLowerCase().includes(needle) };
}

/** Posix-Relativpfad von `base` zu `abs` (für Anzeige und Glob-Vergleich). */
function toPosixRel(base, abs) {
  return path.relative(base, abs).split(path.sep).join('/');
}

class DateiSuchenTool extends BaseTool {
  get name() {
    return 'dateien_suchen';
  }

  get description() {
    return (
      'Sucht Dateien nach Namensmuster (muster) und/oder Textinhalt (text). ' +
      'Liefert Pfade bzw. Fundstellen mit Zeilennummer.'
    );
  }

  get parameters() {
    return {
      muster: {
        type: 'string',
        description: 'Glob, z. B. "*.md". Ohne "/" gilt er dem Dateinamen, mit "/" dem Pfad.',
        required: false,
      },
      text: {
        type: 'string',
        description:
          'Gesuchter Text (Groß-/Kleinschreibung egal, kein Regex). Mindestens ' +
          'muster ODER text angeben.',
        required: false,
      },
      pfad: {
        type: 'string',
        description: 'Unterordner, in dem gesucht wird. Standard: Arbeitsverzeichnis.',
        required: false,
      },
      kontext: {
        type: 'number',
        description: `Zeilen vor und nach jeder Fundstelle (0–${MAX_KONTEXT}, Standard 0).`,
        required: false,
      },
      alles: {
        type: 'boolean',
        description: 'true durchsucht auch node_modules/.git/dist (Standard false).',
        required: false,
      },
    };
  }

  async execute(params = {}, context = {}) {
    const roots = rootsFrom(context);
    if (!roots) {
      return 'Fehler: Für diesen Flow ist kein erlaubter Ordner hinterlegt.';
    }

    // Führende Schrägstriche im Glob abstreifen: der Vergleich läuft gegen einen
    // relativen Posix-Pfad (nie mit führendem "/"), "/*.md" träfe sonst nie.
    const muster = (typeof params.muster === 'string' ? params.muster.trim() : '').replace(
      /^\/+/,
      ''
    );
    const text = typeof params.text === 'string' ? params.text : '';
    if (!muster && !text.trim()) {
      return 'Fehler: Bitte "muster" (Dateiname-Glob) und/oder "text" (Suchtext) angeben.';
    }
    if (text.length > MAX_TEXT_LEN) {
      return `Fehler: Suchtext ist zu lang (max. ${MAX_TEXT_LEN} Zeichen).`;
    }

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

    const globRe = muster ? globToRegExp(muster) : null;
    const globUsesPath = muster.includes('/');
    const matcher = text.trim() ? buildTextMatcher(text) : null;

    const alles = params.alles === true || params.alles === 'true';
    let kontext = Number.parseInt(params.kontext, 10);
    if (!Number.isFinite(kontext) || kontext < 0) {
      kontext = 0;
    }
    kontext = Math.min(kontext, MAX_KONTEXT);
    // Mit Kontextzeilen wächst die Ausgabe je Treffer — die Trefferzahl deckeln,
    // damit der Modell-Kontext nicht geflutet wird.
    const grepCap = kontext > 0 ? 40 : MAX_GREP_MATCHES;

    const fileHits = []; // nur-Glob: Relativpfade
    const grepHits = []; // grep: { rel, no, line, before[], after[] }
    let scanned = 0;
    let truncated = false;
    // EIN wiederverwendeter Lesepuffer für den grep-Pfad — pro Datei werden nur
    // die ersten MAX_FILE_BYTES gelesen (nicht die ganze, evtl. riesige Datei).
    const readBuf = matcher ? Buffer.allocUnsafe(MAX_FILE_BYTES) : null;

    // Iterativer Tiefendurchlauf (kein Rekursions-Stacklimit). Symlinks werden
    // nie verfolgt — weder als Verzeichnis noch als Datei.
    const stack = [base];
    outer: while (stack.length > 0) {
      const dir = stack.pop();
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue; // unlesbares Verzeichnis überspringen, nicht abbrechen
      }
      for (const e of entries) {
        if (e.isSymbolicLink()) {
          continue;
        }
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
          // Rausch-Ordner (node_modules/.git/…) standardmäßig überspringen — sie
          // hungern sonst nur die Scan-Grenze aus. Vergleich rein über den Namen.
          if (!alles && IGNORE_DIRS.has(e.name)) {
            continue;
          }
          stack.push(abs);
          continue;
        }
        if (!e.isFile()) {
          continue;
        }
        scanned++;
        if (scanned > MAX_SCAN_FILES) {
          truncated = true;
          break outer;
        }

        const rel = toPosixRel(base, abs);
        if (globRe && !globRe.test(globUsesPath ? rel : e.name)) {
          continue;
        }

        if (!matcher) {
          // Reiner Namens-Treffer.
          fileHits.push(rel);
          if (fileHits.length >= MAX_GLOB_RESULTS) {
            truncated = true;
            break outer;
          }
          continue;
        }

        // grep: die Datei öffnen und NUR die ersten MAX_FILE_BYTES lesen.
        // O_NOFOLLOW weist einen Symlink als letzte Komponente ab;
        // assertFdWithinRoots prüft danach über den offenen Deskriptor, dass die
        // getroffene Datei wirklich in den erlaubten Ordnern liegt — das schließt
        // das TOCTOU-Fenster, in dem ein ZWISCHENverzeichnis zwischen readdir und
        // open gegen einen Symlink getauscht wird (dieselbe Absicherung wie
        // dateien_lesen). Wirft assertFdWithinRoots (Ausbruch) oder schlägt das
        // Lesen fehl, wird die Datei still übersprungen — kein Leak, kein Abbruch.
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
        // Binärdateien (Nullbyte) überspringen — grep über Binärdaten ist Lärm.
        if (content.indexOf('\u0000') !== -1) {
          continue;
        }
        const lines = content.split(/\r?\n/);
        for (let ln = 0; ln < lines.length; ln++) {
          if (matcher.test(lines[ln])) {
            const before = kontext ? lines.slice(Math.max(0, ln - kontext), ln) : [];
            const after = kontext ? lines.slice(ln + 1, ln + 1 + kontext) : [];
            grepHits.push({ rel, no: ln + 1, line: lines[ln], before, after });
            if (grepHits.length >= grepCap) {
              truncated = true;
              break outer;
            }
          }
        }
      }
    }

    const wo = params.pfad ? ` in "${params.pfad}"` : '';

    if (!matcher) {
      if (fileHits.length === 0) {
        return `Keine Dateien passend zu "${muster}"${wo}.`;
      }
      fileHits.sort();
      const note = truncated ? `\n... (weitere ausgelassen, Grenze ${MAX_GLOB_RESULTS})` : '';
      return `${fileHits.length} Datei(en) passend zu "${muster}"${wo}:\n${fileHits.join('\n')}${note}`;
    }

    if (grepHits.length === 0) {
      const mitGlob = muster ? ` in Dateien passend zu "${muster}"` : '';
      return `Kein Treffer für "${text}"${mitGlob}${wo}.`;
    }
    // Eine Zeile für die Ausgabe kürzen (ohne führende/anhängende Leerzeichen zu
    // verschlucken, die im Code Bedeutung haben — nur harte Längengrenze).
    const kurz = s => (s.length > MAX_LINE_LEN ? s.slice(0, MAX_LINE_LEN) + '…' : s);
    const shown = grepHits.map(m => {
      if (!kontext) {
        return `${m.rel}:${m.no}: ${kurz(m.line.trim())}`;
      }
      // grep-Stil: Kontextzeilen mit "-", die Fundzeile mit ":".
      const block = [];
      m.before.forEach((l, i) => {
        block.push(`${m.rel}-${m.no - m.before.length + i}- ${kurz(l)}`);
      });
      block.push(`${m.rel}:${m.no}: ${kurz(m.line)}`);
      m.after.forEach((l, i) => {
        block.push(`${m.rel}-${m.no + 1 + i}- ${kurz(l)}`);
      });
      return block.join('\n');
    });
    const trenner = kontext ? '\n--\n' : '\n';
    const note = truncated ? `\n... (weitere Treffer ausgelassen, Grenze ${grepCap})` : '';
    return `${grepHits.length} Trefferzeile(n) für "${text}"${wo}:\n${shown.join(trenner)}${note}`;
  }
}

module.exports = { DateiSuchenTool, IGNORE_DIRS };
