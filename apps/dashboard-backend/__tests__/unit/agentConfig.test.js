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

/**
 * sollDenken — die Denk-Entscheidung des Chat-Agenten (Audit 023, Befund F-28).
 *
 * Die Einstufung aus queryComplexityAnalyzer lief bis zum 19.08.2026 nur im
 * llmJobProcessor. Der Agent-Runner, über den der Workspace-Chat läuft, fragte
 * sie nie: „Nenne mir in drei Stichpunkten, was Arasul kann." kostete dadurch
 * live gemessene 37 Sekunden Denkzeit vor dem ersten Wort.
 */
describe('agentConfig.sollDenken', () => {
  let originalThinking;

  beforeEach(() => {
    originalThinking = process.env.AGENT_THINKING;
    delete process.env.AGENT_THINKING;
    jest.resetModules();
  });

  afterEach(() => {
    if (originalThinking === undefined) {
      delete process.env.AGENT_THINKING;
    } else {
      process.env.AGENT_THINKING = originalThinking;
    }
    jest.resetModules();
  });

  test('die Frage aus dem Audit denkt nicht mehr', () => {
    const { sollDenken } = require(PFAD);
    const ergebnis = sollDenken(
      'qwen3:27b',
      'Nenne mir in drei Stichpunkten, was Arasul kann. Antworte auf Deutsch.'
    );
    expect(ergebnis.denken).toBe(false);
    expect(ergebnis.grund).toContain('simple');
  });

  test('eine Begrüßung denkt nicht', () => {
    const { sollDenken } = require(PFAD);
    expect(sollDenken('qwen3:27b', 'Hallo').denken).toBe(false);
  });

  test('eine Analyse-Aufgabe denkt weiter', () => {
    const { sollDenken } = require(PFAD);
    const ergebnis = sollDenken(
      'qwen3:27b',
      'Analysiere die Wartungsverträge im Wissensraum und vergleiche die Kündigungsfristen.'
    );
    expect(ergebnis.denken).toBe(true);
    expect(ergebnis.grund).toContain('complex');
  });

  test('ein Modell ohne Reasoning denkt nie, egal wie komplex die Frage ist', () => {
    const { sollDenken } = require(PFAD);
    const ergebnis = sollDenken(
      'qwen3-coder:30b',
      'Analysiere die Architektur und implementiere einen Vorschlag.'
    );
    expect(ergebnis.denken).toBe(false);
    expect(ergebnis.grund).toBe('Modell denkt nicht');
  });

  test('AGENT_THINKING=aus schaltet alles ab', () => {
    process.env.AGENT_THINKING = 'aus';
    jest.resetModules();
    const { sollDenken } = require(PFAD);
    const ergebnis = sollDenken('qwen3:27b', 'Analysiere das bitte gründlich.');
    expect(ergebnis.denken).toBe(false);
    expect(ergebnis.grund).toBe('per Einstellung aus');
  });
});
