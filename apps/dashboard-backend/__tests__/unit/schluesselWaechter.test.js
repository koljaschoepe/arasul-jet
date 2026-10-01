/**
 * Der Schluesselwaechter (J37): eine Meldung je Pruefung, nicht alle fuenf Minuten.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/betrieb/sicherungsdienst', () => ({
  leseSchluesselPruefung: jest.fn(),
}));

const db = require('../../src/database');
const sicherungsdienst = require('../../src/services/betrieb/sicherungsdienst');
const waechter = require('../../src/services/betrieb/schluesselWaechter');

beforeEach(() => {
  jest.clearAllMocks();
  waechter.zuruecksetzen();
});

describe('pruefe', () => {
  it('tut nichts, wenn der Schluessel passt oder nichts zu pruefen ist', async () => {
    for (const passt of [true, null]) {
      sicherungsdienst.leseSchluesselPruefung.mockResolvedValue({ zeitpunkt: 'z', passt });
      expect(await waechter.pruefe()).toBe(false);
    }
    sicherungsdienst.leseSchluesselPruefung.mockResolvedValue(null);
    expect(await waechter.pruefe()).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('legt bei passt=false genau eine kritische Meldung an, auch bei Wiederholung', async () => {
    sicherungsdienst.leseSchluesselPruefung.mockResolvedValue({
      zeitpunkt: '2026-10-02T03:00:00Z',
      passt: false,
    });
    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    expect(await waechter.pruefe()).toBe(true);
    const insert = db.query.mock.calls[1];
    expect(insert[0]).toMatch(/INSERT INTO notification_events/);
    expect(insert[0]).toMatch(/'critical'/);
    expect(insert[1][1]).toMatch(/Wiederherstellungscode/);

    db.query.mockClear();
    expect(await waechter.pruefe()).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('legt nichts an, wenn die Tabelle diese Pruefung schon kennt (Neustart)', async () => {
    sicherungsdienst.leseSchluesselPruefung.mockResolvedValue({ zeitpunkt: 'z1', passt: false });
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    expect(await waechter.pruefe()).toBe(false);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('meldet eine neue Pruefung wieder', async () => {
    db.query.mockResolvedValue({ rows: [] });
    sicherungsdienst.leseSchluesselPruefung.mockResolvedValue({ zeitpunkt: 'a', passt: false });
    expect(await waechter.pruefe()).toBe(true);
    sicherungsdienst.leseSchluesselPruefung.mockResolvedValue({ zeitpunkt: 'b', passt: false });
    expect(await waechter.pruefe()).toBe(true);
  });

  it('wirft nicht, wenn die Datenbank fehlt', async () => {
    sicherungsdienst.leseSchluesselPruefung.mockResolvedValue({ zeitpunkt: 'c', passt: false });
    db.query.mockRejectedValue(new Error('weg'));
    expect(await waechter.pruefe()).toBe(false);
  });
});
