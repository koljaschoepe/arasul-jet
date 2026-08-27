/**
 * requireRole (Phase C1 des Umbaus vom 26.08.2026): zwei Rollen, und alles,
 * was nicht Admin ist und nicht ausdruecklich Mitarbeiter, antwortet 403.
 */
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { requireRole, ROLLEN } = require('../../src/middleware/auth');

function lauf(middleware, user) {
  const req = { user, method: 'GET', originalUrl: '/api/x' };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  middleware(req, res, next);
  return { res, next };
}

describe('requireRole', () => {
  test('kennt genau admin und mitarbeiter', () => {
    expect([...ROLLEN]).toEqual(['admin', 'mitarbeiter']);
  });

  test('laesst die genannte Rolle durch', () => {
    const { next, res } = lauf(requireRole('admin'), { id: 1, username: 'a', role: 'admin' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('Mitarbeiter bekommt auf einer Admin-Route 403', () => {
    const { next, res } = lauf(requireRole('admin'), { id: 2, username: 'm', role: 'mitarbeiter' });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error.code).toBe('FORBIDDEN');
  });

  test('Mitarbeiter kommt durch, wo er ausdruecklich genannt ist', () => {
    const { next } = lauf(requireRole('admin', 'mitarbeiter'), {
      id: 2,
      username: 'm',
      role: 'mitarbeiter',
    });
    expect(next).toHaveBeenCalled();
  });

  test('ohne Nutzer 401, nicht 403', () => {
    const { res } = lauf(requireRole('admin'), undefined);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('eine unbekannte Rolle in der Zeile ist ein Programmierfehler beim Laden', () => {
    expect(() => requireRole('viewer')).toThrow(TypeError);
    expect(() => requireRole()).toThrow(TypeError);
  });
});
