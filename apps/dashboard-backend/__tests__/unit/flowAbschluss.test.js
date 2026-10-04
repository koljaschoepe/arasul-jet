/**
 * Der Abschluss eines Flows ueber die App (M5, Kontrakt 11).
 *
 * Gemessen wird, was die Abnahme am Orin nicht allein belegt: dass nur 2xx
 * einen Lauf fertig macht, dass jeder andere Ausgang ihn auf `nicht_uebergeben`
 * stellt, dass „erneut" dieselbe Kennung und dieselben Daten schickt, ohne die
 * Schritte zu starten, und dass ein Flow ohne Route sich wie bisher verhaelt.
 */

jest.mock('axios');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const abschluss = require('../../src/services/flows/abschluss');
const appAbschluss = require('../../src/services/app/appAbschluss');
const { runFlow } = require('../../src/services/flows/runFlow');
const { FlowDefinition } = require('../../src/schemas/flows');
const { ConflictError, NotFoundError } = require('../../src/utils/errors');

const LAUF = {
  id: '7',
  flow_name: 'beleg',
  app_id: 'buch',
  stand: 'test',
  arguments: { beleg: '4711' },
  result: 'betrag: 12',
  annahmen: null,
  abschluss: { route: '/abschluss/beleg', versuche: 0 },
  status: 'laeuft',
};

function dbMit(lauf) {
  return { query: jest.fn(async () => ({ rows: lauf ? [lauf] : [] })) };
}

describe('Abschluss-Route im Flow-Kopf', () => {
  const rumpf = {
    name: 'beleg',
    systemPrompt: 'Schreibe.',
    grenzen: { werkzeug_runden: 5, zeitlimit_s: 300 },
  };

  it('nimmt einen Pfad der eigenen App', () => {
    const r = FlowDefinition.safeParse({ ...rumpf, abschluss: { route: '/abschluss/beleg' } });
    expect(r.success).toBe(true);
  });

  it.each([
    'abschluss',
    'http://boese.example/x',
    '//boese.example/x',
    '/a/../b',
    '/a?x=1',
    '/a#b',
    '/a b',
    '',
  ])('weist %j ab', route => {
    expect(FlowDefinition.safeParse({ ...rumpf, abschluss: { route } }).success).toBe(false);
  });

  it('weist unbekannte Felder in abschluss ab', () => {
    const r = FlowDefinition.safeParse({ ...rumpf, abschluss: { route: '/a', host: 'x' } });
    expect(r.success).toBe(false);
  });
});

describe('Token', () => {
  it('ist je App und Stand verschieden und stabil', () => {
    expect(appAbschluss.tokenFuer('a', 'test')).toBe(appAbschluss.tokenFuer('a', 'test'));
    expect(appAbschluss.tokenFuer('a', 'test')).not.toBe(appAbschluss.tokenFuer('a', 'live'));
    expect(appAbschluss.tokenFuer('a', 'test')).not.toBe(appAbschluss.tokenFuer('b', 'test'));
    expect(appAbschluss.umgebungFuer('a', 'test')).toEqual({
      ARASUL_ABSCHLUSS_TOKEN: appAbschluss.tokenFuer('a', 'test'),
    });
  });
});

