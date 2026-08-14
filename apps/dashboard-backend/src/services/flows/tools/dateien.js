/**
 * Flow-Werkzeuge für Dateien (Plan 011, Schritt 6).
 *
 * Bewusst ZWEI getrennte Werkzeuge statt eines mit `aktion`-Parameter:
 * `dateien_lesen` und `dateien_schreiben`. Nur so kann ein Flow Leserecht
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
const { resolveRealWithinRoots, normalizeRoots, assertFdWithinRoots } = require('../pathSafe');
const fsc = require('fs').constants;

const MAX_READ_BYTES = 256 * 1024; // 256 KB
const MAX_WRITE_BYTES = 1024 * 1024; // 1 MB
const MAX_LIST_ENTRIES = 500;
// Bearbeiten/Anhängen (Harness v2, 2026-07-30): Langdokumente entstehen
// abschnittsweise per Anhängen statt in einem einzigen Riesen-Schreibaufruf —
// ein kleines Modell kann keine 1 MB am Stück emittieren, wohl aber 50 Sektionen.
const MAX_EDIT_BYTES = 4 * 1024 * 1024; // Dateigröße, bis zu der Suchen/Ersetzen erlaubt ist
const MAX_APPEND_TOTAL = 16 * 1024 * 1024; // Obergrenze der Zieldatei beim Anhängen

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
      offset: {
        type: 'integer',
        description:
          'Nur bei read: Byte-Offset zum Weiterlesen großer Dateien. Standard 0 ' +
          '(Dateianfang). Ist eine Datei länger als der Lese-Block, nennt die ' +
          'Antwort den nächsten offset zum Weiterlesen.',
        required: false,
      },
    };
  }

  async execute(params = {}, context = {}) {
    const roots = rootsFrom(context);
    if (!roots) {
      return 'Fehler: Für diesen Flow ist kein erlaubter Ordner hinterlegt.';
    }
    const aktion = String(params.aktion || '').toLowerCase();
    switch (aktion) {
      case 'list':
        return this._list(roots, params.pfad);
      case 'read':
        return this._read(roots, params.pfad, params.offset);
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

  async _read(roots, pfad, offset) {
    if (!pfad) {
      return 'Fehler: "pfad" ist zum Lesen erforderlich.';
    }
    // Chunked-Lesen großer Dateien (Plan 019 · Phase 4): ab `offset` genau ein
    // Lese-Block (MAX_READ_BYTES) — kein 5-MB-Editor-Limit, aber Kontextschutz.
    const start = Math.max(0, Number.isFinite(Number(offset)) ? Math.floor(Number(offset)) : 0);
    let file;
    try {
      file = resolveRealWithinRoots(roots, pfad);
    } catch (err) {
      return `Fehler: ${err.message}`;
    }
    // Ueber einen Dateideskriptor lesen, nicht ueber den Pfad. `O_NOFOLLOW`
    // verhindert, dass die letzte Komponente ein Symlink ist; die anschliessende
    // Deskriptor-Pruefung deckt zusaetzlich Zwischenverzeichnisse ab. Damit
    // laesst sich der Pfad zwischen Pruefung und Zugriff nicht mehr tauschen
    // (TOCTOU) — die Faehigkeit dazu bringt das Terminal-Werkzeug mit.
    let handle;
    let buf;
    let gesamt = 0;
    try {
      handle = await fs.open(file, fsc.O_RDONLY | fsc.O_NOFOLLOW);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return `Fehler: Datei "${pfad}" existiert nicht.`;
      }
      if (err.code === 'ELOOP') {
        return `Fehler: "${pfad}" ist ein Symlink — der Zugriff wird verweigert.`;
      }
      if (err.code === 'EISDIR') {
        return `Fehler: "${pfad}" ist ein Verzeichnis, keine Datei.`;
      }
      return `Fehler beim Lesen: ${err.message}`;
    }
    try {
      assertFdWithinRoots(roots, handle.fd, pfad);
      const stat = await handle.stat();
      if (stat.isDirectory()) {
        return `Fehler: "${pfad}" ist ein Verzeichnis, keine Datei.`;
      }
      gesamt = stat.size;
      if (start > 0 && start >= gesamt) {
        return `Hinweis: offset ${start} liegt hinter dem Dateiende (${gesamt} Bytes).`;
      }
      // NUR das benötigte Fenster ab `start` lesen — eine 50-MB-Datei landet so
      // nie komplett im Speicher (Chunked-Lesen).
      const laenge = Math.min(MAX_READ_BYTES, Math.max(0, gesamt - start));
      const roh = Buffer.alloc(laenge);
      let gelesen = 0;
      if (laenge > 0) {
        ({ bytesRead: gelesen } = await handle.read(roh, 0, laenge, start));
      }
      // Nur die WIRKLICH gelesenen Bytes verwenden — schrumpft die Datei zwischen
      // stat() und read(), blieben sonst Null-Bytes aus Buffer.alloc stehen.
      buf = roh.subarray(0, gelesen);
    } catch (err) {
      return `Fehler beim Lesen: ${err.message}`;
    } finally {
      await handle.close().catch(() => {});
    }
    // Binärdateien (PDF/DOCX/Bilder …) nicht roh ins Modell kippen — das
    // sprengt den Kontext mit Byte-Salat und das Modell erstickt daran.
    // Stattdessen ein Hinweis, der zum richtigen Werkzeug führt: der INHALT
    // solcher Dokumente steht über die Wissenssuche bereit.
    if (buf.subarray(0, 8000).includes(0)) {
      return (
        `Hinweis: "${pfad}" ist eine Binärdatei (z. B. PDF/DOCX/Bild) und kann nicht als ` +
        'Text gelesen werden. Nutze rag_suche mit einer inhaltlichen Frage, um den INHALT ' +
        'dieses Dokuments aus dem Wissen zu holen.'
      );
    }
    // Mehrbyte-Zeichen kann am Fenster-Anfang/-Ende zerschnitten werden; der
    // Decoder macht daraus GENAU EIN Ersatzzeichen an der Schnittstelle — nur
    // dieses eine entfernen (nicht echte U+FFFD im Inhalt mitlöschen).
    let text = buf.toString('utf8');
    if (start > 0) {
      text = text.replace(/^�/, '');
    }
    const ende = start + buf.byteLength;
    if (ende < gesamt) {
      text = text.replace(/�$/, '');
      return (
        `${text}\n... [gekuerzt bei Byte ${ende} von ${gesamt} — ` +
        `weiterlesen mit aktion=read, offset=${ende}]`
      );
    }
    return text;
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
   * @param {{roots:string[], spaceId?:string, slug?:string}} context
   *
   * Die Änderungs-Übersicht (Schritt 16) entsteht NICHT hier, sondern im Runner
   * über einen Ordner-Abzug vor/nach dem Lauf (services/flows/changeTracker.js).
   * So werden Terminal-Änderungen und Löschungen mit demselben Mechanismus
   * erfasst — ein Schreib-Haken allein sähe beide nie.
   */
  async execute(params = {}, context = {}) {
    const roots = rootsFrom(context);
    if (!roots) {
      return 'Fehler: Für diesen Flow ist kein erlaubter Ordner hinterlegt.';
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
    // koennte ein Flow, dessen Ordner erst noch entstehen soll, NIE schreiben:
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

    let neu = true;
    let handle;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      // Bewusst OHNE O_TRUNC: Vor dem Kürzen wird die Größe gelesen, um „angelegt"
      // von „ueberschrieben" zu unterscheiden — mit O_TRUNC wäre die Datei beim
      // Öffnen schon leer. O_NOFOLLOW schliesst den Symlink als letzte Komponente
      // aus, die Deskriptor-Pruefung danach auch getauschte Zwischenverzeichnisse
      // (TOCTOU). Die inhaltliche Vorher/Nachher-Übersicht liefert der Runner
      // über den Ordner-Abzug (changeTracker.js), nicht dieses Werkzeug.
      handle = await fs.open(file, fsc.O_RDWR | fsc.O_CREAT | fsc.O_NOFOLLOW, 0o644);
    } catch (err) {
      if (err.code === 'ELOOP') {
        return `Fehler: "${pfad}" ist ein Symlink — der Schreibzugriff wird verweigert.`;
      }
      return `Fehler beim Schreiben: ${err.message}`;
    }

    try {
      assertFdWithinRoots(roots, handle.fd, pfad);
      const stat = await handle.stat();
      if (stat.isDirectory()) {
        return `Fehler: "${pfad}" ist ein Verzeichnis, keine Datei.`;
      }
      if (stat.size > 0) {
        neu = false;
      }
      await handle.truncate(0);
      await handle.write(data, 0, 'utf8');
    } catch (err) {
      return `Fehler beim Schreiben: ${err.message}`;
    } finally {
      await handle.close().catch(() => {});
    }

    return `Datei "${pfad}" ${neu ? 'angelegt' : 'ueberschrieben'} (${Buffer.byteLength(data, 'utf8')} Bytes).`;
  }
}

