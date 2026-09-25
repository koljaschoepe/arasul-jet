/**
 * Nach dem Passwortwechsel sagt die naechste Anfrage den neuen Stand (J35,
 * 25.09.2026).
 *
 * Der Fund vom Orin: der Startpasswort-Wechsel lief durch, der Mensch meldete
 * sich mit dem neuen Passwort und einem frischen Token an, und
 * `GET /api/auth/me` meldete noch 60 s lang `passwortWechselNoetig: true`.
 * `requireAuth` haelt die Zeile aus `admin_users` je KENNUNG im Speicher, nicht
 * je Token -- das neue Token traf die alte Zeile.
 *
 * Gemessen wird hier mit dem ECHTEN `requireAuth` und dem echten
 * `passwordService`, nur die Datenbank ist gestellt: erst waermt eine Anfrage
 * den Speicher mit `passwort_vom_admin = true`, dann schreibt der Wechsel
 * `false`, und die naechste Anfrage muss die Datenbank fragen.
 */

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/jwt', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: '7' }),
}));
jest.mock('../../src/utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('$neu$'),
  verifyPassword: jest.fn(),
  validatePasswordComplexity: jest.fn(() => ({ valid: true, errors: [] })),
}));
jest.mock('../../src/services/firmenordner/ordnerVerwaltung', () => ({
  istAn: () => false,
  spiegleNutzer: jest.fn(),
}));

const db = require('../../src/database');
const { verifyPassword } = require('../../src/utils/password');
const { requireAuth, clearUserCache } = require('../../src/middleware/auth');
const {
  changeDashboardPassword,
  setzePasswort,
} = require('../../src/services/auth/passwordService');

/** Die Zeile, wie sie gerade in der Datenbank steht. */
let zeile;

function zeileAusDb() {
  db.query.mockImplementation(async text => {
    if (text.includes('FROM admin_users')) return { rows: [{ ...zeile }] };
    return { rows: [] };
  });
  db.transaction.mockImplementation(async fn =>
    fn({
      query: jest.fn(async (text, werte) => {
        if (text.includes('UPDATE admin_users')) {
          zeile.passwort_vom_admin = werte[2];
          zeile.password_hash = werte[0];
        }
        return { rowCount: 1, rows: [] };
      }),
    })
  );
}

/** Eine Anfrage durch `requireAuth`; gibt `req.user` zurueck. */
async function anfrage() {
  const req = { headers: { authorization: 'Bearer neu' }, cookies: {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await requireAuth(req, res, next);
  expect(next).toHaveBeenCalled();
  return req.user;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearUserCache();
  zeile = {
    id: '7',
    username: 'mia',
    email: null,
    role: 'mitarbeiter',
    is_active: true,
    passwort_vom_admin: true,
    theme: 'light',
    password_hash: '$alt$',
  };
  zeileAusDb();
});

describe('Der Zwischenspeicher von requireAuth nach einem Passwortwechsel', () => {
  it('der Selbstwechsel verwirft ihn: die naechste Anfrage sagt „kein Wechsel noetig"', async () => {
    expect((await anfrage()).passwort_vom_admin).toBe(true);

    // erst das alte pruefen (true), dann "ist es dasselbe?" (false)
    verifyPassword.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await changeDashboardPassword('7', 'Start-123', 'Selbst-456', { username: 'mia' });

    expect((await anfrage()).passwort_vom_admin).toBe(false);
  });

  it('das Setzen durch den Administrator verwirft ihn ebenso, in die andere Richtung', async () => {
    zeile.passwort_vom_admin = false;
    expect((await anfrage()).passwort_vom_admin).toBe(false);

    await setzePasswort(7, 'Start-789', { gesetztVon: 'admin' });

    expect((await anfrage()).passwort_vom_admin).toBe(true);
  });

  it('ohne Wechsel bleibt der Speicher warm (die Messung misst wirklich den Speicher)', async () => {
    await anfrage();
    zeile.passwort_vom_admin = false; // an ihm vorbei geschrieben
    expect((await anfrage()).passwort_vom_admin).toBe(true);
  });
});
