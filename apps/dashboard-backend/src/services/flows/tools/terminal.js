/**
 * Flow-Werkzeug `terminal` (Plan 011, Schritt 7).
 *
 * Führt einen Shell-Befehl per `docker exec` im Sandbox-Container aus.
 * Arbeitsverzeichnis ist der Haupt-Ordner des Flows.
 *
 * KEINE Befehls-Positivliste. Das ist eine bewusste Entscheidung (§7, §8): Der
 * Nutzer will Flows, die wie ein Coding-Agent arbeiten — eine Liste erlaubter
 * Binärdateien wäre entweder zu eng (der Flow ist nutzlos) oder so weit, dass
 * sie nur noch Sicherheit vortäuscht (`bash -c` steht ohnehin darin). Die
 * Grenze ist stattdessen der Container: eingehängt sind nur die Ordner des
 * Flows, alle Capabilities sind entzogen, Speicher und Prozesszahl sind
 * gedeckelt. Ein Fehlgriff zerstört Dateien im erlaubten Ordner — das ist der
 * akzeptierte Preis, und die Änderungs-Übersicht (Schritt 16) zeigt ihn.
 *
 * Der Container-Name kommt vom AUFRUFER (`context.containerId`). Das Werkzeug
 * löst ihn nicht selbst auf — sonst entschiede das Werkzeug, wo es ausgeführt
 * wird, und die Ordner-Beschränkung läge in derselben Hand wie ihre Umgehung.
 */

const BaseTool = require('../../../tools/baseTool');
const logger = require('../../../utils/logger');

/**
 * Docker BEWUSST erst beim Aufruf laden, nicht beim Import.
 *
 * `services/core/docker` baut den Client schon beim Laden des Moduls auf. Die
 * Werkzeug-Registry wird aber überall dort geladen, wo nur die LISTE der
 * Werkzeuge gebraucht wird — etwa im Slash-Menü. Dort eine Docker-Verbindung
 * aufzumachen, wäre eine Nebenwirkung des Importierens: unnötig im Betrieb und
 * im Test ein Prozess, der nicht mehr sauber endet.
 */
function getDocker() {
  return require('../../core/docker').docker;
}

/** Ausgabe-Deckel: Kontext-Schutz, nicht Speicher-Schutz. */
const MAX_OUTPUT_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_S = 120;
const MAX_TIMEOUT_S = 900;
const MAX_COMMAND_LEN = 4000;

class TerminalTool extends BaseTool {
  get name() {
    return 'terminal';
  }

  get description() {
    return 'Führt einen Shell-Befehl im Sandbox-Container aus (Arbeitsverzeichnis = Haupt-Ordner des Flows)';
  }

  get parameters() {
    return {
      befehl: {
        type: 'string',
        description: 'Der auszuführende Shell-Befehl, z. B. "ls -la" oder "python3 auswertung.py"',
        required: true,
      },
    };
  }

  /**
   * @param {{befehl?:string}} params
   * @param {{containerId?:string, cwd?:string, timeoutS?:number, signal?:AbortSignal}} context
   *   `containerId` und `cwd` liefert der Aufrufer (services/flows/sandboxResolve.js).
   *   `signal` ist das Abbruch-Signal des Laufs (Plan 023 E2).
   */
  async execute(params = {}, context = {}) {
    const befehl = String(params.befehl || '').trim();
    if (!befehl) {
      return 'Fehler: "befehl" darf nicht leer sein.';
    }
    if (befehl.length > MAX_COMMAND_LEN) {
      return `Fehler: Befehl ist länger als ${MAX_COMMAND_LEN} Zeichen.`;
    }
    if (!context.containerId) {
      return 'Fehler: Für diesen Lauf wurde kein Sandbox-Container bereitgestellt, Terminalbefehle sind nicht möglich.';
    }
    if (!context.cwd) {
      return 'Fehler: Für diesen Flow ist kein Arbeitsverzeichnis hinterlegt.';
    }

    let timeoutS = Number.parseInt(context.timeoutS, 10);
    if (!Number.isFinite(timeoutS) || timeoutS < 1) {
      timeoutS = DEFAULT_TIMEOUT_S;
    }
    timeoutS = Math.min(timeoutS, MAX_TIMEOUT_S);

    // Das Zeitlimit setzt `timeout` IM Container durch, nicht der Aufrufer.
    // Würde nur hier gewartet, liefe der Befehl im Container einfach weiter —
    // eine Endlosschleife bliebe für immer stehen. `-k` schiebt nach der
    // Gnadenfrist ein KILL nach, falls der Prozess TERM ignoriert.
    const cmd = ['timeout', '-k', '5s', `${timeoutS}s`, '/bin/bash', '-lc', befehl];

    let exec;
    try {
      exec = await getDocker().getContainer(context.containerId).exec({
        Cmd: cmd,
        WorkingDir: context.cwd,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });
    } catch (err) {
      if (err.statusCode === 404) {
        return 'Fehler: Der Sandbox-Container existiert nicht mehr, bitte den Flow erneut starten.';
      }
      logger.warn(`terminal: exec konnte nicht angelegt werden: ${err.message}`);
      return `Fehler beim Ausführen: ${err.message}`;
    }

    let ausgabe;
    try {
      ausgabe = await this._sammleAusgabe(exec, timeoutS, context.signal);
    } catch (err) {
      logger.warn(`terminal: Ausführung fehlgeschlagen: ${err.message}`);
      return `Fehler beim Ausführen: ${err.message}`;
    }

    let code = null;
    try {
      code = (await exec.inspect()).ExitCode;
    } catch {
      // Exit-Code nicht ermittelbar — die Ausgabe ist trotzdem gültig.
    }

    // Plan 023 E2: Der Stopp-Knopf soll in unter zwei Sekunden greifen. Ein
    // Terminalbefehl darf bis zu MAX_TIMEOUT_S laufen, und ohne diese Stelle
    // wartete der Lauf darauf, bevor er den Abbruch bemerkte.
    //
    // Ehrlich benannt: beendet wird hier das ZUHOEREN, nicht der Prozess. Der
    // Befehl laeuft im Container weiter, bis das `timeout` davor ihn beendet.
    // Ihn selbst zu toeten hiesse, im Container nach seiner Prozessnummer zu
    // suchen, und das waere ein zweiter Eingriff mit eigenen Fehlerquellen.
    if (ausgabe.abgebrochen) {
      const teil = ausgabe.text.trim();
      return teil
        ? `Abgebrochen: Der Lauf wurde gestoppt.\n${teil}`
        : 'Abgebrochen: Der Lauf wurde gestoppt.';
    }

    const kopf =
      code === 124 || code === 137
        ? `Abgebrochen: Zeitlimit von ${timeoutS}s erreicht.`
        : `Exit-Code: ${code === null ? 'unbekannt' : code}`;
    const text = ausgabe.text.trim();
    const gekuerzt = ausgabe.truncated
      ? `\n... [Ausgabe gekuerzt bei ${MAX_OUTPUT_BYTES} Bytes]`
      : '';

    return text ? `${kopf}\n${text}${gekuerzt}` : `${kopf}\n(keine Ausgabe)`;
  }

