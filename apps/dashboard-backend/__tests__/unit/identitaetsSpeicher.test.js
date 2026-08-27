/**
 * Der Identitaets-Zwischenspeicher in `middleware/auth.js` (Phase C2,
 * 27.08.2026).
 *
 * Er haelt eine Benutzerzeile 60 Sekunden lang, damit nicht jede Anfrage die
 * Datenbank fragt. Wer jemanden stilllegt oder loescht, MUSS ihn leeren, sonst
 * kommt der Betroffene bis zu eine Minute weiter durch.
 *
 * Der Haken, und deshalb gibt es diese Datei: die `Map` wird mit der Kennung
 * aus dem JWT gefuellt, und die ist eine ZEICHENKETTE (`admin_users.id` ist
 * BIGSERIAL, `node-postgres` liefert `int8` als String; am Geraet nachgesehen
 * traegt die Nutzlast `"userId": "1"`). Ein Aufrufer mit einem Pfadparameter
 * reicht dagegen eine ZAHL herein. `Map` vergleicht mit SameValueZero, also
 * war `delete(1)` auf dem Schluessel `'1'` ein stiller Fehlschlag.
 *
 * Ein Mock haette das nie gezeigt: er zeichnet den Aufruf auf und ist zufrieden.
 * Hier laeuft der echte Zwischenspeicher.
 */
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/jwt', () => ({ verifyToken: jest.fn() }));

const db = require('../../src/database');
const { verifyToken } = require('../../src/utils/jwt');
const { requireAuth, invalidateUserCache, clearUserCache } = require('../../src/middleware/auth');

// Die Zeile so, wie die Datenbank sie liefert: die Kennung als Zeichenkette.
const ZEILE = { id: '2', username: 'mia', email: null, role: 'mitarbeiter', is_active: true };

async function anfrage() {
  const req = { headers: { authorization: 'Bearer t' }, cookies: {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  await requireAuth(req, res, next);
  return { req, res, next };
}

describe('Identitaets-Zwischenspeicher', () => {
  beforeEach(() => {
    clearUserCache();
    db.query.mockReset();
    // Die Kennung im Token ist eine Zeichenkette, so wie sie beim Anmelden
    // aus `admin_users` kam und durch den JWT gegangen ist.
    verifyToken.mockResolvedValue({ userId: '2', jti: 'x' });
  });

  test('die zweite Anfrage fragt die Datenbank nicht noch einmal', async () => {
    db.query.mockResolvedValue({ rows: [ZEILE] });
    const erste = await anfrage();
    const zweite = await anfrage();
    expect(erste.next).toHaveBeenCalled();
    expect(zweite.next).toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('invalidateUserCache leert den Eintrag auch mit einer ZAHL als Kennung', async () => {
    db.query.mockResolvedValue({ rows: [ZEILE] });
    await anfrage();
    expect(db.query).toHaveBeenCalledTimes(1);

    // Genau das tut `setzeAktiv`: die Kennung kommt aus dem Pfad und ist durch
    // `z.coerce.number()` gegangen. Vor dem 27.08.2026 lief das ins Leere.
    invalidateUserCache(2);

    await anfrage();
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('ein Stillgelegter kommt nach dem Leeren nicht mehr durch', async () => {
    db.query.mockResolvedValueOnce({ rows: [ZEILE] });
    await anfrage();

    invalidateUserCache(2);
    db.query.mockResolvedValueOnce({ rows: [{ ...ZEILE, is_active: false }] });
    const { res, next } = await anfrage();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
