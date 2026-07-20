/**
 * Provider-Registry (Plan 010, Schritt 1)
 *
 * Eine Abstraktion über den bisher fest auf Ollama verdrahteten Modell-Aufruf
 * (toolLoop.js → callOllama). Dispatcht pro Agent auf:
 *   - 'ollama'    → lokales Ollama /api/chat (GPU, seriell über gpuGate)
 *   - 'openai'    → OpenAI-kompatibler /v1/chat/completions-Endpoint
 *   - 'anthropic' → Anthropic /v1/messages
 *
 * GPU-Serialisierung: der lokale (ollama) Pfad läuft IMMER durch withGpuLock,
 * statt — wie das alte callOllama — direkt und ungebremst per axios. Damit ist
 * garantiert, dass nie zwei lokale Modell-Läufe gleichzeitig die eine Jetson-GPU
 * belasten (siehe gpuGate.js). Cloud-Provider berühren die GPU nicht.
 *
 * Rückgabe ist provider-neutral normalisiert:
 *   { content: string, toolCalls: Array<{id?, function:{name, arguments}}>, raw }
 * sodass die Fluss-Engine (Schritt 4) und der Einzel-Agent-Runner (Schritt 2)
 * eine einheitliche Form sehen, egal welcher Provider antwortet.
 *
 * Die Registry ist ein reiner Dispatcher: API-Key und Basis-URL externer
 * Provider gibt der Aufrufer herein (aufgelöst über providerKeysService). So
 * bleibt sie ohne DB testbar.
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

/**
 * Ist der Provider ein Cloud-Anbieter (braucht API-Key, keine GPU)?
 * @param {string} provider
 * @returns {boolean}
 */
function isExternalProvider(provider) {
  return provider === PROVIDERS.OPENAI || provider === PROVIDERS.ANTHROPIC;
}

// ---------------------------------------------------------------------------
// Ollama (lokal) — GPU-serialisiert
// ---------------------------------------------------------------------------
async function dispatchOllama({ model, messages, tools, httpClient }) {
  const body = { model, messages, stream: false };
  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }
  // Jeder lokale Aufruf strikt seriell über das GPU-Gate.
  const response = await withGpuLock(() =>
    httpClient.post(services.llm.chatEndpoint, body, { timeout: LOCAL_TIMEOUT_MS })
  );
  const message = response.data?.message || {};
  return {
    content: message.content || '',
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    raw: response.data,
  };
}

// ---------------------------------------------------------------------------
// OpenAI-kompatibel
// ---------------------------------------------------------------------------
async function dispatchOpenAI({ model, messages, tools, apiKey, baseUrl, httpClient }) {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const body = { model, messages, stream: false };
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
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
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

  // System-Nachrichten hebt Anthropic auf die Top-Level-Ebene.
  const systemText = messages
    .filter(m => m.role === 'system')
    .map(m => m.content || '')
    .join('\n')
    .trim();
  const convo = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '') }));

  const body = {
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: convo,
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
    .map(b => ({ id: b.id, function: { name: b.name, arguments: b.input || {} } }));

  return { content, toolCalls, raw: response.data };
}

/**
 * Einen Chat-Turn beim gewählten Provider ausführen (nicht-streamend).
 *
 * @param {object} opts
 * @param {string} opts.provider  - 'ollama' | 'openai' | 'anthropic'
 * @param {string} opts.model     - Modellname beim Provider
 * @param {Array}  opts.messages  - Chat-Nachrichten ({role, content, ...})
 * @param {Array}  [opts.tools]   - Tool-Definitionen (OpenAI-Funktionsschema)
 * @param {string} [opts.apiKey]  - API-Key (nur externe Provider)
 * @param {string} [opts.baseUrl] - Basis-URL (optional, externe Provider)
 * @param {object} [opts.httpClient] - Injizierbarer HTTP-Client (Tests); Default axios
 * @returns {Promise<{content:string, toolCalls:Array, raw:any}>}
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
    // Netzwerk-/Provider-Fehler auf einen klaren 503 abbilden; Rohantwort nie leaken.
    const status = err.response?.status;
    logger.error(`providerRegistry.chat(${provider}) fehlgeschlagen: ${err.message}`, { status });
    throw new ServiceUnavailableError(
      `Modell-Provider "${provider}" nicht erreichbar oder Fehlerantwort${status ? ` (HTTP ${status})` : ''}.`
    );
  }
}

module.exports = { chat, isExternalProvider, PROVIDERS };
