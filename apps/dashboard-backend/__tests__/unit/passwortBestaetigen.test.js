/**
 * Einen schweren Handgriff mit dem eigenen Passwort bestaetigen (Auftrag
 * sicherung-zurueckholen, M5): richtig geht durch, falsch ist ein 403 mit
 * `PASSWORT_FALSCH` -- kein 401, der die Oberflaeche abmeldete.
 */
jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/password', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(async (klar, hash) => klar === 'richtig' && hash === '$hash$'),
  validatePasswordComplexity: jest.fn(() => ({ valid: true, errors: [] })),
}));
jest.mock('../../src/middleware/auth', () => ({ invalidateUserCache: jest.fn() }));
jest.mock('../../src/services/firmenordner/ordnerVerwaltung', () => ({}));

const db = require('../../src/database');
const { bestaetigePasswort } = require('../../src/services/auth/passwordService');

beforeEach(() => db.query.mockResolvedValue({ rows: [{ password_hash: '$hash$' }] }));

describe('bestaetigePasswort', () => {
  it('nimmt das richtige Passwort des angemeldeten Menschen', async () => {
    await expect(bestaetigePasswort(7, 'richtig')).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledWith(expect.stringMatching(/admin_users/), [7]);
  });

  it.each([['falsch'], [''], [undefined]])('weist %p mit 403 PASSWORT_FALSCH ab', async wort => {
    await expect(bestaetigePasswort(7, wort)).rejects.toMatchObject({
      statusCode: 403,
      code: 'PASSWORT_FALSCH',
    });
  });

  it('einen Menschen, den es nicht gibt, ebenso', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(bestaetigePasswort(99, 'richtig')).rejects.toMatchObject({ statusCode: 403 });
  });
});
