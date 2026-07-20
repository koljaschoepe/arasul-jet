/**
 * Unit-Tests für die Provider-Registry (Plan 010, Schritt 1).
 *
 * Der HTTP-Client wird injiziert (opts.httpClient), sodass kein echter Netz-
 * Call passiert. Geprüft: korrekter Endpoint/Body/Header pro Provider, die
 * provider-neutrale Normalisierung der Antwort, die API-Key-Pflicht externer
 * Provider und die GPU-Serialisierung des lokalen (ollama) Pfads.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { chat, isExternalProvider, PROVIDERS } = require('../../src/services/agents/providerRegistry');
const { ValidationError, ServiceUnavailableError } = require('../../src/utils/errors');

const MSGS = [
  { role: 'system', content: 'Du bist hilfreich.' },
  { role: 'user', content: 'Hallo' },
];

describe('providerRegistry.isExternalProvider', () => {
  test('ollama ist lokal, openai/anthropic sind extern', () => {
    expect(isExternalProvider(PROVIDERS.OLLAMA)).toBe(false);
    expect(isExternalProvider(PROVIDERS.OPENAI)).toBe(true);
    expect(isExternalProvider(PROVIDERS.ANTHROPIC)).toBe(true);
  });
});

describe('providerRegistry.chat — Validierung', () => {
  test('fehlender provider → ValidationError', async () => {
    await expect(chat({ model: 'x', messages: MSGS })).rejects.toThrow(ValidationError);
  });
  test('fehlendes model → ValidationError', async () => {
    await expect(chat({ provider: 'ollama', messages: MSGS })).rejects.toThrow(ValidationError);
  });
  test('leere messages → ValidationError', async () => {
    await expect(chat({ provider: 'ollama', model: 'x', messages: [] })).rejects.toThrow(
      ValidationError
    );
  });
  test('externer Provider ohne apiKey → ValidationError', async () => {
    await expect(chat({ provider: 'openai', model: 'gpt', messages: MSGS })).rejects.toThrow(
      ValidationError
    );
  });
  test('unbekannter Provider → ValidationError (nicht ServiceUnavailable)', async () => {
    const httpClient = { post: jest.fn() };
    await expect(
      chat({ provider: 'foo', model: 'x', messages: MSGS, httpClient })
    ).rejects.toThrow(ValidationError);
    expect(httpClient.post).not.toHaveBeenCalled();
  });
});

describe('providerRegistry.chat — ollama (lokal)', () => {
  test('ruft den lokalen chatEndpoint und normalisiert message', async () => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({
        data: { message: { role: 'assistant', content: 'Hi', tool_calls: [] } },
      }),
    };
    const out = await chat({
      provider: 'ollama',
      model: 'qwen2.5:3b',
      messages: MSGS,
      httpClient,
    });
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    const [url, body] = httpClient.post.mock.calls[0];
    expect(url).toMatch(/\/api\/chat$/);
    expect(body).toMatchObject({ model: 'qwen2.5:3b', stream: false });
    expect(out).toEqual({
      content: 'Hi',
      toolCalls: [],
      raw: { message: { role: 'assistant', content: 'Hi', tool_calls: [] } },
    });
  });

  test('lokale Aufrufe werden über das GPU-Gate serialisiert (nie überlappend)', async () => {
    let active = 0;
    let maxConcurrent = 0;
    const httpClient = {
      post: jest.fn().mockImplementation(async () => {
        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        await new Promise(r => setTimeout(r, 10));
        active -= 1;
        return { data: { message: { content: 'ok' } } };
      }),
    };
    await Promise.all(
      Array.from({ length: 5 }, () =>
        chat({ provider: 'ollama', model: 'm', messages: MSGS, httpClient })
      )
    );
    expect(httpClient.post).toHaveBeenCalledTimes(5);
    expect(maxConcurrent).toBe(1);
  });
});

describe('providerRegistry.chat — openai', () => {
  test('ruft /chat/completions mit Bearer-Header und normalisiert', async () => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: 'Antwort', tool_calls: [] } }] },
      }),
    };
    const out = await chat({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: MSGS,
      apiKey: 'sk-test',
      httpClient,
    });
    const [url, , cfg] = httpClient.post.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(cfg.headers.Authorization).toBe('Bearer sk-test');
    expect(out.content).toBe('Antwort');
  });

  test('respektiert eine eigene baseUrl (OpenAI-kompatibel)', async () => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({ data: { choices: [{ message: { content: 'x' } }] } }),
    };
    await chat({
      provider: 'openai',
      model: 'local-model',
      messages: MSGS,
      apiKey: 'k',
      baseUrl: 'https://gw.example.com/v1/',
      httpClient,
    });
    expect(httpClient.post.mock.calls[0][0]).toBe('https://gw.example.com/v1/chat/completions');
  });
});

describe('providerRegistry.chat — anthropic', () => {
  test('hebt system heraus, setzt Version-Header und normalisiert content-Blöcke', async () => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({
        data: {
          content: [
            { type: 'text', text: 'Teil1 ' },
            { type: 'text', text: 'Teil2' },
            { type: 'tool_use', id: 'tu_1', name: 'rag', input: { q: 'a' } },
          ],
        },
      }),
    };
    const out = await chat({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      messages: MSGS,
      apiKey: 'ak-test',
      httpClient,
    });
    const [url, body, cfg] = httpClient.post.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(cfg.headers['x-api-key']).toBe('ak-test');
    expect(cfg.headers['anthropic-version']).toBeDefined();
    expect(body.system).toBe('Du bist hilfreich.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hallo' }]);
    expect(out.content).toBe('Teil1 Teil2');
    expect(out.toolCalls).toEqual([{ id: 'tu_1', function: { name: 'rag', arguments: { q: 'a' } } }]);
  });
});

describe('providerRegistry.chat — Fehlerabbildung', () => {
  test('Provider-Fehler wird auf ServiceUnavailableError abgebildet (kein Leak)', async () => {
    const err = new Error('boom');
    err.response = { status: 500, data: { secret: 'nope' } };
    const httpClient = { post: jest.fn().mockRejectedValue(err) };
    await expect(
      chat({ provider: 'openai', model: 'x', messages: MSGS, apiKey: 'k', httpClient })
    ).rejects.toThrow(ServiceUnavailableError);
  });
});
