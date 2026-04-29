/**
 * Phase 5.3 — rate-limit window is keyed by api_keys.id, not key prefix.
 *
 * Two distinct keys (different IDs) must have independent budgets even if
 * their prefixes happen to collide; one key exhausting its budget must NOT
 * starve another.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { checkRateLimit, __rateLimitCache } = require('../../src/middleware/apiKeyAuth');

describe('Phase 5.3 — rate-limit per api_key.id', () => {
  beforeEach(() => {
    __rateLimitCache.clear();
  });

  test('counts and resets within a single key budget', () => {
    const r1 = checkRateLimit(42, 3);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    checkRateLimit(42, 3);
    const r3 = checkRateLimit(42, 3);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = checkRateLimit(42, 3);
    expect(r4.allowed).toBe(false);
    expect(r4.resetIn).toBeGreaterThan(0);
  });

  test('two distinct key IDs have independent windows', () => {
    // Key 1 burns its whole budget
    for (let i = 0; i < 5; i++) checkRateLimit(1, 5);
    expect(checkRateLimit(1, 5).allowed).toBe(false);

    // Key 2 must still pass — separate bucket
    const r = checkRateLimit(2, 5);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  test('window rolls over once it expires', () => {
    // Force-set an expired window for key 7
    __rateLimitCache.set(7, { count: 100, windowStart: Date.now() - 120_000 });
    const r = checkRateLimit(7, 10);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9);
  });

  test('numeric IDs are not coerced to strings (no Map-key bugs)', () => {
    checkRateLimit(1, 5);
    expect(__rateLimitCache.has(1)).toBe(true);
    expect(__rateLimitCache.has('1')).toBe(false);
  });
});
