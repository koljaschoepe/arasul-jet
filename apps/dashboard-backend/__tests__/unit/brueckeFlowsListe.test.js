/**
 * `ArasulBruecke.flows.liste()` hat nie etwas aufgelistet (23.08.2026).
 *
 * `flowRegistry.listFlows()` liefert `{ flows, fehlerhaft }`, kein Array.
 * `flowsListe` behandelte den Rueckgabewert trotzdem als Array, und jeder
 * Aufruf endete mit `(flows || []).map is not a function` — auf dem Orin aus
 * einer echten App gemessen, HTTP 500.
 *
 * Kein Test hat das gesehen, weil keiner die Fassade gerufen hat: die Registry
 * war gruendlich geprueft, der Weg von der Bruecke dorthin gar nicht.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/services/flows/flowRegistry', () => ({
  listFlows: jest.fn(),
  loadFlow: jest.fn(),
}));

const flowRegistry = require('../../src/services/flows/flowRegistry');
const brueckeService = require('../../src/services/extensions/brueckeService');

describe('flowsListe', () => {
  it('liest die Flows aus der Huelle, die die Registry wirklich liefert', async () => {
    flowRegistry.listFlows.mockResolvedValue({
      flows: [{ name: 'angebot', beschreibung: 'Ein Angebot', argumente: [{ name: 'kunde' }] }],
      fehlerhaft: [],
    });
    const liste = await brueckeService.flowsListe();
    expect(liste).toEqual([
      { name: 'angebot', beschreibung: 'Ein Angebot', argumente: [{ name: 'kunde' }] },
    ]);
  });

  it('kommt mit einer leeren Wissensbasis klar', async () => {
    flowRegistry.listFlows.mockResolvedValue({ flows: [], fehlerhaft: [] });
    await expect(brueckeService.flowsListe()).resolves.toEqual([]);
  });

  it('faellt nicht ueber einen fehlenden flows-Schluessel', async () => {
    flowRegistry.listFlows.mockResolvedValue({});
    await expect(brueckeService.flowsListe()).resolves.toEqual([]);
  });
});
