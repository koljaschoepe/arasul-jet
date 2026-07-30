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
const { kannDenken, thinkingGewuenscht } = require('../llm/agentConfig');

/** Werkzeuge, deren erfolgreicher Aufruf als „hat wirklich geschrieben" zählt. */
const SCHREIB_WERKZEUGE = new Set(['dateien_schreiben', 'dateien_bearbeiten', 'dateien_anhaengen']);

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
    //
    // AUSSER bei Schreib-Rollen (Harness v2): Der „antworte nur mit JSON"-
    // Vertrag drängte autor/entwickler nachweislich dazu, den Dateiinhalt als
    // JSON-TEXT zurückzugeben, statt dateien_schreiben zu rufen — die Wurzel
    // des „Subagent schreibt nicht selbst"-Problems. Schreib-Rollen bekommen
    // deshalb einen Schreib-Vertrag; enforceContract deckelt ihren Bericht
    // über den Nicht-JSON-Rückfall trotzdem hart.
    const felder = rolle.ergebnis.felder;
    const schreibRolle =
      rolle.schreibend === true || (rolle.werkzeuge || []).some(w => SCHREIB_WERKZEUGE.has(w));
    const vertragsHinweis = schreibRolle
      ? `\n\nWICHTIG: Führe die Schreibarbeit SELBST mit deinen Werkzeugen aus ` +
        `(dateien_schreiben, dateien_anhaengen, dateien_bearbeiten) — gib den Inhalt ` +
        `NIEMALS nur als Antwort-Text zurück. Antworte am Ende mit einem kurzen Bericht ` +
        `(1-3 Sätze): welche Dateien du geschrieben oder geändert hast.`
      : `\n\nAntworte AM ENDE ausschließlich mit einem JSON-Objekt mit genau diesen Feldern: ` +
        `${felder.join(', ')}. Kein Text davor oder danach, keine weiteren Felder.`;

    // Thinking (Interview 2026-07-30): Wenn der Aufrufer es wünscht
    // (Chat-Agent setzt denkenSubagenten) und das Rollen-Modell denken kann,
    // läuft die Rolle mit Reasoning — Flows bleiben unverändert schnell.
    // require erst hier statt am Modulkopf: toolLoop wird oben bereits als
    // Default für context.runLoop lazy geholt — derselbe Stil vermeidet eine
    // Import-Verflechtung beim Modul-Load (subagent ↔ toolLoop-Umfeld).
    const denkt =
      context.denkenSubagenten === true &&
      thinkingGewuenscht() &&
      kannDenken(await require('./toolLoop').zuOllamaName(rollenModell));

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
    let hatGeschrieben = false; // Platten-Wahrheit: kam ein ERFOLGREICHER Schreib-Aufruf?
    const rolleOnEvent = async evt => {
      if (
        evt.type === 'tool_result' &&
        SCHREIB_WERKZEUGE.has(evt.tool) &&
        !/^Fehler/.test(String(evt.result || ''))
      ) {
        hatGeschrieben = true;
      }
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
        think: denkt,
        // Dasselbe Abbruch-Signal wie der Orchestrator: ein Abbruch stoppt auch
        // eine gerade laufende Rolle vor ihrem nächsten Modell-Aufruf.
        signal: context.signal,
        onEvent: rolleOnEvent,
      });

      // Schreib-Verifikation IN der Rolle (Harness v2): Hat eine Schreib-Rolle
      // den Lauf beendet, ohne je erfolgreich zu schreiben, bekommt sie EINE
      // harte Nachfass-Schleife — statt dass erst der Orchestrator die Lüge
      // per Platten-Diff entdeckt und die Arbeit selbst nachholen muss.
      if (schreibRolle && !hatGeschrieben && !(context.signal && context.signal.aborted)) {
        const nachfass = await runLoop({
          model: rolle.modell || defaultModel,
          systemPrompt: rolle.prompt + vertragsHinweis,
          userInput:
            `${auftrag}\n\nDu hast beim ersten Versuch KEINE Datei geschrieben — dein ` +
            `Bericht war eine bloße Behauptung. Führe den Auftrag JETZT aus: rufe ` +
            `dateien_schreiben (bzw. dateien_anhaengen/dateien_bearbeiten) mit dem ` +
            `vollständigen Inhalt auf und berichte erst danach.`,
          tools: roleTools,
          maxRunden: Math.min(werkzeugRunden, 6),
          zeitlimitS: limits.restSekunden(),
          context: roleContext,
          think: denkt,
          signal: context.signal,
          onEvent: rolleOnEvent,
        });
        if (hatGeschrieben) {
          // Auch wenn die Nachfass-Schleife ohne Schluss-Text endete (z. B.
          // maxRunden mitten im Werkzeug): der Schreib-Erfolg zählt — die
          // ursprüngliche „ich habe geschrieben"-Behauptung darf nicht als
          // Ergebnis stehen bleiben (Review PR #278).
          ergebnis =
            nachfass && nachfass.result
              ? nachfass
              : { result: 'Dateien wurden in der Nachfass-Runde geschrieben.' };
        }
      }
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
