/**
 * Unit tests for ollamaReadiness.quickCheck() — Phase 4.1.
 *
 * The quickCheck() probe is the gate that prevents the chat queue from
 * stalling for 11 minutes when Ollama is dead. We verify:
 *  - happy path returns { ready: true } with latency < timeout
 *  - timeout / network error returns { ready: false } with error string
 *  - cached `isReady()` flag tracks the most recent probe result
 *  - response with non-200 status is treated as not-ready
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  query: jest.fn(),
}));

const mockGet = jest.fn();
jest.mock('axios', () => ({
  get: (...args) => mockGet(...args),
  post: jest.fn(),
  create: jest.fn(() => ({ get: mockGet, post: jest.fn() })),
}));

const ollamaReadiness = require('../../src/services/llm/ollamaReadiness');

describe('ollamaReadiness.quickCheck()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns ready=true when Ollama responds 200', async () => {
    mockGet.mockResolvedValueOnce({ status: 200, data: { models: [] } });

    const result = await ollamaReadiness.quickCheck(2000);

    expect(result.ready).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(ollamaReadiness.isReady()).toBe(true);
  });

  test('returns ready=false on connection error', async () => {
    const err = new Error('connect ECONNREFUSED');
    err.code = 'ECONNREFUSED';
    mockGet.mockRejectedValueOnce(err);

    const result = await ollamaReadiness.quickCheck(500);

    expect(result.ready).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
    expect(ollamaReadiness.isReady()).toBe(false);
  });

  test('returns ready=false on non-200 status', async () => {
    mockGet.mockResolvedValueOnce({ status: 503, data: {} });

    const result = await ollamaReadiness.quickCheck(500);

    expect(result.ready).toBe(false);
    expect(result.error).toContain('503');
    expect(ollamaReadiness.isReady()).toBe(false);
  });

  test('cached isReady() recovers after a successful probe', async () => {
    // 1) Fail once → isReady stays false
    mockGet.mockRejectedValueOnce(new Error('boom'));
    await ollamaReadiness.quickCheck(500);
    expect(ollamaReadiness.isReady()).toBe(false);

    // 2) Succeed once → isReady flips to true
    mockGet.mockResolvedValueOnce({ status: 200, data: { models: [] } });
    await ollamaReadiness.quickCheck(500);
    expect(ollamaReadiness.isReady()).toBe(true);
  });

  test('passes the configured timeout to axios', async () => {
    mockGet.mockResolvedValueOnce({ status: 200, data: { models: [] } });
    await ollamaReadiness.quickCheck(1234);
    expect(mockGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 1234 })
    );
  });

  describe('Phase 6.3 — circuit breaker integration', () => {
    const { circuitBreakers } = require('../../src/utils/retry');

    function resetOllamaBreaker() {
      const cb = circuitBreakers.get('ollama');
      cb.state = 'CLOSED';
      cb.failureCount = 0;
      cb.successCount = 0;
      cb.nextAttempt = Date.now();
      cb.lastError = null;
    }

    beforeEach(() => {
      resetOllamaBreaker();
    });

    afterEach(() => {
      resetOllamaBreaker();
    });

    test('opens the breaker after 3 consecutive Ollama failures', async () => {
      const err = new Error('ECONNREFUSED');
      err.code = 'ECONNREFUSED';
      mockGet.mockRejectedValue(err);

      // Default failureThreshold for ollama breaker is 3 (utils/retry.js:294).
      await ollamaReadiness.quickCheck(500);
      await ollamaReadiness.quickCheck(500);
      await ollamaReadiness.quickCheck(500);

      const cb = circuitBreakers.get('ollama');
      expect(cb.state).toBe('OPEN');
    });

    test('returns error="circuit-open" without hitting axios when breaker is open', async () => {
      // Force-open the breaker
      const cb = circuitBreakers.get('ollama');
      cb.state = 'OPEN';
      cb.nextAttempt = Date.now() + 60_000;

      mockGet.mockClear();
      const result = await ollamaReadiness.quickCheck(500);

      expect(result.ready).toBe(false);
      expect(result.error).toBe('circuit-open');
      // The whole point: no HTTP call when the breaker is open.
      expect(mockGet).not.toHaveBeenCalled();
    });

    test('successful probe in HALF_OPEN moves toward CLOSED', async () => {
      // Set HALF_OPEN with successCount one short of successThreshold (default 2)
      const cb = circuitBreakers.get('ollama');
      cb.state = 'HALF_OPEN';
      cb.successCount = 1;
      cb.failureCount = 0;

      mockGet.mockResolvedValueOnce({ status: 200, data: { models: [] } });
      const result = await ollamaReadiness.quickCheck(500);

      expect(result.ready).toBe(true);
      // Second success in HALF_OPEN → CLOSED
      expect(cb.state).toBe('CLOSED');
    });
  });
});
