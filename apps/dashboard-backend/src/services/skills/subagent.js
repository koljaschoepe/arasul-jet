/**
 * Subagent-Werkzeug (Plan 011, Schritt 11).
 *
 * Der Orchestrator eines Skills bekommt dieses Werkzeug, wenn der Skill Rollen
 * deklariert. Ruft das Modell `subagent(rolle, auftrag)` auf, dann:
 *
 *   1. wird die genannte Rolle nachgeschlagen (ihr Prompt, ihre Werkzeuge, ihr
 *      Modell, ihr Ergebnis-Vertrag),
 *   2. eine Notbremse geprüft (Gesamtzahl, Zeit, Tiefe — geteilt über den
 *      ganzen Lauf, siehe limits.js),
 *   3. die Rolle in einer EIGENEN Werkzeug-Schleife ausgeführt — sie darf
 *      lesen, suchen, rechnen, und (auf Ebene 1) selbst delegieren,
 *   4. ihr roher Schluss-Text gegen den Ergebnis-Vertrag geprüft und hart
 *      gedeckelt (resultContract.js),
 *   5. an den Orchestrator NUR das vertragskonforme, gekürzte Ergebnis
 *      zurückgegeben. Die Rohdaten der Rolle erreichen den Orchestrator NIE;
 *      sie gehen ausschließlich ins Lauf-Protokoll (raw_output).
 *
 * Genau dieser Schnitt zwischen „was die Rolle gelesen hat" und „was der
 * Orchestrator sieht" ist der Grund, warum ein 7B-Modell hier wie ein großes
 * wirken kann.
 */

const BaseTool = require('../../tools/baseTool');
const logger = require('../../utils/logger');
const { enforceContract } = require('./resultContract');

class SubagentTool extends BaseTool {
  get name() {
    return 'subagent';
  }

  get description() {
    return (
      'Delegiert eine Teilaufgabe an eine im Skill deklarierte Rolle. ' +
      'Zurück kommt NUR das vertraglich vereinbarte, gekürzte Ergebnis — nie die Rohdaten.'
    );
  }

  get parameters() {
    return {
      rolle: {
        type: 'string',
        description: 'Name der Rolle, an die delegiert wird',
        required: true,
      },
      auftrag: {
        type: 'string',
        description: 'Was die Rolle konkret tun soll',
        required: true,
      },
    };
  }

