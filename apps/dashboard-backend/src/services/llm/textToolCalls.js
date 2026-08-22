/**
 * Fallback-Parser für Werkzeug-Aufrufe, die das Modell als TEXT ausgibt.
 *
 * qwen3-coder & Co. schreiben Tool-Calls in einem XML-Dialekt
 * (`<function=name><parameter=key>wert</parameter></function>`, umhüllt von
 * `<tool_call>…</tool_call>`). Fehlt das öffnende `<tool_call>`-Tag — ein
 * häufiger Ausrutscher kleiner Modelle — erkennt Ollamas Template-Parser den
 * Aufruf nicht und der komplette Block landet als content im Stream. Ohne
 * Fallback bricht der Agent-Lauf dann ab und der Nutzer sieht rohes XML.
 *
 * Dieses Modul zieht solche Aufrufe nachträglich aus dem Text: als
 * strukturierte tool_calls (Ollama-Form) plus den vom XML befreiten Resttext.
 * Zusätzlich wird die JSON-Variante `<tool_call>{"name":…,"arguments":…}</tool_call>`
 * unterstützt (qwen3-Standardformat).
 */

const FUNC_RE = /<function=([\w.-]+)>([\s\S]*?)<\/function>/g;
const PARAM_RE = /<parameter=([\w.-]+)>([\s\S]*?)<\/parameter>/g;
const JSON_CALL_RE = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
// Verwaiste Hüll-Tags, die nach dem Herausschneiden übrig bleiben können.
const REST_TAGS_RE = /<\/?tool_call>/g;

/**
 * Nimmt einem Parameterwert die Formatierung, nicht den Inhalt (Plan 023 E9).
 *
 * Das Modell schreibt denselben Aufruf mal ueber mehrere Zeilen und mal in
 * einer, und beide Formen tragen Fuellzeichen, die nicht zum Wert gehoeren:
 *
 *   <parameter=pfad>\nnotiz.md\n</parameter>   ergab bisher "notiz.md"
 *   <parameter=pfad> notiz.md </parameter>     ergab bisher " notiz.md "
 *
 * Am 22.08.2026 auf dem Orin gemessen: die zweite Form kommt vor. Ein Pfad mit
 * fuehrendem Leerzeichen ist kein Pfad, und der Fehler faellt erst auf, wenn
 * die Datei fehlt oder falsch heisst.
 *
 * Weggenommen wird deshalb genau EIN Zeilenumbruch mit den Leerzeichen davor
 * und danach, an jedem Ende. Mehr nicht: der Inhalt einer Datei darf mit einer
 * Leerzeile enden, wenn er das soll, und das Innere bleibt unberuehrt.
 */
function wertBereinigen(roh) {
  return String(roh ?? '')
    .replace(/^[ \t]*\r?\n?/, '')
    .replace(/\r?\n?[ \t]*$/, '');
}

/** Grobe Vorprüfung: sieht der Text überhaupt nach Tool-Syntax aus? */
function enthaeltToolSyntax(text) {
  const s = String(text || '');
  return s.includes('<function=') || s.includes('<tool_call>') || s.includes('</tool_call>');
}

/**
 * Zieht als Text ausgegebene Werkzeug-Aufrufe aus `content`.
 *
 * @param {string} content - Modell-Antwort einer Runde
 * @returns {{calls: Array<{function:{name:string, arguments:object}}>, rest: string, hatSyntax: boolean}}
 *   calls: erkannte Aufrufe in Ollama-Form (arguments als Objekt) ·
 *   rest: content ohne die erkannten Blöcke und ohne verwaiste Hüll-Tags ·
 *   hatSyntax: true, wenn Tool-Syntax vorkam (auch wenn nichts parsebar war)
 */
