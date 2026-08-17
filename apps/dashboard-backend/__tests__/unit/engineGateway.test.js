/**
 * engineGateway (Plan 021, Schritt 2) — Engine-Auflösung + /models-Delegation.
 */

const gateway = require('../../src/services/llm/engineGateway');

describe('engineGateway.profileToCatalogId', () => {
  it.each([
    ['thor_128gb', 'thor-128'],
    ['thor_64gb', 'thor-128'],
    ['agx_orin_64gb', 'orin-64'],
    ['agx_orin_32gb', 'orin-64'],
    ['orin_nx_16gb', 'orin-64'],
    ['orin_8gb', 'orin-64'],
    ['xavier_agx', 'orin-64'],
    ['nano_4gb', 'orin-64'],
    ['rtx_pro_6000', 'rtx-pro-6000'],
    ['dgx_spark', 'dgx-spark'],
    ['dgx_station', 'dgx-station'],
    ['server_generic', 'server-generic'],
    ['generic', 'server-generic'],
    ['128gb_memory', 'server-generic'],
  ])('mappt %s -> %s (spiegelt detect-platform.sh)', (profile, expected) => {
    expect(gateway.profileToCatalogId(profile)).toBe(expected);
  });

  it('gibt null für leeres/unbekanntes Profil ohne Wert zurück', () => {
    expect(gateway.profileToCatalogId(null)).toBeNull();
    expect(gateway.profileToCatalogId(undefined)).toBeNull();
    expect(gateway.profileToCatalogId('')).toBeNull();
  });
});

describe('engineGateway.getEngineInfo', () => {
  const fakeRead = catalog => (p, _enc) => {
    // liefert nur für eine Katalog-Datei einen Wert
    for (const [id, engine] of Object.entries(catalog)) {
      if (p.endsWith(`${id}.json`)) return JSON.stringify({ engine });
    }
    throw new Error('ENOENT');
  };

  it('Override ARASUL_ENGINE gewinnt immer (auch gegen die HAL)', () => {
    const info = gateway.getEngineInfo(
      { ARASUL_ENGINE: 'vllm', JETSON_PROFILE: 'agx_orin_64gb' },
      fakeRead({ 'orin-64': 'ollama' })
    );
    expect(info).toEqual({ engine: 'vllm', source: 'override', profileId: null });
  });

  it('ignoriert einen unbekannten Override und fällt auf die HAL zurück', () => {
    const info = gateway.getEngineInfo(
      { ARASUL_ENGINE: 'sglang', JETSON_PROFILE: 'thor_128gb' },
      fakeRead({ 'thor-128': 'vllm' })
    );
    expect(info).toEqual({ engine: 'vllm', source: 'hal', profileId: 'thor-128' });
  });

  it('liest die Engine aus der HAL, wenn ein Profil gesetzt ist', () => {
    const info = gateway.getEngineInfo(
      { JETSON_PROFILE: 'agx_orin_64gb' },
      fakeRead({ 'orin-64': 'ollama' })
    );
    expect(info).toEqual({ engine: 'ollama', source: 'hal', profileId: 'orin-64' });
  });

  it('defaultet auf ollama, wenn nichts aufgelöst werden kann (Orin ohne Profil-Env)', () => {
    const info = gateway.getEngineInfo({}, () => {
      throw new Error('ENOENT');
    });
    expect(info).toEqual({ engine: 'ollama', source: 'default', profileId: null });
  });

  it('defaultet auf ollama, wenn die Katalog-Datei fehlt (profileId bleibt erhalten)', () => {
    const info = gateway.getEngineInfo({ JETSON_PROFILE: 'thor_128gb' }, () => {
      throw new Error('ENOENT');
    });
    expect(info).toEqual({ engine: 'ollama', source: 'default', profileId: 'thor-128' });
  });

  it('verwirft einen invaliden engine-Wert aus dem Katalog und defaultet', () => {
    const info = gateway.getEngineInfo(
      { JETSON_PROFILE: 'thor_128gb' },
      fakeRead({ 'thor-128': 'bogus' })
    );
    expect(info.engine).toBe('ollama');
    expect(info.source).toBe('default');
  });
});

describe('engineGateway.listModels', () => {
  it('delegiert für ollama an den /api/tags-Endpunkt', async () => {
    const httpGet = jest.fn().mockResolvedValue({ data: { models: [{ name: 'qwen3' }] } });
    const models = await gateway.listModels({ engine: 'ollama' }, httpGet);
    expect(models).toEqual([{ name: 'qwen3' }]);
    expect(httpGet).toHaveBeenCalledTimes(1);
    expect(httpGet.mock.calls[0][0]).toMatch(/\/api\/tags$/);
  });

  it('gibt [] zurück, wenn Ollama keine models liefert', async () => {
    const httpGet = jest.fn().mockResolvedValue({ data: {} });
    await expect(gateway.listModels({ engine: 'ollama' }, httpGet)).resolves.toEqual([]);
  });

  it('wirft 503, wenn der Ollama-Abruf fehlschlägt', async () => {
    const httpGet = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(gateway.listModels({ engine: 'ollama' }, httpGet)).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('wirft für vllm einen ehrlichen 503 (Schritt 7 noch offen)', async () => {
    await expect(gateway.listModels({ engine: 'vllm' }, jest.fn())).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('wirft für eine unbekannte Engine 503', async () => {
    await expect(gateway.listModels({ engine: 'xyz' }, jest.fn())).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