/**
 * Öffnet eine Zieldatei symlink-sicher zum Schreiben (gemeinsamer Unterbau von
 * Schreiben/Bearbeiten/Anhängen). Liefert {handle, stat} oder {fehler}.
 * `erstellen: false` öffnet OHNE O_CREAT — Bearbeiten darf auf einem
 * fehlenden Pfad keine leere Datei zurücklassen (Review PR #278).
 */
async function oeffneZumSchreiben(roots, pfad, { erstellen = true } = {}) {
  try {
    await fs.mkdir(roots[0], { recursive: true });
  } catch (err) {
    return {
      fehler: `Fehler: Arbeitsverzeichnis "${roots[0]}" konnte nicht angelegt werden: ${err.message}`,
    };
  }
  let file;
  try {
    file = resolveRealWithinRoots(roots, pfad);
  } catch (err) {
    return { fehler: `Fehler: ${err.message}` };
  }
  let handle;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const flags = erstellen
      ? fsc.O_RDWR | fsc.O_CREAT | fsc.O_NOFOLLOW
      : fsc.O_RDWR | fsc.O_NOFOLLOW;
    handle = await fs.open(file, flags, 0o644);
  } catch (err) {
    if (err.code === 'ELOOP') {
      return { fehler: `Fehler: "${pfad}" ist ein Symlink — der Schreibzugriff wird verweigert.` };
    }
    if (err.code === 'ENOENT' && !erstellen) {
      return {
        fehler: `Fehler: Datei "${pfad}" existiert nicht. Zum Neu-Anlegen dateien_schreiben nutzen.`,
      };
    }
    return { fehler: `Fehler beim Schreiben: ${err.message}` };
  }
  try {
    assertFdWithinRoots(roots, handle.fd, pfad);
    const stat = await handle.stat();
    if (stat.isDirectory()) {
      await handle.close().catch(() => {});
      return { fehler: `Fehler: "${pfad}" ist ein Verzeichnis, keine Datei.` };
    }
    return { handle, stat };
  } catch (err) {
    await handle.close().catch(() => {});
    return { fehler: `Fehler beim Schreiben: ${err.message}` };
  }
}

