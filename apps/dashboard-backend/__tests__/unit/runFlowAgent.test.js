/**
 * Unit-Tests für den Einzel-Agent-Runner (Plan 010, Schritt 2).
 * Agent-Service, Provider-Registry und Provider-Keys sind gemockt; geprüft:
 * Event-Reihenfolge (status→text→done), Cloud-Key-Auflösung, Fehler → error-Event.
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

const flowAgentsService = require('../../src/services/agents/flowAgentsService');
const providerKeysService = require('../../src/services/agents/providerKeysService');
const providerRegistry = require('../../src/services/agents/providerRegistry');
const runFlowAgent = require('../../src/services/agents/runFlowAgent');
const { NotFoundError } = require('../../src/utils/errors');

const LOCAL_AGENT = {
  id: 5,
  name: 'Lokal',
  provider: 'ollama',
  model: 'qwen2.5:3b',
  systemPrompt: 'sys',
  tools: [],
};

beforeEach(() => jest.clearAllMocks());

test('lokaler Agent: status → text → done, kein Key-Lookup', async () => {
  flowAgentsService.getAgent.mockResolvedValue(LOCAL_AGENT);
  providerRegistry.chat.mockResolvedValue({ content: 'Antwort', toolCalls: [] });

  const events = [];
  const out = await runFlowAgent.runById({
    agentId: 5,
    userId: 7,
    userInput: 'Hallo',
    onEvent: e => events.push(e),
  });

  expect(out).toEqual({ result: 'Antwort' });
  expect(events.map(e => e.type)).toEqual(['status', 'text', 'done']);
  expect(events[1]).toMatchObject({ content: 'Antwort' });
  expect(providerKeysService.getDecryptedKey).not.toHaveBeenCalled();
  // messages an die Registry: system + user
  expect(providerRegistry.chat.mock.calls[0][0].messages).toEqual([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'Hallo' },
  ]);
});

test('Cloud-Agent: löst Key auf und reicht ihn an die Registry', async () => {
  flowAgentsService.getAgent.mockResolvedValue({
    ...LOCAL_AGENT,
    provider: 'openai',
    model: 'gpt-4o-mini',
  });
  providerKeysService.getDecryptedKey.mockResolvedValue({ apiKey: 'sk-x', baseUrl: null });
  providerRegistry.chat.mockResolvedValue({ content: 'Cloud', toolCalls: [] });

  const events = [];
  await runFlowAgent.runById({ agentId: 5, userId: 7, userInput: 'hi', onEvent: e => events.push(e) });

  expect(providerKeysService.getDecryptedKey).toHaveBeenCalledWith('openai');
  expect(providerRegistry.chat.mock.calls[0][0].apiKey).toBe('sk-x');
  expect(events[events.length - 1].type).toBe('done');
});

test('Cloud-Agent ohne hinterlegten Key → error-Event, kein Registry-Call', async () => {
  flowAgentsService.getAgent.mockResolvedValue({ ...LOCAL_AGENT, provider: 'anthropic', model: 'c' });
  providerKeysService.getDecryptedKey.mockResolvedValue(null);

  const events = [];
  const out = await runFlowAgent.runById({ agentId: 5, userId: 7, userInput: 'x', onEvent: e => events.push(e) });

  expect(out.error).toMatch(/kein API-Key/i);
  expect(events.some(e => e.type === 'error')).toBe(true);
  expect(providerRegistry.chat).not.toHaveBeenCalled();
});

test('Agent ohne Modell → error-Event', async () => {
  flowAgentsService.getAgent.mockResolvedValue({ ...LOCAL_AGENT, model: '' });
  const events = [];
  const out = await runFlowAgent.runById({ agentId: 5, userId: 7, userInput: 'x', onEvent: e => events.push(e) });
  expect(out.error).toMatch(/kein Modell/i);
  expect(events.some(e => e.type === 'error')).toBe(true);
});

test('unbekannter/fremder Agent → NotFoundError bevor ein Event fließt', async () => {
  flowAgentsService.getAgent.mockRejectedValue(new NotFoundError('Agent nicht gefunden'));
  const events = [];
  await expect(
    runFlowAgent.runById({ agentId: 9, userId: 7, userInput: 'x', onEvent: e => events.push(e) })
  ).rejects.toThrow(NotFoundError);
  expect(events).toHaveLength(0);
});
