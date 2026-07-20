/**
 * Einzel-Agent-Runner (Plan 010, Schritt 2 + Tool-Loop in Schritt 3)
 *
 * Führt EINEN Flow-Agenten aus: lädt den (owner-scoped) Agenten, löst bei
 * Cloud-Providern den verschlüsselten API-Key auf, baut aus den deklarierten
 * Tools eine Per-Run-Registry (externe Tools nur bei allow_external) und dreht
 * die native Function-Calling-Schleife über die Provider-Registry: Modell rufen
 * → falls Tool-Aufrufe, ausführen und Ergebnisse anhängen → wiederholen, bis
 * eine reine Text-Antwort kommt oder MAX_ITERATIONS erreicht ist. Jeder Schritt
 * wird über onEvent gemeldet ({type:'status'|'tool_start'|'tool_result'|'text'|
 * 'done'|'error', ...}). Lokale Modell-Aufrufe sind GPU-serialisiert.
 *
 * Persistenz: pro Agent nur der LETZTE Lauf (frühere flow_runs-Zeilen werden
 * vorher gelöscht). Kein Audit-Log (v1).
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ServiceUnavailableError } = require('../../utils/errors');
const flowAgentsService = require('./flowAgentsService');
const providerKeysService = require('./providerKeysService');
const providerRegistry = require('./providerRegistry');
const { buildRegistry } = require('./flowToolRegistry');

const MAX_ITERATIONS = parseInt(process.env.AGENT_MAX_ITERATIONS || '8', 10);

async function persistLastRun(agentId, userId, { trigger, status, input, output, error }) {
  try {
    await db.query(`DELETE FROM flow_runs WHERE agent_id = $1`, [agentId]);
    await db.query(
      `INSERT INTO flow_runs (agent_id, user_id, trigger, status, input, output, error, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [agentId, userId, trigger, status, input || '', output || '', error || null]
    );
  } catch (err) {
    logger.warn(`persistLastRun (Agent ${agentId}) fehlgeschlagen: ${err.message}`);
  }
}

/**
 * Einen Agenten per ID ausführen.
 *
 * @param {object} args
 * @param {number} args.agentId
 * @param {number} args.userId
 * @param {string} [args.trigger] - 'manual' | 'schedule' | 'webhook'
 * @param {string} args.userInput
 * @param {(evt:object)=>void} [args.onEvent]
 * @returns {Promise<{result:string, error?:string, truncated?:boolean}>}
 */
async function runById({ agentId, userId, trigger = 'manual', userInput = '', onEvent } = {}) {
  const emit = evt => {
    if (typeof onEvent === 'function') {
      try {
        onEvent(evt);
      } catch (err) {
        logger.warn(`runFlowAgent onEvent handler warf: ${err.message}`);
      }
    }
  };

  // Ownership/Existenz — wirft NotFoundError (→ 404) VOR dem ersten SSE-Frame.
  const agent = await flowAgentsService.getAgent(agentId, userId);

  if (!agent.model) {
    // Konfigurationsproblem, das VOR dem Start bekannt ist → kein 'running',
    // direkt ein sauberes error-Event (kein Wurf: der Aufrufer wertet .error aus,
    // und im SSE-Pfad ist der Stream damit sauber terminiert).
    const message = 'Für diesen Agenten ist kein Modell gewählt.';
    emit({ type: 'error', message });
    await persistLastRun(agentId, userId, {
      trigger,
      status: 'error',
      input: userInput,
      error: message,
    });
    return { result: '', error: message };
  }

  emit({ type: 'status', status: 'running', agent: agent.name, model: agent.model });

  try {
    // Bei Cloud-Providern den verschlüsselten Key auflösen.
    let apiKey;
    let baseUrl;
    if (providerRegistry.isExternalProvider(agent.provider)) {
      const creds = await providerKeysService.getDecryptedKey(agent.provider);
      if (!creds) {
        throw new ServiceUnavailableError(
          `Für Provider "${agent.provider}" ist kein API-Key hinterlegt (Admin: Bereich Agenten → Provider-Keys).`
        );
      }
      apiKey = creds.apiKey;
      baseUrl = creds.baseUrl;
    }

    // Per-Run-Tool-Registry: externe Tools nur bei allow_external.
    const registry = buildRegistry(agent.tools, { allowExternal: agent.allowExternal });
    const toolDefs = await registry.getOllamaToolDefinitions();
    const tools = toolDefs.length > 0 ? toolDefs : undefined;
    // userId scoped den Datei-Zugriff (minio) auf das eigene Agenten-Präfix,
    // damit ein Agent NICHT fremde Dokumente lesen/überschreiben kann.
    const toolContext = { spaceIds: null, userId };

    const messages = [
      { role: 'system', content: agent.systemPrompt || '' },
      { role: 'user', content: String(userInput || '') },
    ];

    let lastText = '';
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const { content, toolCalls } = await providerRegistry.chat({
        provider: agent.provider,
        model: agent.model,
        messages,
        tools,
        apiKey,
        baseUrl,
      });

      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        const result = content || '';
        emit({ type: 'text', content: result });
        emit({ type: 'done', result });
        await persistLastRun(agentId, userId, {
          trigger,
          status: 'done',
          input: userInput,
          output: result,
        });
        return { result };
      }

      lastText = content || lastText;
      // Assistenten-Turn mit seinen Tool-Aufrufen anhängen.
      messages.push({ role: 'assistant', content: content || '', toolCalls });

      for (const call of toolCalls) {
        emit({ type: 'tool_start', tool: call.name, params: call.args });
        const result = await registry.execute(call.name, call.args, toolContext);
        emit({ type: 'tool_result', tool: call.name, result });
        messages.push({ role: 'tool', toolCallId: call.id, content: result });
      }
    }

    // MAX_ITERATIONS erreicht, noch immer Tool-Aufrufe.
    const result = lastText || 'Der Agent hat die maximale Schrittzahl erreicht.';
    emit({ type: 'done', result, truncated: true });
    await persistLastRun(agentId, userId, {
      trigger,
      status: 'done',
      input: userInput,
      output: result,
    });
    return { result, truncated: true };
  } catch (err) {
    const message = err.message || 'Agent-Lauf fehlgeschlagen';
    emit({ type: 'error', message });
    await persistLastRun(agentId, userId, {
      trigger,
      status: 'error',
      input: userInput,
      error: message,
    });
    return { result: '', error: message };
  }
}

module.exports = { runById, _internals: { persistLastRun } };
