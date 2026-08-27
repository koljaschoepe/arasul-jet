/**
 * Das Startpasswort und sein Wechsel (Phase D1).
 *
 * Die Tatsache, um die es geht, ist eine einzige: KENNT EIN ZWEITER DAS
 * PASSWORT? Sie steht in `admin_users.passwort_vom_admin` (Migration 178) und
 * wird an genau drei Stellen auf `true` gesetzt (anlegen, setzen durch den
 * Administrator, Bootstrap) und an genau einer auf `false` (der Mensch waehlt
 * es selbst).
 *
 * Dieser Test haelt diese Zaehlung fest. Ohne ihn ist die naechste Stelle, die
 * ein Passwort schreibt, ohne das Kennzeichen — und der erzwungene Wechsel
 * greift dort still nicht mehr.
 */

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('$neu$'),
  verifyPassword: jest.fn(),
  validatePasswordComplexity: jest.fn(() => ({ valid: true, errors: [] })),
  PASSWORD_REQUIREMENTS: { minLength: 8 },
}));
jest.mock('../../src/utils/jwt', () => ({ blacklistAllUserTokens: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  invalidateUserCache: jest.fn(),
  ROLLEN: ['admin', 'mitarbeiter'],
}));

const db = require('../../src/database');
const { verifyPassword } = require('../../src/utils/password');
const {
  setzePasswort,
  changeDashboardPassword,
} = require('../../src/services/auth/passwordService');
const benutzerService = require('../../src/services/auth/benutzerService');

/** Der Client innerhalb der Transaktion; gibt die UPDATE-Aufrufe zurueck. */
function transaktionMitSammler() {
  const aufrufe = [];
  db.transaction.mockImplementation(async fn =>
    fn({
      query: jest.fn(async (text, werte) => {
        aufrufe.push({ text, werte });
        return { rowCount: 1, rows: [] };
      }),
    })
  );
  return aufrufe;
}

/** Der Wert, der im UPDATE auf `passwort_vom_admin` geschrieben wird. */
function kennzeichenAus(aufrufe) {
  const update = aufrufe.find(a => a.text.includes('UPDATE admin_users'));
  expect(update).toBeDefined();
  expect(update.text).toContain('passwort_vom_admin');
  return update.werte[2];
}

beforeEach(() => jest.clearAllMocks());

describe('Ein Zweiter kennt das Passwort', () => {
  it('der Administrator setzt es → Kennzeichen true', async () => {
    db.query.mockResolvedValue({ rows: [{ id: '7', username: 'mia' }] });
    const aufrufe = transaktionMitSammler();

    await setzePasswort('7', 'Start-123', { gesetztVon: 'admin' });

    expect(kennzeichenAus(aufrufe)).toBe(true);
  });

  it('beim Anlegen eines Benutzers → Kennzeichen true', async () => {
    db.query.mockResolvedValue({ rows: [{ id: '7', username: 'mia', role: 'mitarbeiter' }] });

    await benutzerService.legeBenutzerAn({
      username: 'mia',
      password: 'Start-123',
      email: null,
      rolle: 'mitarbeiter',
    });

    const [text] = db.query.mock.calls[0];
    expect(text).toContain('passwort_vom_admin');
    expect(text).toMatch(/VALUES\s*\(\$1, \$2, \$3, \$4, true, true,/);
  });
});

describe('Der Mensch waehlt es selbst', () => {
  it('der Selbstwechsel nimmt das Kennzeichen zurueck', async () => {
    db.query.mockResolvedValue({ rows: [{ password_hash: '$alt$' }] });
    // erst das alte pruefen (true), dann "ist es dasselbe?" (false)
    verifyPassword.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const aufrufe = transaktionMitSammler();

    await changeDashboardPassword('7', 'Start-123', 'Selbst-456', { username: 'mia' });

    expect(kennzeichenAus(aufrufe)).toBe(false);
  });

  it('ein falsches altes Passwort schreibt gar nichts', async () => {
    db.query.mockResolvedValue({ rows: [{ password_hash: '$alt$' }] });
    verifyPassword.mockResolvedValue(false);

    await expect(
      changeDashboardPassword('7', 'falsch', 'Selbst-456', { username: 'mia' })
    ).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

/**
 * Der Vorgabewert ist `false` und nicht `true`. Wer einen dritten Schreibweg
 * baut und die Angabe vergisst, verlangt damit KEINEN Wechsel — der Zustand
 * von vorher. Ein versehentliches `true` hielte dagegen jeden Betroffenen bei
 * der naechsten Anmeldung an.
 */
describe('Ohne Angabe', () => {
  it('gilt false', async () => {
    db.query.mockResolvedValue({ rows: [{ password_hash: '$alt$' }] });
    verifyPassword.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const aufrufe = transaktionMitSammler();

    await changeDashboardPassword('7', 'alt', 'neu-12345');

    expect(kennzeichenAus(aufrufe)).toBe(false);
  });
});
