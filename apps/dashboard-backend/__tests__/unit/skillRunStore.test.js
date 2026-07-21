/**
 * Speicher für Skill-Läufe (Plan 011, Schritt 9).
 *
 * Getestet wird die LOGIK des Speichers, nicht Postgres: Welche SQL-Anweisung
 * mit welchen Parametern rausgeht, und — wichtiger — die Invarianten, die den
 * Speicher überhaupt verlässlich machen: dass ein beendeter Lauf nicht noch
 * einmal beendet wird, dass ein Abbruch nur den eigenen, laufenden Lauf trifft,
 * dass die Schritt-Position nicht vom Aufrufer kommt, und dass Rohdaten nur auf
 * Wunsch mitgeladen werden.
 *
 * Die DB ist ein schmales Doppel: `db.query` gibt zurück, was der jeweilige
 * Test vorgibt, und merkt sich die Aufrufe. Das reicht, weil runStore bewusst
 * keine eigene Logik in SQL auslagert, die ein echtes Postgres bräuchte.
 */

const { NotFoundError, ValidationError } = require('../../src/utils/errors');

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const runStore = require('../../src/services/skills/runStore');

/** Ein db-Doppel, das der Reihe nach die vorgegebenen Ergebnisse liefert. */
function fakeDb(...ergebnisse) {
  const calls = [];
  const db = {
    calls,
    query: jest.fn((sql, params) => {
      calls.push({ sql: String(sql), params });
      const naechstes = ergebnisse.shift();
      return Promise.resolve(naechstes || { rows: [] });
    }),
  };
  return db;
}

describe('createRun', () => {
  it('legt einen Lauf mit serialisierten Argumenten an', async () => {
    const db = fakeDb({ rows: [{ id: 7, status: 'laeuft' }] });
    const run = await runStore.createRun(
      { userId: 1, skillName: 'recherche', arguments: { thema: 'x' }, conversationId: 5 },
      { db }
    );
    expect(run).toEqual({ id: 7, status: 'laeuft' });
    const { sql, params } = db.calls[0];
    expect(sql).toMatch(/INSERT INTO skill_runs/);
    expect(params[0]).toBe(1);
    expect(params[1]).toBe('recherche');
    expect(JSON.parse(params[2])).toEqual({ thema: 'x' });
    expect(params[3]).toBe(5);
  });

  it('verträgt fehlende Argumente und fehlenden Chat-Kontext', async () => {
    const db = fakeDb({ rows: [{ id: 8 }] });
    await runStore.createRun({ userId: 1, skillName: 'notiz' }, { db });
    const { params } = db.calls[0];
    expect(JSON.parse(params[2])).toEqual({});
    expect(params[3]).toBeNull();
  });
});

describe('startStep', () => {
  it('leitet die Position aus dem Höchststand ab, statt sie entgegenzunehmen', async () => {
    // Der eigentliche Punkt: Der Aufrufer gibt KEINE Position. Sie entsteht in
    // derselben Anweisung aus MAX(position)+1 — sonst bekämen zwei gleichzeitige
    // Schritte dieselbe Nummer.
    const db = fakeDb({ rows: [{ id: 20, position: 3, kind: 'werkzeug' }] });
    const step = await runStore.startStep(
      { runId: 9, kind: 'werkzeug', name: 'web_suche', input: { q: 'x' } },
      { db }
    );
    expect(step.position).toBe(3);
    const { sql, params } = db.calls[0];
    expect(sql).toMatch(/COALESCE\(MAX\(position\) \+ 1, 0\)/);
    expect(params).not.toContain(3); // Position ist NICHT unter den Parametern
    expect(params[1]).toBe('werkzeug');
    expect(params[2]).toBe('web_suche');
  });
});

describe('finishStep', () => {
  it('trennt verdichtetes Ergebnis und Rohdaten', async () => {
    const db = fakeDb({ rows: [{ id: 20, status: 'fertig' }] });
    await runStore.finishStep(
      { stepId: 20, output: 'Kurzfassung', rawOutput: 'die ganze Seite …' },
      { db }
    );
    const { params } = db.calls[0];
    expect(params[1]).toBe('Kurzfassung'); // output
    expect(params[2]).toBe('die ganze Seite …'); // raw_output
    expect(params[3]).toBe('fertig');
  });

  it('wirft NotFound, wenn der Schritt nicht existiert', async () => {
    const db = fakeDb({ rows: [] });
    await expect(runStore.finishStep({ stepId: 999 }, { db })).rejects.toThrow(NotFoundError);
  });
});

