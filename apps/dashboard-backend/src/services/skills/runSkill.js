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
  { skillName, args = {}, userId, conversationId = null, onEvent },
  deps = {}
) {
  const {
    loadSkill = registry.loadSkill,
    store = runStore,
    makeTools = buildTools,
    runLoop = runSkillLoop,
    ensureSandbox = ensureSkillSandbox,
    resolveModel = () => modelService.getDefaultModel(),
  } = deps;

  const skill = await loadSkill(skillName);

  // 1. Argumente → Werte, Platzhalter ersetzen.
  const { werte, spaceIds } = resolveArguments(skill.argumente, args);
  const filledPrompt = fillPlaceholders(skill.systemPrompt, werte);
  const userInput = buildUserInput(skill.argumente, werte);

  // 2. Modell.
  const model = skill.modell || (await resolveModel());
  if (!model) {
    throw new ValidationError('Kein Modell verfügbar — bitte im Model Store eines laden.');
  }

  // 3. Werkzeuge.
  const tools = makeTools(skill.werkzeuge);

  // 4. Kontext für die Werkzeuge.
  const context = { userId, roots: skill.ordner, spaceIds, slug: skillName };

  // Terminal braucht einen Sandbox-Container. Nur aufbauen, wenn der Skill das
  // Werkzeug auch deklariert — sonst kein Container für einen Skill, der ihn
  // gar nicht nutzt.
  if (skill.werkzeuge.includes('terminal')) {
    try {
      const sandbox = await ensureSandbox(skill.ordner);
      context.containerId = sandbox.containerId;
      context.cwd = sandbox.cwd;
      context.timeoutS = skill.grenzen.zeitlimit_s;
    } catch (err) {
      // Kein Container? Der Lauf startet trotzdem; das Terminal-Werkzeug meldet
      // dann pro Aufruf eine klare Ursache, statt dass der ganze Skill scheitert.
      logger.warn(`Skill "${skillName}": Sandbox nicht verfügbar: ${err.message}`);
    }
  }

  // 5. Lauf anlegen.
  const run = await store.createRun({ userId, skillName, arguments: werte, conversationId });

  // Ereignisse der Schleife an den Lauf-Speicher UND an den optionalen Live-Sink
  // durchreichen. Jeder Werkzeug-Aufruf wird ein Schritt.
  let steps = 0;
  const offeneSchritte = new Map(); // toolName → stepId (für den Abschluss)

  const weiter = async evt => {
    try {
      if (evt.type === 'tool_start') {
        const step = await store.startStep({
          runId: run.id,
          kind: 'werkzeug',
          name: evt.tool || '',
          input: evt.params || {},
        });
        offeneSchritte.set(evt.tool, step.id);
        steps += 1;
        await store.bumpSteps({ runId: run.id });
      } else if (evt.type === 'tool_result') {
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
    return store.getRun({ runId: run.id, userId });
  }

  // 7. Lauf abschließen.
  const status = ergebnis.error ? 'fehler' : 'fertig';
  await store.finishRun({
    runId: run.id,
    status,
    result: ergebnis.error ? null : ergebnis.result,
    error: ergebnis.error || null,
    stepsUsed: steps,
  });

  return store.getRun({ runId: run.id, userId });
}

module.exports = { runSkill, resolveArguments, buildUserInput };
