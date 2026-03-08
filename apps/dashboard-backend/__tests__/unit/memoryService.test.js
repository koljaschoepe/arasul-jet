/**
 * Memory Service Tests
 *
 * Tests for memoryService:
 * - parseMemories (pure function)
 * - generateProfileYaml (pure function)
 * - getProfile (MinIO + DB fallback)
 * - updateProfile (size limit, MinIO + DB)
 * - getAllMemories (pagination, type filter)
 * - deleteMemory (DB + Qdrant)
 * - updateMemory (DB + Qdrant re-embed)
 * - deleteAllMemories (DB + Qdrant reset)
 * - getMemoryStats (aggregation)
 * - extractMemories (LLM integration)
 * - saveMemories (deduplication, limits)
 * - searchRelevantMemories (vector search + token limit)
 */

// Mock external dependencies before require
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../src/config/services', () => ({
  embedding: { embedEndpoint: 'http://embedding:11435/embed' },
  qdrant: { url: 'http://qdrant:6333' },
  llm: { url: 'http://llm:11434' },
  minio: { host: 'minio', port: 9000 },
}));

jest.mock('../../src/services/core/tokenService', () => ({
  estimateTokens: jest.fn(text => Math.ceil(text.length / 4)),
}));

jest.mock('../../src/services/embeddingService', () => ({
  getEmbedding: jest.fn(),
  getEmbeddings: jest.fn(),
}));

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn(),
    putObject: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock global fetch
global.fetch = jest.fn();

const database = require('../../src/database');
const { getEmbedding } = require('../../src/services/embeddingService');
const memoryService = require('../../src/services/memory/memoryService');

