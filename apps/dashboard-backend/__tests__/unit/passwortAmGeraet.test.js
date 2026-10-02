/**
 * Passwort am Geraet zuruecksetzen (J33): `reset-password.sh` geht durch den
 * einen Schreibweg, also bekommt auch der Dateidienst das neue Passwort.
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
}));
jest.mock('../../src/middleware/auth', () => ({ invalidateUserCache: jest.fn() }));
jest.mock('../../src/services/firmenordner/ordnerVerwaltung', () => ({
  istAn: jest.fn(),
  spiegleNutzer: jest.fn().mockResolvedValue(undefined),
}));

const db = require('../../src/database');
const firmenordner = require('../../src/services/firmenordner/ordnerVerwaltung');
const { setzePasswortAmGeraet } = require('../../src/services/auth/passwordService');

function datenbank({ gespiegelt = true, vorhanden = true } = {}) {
  db.transaction.mockImplementation(async fn =>
    fn({ query: jest.fn(async () => ({ rowCount: 1, rows: [] })) })
  );
  db.query.mockImplementation(async text => {
    if (text.includes('WHERE username')) {
      return { rows: vorhanden ? [{ id: 'u1', username: 'admin' }] : [] };
    }
    if (text.includes('SELECT id, username, email')) {
      return { rows: [{ id: 'u1', username: 'admin', email: 'a@b.de' }] };
    }
    if (text.includes('firmenordner_nutzer')) {
      return { rows: [{ passwort_gespiegelt: gespiegelt }] };
    }
    return { rows: [] };
  });
}

describe('setzePasswortAmGeraet', () => {
  beforeEach(() => jest.clearAllMocks());

  test('spiegelt das Klartextpasswort in den Dienst', async () => {
    firmenordner.istAn.mockReturnValue(true);
    datenbank();
    const r = await setzePasswortAmGeraet('admin', 'geheim1234');
    expect(firmenordner.spiegleNutzer).toHaveBeenCalledWith(
      expect.objectContaining({ benutzerId: 'u1', passwort: 'geheim1234' })
    );
    expect(r).toEqual({ id: 'u1', username: 'admin', gespiegelt: true });
  });

  test('hebt Sperre auf und beendet Sitzungen', async () => {
    firmenordner.istAn.mockReturnValue(false);
    datenbank();
    const r = await setzePasswortAmGeraet('admin', 'geheim1234');
    const sql = db.query.mock.calls.map(c => c[0]).join('\n');
    expect(sql).toContain('locked_until = NULL');
    expect(sql).toContain('DELETE FROM active_sessions');
    expect(r.gespiegelt).toBeNull();
  });

  test('meldet, wenn der Dienst das Passwort nicht annahm', async () => {
    firmenordner.istAn.mockReturnValue(true);
    datenbank({ gespiegelt: false });
    expect((await setzePasswortAmGeraet('admin', 'geheim1234')).gespiegelt).toBe(false);
  });

  test('unbekannter Benutzer und zu kurzes Passwort werfen', async () => {
    datenbank({ vorhanden: false });
    await expect(setzePasswortAmGeraet('nobody', 'geheim1234')).rejects.toThrow(/gibt es nicht/);
    await expect(setzePasswortAmGeraet('admin', 'kurz')).rejects.toThrow(/acht Zeichen/);
  });
});
