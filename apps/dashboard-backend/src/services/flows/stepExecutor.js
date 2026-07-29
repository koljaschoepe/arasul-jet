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
const logger = require('../../utils/logger');

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

/**
 * Bildet die Schritte eines ALTEN, fehlgeschlagenen Laufs auf die deklarierte
 * Schritt-Kette ab: welche Ketten-Schritte waren vollständig erfolgreich, und
 * mit welcher Ausgabe? („Ab Fehler wiederholen", 2026-07-29.)
 *
 * Grundlage sind die persistierten Schritte oberster Ebene (flow_run_steps mit
 * parent_step_id NULL) — der Executor schreibt sie deterministisch in
 * Ketten-Reihenfolge: je Ketten-Schritt `iterationen` Einträge, ein
 * subagent-Schritt als kind='subagent'/name=rolle, ein Werkzeug-Schritt als
 * kind='werkzeug'/name=werkzeug. Ein bereits übernommener Schritt (aus einer
 * früheren Wiederholung) steht als EIN Eintrag mit `input.uebernommen = true`,
 * unabhängig von `iterationen`.
 *
 * Die Abbildung ist bewusst STRENG: Passt Art oder Name nicht (z. B. weil die
 * Flow-Definition seit dem alten Lauf geändert wurde) oder ist ein Eintrag
 * nicht 'fertig', endet die Übernahme dort — ab da wird echt ausgeführt.
 * Lieber einen Schritt zu viel wiederholen als eine falsche Ausgabe einsetzen.
 *
 * @param {object[]} schritte - flow.schritte (deklarierte Kette).
 * @param {object[]} altSteps - Schritte des alten Laufs (aus runStore.getRun).
 * @returns {Map<number, string>} Schritt-Index → Ausgabe (der letzten Iteration).
 */
function berechneVorabErgebnisse(schritte = [], altSteps = []) {
  const top = altSteps.filter(
    s => s.parent_step_id == null && (s.kind === 'werkzeug' || s.kind === 'subagent')
  );
  const vorab = new Map();
  let cursor = 0;

  for (const [index, schritt] of schritte.entries()) {
    const kind = schritt.typ === 'subagent' ? 'subagent' : 'werkzeug';
    const name = schritt.typ === 'subagent' ? schritt.rolle : schritt.werkzeug;
    const passt = s => Boolean(s) && s.kind === kind && s.name === name && s.status === 'fertig';
    const istUebernommen = s => Boolean(s && s.input && s.input.uebernommen === true);

    // Fall 1: der Ketten-Schritt wurde im Altlauf selbst schon übernommen —
    // genau EIN Protokoll-Eintrag, egal wie viele Iterationen deklariert sind.
    const erster = top[cursor];
    if (passt(erster) && istUebernommen(erster)) {
      vorab.set(index, String(erster.output ?? ''));
      cursor += 1;
      continue;
    }

    // Fall 2: echt ausgeführt — es müssen ALLE Iterationen fertig dastehen.
    const n = schritt.iterationen || 1;
    let letzte = null;
    let vollstaendig = true;
    for (let i = 0; i < n; i++) {
      const s = top[cursor + i];
      if (!passt(s) || istUebernommen(s)) {
        vollstaendig = false;
        break;
      }
      letzte = s;
    }
    if (!vollstaendig) {
      break; // erster nicht (voll) erfolgreicher Schritt — ab hier echt ausführen
    }
    cursor += n;
    vorab.set(index, String(letzte.output ?? ''));
  }

  return vorab;
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
 * @param {Map<number,string>} [p.vorabErgebnisse] - „Ab Fehler wiederholen":
 *   Schritt-Index → Ausgabe aus einem alten Lauf. Diese Schritte werden NICHT
 *   ausgeführt, ihre Ausgabe fließt unverändert ins Threading; im Protokoll
 *   stehen sie als übernommene Schritte mit Vermerk.
 * @param {number|null} [p.vorabQuelleLaufId] - Lauf-ID, aus der die
 *   übernommenen Ausgaben stammen (nur für den Vermerk).
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
  vorabErgebnisse = null,
  vorabQuelleLaufId = null,
  SubagentToolClass = SubagentTool,
}) {
  const subagentTool = new SubagentToolClass();
  const outputs = {};

  for (const [index, schritt] of flow.schritte.entries()) {
    if (signal && signal.aborted) {
      return { result: null, aborted: true };
    }

    // Übernommener Schritt (Wiederholung ab Fehler): nicht ausführen, die alte
    // Ausgabe ins Threading geben und den Schritt mit Vermerk protokollieren —
    // mit derselben Art/demselben Namen wie eine echte Ausführung, damit die
    // Lauf-Ansicht (und eine weitere Wiederholung) ihn genauso liest.
    if (vorabErgebnisse && vorabErgebnisse.has(index)) {
      const ausgabe = String(vorabErgebnisse.get(index) ?? '');
      outputs[schritt.name] = ausgabe;
      const recorder = context && context.stepRecorder;
      if (recorder) {
        try {
          const step = await recorder.beginnen({
            kind: schritt.typ === 'subagent' ? 'subagent' : 'werkzeug',
            name: (schritt.typ === 'subagent' ? schritt.rolle : schritt.werkzeug) || schritt.name,
            input: {
              hinweis:
                vorabQuelleLaufId != null
                  ? `(übernommen aus Lauf ${vorabQuelleLaufId})`
                  : '(übernommen aus früherem Lauf)',
              uebernommen: true,
            },
          });
          await recorder.abschliessen({ stepId: step.id, output: ausgabe });
        } catch (err) {
          // Das Mitschreiben darf die Wiederholung nicht kippen — die Ausgabe
          // ist ja da, nur der Protokoll-Eintrag fehlt dann.
          logger.warn(
            `Flow-Schritt "${schritt.name}": Übernahme-Vermerk nicht gespeichert: ${err.message}`
          );
        }
      }
      continue;
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

module.exports = { executeSteps, resolveParams, buildSynthesisInput, berechneVorabErgebnisse };