function parseTextToolCalls(content) {
  const text = String(content || '');
  const hatSyntax = enthaeltToolSyntax(text);
  if (!hatSyntax) {
    return { calls: [], rest: text, hatSyntax: false };
  }

  const calls = [];
  let rest = text;

  // Variante 1: XML-Dialekt <function=name><parameter=…>…</parameter></function>
  rest = rest.replace(FUNC_RE, (_ganz, name, innen) => {
    const args = {};
    let m;
    PARAM_RE.lastIndex = 0;
    while ((m = PARAM_RE.exec(innen)) !== null) {
      args[m[1]] = wertBereinigen(m[2]);
    }
    calls.push({ function: { name, arguments: args } });
    return '';
  });

  // Variante 2: JSON im tool_call-Tag {"name": "...", "arguments": {...}}
  rest = rest.replace(JSON_CALL_RE, (ganz, json) => {
    try {
      const obj = JSON.parse(json);
      if (obj && typeof obj.name === 'string') {
        const args =
          obj.arguments && typeof obj.arguments === 'object' && !Array.isArray(obj.arguments)
            ? obj.arguments
            : {};
        calls.push({ function: { name: obj.name, arguments: args } });
        return '';
      }
    } catch {
      // kein gültiges JSON — Block unangetastet lassen (hatSyntax bleibt true)
    }
    return ganz;
  });

  rest = rest.replace(REST_TAGS_RE, '').trim();
  return { calls, rest, hatSyntax };
}

/**
 * Haelt Werkzeug-Syntax aus dem laufenden Strom heraus (Plan 023 E9).
 *
 * Der Nachparser weiter oben raeumt den Text der RUNDE auf. Er kommt aber zu
 * spaet fuer das, was der Nutzer sieht: `onToken` hat jedes Stueck laengst
 * durchgereicht. Am 22.08.2026 auf dem Orin stand deshalb im Chat:
 *
 *   Ich erstelle nun die Datei `notiz.md` mit dem gewuenschten Inhalt.
 *   <function=dateien_schreiben> <parameter=pfad> notiz.md </parameter> ...
 *
 * Dieser Filter sitzt zwischen Strom und Anzeige. Er haelt Text ab dem Moment
 * zurueck, in dem er der Anfang einer Marke sein KOENNTE, und gibt ihn wieder
 * frei, sobald feststeht, dass es keine war. Bestaetigt sich die Marke, wird
 * bis zum schliessenden Tag geschluckt.
 *
 * Warum ein Zeichenautomat und keine einfache Ersetzung: der Strom kommt in
 * Bloecken, und eine Marke wird regelmaessig mitten durchgeschnitten. Wer erst
 * am Blockende prueft, hat `<function=` schon zur Haelfte ausgeliefert.
 */
const MARKEN = ['<function=', '<tool_call>'];
const ENDEN = ['</function>', '</tool_call>'];
/**
 * Verwaiste Schluss-Tags. Sie kommen vor, wenn das Modell den Aufruf ohne
 * oeffnendes `<tool_call>` schreibt und trotzdem mit dem passenden Schluss
 * beendet. Genau so stand es am 22.08.2026 im Chat auf dem Orin. Sie sind nie
 * Text, also fallen sie ersatzlos weg, ohne den Schluck-Zustand zu betreten.
 */
const VERWAIST = ENDEN;
/** Laengste Marke: so viel darf hoechstens in der Schwebe sein. */
const HALTE_MAX = Math.max(...[...MARKEN, ...VERWAIST].map(m => m.length));

class ToolSyntaxFilter {
  constructor() {
    /** Zeichen, die ein Markenanfang sein koennten und deshalb warten. */
    this.warteschlange = '';
    /** Innerhalb eines erkannten Aufrufs: alles verschlucken. */
    this.schluckt = false;
    /** Was seit dem Beginn des Schluckens gesehen wurde, fuer die Endsuche. */
    this.geschluckt = '';
    /**
     * Nach einem geschluckten Aufruf faellt genau ein Zeilenumbruch weg.
     *
     * Als Zustand und nicht als Ersetzung auf dem gerade vorliegenden Stueck:
     * der Umbruch steht oft erst im NAECHSTEN Block, und dann haenge die Zahl
     * der Leerzeilen im Chat davon ab, wie Ollama den Strom zerteilt hat.
     */
    this.frisstUmbruch = false;
  }

