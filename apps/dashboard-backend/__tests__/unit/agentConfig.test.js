/**
 * agentConfig — die Subagent-Budget-Stellschraube (Plan 019 · Phase 5).
 *
 * MAX_SUBAGENTEN steuert, wie viele Subagenten der Orchestrator über den ganzen
 * Lauf starten darf (aggressive Delegation). Env-gesteuert mit NaN-Wächter.
 */

const PFAD = '../../src/services/llm/agentConfig';

describe('agentConfig.MAX_SUBAGENTEN', () => {
  let original;

  beforeEach(() => {
    // Pro Test frisch schnappen — robust auch bei Env-Verschmutzung aus anderen Suites.
    original = process.env.AGENT_MAX_SUBAGENTEN;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AGENT_MAX_SUBAGENTEN;
    } else {
      process.env.AGENT_MAX_SUBAGENTEN = original;
    }
    jest.resetModules();
  });

  test('Standard ist 60, wenn keine Env gesetzt ist', () => {
    delete process.env.AGENT_MAX_SUBAGENTEN;
    jest.resetModules();
    expect(require(PFAD).MAX_SUBAGENTEN).toBe(60);
  });

  test('Env-Wert übersteuert den Standard', () => {
    process.env.AGENT_MAX_SUBAGENTEN = '120';
    jest.resetModules();
    expect(require(PFAD).MAX_SUBAGENTEN).toBe(120);
  });

  test('kaputter Env-Wert fällt sicher auf den Standard zurück', () => {
    process.env.AGENT_MAX_SUBAGENTEN = 'abc';
    jest.resetModules();
    expect(require(PFAD).MAX_SUBAGENTEN).toBe(60);
  });
});
