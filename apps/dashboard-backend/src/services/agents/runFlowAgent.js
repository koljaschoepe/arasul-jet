/**
 * Einzel-Agent-Runner (Plan 010, Schritt 2)
 *
 * Führt EINEN Flow-Agenten einmal aus: lädt den (owner-scoped) Agenten, löst
 * bei Cloud-Providern den verschlüsselten API-Key auf, ruft die Provider-
 * Registry (nicht-streamend, GPU-serialisiert für lokale Modelle) und meldet
 * jeden Schritt über onEvent — dasselbe Event-Muster wie der Datei-Agent-
 * Tool-Loop (Plan 008): {type:'status'|'text'|'done'|'error', ...}.
 *
 * Der Lauf wird schlank persistiert: pro Agent nur der LETZTE Lauf (frühere
 * flow_runs-Zeilen des Agenten werden vorher gelöscht). Kein Audit-Log (v1).
 *
 * Tools kommen in Schritt 3 dazu; hier läuft ein reiner Prompt→Antwort-Turn.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ValidationError, ServiceUnavailableError } = require('../../utils/errors');
const flowAgentsService = require('./flowAgentsService');
const providerKeysService = require('./providerKeysService');
const providerRegistry = require('./providerRegistry');

/**
 * Letzten Lauf eines Agenten ersetzen (schlank: nur der letzte bleibt).
 */
async function persistLastRun(agentId, userId, { trigger, status, input, output, error }) {
  try {
    await db.query(`DELETE FROM flow_runs WHERE agent_id = $1`, [agentId]);
    await db.query(
      `INSERT INTO flow_runs (agent_id, user_id, trigger, status, input, output, error, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [agentId, userId, trigger, status, input || '', output || '', error || null]
    );
  } catch (err) {
    // Persistenz ist best-effort — ein DB-Fehler darf den Lauf nicht kippen.
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
 * @returns {Promise<{result:string, error?:string}>}
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

  emit({ type: 'status', status: 'running', agent: agent.name, model: agent.model });

  try {
    if (!agent.model) {
      throw new ValidationError('Für diesen Agenten ist kein Modell gewählt.');
    }

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

    const messages = [
      { role: 'system', content: agent.systemPrompt || '' },
      { role: 'user', content: String(userInput || '') },
    ];

    const { content } = await providerRegistry.chat({
      provider: agent.provider,
      model: agent.model,
      messages,
      apiKey,
      baseUrl,
    });

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
