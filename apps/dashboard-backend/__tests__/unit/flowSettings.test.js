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

/**
 * Das externe Modell (Phase D4).
 *
 * Die eine Zusage, die hier gehalten wird: der Schluessel geht verschluesselt
 * hinein und kommt nur an EINER Stelle wieder heraus -- `externerZugang`, dem
 * einzigen Aufrufer, der ihn braucht.
 */
describe('setzeExtern', () => {
  const GUT = {
    appId: 'urlaub',
    flowName: 'bericht',
    anbieter: 'OpenAI',
    modell: 'gpt-4o',
    basisUrl: 'https://api.example.test/v1',
    schluessel: 'sk-geheim-abcd',
  };

  it('legt den Schluessel verschluesselt ab und merkt sich die letzten vier Zeichen', async () => {
    db.query.mockResolvedValue({ rows: [{ app_id: 'urlaub', extern_endet_auf: 'abcd' }] });
    await flowSettings.setzeExtern(GUT);

    const [, werte] = db.query.mock.calls[0];
    expect(werte).not.toContain('sk-geheim-abcd');
    expect(werte.some(w => Buffer.isBuffer(w))).toBe(true);
    expect(werte).toContain('abcd');
  });

  it('raeumt das lokale Modell: ein Flow laeuft auf EINEM Modell', async () => {
    db.query.mockResolvedValue({ rows: [{}] });
    await flowSettings.setzeExtern(GUT);
    expect(db.query.mock.calls[0][0]).toMatch(/SET modell = NULL/);
  });

  it('laesst einen hinterlegten Schluessel stehen, wenn keiner mitkommt', async () => {
    // Wer nur den Modellnamen aendert, soll ihn nicht erneut abtippen muessen
    // -- und er kann es auch nicht, er sieht ihn nirgends.
    db.query.mockResolvedValue({ rows: [{}] });
    await flowSettings.setzeExtern({ ...GUT, schluessel: null });
    const [sql, werte] = db.query.mock.calls[0];
    expect(sql).toMatch(/COALESCE\(EXCLUDED\.extern_schluessel/);
    expect(werte.some(w => Buffer.isBuffer(w))).toBe(false);
  });

  it('schneidet den Schraegstrich am Ende der Adresse weg', async () => {
    // Sonst stuende in der Anfrage `…/v1//chat/completions`, und mancher
    // Anbieter antwortet darauf mit 404.
    db.query.mockResolvedValue({ rows: [{}] });
    await flowSettings.setzeExtern({ ...GUT, basisUrl: 'https://api.example.test/v1/' });
    expect(db.query.mock.calls[0][1]).toContain('https://api.example.test/v1');
  });

  it('weist eine halbe Angabe ab, statt eine Zeile zu schreiben, die nicht laufen kann', async () => {
    await expect(flowSettings.setzeExtern({ ...GUT, basisUrl: '' })).rejects.toThrow(
      /Anbieter, Modell und Basis-Adresse/
    );
    await expect(flowSettings.setzeExtern({ ...GUT, basisUrl: 'ftp://x' })).rejects.toThrow(
      /http/
    );
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('externerZugang', () => {
  it('gibt den Schluessel entschluesselt heraus -- und nur hier', async () => {
    const { encryptToken } = require('../../src/utils/tokenCrypto');
    db.query.mockResolvedValue({
      rows: [
        {
          extern_anbieter: 'OpenAI',
          extern_modell: 'gpt-4o',
          extern_basis_url: 'https://api.example.test/v1',
          extern_schluessel: encryptToken('sk-geheim-abcd'),
        },
      ],
    });
    const zugang = await flowSettings.externerZugang({ appId: 'urlaub', flowName: 'bericht' });
    expect(zugang.schluessel).toBe('sk-geheim-abcd');
    expect(zugang.basisUrl).toBe('https://api.example.test/v1');
  });

  it('ist null, solange der Flow hier rechnet', async () => {
    db.query.mockResolvedValue({ rows: [{ extern_anbieter: null }] });
    expect(await flowSettings.externerZugang({ appId: 'u', flowName: 'b' })).toBeNull();
  });

  it('gibt einen Zugang ohne Schluessel her -- ein Gateway im Haus verlangt keinen', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          extern_anbieter: 'Hausgateway',
          extern_modell: 'lokal-gross',
          extern_basis_url: 'http://gateway.intern/v1',
          extern_schluessel: null,
        },
      ],
    });
    const zugang = await flowSettings.externerZugang({ appId: 'u', flowName: 'b' });
    expect(zugang.schluessel).toBeNull();
  });
});
