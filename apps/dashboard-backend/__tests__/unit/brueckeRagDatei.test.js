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
const { ladeDokumentText } = require('../../src/services/flows/documentText');
const brueckeService = require('../../src/services/extensions/brueckeService');
const { NotFoundError, ValidationError } = require('../../src/utils/errors');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bruecke rag', () => {
  it('liest mit dateiname den Textlayer', async () => {
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
  });

  it('sagt es, wenn die Datei nicht indexiert ist', async () => {
    ladeDokumentText.mockResolvedValue({ gefunden: false });
    await expect(
      brueckeService.ragSuche({ frage: 'x', dateiname: 'fehlt.md' })
    ).rejects.toThrow(NotFoundError);
  });

  it('ohne dateiname erklaert der Fehler den Weg, statt Qdrant zu nennen', async () => {
    // Seit dem Qdrant-Ausbau am 24.08.2026 gibt es keinen Vektor-Zweig mehr,
    // in den dieser Aufruf laufen koennte. Der Fehler kommt daher sofort und
    // ist eine Eingabesache, kein Dienstausfall.
    await expect(brueckeService.ragSuche({ frage: 'x' })).rejects.toThrow(ValidationError);
    await expect(brueckeService.ragSuche({ frage: 'x' })).rejects.toThrow(/dateiname/);
    await expect(brueckeService.ragSuche({ frage: 'x' })).rejects.toThrow(/dateien_suchen/);
  });

  it('eine leere Frage bleibt ein Eingabefehler', async () => {
    await expect(brueckeService.ragSuche({ frage: '  ' })).rejects.toThrow();
    expect(ladeDokumentText).not.toHaveBeenCalled();
  });
});
