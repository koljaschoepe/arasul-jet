/**
 * Skill-Runner (Plan 011, Schritt 10) — der Kern.
 *
 * Nimmt einen Skill-Namen und die Argumente, und führt den Skill aus:
 *
 *   1. Skill laden (Registry).
 *   2. Argumente prüfen und einsetzen — Pflichtfelder, Auswahllisten, Standards;
 *      die Platzhalter im Prompt werden ersetzt.
 *   3. Werkzeuge zusammenstellen — GENAU die, die der Skill deklariert.
 *   4. Kontext bauen: erlaubte Ordner (Datei-Werkzeuge), Wissensraum (RAG),
 *      Sandbox-Container (Terminal). Der Runner ist die einzige Stelle, die den
 *      Container-Namen kennt — die Werkzeuge bekommen ihn nur durchgereicht.
 *   5. Modell auflösen: das im Skill genannte, sonst das Standardmodell.
 *   6. Lauf anlegen, die Werkzeug-Schleife treiben, jeden Schritt mitschreiben,
 *      Lauf abschließen. Die Grenzen des Skills (Runden, Zeitlimit) greifen hier.
 *
 * Alle Modell-Aufrufe der Schleife gehen durch die gemeinsame GPU-Sperre
 * (gpuQueue), nie zugleich mit einem Chat-Aufruf.
 */

const registry = require('./skillRegistry');
const runStore = require('./runStore');
const { buildTools } = require('./toolRegistry');
const { runSkillLoop } = require('./toolLoop');
const { fillPlaceholders } = require('./skillFile');
const { ensureSkillSandbox } = require('./sandboxResolve');
const changeTracker = require('./changeTracker');
const { ladeDokumentText } = require('./documentText');
const { RunLimits } = require('./limits');
const modelService = require('../llm/modelService');
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errors');

/**
 * Prüft die Argumente gegen die Deklaration und liefert die einzusetzenden
 * Werte plus die Wissensräume, auf die die RAG-Suche zu scopen ist.
 *
 * @param {object[]} declared - skill.argumente
 * @param {object} provided - name → Wert (vom Aufrufer)
 * @returns {{ werte: object, spaceIds: string[] }}
 * @throws {ValidationError} bei fehlendem Pflichtargument oder ungültiger Auswahl.
 */
function resolveArguments(declared = [], provided = {}) {
  const werte = {};
  const spaceIds = [];

  for (const arg of declared) {
    let wert = provided[arg.name];
    if (wert == null || wert === '') {
      if (arg.standard != null) {
        wert = arg.standard;
      } else if (arg.pflicht) {
        throw new ValidationError(`Pflicht-Argument "${arg.name}" fehlt`);
      } else {
        continue; // optional und leer → Platzhalter bleibt unersetzt (fillPlaceholders lässt ihn stehen)
      }
    }
    wert = String(wert);

    if (arg.typ === 'auswahl' && Array.isArray(arg.optionen) && !arg.optionen.includes(wert)) {
      throw new ValidationError(
        `Argument "${arg.name}": "${wert}" ist keine der erlaubten Auswahlen (${arg.optionen.join(', ')})`
      );
    }
    if (arg.typ === 'wissensbasis') {
      spaceIds.push(wert);
    }
    werte[arg.name] = wert;
  }

  return { werte, spaceIds };
}

/** Baut aus den Argumentwerten die konkrete Nutzer-Eingabe für das Modell. */
function buildUserInput(declared = [], werte = {}) {
  const zeilen = declared
    .filter(a => werte[a.name] != null)
    .map(a => `${a.beschreibung || a.name}: ${werte[a.name]}`);
  return zeilen.length > 0
    ? `Angaben:\n${zeilen.join('\n')}`
    : 'Bitte die beschriebene Aufgabe ausführen.';
}

/**
 * Beispiel-Werte für die Laufzeit-Vorschau (Plan 012, Schritt 11).
 *
 * Anders als `resolveArguments` wirft das hier NIE: die Vorschau soll auch
 * dann etwas zeigen, wenn ein Pflichtargument noch nicht ausgefüllt ist. Die
 * Rangfolge je Argument: vom Aufrufer mitgegebener Wert → Standardwert → bei
 * `auswahl` die erste Option → sonst ein sichtbarer Platzhalter »‹name›«, damit
 * im aufgelösten Prompt klar erkennbar bleibt, wo ein Argument einsetzt.
 */
