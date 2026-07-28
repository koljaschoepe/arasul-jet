/**
 * Subagent-Werkzeug (Plan 011, Schritt 11).
 *
 * Der Orchestrator eines Flows bekommt dieses Werkzeug, wenn der Flow Rollen
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
      'Delegiert eine Teilaufgabe an eine im Flow deklarierte Rolle. ' +
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
   *   Werkzeuge der Rolle), `stepRecorder` (persistiert Schritte als Baum:
   *   `beginnen`/`abschliessen`, siehe runFlow.js), `parentStepId` (Schritt des
   *   AUFRUFENDEN Subagenten, falls verschachtelt), `makeTools`, `runLoop`
   *   (austauschbar für Tests).
   */
  async execute(params = {}, context = {}) {
    const {
      rollen = [],
      limits,
      depth = 0,
      model: defaultModel,
      werkzeugRunden = 10,
      roleContextBase = {},
      stepRecorder,
      parentStepId = null,
      makeTools = require('./toolRegistry').buildTools,
      runLoop = require('./toolLoop').runFlowLoop,
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
    const rollenModell = rolle.modell || defaultModel;

    // Den Subagent-Schritt VOR der Ausführung anlegen — so zeigt die Lauf-Ansicht
    // den arbeitenden Agenten live, nicht erst nach seinem Abschluss. Alles, was
    // die Rolle an Werkzeugen aufruft, hängt sich als Kind-Schritt darunter
    // (parent_step_id) — der aufklappbare Agenten-Baum.
    let eigenerSchritt = null;
    if (stepRecorder) {
      try {
        eigenerSchritt = await stepRecorder.beginnen({
          kind: 'subagent',
          name: rolleName,
          input: { auftrag },
          parentStepId,
          modell: rollenModell,
        });
      } catch (err) {
        logger.warn(`Subagent "${rolleName}": Schritt nicht angelegt: ${err.message}`);
      }
    }

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
      stepRecorder,
      // Delegiert die Rolle selbst weiter, hängt sich DEREN Schritt unter diesen.
      parentStepId: eigenerSchritt ? eigenerSchritt.id : parentStepId,
      makeTools,
      runLoop,
      // Abbruch-Signal weiterreichen, damit auch Ebene 2 es prüft.
      signal: context.signal,
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
    // Gedeckelt: ein einzelnes Werkzeug-Ergebnis kann 256 KB groß sein
    // (dateien_lesen), eine Rolle darf bis zu `werkzeugRunden` Aufrufe machen —
    // ungedeckelt liefe raw_output in den zweistelligen MB-Bereich (Speicher +
    // flow_run_steps). Pro Eintrag und in Summe hart begrenzen.
    const RAW_EINTRAG_MAX = 4000;
    const RAW_GESAMT_MAX = 64_000;
    const gelesenes = [];
    let rawBytes = 0;
    let rawVoll = false;
    const rawPush = zeile => {
      if (rawVoll) {
        return;
      }
      const kurz =
        zeile.length > RAW_EINTRAG_MAX ? `${zeile.slice(0, RAW_EINTRAG_MAX)} … [gekürzt]` : zeile;
      if (rawBytes + kurz.length > RAW_GESAMT_MAX) {
        gelesenes.push('… [weitere Werkzeug-Ausgaben gekürzt]');
        rawVoll = true;
        return;
      }
      rawBytes += kurz.length;
      gelesenes.push(kurz);
    };
    // Innere Werkzeug-Aufrufe der Rolle als ECHTE Kind-Schritte mitschreiben
    // (parent_step_id = dieser Subagent-Schritt) — zusätzlich zum Text-Verlauf
    // in raw_output. Delegiert die Rolle an einen weiteren Subagenten, schreibt
    // DESSEN execute den Schritt selbst — hier nicht doppelt anlegen.
    const offeneKinder = new Map(); // toolName → stepId
    const rolleOnEvent = async evt => {
      if (evt.type === 'tool_start') {
        rawPush(`→ ${evt.tool}(${JSON.stringify(evt.params || {})})`);
        if (stepRecorder && eigenerSchritt && evt.tool !== 'subagent') {
          try {
            const kind = await stepRecorder.beginnen({
              kind: 'werkzeug',
              name: evt.tool || '',
              input: evt.params || {},
              parentStepId: eigenerSchritt.id,
            });
            offeneKinder.set(evt.tool, kind.id);
          } catch (err) {
            logger.warn(`Subagent "${rolleName}": Kind-Schritt nicht angelegt: ${err.message}`);
          }
        }
      } else if (evt.type === 'tool_result') {
        rawPush(`← ${evt.tool}: ${evt.result}`);
        if (stepRecorder && evt.tool !== 'subagent') {
          const kindId = offeneKinder.get(evt.tool);
          if (kindId) {
            offeneKinder.delete(evt.tool);
            try {
              await stepRecorder.abschliessen({ stepId: kindId, output: evt.result });
            } catch (err) {
              logger.warn(
                `Subagent "${rolleName}": Kind-Schritt nicht abgeschlossen: ${err.message}`
              );
            }
          }
        }
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
        // Dasselbe Abbruch-Signal wie der Orchestrator: ein Abbruch stoppt auch
        // eine gerade laufende Rolle vor ihrem nächsten Modell-Aufruf.
        signal: context.signal,
        onEvent: rolleOnEvent,
      });
    } catch (err) {
      logger.warn(`Subagent-Rolle "${rolleName}" fehlgeschlagen: ${err.message}`);
      // Auch der Fehlertext geht gedeckelt zurück — die eine Rückgabe, die nicht
      // durch enforceContract läuft, darf den Orchestrator-Kontext nicht fluten.
      const msg = `Fehler: Rolle "${rolleName}" konnte nicht ausgeführt werden: ${err.message}`;
      const gekappt =
        msg.length > rolle.ergebnis.max_zeichen ? msg.slice(0, rolle.ergebnis.max_zeichen) : msg;
      if (stepRecorder && eigenerSchritt) {
        try {
          await stepRecorder.abschliessen({
            stepId: eigenerSchritt.id,
            output: gekappt,
            rawOutput: gelesenes.length
              ? `[Werkzeug-Verlauf der Rolle]\n${gelesenes.join('\n')}`
              : null,
            status: 'fehler',
          });
        } catch (e) {
          logger.warn(`Subagent "${rolleName}": Fehler-Schritt nicht gespeichert: ${e.message}`);
        }
      }
      return gekappt;
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
    if (stepRecorder && eigenerSchritt) {
      try {
        await stepRecorder.abschliessen({
          stepId: eigenerSchritt.id,
          output: text,
          rawOutput: raw,
          status: 'fertig',
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
