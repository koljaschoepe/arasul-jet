/**
 * Skill-Werkzeuge für Dateien (Plan 011, Schritt 6).
 *
 * Bewusst ZWEI getrennte Werkzeuge statt eines mit `aktion`-Parameter:
 * `dateien_lesen` und `dateien_schreiben`. Nur so kann ein Skill Leserecht
 * bekommen, ohne zugleich Schreibrecht zu haben — mit einem kombinierten
 * Werkzeug wäre jede Lese-Freigabe automatisch auch eine Schreib-Freigabe.
 *
 * Jeder Pfad läuft ausnahmslos durch `resolveRealWithinRoots` (symlink-sicher,
 * mehrere erlaubte Ordner). Die Werkzeuge werfen NIE in die Werkzeug-Schleife
 * hinein — Fehler kommen als kurzer Text zurück, damit das Modell darauf
 * reagieren kann, statt dass der ganze Lauf abbricht.
 */

const fs = require('fs').promises;
const path = require('path');
const BaseTool = require('../../../tools/baseTool');
const logger = require('../../../utils/logger');
const { resolveRealWithinRoots, normalizeRoots } = require('../pathSafe');

const MAX_READ_BYTES = 256 * 1024; // 256 KB
const MAX_WRITE_BYTES = 1024 * 1024; // 1 MB
const MAX_LIST_ENTRIES = 500;

/** Holt die erlaubten Ordner aus dem Kontext; wirft nie, sondern liefert null. */
function rootsFrom(context) {
  try {
    return normalizeRoots(context && context.roots);
  } catch {
    return null;
  }
}

class DateienLesenTool extends BaseTool {
  get name() {
    return 'dateien_lesen';
  }

  get description() {
    return 'Dateien in den erlaubten Ordnern auflisten (aktion=list) oder lesen (aktion=read)';
  }

  get parameters() {
    return {
      aktion: {
        type: 'string',
        description: 'list oder read',
        enum: ['list', 'read'],
        required: true,
      },
      pfad: {
        type: 'string',
        description:
          'Pfad relativ zum Arbeitsverzeichnis (dem ersten erlaubten Ordner). ' +
          'Ein anderer erlaubter Ordner wird über seinen vollständigen Pfad angesprochen. ' +
          'Bei list optional, Standard = Arbeitsverzeichnis.',
        required: false,
      },
    };
  }

  async execute(params = {}, context = {}) {
    const roots = rootsFrom(context);
    if (!roots) {
      return 'Fehler: Für diesen Skill ist kein erlaubter Ordner hinterlegt.';
    }
    const aktion = String(params.aktion || '').toLowerCase();
    switch (aktion) {
      case 'list':
        return this._list(roots, params.pfad);
      case 'read':
        return this._read(roots, params.pfad);
      default:
        return `Fehler: Unbekannte aktion "${params.aktion}". Erlaubt: list, read.`;
    }
  }

  async _list(roots, pfad) {
    let dir;
    try {
      dir = resolveRealWithinRoots(roots, pfad || '.');
    } catch (err) {
      return `Fehler: ${err.message}`;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return `Fehler: Verzeichnis "${pfad || '.'}" existiert nicht.`;
      }
      if (err.code === 'ENOTDIR') {
        return `Fehler: "${pfad}" ist kein Verzeichnis.`;
      }
      return `Fehler beim Auflisten: ${err.message}`;
    }
    if (entries.length === 0) {
      return `Verzeichnis "${pfad || '.'}" ist leer.`;
    }
    const lines = entries
      .slice(0, MAX_LIST_ENTRIES)
      .map(e => `${e.isDirectory() ? 'd' : '-'} ${e.name}`)
      .sort();
    const note =
      entries.length > MAX_LIST_ENTRIES
        ? `\n... (${entries.length - MAX_LIST_ENTRIES} weitere ausgelassen)`
        : '';
    return `Inhalt von "${pfad || '.'}":\n${lines.join('\n')}${note}`;
  }

  async _read(roots, pfad) {
    if (!pfad) {
      return 'Fehler: "pfad" ist zum Lesen erforderlich.';
    }
    let file;
    try {
      file = resolveRealWithinRoots(roots, pfad);
    } catch (err) {
      return `Fehler: ${err.message}`;
    }
    let stat;
    try {
      stat = await fs.stat(file);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return `Fehler: Datei "${pfad}" existiert nicht.`;
      }
      return `Fehler beim Lesen: ${err.message}`;
    }
    if (stat.isDirectory()) {
      return `Fehler: "${pfad}" ist ein Verzeichnis, keine Datei.`;
    }
    let content;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch (err) {
      return `Fehler beim Lesen: ${err.message}`;
    }
    // Die Kürzung ist hier Kontext-Schutz, nicht nur Speicherschutz: Eine
    // 5-MB-Datei würde den Kontext eines kleinen lokalen Modells sprengen.
    //
    // Über den Buffer kappen, NICHT über `String.slice`: `slice` zählt
    // UTF-16-Einheiten, nicht Bytes. Bei deutschem Text (Umlaute) oder CJK ist
    // ein Zeichen zwei bis vier Bytes gross — eine 400-KB-Datei rutschte damit
    // fast vollstaendig durch den 256-KB-Deckel. Das ist bei Fliesstext der
    // Normalfall, nicht der Sonderfall.
    const buf = Buffer.from(content, 'utf8');
    if (buf.byteLength > MAX_READ_BYTES) {
      // Ein Mehrbyte-Zeichen kann genau an der Grenze zerschnitten werden; der
      // Decoder macht daraus ein Ersatzzeichen, das am Ende abgeschnitten wird.
      const text = buf.subarray(0, MAX_READ_BYTES).toString('utf8').replace(/�+$/, '');
      return `${text}\n... [gekuerzt bei ${MAX_READ_BYTES} Bytes]`;
    }
    return content;
  }
}

