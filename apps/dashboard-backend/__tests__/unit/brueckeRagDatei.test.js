/**
 * Die Faehigkeit `rag` liest eine benannte Datei, statt in Qdrant zu laufen.
 *
 * Plan 021 Schritt 8 hat das Vektor-RAG durch agentisches ersetzt. Das
 * Flow-Werkzeug `rag_suche` zieht daraus seit jeher die Folge: eine benannte
 * Datei kommt aus dem Textlayer in Postgres, der Vektor-Zweig liegt hinter
 * `RAG_VEKTOR_SUCHE`.
 *
 * Die Bruecke rief dagegen unbedingt `hybridSearch` und lief damit immer in
 * Qdrant, das auf einem gewoehnlichen Geraet nicht laeuft. Auf dem Orin
 * gemessen (23.08.2026): "Vector search backend unavailable", waehrend 2171
 * Dokumente mit 37 487 Abschnitten im Textlayer lagen. Sie waren da; es fehlte
 * nur der Weg dorthin.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/services/flows/documentText', () => ({ ladeDokumentText: jest.fn() }));
jest.mock('../../src/services/rag/ragCore', () => ({
  getEmbedding: jest.fn(),
  hybridSearch: jest.fn(),
}));

const { ladeDokumentText } = require('../../src/services/flows/documentText');
const ragCore = require('../../src/services/rag/ragCore');
const brueckeService = require('../../src/services/extensions/brueckeService');
const { NotFoundError, ServiceUnavailableError } = require('../../src/utils/errors');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bruecke rag', () => {
  it('liest mit dateiname den Textlayer, ohne Qdrant anzufassen', async () => {
    ladeDokumentText.mockResolvedValue({
      gefunden: true,
      text: 'Grundpauschale 41.780 Euro',
      titel: 'Wartungsvertrag',
      gekuerzt: false,
    });

    const treffer = await brueckeService.ragSuche({
      frage: 'Grundpauschale?',
      dateiname: 'vertrag.md',
    });

    expect(treffer[0].quelle).toBe('vertrag.md');
    expect(treffer[0].text).toContain('41.780');
    expect(ragCore.getEmbedding).not.toHaveBeenCalled();
    expect(ragCore.hybridSearch).not.toHaveBeenCalled();
  });

  it('sagt es, wenn die Datei nicht indexiert ist', async () => {
    ladeDokumentText.mockResolvedValue({ gefunden: false });
    await expect(
      brueckeService.ragSuche({ frage: 'x', dateiname: 'fehlt.md' })
    ).rejects.toThrow(NotFoundError);
  });

  it('ohne dateiname erklaert der Fehler den Weg, statt Qdrant zu nennen', async () => {
    ragCore.getEmbedding.mockRejectedValue(new Error('getaddrinfo EAI_AGAIN qdrant'));
    await expect(brueckeService.ragSuche({ frage: 'x' })).rejects.toThrow(ServiceUnavailableError);
    await expect(brueckeService.ragSuche({ frage: 'x' })).rejects.toThrow(/dateiname/);
  });

  it('eine leere Frage bleibt ein Eingabefehler', async () => {
    await expect(brueckeService.ragSuche({ frage: '  ' })).rejects.toThrow();
    expect(ladeDokumentText).not.toHaveBeenCalled();
  });
});