function sampleArgumentValues(declared = [], provided = {}) {
  const werte = {};
  for (const arg of declared) {
    const roh = provided[arg.name];
    if (roh != null && roh !== '') {
      werte[arg.name] = String(roh);
    } else if (arg.standard != null) {
      werte[arg.name] = String(arg.standard);
    } else if (arg.typ === 'auswahl' && Array.isArray(arg.optionen) && arg.optionen.length > 0) {
      werte[arg.name] = String(arg.optionen[0]);
    } else {
      werte[arg.name] = `‹${arg.name}›`;
    }
  }
  return werte;
}

/**
 * Stellt den Laufzeit-Prompt einer Skill-Definition zusammen — so, wie ihn der
 * Runner ans Modell gäbe (Plan 012, Schritt 11: das Herz des USP, volle
 * Transparenz). Führt NICHTS aus, sondern setzt nur die Beispiel-Argumente ein.
 *
 * Ehrlich abgegrenzt: Die System-Nachricht an das Modell ist AUSSCHLIESSLICH
 * der aufgelöste Prompt (`systemPrompt`). Werkzeuge, Ordner, Wissensräume und
 * Subagenten-Rollen reicht der Runner STRUKTURELL daneben (Werkzeuge über den
 * Ollama-`tools`-Parameter, Rollen als eigene Schleifen) — sie stehen NICHT im
 * Prompt-Text. Die Vorschau gibt beides getrennt zurück, statt Kontext
 * vorzugaukeln, der gar nicht im Prompt landet.
 *
 * @param {object} skill - interne Definition (mit `systemPrompt`).
 * @param {object} [providedArgs] - name → Wert (optional, für gefüllte Vorschau).
 * @returns {{ systemPrompt: string, userInput: string, werkzeuge: string[],
 *   ordner: string[], rollen: {name:string,prompt:string}[],
 *   beispielWerte: Record<string,string> }}
 */
function assembleRuntimePrompt(skill, providedArgs = {}) {
  const argumente = Array.isArray(skill.argumente) ? skill.argumente : [];
  const werte = sampleArgumentValues(argumente, providedArgs);
  return {
    systemPrompt: fillPlaceholders(skill.systemPrompt, werte),
    userInput: buildUserInput(argumente, werte),
    werkzeuge: Array.isArray(skill.werkzeuge) ? skill.werkzeuge : [],
    ordner: Array.isArray(skill.ordner) ? skill.ordner : [],
    rollen: (Array.isArray(skill.rollen) ? skill.rollen : []).map(r => ({
      name: r.name,
      prompt: fillPlaceholders(r.prompt, werte),
    })),
    beispielWerte: werte,
  };
}

/**
 * Speist den Inhalt der `datei`-Argumente in die Nutzer-Eingabe ein (Schritt 18).
 *
 * Ein `datei`-Argument liefert nur den Dateinamen — für „fasse dieses Dokument
 * zusammen" braucht das Modell den Inhalt. Der wird hier aus dem indexierten
 * Text geladen und als klar abgegrenzter Block angehängt. Ein nicht gefundenes
 * Dokument wird ehrlich vermerkt, damit das Modell nicht rät.
 *
 * @returns {Promise<string>} Die Nutzer-Eingabe, ggf. um Dokument-Blöcke ergänzt.
 */
async function anreichernMitDateien(userInput, declared = [], werte = {}, loadDocText) {
  const dateiArgs = declared.filter(a => a.typ === 'datei' && werte[a.name] != null);
  if (dateiArgs.length === 0) {
    return userInput;
  }
  const bloecke = [];
  for (const arg of dateiArgs) {
    const name = werte[arg.name];
    const doc = await loadDocText({ filename: name });
    if (doc.gefunden) {
      const gekuerzt = doc.gekuerzt ? ' (gekürzt)' : '';
      bloecke.push(
        `--- Inhalt der Datei "${name}"${gekuerzt} ---\n${doc.text}\n--- Ende der Datei ---`
      );
    } else {
      bloecke.push(
        `--- Datei "${name}" ---\nHinweis: Der Inhalt konnte nicht geladen werden ` +
          `(nicht in der Wissensbasis indexiert). Bitte weise darauf hin, statt zu raten.\n--- Ende ---`
      );
    }
  }
  return `${userInput}\n\n${bloecke.join('\n\n')}`;
}

