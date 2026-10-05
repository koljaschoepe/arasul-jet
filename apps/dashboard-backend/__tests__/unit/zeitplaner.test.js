/**
 * Der Zeitplaner des Geraets (M5): welche Regel greift wann.
 *
 * Die Datenbank ist hier eine Attrappe; die SQL selbst ist am 04.10.2026
 * gegen echtes Postgres (PGlite, mit der echten Migration 203) geprueft und
 * steht in der Abnahme `scripts/test/zeitplaner-abnahme.sh` am Geraet noch
 * einmal -- eine Attrappe haette den falschen Spaltennamen vom selben Tag
 * nicht gefunden.
 */
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const zeitplaner = require('../../src/services/flows/zeitplaner');

const MIN = 60 * 1000;
const FLOW = { appId: 'urlaub', flowName: 'bericht', pausiert: false, aktiv: true };

/** Eine Datenbank, die Termine wirklich festhaelt (Primaerschluessel). */
function datenbank({ letzter = null, offen = null } = {}) {
  const termine = new Map();
  const aufrufe = [];
  return {
    termine,
    aufrufe,
    query: jest.fn(async (sql, params) => {
      aufrufe.push(sql);
      if (/SELECT MAX\(termin\)/.test(sql)) {
        return { rows: [{ letzter }] };
      }
      if (/FROM flow_runs/.test(sql)) {
        return { rows: offen ? [{ id: String(offen) }] : [] };
      }
      if (/INSERT INTO public\.flow_zeitplan_termine/.test(sql)) {
        const schluessel = `${params[0]}|${params[1]}|${params[2].toISOString()}`;
        if (termine.has(schluessel)) {
          return { rowCount: 0, rows: [] };
        }
        termine.set(schluessel, { ergebnis: params[3], grund: params[4] });
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    }),
  };
}

const T = Date.parse('2026-10-05T04:00:00Z'); // Montag 06:00 Berlin

describe('bearbeite', () => {
  it('startet einen puenktlichen Termin einmal und traegt ihn ein', async () => {
    const db = datenbank();
    const start = jest.fn().mockResolvedValue(7);
    expect(await zeitplaner.bearbeite(FLOW, [T], T + 10 * 1000, { datenbank: db, start })).toBe(
      'gestartet'
    );
    expect(start).toHaveBeenCalledTimes(1);
    expect([...db.termine.values()][0].ergebnis).toBe('gestartet');
  });

  it('einen Termin, den schon jemand angelegt hat, startet es nicht noch einmal', async () => {
    const db = datenbank();
    const start = jest.fn().mockResolvedValue(7);
    await zeitplaner.bearbeite(FLOW, [T], T + 10 * 1000, { datenbank: db, start });
    expect(await zeitplaner.bearbeite(FLOW, [T], T + 20 * 1000, { datenbank: db, start })).toBe(
      null
    );
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('holt einen Termin nach, der bis zu einer Stunde zurueckliegt', async () => {
    const db = datenbank();
    const start = jest.fn().mockResolvedValue(7);
    expect(await zeitplaner.bearbeite(FLOW, [T], T + 40 * MIN, { datenbank: db, start })).toBe(
      'nachgeholt'
    );
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('uebersprungen wird, was laenger als eine Stunde zurueckliegt, mit Grund', async () => {
    const db = datenbank();
    const start = jest.fn();
    expect(await zeitplaner.bearbeite(FLOW, [T], T + 90 * MIN, { datenbank: db, start })).toBe(
      'uebersprungen'
    );
    expect(start).not.toHaveBeenCalled();
    const [eintrag] = [...db.termine.values()];
    expect(eintrag.ergebnis).toBe('uebersprungen');
    expect(eintrag.grund).toMatch(/Montag, 5\. Oktober, 06:00 Uhr/);
    expect(eintrag.grund).toMatch(/nicht mehr nachgeholt/);
  });

  it('von mehreren verpassten Terminen zaehlt nur der juengste, die anderen stehen als uebersprungen', async () => {
    const db = datenbank();
    const start = jest.fn().mockResolvedValue(7);
    const termine = [T, T + 10 * MIN, T + 20 * MIN];
    expect(await zeitplaner.bearbeite(FLOW, termine, T + 30 * MIN, { datenbank: db, start })).toBe(
      'nachgeholt'
    );
    expect(start).toHaveBeenCalledTimes(1);
    const ergebnisse = [...db.termine.values()].map(e => e.ergebnis).sort();
    expect(ergebnisse).toEqual(['nachgeholt', 'uebersprungen']);
    expect([...db.termine.values()].find(e => e.grund).grund).toMatch(/2 Termine/);
  });

  it('startet keinen zweiten Lauf, solange einer laeuft oder wartet', async () => {
    const db = datenbank({ offen: 41 });
    const start = jest.fn();
    expect(await zeitplaner.bearbeite(FLOW, [T], T + 5 * 1000, { datenbank: db, start })).toBe(
      'uebersprungen'
    );
    expect(start).not.toHaveBeenCalled();
    expect([...db.termine.values()][0].grund).toMatch(/Lauf Nr\. 41/);
  });

  it('pausiert oder ausgeschaltet: nichts, und es steht auch nichts in der Tabelle', async () => {
    for (const aus of [{ pausiert: true }, { aktiv: false }]) {
      const db = datenbank();
      const start = jest.fn();
      expect(
        await zeitplaner.bearbeite({ ...FLOW, ...aus }, [T], T + 5000, { datenbank: db, start })
      ).toBe(null);
      expect(start).not.toHaveBeenCalled();
      expect(db.termine.size).toBe(0);
    }
  });

  it('nur Termine nach dem letzten eingetragenen: ein Neustart holt nichts doppelt nach', async () => {
    const db = datenbank({ letzter: new Date(T + 10 * MIN) });
    const start = jest.fn().mockResolvedValue(7);
    expect(
      await zeitplaner.bearbeite(FLOW, [T, T + 10 * MIN], T + 11 * MIN, { datenbank: db, start })
    ).toBe(null);
    expect(start).not.toHaveBeenCalled();
  });

  it('startet der Lauf nicht, steht der Termin als uebersprungen mit dem Grund', async () => {
    const db = datenbank();
    const start = jest.fn().mockRejectedValue(new Error('Pflichtargument "woche" fehlt'));
    expect(await zeitplaner.bearbeite(FLOW, [T], T + 5000, { datenbank: db, start })).toBe(
      'uebersprungen'
    );
    const update = db.query.mock.calls.find(([sql]) => /SET ergebnis = 'uebersprungen'/.test(sql));
    expect(update[1][3]).toMatch(/Pflichtargument "woche" fehlt/);
  });
});

describe('startLauf', () => {
  it('startet im Livestand, ohne Argumente, ohne Einreicher, mit Ausloeser zeitplan', async () => {
    const starten = jest.fn().mockResolvedValue({ runId: 12 });
    const argumente = jest.fn();
    const ladeFlow = jest.fn().mockResolvedValue({ argumente: [] });
    const runId = await zeitplaner.startLauf(FLOW, {
      ladeFlow,
      argumente,
      starten,
      wem: async () => 5,
    });
    expect(runId).toBe(12);
    expect(ladeFlow).toHaveBeenCalledWith({ appId: 'urlaub', stand: 'live', name: 'bericht' });
    expect(argumente).toHaveBeenCalledWith([], {});
    expect(starten).toHaveBeenCalledWith({
      flowName: 'bericht',
      args: {},
      userId: 5,
      appId: 'urlaub',
      stand: 'live',
      einreicherId: null,
      freigabeRegel: null,
      ausloeser: 'zeitplan',
    });
  });

  it('ohne Konto, dem der Lauf gehoeren koennte, startet nichts', async () => {
    const starten = jest.fn();
    await expect(
      zeitplaner.startLauf(FLOW, {
        ladeFlow: jest.fn(),
        argumente: jest.fn(),
        starten,
        wem: async () => null,
      })
    ).rejects.toThrow(/kein aktives Admin-Konto/);
    expect(starten).not.toHaveBeenCalled();
  });
});

describe('takt', () => {
  it('der allererste Takt legt nur den Anfang fest', async () => {
    const aufrufe = [];
    const db = {
      query: jest.fn(async sql => {
        aufrufe.push(sql);
        return { rows: [], rowCount: 0 };
      }),
    };
    expect(await zeitplaner.takt(T + 5000, { datenbank: db })).toEqual([]);
    expect(aufrufe.some(s => /INSERT INTO public\.flow_zeitplaner/.test(s))).toBe(true);
    expect(aufrufe.some(s => /FROM public\.app_flows/.test(s))).toBe(false);
  });

  // Befund 4 der zweiten Pruefung (05.10.2026): die Marke rueckte vor, auch
  // wenn ein Flow geworfen hatte, bevor sein Termin eingetragen war. Der
  // Termin war verloren, ohne Zeile, ohne Grund.
  it('scheitert ein Flow vor dem Eintrag, rueckt geprueft_bis nicht vor', async () => {
    const aufrufe = [];
    let marke = new Date(T - MIN);
    const db = {
      query: jest.fn(async (sql, params) => {
        aufrufe.push(sql);
        if (/SELECT geprueft_bis/.test(sql)) {
          return { rows: [{ geprueft_bis: marke }] };
        }
        if (/FROM public\.app_flows/.test(sql)) {
          return {
            rows: [
              {
                app_id: 'urlaub',
                name: 'bericht',
                ausloeser: [{ typ: 'zeitplan', zeitplan: '0 6 * * 1-5' }],
                pausiert: false,
                aktiv: true,
              },
            ],
          };
        }
        if (/SELECT MAX\(termin\)/.test(sql)) {
          throw new Error('Verbindung weg');
        }
        if (/UPDATE public\.flow_zeitplaner SET geprueft_bis/.test(sql)) {
          marke = params[0];
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    expect(await zeitplaner.takt(T + 10 * 1000, { datenbank: db })).toEqual([]);
    expect(aufrufe.some(s => /UPDATE public\.flow_zeitplaner SET geprueft_bis/.test(s))).toBe(
      false
    );
    expect(marke.getTime()).toBe(T - MIN);
  });

  it('zwei Takte in derselben Minute tun nichts', async () => {
    const db = { query: jest.fn(async () => ({ rows: [{ geprueft_bis: new Date(T) }] })) };
    expect(await zeitplaner.takt(T + 20 * 1000, { datenbank: db })).toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('angabe', () => {
  const definition = { ausloeser: [{ typ: 'hand' }, { typ: 'zeitplan', zeitplan: '0 6 * * 1-5' }] };
  const jetzt = Date.parse('2026-10-04T12:00:00Z'); // Sonntag

  it('ein Flow ohne Zeitplan hat keine Angabe', () => {
    expect(zeitplaner.angabe({ definition: { ausloeser: [{ typ: 'hand' }] }, stand: 'live' })).toBe(
      null
    );
    expect(zeitplaner.angabe({ definition: {}, stand: 'live' })).toBe(null);
  });

  it('nennt im Livestand den naechsten Termin und die Zone', () => {
    const a = zeitplaner.angabe({ definition, stand: 'live', einstellung: null, jetzt });
    expect(a).toMatchObject({
      ausdruecke: ['0 6 * * 1-5'],
      pausiert: false,
      laeuft_nicht: null,
      naechster_termin: '2026-10-05T04:00:00.000Z',
      letzter_termin: null,
    });
    expect(a.zeitzone).toBeTruthy();
  });

  it('pausiert, ausgeschaltet oder im Teststand: kein naechster Termin, mit Grund', () => {
    const grund = (stand, einstellung) =>
      zeitplaner.angabe({ definition, stand, einstellung, jetzt }).laeuft_nicht;
    expect(grund('live', { zeitplan_pausiert: true })).toBe('pausiert');
    expect(grund('live', { aktiv: false })).toBe('ausgeschaltet');
    expect(grund('test', null)).toBe('teststand');
    expect(
      zeitplaner.angabe({
        definition,
        stand: 'live',
        einstellung: { zeitplan_pausiert: true },
        jetzt,
      }).naechster_termin
    ).toBeNull();
  });

  it('reicht den letzten Termin mit Grund durch', () => {
    const a = zeitplaner.angabe({
      definition,
      stand: 'live',
      letzter: {
        termin: '2026-10-02T04:00:00+00:00',
        ergebnis: 'uebersprungen',
        grund: 'Verpasst',
        run_id: null,
      },
      jetzt,
    });
    expect(a.letzter_termin).toEqual({
      termin: '2026-10-02T04:00:00.000Z',
      ergebnis: 'uebersprungen',
      grund: 'Verpasst',
      run_id: null,
    });
  });
});
