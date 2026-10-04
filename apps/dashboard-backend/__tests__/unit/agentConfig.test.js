/**
 * agentConfig — die Denk-Stellschrauben, die `services/flows/subagent.js` liest.
 *
 * `kannDenken` ist eine Heuristik über den Modellnamen, `thinkingGewuenscht`
 * der globale Schalter `AGENT_THINKING`.
 */

const PFAD = '../../src/services/llm/agentConfig';

describe('agentConfig.kannDenken', () => {
  const { kannDenken } = require(PFAD);

  test('qwen3 und andere Reasoning-Familien denken', () => {
    expect(kannDenken('qwen3:27b')).toBe(true);
    expect(kannDenken('deepseek-r1:14b')).toBe(true);
  });

  test('Coder-Varianten und unbekannte Modelle denken nicht', () => {
    expect(kannDenken('qwen3-coder:30b')).toBe(false);
    expect(kannDenken('gemma3:12b')).toBe(false);
    expect(kannDenken('')).toBe(false);
  });
});

describe('agentConfig.thinkingGewuenscht', () => {
  let original;

  beforeEach(() => {
    original = process.env.AGENT_THINKING;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AGENT_THINKING;
    } else {
      process.env.AGENT_THINKING = original;
    }
  });

  test('ist ohne Angabe an', () => {
    delete process.env.AGENT_THINKING;
    expect(require(PFAD).thinkingGewuenscht()).toBe(true);
  });

  test('AGENT_THINKING=aus schaltet ab', () => {
    process.env.AGENT_THINKING = 'aus';
    expect(require(PFAD).thinkingGewuenscht()).toBe(false);
  });
});
