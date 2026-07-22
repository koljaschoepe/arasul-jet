/**
 * Werkzeug-Schleife für Skills (Plan 011, Schritt 10).
 *
 * Angelehnt an services/agents/toolLoop.js, aber an drei Stellen bewusst anders:
 *
 *  1. WERKZEUGE: Sie kommen als fertige BaseTool-Instanzen herein (von
 *     toolRegistry.buildTools), nicht als Namen, die hier gegen eine feste
 *     Klassentabelle aufgelöst werden. Die Freigabe eines Skills ist damit
 *     schon getroffen, bevor die Schleife startet — sie führt nur aus, was sie
 *     bekommt.
 *
 *  2. GRENZEN pro Skill, nicht global: Runden (`maxRunden`) und Gesamt-Zeitlimit
 *     (`deadline`) stammen aus den Grenzen des Skills, nicht aus einer
 *     Umgebungsvariablen. Zwei Skills mit verschiedenen Grenzen laufen deshalb
 *     wirklich verschieden.
 *
 *  3. GPU-SPERRE: Jeder Modell-Aufruf geht durch dieselbe Sperre wie der Chat
 *     (gpuQueue). Nie treffen ein Chat- und ein Skill-Aufruf zugleich auf die
 *     GPU.
 *
 * Werkzeuge werfen NIE in die Schleife hinein — sie geben Fehler als kurzen Text
 * zurück (Konvention aus tools/*). Ein fehlgeschlagenes Werkzeug beendet also
 * die Werkzeug-Runde mit einer `tool`-Nachricht, nicht den ganzen Lauf.
 */

const axios = require('axios');
const services = require('../../config/services');
const logger = require('../../utils/logger');
const { withGpuLock } = require('./gpuQueue');

// Eigene Umgebungsvariable, NICHT die AGENT_*-Namen: Der Skill-Pfad soll seine
// Zeitgrenze pro Modell-Aufruf unabhängig vom (abgelösten) Agenten-Pfad haben.
const CALL_TIMEOUT_MS = parseInt(process.env.SKILL_LLM_TIMEOUT_MS || '120000', 10);

/**
 * Ein einzelner /api/chat-Aufruf, in die GPU-Sperre gewickelt.
 * @returns {Promise<object>} Das `message`-Objekt der Antwort.
 */
function callOllama({ model, messages, tools }) {
  const body = { model, messages, stream: false };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }
  return withGpuLock(async () => {
    const response = await axios.post(services.llm.chatEndpoint, body, {
      timeout: CALL_TIMEOUT_MS,
    });
    return response.data?.message || {};
  });
}

/**
 * Treibt einen Skill-Lauf bis zur Antwort (oder bis eine Grenze greift).
 *
 * @param {object} args
 * @param {string} args.model
 * @param {string} args.systemPrompt - Prompt mit bereits ersetzten Platzhaltern.
 * @param {string} args.userInput - Die Eingabe des Nutzers (Argument-Freitext o. Ä.).
 * @param {import('../../tools/baseTool')[]} args.tools - Fertige Werkzeug-Instanzen.
 * @param {number} args.maxRunden - Obergrenze der Werkzeug-Runden (grenzen.werkzeug_runden).
 * @param {number} args.zeitlimitS - Gesamt-Zeitlimit in Sekunden (grenzen.zeitlimit_s).
 * @param {object} args.context - Wird an jedes Werkzeug durchgereicht (roots, containerId, cwd, spaceIds, onChange, …).
 * @param {(evt:object)=>void} [args.onEvent] - Ereignis-Senke. Formen:
 *   {type:'tool_start', tool, params} · {type:'tool_result', tool, result} ·
 *   {type:'text', content} · {type:'done', result, truncated?} · {type:'error', message}
 * @param {() => number} [args.now] - Zeitquelle (für Tests); Standard Date.now.
 * @returns {Promise<{result:string, runden:number, truncated?:boolean, error?:string}>}
 */
