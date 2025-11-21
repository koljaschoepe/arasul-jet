/**
 * Unit tests for password utility functions
 */

const { hashPassword, verifyPassword, validatePasswordComplexity } = require('../../src/utils/password');

describe('Password Utilities', () => {
  describe('hashPassword', () => {
    test('should hash a password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    test('should generate different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    test('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });
  });

  describe('validatePasswordComplexity', () => {
    test('should accept strong password', () => {
      const result = validatePasswordComplexity('StrongPass123!@#');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject password too short', () => {
      const result = validatePasswordComplexity('Short1!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 12 characters long');
    });

    test('should reject password without uppercase', () => {
      const result = validatePasswordComplexity('lowercase123!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    test('should reject password without lowercase', () => {
      const result = validatePasswordComplexity('UPPERCASE123!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    test('should reject password without numbers', () => {
      const result = validatePasswordComplexity('NoNumbers!@#');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    test('should reject password without special characters', () => {
      const result = validatePasswordComplexity('NoSpecialChars123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });
});