describe('finishRun', () => {
  it('beendet nur einen noch laufenden Lauf (WHERE status = laeuft)', async () => {
    const db = fakeDb({ rows: [{ id: 7, status: 'fertig' }] });
    const run = await runStore.finishRun({ runId: 7, status: 'fertig', result: 'fertig!' }, { db });
    expect(run.status).toBe('fertig');
    const { sql } = db.calls[0];
    expect(sql).toMatch(/status = 'laeuft'/); // die Idempotenz-Bedingung
  });

  it('gibt null zurück, wenn der Lauf schon beendet war (kein Übertünchen)', async () => {
    // Ein spät eintreffendes 'fertig' darf einen zwischenzeitlichen Abbruch
    // NICHT überschreiben. Die DB liefert dann keine Zeile.
    const db = fakeDb({ rows: [] });
    const run = await runStore.finishRun({ runId: 7, status: 'fertig' }, { db });
    expect(run).toBeNull();
  });

  it('weist einen Nicht-Endzustand als ValidationError ab', async () => {
    const db = fakeDb();
    await expect(runStore.finishRun({ runId: 7, status: 'laeuft' }, { db })).rejects.toThrow(
      ValidationError
    );
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('cancelRun', () => {
  it('bricht Lauf UND offene Schritte ab, nur für den eigenen Nutzer', async () => {
    const db = fakeDb(
      { rows: [{ id: 7, status: 'abgebrochen' }] }, // der Lauf
      { rows: [] } // die Schritte
    );
    const run = await runStore.cancelRun({ runId: 7, userId: 1 }, { db });
    expect(run.status).toBe('abgebrochen');

    const laufSql = db.calls[0];
    expect(laufSql.sql).toMatch(/UPDATE skill_runs/);
    expect(laufSql.sql).toMatch(/user_id = \$2/); // Eigentümer-Bindung
    expect(laufSql.sql).toMatch(/status = 'laeuft'/); // nur laufende
    expect(laufSql.params).toEqual([7, 1]);

    const schrittSql = db.calls[1];
    expect(schrittSql.sql).toMatch(/UPDATE skill_run_steps/);
    expect(schrittSql.sql).toMatch(/status = 'laeuft'/); // fertige Schritte bleiben fertig
  });

  it('gibt null zurück (und rührt die Schritte nicht an), wenn nichts abzubrechen war', async () => {
    const db = fakeDb({ rows: [] });
    const run = await runStore.cancelRun({ runId: 7, userId: 1 }, { db });
    expect(run).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1); // die Schritt-Aktualisierung entfällt
  });

  it('bricht den Lauf eines FREMDEN Nutzers nicht ab (Eigentümer-Isolation)', async () => {
    // Der richtige Lauf, aber der falsche Nutzer: Das UPDATE trifft keine Zeile
    // (user_id im WHERE), die DB liefert nichts, und der Abbruch schlägt fehl —
    // ohne dass die Existenz des fremden Laufs sichtbar wird.
    const db = fakeDb({ rows: [] });
    const run = await runStore.cancelRun({ runId: 7, userId: 2 }, { db });
    expect(run).toBeNull();
    expect(db.calls[0].params).toEqual([7, 2]); // die fremde userId geht in die Bedingung ein
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('getRun', () => {
  it('lädt Lauf und Schritte, ohne Rohdaten', async () => {
    const db = fakeDb(
      { rows: [{ id: 7, skill_name: 'recherche' }] },
      { rows: [{ id: 20, position: 0 }] }
    );
    const run = await runStore.getRun({ runId: 7, userId: 1 }, { db });
    expect(run.skill_name).toBe('recherche');
    expect(run.steps).toHaveLength(1);
    // Ohne includeRaw darf raw_output NICHT in der Spaltenliste stehen.
    expect(db.calls[1].sql).not.toMatch(/raw_output/);
    expect(db.calls[1].sql).toMatch(/ORDER BY position ASC/);
  });

  it('lädt Rohdaten nur auf ausdrücklichen Wunsch (includeRaw)', async () => {
    const db = fakeDb({ rows: [{ id: 7 }] }, { rows: [] });
    await runStore.getRun({ runId: 7, userId: 1, includeRaw: true }, { db });
    expect(db.calls[1].sql).toMatch(/SELECT \* FROM skill_run_steps/);
  });

  it('wirft NotFound bei fremdem oder unbekanntem Lauf (verrät nichts)', async () => {
    const db = fakeDb({ rows: [] });
    await expect(runStore.getRun({ runId: 7, userId: 999 }, { db })).rejects.toThrow(NotFoundError);
    // Ist der Lauf nicht der eigene, werden die Schritte gar nicht erst geladen.
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('listRuns', () => {
  it('bindet auf den Nutzer und deckelt das Limit', async () => {
    const db = fakeDb({ rows: [] });
    await runStore.listRuns({ userId: 1, limit: 9999 }, { db });
    const { sql, params } = db.calls[0];
    expect(sql).toMatch(/WHERE user_id = \$1/);
    expect(params[0]).toBe(1);
    expect(params[params.length - 1]).toBe(200); // hart gedeckelt
  });

  it('filtert optional auf eine Unterhaltung', async () => {
    const db = fakeDb({ rows: [] });
    await runStore.listRuns({ userId: 1, conversationId: 5 }, { db });
    const { sql, params } = db.calls[0];
    expect(sql).toMatch(/conversation_id = \$2/);
    expect(params[1]).toBe(5);
  });
});
