/**
 * Phase 5.4 — wildcard API-key scope is rejected at create time AND inert
 * at request time. Defense in depth: legacy keys carrying '*' must NOT
 * grant access to anything.
 */

const { CreateApiKeyBody } = require('../../src/schemas/externalApi');

describe('Phase 5.4 — wildcard scope rejection', () => {
  describe('CreateApiKeyBody Zod refinement', () => {
    test('accepts an explicit endpoint list', () => {
      const result = CreateApiKeyBody.safeParse({
        name: 'n8n production',
        allowed_endpoints: ['llm:chat', 'llm:status', 'openai:chat'],
      });
      expect(result.success).toBe(true);
    });

    test('rejects a body containing a wildcard scope', () => {
      const result = CreateApiKeyBody.safeParse({
        name: 'too permissive',
        allowed_endpoints: ['llm:chat', '*'],
      });
      expect(result.success).toBe(false);
      const issue = result.error.issues.find((i) => i.path[0] === 'allowed_endpoints');
      expect(issue).toBeDefined();
      expect(issue.message).toMatch(/wildcard/i);
    });

    test('rejects a wildcard-only scope', () => {
      const result = CreateApiKeyBody.safeParse({
        name: 'wildcard only',
        allowed_endpoints: ['*'],
      });
      expect(result.success).toBe(false);
    });

    test('still allows an undefined allowed_endpoints (uses route default)', () => {
      const result = CreateApiKeyBody.safeParse({ name: 'default scope' });
      expect(result.success).toBe(true);
    });
  });

  describe('isEndpointAllowed middleware behavior', () => {
    let mw;
    beforeAll(() => {
      jest.resetModules();
      jest.doMock('../../src/database', () => ({ query: jest.fn() }));
      jest.doMock('../../src/utils/logger', () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      }));
      mw = require('../../src/middleware/apiKeyAuth');
    });

    test('legacy wildcard scope no longer grants access', () => {
      // Build a fake req with a key that still carries '*' from the old days.
      const req = {
        apiKey: { allowedEndpoints: ['*'] },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();
      mw.requireEndpoint('llm:chat')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('explicit endpoint match still passes', () => {
      const req = {
        apiKey: { allowedEndpoints: ['llm:chat', 'llm:status'] },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw.requireEndpoint('llm:chat')(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
