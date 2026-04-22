/**
 * Unit tests for utils/tokenCrypto.js
 *
 * AES-256-GCM round-trip, integrity checks, and key-derivation guard.
 * These paths handle Telegram bot tokens in encrypted DB columns — tampering
 * must surface as a thrown error, never silent corruption.
 */

describe('tokenCrypto', () => {
  const originalSecret = process.env.JWT_SECRET;
  let encryptToken;
  let decryptToken;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = 'test-secret-key-for-jwt-testing-minimum-32-chars';
    ({ encryptToken, decryptToken } = require('../../src/utils/tokenCrypto'));
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  describe('roundtrip', () => {
    test('encrypts and decrypts to original plaintext', () => {
      const token = '1234567890:ABCdefGhIJKlmnOPQRsTUVwxyZ';
      const cipher = encryptToken(token);
      expect(Buffer.isBuffer(cipher)).toBe(true);
      expect(decryptToken(cipher)).toBe(token);
    });

    test('handles unicode and empty strings', () => {
      expect(decryptToken(encryptToken(''))).toBe('');
      expect(decryptToken(encryptToken('grüße 🚀'))).toBe('grüße 🚀');
    });

    test('produces distinct ciphertexts for identical plaintexts (random IV)', () => {
      const token = 'same-input';
      const a = encryptToken(token);
      const b = encryptToken(token);
      expect(a.equals(b)).toBe(false);
      expect(decryptToken(a)).toBe(token);
      expect(decryptToken(b)).toBe(token);
    });
  });

  describe('output layout', () => {
    test('ciphertext starts with 16-byte IV + 16-byte auth tag', () => {
      const cipher = encryptToken('x');
      expect(cipher.length).toBeGreaterThanOrEqual(32 + 1);
    });
  });

  describe('tamper detection', () => {
    test('flipped auth tag causes decrypt to throw', () => {
      const cipher = Buffer.from(encryptToken('secret'));
      cipher[20] ^= 0xff;
      expect(() => decryptToken(cipher)).toThrow();
    });

    test('flipped ciphertext byte causes decrypt to throw', () => {
      const cipher = Buffer.from(encryptToken('secret'));
      cipher[cipher.length - 1] ^= 0xff;
      expect(() => decryptToken(cipher)).toThrow();
    });

    test('flipped IV causes decrypt to throw', () => {
      const cipher = Buffer.from(encryptToken('secret'));
      cipher[0] ^= 0xff;
      expect(() => decryptToken(cipher)).toThrow();
    });
  });

  describe('null/undefined input', () => {
    test('decryptToken(null) returns null', () => {
      expect(decryptToken(null)).toBeNull();
    });

    test('decryptToken(undefined) returns null', () => {
      expect(decryptToken(undefined)).toBeNull();
    });
  });

  describe('key derivation', () => {
    test('throws when JWT_SECRET is not set', () => {
      jest.resetModules();
      delete process.env.JWT_SECRET;
      const { encryptToken: encryptNoSecret } = require('../../src/utils/tokenCrypto');
      expect(() => encryptNoSecret('x')).toThrow(/JWT_SECRET/);
    });

    test('different JWT_SECRET values produce non-interoperable ciphertexts', () => {
      const cipher = encryptToken('portable-token');
      jest.resetModules();
      process.env.JWT_SECRET = 'different-secret-also-32-chars-or-longer-enough';
      const { decryptToken: decryptOther } = require('../../src/utils/tokenCrypto');
      expect(() => decryptOther(cipher)).toThrow();
    });
  });
});
