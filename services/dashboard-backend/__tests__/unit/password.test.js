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
    // Note: PASSWORD_REQUIREMENTS is simplified for development
    // minLength: 4, no uppercase/lowercase/numbers/special required

    test('should accept strong password', () => {
      const result = validatePasswordComplexity('StrongPass123!@#');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept password meeting minimum length', () => {
      // Min length is 4 characters in dev mode
      const result = validatePasswordComplexity('test');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject password too short', () => {
      // Min length is 4 characters in dev mode
      const result = validatePasswordComplexity('abc');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 4 characters long');
    });

    test('should accept password without uppercase (dev mode)', () => {
      // Uppercase not required in dev mode
      const result = validatePasswordComplexity('lowercase123!');

      expect(result.valid).toBe(true);
    });

    test('should accept password without lowercase (dev mode)', () => {
      // Lowercase not required in dev mode
      const result = validatePasswordComplexity('UPPERCASE123!');

      expect(result.valid).toBe(true);
    });

    test('should accept password without numbers (dev mode)', () => {
      // Numbers not required in dev mode
      const result = validatePasswordComplexity('NoNumbers!@#');

      expect(result.valid).toBe(true);
    });

    test('should accept password without special characters (dev mode)', () => {
      // Special chars not required in dev mode
      const result = validatePasswordComplexity('NoSpecialChars123');

      expect(result.valid).toBe(true);
    });
  });
});
