/**
 * Unit-Tests der Flow-Tool-Registry (Plan 010, Schritt 3).
 * Kern: das externe Web-Tool wird NUR bei allow_external aufgenommen — ein rein
 * lokaler Agent erhält kein Netz-Tool.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { buildRegistry, VALID_FLOW_TOOLS } = require('../../src/services/agents/flowToolRegistry');

test('VALID_FLOW_TOOLS deckt genau die v1-Tools ab', () => {
  expect(VALID_FLOW_TOOLS.sort()).toEqual(['minio', 'n8n', 'rag', 'web']);
});

test('Schema-Enum und Registry-Tools bleiben deckungsgleich (kein Drift)', () => {
  const { ToolName } = require('../../src/schemas/flowAgents');
  expect(ToolName.options.slice().sort()).toEqual(VALID_FLOW_TOOLS.slice().sort());
});

test('lokale Tools werden registriert', () => {
  const reg = buildRegistry(['rag', 'minio', 'n8n'], { allowExternal: false });
  expect(reg.get('rag')).toBeTruthy();
  expect(reg.get('minio')).toBeTruthy();
  expect(reg.get('n8n')).toBeTruthy();
});

test('web ohne allow_external → NICHT registriert (kein Netz-Tool)', () => {
  const reg = buildRegistry(['rag', 'web'], { allowExternal: false });
  expect(reg.get('rag')).toBeTruthy();
  expect(reg.get('web')).toBeNull();
});

test('web MIT allow_external → registriert', () => {
  const reg = buildRegistry(['web'], { allowExternal: true });
  expect(reg.get('web')).toBeTruthy();
});

test('unbekannte Tool-Namen werden übersprungen', () => {
  const reg = buildRegistry(['rag', 'quatsch'], { allowExternal: false });
  expect(reg.get('rag')).toBeTruthy();
  expect(reg.get('quatsch')).toBeNull();
});
