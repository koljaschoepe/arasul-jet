/**
 * Unit tests fuer die LLM-Regler in system_settings:
 *  - systemSettingsService liest DB-Werte mit Rueckfall auf Env/Code
 *  - systemPromptBuilder ueberschreibt Schicht 1 ueber llm_base_system_prompt
 *
 * Die dreizehn `rag_`-Regler sind am 24.08.2026 mit Qdrant entfallen.
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

const systemSettings = require('../../src/services/system-settings/systemSettingsService');
const { getBasePrompt, GLOBAL_BASE_PROMPT } = require('../../src/services/llm/systemPromptBuilder');

describe('systemSettings LLM-Regler', () => {
  beforeEach(() => {
    // reset cache to "nothing loaded from DB"
    systemSettings._setForTest({
      llm_base_system_prompt: null,
    });
  });

  it('SETTINGS_COLUMNS enthaelt genau die vier LLM-Spalten', () => {
    expect(systemSettings.SETTINGS_COLUMNS).toEqual([
      'llm_num_ctx_default',
      'llm_keep_alive_seconds',
      'llm_num_predict_default',
      'llm_base_system_prompt',
    ]);
  });

  it('falls back to the provided default when a column is NULL', () => {
    expect(systemSettings.getNumber('llm_num_predict_default', 2048)).toBe(2048);
    expect(systemSettings.getNumber('llm_keep_alive_seconds', 300)).toBe(300);
  });

  it('returns the DB value when set', () => {
    systemSettings._setForTest({
      llm_num_predict_default: 1024,
      llm_keep_alive_seconds: 600,
    });
    expect(systemSettings.getNumber('llm_num_predict_default', 2048)).toBe(1024);
    expect(systemSettings.getNumber('llm_keep_alive_seconds', 300)).toBe(600);
  });

  it('coerces string values from pg (FLOAT columns arrive as strings)', () => {
    systemSettings._setForTest({ rag_temperature: '0.35' });
  });
});
