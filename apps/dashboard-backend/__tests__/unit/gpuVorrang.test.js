/**
 * Der Vorrang des Nutzers an der GPU (Fund vom 22.08.2026).
 *
 * Drei Zusagen, und alle drei muessen halten:
 *  1. Solange gerechnet wird, weiss der Indexer davon, und danach ist er frei.
 *  2. Ein Indexer, der nicht antwortet, bremst den Chat nicht. Das waere
 *     derselbe Fehler in der anderen Richtung.
 *  3. Die Meldung faehrt NICHT auf `axios`. Sie hat dort einmal die Attrappe
 *     der Modell-Aufrufe belegt und 21 fremde Tests verschoben.
 */

describe('GPU-Vorrang gegenueber dem Indexer', () => {
  let mitVorrang;
  let holen;

  beforeEach(() => {
    jest.resetModules();
    holen = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = holen;
    ({ mitVorrang } = require('../../src/services/flows/gpuVorrang'));
  });

  const gemeldeteSekunden = () =>
    holen.mock.calls.map(([, einstellungen]) => JSON.parse(einstellungen.body).sekunden);

  test('meldet zu Beginn belegt und am Ende frei', async () => {
    await mitVorrang(async () => 'fertig');

    const meldungen = gemeldeteSekunden();
    expect(meldungen[0]).toBeGreaterThan(0);
    expect(meldungen[meldungen.length - 1]).toBe(0);
    expect(holen.mock.calls[0][0]).toMatch(/\/gpu\/vorrang$/);
    expect(holen.mock.calls[0][1].method).toBe('POST');
  });

  test('gibt auch bei einem Fehler im Lauf wieder frei', async () => {
    await expect(
      mitVorrang(async () => {
        throw new Error('Modell weg');
      })
    ).rejects.toThrow('Modell weg');

    const meldungen = gemeldeteSekunden();
    expect(meldungen[meldungen.length - 1]).toBe(0);
  });

  test('ein nicht erreichbarer Indexer haelt den Lauf nicht auf', async () => {
    holen.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(mitVorrang(async () => 42)).resolves.toBe(42);
  });

  test('reicht den Rueckgabewert unveraendert durch', async () => {
    const wert = { a: 1 };
    expect(await mitVorrang(async () => wert)).toBe(wert);
  });

  test('benutzt axios nicht', () => {
    const axios = require('axios');
    expect(jest.isMockFunction(axios.post) && axios.post.mock.calls.length).toBeFalsy();
  });
});
