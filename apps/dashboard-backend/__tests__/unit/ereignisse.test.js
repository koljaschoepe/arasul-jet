/**
 * Ein Ereignis der App startet Flows (M5, Kontrakt 13).
 *
 * Die Datenbank ist hier eine Attrappe; die Abfrage selbst ist am 04.10.2026
 * gegen echtes Postgres (PGlite, mit der echten Migration 204) geprueft und
 * steht in `scripts/test/ereignis-und-routen-abnahme.sh` am Geraet noch einmal.
 */
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const ereignisse = require('../../src/services/flows/ereignisse');
const { resolveArguments } = require('../../src/services/flows/runFlow');
const { FlowInaktivError } = require('../../src/utils/errors');
const { EreignisParams, ExternalEreignisBody } = require('../../src/schemas/externalApi');

function datenbank(flows) {
  return { query: jest.fn(async () => ({ rows: flows })) };
}

const BELEG = {
  name: 'bei-eingang',
  definition: {
    argumente: [
      { name: 'nummer', typ: 'freitext', pflicht: true },
      { name: 'art', typ: 'auswahl', optionen: ['rechnung', 'quittung'] },
    ],
    ausloeser: [{ typ: 'ereignis', ereignis: 'beleg.eingegangen' }],
  },
};

describe('ereignisse.melde', () => {
  it('startet jeden hoerenden Flow mit den Daten als Argumenten und dem Ausloeser ereignis', async () => {
    const db = datenbank([BELEG, { name: 'zweiter', definition: { argumente: [] } }]);
    let n = 10;
    const starten = jest.fn(async () => ({ runId: ++n }));
    const ergebnis = await ereignisse.melde(
      {
        appId: 'belege',
        stand: 'live',
        name: 'beleg.eingegangen',
        daten: { nummer: 'R-17', art: 'quittung', fremd: 'faellt weg' },
        userId: 3,
        einreicherId: 7,
      },
      { datenbank: db, starten, argumente: resolveArguments }
    );
    expect(ergebnis.laeufe).toEqual([
      { flow: 'bei-eingang', run_id: 11 },
      { flow: 'zweiter', run_id: 12 },
    ]);
    expect(ergebnis.nicht_gestartet).toEqual([]);
    expect(starten).toHaveBeenNthCalledWith(1, {
      flowName: 'bei-eingang',
      args: { nummer: 'R-17', art: 'quittung' },
      userId: 3,
      appId: 'belege',
      stand: 'live',
      einreicherId: 7,
      freigabeRegel: null,
      ausloeser: 'ereignis',
      ereignis: 'beleg.eingegangen',
      titel: null,
    });
    // Gesucht wird in App UND Stand des Schluessels, mit genau diesem Namen.
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/f\.app_id = \$1 AND f\.stand = \$2/);
    expect(params).toEqual([
      'belege',
      'live',
      JSON.stringify([{ typ: 'ereignis', ereignis: 'beleg.eingegangen' }]),
    ]);
  });

  it('startet einen Flow ohne Pflichtargument nicht, die anderen schon', async () => {
    const db = datenbank([BELEG, { name: 'ohne', definition: {} }]);
    const starten = jest.fn(async () => ({ runId: 5 }));
    const ergebnis = await ereignisse.melde(
      { appId: 'belege', stand: 'test', name: 'beleg.eingegangen', daten: {}, userId: 1 },
      { datenbank: db, starten, argumente: resolveArguments }
    );
    expect(ergebnis.laeufe).toEqual([{ flow: 'ohne', run_id: 5 }]);
    expect(ergebnis.nicht_gestartet).toEqual([
      { flow: 'bei-eingang', grund: 'Pflicht-Argument "nummer" fehlt' },
    ]);
  });

  it('nennt einen ausgeschalteten Flow mit Grund', async () => {
    const starten = jest.fn(async () => {
      throw new FlowInaktivError('Der Flow "bei-eingang" ist ausgeschaltet.');
    });
    const ergebnis = await ereignisse.melde(
      { appId: 'belege', stand: 'live', name: 'x', daten: { nummer: '1' }, userId: 1 },
      { datenbank: datenbank([BELEG]), starten, argumente: resolveArguments }
    );
    expect(ergebnis.laeufe).toEqual([]);
    expect(ergebnis.nicht_gestartet[0].grund).toMatch(/ausgeschaltet/);
  });

  // Befund 17 der zweiten Pruefung (05.10.2026): ein unerwarteter Fehler ging
  // mit seinem Text (hier Adresse und Nutzer der Datenbank) an die App.
  it('gibt einen unerwarteten Fehler nicht im Wortlaut an die App', async () => {
    const starten = jest.fn(async () => {
      throw new Error('connect ECONNREFUSED 172.30.0.5:5432 user=arasul');
    });
    const ergebnis = await ereignisse.melde(
      { appId: 'belege', stand: 'live', name: 'x', daten: { nummer: '1' }, userId: 1 },
      { datenbank: datenbank([BELEG]), starten, argumente: resolveArguments }
    );
    expect(ergebnis.nicht_gestartet[0].grund).not.toMatch(/ECONNREFUSED|172\.30|arasul/);
    expect(ergebnis.nicht_gestartet[0].grund).toMatch(/Protokoll des Geräts/);
  });

  it('startet nichts, wenn kein Flow hoert', async () => {
    const starten = jest.fn();
    const ergebnis = await ereignisse.melde(
      { appId: 'belege', stand: 'live', name: 'niemand', userId: 1 },
      { datenbank: datenbank([]), starten }
    );
    expect(ergebnis).toEqual({ laeufe: [], nicht_gestartet: [] });
    expect(starten).not.toHaveBeenCalled();
  });

  it('weist einen Schluessel ohne App ab', async () => {
    await expect(
      ereignisse.melde(
        { appId: null, stand: null, name: 'x', userId: 1 },
        { datenbank: datenbank([]) }
      )
    ).rejects.toThrow(/eigenen Schlüssel/);
  });
});

describe('Form des Ereignisses', () => {
  it('nimmt einen Namen in der Form des Flow-Kopfes', () => {
    expect(EreignisParams.safeParse({ name: 'beleg.eingegangen' }).success).toBe(true);
    expect(EreignisParams.safeParse({ name: 'Beleg' }).success).toBe(false);
    expect(EreignisParams.safeParse({ name: '1beleg' }).success).toBe(false);
  });

  it('nimmt daten und einreicher, sonst nichts', () => {
    expect(
      ExternalEreignisBody.safeParse({ daten: { a: 'x', b: 2, c: true }, einreicher: 'mia' })
        .success
    ).toBe(true);
    expect(ExternalEreignisBody.safeParse({}).success).toBe(true);
    expect(ExternalEreignisBody.safeParse({ daten: { a: { tief: 1 } } }).success).toBe(false);
    expect(ExternalEreignisBody.safeParse({ args: {} }).success).toBe(false);
  });
});