describe('appAbschluss.uebergebe', () => {
  function anfrageMit({ status, body = '', fehler, haengt }) {
    const gesendet = {};
    const anfrage = jest.fn((opts, cb) => {
      gesendet.opts = opts;
      const handlers = {};
      const req = {
        on: (name, fn) => {
          handlers[name] = fn;
          return req;
        },
        destroy: jest.fn(),
        end: jest.fn(b => {
          gesendet.body = b;
          if (haengt) {
            setTimeout(() => handlers.timeout && handlers.timeout(), 1);
          } else if (fehler) {
            setImmediate(() => handlers.error({ code: fehler }));
          } else {
            const res = {
              statusCode: status,
              on: (n, f) => {
                if (n === 'data' && body) setImmediate(() => f(Buffer.from(body)));
                if (n === 'end') setTimeout(f, 5);
                return res;
              },
            };
            cb(res);
          }
        }),
      };
      return req;
    });
    return { anfrage, gesendet };
  }

  const p = {
    appId: 'buch',
    stand: 'test',
    route: '/abschluss/beleg',
    laufId: 7,
    nutzlast: { lauf: 7 },
  };

  it('ruft den Container der App mit Kennung und Token auf, 2xx ist bestaetigt', async () => {
    const { anfrage, gesendet } = anfrageMit({ status: 204 });
    const r = await appAbschluss.uebergebe(p, { anfrage, port: async () => 3000 });
    expect(r).toEqual({ ok: true, statusCode: 204, fehler: null });
    expect(gesendet.opts).toMatchObject({
      host: 'arasul-app-buch-test',
      port: 3000,
      path: '/abschluss/beleg',
      method: 'POST',
    });
    expect(gesendet.opts.headers['Idempotency-Key']).toBe('arasul-lauf-7');
    expect(gesendet.opts.headers.Authorization).toBe(
      `Bearer ${appAbschluss.tokenFuer('buch', 'test')}`
    );
    expect(JSON.parse(gesendet.body)).toEqual({ lauf: 7 });
  });

  it.each([[500], [503], [302], [404]])('%i ist keine Empfangsbestaetigung', async status => {
    const { anfrage } = anfrageMit({ status, body: 'kaputt' });
    const r = await appAbschluss.uebergebe(p, { anfrage, port: async () => 3000 });
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(status);
    expect(r.fehler).toContain(String(status));
  });

  it('meldet eine nicht erreichbare App ohne zu werfen', async () => {
    const { anfrage } = anfrageMit({ fehler: 'ECONNREFUSED' });
    const r = await appAbschluss.uebergebe(p, { anfrage, port: async () => 3000 });
    expect(r).toMatchObject({ ok: false, statusCode: null });
    expect(r.fehler).toContain('ECONNREFUSED');
  });

  it('meldet fehlende Antwort als nicht bestaetigt', async () => {
    const { anfrage } = anfrageMit({ haengt: true });
    const r = await appAbschluss.uebergebe(p, { anfrage, port: async () => 3000 });
    expect(r.ok).toBe(false);
    expect(r.fehler).toMatch(/nicht innerhalb/);
  });

  it('meldet eine App ohne Backend', async () => {
    const r = await appAbschluss.uebergebe(p, { anfrage: jest.fn(), port: async () => null });
    expect(r.ok).toBe(false);
    expect(r.fehler).toMatch(/kein Backend/);
  });
});

describe('abschluss.uebergebe', () => {
  it('schickt Ergebnis, Argumente und die geltenden Felder und schreibt den Ausgang', async () => {
    const store = { abschlussErgebnis: jest.fn(async () => ({ status: 'fertig' })) };
    const aufruf = jest.fn(async () => ({ ok: true, statusCode: 200, fehler: null }));
    const lesen = jest.fn(async () => ({
      felder: { datum: '2026-10-05' },
      korrekturen: [
        { feld: 'datum', vorschlag: '2026-10-04', wert: '2026-10-05', von: 'a', am: 'x' },
      ],
    }));
    const r = await abschluss.uebergebe({ runId: 7 }, { db: dbMit(LAUF), store, aufruf, lesen });
    expect(r).toEqual({ status: 'fertig' });
    expect(aufruf).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'buch',
        stand: 'test',
        route: '/abschluss/beleg',
        laufId: 7,
        nutzlast: expect.objectContaining({
          lauf: 7,
          flow: 'beleg',
          ergebnis: 'betrag: 12',
          argumente: { beleg: '4711' },
          felder: { datum: '2026-10-05' },
          korrekturen: [expect.objectContaining({ feld: 'datum', wert: '2026-10-05' })],
        }),
      })
    );
    expect(store.abschlussErgebnis).toHaveBeenCalledWith({
      runId: 7,
      ok: true,
      statusCode: 200,
      fehler: null,
    });
  });

  it('schreibt einen Fehler der App als nicht uebergeben, auch wenn der Aufruf wirft', async () => {
    const store = { abschlussErgebnis: jest.fn(async () => ({ status: 'nicht_uebergeben' })) };
    const aufruf = jest.fn(async () => {
      throw new Error('boom');
    });
    await abschluss.uebergebe(
      { runId: 7 },
      { db: dbMit(LAUF), store, aufruf, lesen: async () => null }
    );
    expect(store.abschlussErgebnis).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, fehler: expect.stringContaining('boom') })
    );
  });

  it('tut nichts bei einem Lauf ohne Abschluss-Route', async () => {
    const store = { abschlussErgebnis: jest.fn() };
    const aufruf = jest.fn();
    const r = await abschluss.uebergebe(
      { runId: 7 },
      { db: dbMit({ ...LAUF, abschluss: null }), store, aufruf, lesen: async () => null }
    );
    expect(r).toBeNull();
    expect(aufruf).not.toHaveBeenCalled();
  });
});