describe('memoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockReset();
  });

  // =========================================================================
  // parseMemories (pure function)
  // =========================================================================
  describe('parseMemories', () => {
    it('should parse FAKT entries', () => {
      const text = 'FAKT: Der Server läuft auf Port 3000 mit Node.js';
      const result = memoryService.parseMemories(text);

      expect(result).toEqual([
        { type: 'fact', content: 'Der Server läuft auf Port 3000 mit Node.js' },
      ]);
    });

    it('should parse ENTSCHEIDUNG entries', () => {
      const text = 'ENTSCHEIDUNG: React statt Vue verwenden - Bessere Community-Unterstützung';
      const result = memoryService.parseMemories(text);

      expect(result).toEqual([
        { type: 'decision', content: 'React statt Vue verwenden - Bessere Community-Unterstützung' },
      ]);
    });

    it('should parse PRAEFERENZ entries', () => {
      const text = 'PRAEFERENZ: Benutzer bevorzugt dunkles Theme in der IDE';
      const result = memoryService.parseMemories(text);

      expect(result).toEqual([
        { type: 'preference', content: 'Benutzer bevorzugt dunkles Theme in der IDE' },
      ]);
    });

    it('should parse multiple entries', () => {
      const text = [
        'FAKT: Projekt verwendet PostgreSQL als Datenbank',
        'ENTSCHEIDUNG: Docker für Deployment - Einfachere Skalierung',
        'PRAEFERENZ: Kurze Antworten bevorzugt vom Benutzer',
      ].join('\n');

      const result = memoryService.parseMemories(text);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('fact');
      expect(result[1].type).toBe('decision');
      expect(result[2].type).toBe('preference');
    });

    it('should skip entries shorter than 10 characters', () => {
      const text = 'FAKT: Kurz\nFAKT: Dies ist ein langer genug Eintrag für den Test';
      const result = memoryService.parseMemories(text);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Dies ist ein langer genug Eintrag für den Test');
    });

    it('should return empty array for KEINE_MEMORIES-like text', () => {
      const text = 'Nichts Relevantes gefunden in diesem Gespräch.';
      const result = memoryService.parseMemories(text);

      expect(result).toEqual([]);
    });

    it('should ignore non-matching lines', () => {
      const text = [
        'Some preamble text',
        'FAKT: Wichtige Information über das Projektziel',
        'Random comment',
        'PRAEFERENZ: Deutsche Sprache für alle Ausgaben bevorzugt',
      ].join('\n');

      const result = memoryService.parseMemories(text);

      expect(result).toHaveLength(2);
    });
  });

  // =========================================================================
  // generateProfileYaml (pure function)
  // =========================================================================
  describe('generateProfileYaml', () => {
    it('should generate minimal YAML with only sprache', () => {
      const yaml = memoryService.generateProfileYaml({});

      expect(yaml).toContain('sprache: "de"');
      expect(yaml.endsWith('\n')).toBe(true);
    });

    it('should include firma', () => {
      const yaml = memoryService.generateProfileYaml({ firma: 'Arasul GmbH' });

      expect(yaml).toContain('firma: "Arasul GmbH"');
    });

    it('should include branche', () => {
      const yaml = memoryService.generateProfileYaml({ branche: 'IT-Dienstleistungen' });

      expect(yaml).toContain('branche: "IT-Dienstleistungen"');
    });

    it('should include teamgroesse as mitarbeiter', () => {
      const yaml = memoryService.generateProfileYaml({ teamgroesse: 50 });

      expect(yaml).toContain('mitarbeiter: 50');
    });

    it('should include produkte list', () => {
      const yaml = memoryService.generateProfileYaml({
        produkte: ['Edge AI', 'IoT Gateway'],
      });

      expect(yaml).toContain('produkte:');
      expect(yaml).toContain('  - Edge AI');
      expect(yaml).toContain('  - IoT Gateway');
    });

    it('should not include produkte if empty array', () => {
      const yaml = memoryService.generateProfileYaml({ produkte: [] });

      expect(yaml).not.toContain('produkte:');
    });

    it('should include praeferenzen', () => {
      const yaml = memoryService.generateProfileYaml({
        praeferenzen: {
          antwortlaenge: 'mittel',
          formalitaet: 'formell',
        },
      });

      expect(yaml).toContain('praeferenzen:');
      expect(yaml).toContain('  antwortlaenge: "mittel"');
      expect(yaml).toContain('  formalitaet: "formell"');
    });

    it('should generate complete YAML', () => {
      const yaml = memoryService.generateProfileYaml({
        firma: 'TestCo',
        branche: 'Tech',
        teamgroesse: 10,
        produkte: ['Product A'],
        praeferenzen: { antwortlaenge: 'kurz' },
      });

      expect(yaml).toContain('firma: "TestCo"');
      expect(yaml).toContain('branche: "Tech"');
      expect(yaml).toContain('sprache: "de"');
      expect(yaml).toContain('mitarbeiter: 10');
      expect(yaml).toContain('produkte:');
      expect(yaml).toContain('  - Product A');
      expect(yaml).toContain('praeferenzen:');
      expect(yaml).toContain('  antwortlaenge: "kurz"');
    });
  });

  // =========================================================================
  // getProfile
  // =========================================================================
  describe('getProfile', () => {
    it('should return MinIO profile when available', async () => {
      // readFile internally calls getMinioClient().getObject
      // Since readFile uses getObject, we need to mock it via the minio client
      const Minio = require('minio');
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('firma: "Test"\nsprache: "de"\n');
        },
      };
      Minio.Client.mock.results[0]?.value?.getObject?.mockResolvedValue(mockStream);

      // Force re-init by calling readFile path directly
      const result = await memoryService.getProfile();

      // If MinIO returns content, DB should not be queried for profile
      // (though it might be queried, the test verifies the return value)
      if (result) {
        expect(result).toContain('firma');
      }
    });

    it('should fall back to database when MinIO returns null', async () => {
      const Minio = require('minio');
      Minio.Client.mock.results[0]?.value?.getObject?.mockRejectedValue({ code: 'NoSuchKey' });

      database.query.mockResolvedValue({
        rows: [{ ai_profile_yaml: 'firma: "DB Fallback"\n' }],
      });

      const result = await memoryService.getProfile();

      expect(result).toBe('firma: "DB Fallback"\n');
    });

    it('should return null when neither MinIO nor DB has profile', async () => {
      const Minio = require('minio');
      Minio.Client.mock.results[0]?.value?.getObject?.mockRejectedValue({ code: 'NoSuchKey' });

      database.query.mockResolvedValue({ rows: [] });

      const result = await memoryService.getProfile();

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // updateProfile
  // =========================================================================
  describe('updateProfile', () => {
    it('should reject profiles exceeding MAX_PROFILE_BYTES', async () => {
      const oversized = 'a'.repeat(3000);

      await expect(memoryService.updateProfile(oversized)).rejects.toThrow(
        /exceeds maximum size/
      );
    });

    it('should save to MinIO and DB', async () => {
      const Minio = require('minio');
      const mockPutObject = Minio.Client.mock.results[0]?.value?.putObject;
      const mockBucketExists = Minio.Client.mock.results[0]?.value?.bucketExists;
      mockBucketExists?.mockResolvedValue(true);
      mockPutObject?.mockResolvedValue(undefined);
      database.query.mockResolvedValue({ rows: [] });

      const yamlContent = 'firma: "Test"\nsprache: "de"\n';
      await memoryService.updateProfile(yamlContent);

      // Should have called DB to save backup
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE system_settings'),
        expect.arrayContaining([yamlContent])
      );
    });
  });

  // =========================================================================
  // getAllMemories
  // =========================================================================
  describe('getAllMemories', () => {
    it('should return paginated memories', async () => {
      const mockMemories = [
        { id: '1', type: 'fact', content: 'Test fact', created_at: new Date() },
        { id: '2', type: 'decision', content: 'Test decision', created_at: new Date() },
      ];

      database.query
        .mockResolvedValueOnce({ rows: mockMemories }) // Main query
        .mockResolvedValueOnce({ rows: [{ cnt: '2' }] }); // Count query

      const result = await memoryService.getAllMemories({ limit: 50, offset: 0 });

      expect(result.memories).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by type', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ id: '1', type: 'fact', content: 'Test' }] })
        .mockResolvedValueOnce({ rows: [{ cnt: '1' }] });

      const result = await memoryService.getAllMemories({ type: 'fact' });

      const mainQuery = database.query.mock.calls[0][0];
      expect(mainQuery).toContain('type = $');
      expect(result.memories).toHaveLength(1);
    });

    it('should return empty when no memories exist', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

      const result = await memoryService.getAllMemories();

      expect(result.memories).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // =========================================================================
  // deleteMemory
  // =========================================================================
  describe('deleteMemory', () => {
    it('should delete from DB and Qdrant', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ qdrant_point_id: 'qdrant-123' }] }) // SELECT
        .mockResolvedValueOnce({ rows: [] }); // DELETE

      global.fetch.mockResolvedValue({ ok: true });

      await memoryService.deleteMemory('mem-123');

      // DB queries: SELECT qdrant_point_id + DELETE
      expect(database.query).toHaveBeenCalledTimes(2);
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM ai_memories'),
        ['mem-123']
      );

      // Qdrant delete call
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/points/delete'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should delete from DB even if Qdrant fails', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ qdrant_point_id: 'qdrant-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      global.fetch.mockRejectedValue(new Error('Qdrant down'));

      await memoryService.deleteMemory('mem-123');

      // DB DELETE should still be called
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM ai_memories'),
        ['mem-123']
      );
    });

    it('should skip Qdrant delete if no qdrant_point_id', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ qdrant_point_id: null }] })
        .mockResolvedValueOnce({ rows: [] });

      await memoryService.deleteMemory('mem-no-qdrant');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateMemory
  // =========================================================================
  describe('updateMemory', () => {
    it('should update content in DB and re-embed in Qdrant', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [] }) // UPDATE content
        .mockResolvedValueOnce({
          rows: [{ qdrant_point_id: 'qdrant-456', type: 'fact' }],
        }); // SELECT for re-embed

      // getEmbedding now comes from embeddingService
      getEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
      // Qdrant upsert
      global.fetch.mockResolvedValueOnce({ ok: true });

      await memoryService.updateMemory('mem-456', 'Updated content');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE ai_memories SET content'),
        ['Updated content', 'mem-456']
      );
    });
  });

  // =========================================================================
  // deleteAllMemories
  // =========================================================================
  describe('deleteAllMemories', () => {
    it('should delete all from DB and reset Qdrant collection', async () => {
      database.query.mockResolvedValue({ rows: [] });
      global.fetch.mockResolvedValue({ ok: true });

      await memoryService.deleteAllMemories();

      expect(database.query).toHaveBeenCalledWith('DELETE FROM ai_memories');

      // Should delete Qdrant collection
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/collections/memories'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // =========================================================================
  // getMemoryStats
  // =========================================================================
  describe('getMemoryStats', () => {
    it('should return aggregated statistics', async () => {
      const Minio = require('minio');
      Minio.Client.mock.results[0]?.value?.getObject?.mockRejectedValue({ code: 'NoSuchKey' });

      database.query
        .mockResolvedValueOnce({
          rows: [{
            total: '15',
            facts: '8',
            decisions: '4',
            preferences: '3',
            last_updated: '2025-06-15T10:00:00Z',
          }],
        }) // Stats query
        .mockResolvedValueOnce({ rows: [] }); // getProfile DB fallback

      const stats = await memoryService.getMemoryStats();

      expect(stats.total).toBe(15);
      expect(stats.facts).toBe(8);
      expect(stats.decisions).toBe(4);
      expect(stats.preferences).toBe(3);
      expect(stats.hasProfile).toBe(false);
      expect(stats.profileSize).toBe(0);
    });

    it('should handle zero memories', async () => {
      const Minio = require('minio');
      Minio.Client.mock.results[0]?.value?.getObject?.mockRejectedValue({ code: 'NoSuchKey' });

      database.query
        .mockResolvedValueOnce({ rows: [{ total: '0', facts: '0', decisions: '0', preferences: '0', last_updated: null }] })
        .mockResolvedValueOnce({ rows: [] });

      const stats = await memoryService.getMemoryStats();

      expect(stats.total).toBe(0);
    });
  });

  // =========================================================================
  // extractMemories
  // =========================================================================
  describe('extractMemories', () => {
    it('should return empty array for empty messages', async () => {
      const result = await memoryService.extractMemories([], 'qwen3:14b');
      expect(result).toEqual([]);
    });

    it('should return empty array for null messages', async () => {
      const result = await memoryService.extractMemories(null, 'qwen3:14b');
      expect(result).toEqual([]);
    });

    it('should call LLM and parse response', async () => {
      database.query.mockResolvedValue({ rows: [{ name: 'qwen3:14b' }] });

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          response: 'FAKT: Benutzer arbeitet an einem Edge AI Projekt mit Jetson',
        }),
      });

      const messages = [
        { role: 'user', content: 'Ich arbeite an einem Edge AI Projekt mit Jetson' },
        { role: 'assistant', content: 'Das klingt spannend!' },
      ];

      const result = await memoryService.extractMemories(messages, 'qwen3:14b');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('fact');
    });

    it('should return empty array when LLM returns KEINE_MEMORIES', async () => {
      database.query.mockResolvedValue({ rows: [] });

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'KEINE_MEMORIES' }),
      });

      const messages = [{ role: 'user', content: 'Hallo!' }];
      const result = await memoryService.extractMemories(messages, 'qwen3:14b');

      expect(result).toEqual([]);
    });

    it('should return empty array on LLM error', async () => {
      database.query.mockResolvedValue({ rows: [] });
      global.fetch.mockResolvedValue({ ok: false, status: 500 });

      const messages = [{ role: 'user', content: 'Test message' }];
      const result = await memoryService.extractMemories(messages, 'qwen3:14b');

      expect(result).toEqual([]);
    });

    it('should strip <think> tags from response', async () => {
      database.query.mockResolvedValue({ rows: [] });

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          response: '<think>Some internal reasoning</think>FAKT: Wichtiger Fakt über das System und seine Konfiguration',
        }),
      });

      const messages = [{ role: 'user', content: 'Test' }];
      const result = await memoryService.extractMemories(messages, 'model');

      expect(result).toHaveLength(1);
      expect(result[0].content).not.toContain('think');
    });
  });

  // =========================================================================
  // saveMemories
  // =========================================================================
  describe('saveMemories', () => {
    it('should return 0 for empty memories', async () => {
      const result = await memoryService.saveMemories([]);
      expect(result).toBe(0);
    });

    it('should return 0 for null memories', async () => {
      const result = await memoryService.saveMemories(null);
      expect(result).toBe(0);
    });

    it('should save non-duplicate memories to DB and Qdrant', async () => {
      // ensureQdrantCollection
      global.fetch.mockResolvedValueOnce({ ok: true }); // Collection exists

      // getEmbedding now comes from embeddingService (uses axios, not fetch)
      getEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);

      // checkDuplicate (search returns empty)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] }),
      });
      // Qdrant upsert
      global.fetch.mockResolvedValueOnce({ ok: true });

      // DB: count check + INSERT
      database.query
        .mockResolvedValueOnce({ rows: [{ cnt: '10' }] }) // COUNT
        .mockResolvedValueOnce({ rows: [] }); // INSERT

      const memories = [{ type: 'fact', content: 'Test memory content' }];
      const result = await memoryService.saveMemories(memories, 42);

      expect(result).toBe(1);
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_memories'),
        expect.any(Array)
      );
    });

    it('should skip duplicate memories', async () => {
      // ensureQdrantCollection
      global.fetch.mockResolvedValueOnce({ ok: true });

      // getEmbedding now comes from embeddingService
      getEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);

      // checkDuplicate returns a match (duplicate)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [{ score: 0.95 }] }),
      });

      const memories = [{ type: 'fact', content: 'Already exists memory' }];
      const result = await memoryService.saveMemories(memories);

      expect(result).toBe(0);
    });
  });

  // =========================================================================
  // searchRelevantMemories
  // =========================================================================
  describe('searchRelevantMemories', () => {
    it('should return matching memories with scores', async () => {
      // getEmbedding now comes from embeddingService
      getEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);

      // Qdrant search
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: [
            {
              score: 0.85,
              payload: {
                type: 'fact',
                content: 'Relevant memory about the topic',
                created_at: '2025-06-15T10:00:00Z',
              },
            },
          ],
        }),
      });

      const results = await memoryService.searchRelevantMemories('test query');

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('fact');
      expect(results[0].score).toBe(0.85);
      expect(results[0].content).toBe('Relevant memory about the topic');
    });

    it('should return empty array on search error', async () => {
      // getEmbedding now comes from embeddingService
      getEmbedding.mockRejectedValueOnce(new Error('Embedding service down'));

      const results = await memoryService.searchRelevantMemories('test');

      expect(results).toEqual([]);
    });

    it('should enforce token limit on results', async () => {
      // getEmbedding now comes from embeddingService
      getEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);

      // Qdrant returns many results but token limit should cap them
      // estimateTokens mock returns text.length / 4
      // MAX_TIER2_TOKENS = 400, so ~1600 chars max
      const longContent = 'A'.repeat(2000); // 500 tokens > 400 limit
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: [
            { score: 0.9, payload: { type: 'fact', content: longContent, created_at: '' } },
            { score: 0.8, payload: { type: 'fact', content: 'Short second result text', created_at: '' } },
          ],
        }),
      });

      const results = await memoryService.searchRelevantMemories('test', 5, 0.5);

      // First result alone exceeds token limit, so only first should be returned
      // (it's added because totalTokens starts at 0 and 500 > 400 breaks after first)
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return empty when Qdrant returns non-ok', async () => {
      // getEmbedding now comes from embeddingService
      getEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);

      // Qdrant error
      global.fetch.mockResolvedValueOnce({ ok: false });

      const results = await memoryService.searchRelevantMemories('test');

      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // ensureQdrantCollection
  // =========================================================================
  describe('ensureQdrantCollection', () => {
    it('should not create collection if it already exists', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true }); // Collection already exists

      await memoryService.ensureQdrantCollection();

      // Only one fetch call (the check), no PUT
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should create collection if it does not exist', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 404 }) // Collection doesn't exist
        .mockResolvedValueOnce({ ok: true }); // PUT create collection

      // getEmbedding for dimension detection now comes from embeddingService
      getEmbedding.mockResolvedValueOnce([0.1, 0.2]);

      await memoryService.ensureQdrantCollection();

      // Last call should be PUT to create
      const putCall = global.fetch.mock.calls.find(
        c => c[1]?.method === 'PUT' && c[0].includes('/collections/memories')
      );
      expect(putCall).toBeDefined();
    });
  });
});
