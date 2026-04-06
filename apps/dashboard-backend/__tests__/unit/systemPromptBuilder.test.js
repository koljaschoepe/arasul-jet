/**
 * Unit tests for SystemPromptBuilder
 *
 * Tests the layered system prompt construction:
 * Layer 1: Global base (always present)
 * Layer 2: AI profile (from memoryService)
 * Layer 3: Company context (from DB)
 * Layer 4: Project prompt (per conversation)
 */

// Mock dependencies before requiring the module
jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 }),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/services/memory/memoryService', () => ({
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  generateProfileYaml: jest.fn(),
}));

const memoryService = require('../../src/services/memory/memoryService');

const {
  buildSystemPrompt,
  formatProfile,
  invalidateProfileCache,
  invalidateCompanyContextCache,
  GLOBAL_BASE_PROMPT,
  _cache,
} = require('../../src/services/llm/systemPromptBuilder');

// Mock database passed as parameter
const mockDatabase = {
  query: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  // Reset caches
  _cache.profile.expiresAt = 0;
  _cache.companyContext.expiresAt = 0;
  _cache.profile.value = undefined;
  _cache.companyContext.value = undefined;
});

describe('SystemPromptBuilder', () => {
  describe('buildSystemPrompt', () => {
    it('should return only global base when no layers are configured', async () => {
      memoryService.getProfile.mockResolvedValue(null);
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await buildSystemPrompt(mockDatabase, null, { includeTools: false });

      expect(result).toBe(GLOBAL_BASE_PROMPT);
    });

    it('should combine global base + AI profile', async () => {
      memoryService.getProfile.mockResolvedValue(
        'firma: "TestCorp"\nbranche: "IT & Software"\nsprache: "de"\n'
      );
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await buildSystemPrompt(mockDatabase, null);

      expect(result).toContain(GLOBAL_BASE_PROMPT);
      expect(result).toContain('## KI-Profil');
      expect(result).toContain('TestCorp');
      expect(result).toContain('IT & Software');
    });

    it('should combine global base + company context', async () => {
      memoryService.getProfile.mockResolvedValue(null);
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ content: 'Wir sind eine Beratungsfirma.' }] }) // company context
        .mockResolvedValue({ rows: [] }); // project prompt

      const result = await buildSystemPrompt(mockDatabase, 'conv-123');

      expect(result).toContain(GLOBAL_BASE_PROMPT);
      expect(result).toContain('## Unternehmenskontext');
      expect(result).toContain('Wir sind eine Beratungsfirma.');
      expect(result).not.toContain('## Projektanweisungen');
    });

    it('should combine all 4 layers', async () => {
      memoryService.getProfile.mockResolvedValue(
        'firma: "ACME"\nbranche: "Handel"\nsprache: "de"\n'
      );
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ content: 'Firmenkontext hier.' }] }) // company context
        .mockResolvedValueOnce({ rows: [{ system_prompt: 'Fokus auf Kundenservice.' }] }); // project prompt

      const result = await buildSystemPrompt(mockDatabase, 'conv-456');

      expect(result).toContain(GLOBAL_BASE_PROMPT);
      expect(result).toContain('## KI-Profil');
      expect(result).toContain('ACME');
      expect(result).toContain('## Unternehmenskontext');
      expect(result).toContain('Firmenkontext hier.');
      expect(result).toContain('## Projektanweisungen');
      expect(result).toContain('Fokus auf Kundenservice.');

      // Verify order: base, profile, context, project
      const baseIdx = result.indexOf(GLOBAL_BASE_PROMPT);
      const profileIdx = result.indexOf('## KI-Profil');
      const contextIdx = result.indexOf('## Unternehmenskontext');
      const projectIdx = result.indexOf('## Projektanweisungen');
      expect(baseIdx).toBeLessThan(profileIdx);
      expect(profileIdx).toBeLessThan(contextIdx);
      expect(contextIdx).toBeLessThan(projectIdx);
    });

    it('should skip empty profile', async () => {
      memoryService.getProfile.mockResolvedValue('');
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await buildSystemPrompt(mockDatabase, null, { includeTools: false });

      expect(result).toBe(GLOBAL_BASE_PROMPT);
      expect(result).not.toContain('## KI-Profil');
    });

    it('should skip empty company context', async () => {
      memoryService.getProfile.mockResolvedValue(null);
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ content: '' }] }) // empty company context
        .mockResolvedValue({ rows: [] });

      const result = await buildSystemPrompt(mockDatabase, 'conv-789');

      expect(result).not.toContain('## Unternehmenskontext');
    });

    it('should handle YAML parsing errors gracefully', async () => {
      memoryService.getProfile.mockResolvedValue('{{invalid yaml:::');
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await buildSystemPrompt(mockDatabase, null);

      // Should still work, just without profile
      expect(result).toContain(GLOBAL_BASE_PROMPT);
      expect(result).not.toContain('## KI-Profil');
    });

    it('should handle DB errors gracefully (fallback to global base)', async () => {
      memoryService.getProfile.mockRejectedValue(new Error('MinIO unavailable'));
      mockDatabase.query.mockRejectedValue(new Error('DB connection lost'));

      const result = await buildSystemPrompt(mockDatabase, 'conv-err', { includeTools: false });

      expect(result).toBe(GLOBAL_BASE_PROMPT);
    });

    it('should not include project prompt without conversationId', async () => {
      memoryService.getProfile.mockResolvedValue(null);
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await buildSystemPrompt(mockDatabase, null);

      expect(result).not.toContain('## Projektanweisungen');
      // Only 1 DB call (company context), no project prompt query
      expect(mockDatabase.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatProfile', () => {
    it('should format a complete YAML profile', () => {
      const yaml = `firma: "TestCorp"
branche: "IT & Software"
sprache: "de"
mitarbeiter: 20
produkte:
  - Webentwicklung
  - Cloud-Hosting
praeferenzen:
  antwortlaenge: "kurz"
  formalitaet: "formell"
`;

      const result = formatProfile(yaml);

      expect(result).toContain('## KI-Profil');
      expect(result).toContain('Firma: TestCorp');
      expect(result).toContain('Branche: IT & Software');
      expect(result).toContain('Sprache: de');
      expect(result).toContain('Mitarbeiter: 20');
      expect(result).toContain('Produkte: Webentwicklung, Cloud-Hosting');
      expect(result).toContain('Antwortlaenge: kurz');
      expect(result).toContain('Formalitaet: formell');
    });

    it('should return null for empty string', () => {
      expect(formatProfile('')).toBeNull();
      expect(formatProfile(null)).toBeNull();
      expect(formatProfile(undefined)).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(formatProfile('   \n  ')).toBeNull();
    });

    it('should handle minimal profile', () => {
      const result = formatProfile('firma: "Mini Corp"\n');

      expect(result).toContain('## KI-Profil');
      expect(result).toContain('Firma: Mini Corp');
    });

    it('should return null for invalid YAML', () => {
      const result = formatProfile('{{not valid yaml');
      expect(result).toBeNull();
    });

    it('should return null if YAML parses to non-object', () => {
      const result = formatProfile('just a string');
      expect(result).toBeNull();
    });
  });

  describe('caching', () => {
    it('should cache profile across calls', async () => {
      memoryService.getProfile.mockResolvedValue('firma: "Cached"\n');
      mockDatabase.query.mockResolvedValue({ rows: [] });

      await buildSystemPrompt(mockDatabase, null);
      await buildSystemPrompt(mockDatabase, null);

      // getProfile should only be called once (second call uses cache)
      expect(memoryService.getProfile).toHaveBeenCalledTimes(1);
    });

    it('should cache company context across calls', async () => {
      memoryService.getProfile.mockResolvedValue(null);
      mockDatabase.query.mockResolvedValue({ rows: [{ content: 'Cached context' }] });

      await buildSystemPrompt(mockDatabase, null);
      await buildSystemPrompt(mockDatabase, null);

      // company_context query should only be called once
      expect(mockDatabase.query).toHaveBeenCalledTimes(1);
    });

    it('should invalidate profile cache', async () => {
      memoryService.getProfile.mockResolvedValue('firma: "V1"\n');
      mockDatabase.query.mockResolvedValue({ rows: [] });

      await buildSystemPrompt(mockDatabase, null);
      invalidateProfileCache();

      memoryService.getProfile.mockResolvedValue('firma: "V2"\n');
      const result = await buildSystemPrompt(mockDatabase, null);

      expect(memoryService.getProfile).toHaveBeenCalledTimes(2);
      expect(result).toContain('V2');
    });

    it('should invalidate company context cache', async () => {
      memoryService.getProfile.mockResolvedValue(null);
      mockDatabase.query.mockResolvedValue({ rows: [{ content: 'V1' }] });

      await buildSystemPrompt(mockDatabase, null);
      invalidateCompanyContextCache();

      mockDatabase.query.mockResolvedValue({ rows: [{ content: 'V2' }] });
      const result = await buildSystemPrompt(mockDatabase, null);

      expect(result).toContain('V2');
    });
  });
});
