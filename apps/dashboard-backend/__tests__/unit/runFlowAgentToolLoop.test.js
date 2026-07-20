/**
 * Unit-Tests der Tool-Schleife im Einzel-Agent-Runner (Plan 010, Schritt 3).
 * providerRegistry, flowAgentsService und die Tool-Registry sind gemockt, um
 * einen mehrstufigen Function-Calling-Ablauf deterministisch zu prüfen:
 * Modell fordert Tool → Tool wird ausgeführt & Ergebnis angehängt → Modell
 * antwortet final.
 */

jest.mock('../../src/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/agents/flowAgentsService', () => ({ getAgent: jest.fn() }));
jest.mock('../../src/services/agents/providerKeysService', () => ({ getDecryptedKey: jest.fn() }));
jest.mock('../../src/services/agents/providerRegistry', () => ({
  chat: jest.fn(),
  isExternalProvider: jest.requireActual('../../src/services/agents/providerRegistry')
    .isExternalProvider,
  PROVIDERS: jest.requireActual('../../src/services/agents/providerRegistry').PROVIDERS,
}));

const mockRegistry = {
  getOllamaToolDefinitions: jest.fn(),
  execute: jest.fn(),
};
jest.mock('../../src/services/agents/flowToolRegistry', () => ({
  buildRegistry: jest.fn(() => mockRegistry),
}));

const flowAgentsService = require('../../src/services/agents/flowAgentsService');
const providerRegistry = require('../../src/services/agents/providerRegistry');
const { buildRegistry } = require('../../src/services/agents/flowToolRegistry');
const runFlowAgent = require('../../src/services/agents/runFlowAgent');

const AGENT = {
  id: 5,
  name: 'Tooler',
  provider: 'ollama',
  model: 'qwen3:8b',
  systemPrompt: 'sys',
  tools: ['rag'],
  allowExternal: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  flowAgentsService.getAgent.mockResolvedValue(AGENT);
  mockRegistry.getOllamaToolDefinitions.mockResolvedValue([
    { type: 'function', function: { name: 'rag', description: 'x', parameters: { type: 'object', properties: {} } } },
  ]);
  mockRegistry.execute.mockResolvedValue('Gefundene Stellen: Berlin ist die Hauptstadt.');
});

test('führt einen Tool-Aufruf aus und liefert danach die finale Antwort', async () => {
  providerRegistry.chat
    .mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call_0', name: 'rag', args: { frage: 'Hauptstadt?' } }] })
    .mockResolvedValueOnce({ content: 'Die Hauptstadt ist Berlin.', toolCalls: [] });

  const events = [];
  const out = await runFlowAgent.runById({
    agentId: 5,
    userId: 7,
    userInput: 'Was ist die Hauptstadt?',
    onEvent: e => events.push(e),
  });

  expect(out).toEqual({ result: 'Die Hauptstadt ist Berlin.' });
  // allow_external wird an die Registry durchgereicht
  expect(buildRegistry).toHaveBeenCalledWith(['rag'], { allowExternal: false });
  // Tool wurde mit den Modell-Argumenten + Nutzer-Scope ausgeführt
  expect(mockRegistry.execute).toHaveBeenCalledWith('rag', { frage: 'Hauptstadt?' }, {
    spaceIds: null,
    userId: 7,
  });
  // Event-Reihenfolge: status → tool_start → tool_result → text → done
  expect(events.map(e => e.type)).toEqual(['status', 'tool_start', 'tool_result', 'text', 'done']);

  // Zweiter Modell-Aufruf sah den assistant-Turn + das tool-Ergebnis
  const secondMessages = providerRegistry.chat.mock.calls[1][0].messages;
  expect(secondMessages).toEqual([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'Was ist die Hauptstadt?' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'call_0', name: 'rag', args: { frage: 'Hauptstadt?' } }] },
    { role: 'tool', toolCallId: 'call_0', content: 'Gefundene Stellen: Berlin ist die Hauptstadt.' },
  ]);
});

test('ohne Tools läuft es als einfacher Prompt→Antwort-Turn', async () => {
  mockRegistry.getOllamaToolDefinitions.mockResolvedValue([]);
  providerRegistry.chat.mockResolvedValueOnce({ content: 'Hallo', toolCalls: [] });

  const events = [];
  const out = await runFlowAgent.runById({ agentId: 5, userId: 7, userInput: 'hi', onEvent: e => events.push(e) });

  expect(out).toEqual({ result: 'Hallo' });
  // tools=undefined, wenn keine definiert sind
  expect(providerRegistry.chat.mock.calls[0][0].tools).toBeUndefined();
  expect(events.map(e => e.type)).toEqual(['status', 'text', 'done']);
});

test('endlose Tool-Schleife wird bei MAX_ITERATIONS abgebrochen (truncated)', async () => {
  // Modell fordert IMMER ein Tool → Loop muss begrenzen.
  providerRegistry.chat.mockResolvedValue({
    content: 'denke…',
    toolCalls: [{ id: 'call_x', name: 'rag', args: {} }],
  });

  const out = await runFlowAgent.runById({ agentId: 5, userId: 7, userInput: 'x', onEvent: () => {} });
  expect(out.truncated).toBe(true);
  // Default MAX_ITERATIONS = 8
  expect(providerRegistry.chat.mock.calls.length).toBe(8);
});
