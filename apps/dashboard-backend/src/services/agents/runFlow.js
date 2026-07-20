/**
 * Fluss-Runner (Plan 010, Schritt 4)
 *
 * Orchestriert einen Fluss-Lauf: Fluss laden (owner-scoped), Graph validieren,
 * Agenten-Eigentümerschaft VOR dem Start prüfen, die Fluss-Engine ausführen und
 * den letzten Lauf persistieren. Trennt die Bookkeeping-Sorge von der reinen
 * Graph-Ausführung in flowEngine.
 */

const logger = require('../../utils/logger');
const flowsService = require('./flowsService');
const flowEngine = require('./flowEngine');

/**
 * @param {object} args
 * @param {number} args.flowId
 * @param {number} args.userId
 * @param {string} [args.trigger] - 'manual' | 'schedule' | 'webhook'
 * @param {string} [args.input]
 * @param {(evt:object)=>void} [args.onEvent]
 * @returns {Promise<{result:string, error?:string}>}
 */
async function runById({ flowId, userId, trigger = 'manual', input = '', onEvent } = {}) {
  const emit = evt => {
    if (typeof onEvent === 'function') {
      try {
        onEvent(evt);
      } catch {
        /* ignore */
      }
    }
  };

  // Existenz/Ownership + Graph-Validierung + Agenten-Eigentümerschaft laufen
  // ALLE vor dem ersten SSE-Frame und werden NICHT gefangen — so werden
  // NotFoundError/ValidationError als echte HTTP 404/400 vom asyncHandler
  // beantwortet, bevor der Stream geöffnet ist (kein „200 + error-Frame").
  const flow = await flowsService.getFlow(flowId, userId);
  const { agentIds } = flowEngine.validateGraph(flow.graph);
  await flowsService.assertAgentsOwned(agentIds, userId);

  // Ab hier ist der Fluss lauffähig — jetzt den Stream eröffnen.
  emit({ type: 'flow_start', flow: flow.name });

  try {
    const { result } = await flowEngine.executeFlow({
      graph: flow.graph,
      userId,
      initialInput: input,
      onEvent: emit,
    });

    emit({ type: 'flow_done', result });
    await persistSafe(flowId, userId, { trigger, status: 'done', input, output: result });
    return { result };
  } catch (err) {
    const message = err.message || 'Fluss-Lauf fehlgeschlagen';
    emit({ type: 'flow_error', message });
    await persistSafe(flowId, userId, { trigger, status: 'error', input, error: message });
    return { result: '', error: message };
  }
}

async function persistSafe(flowId, userId, fields) {
  try {
    await flowsService.persistFlowRun(flowId, userId, fields);
  } catch (err) {
    logger.warn(`persistFlowRun (Fluss ${flowId}) fehlgeschlagen: ${err.message}`);
  }
}

module.exports = { runById };
