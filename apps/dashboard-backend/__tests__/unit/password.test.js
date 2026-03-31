/**
 * Unit tests for password utility functions
 */

const { hashPassword, verifyPassword, validatePasswordComplexity } = require('../../src/utils/password');

// bcrypt with 12 salt rounds is slow on ARM/Jetson hardware
// Each hash operation can take 10-15 seconds, so we need generous timeouts
const BCRYPT_TEST_TIMEOUT = 30000;

describe('Password Utilities', () => {
  describe('hashPassword', () => {
    test('should hash a password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    }, BCRYPT_TEST_TIMEOUT);

    test('should generate different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    }, BCRYPT_TEST_TIMEOUT * 2);
  });

  describe('verifyPassword', () => {
    test('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    }, BCRYPT_TEST_TIMEOUT * 2);

    test('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    }, BCRYPT_TEST_TIMEOUT * 2);
  });

  describe('validatePasswordComplexity', () => {
    // Requirements: minLength 4, no complexity requirements

    test('should accept any password with 4+ characters', () => {
      const result = validatePasswordComplexity('abcd');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept a simple numeric password', () => {
      const result = validatePasswordComplexity('1234');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept a strong password', () => {
      const result = validatePasswordComplexity('StrongPass123!@#');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject password shorter than 4 characters', () => {
      const result = validatePasswordComplexity('abc');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passwort muss mindestens 4 Zeichen lang sein');
    });

    test('should accept exactly 4 character password', () => {
      const result = validatePasswordComplexity('test');

      expect(result.valid).toBe(true);
    });

    test('should accept password without uppercase', () => {
      const result = validatePasswordComplexity('lowercase');

      expect(result.valid).toBe(true);
    });

    test('should accept password without numbers', () => {
      const result = validatePasswordComplexity('nonumbers');

      expect(result.valid).toBe(true);
    });
  });
});
