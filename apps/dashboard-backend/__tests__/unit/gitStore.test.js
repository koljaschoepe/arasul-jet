/**
 * Unit-Tests der Git-Kopplungs-DB-Schicht (Plan 013, B9).
 *
 * `db` ist injiziert — getestet wird die Logik: PAT wird verschlüsselt abgelegt
 * (Roundtrip über tokenCrypto), die letzten 4 Zeichen als Klartext-Maske, und
 * der verschlüsselte Blob geht NIE über die nach-außen-Spalten (SPALTEN) raus.
 */

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';

const gitStore = require('../../src/services/git/gitStore');
const { decryptToken } = require('../../src/utils/tokenCrypto');

/** Fake-db, die den letzten Query samt Parametern festhält. */
function fakeDb(rows = [{}]) {
  const calls = [];
  return {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push({ sql, params });
      return { rows, rowCount: rows.length };
    }),
  };
}

describe('upsertKopplung', () => {
  test('verschlüsselt den PAT und legt nur die letzten 4 Zeichen im Klartext ab', async () => {
    const db = fakeDb([{ project_id: 'p1' }]);
    await gitStore.upsertKopplung(
      { projectId: 'p1', repoUrl: 'https://github.com/o/r', branch: 'main', pat: 'ghp_supersecret' },
      { db }
    );
    const { params } = db.calls[0];
    const patBuf = params[3];
    const patLast4 = params[4];
    expect(Buffer.isBuffer(patBuf)).toBe(true);
    expect(decryptToken(patBuf)).toBe('ghp_supersecret');
    expect(patLast4).toBe('cret');
  });

  test('ohne PAT bleibt der verschlüsselte Wert null (COALESCE behält den alten)', async () => {
    const db = fakeDb([{ project_id: 'p1' }]);
    await gitStore.upsertKopplung(
      { projectId: 'p1', repoUrl: 'https://github.com/o/r', branch: 'dev', pat: null },
      { db }
    );
    const { params } = db.calls[0];
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
  });

  test('SPALTEN enthält kein pat_encrypted (Geheimnis bleibt drin)', () => {
    expect(gitStore.SPALTEN).not.toMatch(/pat_encrypted/);
    expect(gitStore.SPALTEN).toMatch(/pat_last4/);
  });
});

describe('entschluesselePat', () => {
  test('entschlüsselt den gespeicherten Blob wieder zum Klartext', async () => {
    const db = fakeDb([{ project_id: 'p1' }]);
    // erst verschlüsseln lassen …
    await gitStore.upsertKopplung(
      { projectId: 'p1', repoUrl: 'https://github.com/o/r', pat: 'token-123' },
      { db }
    );
    const blob = db.calls[0].params[3];
    // … dann als gespeicherte Zeile zurückgeben.
    const db2 = fakeDb([{ pat_encrypted: blob }]);
    const klar = await gitStore.entschluesselePat({ projectId: 'p1' }, { db: db2 });
    expect(klar).toBe('token-123');
  });

  test('ohne gespeicherten Token → null', async () => {
    const db = fakeDb([{ pat_encrypted: null }]);
    const klar = await gitStore.entschluesselePat({ projectId: 'p1' }, { db });
    expect(klar).toBeNull();
  });
});

describe('markiereSync', () => {
  test('reicht Status/Fehler/Commit an das UPDATE durch', async () => {
    const db = fakeDb([{ project_id: 'p1', last_status: 'synchronisiert' }]);
    await gitStore.markiereSync(
      { projectId: 'p1', status: 'synchronisiert', commit: 'abc1234', localPath: '/x' },
      { db }
    );
    const { params } = db.calls[0];
    expect(params).toEqual(['p1', 'synchronisiert', null, 'abc1234', '/x']);
  });
});
