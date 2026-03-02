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
    // Requirements: minLength 8, requireUppercase, requireLowercase, requireNumbers

    test('should accept strong password', () => {
      const result = validatePasswordComplexity('StrongPass123!@#');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept password meeting all requirements', () => {
      const result = validatePasswordComplexity('Abcdef1x');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject password shorter than 8 characters', () => {
      const result = validatePasswordComplexity('Abc1xyz');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passwort muss mindestens 8 Zeichen lang sein');
    });

    test('should reject password without uppercase', () => {
      const result = validatePasswordComplexity('lowercase12345');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passwort muss mindestens einen Grossbuchstaben enthalten');
    });

    test('should reject password without lowercase', () => {
      const result = validatePasswordComplexity('UPPERCASE12345');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passwort muss mindestens einen Kleinbuchstaben enthalten');
    });

    test('should reject password without numbers', () => {
      const result = validatePasswordComplexity('NoNumbersHere');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passwort muss mindestens eine Zahl enthalten');
    });

    test('should accept password without special characters', () => {
      const result = validatePasswordComplexity('NoSpecial1x');

      expect(result.valid).toBe(true);
    });

    test('should return multiple errors for very weak password', () => {
      const result = validatePasswordComplexity('abc');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    test('should accept exactly 8 character password meeting all requirements', () => {
      const result = validatePasswordComplexity('Abcdef1x');

      expect(result.valid).toBe(true);
    });
  });
});
