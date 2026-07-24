/**
 * Skill-Werkzeug „dateien_suchen" (Plan 012, komplexe Skills).
 *
 * Ergänzt `dateien_lesen`/`dateien_schreiben` um das, was bisher fehlte, um in
 * einem größeren Ordner überhaupt etwas zu FINDEN, ohne ihn Datei für Datei
 * durchzulesen: eine Suche nach Dateinamen (Glob) und/oder nach Textinhalt
 * (grep). Erst damit lohnt sich eine höhere Verschachtelungstiefe — ein
 * Subagent kann gezielt die relevanten Dateien auftreiben, statt blind zu listen.
 *
 * Sicherheit wie bei den anderen Datei-Werkzeugen: JEDER Pfad läuft durch
 * `resolveRealWithinRoots` (symlink-sicher, mehrere erlaubte Ordner). Symlinks
 * werden beim Ablaufen NICHT verfolgt — ein Skill mit Terminal-Recht könnte
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
 * oder `**` + `/*.js` reichen für Skill-Ordner.
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
      'Sucht in den erlaubten Ordnern nach Dateien: nach Namensmuster (muster, ' +
      'z. B. *.md) und/oder nach Textinhalt (text). Liefert passende Pfade bzw. ' +
      'Fundstellen mit Zeilennummer.'
    );
  }

  get parameters() {
    return {
      muster: {
        type: 'string',
        description:
          'Glob für Dateinamen, z. B. "*.md" oder "**/*.js". Ohne "/" wird nur ' +
          'der Dateiname verglichen, mit "/" der Pfad. Optional.',
        required: false,
      },
      text: {
        type: 'string',
        description:
          'Teilzeichenkette, nach der in den Dateien gesucht wird (Groß-/' +
          'Kleinschreibung egal, kein Regulärer Ausdruck). Optional. Mindestens ' +
          'muster ODER text muss angegeben sein.',
        required: false,
      },
      pfad: {
        type: 'string',
        description:
          'Unterordner relativ zum Arbeitsverzeichnis, in dem gesucht wird. ' +
          'Optional, Standard = Arbeitsverzeichnis.',
        required: false,
      },
    };
  }

  async execute(params = {}, context = {}) {
    const roots = rootsFrom(context);
    if (!roots) {
      return 'Fehler: Für diesen Skill ist kein erlaubter Ordner hinterlegt.';
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

    const fileHits = []; // nur-Glob: Relativpfade
    const grepHits = []; // grep: { rel, no, line }
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
            grepHits.push({ rel, no: ln + 1, line: lines[ln] });
            if (grepHits.length >= MAX_GREP_MATCHES) {
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
    const shown = grepHits.map(m => {
      let line = m.line.trim();
      if (line.length > MAX_LINE_LEN) {
        line = line.slice(0, MAX_LINE_LEN) + '…';
      }
      return `${m.rel}:${m.no}: ${line}`;
    });
    const note = truncated ? `\n... (weitere Treffer ausgelassen, Grenze ${MAX_GREP_MATCHES})` : '';
    return `${grepHits.length} Trefferzeile(n) für "${text}"${wo}:\n${shown.join('\n')}${note}`;
  }
}

module.exports = { DateiSuchenTool };