  /**
   * Liest den exec-Strom bis zum Ende und deckelt ihn bei MAX_OUTPUT_BYTES.
   *
   * stdout und stderr laufen bewusst in EINEN Text zusammen: Ein Modell, das
   * einen Befehl absetzt, braucht die Fehlermeldung genauso wie das Ergebnis —
   * getrennt zu liefern hieße, dass es die Hälfte übersieht.
   */
  async _sammleAusgabe(exec, timeoutS, signal = null) {
    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve, reject) => {
      const stuecke = [];
      let bytes = 0;
      let truncated = false;
      let fertig = false;

      const abschluss = (abgebrochen = false) => {
        if (fertig) {
          return;
        }
        fertig = true;
        clearTimeout(wecker);
        signal?.removeEventListener?.('abort', aufAbbruch);
        stream.destroy();
        resolve({ text: Buffer.concat(stuecke).toString('utf8'), truncated, abgebrochen });
      };
      // Was bis zum Abbruch schon da war, geht nicht verloren: der Nutzer soll
      // sehen, wie weit der Befehl gekommen ist.
      const aufAbbruch = () => abschluss(true);
      if (signal?.aborted) {
        setImmediate(aufAbbruch);
      } else {
        signal?.addEventListener?.('abort', aufAbbruch, { once: true });
      }

      // Notbremse: `timeout` im Container beendet den Prozess; falls der Strom
      // trotzdem offen bleibt (Container weg, Verbindung hängt), wird hier
      // zugemacht, statt den Lauf blockieren zu lassen.
      const wecker = setTimeout(() => abschluss(false), (timeoutS + 15) * 1000);
      // Der Wecker darf den Prozess nicht am Leben halten — er ist eine
      // Notbremse, kein Grund weiterzulaufen. (Im Server hält ohnehin der
      // HTTP-Listener die Ereignisschleife offen.)
      wecker.unref?.();

      const aufnehmen = chunk => {
        if (truncated) {
          return;
        }
        const rest = MAX_OUTPUT_BYTES - bytes;
        if (chunk.length >= rest) {
          stuecke.push(chunk.subarray(0, rest));
          bytes = MAX_OUTPUT_BYTES;
          truncated = true;
          return;
        }
        stuecke.push(chunk);
        bytes += chunk.length;
      };

      // Ohne TTY liefert Docker einen gemultiplexten Strom (8-Byte-Kopf je
      // Block). `demuxStream` trennt ihn; beide Seiten landen im selben Puffer.
      const senke = { write: aufnehmen, end: () => {} };
      getDocker().modem.demuxStream(stream, senke, senke);

      // Ausdruecklich ohne Weiterreichen des Ereignis-Arguments: `close`
      // liefert bei Node einen Wahrheitswert mit, der sonst als "abgebrochen"
      // durchginge.
      stream.on('end', () => abschluss(false));
      stream.on('close', () => abschluss(false));
      stream.on('error', err => {
        if (fertig) {
          return;
        }
        fertig = true;
        clearTimeout(wecker);
        signal?.removeEventListener?.('abort', aufAbbruch);
        reject(err);
      });
    });
  }
}

module.exports = TerminalTool;
module.exports.MAX_OUTPUT_BYTES = MAX_OUTPUT_BYTES;
