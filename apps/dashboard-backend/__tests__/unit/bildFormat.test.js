/**
 * Ein Bild über die Warteschlange geht so an das Modell wie direkt (J35, 26.09.2026).
 *
 * `llava-phi3` zählte über `llm/chat` bei einer Farbfrage Möglichkeiten auf
 * („1. Red and Blue 2. Red and Orange …"), direkt am Modelldienst antwortete es
 * sauber. Der Unterschied war ein Wort: die Warteschlange schrieb `user: ` vor
 * die Frage, und die Vorlage des Modells legt den Prompt schon selbst in den Zug
 * des Nutzers. Geprüft wird hier, was `processChatJob` an den Modelldienst gibt.
 */

jest.mock('../../src/services/llm/llmOllamaStream', () => ({
  streamFromOllama: jest.fn().mockResolvedValue(undefined),
  onJobComplete: jest.fn(),
  destroyOllamaAgent: jest.fn(),
}));
jest.mock('../../src/services/system-settings/systemSettingsService', () => ({
  get: jest.fn(() => null),
  getNumber: jest.fn(() => null),
}));

const { streamFromOllama } = require('../../src/services/llm/llmOllamaStream');
const { processChatJob, promptAusNachrichten } = require('../../src/services/llm/llmJobProcessor');

const FRAGE = 'Which two colors does this image show? Answer in one short sentence.';
const PNG = 'iVBORw0KGgo=';

function kontext(liestBilder) {
  const database = {
    query: jest.fn(sql => {
      if (sql.includes('supports_thinking')) {
        return Promise.resolve({ rows: [{ supports_thinking: false }] });
      }
      if (sql.includes('supports_vision_input')) {
        return Promise.resolve({ rows: [{ supports_vision_input: liestBilder }] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { deps: { database, logger }, service: { notifySubscribers: jest.fn() } };
}

describe('promptAusNachrichten', () => {
  test('eine einzelne Frage geht ohne Rollenpräfix', () => {
    expect(promptAusNachrichten([{ role: 'user', content: FRAGE }])).toBe(FRAGE);
  });

  test('ein Systemzug zählt nicht als Zug', () => {
    expect(
      promptAusNachrichten([
        { role: 'system', content: 'sei knapp' },
        { role: 'user', content: FRAGE },
      ])
    ).toBe(FRAGE);
  });

  test('ein Verlauf behält seine Rollen', () => {
    expect(
      promptAusNachrichten([
        { role: 'user', content: 'Hallo' },
        { role: 'assistant', content: 'Guten Tag' },
        { role: 'user', content: 'Welche Farben?' },
      ])
    ).toBe('user: Hallo\nassistant: Guten Tag\nuser: Welche Farben?');
  });

  test('leer bleibt leer', () => {
    expect(promptAusNachrichten(undefined)).toBe('');
  });
});

describe('processChatJob mit Bild', () => {
  beforeEach(() => jest.clearAllMocks());

  test('llava-phi3 bekommt die Frage wörtlich und das Bild unverändert', async () => {
    const ctx = kontext(true);
    await processChatJob(ctx, {
      id: 'job-1',
      requested_model: 'llava-phi3',
      request_data: {
        messages: [{ role: 'user', content: FRAGE }],
        thinking: false,
        images: [PNG],
      },
    });

    expect(streamFromOllama).toHaveBeenCalledTimes(1);
    const argumente = streamFromOllama.mock.calls[0];
    const [, jobId, prompt] = argumente;
    expect(jobId).toBe('job-1');
    expect(prompt).toBe(FRAGE);
    expect(prompt).not.toMatch(/^user:/);
    expect(argumente[9]).toEqual([PNG]);
  });
});