  /**
   * @param {{rolle?:string, auftrag?:string}} params
   * @param {object} context - Vom Runner gestellt:
   *   `rollen` (Rollen-Deklarationen), `limits` (RunLimits, geteilt),
   *   `depth` (Tiefe des Aufrufers, Orchestrator = 0), `model` (Vorgabe-Modell),
   *   `werkzeugRunden`, `roleContextBase` (Ordner/Wissensraum/Container für die
   *   Werkzeuge der Rolle), `recordSubagent` (persistiert den Schritt mit
   *   Rohdaten), `makeTools`, `runLoop` (austauschbar für Tests).
   */
  async execute(params = {}, context = {}) {
    const {
      rollen = [],
      limits,
      depth = 0,
      model: defaultModel,
      werkzeugRunden = 10,
      roleContextBase = {},
      recordSubagent,
      makeTools = require('./toolRegistry').buildTools,
      runLoop = require('./toolLoop').runSkillLoop,
    } = context;

    const rolleName = String(params.rolle || '').trim();
    const auftrag = String(params.auftrag || '').trim();

    if (!rolleName) {
      return 'Fehler: "rolle" darf nicht leer sein.';
    }
    const rolle = rollen.find(r => r.name === rolleName);
    if (!rolle) {
      const namen = rollen.map(r => r.name).join(', ') || '(keine)';
      return `Fehler: Rolle "${rolleName}" ist nicht deklariert. Verfügbar: ${namen}.`;
    }
    if (!auftrag) {
      return 'Fehler: "auftrag" darf nicht leer sein.';
    }
    if (!limits) {
      return 'Fehler: Für diesen Lauf sind keine Grenzen gesetzt — Delegation nicht möglich.';
    }

    // Notbremse: zählt den Aufruf nur, wenn er erlaubt ist.
    const grund = limits.subagentErlaubt(depth);
    if (grund) {
      return `Abgebrochen: ${grund}.`;
    }

    // Werkzeuge der Rolle. Enthält die Rolle selbst `subagent`, bekommt sie
    // wieder ein SubagentTool — die nächste Ebene. Die Tiefe wird unten erhöht,
    // die Notbremse fängt eine zu tiefe Verschachtelung ab.
    const roleTools = makeTools(rolle.werkzeuge);

    // Kontext der Rolle: die Basis (Ordner, Wissensraum, Container) für ihre
    // eigenen Werkzeuge, PLUS die geteilten Lauf-Daten mit ERHÖHTER Tiefe.
    const roleContext = {
      ...roleContextBase,
      rollen,
      limits,
      depth: depth + 1,
      model: defaultModel,
      werkzeugRunden,
      roleContextBase,
      recordSubagent,
      makeTools,
      runLoop,
    };

    // Der Rolle den Ergebnis-Vertrag ansagen. Das ist die Bitte an das Modell,
    // sich daran zu halten; erzwungen wird er anschließend hart durch
    // enforceContract — der Prompt allein genügt kleinen Modellen nicht.
    const felder = rolle.ergebnis.felder;
    const vertragsHinweis =
      `\n\nAntworte AM ENDE ausschließlich mit einem JSON-Objekt mit genau diesen Feldern: ` +
      `${felder.join(', ')}. Kein Text davor oder danach, keine weiteren Felder.`;

    // Mitschreiben, WAS die Rolle liest. Genau das ist das Rohmaterial, das der
    // Orchestrator nie sehen darf, das aber laut §6 im Lauf-Protokoll sichtbar
    // sein soll. Der Werkzeug-Verlauf der Rolle (ihre Seiten, Dateien, Treffer)
    // wird hier gesammelt und unten als `raw` weitergegeben — er landet im
    // raw_output des Subagent-Schritts, nicht in der Antwort an den Orchestrator.
    const gelesenes = [];
    const rolleOnEvent = evt => {
      if (evt.type === 'tool_start') {
        gelesenes.push(`→ ${evt.tool}(${JSON.stringify(evt.params || {})})`);
      } else if (evt.type === 'tool_result') {
        gelesenes.push(`← ${evt.tool}: ${evt.result}`);
      }
    };

    let ergebnis;
    try {
      ergebnis = await runLoop({
        model: rolle.modell || defaultModel,
        systemPrompt: rolle.prompt + vertragsHinweis,
        userInput: auftrag,
        tools: roleTools,
        maxRunden: werkzeugRunden,
        // Die geteilte Frist als verbleibende Sekunden — so gilt EIN Zeitlimit
        // über den ganzen Lauf, nicht je Ebene neu.
        zeitlimitS: limits.restSekunden(),
        context: roleContext,
        onEvent: rolleOnEvent,
      });
    } catch (err) {
      logger.warn(`Subagent-Rolle "${rolleName}" fehlgeschlagen: ${err.message}`);
      // Auch der Fehlertext geht gedeckelt zurück — die eine Rückgabe, die nicht
      // durch enforceContract läuft, darf den Orchestrator-Kontext nicht fluten.
      const msg = `Fehler: Rolle "${rolleName}" konnte nicht ausgeführt werden: ${err.message}`;
      return msg.length > rolle.ergebnis.max_zeichen
        ? msg.slice(0, rolle.ergebnis.max_zeichen)
        : msg;
    }

    const schlussText = ergebnis && ergebnis.result ? String(ergebnis.result) : '';
    // `raw` fürs Protokoll = was die Rolle gelesen hat PLUS ihr Schluss-Text.
    const raw = [
      gelesenes.length ? `[Werkzeug-Verlauf der Rolle]\n${gelesenes.join('\n')}` : null,
      `[Schluss-Text der Rolle]\n${schlussText}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Der Vertrag wird gegen den SCHLUSS-Text geprüft (dort steht das JSON), nicht
    // gegen den Werkzeug-Verlauf.
    const { text, felder: felderObj } = enforceContract(schlussText, rolle.ergebnis);

    // Rohdaten INS PROTOKOLL, nicht in die Antwort: Der Schritt hält beide
    // Seiten fest — das Verdichtete (output) und das Rohe (raw_output).
    if (typeof recordSubagent === 'function') {
      try {
        await recordSubagent({
          rolle: rolleName,
          auftrag,
          text,
          raw,
          felder: felderObj,
        });
      } catch (err) {
        logger.warn(`Subagent "${rolleName}": Schritt nicht gespeichert: ${err.message}`);
      }
    }

    // An den Orchestrator geht AUSSCHLIESSLICH das vertragskonforme Ergebnis.
    return text;
  }
}

module.exports = SubagentTool;
