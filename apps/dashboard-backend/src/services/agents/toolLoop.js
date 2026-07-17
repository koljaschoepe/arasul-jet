/**
 * Agent run loop.
 *
 * Drives a single agent turn: builds a PER-RUN ToolRegistry with only the
 * agent's declared tools, then calls Ollama's native function-calling `/api/chat`
 * repeatedly, executing tool calls until the model returns a plain text answer
 * (or MAX_ITERATIONS is reached). Every step is reported via `onEvent`.
 *
 * The Ollama invocation mirrors the existing chat path: same base URL from
 * config/services.js (`services.llm.chatEndpoint`), same {model, messages, tools}
 * request shape the tool registry already produces. Non-streaming — we need the
 * full assistant message (with tool_calls) per turn.
 */

const axios = require('axios');
const services = require('../../config/services');
const logger = require('../../utils/logger');

// Reuse the ToolRegistry *class* without polluting the global singleton.
const globalRegistry = require('../../tools/toolRegistry');
const ToolRegistry = globalRegistry.constructor;

const FilesTool = require('./tools/files');
const RagTool = require('./tools/rag');
const TerminalTool = require('./tools/terminal');

const MAX_ITERATIONS = parseInt(process.env.AGENT_MAX_ITERATIONS || '10', 10);
const OLLAMA_TIMEOUT_MS = parseInt(process.env.AGENT_LLM_TIMEOUT_MS || '120000', 10);

// Map declared tool names → tool classes.
const TOOL_CLASSES = {
  dateien: FilesTool,
  rag: RagTool,
  terminal: TerminalTool,
};

/**
 * Build a per-run registry holding only the agent's selected tools.
 */
function buildRegistry(toolNames) {
  const registry = new ToolRegistry();
  for (const name of toolNames || []) {
    const ToolClass = TOOL_CLASSES[name];
    if (ToolClass) {
      registry.register(new ToolClass());
    } else {
      logger.warn(`Agent declared unknown tool "${name}" — skipped`);
    }
  }
  return registry;
}

/**
 * Call Ollama's /api/chat once (non-streaming). Isolated for testability.
 * @returns {Promise<object>} The `message` object from the response.
 */
async function callOllama({ model, messages, tools }) {
  const body = { model, messages, stream: false };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }
  const response = await axios.post(services.llm.chatEndpoint, body, {
    timeout: OLLAMA_TIMEOUT_MS,
  });
  return response.data?.message || {};
}

/**
 * Run an agent to completion.
 *
 * @param {object} args
 * @param {object} args.agent - Parsed agent definition (from agentFile.js).
 * @param {string} args.userInput - The user's message.
 * @param {object} args.context - { workspaceId, hostPath, slug, containerName, userId, networkMode, spaceIds? }
 * @param {(evt:object)=>void} [args.onEvent] - Event sink. Event shapes:
 *   {type:'tool_start', tool, params} · {type:'tool_result', tool, result} ·
 *   {type:'text', content} · {type:'done', result, truncated?} · {type:'error', message}
 * @returns {Promise<{result:string, iterations:number, truncated?:boolean, error?:string}>}
 */
async function runAgent({ agent, userInput, context = {}, onEvent } = {}) {
  const emit = evt => {
    if (typeof onEvent === 'function') {
      try {
        onEvent(evt);
      } catch (err) {
        logger.warn(`agent onEvent handler threw: ${err.message}`);
      }
    }
  };

  if (!agent || typeof agent !== 'object') {
    emit({ type: 'error', message: 'Kein Agent uebergeben' });
    return { result: '', iterations: 0, error: 'Kein Agent uebergeben' };
  }

  const registry = buildRegistry(agent.tools);
  const tools = await registry.getOllamaToolDefinitions();

  const messages = [
    { role: 'system', content: agent.systemPrompt || '' },
    { role: 'user', content: String(userInput || '') },
  ];

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const message = await callOllama({ model: agent.model, messages, tools });
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

      if (toolCalls.length === 0) {
        const content = message.content || '';
        emit({ type: 'text', content });
        emit({ type: 'done', result: content });
        return { result: content, iterations: iteration + 1 };
      }

      // Record the assistant turn (with its tool_calls) before the tool results.
      messages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const toolName = call.function?.name;
        const params = call.function?.arguments || {};
        emit({ type: 'tool_start', tool: toolName, params });
        const result = await registry.execute(toolName, params, context);
        emit({ type: 'tool_result', tool: toolName, result });
        messages.push({ role: 'tool', content: result });
      }
    }

    // MAX_ITERATIONS hit while still calling tools — stop cleanly.
    const note = `Abgebrochen nach ${MAX_ITERATIONS} Werkzeug-Runden.`;
    emit({ type: 'done', result: note, truncated: true });
    return { result: note, iterations: MAX_ITERATIONS, truncated: true };
  } catch (err) {
    logger.error(`Agent run failed: ${err.message}`);
    emit({ type: 'error', message: err.message });
    return { result: '', iterations: 0, error: err.message };
  }
}

module.exports = {
  runAgent,
  buildRegistry,
  callOllama,
  MAX_ITERATIONS,
  TOOL_CLASSES,
};