describe('abschluss.erneut', () => {
  it('uebergibt noch einmal mit derselben Kennung', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ status: 'nicht_uebergeben' }] })
        .mockResolvedValueOnce({ rows: [{ ...LAUF, status: 'nicht_uebergeben' }] }),
    };
    const store = { abschlussErgebnis: jest.fn(async () => ({ status: 'fertig' })) };
    const aufruf = jest.fn(async () => ({ ok: true, statusCode: 200, fehler: null }));
    const r = await abschluss.erneut(
      { runId: 7, appId: 'buch' },
      { db, store, aufruf, lesen: async () => null }
    );
    expect(r.status).toBe('fertig');
    expect(aufruf.mock.calls[0][0].laufId).toBe(7);
  });

  it('lehnt einen Lauf in einem anderen Zustand ab', async () => {
    const db = dbMit({ status: 'fertig' });
    await expect(abschluss.erneut({ runId: 7, appId: 'buch' }, { db })).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('kennt einen Lauf einer anderen App nicht', async () => {
    await expect(
      abschluss.erneut({ runId: 7, appId: 'fremd' }, { db: dbMit(null) })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('runFlow mit Abschluss-Route', () => {
  const basis = {
    systemPrompt: 'Schreibe.',
    argumente: [],
    werkzeuge: [],
    ordner: [],
    grenzen: { werkzeug_runden: 5, zeitlimit_s: 300, max_aufrufe: 20 },
  };
  function deps(flowDef) {
    return {
      store: {
        createRun: jest.fn(async () => ({ id: 7 })),
        startStep: jest.fn(async () => ({ id: 1 })),
        finishStep: jest.fn(async () => ({})),
        bumpSteps: jest.fn(async () => 1),
        finishRun: jest.fn(async () => ({})),
        beginneAbschluss: jest.fn(async () => true),
        saveChanges: jest.fn(async () => {}),
        getRun: jest.fn(async () => ({
          id: 7,
          status: 'fertig',
          steps_used: 0,
          changes: [],
          steps: [],
        })),
      },
      loadFlow: jest.fn(async () => ({ ...flowDef })),
      makeTools: jest.fn(() => []),
      runLoop: jest.fn(async () => ({ result: 'Das Ergebnis', runden: 1 })),
      tracker: {
        snapshot: jest.fn(async () => new Map()),
        berechneAenderungen: jest.fn(() => ({ aenderungen: [], abgeschnitten: false })),
      },
      resolveModel: jest.fn(async () => 'm'),
      uebergebe: jest.fn(async () => ({ status: 'fertig' })),
    };
  }
  const lauf = { flowName: 'beleg', userId: 1, appId: 'buch', stand: 'test' };

  it('schreibt das Ergebnis zuerst, uebergibt, und beendet den Lauf nicht selbst', async () => {
    const d = deps({ ...basis, abschluss: { route: '/abschluss/beleg' } });
    await runFlow(lauf, d);
    expect(d.store.beginneAbschluss).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 7, route: '/abschluss/beleg', result: 'Das Ergebnis' })
    );
    expect(d.uebergebe).toHaveBeenCalledWith({ runId: 7 });
    expect(d.store.finishRun).not.toHaveBeenCalled();
  });

  it('ohne Route verhaelt sich der Lauf wie bisher', async () => {
    const d = deps({ ...basis });
    await runFlow(lauf, d);
    expect(d.uebergebe).not.toHaveBeenCalled();
    expect(d.store.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fertig', result: 'Das Ergebnis' })
    );
  });

  it('uebergibt nicht, wenn der Lauf scheiterte', async () => {
    const d = deps({ ...basis, abschluss: { route: '/abschluss/beleg' } });
    d.runLoop = jest.fn(async () => ({ error: 'kaputt' }));
    await runFlow(lauf, d);
    expect(d.uebergebe).not.toHaveBeenCalled();
    expect(d.store.finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'fehler' }));
  });
});
