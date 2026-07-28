/**
 * Deterministischer Schritt-Executor (Plan 013, B7).
 *
 * Wenn ein Flow eine `schritte`-Kette deklariert, entscheidet NICHT mehr das
 * Orchestrator-Modell, wann es an welche Rolle delegiert — der Executor führt
 * die Schritte in FESTER Reihenfolge aus:
 *
 *   1. Für jeden Schritt die Vorlagen einsetzen ({{argument}} plus {{name}} für
 *      die Ausgaben früherer Schritte und {{vorher}}/{{iteration}} innerhalb
 *      einer Wiederholung).
 *   2. `subagent`-Schritt → an die deklarierte Rolle delegieren (dasselbe
 *      SubagentTool wie im modellgetriebenen Pfad: eigene Werkzeug-Schleife,
 *      Ergebnis-Vertrag, Protokoll-Schritt mit Rohdaten). Innerhalb des Schritts
 *      darf das Rollen-Modell iterieren.
 *   3. `werkzeug`-Schritt → EIN Werkzeug direkt aufrufen (kein Modell).
 *   4. Danach synthetisiert der Rumpf-Prompt die Antwort AUS den gesammelten
 *      Schritt-Ausgaben (ein letzter Modell-Aufruf, ohne Werkzeuge).
 *
 * Der Executor gibt dasselbe `{ result, error, aborted }` zurück wie
 * `runFlowLoop`, damit der Runner (runFlow.js) seinen Abschluss-Pfad unverändert
 * lässt. Die Schritt-Persistenz läuft über dieselben Hilfen wie der
 * modellgetriebene Pfad (`stepRecorder` im Kontext, `recordWerkzeug` als
 * Parameter) — die Lauf-Karte im Frontend zeigt beide Pfade identisch.
 */

const { fillPlaceholders } = require('./flowFile');
const { runFlowLoop } = require('./toolLoop');
const SubagentTool = require('./subagent');

/**
 * Setzt Vorlagen in den `parameter`-Werten eines Werkzeug-Schritts ein.
 * Nur String-Werte werden ersetzt; Zahlen/Booleans bleiben unangetastet.
 */
function resolveParams(parameter = {}, scope = {}) {
  const out = {};
  for (const [key, value] of Object.entries(parameter)) {
    out[key] = typeof value === 'string' ? fillPlaceholders(value, scope) : value;
  }
  return out;
}

/** Baut den Synthese-Block aus den gesammelten Schritt-Ausgaben. */
function buildSynthesisInput(userInput, schritte, outputs) {
  const bloecke = schritte.map(
    s => `## Schritt „${s.name}"\n${outputs[s.name] ?? '(keine Ausgabe)'}`
  );
  return `${userInput}\n\n--- Ergebnisse der Schritte (in Reihenfolge) ---\n${bloecke.join('\n\n')}`;
}

/**
 * Führt die deklarierte Schritt-Kette aus und synthetisiert die Antwort.
 *
 * @param {object} p
 * @param {object} p.flow - validierte Flow-Definition (mit `schritte`).
 * @param {object} p.werte - eingesetzte Argumentwerte (name → Wert).
 * @param {string} p.userInput - die zusammengebaute Nutzer-Eingabe.
 * @param {string} p.model - aufgelöstes Modell.
 * @param {object} p.context - der volle Runner-Kontext (rollen, limits, depth 0,
 *   stepRecorder, roleContextBase, …) — identisch zum modellgetriebenen Pfad.
 * @param {(names:string[])=>object[]} p.makeTools - buildTools.
 * @param {Function} [p.runLoop] - runFlowLoop (für Tests austauschbar).
 * @param {Function} p.recordWerkzeug - persistiert + führt einen Werkzeug-Schritt aus,
 *   liefert die Werkzeug-Ausgabe (String).
 * @param {(evt:object)=>void} [p.emitLive] - Live-Sink (roher onEvent des Laufs).
 * @param {AbortSignal} [p.signal]
 * @param {new()=>object} [p.SubagentToolClass] - für Tests austauschbar.
 * @returns {Promise<{result:string|null, error?:string, aborted?:boolean}>}
 */
async function executeSteps({
  flow,
  werte,
  userInput,
  model,
  context,
  makeTools,
  runLoop = runFlowLoop,
  recordWerkzeug,
  emitLive,
  signal,
  SubagentToolClass = SubagentTool,
}) {
  const subagentTool = new SubagentToolClass();
  const outputs = {};

  for (const schritt of flow.schritte) {
    if (signal && signal.aborted) {
      return { result: null, aborted: true };
    }
    const iterationen = schritt.iterationen || 1;
    let ausgabe = '';

    for (let i = 1; i <= iterationen; i++) {
      const scope = { ...werte, ...outputs, vorher: ausgabe, iteration: String(i) };
      try {
        if (schritt.typ === 'subagent') {
          const auftrag = fillPlaceholders(schritt.auftrag, scope);
          // SubagentTool schreibt den DB-Schritt (samt Kind-Schritten und
          // Rohdaten) über context.stepRecorder selbst und meldet ihn live —
          // hier keine eigene Meldung, sonst stünde die Delegation doppelt.
          ausgabe = await subagentTool.execute(
            { rolle: schritt.rolle, auftrag },
            { ...context, signal }
          );
        } else {
          const params = resolveParams(schritt.parameter, scope);
          ausgabe = await recordWerkzeug({ werkzeug: schritt.werkzeug, params });
        }
      } catch (err) {
        return { result: null, error: `Schritt „${schritt.name}" fehlgeschlagen: ${err.message}` };
      }
      if (signal && signal.aborted) {
        return { result: null, aborted: true };
      }
    }

    outputs[schritt.name] = ausgabe;
  }

  // Synthese: der Rumpf-Prompt schreibt die Antwort aus den Schritt-Ausgaben.
  // Bewusst OHNE Werkzeuge und mit einer Runde — das Sammeln ist deterministisch
  // schon geschehen, hier wird nur noch formuliert.
  const systemPrompt = fillPlaceholders(flow.systemPrompt, werte);
  const synthInput = buildSynthesisInput(userInput, flow.schritte, outputs);

  return runLoop({
    model,
    systemPrompt,
    userInput: synthInput,
    tools: makeTools([]),
    maxRunden: 1,
    zeitlimitS: flow.grenzen.zeitlimit_s,
    context: { ...context, signal },
    signal,
    onEvent: emitLive,
  });
}

module.exports = { executeSteps, resolveParams, buildSynthesisInput };
