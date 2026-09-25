/**
 * Die Ausgabe eines `docker exec` als lesbarer Text (J35, 25.09.2026).
 *
 * Ohne Terminal (`Tty: false`, und so ruft das Backend jedes Skript auf)
 * mischt Docker stdout und stderr in EINEN Strom und stellt jedem Block einen
 * Vorspann von acht Byte voran: ein Byte Stream-Kennung (0 stdin, 1 stdout,
 * 2 stderr), drei Nullbytes und die Laenge des Blocks als 32-Bit-Zahl,
 * Big-Endian. Bis J35 warf `sicherungsdienst` davon nur die Steuerzeichen weg
 * -- die Laenge aber ist fast immer ein DRUCKBARES Byte: eine Zeile von 65
 * Byte beginnt mit `A`, eine von 42 mit `*`, eine von mehr als 127 mit einem
 * kaputten UTF-8-Zeichen. Der Installationsdurchlauf am Orin zeigte genau das:
 * vor jeder Zeile von Sicherung und Rueckspielen ein fremdes Zeichen, denn
 * jedes `echo` der Skripte ist ein eigener Block.
 *
 * Deshalb wird hier ENTFLOCHTEN statt gefiltert: Vorspann lesen, genau so
 * viele Nutzbytes nehmen, wie er nennt -- auch wenn ein Block ueber zwei
 * `data`-Ereignisse reicht oder ein Ereignis mehrere Bloecke traegt. Dekodiert
 * wird erst am Ende, damit ein UTF-8-Zeichen, das ueber eine Blockgrenze
 * faellt, ganz bleibt.
 *
 * Laeuft ein Aufruf doch mit Terminal (dann gibt es keinen Vorspann), erkennt
 * der Entflechter das am ersten Block und reicht den Strom roh durch. Danach
 * fallen ANSI-Farbfolgen und die uebrigen Steuerzeichen, denn gelesen wird
 * das in einer Oberflaeche und einem JSON-Protokoll, nie in einem Terminal.
 */

const VORSPANN = 8;
const ESC = String.fromCharCode(27);
// CSI-Folgen (Farben, Cursor) und OSC-Folgen (Fenstertitel), wie sie
// `ls --color`, `tput` oder ein Fortschrittsbalken schreiben.
const ANSI = new RegExp(
  `${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${String.fromCharCode(7)}${ESC}]*(?:${String.fromCharCode(7)}|${ESC}\\\\)`,
  'g'
);

/**
 * Steuerzeichen raus, Zeilenumbrueche und Tabulatoren bleiben; ANSI-Folgen
 * fallen als Ganzes (sonst bliebe von `ESC[31m` ein `[31m` stehen).
 *
 * @param {string} text
 * @returns {string}
 */
function ohneSteuerzeichen(text) {
  return Array.from(text.replace(ANSI, ''))
    .filter(zeichen => {
      const nummer = zeichen.codePointAt(0);
      return (nummer > 31 && nummer !== 127) || nummer === 9 || nummer === 10;
    })
    .join('');
}

/**
 * Kann der Anfang von `puffer` ein Vorspann des Docker-Stroms sein? Geprueft
 * werden die Bytes, die da sind (hoechstens die ersten vier) -- so laesst
 * sich auch ein angefangener Vorspann beurteilen.
 */
function kannVorspannSein(puffer) {
  if (puffer.length === 0 || puffer[0] > 2) {
    return false;
  }
  for (let i = 1; i < Math.min(4, puffer.length); i++) {
    if (puffer[i] !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Ein Entflechter fuer EINEN Strom. `schreibe` nimmt jedes `data`-Stueck,
 * `text` gibt am Ende die Nutzdaten als bereinigten Text.
 *
 * `grenze` haelt den Speicher: ein Rueckspielen kann eine Stunde laufen, und
 * gebraucht wird nur das Ende (der Aufrufer kuerzt ohnehin auf 4000 Zeichen).
 *
 * @param {{ grenze?: number }} [optionen]
 */
function entflechter({ grenze = 64 * 1024 } = {}) {
  let rest = Buffer.alloc(0); // noch nicht zugeordnete Bytes
  let offen = 0; // Nutzbytes, die dem laufenden Block noch fehlen
  let roh = null; // null: noch unentschieden; true: kein Vorspann (Tty)
  const teile = [];
  let summe = 0;

  function behalte(stueck) {
    if (stueck.length === 0) {
      return;
    }
    teile.push(stueck);
    summe += stueck.length;
    while (summe - teile[0].length >= grenze) {
      summe -= teile.shift().length;
    }
  }

  function schreibe(stueck) {
    const neu = Buffer.isBuffer(stueck) ? stueck : Buffer.from(String(stueck), 'utf8');
    if (roh === true) {
      behalte(neu);
      return;
    }
    rest = rest.length ? Buffer.concat([rest, neu]) : neu;

    while (rest.length > 0) {
      if (offen > 0) {
        const n = Math.min(offen, rest.length);
        behalte(rest.subarray(0, n));
        rest = rest.subarray(n);
        offen -= n;
        continue;
      }
      // Kein Vorspann, wo einer stehen muesste: entweder ein Strom mit
      // Terminal (dann schon am ersten Block), oder einer, der nicht ist,
      // wofuer er sich ausgab. Ab hier roh, statt Bytes zu verschlucken.
      if (!kannVorspannSein(rest)) {
        break;
      }
      if (rest.length < VORSPANN) {
        return;
      } // der Rest des Vorspanns kommt noch
      roh = false;
      offen = rest.readUInt32BE(4);
      rest = rest.subarray(VORSPANN);
    }

    if (rest.length > 0) {
      roh = true;
      behalte(rest);
      rest = Buffer.alloc(0);
    }
  }

  function text() {
    // Ein Rest am Ende ist ein abgerissener Vorspann oder ein kurzer
    // Tty-Strom; im ersten Fall ist er kein Text, im zweiten schon.
    if (roh !== false) {
      behalte(rest);
    }
    rest = Buffer.alloc(0);
    return ohneSteuerzeichen(Buffer.concat(teile).toString('utf8'));
  }

  return { schreibe, text };
}

module.exports = { entflechter, ohneSteuerzeichen };
