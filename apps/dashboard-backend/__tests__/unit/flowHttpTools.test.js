/**
 * Unit-Tests der HTTP-Flow-Tools (Plan 010, Schritt 3): web (extern, SSRF-guard)
 * und n8n (interner Webhook). httpClient wird über den context injiziert.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/documents/minioService', () => ({
  isValidMinioPath: jest.fn(() => true),
  getObject: jest.fn(),
  uploadObject: jest.fn(),
  enforceQuota: jest.fn(),
}));

const WebTool = require('../../src/services/agents/flowTools/webTool');
const N8nTool = require('../../src/services/agents/flowTools/n8nTool');
const MinioTool = require('../../src/services/agents/flowTools/minioTool');
const minioService = require('../../src/services/documents/minioService');

describe('WebTool', () => {
  const tool = new WebTool();

  test('lehnt private Ziel-IP ab (SSRF), ohne den httpClient zu rufen', async () => {
    const httpClient = { request: jest.fn() };
    const out = await tool.execute({ url: 'http://169.254.169.254/latest' }, { httpClient });
    expect(out).toMatch(/privat|reserviert|Fehler/i);
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  test('ruft eine öffentliche URL ab und gibt Status + Body (gekürzt) zurück', async () => {
    const httpClient = { request: jest.fn().mockResolvedValue({ status: 200, data: 'hallo welt' }) };
    const out = await tool.execute({ url: 'https://8.8.8.8/ping' }, { httpClient });
    expect(httpClient.request).toHaveBeenCalledTimes(1);
    const cfg = httpClient.request.mock.calls[0][0];
    expect(cfg.maxRedirects).toBe(0); // Redirects werden nicht blind verfolgt
    expect(out).toMatch(/HTTP 200/);
    expect(out).toMatch(/hallo welt/);
  });
});

describe('N8nTool', () => {
  const tool = new N8nTool();

  test('POSTet auf den internen n8n-Webhook-Pfad mit JSON-Payload', async () => {
    const httpClient = { post: jest.fn().mockResolvedValue({ status: 200, data: { ok: true } }) };
    const out = await tool.execute({ pfad: 'mein-flow', daten: '{"a":1}' }, { httpClient });
    const [url, payload] = httpClient.post.mock.calls[0];
    expect(url).toMatch(/\/webhook\/mein-flow$/);
    expect(payload).toEqual({ a: 1 });
    expect(out).toMatch(/ausgelöst/);
  });

  test('ungültiger Pfad (Traversal) → Fehler ohne Request', async () => {
    const httpClient = { post: jest.fn() };
    const out = await tool.execute({ pfad: '../../etc' }, { httpClient });
    expect(out).toMatch(/ungültig/i);
    expect(httpClient.post).not.toHaveBeenCalled();
  });
});

describe('MinioTool (Nutzer-Isolation)', () => {
  const tool = new MinioTool();
  beforeEach(() => jest.clearAllMocks());

  test('write nutzt das nutzer-eigene Präfix flow-agents/<userId>/', async () => {
    minioService.isValidMinioPath.mockReturnValue(true);
    await tool.execute({ aktion: 'write', pfad: 'notiz.txt', inhalt: 'hallo' }, { userId: 42 });
    const [key] = minioService.uploadObject.mock.calls[0];
    expect(key).toBe('flow-agents/42/notiz.txt');
  });

  test('read scoped auf das eigene Präfix — nie ein fremder Schlüssel', async () => {
    minioService.isValidMinioPath.mockReturnValue(true);
    // Fremder Nutzer-Schlüssel als Pfad → wird trotzdem unter das eigene Präfix gehängt.
    async function* gen() {
      yield Buffer.from('inhalt');
    }
    minioService.getObject.mockResolvedValue(gen());
    await tool.execute({ aktion: 'read', pfad: 'flow-agents/99/geheim.txt' }, { userId: 42 });
    expect(minioService.getObject).toHaveBeenCalledWith('flow-agents/42/flow-agents/99/geheim.txt');
  });

  test('ohne userId → fail-closed (kein MinIO-Zugriff)', async () => {
    const out = await tool.execute({ aktion: 'read', pfad: 'x.txt' }, {});
    expect(out).toMatch(/ohne Nutzer-Kontext/i);
    expect(minioService.getObject).not.toHaveBeenCalled();
  });
});
