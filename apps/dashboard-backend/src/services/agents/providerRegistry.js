/**
 * Provider-Registry (Plan 010, Schritt 1 + Tool-Round-Trip in Schritt 3)
 *
 * Eine Abstraktion über den bisher fest auf Ollama verdrahteten Modell-Aufruf.
 * Dispatcht pro Agent auf:
 *   - 'ollama'    → lokales Ollama /api/chat (GPU, seriell über gpuGate)
 *   - 'openai'    → OpenAI-kompatibler /v1/chat/completions-Endpoint
 *   - 'anthropic' → Anthropic /v1/messages
 *
 * GPU-Serialisierung: der lokale (ollama) Pfad läuft IMMER durch withGpuLock,
 * damit nie zwei lokale Modell-Läufe gleichzeitig die eine Jetson-GPU belasten.
 * Cloud-Provider berühren die GPU nicht.
 *
 * Provider-neutrale Nachrichten (INTERNAL shape) — die Fluss-Engine/der Runner
 * arbeiten NUR damit, die Registry übersetzt pro Provider:
 *   { role:'system'|'user', content }
 *   { role:'assistant', content, toolCalls?: [{ id, name, args }] }
 *   { role:'tool', toolCallId, content }
 *
 * Rückgabe ist ebenfalls normalisiert:
 *   { content: string, toolCalls: Array<{ id, name, args }>, raw }
 * sodass ein Tool-Loop (Schritt 3) provider-unabhängig funktioniert.
 */

const axios = require('axios');
const services = require('../../config/services');
const logger = require('../../utils/logger');
const { withGpuLock } = require('./gpuGate');
const { ValidationError, ServiceUnavailableError } = require('../../utils/errors');

const PROVIDERS = Object.freeze({
  OLLAMA: 'ollama',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
});

const CLOUD_TIMEOUT_MS = parseInt(process.env.AGENT_CLOUD_TIMEOUT_MS || '120000', 10);
const LOCAL_TIMEOUT_MS = parseInt(process.env.AGENT_LLM_TIMEOUT_MS || '120000', 10);
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = parseInt(process.env.AGENT_MAX_TOKENS || '2048', 10);

function isExternalProvider(provider) {
  return provider === PROVIDERS.OPENAI || provider === PROVIDERS.ANTHROPIC;
}

// ---------------------------------------------------------------------------
// Nachrichten-Übersetzung INTERNAL → Provider-spezifisch
// ---------------------------------------------------------------------------
function toOllamaMessages(messages) {
  return messages.map(m => {
    if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) {
      return {
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.toolCalls.map(tc => ({
          function: { name: tc.name, arguments: tc.args || {} },
        })),
      };
    }
    if (m.role === 'tool') {
      return { role: 'tool', content: String(m.content ?? '') };
    }
    return { role: m.role, content: String(m.content ?? '') };
  });
}

function toOpenAIMessages(messages) {
  return messages.map(m => {
    if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
        })),
      };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: String(m.content ?? '') };
    }
    return { role: m.role, content: String(m.content ?? '') };
  });
}

function toAnthropicMessages(messages) {
  const convo = [];
  // Aufeinanderfolgende tool-Ergebnisse (parallele Tool-Aufrufe eines Turns)
  // MÜSSEN in EINER user-Nachricht mit mehreren tool_result-Blöcken gebündelt
  // werden — Anthropic verlangt strikt alternierende Rollen und lehnt zwei
  // aufeinanderfolgende user-Nachrichten sonst mit 400 ab.
  let pendingToolResults = null;
  const flushToolResults = () => {
    if (pendingToolResults) {
      convo.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = null;
    }
  };

  for (const m of messages) {
    if (m.role === 'system') {
      continue;
    }
    if (m.role === 'tool') {
      if (!pendingToolResults) {
        pendingToolResults = [];
      }
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: String(m.content ?? ''),
      });
      continue;
    }
    // Jede Nicht-tool-Nachricht schließt einen offenen tool_result-Block ab.
    flushToolResults();
    if (m.role === 'assistant') {
      const blocks = [];
      if (m.content) {
        blocks.push({ type: 'text', text: String(m.content) });
      }
      for (const tc of m.toolCalls || []) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args || {} });
      }
      // Leere Assistant-Nachricht (kein Text, keine Tool-Aufrufe) auslassen —
      // Anthropic lehnt content:'' mit 400 ab.
      if (blocks.length === 0) {
        continue;
      }
      convo.push({ role: 'assistant', content: blocks });
    } else if (m.role === 'user') {
      convo.push({ role: 'user', content: String(m.content ?? '') });
    }
  }
  flushToolResults();
  return convo;
}

// Ollama-Tool-Calls (kein id) → INTERNAL {id, name, args}
function normalizeOllamaToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  return toolCalls.map((tc, i) => {
    const fn = tc.function || {};
    let args = fn.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = { _raw: fn.arguments };
      }
    }
    return { id: tc.id || `call_${i}`, name: fn.name, args: args || {} };
  });
}

function normalizeOpenAIToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  return toolCalls.map((tc, i) => {
    const fn = tc.function || {};
    let args = fn.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = { _raw: fn.arguments };
      }
    }
    return { id: tc.id || `call_${i}`, name: fn.name, args: args || {} };
  });
}

// ---------------------------------------------------------------------------
// Ollama (lokal) — GPU-serialisiert
// ---------------------------------------------------------------------------
async function dispatchOllama({ model, messages, tools, httpClient }) {
  const body = { model, messages: toOllamaMessages(messages), stream: false };
  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }
  const response = await withGpuLock(() =>
    httpClient.post(services.llm.chatEndpoint, body, { timeout: LOCAL_TIMEOUT_MS })
  );
  const message = response.data?.message || {};
  return {
    content: message.content || '',
    toolCalls: normalizeOllamaToolCalls(message.tool_calls),
    raw: response.data,
  };
}

// ---------------------------------------------------------------------------
// OpenAI-kompatibel
// ---------------------------------------------------------------------------
async function dispatchOpenAI({ model, messages, tools, apiKey, baseUrl, httpClient }) {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const body = { model, messages: toOpenAIMessages(messages), stream: false };
  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }
  const response = await httpClient.post(`${base}/chat/completions`, body, {
    timeout: CLOUD_TIMEOUT_MS,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  const message = response.data?.choices?.[0]?.message || {};
  return {
    content: message.content || '',
    toolCalls: normalizeOpenAIToolCalls(message.tool_calls),
    raw: response.data,
  };
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------
function toAnthropicTools(tools) {
  if (!Array.isArray(tools)) {
    return undefined;
  }
  return tools
    .map(t => {
      const fn = t.function || t;
      if (!fn || !fn.name) {
        return null;
      }
      return {
        name: fn.name,
        description: fn.description || '',
        input_schema: fn.parameters || { type: 'object', properties: {} },
      };
    })
    .filter(Boolean);
}

async function dispatchAnthropic({ model, messages, tools, apiKey, baseUrl, httpClient }) {
  const base = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');

  const systemText = messages
    .filter(m => m.role === 'system')
    .map(m => m.content || '')
    .join('\n')
    .trim();

  const body = {
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: toAnthropicMessages(messages),
  };
  if (systemText) {
    body.system = systemText;
  }
  const mappedTools = toAnthropicTools(tools);
  if (mappedTools && mappedTools.length > 0) {
    body.tools = mappedTools;
  }

  const response = await httpClient.post(`${base}/v1/messages`, body, {
    timeout: CLOUD_TIMEOUT_MS,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
  });

  const blocks = Array.isArray(response.data?.content) ? response.data.content : [];
  const content = blocks
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('');
  const toolCalls = blocks
    .filter(b => b.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, args: b.input || {} }));

  return { content, toolCalls, raw: response.data };
}

/**
 * Einen Chat-Turn beim gewählten Provider ausführen (nicht-streamend).
 *
 * @param {object} opts
 * @param {string} opts.provider
 * @param {string} opts.model
 * @param {Array}  opts.messages  - INTERNAL-Nachrichten (s. Kopf)
 * @param {Array}  [opts.tools]   - Tool-Definitionen (OpenAI-Funktionsschema)
 * @param {string} [opts.apiKey]
 * @param {string} [opts.baseUrl]
 * @param {object} [opts.httpClient]
 * @returns {Promise<{content:string, toolCalls:Array<{id,name,args}>, raw:any}>}
 */
async function chat(opts = {}) {
  const { provider, model, messages, tools, apiKey, baseUrl, httpClient = axios } = opts;

  if (!provider) {
    throw new ValidationError('provider ist erforderlich');
  }
  if (!model) {
    throw new ValidationError('model ist erforderlich');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError('messages (nicht leer) sind erforderlich');
  }
  if (isExternalProvider(provider) && !apiKey) {
    throw new ValidationError(`Provider "${provider}" benötigt einen API-Key`);
  }

  try {
    switch (provider) {
      case PROVIDERS.OLLAMA:
        return await dispatchOllama({ model, messages, tools, httpClient });
      case PROVIDERS.OPENAI:
        return await dispatchOpenAI({ model, messages, tools, apiKey, baseUrl, httpClient });
      case PROVIDERS.ANTHROPIC:
        return await dispatchAnthropic({ model, messages, tools, apiKey, baseUrl, httpClient });
      default:
        throw new ValidationError(`Unbekannter Provider "${provider}"`);
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    const status = err.response?.status;
    logger.error(`providerRegistry.chat(${provider}) fehlgeschlagen: ${err.message}`, { status });
    throw new ServiceUnavailableError(
      `Modell-Provider "${provider}" nicht erreichbar oder Fehlerantwort${status ? ` (HTTP ${status})` : ''}.`
    );
  }
}

module.exports = { chat, isExternalProvider, PROVIDERS };
