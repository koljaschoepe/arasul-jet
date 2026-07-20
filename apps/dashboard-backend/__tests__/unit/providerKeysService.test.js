/**
 * Unit-Tests für den Provider-Keys-Service (Plan 010, Schritt 1).
 *
 * Die DB ist gemockt; die echte tokenCrypto (AES-256-GCM) läuft mit, um den
 * Verschlüsselungs-Round-Trip (Klartext rein → BYTEA-Blob gespeichert →
 * entschlüsselt zurück) zu beweisen. Der Klartext-Key darf nie im gespeicherten
 * Blob auftauchen.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-für-provider-keys-32byteslong';

jest.mock('../../src/database', () => ({ query: jest.fn() }));

const db = require('../../src/database');
const svc = require('../../src/services/agents/providerKeysService');
const { decryptToken } = require('../../src/utils/tokenCrypto');
const { ValidationError } = require('../../src/utils/errors');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('saveKey', () => {
  test('verschlüsselt den Key als BYTEA (kein Klartext im Blob) und upsertet', async () => {
    db.query.mockResolvedValue({
      rows: [{ provider: 'openai', base_url: null, updated_at: '2026-07-20T00:00:00Z' }],
    });
    const out = await svc.saveKey('openai', { apiKey: 'sk-geheim-123' }, 7);

    expect(out).toMatchObject({ provider: 'openai', baseUrl: null });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO flow_provider_keys/);
    expect(sql).toMatch(/ON CONFLICT \(provider\)/);

    // params: [provider, baseUrl, encryptedBuffer, createdBy]
    const [provider, baseUrl, encrypted, createdBy] = params;
    expect(provider).toBe('openai');
    expect(baseUrl).toBeNull();
    expect(createdBy).toBe(7);
    expect(Buffer.isBuffer(encrypted)).toBe(true);
    // Klartext darf im verschlüsselten Blob nicht vorkommen …
    expect(encrypted.toString('utf8')).not.toContain('sk-geheim-123');
    // … lässt sich aber wieder entschlüsseln.
    expect(decryptToken(encrypted)).toBe('sk-geheim-123');
  });

  test('trimmt und speichert eine baseUrl', async () => {
    db.query.mockResolvedValue({
      rows: [{ provider: 'openai', base_url: 'https://gw/v1', updated_at: 'x' }],
    });
    await svc.saveKey('openai', { apiKey: 'k', baseUrl: '  https://gw/v1  ' }, 1);
    expect(db.query.mock.calls[0][1][1]).toBe('https://gw/v1');
  });

  test('leerer apiKey → ValidationError (kein DB-Call)', async () => {
    await expect(svc.saveKey('openai', { apiKey: '   ' }, 1)).rejects.toThrow(ValidationError);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('unbekannter Provider → ValidationError', async () => {
    await expect(svc.saveKey('gemini', { apiKey: 'k' }, 1)).rejects.toThrow(ValidationError);
  });
});

describe('getDecryptedKey', () => {
  test('entschlüsselt den gespeicherten Blob zurück', async () => {
    const { encryptToken } = require('../../src/utils/tokenCrypto');
    const blob = encryptToken('sk-roundtrip');
    db.query.mockResolvedValue({ rows: [{ base_url: 'https://x', encrypted_key: blob }] });
    const out = await svc.getDecryptedKey('openai');
    expect(out).toEqual({ apiKey: 'sk-roundtrip', baseUrl: 'https://x' });
  });

  test('kein Eintrag → null', async () => {
    db.query.mockResolvedValue({ rows: [] });
    expect(await svc.getDecryptedKey('openai')).toBeNull();
  });

  test('nicht entschlüsselbarer Blob → ServiceUnavailableError', async () => {
    const { ServiceUnavailableError } = require('../../src/utils/errors');
    // Zufälliger Buffer, der kein gültiger AES-GCM-Blob ist → decrypt wirft.
    db.query.mockResolvedValue({
      rows: [{ base_url: null, encrypted_key: Buffer.from('kaputt-nicht-entschluesselbar') }],
    });
    await expect(svc.getDecryptedKey('openai')).rejects.toThrow(ServiceUnavailableError);
  });
});

describe('listProviders / hasKey / deleteKey', () => {
  test('listProviders gibt nur Metadaten zurück (nie den Key)', async () => {
    db.query.mockResolvedValue({
      rows: [{ provider: 'openai', base_url: null, created_at: 'a', updated_at: 'b' }],
    });
    const list = await svc.listProviders();
    expect(list).toEqual([
      { provider: 'openai', baseUrl: null, createdAt: 'a', updatedAt: 'b' },
    ]);
    // Keine Spalte encrypted_key im SELECT.
    expect(db.query.mock.calls[0][0]).not.toMatch(/encrypted_key/);
  });

  test('hasKey true/false', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    expect(await svc.hasKey('openai')).toBe(true);
    db.query.mockResolvedValueOnce({ rows: [] });
    expect(await svc.hasKey('anthropic')).toBe(false);
  });

  test('deleteKey spiegelt rowCount', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await svc.deleteKey('openai')).toBe(true);
    db.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await svc.deleteKey('openai')).toBe(false);
  });
});
