/**
 * Unit tests for the 096 RAG/LLM tunables:
 *  - systemSettingsService getters resolve DB values with env/code fallbacks
 *  - buildRagSystemPrompt three-tier mode selection (anti-hallucination regression)
 *  - systemPromptBuilder layer-1 override via llm_base_system_prompt
 */

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

const systemSettings = require('../../src/services/system-settings/systemSettingsService');
const { buildRagSystemPrompt } = require('../../src/services/llm/llmJobProcessor');
const { getBasePrompt, GLOBAL_BASE_PROMPT } = require('../../src/services/llm/systemPromptBuilder');

describe('systemSettings 096 tunables', () => {
  beforeEach(() => {
    // reset cache to "nothing loaded from DB"
    systemSettings._setForTest({
      rag_temperature: null,
      rag_num_predict: null,
      rag_mmr_lambda: null,
      rag_dedup_max_per_doc: null,
      rag_hybrid_search: null,
      rag_space_routing_threshold: null,
      rag_space_routing_max_spaces: null,
      llm_base_system_prompt: null,
    });
  });

  it('SETTINGS_COLUMNS contains all 096 columns', () => {
    for (const col of [
      'rag_temperature',
      'rag_num_predict',
      'rag_mmr_lambda',
      'rag_dedup_max_per_doc',
      'rag_hybrid_search',
      'rag_space_routing_threshold',
      'rag_space_routing_max_spaces',
      'llm_base_system_prompt',
    ]) {
      expect(systemSettings.SETTINGS_COLUMNS).toContain(col);
    }
  });

  it('falls back to the provided default when a column is NULL', () => {
    expect(systemSettings.getNumber('rag_temperature', 0.2)).toBe(0.2);
    expect(systemSettings.getNumber('rag_num_predict', 2048)).toBe(2048);
    expect(systemSettings.getBool('rag_hybrid_search', true)).toBe(true);
  });

  it('returns the DB value when set', () => {
    systemSettings._setForTest({
      rag_temperature: 0.5,
      rag_num_predict: 1024,
      rag_hybrid_search: false,
      rag_mmr_lambda: 0.9,
    });
    expect(systemSettings.getNumber('rag_temperature', 0.2)).toBe(0.5);
    expect(systemSettings.getNumber('rag_num_predict', 2048)).toBe(1024);
    expect(systemSettings.getBool('rag_hybrid_search', true)).toBe(false);
    expect(systemSettings.getNumber('rag_mmr_lambda', 0.7)).toBe(0.9);
  });

  it('coerces string values from pg (FLOAT columns arrive as strings)', () => {
    systemSettings._setForTest({ rag_temperature: '0.35' });
    expect(systemSettings.getNumber('rag_temperature', 0.2)).toBeCloseTo(0.35);
  });
});

describe('buildRagSystemPrompt mode selection (anti-hallucination regression)', () => {
  it('mode 1 (high confidence): source-only answering with citations', () => {
    const prompt = buildRagSystemPrompt({});
    expect(prompt).toContain('AUSSCHLIESSLICH auf Basis der bereitgestellten Dokumente');
    expect(prompt).toContain('[1], [2]');
    expect(prompt).not.toContain('GERINGE Übereinstimmung');
    expect(prompt).not.toContain('**Hinweis:** Keine relevanten Dokumente gefunden');
  });

  it('mode 2 (marginal): caution rules with the exact refusal marker', () => {
    const prompt = buildRagSystemPrompt({ marginalResults: true });
    expect(prompt).toContain('GERINGE Übereinstimmung');
    expect(prompt).toContain(
      'Die Wissensbasis enthält keine ausreichend relevante Information zu dieser Frage.'
    );
    expect(prompt).not.toContain('AUSSCHLIESSLICH auf Basis der bereitgestellten Dokumente');
  });

  it('mode 3 (no docs): general-knowledge answer with the exact notice marker', () => {
    const prompt = buildRagSystemPrompt({ noRelevantDocs: true });
    expect(prompt).toContain(
      '**Hinweis:** Keine relevanten Dokumente gefunden. Die folgende Antwort basiert auf allgemeinem Wissen und nicht auf Unternehmensdokumenten.'
    );
    expect(prompt).not.toContain('GERINGE Übereinstimmung');
  });

  it('noRelevantDocs wins over marginalResults', () => {
    const prompt = buildRagSystemPrompt({ noRelevantDocs: true, marginalResults: true });
    expect(prompt).toContain('**Hinweis:** Keine relevanten Dokumente gefunden');
  });
});

describe('systemPromptBuilder layer-1 override', () => {
  it('uses the built-in default when no DB override is set', () => {
    systemSettings._setForTest({ llm_base_system_prompt: null });
    expect(getBasePrompt()).toBe(GLOBAL_BASE_PROMPT);
  });

  it('uses the DB override when set', () => {
    systemSettings._setForTest({ llm_base_system_prompt: 'Du bist der Arasul-Assistent.' });
    expect(getBasePrompt()).toBe('Du bist der Arasul-Assistent.');
  });

  it('treats empty/whitespace override as unset', () => {
    systemSettings._setForTest({ llm_base_system_prompt: '   ' });
    expect(getBasePrompt()).toBe(GLOBAL_BASE_PROMPT);
  });
});
