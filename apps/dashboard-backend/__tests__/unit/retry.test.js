/**
 * Unit tests for retry utility
 */

const { retry: retryWithBackoff, calculateDelay } = require('../../src/utils/retry');

describe('Retry Utility', () => {
  describe('calculateDelay', () => {
    test('should calculate exponential backoff', () => {
      const options = { initialDelay: 1000, backoffMultiplier: 2, maxDelay: 10000, jitter: false };

      expect(calculateDelay(0, options)).toBe(1000);  // 1s
      expect(calculateDelay(1, options)).toBe(2000);  // 2s
      expect(calculateDelay(2, options)).toBe(4000);  // 4s
      expect(calculateDelay(3, options)).toBe(8000);  // 8s
    });

    test('should respect max delay', () => {
      const options = { initialDelay: 1000, backoffMultiplier: 2, maxDelay: 5000, jitter: false };

      expect(calculateDelay(10, options)).toBe(5000);
    });
  });

  describe('retryWithBackoff', () => {
    test('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(fn, { maxAttempts: 3, initialDelay: 10, shouldRetry: () => true });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('should fail after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(retryWithBackoff(fn, { maxAttempts: 3, initialDelay: 10, shouldRetry: () => true }))
        .rejects.toThrow('persistent failure');

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