class DateienSchreibenTool extends BaseTool {
  get name() {
    return 'dateien_schreiben';
  }

  get description() {
    return 'Schreibt eine Datei in einen der erlaubten Ordner (überschreibt vorhandene Inhalte)';
  }

  get parameters() {
    return {
      pfad: {
        type: 'string',
        description:
          'Pfad relativ zum Arbeitsverzeichnis (dem ersten erlaubten Ordner). ' +
          'Ein anderer erlaubter Ordner wird über seinen vollständigen Pfad angesprochen.',
        required: true,
      },
      inhalt: {
        type: 'string',
        description: 'Der vollständige neue Dateiinhalt',
        required: true,
      },
    };
  }

  /**
   * @param {{pfad?:string, inhalt?:string}} params
   * @param {{roots:string[], onChange?:Function, spaceId?:string, slug?:string}} context
   *   `onChange` meldet jede Änderung an die Änderungs-Übersicht (Schritt 16).
   */
  async execute(params = {}, context = {}) {
    const roots = rootsFrom(context);
    if (!roots) {
      return 'Fehler: Für diesen Skill ist kein erlaubter Ordner hinterlegt.';
    }
    const pfad = params.pfad;
    if (!pfad) {
      return 'Fehler: "pfad" ist zum Schreiben erforderlich.';
    }
    const data = params.inhalt == null ? '' : String(params.inhalt);
    if (Buffer.byteLength(data, 'utf8') > MAX_WRITE_BYTES) {
      return `Fehler: Inhalt ueberschreitet das Limit von ${MAX_WRITE_BYTES} Bytes.`;
    }

    // Das Arbeitsverzeichnis anlegen, falls es noch nicht existiert. Ohne das
    // koennte ein Skill, dessen Ordner erst noch entstehen soll, NIE schreiben:
    // die Pfad-Sperre bricht vorher ab, weil sie keine existierende Wurzel
    // findet — und ohne Schreibvorgang entsteht der Ordner auch nie. Bewusst
    // nur die erste Wurzel: die uebrigen sind vorhandene Quellen, kein Ziel.
    try {
      await fs.mkdir(roots[0], { recursive: true });
    } catch (err) {
      return `Fehler: Arbeitsverzeichnis "${roots[0]}" konnte nicht angelegt werden: ${err.message}`;
    }

    let file;
    try {
      file = resolveRealWithinRoots(roots, pfad);
    } catch (err) {
      return `Fehler: ${err.message}`;
    }

    // Vorherigen Inhalt merken, solange es ihn noch gibt — die Änderungs-
    // Übersicht am Ende des Laufs zeigt Vorher/Nachher, und das geht nur, wenn
    // wir hier danach greifen, nicht später.
    let vorher = null;
    let neu = true;
    try {
      vorher = await fs.readFile(file, 'utf8');
      neu = false;
    } catch {
      vorher = null;
    }

    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, data, 'utf8');
    } catch (err) {
      return `Fehler beim Schreiben: ${err.message}`;
    }

    if (typeof context.onChange === 'function') {
      try {
        context.onChange({
          pfad,
          datei: file,
          art: neu ? 'neu' : 'geaendert',
          vorher,
          nachher: data,
        });
      } catch (err) {
        // Die Protokollierung darf einen erfolgreichen Schreibvorgang nie
        // nachträglich zum Fehler machen.
        logger.warn(`dateien_schreiben: Änderungsprotokoll fehlgeschlagen: ${err.message}`);
      }
    }

    return `Datei "${pfad}" ${neu ? 'angelegt' : 'ueberschrieben'} (${Buffer.byteLength(data, 'utf8')} Bytes).`;
  }
}

module.exports = { DateienLesenTool, DateienSchreibenTool };
