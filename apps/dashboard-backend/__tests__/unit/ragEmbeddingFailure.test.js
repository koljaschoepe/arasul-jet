/**
 * Phase 4.7 — RAG embedding failures must surface as typed
 * ServiceUnavailableError(code: EMBEDDING_DOWN), not silent empty results.
 *
 * The unit suite focuses on ragCore's getEmbedding/getEmbeddings — the
 * single funnel for every RAG-pipeline embedding call. If those throw
 * with the expected code, every caller (routes/rag.js, telegramRagService,
 * etc.) gets a structured error instead of falling back to an empty
 * sources array which used to make the LLM hallucinate.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../src/services/embeddingService', () => ({
  getEmbedding: jest.fn(),
  getEmbeddings: jest.fn(),
  getBreakerState: jest.fn(),
}));

const embeddingService = require('../../src/services/embeddingService');
const ragCore = require('../../src/services/rag/ragCore');
const { ServiceUnavailableError } = require('../../src/utils/errors');

describe('ragCore embedding failure modes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEmbedding()', () => {
    test('returns the vector when the service succeeds', async () => {
      embeddingService.getEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
      const v = await ragCore.getEmbedding('hello');
      expect(v).toEqual([0.1, 0.2, 0.3]);
    });

    test('throws ServiceUnavailableError(EMBEDDING_DOWN) when the service returns null', async () => {
      embeddingService.getEmbedding.mockResolvedValueOnce(null);
      await expect(ragCore.getEmbedding('hello')).rejects.toMatchObject({
        statusCode: 503,
        code: 'EMBEDDING_DOWN',
      });
      // Also assert we got the typed class, not a plain Error
      try {
        await ragCore.getEmbedding('hello');
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableError);
      }
    });
  });

  describe('getEmbeddings()', () => {
    test('returns [] for empty input without calling the service', async () => {
      const out = await ragCore.getEmbeddings([]);
      expect(out).toEqual([]);
      expect(embeddingService.getEmbeddings).not.toHaveBeenCalled();
    });

    test('returns vectors for non-empty input', async () => {
      embeddingService.getEmbeddings.mockResolvedValueOnce([[0.1], [0.2]]);
      const out = await ragCore.getEmbeddings(['a', 'b']);
      expect(out).toEqual([[0.1], [0.2]]);
    });

    test('throws ServiceUnavailableError(EMBEDDING_DOWN) when the service returns null', async () => {
      embeddingService.getEmbeddings.mockResolvedValueOnce(null);
      await expect(ragCore.getEmbeddings(['a', 'b'])).rejects.toMatchObject({
        statusCode: 503,
        code: 'EMBEDDING_DOWN',
      });
    });
  });
});