class DateienBearbeitenTool extends BaseTool {
  get name() {
    return 'dateien_bearbeiten';
  }

  get description() {
    return (
      'Ändert eine Stelle in einer bestehenden Datei per Suchen/Ersetzen — ' +
      'für gezielte Änderungen IMMER dies nutzen statt die Datei komplett neu zu schreiben'
    );
  }

  get parameters() {
    return {
      pfad: {
        type: 'string',
        description: 'Pfad der bestehenden Datei relativ zum Arbeitsverzeichnis',
        required: true,
      },
      suchen: {
        type: 'string',
        description:
          'Der EXAKTE bestehende Textblock, der ersetzt werden soll (mit genug Zeilen, ' +
          'dass er nur einmal vorkommt — Text 1:1 aus der Datei kopieren)',
        required: true,
      },
      ersetzen: {
        type: 'string',
        description: 'Der neue Text, der an diese Stelle tritt (leer = Block löschen)',
        required: true,
      },
      alle: {
        type: 'boolean',
        description: 'true = ALLE Vorkommen ersetzen (Standard: genau eines)',
        required: false,
      },
    };
  }

  /**
   * Suchen/Ersetzen mit zweistufiger Suche: erst exakt, dann Whitespace-tolerant
   * (Zeilenenden-/Einrückungsdrift ist DER Normalfall, wenn ein Modell Text aus
   * einer Werkzeug-Ausgabe zurückzitiert). Der Fehlertext ist bewusst eine
   * Handlungsanweisung — das Modell soll beim nächsten Versuch mehr Kontextzeilen
   * mitgeben, nicht raten.
   */
  async execute(params = {}, context = {}) {
    const roots = rootsFrom(context);
    if (!roots) {
      return 'Fehler: Für diesen Flow ist kein erlaubter Ordner hinterlegt.';
    }
    const pfad = params.pfad;
    const suchen = params.suchen == null ? '' : String(params.suchen);
    const ersetzen = params.ersetzen == null ? '' : String(params.ersetzen);
    if (!pfad) {
      return 'Fehler: "pfad" ist erforderlich.';
    }
    if (!suchen) {
      return 'Fehler: "suchen" darf nicht leer sein. Zum Neu-Anlegen dateien_schreiben nutzen.';
    }

    const auf = await oeffneZumSchreiben(roots, pfad, { erstellen: false });
    if (auf.fehler) {
      return auf.fehler;
    }
    const { handle, stat } = auf;
    try {
      if (stat.size === 0) {
        return `Fehler: Datei "${pfad}" ist leer. Zum Befüllen dateien_schreiben nutzen.`;
      }
      if (stat.size > MAX_EDIT_BYTES) {
        return `Fehler: Datei ist groesser als ${MAX_EDIT_BYTES} Bytes — Bearbeiten nicht moeglich.`;
      }
      const inhalt = await handle.readFile('utf8');
      if (Buffer.from(inhalt.slice(0, 8000), 'utf8').includes(0)) {
        return `Fehler: "${pfad}" ist eine Binärdatei und kann nicht bearbeitet werden.`;
      }

      let neuerInhalt = null;
      let stellen = 0;
      const exakt = inhalt.split(suchen).length - 1;
      if (exakt > 0) {
        stellen = exakt;
        if (exakt > 1 && !params.alle) {
          return (
            `Fehler: "suchen" kommt ${exakt}-mal in "${pfad}" vor. ` +
            'Gib mehr umgebende Zeilen mit, damit die Stelle eindeutig ist, oder setze alle=true.'
          );
        }
        neuerInhalt = params.alle
          ? inhalt.split(suchen).join(ersetzen)
          : inhalt.replace(suchen, ersetzen);
      } else {
        // Whitespace-tolerante Suche: Zeilen ohne Rand-Whitespace vergleichen.
        const norm = z => z.replace(/\s+$/g, '').replace(/^\s+/g, '');
        const dateiZeilen = inhalt.split('\n');
        const suchZeilen = suchen.replace(/\n$/, '').split('\n').map(norm);
        const treffer = [];
        for (let i = 0; i + suchZeilen.length <= dateiZeilen.length; i++) {
          let passt = true;
          for (let j = 0; j < suchZeilen.length; j++) {
            if (norm(dateiZeilen[i + j]) !== suchZeilen[j]) {
              passt = false;
              break;
            }
          }
          if (passt) {
            treffer.push(i);
          }
        }
        if (treffer.length === 0) {
          return (
            `Fehler: "suchen" wurde in "${pfad}" nicht gefunden. ` +
            'Lies die Stelle zuerst mit dateien_lesen und kopiere den Text EXAKT (gleiche Einrückung, gleiche Zeilen).'
          );
        }
        if (treffer.length > 1 && !params.alle) {
          return (
            `Fehler: "suchen" passt (Whitespace-tolerant) auf ${treffer.length} Stellen in "${pfad}". ` +
            'Gib mehr umgebende Zeilen mit oder setze alle=true.'
          );
        }
        stellen = params.alle ? treffer.length : 1;
        const ersetzZeilen = ersetzen === '' ? [] : ersetzen.replace(/\n$/, '').split('\n');
        // Von hinten ersetzen, damit frühere Indizes gültig bleiben.
        const ziele = params.alle ? treffer.reverse() : [treffer[0]];
        for (const start of ziele) {
          dateiZeilen.splice(start, suchZeilen.length, ...ersetzZeilen);
        }
        neuerInhalt = dateiZeilen.join('\n');
      }

      if (Buffer.byteLength(neuerInhalt, 'utf8') > MAX_EDIT_BYTES) {
        return `Fehler: Ergebnis ueberschreitet das Limit von ${MAX_EDIT_BYTES} Bytes.`;
      }
      await handle.truncate(0);
      await handle.write(neuerInhalt, 0, 'utf8');
      const altZeilen = suchen.split('\n').length;
      const neuZeilen = ersetzen === '' ? 0 : ersetzen.split('\n').length;
      return (
        `Datei "${pfad}" geändert: ${stellen} Stelle${stellen === 1 ? '' : 'n'} ersetzt ` +
        `(-${altZeilen}/+${neuZeilen} Zeilen je Stelle, jetzt ${Buffer.byteLength(neuerInhalt, 'utf8')} Bytes).`
      );
    } catch (err) {
      return `Fehler beim Bearbeiten: ${err.message}`;
    } finally {
      await handle.close().catch(() => {});
    }
  }
}

