/**
 * Jeder Modellschritt eines Flows steht im Protokoll der Modellaufrufe
 * (J35, Migration 189).
 *
 * Die App-Bau-Probe vom 26.09.2026: nach einer Freigabe schrieb ein Flow
 * einen Satz mit dem Modell, und in `ki_aufrufe` standen nur die Auslesungen.
 * Gemessen wird hier, dass JEDE Runde der Schleife -- auch die, die ein
 * Werkzeug ruft -- ueber `kiProtokoll.flowSchritt` geht, mit App, Stand,
 * Einreicher und Lauf aus dem Kontext, und dass eine Schleife ohne Lauf
 * nichts hinterlaesst.
 */

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../../src/database', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/flows/gpuQueue', () => ({ withGpuLock: fn => fn() }));
jest.mock('../../src/services/app/kiProtokoll', () => ({
  flowSchritt: jest.fn((lauf, modell, arbeit) => arbeit()),
}));

const axios = require('axios');
const kiProtokoll = require('../../src/services/app/kiProtokoll');
const { runFlowLoop } = require('../../src/services/flows/toolLoop');

const KONTEXT = {
  runId: 12,
  slug: 'bescheid',
  appId: 'abschluss',
  stand: 'live',
  einreicherId: 5,
  userId: 1,
};

function werkzeug(name, antwort) {
  return {
    name,
    toOllamaToolDefinition: () => ({ type: 'function', function: { name, parameters: {} } }),
    execute: jest.fn(async () => antwort),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('jede Runde, auch die nach der Freigabe, geht mit dem Lauf ins Protokoll', async () => {
  axios.post
    .mockResolvedValueOnce({
      data: {
        message: {
          content: '',
          tool_calls: [{ function: { name: 'freigabe_anfordern', arguments: {} } }],
        },
      },
    })
    .mockResolvedValueOnce({ data: { message: { content: 'Der Bescheid ist freigegeben.' } } });

  const ergebnis = await runFlowLoop({
    model: 'qwen3.8:27b-q4_K_M',
    systemPrompt: 's',
    userInput: 'u',
    tools: [werkzeug('freigabe_anfordern', 'bestaetigt')],
    context: KONTEXT,
  });

  expect(ergebnis.result).toBe('Der Bescheid ist freigegeben.');
  expect(kiProtokoll.flowSchritt).toHaveBeenCalledTimes(2);
  for (const [lauf, modell] of kiProtokoll.flowSchritt.mock.calls) {
    expect(lauf).toEqual({
      runId: 12,
      flowName: 'bescheid',
      appId: 'abschluss',
      stand: 'live',
      einreicherId: 5,
      userId: 1,
    });
    expect(modell).toBe('qwen3.8:27b-q4_K_M');
  }
});

test('ein externes Modell steht mit seinem Anbieter da', async () => {
  axios.post.mockResolvedValueOnce({
    data: { choices: [{ message: { role: 'assistant', content: 'fertig' } }] },
  });
  await runFlowLoop({
    model: 'qwen3.8:27b-q4_K_M',
    extern: { anbieter: 'mistral', modell: 'mistral-large', basisUrl: 'https://x', schluessel: 'k' },
    systemPrompt: 's',
    userInput: 'u',
    context: KONTEXT,
  });
  expect(kiProtokoll.flowSchritt.mock.calls[0][1]).toBe('mistral/mistral-large');
});

test('ohne Lauf im Kontext steht nichts im Protokoll', async () => {
  axios.post.mockResolvedValueOnce({ data: { message: { content: 'x' } } });
  await runFlowLoop({ model: 'm', systemPrompt: 's', userInput: 'u', context: {} });
  expect(kiProtokoll.flowSchritt).not.toHaveBeenCalled();
});
