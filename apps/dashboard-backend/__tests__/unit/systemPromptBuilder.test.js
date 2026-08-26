/**
 * Unit tests for SystemPromptBuilder
 *
 * Seit Phase B4 (26.08.2026) gibt es nur noch die Basis-Schicht: die
 * eingebaute Vorgabe, die der Betreiber ueber
 * system_settings.llm_base_system_prompt ueberschreiben kann. KI-Profil und
 * Unternehmenskontext sind mit Memory und Wissensraeumen gefallen.
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

jest.mock('../../src/services/system-settings/systemSettingsService', () => ({
  get: jest.fn(),
  getNumber: jest.fn(),
  load: jest.fn(),
}));

const systemSettings = require('../../src/services/system-settings/systemSettingsService');
const {
  buildSystemPrompt,
  getBasePrompt,
  GLOBAL_BASE_PROMPT,
} = require('../../src/services/llm/systemPromptBuilder');

beforeEach(() => {
  jest.clearAllMocks();
  systemSettings.get.mockReturnValue(null);
});

describe('SystemPromptBuilder', () => {
  it('liefert die eingebaute Basis, wenn nichts ueberschrieben ist', async () => {
    const result = await buildSystemPrompt();
    expect(result).toBe(GLOBAL_BASE_PROMPT);
  });

  it('nimmt die Vorgabe aus system_settings, wenn sie gesetzt ist', async () => {
    systemSettings.get.mockReturnValue('  Du bist knapp.  ');
    expect(getBasePrompt()).toBe('Du bist knapp.');
    expect(await buildSystemPrompt()).toBe('Du bist knapp.');
  });

  it('faellt bei leerer Vorgabe auf die eingebaute Basis zurueck', () => {
    systemSettings.get.mockReturnValue('   ');
    expect(getBasePrompt()).toBe(GLOBAL_BASE_PROMPT);
  });
});