class DateienAnhaengenTool extends BaseTool {
  get name() {
    return 'dateien_anhaengen';
  }

  get description() {
    return (
      'Hängt Text ans ENDE einer Datei an (legt sie bei Bedarf an) — ' +
      'damit entstehen lange Dokumente abschnittsweise, Sektion für Sektion'
    );
  }

  get parameters() {
    return {
      pfad: {
        type: 'string',
        description: 'Pfad der Zieldatei relativ zum Arbeitsverzeichnis',
        required: true,
      },
      inhalt: {
        type: 'string',
        description: 'Der anzuhängende Abschnitt (er wird unverändert ans Dateiende gesetzt)',
        required: true,
      },
    };
  }

  async execute(params = {}, context = {}) {
    const roots = rootsFrom(context);
    if (!roots) {
      return 'Fehler: Für diesen Flow ist kein erlaubter Ordner hinterlegt.';
    }
    const pfad = params.pfad;
    if (!pfad) {
      return 'Fehler: "pfad" ist erforderlich.';
    }
    const data = params.inhalt == null ? '' : String(params.inhalt);
    if (!data) {
      return 'Fehler: "inhalt" darf nicht leer sein.';
    }
    if (Buffer.byteLength(data, 'utf8') > MAX_WRITE_BYTES) {
      return `Fehler: Abschnitt ueberschreitet das Limit von ${MAX_WRITE_BYTES} Bytes je Aufruf.`;
    }

    const auf = await oeffneZumSchreiben(roots, pfad);
    if (auf.fehler) {
      return auf.fehler;
    }
    const { handle, stat } = auf;
    try {
      if (stat.size + Buffer.byteLength(data, 'utf8') > MAX_APPEND_TOTAL) {
        return `Fehler: Zieldatei wuerde ${MAX_APPEND_TOTAL} Bytes ueberschreiten.`;
      }
      await handle.write(data, stat.size, 'utf8');
      const gesamt = stat.size + Buffer.byteLength(data, 'utf8');
      return (
        `Abschnitt an "${pfad}" angehängt (${Buffer.byteLength(data, 'utf8')} Bytes, ` +
        `Datei jetzt ${gesamt} Bytes).`
      );
    } catch (err) {
      return `Fehler beim Anhängen: ${err.message}`;
    } finally {
      await handle.close().catch(() => {});
    }
  }
}

module.exports = {
  DateienLesenTool,
  DateienSchreibenTool,
  DateienBearbeitenTool,
  DateienAnhaengenTool,
};
