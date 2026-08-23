/**
 * Ein Modell über einen Link hinzufügen (Entscheidung Kolja, 23.08.2026).
 *
 * Der Kunde soll neue Modelle nachladen können, auch wenn sein Gerät nie
 * wieder eine Software-Aktualisierung sieht. Diese Tests halten fest, was
 * dabei angenommen und was abgelehnt wird — die Ablehnung ist der wichtigere
 * Teil: die gelesene Kennung landet in einer HTTP-Adresse.
 */

jest.mock('axios');
const axios = require('axios');

const { quelleLesen, variantenHolen, ramFuer } = require('../../src/services/llm/modellQuelle');

describe('quelleLesen', () => {
  test.each([
    ['https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF', 'hf.co/unsloth/Qwen3-30B-A3B-GGUF'],
    ['https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF/tree/main', 'hf.co/unsloth/Qwen3-30B-A3B-GGUF'],
    ['https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF/', 'hf.co/unsloth/Qwen3-30B-A3B-GGUF'],
    ['hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS', 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS'],
    ['unsloth/Qwen3-30B-A3B-GGUF', 'hf.co/unsloth/Qwen3-30B-A3B-GGUF'],
  ])('nimmt %s an', (eingabe, erwartet) => {
    const r = quelleLesen(eingabe);
    expect(r.art).toBe('huggingface');
    expect(r.name).toBe(erwartet);
  });

  test('erkennt ein Modell aus Ollamas eigener Ablage', () => {
    const r = quelleLesen('llama3.2:3b');
    expect(r.art).toBe('ollama');
    expect(r.name).toBe('llama3.2:3b');
    expect(r.repo).toBeNull();
  });

  test.each([
    ['https://example.com/boese/modell', /huggingface\.co/],
    ['../etc/passwd', /weder ein HuggingFace-Link/],
    ['unsloth/Qwen3/GGUF/noch-eins', /weder ein HuggingFace-Link/],
    ['', /Link oder einen Modellnamen/],
    ['   ', /Link oder einen Modellnamen/],
  ])('lehnt %s ab', (eingabe, muster) => {
    expect(() => quelleLesen(eingabe)).toThrow(muster);
  });

  test('lehnt eine Variante mit Sonderzeichen ab', () => {
    expect(() => quelleLesen('unsloth/Modell:../../etc')).toThrow(/Ungültige Variante/);
  });

  test('lehnt eine zu lange Angabe ab', () => {
    expect(() => quelleLesen(`a/${'b'.repeat(400)}`)).toThrow(/zu lang/);
  });
});

describe('ramFuer', () => {
  test('rechnet wie der automatische Katalog-Import', () => {
    // Dieselbe Formel wie in modelSyncHelpers: Groesse in GB mal 1,3,
    // aufgerundet, mindestens 2.
    expect(ramFuer(16.4e9)).toBe(22);
    expect(ramFuer(0)).toBe(2);
    expect(ramFuer(1e9)).toBe(2);
  });
});

describe('variantenHolen', () => {
  const antwortMit = siblings => ({ status: 200, data: { gated: false, siblings } });

  test('liest Quantisierung und Groesse aus den Dateinamen', async () => {
    axios.get.mockResolvedValueOnce(
      antwortMit([
        { rfilename: 'Qwen3-30B-A3B-IQ4_XS.gguf', size: 16_400_000_000 },
        { rfilename: 'Qwen3-30B-A3B-Q2_K.gguf', size: 11_300_000_000 },
        { rfilename: 'README.md', size: 1000 },
      ])
    );

    const v = await variantenHolen('unsloth/Qwen3-30B-A3B-GGUF');

    expect(v.map(x => x.tag)).toEqual(['IQ4_XS', 'Q2_K']);
    expect(v[0].groesseBytes).toBe(16_400_000_000);
    expect(v[0].ramGb).toBe(22);
  });

  test('laesst aufgeteilte Dateien weg', async () => {
    // Ollama kann `-00001-of-00002.gguf` nicht ueber einen Tag laden. Sie
    // anzubieten hiesse, einen Fehlschlag zu verkaufen.
    axios.get.mockResolvedValueOnce(
      antwortMit([
        { rfilename: 'BF16/Qwen3-BF16-00001-of-00002.gguf', size: 49e9 },
        { rfilename: 'Qwen3-Q4_K_M.gguf', size: 18e9 },
      ])
    );

    const v = await variantenHolen('unsloth/Qwen3-30B-A3B-GGUF');
    expect(v.map(x => x.tag)).toEqual(['Q4_K_M']);
  });

  test('meldet eine freigabepflichtige Ablage verstaendlich', async () => {
    axios.get.mockResolvedValueOnce({ status: 200, data: { gated: 'auto', siblings: [] } });
    await expect(variantenHolen('meta-llama/Llama-3')).rejects.toThrow(/freigabepflichtig/);
  });

  test('meldet eine unbekannte Ablage als 404-Fall', async () => {
    axios.get.mockResolvedValueOnce({ status: 404, data: {} });
    await expect(variantenHolen('gibt/es-nicht')).rejects.toThrow(/gibt es bei HuggingFace nicht/);
  });

  test('meldet fehlendes Netz als Dienst nicht erreichbar', async () => {
    axios.get.mockRejectedValueOnce(Object.assign(new Error('getaddrinfo'), { code: 'EAI_AGAIN' }));
    await expect(variantenHolen('unsloth/Qwen3')).rejects.toThrow(/nicht erreichbar/);
  });

  test('haelt die Ablage-Kennung eng', async () => {
    await expect(variantenHolen('../../etc/passwd')).rejects.toThrow(/Ungültige Ablage/);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