/**
 * Führt einen Skill aus.
 *
 * @param {object} p
 * @param {string} p.skillName
 * @param {object} [p.args] - Argumentwerte (name → Wert).
 * @param {number} p.userId
 * @param {number|null} [p.conversationId]
 * @param {(evt:object)=>void} [p.onEvent] - Live-Ereignisse (Schritt 12 hängt sich hier ein).
 * @param {object} [deps] - Für Tests austauschbar.
 * @returns {Promise<object>} Der abgeschlossene Lauf (aus runStore).
 */
async function runSkill(
  { skillName, args = {}, userId, conversationId = null, onEvent, existingRunId = null, signal },
  deps = {}
) {
  const {
    loadSkill = registry.loadSkill,
    store = runStore,
    makeTools = buildTools,
    runLoop = runSkillLoop,
    ensureSandbox = ensureSkillSandbox,
    tracker = changeTracker,
    loadDocText = ladeDokumentText,
    resolveModel = () => modelService.getDefaultModel(),
  } = deps;

  const skill = await loadSkill(skillName);

  // 1. Argumente → Werte, Platzhalter ersetzen. Ein `datei`-Argument reichert
  //    die Nutzer-Eingabe zusätzlich um den Dokument-Inhalt an (Schritt 18).
  const { werte, spaceIds } = resolveArguments(skill.argumente, args);
  const filledPrompt = fillPlaceholders(skill.systemPrompt, werte);
  const userInput = await anreichernMitDateien(
    buildUserInput(skill.argumente, werte),
    skill.argumente,
    werte,
    loadDocText
  );

  // 2. Modell.
  const model = skill.modell || (await resolveModel());
  if (!model) {
    throw new ValidationError('Kein Modell verfügbar — bitte im Model Store eines laden.');
  }

  // 3. Werkzeuge.
  const tools = makeTools(skill.werkzeuge);

  // 4. Kontext für die Werkzeuge (die Basis, die auch Rollen für IHRE Werkzeuge
  //    erben). Bewusst getrennt gehalten: `roleContextBase` sind die Ordner/
  //    Wissensraum/Container-Angaben, `context` ist dieselbe Basis plus die
  //    Lauf-weiten Subagent-Daten (Rollen, Grenzen, Tiefe).
  const roleContextBase = { userId, roots: skill.ordner, spaceIds, slug: skillName };

  // Terminal braucht einen Sandbox-Container. Nur aufbauen, wenn der Skill das
  // Werkzeug auch deklariert — sonst kein Container für einen Skill, der ihn
  // gar nicht nutzt.
  if (skill.werkzeuge.includes('terminal')) {
    try {
      const sandbox = await ensureSandbox(skill.ordner);
      roleContextBase.containerId = sandbox.containerId;
      roleContextBase.cwd = sandbox.cwd;
      roleContextBase.timeoutS = skill.grenzen.zeitlimit_s;
    } catch (err) {
      // Kein Container? Der Lauf startet trotzdem; das Terminal-Werkzeug meldet
      // dann pro Aufruf eine klare Ursache, statt dass der ganze Skill scheitert.
      logger.warn(`Skill "${skillName}": Sandbox nicht verfügbar: ${err.message}`);
    }
  }

  // 5. Lauf anlegen — ODER einen bereits angelegten weiterverwenden. Der
  //    Lauf-Verwalter (Schritt 12) legt den Lauf VOR dem Start an, damit seine
  //    ID sofort streambar ist, und reicht ihn hier herein.
  const run = existingRunId
    ? { id: existingRunId }
    : await store.createRun({ userId, skillName, arguments: werte, conversationId });

  // Zähler und offene Schritte (weiter unten von `weiter` und `recordSubagent`
  // gemeinsam genutzt) — hier deklariert, damit beide Closures sie sehen.
  let steps = 0;
  const offeneSchritte = new Map(); // toolName → stepId (für den Abschluss)

  // Notbremsen — EINE Instanz je Lauf, geteilt über alle Subagent-Ebenen.
  const limits = new RunLimits({
    maxAufrufe: skill.grenzen.max_aufrufe,
    zeitlimitS: skill.grenzen.zeitlimit_s,
  });

  // Ein Subagent-Schritt hält BEIDE Seiten fest: das Verdichtete (output, das
  // der Orchestrator sieht) und das Rohe (raw_output, nur fürs Protokoll).
  const recordSubagent = async ({ rolle, auftrag, text, raw }) => {
    const step = await store.startStep({
      runId: run.id,
      kind: 'subagent',
      name: rolle,
      input: { auftrag },
    });
    steps += 1;
    await store.bumpSteps({ runId: run.id });
    await store.finishStep({ stepId: step.id, output: text, rawOutput: raw, status: 'fertig' });
  };

  // Der volle Kontext: Werkzeug-Basis + die Lauf-weiten Subagent-Daten. `depth`
  // 0 = Orchestrator; Rollen laufen ab Ebene 1.
  const context = {
    ...roleContextBase,
    rollen: skill.rollen,
    limits,
    depth: 0,
    model,
    werkzeugRunden: skill.grenzen.werkzeug_runden,
    roleContextBase,
    recordSubagent,
    // Das Abbruch-Signal fließt mit in den Kontext, damit auch die
    // verschachtelten Rollen-Schleifen (Subagent) es prüfen und aufhören.
    signal,
  };

  // Ereignisse der Schleife an den Lauf-Speicher UND an den optionalen Live-Sink
  // durchreichen. Jeder Werkzeug-Aufruf wird ein Schritt.
  const weiter = async evt => {
    // `subagent` schreibt seinen eigenen, reicheren Schritt (mit Rohdaten) über
    // `recordSubagent`. Hier NICHT zusätzlich als generischen Werkzeug-Schritt
    // mitschreiben — sonst stünde die Delegation doppelt im Protokoll.
    const istSubagent = evt.tool === 'subagent';
    try {
      if (evt.type === 'tool_start' && !istSubagent) {
        const step = await store.startStep({
          runId: run.id,
          kind: 'werkzeug',
          name: evt.tool || '',
          input: evt.params || {},
        });
        offeneSchritte.set(evt.tool, step.id);
        steps += 1;
        await store.bumpSteps({ runId: run.id });
      } else if (evt.type === 'tool_result' && !istSubagent) {
        const stepId = offeneSchritte.get(evt.tool);
        if (stepId) {
          await store.finishStep({ stepId, output: evt.result, status: 'fertig' });
          offeneSchritte.delete(evt.tool);
        }
      }
    } catch (err) {
      // Das Mitschreiben darf einen laufenden Skill nie zum Absturz bringen.
      logger.warn(`Skill "${skillName}": Schritt konnte nicht gespeichert werden: ${err.message}`);
    }
    if (typeof onEvent === 'function') {
      try {
        onEvent(evt);
      } catch (err) {
        logger.warn(`Skill "${skillName}": onEvent-Handler warf: ${err.message}`);
      }
    }
  };

  // 5b. Änderungs-Übersicht (Schritt 16): Nur wenn der Skill überhaupt Dateien
  //     verändern KANN (Schreib-Werkzeug oder Terminal), einen Abzug der Ordner
  //     VOR dem Lauf ziehen. Die Differenz zum Abzug NACH dem Lauf ist die
  //     Übersicht. Read-only-Skills (nur RAG/Web) tun das nie — kein Aufwand.
  //
  //     GRENZE, ehrlich benannt: Der Abzug-Vergleich nimmt an, dass NUR dieser
  //     Lauf die Ordner verändert. Griffe ein zweiter Lauf oder eine manuelle
  //     Terminal-Aktion GLEICHZEITIG in denselben Ordner, schriebe die Differenz
  //     dessen Änderungen fälschlich diesem Lauf zu. In der Praxis selten (ein
  //     Skill arbeitet in seinem eigenen Ordner), aber es ist ein anderer
  //     Fehlerfall als der TOCTOU-Schutz der Datei-Werkzeuge — hier nicht gelöst.
  const verfolgtAenderungen =
    Array.isArray(skill.werkzeuge) &&
    (skill.werkzeuge.includes('dateien_schreiben') || skill.werkzeuge.includes('terminal'));
  let startAbzug = null;
  if (verfolgtAenderungen) {
    try {
      startAbzug = await tracker.snapshot(skill.ordner);
    } catch (err) {
      // Kein Abzug? Der Lauf läuft trotzdem — nur die Übersicht entfällt dann.
      logger.warn(`Skill "${skillName}": Start-Abzug fehlgeschlagen: ${err.message}`);
    }
  }

  // Zweiten Abzug ziehen, Differenz speichern und live melden. Wird in BEIDEN
  // Abschluss-Pfaden (Fehler wie Erfolg) genau einmal gerufen. Wirft nie: eine
  // gescheiterte Übersicht darf einen sonst gelungenen Lauf nicht kippen.
  const aenderungenAbschliessen = async () => {
    if (!startAbzug) {
      return;
    }
    try {
      const endAbzug = await tracker.snapshot(skill.ordner);
      const { aenderungen, abgeschnitten } = tracker.berechneAenderungen(
        startAbzug,
        endAbzug,
        skill.ordner || []
      );
      // Die Kürzung nicht still verschlucken (der Deckel greift erst bei sehr
      // vielen Datei-Änderungen, z. B. `npm install`): wenigstens im Log ehrlich
      // benennen, damit ein „nur 300 gelistet" nicht als vollständig missverstanden wird.
      if (abgeschnitten) {
        logger.warn(
          `Skill "${skillName}": Änderungs-Übersicht auf ${aenderungen.length} Einträge gekürzt — weitere ausgelassen.`
        );
      }
      await store.saveChanges({ runId: run.id, changes: aenderungen });
      // Live melden, damit die offen zusehende Lauf-Karte die Übersicht ohne
      // Nachladen zeigt. Beim Wiederverbinden liefert der gespeicherte Verlauf
      // dieselben Daten (getRun gibt `changes` mit).
      if (aenderungen.length > 0 && typeof onEvent === 'function') {
        try {
          onEvent({ type: 'aenderungen', changes: aenderungen });
        } catch (err) {
          logger.warn(`Skill "${skillName}": onEvent(aenderungen) warf: ${err.message}`);
        }
      }
    } catch (err) {
      logger.warn(`Skill "${skillName}": Änderungs-Übersicht fehlgeschlagen: ${err.message}`);
    }
  };

  // 6. Schleife treiben.
  let ergebnis;
  try {
    ergebnis = await runLoop({
      model,
      systemPrompt: filledPrompt,
      userInput,
      tools,
      maxRunden: skill.grenzen.werkzeug_runden,
      zeitlimitS: skill.grenzen.zeitlimit_s,
      context,
      signal,
      onEvent: weiter,
    });
  } catch (err) {
    logger.error(`Skill "${skillName}" abgebrochen: ${err.message}`);
    await store.finishRun({
      runId: run.id,
      status: 'fehler',
      error: err.message,
      stepsUsed: steps,
    });
    // Auch ein gescheiterter Lauf kann bis zum Abbruch Dateien verändert haben.
    await aenderungenAbschliessen();
    return store.getRun({ runId: run.id, userId });
  }

  // 7. Lauf abschließen. Ein per Signal abgebrochener Lauf wird 'abgebrochen';
  //    hat die Abbruch-Route den Status in der DB schon gesetzt, ist dieses
  //    finishRun ohnehin ein Nichts (WHERE status='laeuft' greift nicht mehr).
  const status = ergebnis.aborted ? 'abgebrochen' : ergebnis.error ? 'fehler' : 'fertig';
  await store.finishRun({
    runId: run.id,
    status,
    result: ergebnis.error ? null : ergebnis.result,
    error: ergebnis.error || null,
    stepsUsed: steps,
  });

  await aenderungenAbschliessen();

  return store.getRun({ runId: run.id, userId });
}

module.exports = {
  runSkill,
  resolveArguments,
  buildUserInput,
  anreichernMitDateien,
  assembleRuntimePrompt,
  sampleArgumentValues,
};
