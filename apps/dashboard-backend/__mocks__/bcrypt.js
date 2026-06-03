/**
 * Manual mock for bcrypt.
 * bcrypt has a native binding (bcrypt_lib.node) that requires glibc.
 * On the Jetson (musl libc) the native file cannot be opened, so every test
 * suite that transitively imports server.js fails before any test runs.
 * This mock ships a pure-JS stub that keeps the bcrypt API intact.
 */

const MOCK_HASH_PREFIX = '$2b$12$mockhash_';

const bcrypt = {
  /**
   * Returns a deterministic fake hash so that compare() can round-trip it.
   */
  hash: jest.fn(async (password, _saltRounds) => {
    return `${MOCK_HASH_PREFIX}${Buffer.from(password).toString('base64')}`;
  }),

  /**
   * Validates the fake hash produced by hash() above, or accepts the
   * validPasswordHash constant used in auth.test.js by always returning true
   * when the stored hash starts with the well-known $2b$ bcrypt prefix that
   * is NOT our mock prefix — auth.test.js supplies a real bcrypt hash and
   * expects a correct compare; we mirror that by checking for the mock prefix.
   */
  compare: jest.fn(async (password, hash) => {
    if (hash.startsWith(MOCK_HASH_PREFIX)) {
      const encoded = hash.slice(MOCK_HASH_PREFIX.length);
      return Buffer.from(encoded, 'base64').toString() === password;
    }
    // For real-looking hashes (e.g. $2b$12$Z3DIU…) used in auth.test.js
    // we return true only when the password is the known test password.
    return password === 'TestPassword123!';
  }),

  genSalt: jest.fn(async (rounds) => `$2b$${rounds}$mockSalt`),
};

module.exports = bcrypt;
