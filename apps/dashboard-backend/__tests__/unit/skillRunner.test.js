/**
 * Lauf-Verwalter für Skills (Plan 011, Schritt 12).
 *
 * Die drei Zusagen, auf die es ankommt:
 *  - Ein Lauf startet LOSGELÖST: die Startfunktion kehrt sofort zurück, ohne auf
 *    das Ende des Laufs zu warten.
 *  - Live-Ereignisse erreichen die Abonnenten über den Bus.
 *  - Ein Abbruch setzt das Signal (der Lauf hört wirklich auf), nicht nur die DB.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
// runSkill/runStore werden über deps injiziert; das echte Modul ziehen wir aber
// nicht mit (es hängt an der DB). Deshalb hier mocken.
jest.mock('../../src/services/skills/runSkill', () => ({ runSkill: jest.fn() }));
jest.mock('../../src/services/skills/runStore', () => ({
  createRun: jest.fn(),
  finishRun: jest.fn(),
  cancelRun: jest.fn(),
}));

const skillRunner = require('../../src/services/skills/skillRunner');

beforeEach(() => {
  jest.clearAllMocks();
  skillRunner._reset();
});

describe('starten', () => {
  it('kehrt SOFORT mit der Lauf-ID zurück, ohne auf das Ende zu warten', async () => {
    const store = { createRun: jest.fn(async () => ({ id: 7 })), finishRun: jest.fn() };
    // Ein Lauf, der NIE fertig wird — starten muss trotzdem zurückkehren.
    const run = jest.fn(() => new Promise(() => {}));

    const t0 = Date.now();
    const { runId } = await skillRunner.starten(
      { skillName: 'notiz', args: { a: '1' }, userId: 1 },
      { run, store }
    );
    expect(runId).toBe(7);
    expect(Date.now() - t0).toBeLessThan(500); // nicht blockiert
    // runSkill wurde mit der bestehenden ID, einem onEvent und einem Signal gestartet.
    const arg = run.mock.calls[0][0];
    expect(arg.existingRunId).toBe(7);
    expect(typeof arg.onEvent).toBe('function');
    expect(arg.signal).toBeInstanceOf(AbortSignal);
    expect(skillRunner.istAktiv(7)).toBe(true);
  });

  it('verteilt Live-Ereignisse des Laufs an die Abonnenten', async () => {
    let onEvent;
    const store = { createRun: jest.fn(async () => ({ id: 8 })), finishRun: jest.fn() };
    const run = jest.fn(async p => {
      onEvent = p.onEvent;
      return { status: 'fertig' };
    });
    await skillRunner.starten({ skillName: 'notiz', userId: 1 }, { run, store });

    const gesehen = [];
    const abmelden = skillRunner.abonnieren(8, e => gesehen.push(e));
    expect(typeof abmelden).toBe('function');

    onEvent({ type: 'tool_start', tool: 'web_suche' });
    onEvent({ type: 'text', content: 'hallo' });
    expect(gesehen.map(e => e.type)).toEqual(['tool_start', 'text']);

    abmelden();
    onEvent({ type: 'text', content: 'danach' });
    expect(gesehen).toHaveLength(2); // nach dem Abmelden nichts mehr
  });

  it('meldet am Ende ein "ende"-Ereignis mit dem End-Status', async () => {
    const store = { createRun: jest.fn(async () => ({ id: 9 })), finishRun: jest.fn() };
    // Der Lauf braucht einen Moment — so ist der Abonnent dran, BEVOR er endet
    // (der Fall „schon fertig beim Verbinden" deckt in der Route die DB ab).
    const run = jest.fn(() => new Promise(r => setTimeout(() => r({ status: 'fertig' }), 15)));
    await skillRunner.starten({ skillName: 'notiz', userId: 1 }, { run, store });

    const gesehen = [];
    skillRunner.abonnieren(9, e => gesehen.push(e));
    await new Promise(r => setTimeout(r, 40));
    expect(gesehen.some(e => e.type === 'ende' && e.status === 'fertig')).toBe(true);
  });

  it('setzt den Lauf bei einem Hintergrund-Fehler auf "fehler"', async () => {
    const store = {
      createRun: jest.fn(async () => ({ id: 10 })),
      finishRun: jest.fn(async () => ({})),
    };
    const run = jest.fn(async () => {
      throw new Error('geplatzt');
    });
    await skillRunner.starten({ skillName: 'notiz', userId: 1 }, { run, store });
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 10, status: 'fehler' })
    );
  });
});

describe('abonnieren', () => {
  it('gibt null für einen nicht (mehr) aktiven Lauf zurück', () => {
    expect(skillRunner.abonnieren(999, () => {})).toBeNull();
  });
});

describe('abbrechen', () => {
  it('setzt DB-Status UND das Abbruch-Signal des laufenden Laufs', async () => {
    const store = {
      createRun: jest.fn(async () => ({ id: 11 })),
      finishRun: jest.fn(),
      cancelRun: jest.fn(async () => ({ id: 11, status: 'abgebrochen' })),
    };
    let signal;
    const run = jest.fn(async p => {
      signal = p.signal;
      return new Promise(() => {}); // läuft weiter, bis abgebrochen
    });
    await skillRunner.starten({ skillName: 'notiz', userId: 1 }, { run, store });

    expect(signal.aborted).toBe(false);
    const res = await skillRunner.abbrechen({ runId: 11, userId: 1 }, { store });
    expect(res).toMatchObject({ status: 'abgebrochen' });
    expect(store.cancelRun).toHaveBeenCalledWith({ runId: 11, userId: 1 });
    expect(signal.aborted).toBe(true); // der Lauf bekommt den Abbruch WIRKLICH mit
  });

  it('gibt null zurück (und signalisiert nichts), wenn nichts abzubrechen war', async () => {
    const store = { cancelRun: jest.fn(async () => null) };
    const res = await skillRunner.abbrechen({ runId: 12, userId: 1 }, { store });
    expect(res).toBeNull();
  });
});

describe('verwaisteAufraeumen', () => {
  it('setzt beim Start alle noch laufenden Läufe auf "fehler"', async () => {
    const db = { query: jest.fn(async () => ({ rowCount: 2, rows: [{ id: 1 }, { id: 2 }] })) };
    const n = await skillRunner.verwaisteAufraeumen({ db });
    expect(n).toBe(2);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/UPDATE skill_runs/);
    expect(sql).toMatch(/status = 'laeuft'/); // nur die laufenden
    expect(sql).toMatch(/SET status = 'fehler'/);
  });
});