async function runSkillLoop({
  model,
  systemPrompt,
  userInput,
  tools = [],
  maxRunden = 10,
  zeitlimitS = 900,
  context = {},
  onEvent,
  now = () => Date.now(),
} = {}) {
  // BEWUSST await: Der Ereignis-Handler schreibt jeden Schritt in den
  // Lauf-Speicher. Würde nicht gewartet, könnte ein `tool_result` eintreffen,
  // BEVOR das `tool_start` seinen Schritt angelegt hat (die DB-Schreibvorgänge
  // sind asynchron) — der Schritt bliebe dann als "laeuft" verwaist. Awaiten
  // serialisiert das Mitschreiben mit der Schleife und garantiert die
  // Reihenfolge start-vor-result.
  const emit = async evt => {
    if (typeof onEvent === 'function') {
      try {
        await onEvent(evt);
      } catch (err) {
        logger.warn(`Skill onEvent-Handler warf: ${err.message}`);
      }
    }
  };

  const deadline = now() + zeitlimitS * 1000;
  const toolByName = new Map(tools.map(t => [t.name, t]));
  const toolDefs = tools.map(t => t.toOllamaToolDefinition());

  const messages = [
    { role: 'system', content: systemPrompt || '' },
    { role: 'user', content: String(userInput || '') },
  ];

  try {
    for (let runde = 0; runde < maxRunden; runde++) {
      // Zeitlimit VOR dem Aufruf prüfen: Ein einzelner Modell-Aufruf kann lang
      // sein; überschreiten wir die Frist schon vor dem nächsten, brechen wir
      // sauber ab, statt sie noch einmal zu reißen.
      if (now() >= deadline) {
        const note = `Abgebrochen: Zeitlimit von ${zeitlimitS}s erreicht.`;
        await emit({ type: 'done', result: note, truncated: true });
        return { result: note, runden: runde, truncated: true };
      }

      const message = await callOllama({ model, messages, tools: toolDefs });
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

      if (toolCalls.length === 0) {
        const content = message.content || '';
        await emit({ type: 'text', content });
        await emit({ type: 'done', result: content });
        return { result: content, runden: runde + 1 };
      }

      // Den Assistenten-Zug MIT seinen tool_calls festhalten, bevor die
      // Ergebnisse folgen — sonst versteht das Modell die tool-Antworten nicht.
      messages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const toolName = call.function?.name;
        const params = call.function?.arguments || {};
        await emit({ type: 'tool_start', tool: toolName, params });

        const tool = toolByName.get(toolName);
        let result;
        if (!tool) {
          // Das Modell hat ein Werkzeug erfunden, das der Skill nicht hat. Als
          // Text zurückmelden, statt zu werfen — das Modell kann es korrigieren.
          result = `Fehler: Werkzeug "${toolName}" steht diesem Skill nicht zur Verfügung.`;
        } else {
          try {
            result = await tool.execute(params, context);
          } catch (err) {
            // Doppelter Boden: Sollte ein Werkzeug wider Erwarten doch werfen,
            // wird daraus eine Fehler-Nachricht, kein Lauf-Abbruch.
            logger.warn(`Skill-Werkzeug "${toolName}" warf: ${err.message}`);
            result = `Fehler bei "${toolName}": ${err.message}`;
          }
        }
        result = result == null ? '' : String(result);
        await emit({ type: 'tool_result', tool: toolName, result });
        messages.push({ role: 'tool', content: result });
      }
    }

    const note = `Abgebrochen nach ${maxRunden} Werkzeug-Runden.`;
    await emit({ type: 'done', result: note, truncated: true });
    return { result: note, runden: maxRunden, truncated: true };
  } catch (err) {
    logger.error(`Skill-Lauf fehlgeschlagen: ${err.message}`);
    await emit({ type: 'error', message: err.message });
    return { result: '', runden: 0, error: err.message };
  }
}

module.exports = { runSkillLoop, callOllama, CALL_TIMEOUT_MS };
