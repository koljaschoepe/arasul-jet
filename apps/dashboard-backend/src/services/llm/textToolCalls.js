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
const PARAM_RE = /<parameter=([\w.-]+)>\r?\n?([\s\S]*?)\r?\n?<\/parameter>/g;
const JSON_CALL_RE = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
// Verwaiste Hüll-Tags, die nach dem Herausschneiden übrig bleiben können.
const REST_TAGS_RE = /<\/?tool_call>/g;

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
      args[m[1]] = m[2];
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

module.exports = { parseTextToolCalls, enthaeltToolSyntax };
