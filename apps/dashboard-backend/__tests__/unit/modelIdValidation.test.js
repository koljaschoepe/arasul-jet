/**
 * Phase 5.5 — modelId regex validation in modelService.
 *
 * downloadModel/activateModel/deleteModel reject malformed IDs before any
 * DB query or Ollama HTTP call so shell-meta, NUL, traversal, etc. cannot
 * propagate. Real catalog IDs (e.g. `llama3.1:8b`, `qwen3:32b-q4`) must
 * still pass.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { createModelService } = require('../../src/services/llm/modelService');

function makeService() {
  // We never need the call to actually reach the DB — the validator throws
  // before the first query — but stub it so the require() chain holds up.
  const database = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  return createModelService({ database, axios: { get: jest.fn(), post: jest.fn() } });
}

describe('Phase 5.5 — modelId validation', () => {
  let svc;
  beforeEach(() => {
    svc = makeService();
  });

  const validIds = [
    'llama3.1:8b',
    'qwen3:32b-q4',
    'gemma2:9b-q8',
    'tesseract:latest',
    'qwen2.5-coder:7b-instruct',
    'mistral-nemo:12b',
  ];
  test.each(validIds)('accepts valid catalog id %s', async (id) => {
    // We only need the validator to PASS — once it does, the next thing the
    // function does is hit the DB stub which returns rows:[] → throws "not
    // found in catalog". That post-validation error proves the regex passed.
    await expect(svc.downloadModel(id)).rejects.toThrow(/not found in catalog/);
  });

  const invalidIds = [
    'llama3 8b',           // whitespace
    'qwen3:32b\n',         // newline
    '../../etc/passwd',    // traversal
    'rm -rf /',            // shell meta
    'gemma$(reboot)',      // command substitution
    ':leading-colon',      // invalid leading char
    'trailing-dash-',      // invalid trailing char
    '',                    // empty
    'a'.repeat(129),       // too long
  ];
  test.each(invalidIds)('rejects malformed id %j', async (id) => {
    await expect(svc.downloadModel(id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  test('rejects non-string ids', async () => {
    await expect(svc.downloadModel(null)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(svc.downloadModel(42)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(svc.downloadModel(undefined)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('activateModel and deleteModel reject the same patterns', async () => {
    await expect(svc.activateModel('rm -rf /')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(svc.deleteModel('../etc/passwd')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