  /**
   * @param {string} stueck rohes Stueck aus dem Modell-Strom
   * @returns {string} was davon angezeigt werden darf (oft leer)
   */
  durch(stueck) {
    let rest = this.warteschlange + String(stueck ?? '');
    this.warteschlange = '';
    let ausgabe = '';
    if (this.frisstUmbruch && rest) {
      const vorher = rest;
      rest = rest.replace(/^[ \t]*\r?\n?/, '');
      this.frisstUmbruch = /^[ \t]*$/.test(vorher.slice(0, vorher.length - rest.length));
    }

    for (;;) {
      if (this.schluckt) {
        this.geschluckt += rest;
        rest = '';
        let gefunden = -1;
        let laenge = 0;
        for (const ende of ENDEN) {
          const i = this.geschluckt.indexOf(ende);
          if (i >= 0 && (gefunden < 0 || i < gefunden)) {
            gefunden = i;
            laenge = ende.length;
          }
        }
        if (gefunden < 0) {
          // Noch kein Ende in Sicht. Nur so viel behalten, wie fuer die
          // Endsuche noetig ist, sonst waechst der Puffer mit der Datei.
          const noetig = Math.max(...ENDEN.map(e => e.length)) - 1;
          this.geschluckt = this.geschluckt.slice(-noetig);
          break;
        }
        rest = this.geschluckt.slice(gefunden + laenge);
        this.geschluckt = '';
        this.schluckt = false;
        this.frisstUmbruch = true;
        const gekuerzt = rest.replace(/^[ \t]*\r?\n?/, '');
        if (gekuerzt !== rest) {
          this.frisstUmbruch = false;
          rest = gekuerzt;
        }
        continue;
      }

      const spitz = rest.indexOf('<');
      if (spitz < 0) {
        ausgabe += rest;
        break;
      }
      ausgabe += rest.slice(0, spitz);
      const kandidat = rest.slice(spitz);
      const marke = MARKEN.find(m => kandidat.startsWith(m));
      if (marke) {
        this.schluckt = true;
        this.geschluckt = '';
        rest = kandidat.slice(marke.length);
        continue;
      }
      const waise = VERWAIST.find(m => kandidat.startsWith(m));
      if (waise) {
        rest = kandidat.slice(waise.length);
        this.frisstUmbruch = true;
        const gekuerzt = rest.replace(/^[ \t]*\r?\n?/, '');
        if (gekuerzt !== rest) {
          this.frisstUmbruch = false;
          rest = gekuerzt;
        }
        continue;
      }
      // Koennte der Anfang einer Marke sein, ist aber noch zu kurz zum
      // Entscheiden: warten. Sonst ist es ein gewoehnliches Kleiner-Zeichen.
      if (
        kandidat.length < HALTE_MAX &&
        [...MARKEN, ...VERWAIST].some(m => m.startsWith(kandidat))
      ) {
        this.warteschlange = kandidat;
        break;
      }
      ausgabe += '<';
      rest = kandidat.slice(1);
    }

    return ausgabe;
  }

  /**
   * Was am Ende der Runde noch in der Schwebe haengt.
   *
   * Bricht die Runde mitten in einer angefangenen Marke ab, gehoert der
   * Halbsatz dem Nutzer, nicht dem Muelleimer. Ein angefangener AUFRUF dagegen
   * bleibt verschwunden: er war nie Text, sondern ein misslungener Aufruf.
   *
   * @returns {string}
   */
  rest() {
    const uebrig = this.schluckt ? '' : this.warteschlange;
    this.warteschlange = '';
    this.geschluckt = '';
    this.schluckt = false;
    this.frisstUmbruch = false;
    return uebrig;
  }
}

module.exports = { parseTextToolCalls, enthaeltToolSyntax, ToolSyntaxFilter, wertBereinigen };
