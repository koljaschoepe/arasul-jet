/**
 * Die Ueberschreibung des Administrators (Phase C6).
 *
 * Der eine Satz, den diese Tabelle traegt: sie ueberlebt ein App-Update, WEIL
 * sie nicht in der Flow-Datei steht. Gemessen wird hier der zweite Teil davon
 * -- dass „nichts gesetzt" auch wirklich keine Zeile ist und nicht eine Zeile
 * mit einem leeren Feld. Zwei Schreibweisen fuer dieselbe Aussage sind eine
 * Stelle, an der ein Vergleich eines Tages danebengreift.
 */
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const flowSettings = require('../../src/services/flows/flowSettings');

beforeEach(() => db.query.mockReset());

describe('setzeModell', () => {
  it('legt die Ueberschreibung an und merkt sich, wer sie gesetzt hat', async () => {
    db.query.mockResolvedValue({ rows: [{ app_id: 'urlaub', flow_name: 'bericht', modell: 'm' }] });
    const zeile = await flowSettings.setzeModell({
      appId: 'urlaub',
      flowName: 'bericht',
      modell: 'm',
      durch: 7,
    });
    expect(zeile.modell).toBe('m');
    expect(db.query.mock.calls[0][0]).toMatch(/INSERT INTO public\.flow_settings/);
    expect(db.query.mock.calls[0][0]).toMatch(/ON CONFLICT \(app_id, flow_name\) DO UPDATE/);
    expect(db.query.mock.calls[0][1]).toEqual(['urlaub', 'bericht', 'm', 7]);
  });

  it('LOESCHT die Zeile bei `null`, statt sie leer stehen zu lassen', async () => {
    db.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const zeile = await flowSettings.setzeModell({
      appId: 'urlaub',
      flowName: 'bericht',
      modell: null,
    });
    expect(zeile).toBeNull();
    expect(db.query.mock.calls[0][0]).toMatch(/DELETE FROM public\.flow_settings/);
  });

  it('behandelt den leeren Text wie `null`', async () => {
    // Eine Oberflaeche, die ein Feld leert, schickt "" und nicht null. Beides
    // meint dasselbe, und dieselbe Aussage soll dieselbe Zeile ergeben.
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await flowSettings.setzeModell({ appId: 'urlaub', flowName: 'bericht', modell: '' });
    expect(db.query.mock.calls[0][0]).toMatch(/DELETE FROM public\.flow_settings/);
  });

  it('schreibt ohne `stand` -- die Entscheidung gilt dem Flow, nicht der Fassung', async () => {
    db.query.mockResolvedValue({ rows: [{}] });
    await flowSettings.setzeModell({ appId: 'urlaub', flowName: 'bericht', modell: 'm' });
    expect(db.query.mock.calls[0][0]).not.toMatch(/\bstand\b/);
  });
});

describe('listeFuer', () => {
  it('gibt eine Map, damit eine Liste nicht je Flow einmal fragt', async () => {
    db.query.mockResolvedValue({
      rows: [
        { flow_name: 'a', modell: 'm1' },
        { flow_name: 'b', modell: null },
      ],
    });
    const map = await flowSettings.listeFuer('urlaub');
    expect(map.get('a').modell).toBe('m1');
    expect(map.get('b').modell).toBeNull();
    expect(map.get('gibtsnicht')).toBeUndefined();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
