/**
 * Agent tool: `dateien` — read/list/write files inside the agent's workspace.
 *
 * Every path is jailed to the workspace's on-disk `host_path` (the same files
 * the `terminal` tool sees). Reads and writes are size-capped. The tool never
 * throws into the run loop — failures come back as concise text so the model
 * can react.
 */

const fs = require('fs').promises;
const path = require('path');
const BaseTool = require('../../../tools/baseTool');
const logger = require('../../../utils/logger');
const { resolveRealWithin } = require('../pathSafe');
const { indexWorkspaceFile } = require('../workspaceIndexer');

const MAX_READ_BYTES = 256 * 1024; // 256 KB
const MAX_WRITE_BYTES = 1024 * 1024; // 1 MB
const MAX_LIST_ENTRIES = 500;

class FilesTool extends BaseTool {
  get name() {
    return 'dateien';
  }

  get description() {
    return 'Dateien im Workspace auflisten (list), lesen (read) oder schreiben (write)';
  }

  get parameters() {
    return {
      aktion: {
        type: 'string',
        description: 'list, read oder write',
        enum: ['list', 'read', 'write'],
        required: true,
      },
      pfad: {
        type: 'string',
        description: 'Pfad relativ zum Workspace (bei list optional, Standard = Wurzel)',
        required: false,
      },
      inhalt: {
        type: 'string',
        description: 'Neuer Dateiinhalt (nur bei aktion=write)',
        required: false,
      },
    };
  }

  /**
   * @param {{aktion:string, pfad?:string, inhalt?:string}} params
   * @param {{hostPath:string}} context
   */
  async execute(params = {}, context = {}) {
    const hostPath = context.hostPath;
    if (!hostPath) {
      return 'Fehler: Kein Workspace-Pfad im Kontext.';
    }
    const aktion = String(params.aktion || '').toLowerCase();

    switch (aktion) {
      case 'list':
        return this._list(hostPath, params.pfad);
      case 'read':
        return this._read(hostPath, params.pfad);
      case 'write':
        return this._write(hostPath, params.pfad, params.inhalt, context);
      default:
        return `Fehler: Unbekannte aktion "${params.aktion}". Erlaubt: list, read, write.`;
    }
  }

  async _list(hostPath, pfad) {
    let dir;
    try {
      dir = resolveRealWithin(hostPath, pfad || '.');
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

  async _read(hostPath, pfad) {
    if (!pfad) {
      return 'Fehler: "pfad" ist zum Lesen erforderlich.';
    }
    let file;
    try {
      file = resolveRealWithin(hostPath, pfad);
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
    if (Buffer.byteLength(content, 'utf8') > MAX_READ_BYTES) {
      const truncated = content.slice(0, MAX_READ_BYTES);
      return `${truncated}\n... [gekuerzt bei ${MAX_READ_BYTES} Bytes]`;
    }
    return content;
  }

  async _write(hostPath, pfad, inhalt, context = {}) {
    if (!pfad) {
      return 'Fehler: "pfad" ist zum Schreiben erforderlich.';
    }
    const data = inhalt == null ? '' : String(inhalt);
    if (Buffer.byteLength(data, 'utf8') > MAX_WRITE_BYTES) {
      return `Fehler: Inhalt ueberschreitet das Limit von ${MAX_WRITE_BYTES} Bytes.`;
    }
    let file;
    try {
      file = resolveRealWithin(hostPath, pfad);
    } catch (err) {
      return `Fehler: ${err.message}`;
    }
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, data, 'utf8');
    } catch (err) {
      return `Fehler beim Schreiben: ${err.message}`;
    }

    // Plan 008 Schritt 13: geschriebene Datei OHNE manuellen Upload per RAG
    // auffindbar machen. Best effort — ein Indexierungsfehler darf den Schreib-
    // vorgang NIEMALS scheitern lassen (nur loggen). Nur wenn der Workspace einen
    // Wissensraum hat (context.spaceId), wird gescopt indexiert.
    if (context.spaceId) {
      try {
        await indexWorkspaceFile({
          workspace: {
            space_id: context.spaceId,
            slug: context.slug,
            host_path: hostPath,
          },
          relPath: pfad,
          absPath: file,
        });
      } catch (err) {
        logger.warn(
          `dateien-Werkzeug: RAG-Indexierung von "${pfad}" fehlgeschlagen: ${err.message}`
        );
      }
    }

    return `Datei "${pfad}" geschrieben (${Buffer.byteLength(data, 'utf8')} Bytes).`;
  }
}

module.exports = FilesTool;
