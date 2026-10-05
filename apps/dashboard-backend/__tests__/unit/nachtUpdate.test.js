/**
 * Aktualisierung nachts auf Wunsch (M5, update-nachts): wann ein Lauf entsteht,
 * wann nicht, und was aus dem Stand des Geräts als Ergebnis wird.
 *
 * Die Datenbank ist hier eine Attrappe; die SQL selbst ist am 04.10.2026 gegen
 * echtes Postgres (PGlite, mit der echten Migration 208) geprüft und steht in
 * der Abnahme `scripts/test/update-nachts-abnahme.sh` am Gerät noch einmal.
 * Das echte Einspielen und der Rückfall laufen im Skript am Host
 * (`fassung-einspielen.sh`) und sind in `fassungsdienst.test.js` gehalten; hier
 * steht, dass die Nacht den Weg nimmt und sein Ergebnis richtig liest.
 */
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockFassung = {
  vorpruefung: jest.fn(),
  spieleEin: jest.fn(),
  stand: jest.fn(),
};
jest.mock('../../src/services/betrieb/fassungsdienst', () => ({
  vorpruefung: (...a) => mockFassung.vorpruefung(...a),
  spieleEin: (...a) => mockFassung.spieleEin(...a),
  stand: (...a) => mockFassung.stand(...a),
}));
const mockSicherung = { status: jest.fn() };
jest.mock('../../src/services/betrieb/sicherungsdienst', () => ({
  status: (...a) => mockSicherung.status(...a),
}));

const { ConflictError, ServiceUnavailableError } = require('../../src/utils/errors');
const nacht = require('../../src/services/betrieb/nachtUpdate');

const MIN = 60 * 1000;
// Montag, 5. Oktober 2026, 03:10 Uhr in Berlin (MESZ, UTC+2)
const IM_FENSTER = Date.parse('2026-10-05T01:10:00Z');

/** Eine Datenbank, die das Protokoll wirklich festhält (eindeutiges Fenster). */
function datenbank({ an = true, offen = [] } = {}) {
  const zeilen = offen.map((z, i) => ({ id: 100 + i, ergebnis: 'laeuft', ...z }));
  const fenster = new Set();
  return {
    zeilen,
    query: jest.fn(async (sql, params) => {
      if (/SELECT update_nachts/.test(sql)) {
        return { rows: [{ update_nachts: an }] };
      }
      if (/WHERE ergebnis = 'laeuft'/.test(sql)) {
        return { rows: zeilen.filter(z => z.ergebnis === 'laeuft') };
      }
      if (/INSERT INTO public\.update_nacht_laeufe \(fenster, ergebnis\)/.test(sql)) {
        if (fenster.has(params[0])) {
          return { rows: [] };
        }
        fenster.add(params[0]);
        const zeile = { id: zeilen.length + 1, ergebnis: 'laeuft', fenster: params[0] };
        zeilen.push(zeile);
        return { rows: [{ id: zeile.id }] };
      }
      if (/SET ergebnis = \$2/.test(sql)) {
        const z = zeilen.find(x => x.id === params[0]);
        Object.assign(z, { ergebnis: params[1], grund: params[2] });
        if (params[3]) z.nach = params[3];
        return { rows: [] };
      }
      if (/SET lauf = \$2/.test(sql)) {
        const z = zeilen.find(x => x.id === params[0]);
        Object.assign(z, { lauf: params[1], von: params[2], nach: params[3] });
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFassung.vorpruefung.mockResolvedValue({ aktuell: '0.8.14', ziel: '0.8.15' });
  mockFassung.spieleEin.mockResolvedValue({ lauf: 'l1', von: '0.8.14', nach: '0.8.15' });
  mockFassung.stand.mockResolvedValue({ lauf: null });
  mockSicherung.status.mockResolvedValue({
    laeuftGerade: null,
    letzteSicherung: { status: 'completed' },
  });
});

describe('das Fenster', () => {
  it('liegt von 02:00 bis 04:00 Uhr in der Zeit des Geräts', () => {
    expect(nacht.fensterVon(Date.parse('2026-10-05T00:00:00Z'))).toBe('2026-10-05'); // 02:00
    expect(nacht.fensterVon(Date.parse('2026-10-05T01:59:00Z'))).toBe('2026-10-05'); // 03:59
    expect(nacht.fensterVon(Date.parse('2026-10-05T02:00:00Z'))).toBeNull(); // 04:00
    expect(nacht.fensterVon(Date.parse('2026-10-04T23:59:00Z'))).toBeNull(); // 01:59
  });

  it('gilt im Winter ebenso: 02:00 Uhr ist dort 01:00 UTC', () => {
    expect(nacht.fensterVon(Date.parse('2026-12-01T01:00:00Z'))).toBe('2026-12-01');
    expect(nacht.fensterVon(Date.parse('2026-12-01T00:00:00Z'))).toBeNull();
  });

  it('das nächste Fenster ist das, das am nächsten Tag beginnt', () => {
    const n = nacht.naechstesFenster(Date.parse('2026-10-05T10:00:00Z'));
    expect(new Date(n.beginn).toISOString()).toBe('2026-10-06T00:00:00.000Z');
    expect(new Date(n.ende).toISOString()).toBe('2026-10-06T02:00:00.000Z');
  });

  it('mitten im Fenster ist es das laufende', () => {
    const n = nacht.naechstesFenster(IM_FENSTER);
    expect(new Date(n.beginn).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(n.beginn).toBeLessThanOrEqual(IM_FENSTER);
  });

  it('findet es auch über die Umstellung auf Winterzeit (25.10.2026)', () => {
    const n = nacht.naechstesFenster(Date.parse('2026-10-24T12:00:00Z'));
    // Nacht auf den 25.: 02:00 MESZ = 00:00 UTC; die Stunde 02:00 wird wiederholt
    expect(new Date(n.beginn).toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(n.ende).toBeGreaterThan(n.beginn);
  });
});

describe('die Beschreibung des Fensters (nächster Beginn)', () => {
  const beschreibe = iso => nacht.fensterBeschreibung(Date.parse(iso));

  it('vor dem Fenster (01:00 Berlin): heute 02:00, läuft nicht', () => {
    const b = beschreibe('2026-10-04T23:00:00Z');
    expect(b.beginn).toBe('2026-10-05T00:00:00.000Z');
    expect(b.laeuftGerade).toBe(false);
    expect(b.laufendBis).toBeNull();
  });

  it('im Fenster (03:10 Berlin): läuft gerade, der Beginn ist der der folgenden Nacht', () => {
    const b = beschreibe('2026-10-05T01:10:00Z');
    expect(b.laeuftGerade).toBe(true);
    expect(b.laufendBis).toBe('2026-10-05T02:00:00.000Z');
    expect(b.beginn).toBe('2026-10-06T00:00:00.000Z');
    expect(b.ende).toBe('2026-10-06T02:00:00.000Z');
    expect(Date.parse(b.beginn)).toBeGreaterThan(IM_FENSTER);
  });

  it('am ersten und am letzten Augenblick des Fensters', () => {
    const erster = beschreibe('2026-10-05T00:00:00Z'); // 02:00
    expect(erster.laeuftGerade).toBe(true);
    expect(erster.beginn).toBe('2026-10-06T00:00:00.000Z');
    const danach = beschreibe('2026-10-05T02:00:00Z'); // 04:00
    expect(danach.laeuftGerade).toBe(false);
    expect(danach.laufendBis).toBeNull();
    expect(danach.beginn).toBe('2026-10-06T00:00:00.000Z');
  });

  it('nach dem Fenster (nachmittags): die folgende Nacht', () => {
    const b = beschreibe('2026-10-05T14:00:00Z');
    expect(b.laeuftGerade).toBe(false);
    expect(b.beginn).toBe('2026-10-06T00:00:00.000Z');
  });

  it('an der Zeitumstellung auf Winterzeit (25.10.2026): nie in der Vergangenheit', () => {
    // Im Fenster der Umstellungsnacht (02:30 MESZ = 00:30 UTC)
    const im = Date.parse('2026-10-25T00:30:00Z');
    const b = nacht.fensterBeschreibung(im);
    expect(b.laeuftGerade).toBe(true);
    expect(Date.parse(b.beginn)).toBeGreaterThan(im);
    expect(Date.parse(b.laufendBis)).toBeGreaterThan(im);
    expect(b.beginn).toBe('2026-10-26T01:00:00.000Z'); // 02:00 MEZ
  });

  it('an der Zeitumstellung auf Sommerzeit (29.03.2026): nie in der Vergangenheit', () => {
    // 03:30 MESZ nach dem Sprung von 02:00 auf 03:00 (01:30 UTC)
    const im = Date.parse('2026-03-29T01:30:00Z');
    const b = nacht.fensterBeschreibung(im);
    expect(Date.parse(b.beginn)).toBeGreaterThan(im);
    const vor = nacht.fensterBeschreibung(Date.parse('2026-03-28T12:00:00Z'));
    expect(Date.parse(vor.beginn)).toBeGreaterThan(Date.parse('2026-03-28T12:00:00Z'));
  });
});

describe('takt', () => {
  it('tut bei ausgeschaltetem Schalter nichts, auch im Fenster', async () => {
    const db = datenbank({ an: false });
    expect(await nacht.takt({ jetzt: IM_FENSTER, datenbank: db })).toBeNull();
    expect(mockFassung.spieleEin).not.toHaveBeenCalled();
    expect(db.zeilen).toHaveLength(0);
  });

  it('tut außerhalb des Fensters nichts', async () => {
    const db = datenbank();
    expect(
      await nacht.takt({ jetzt: Date.parse('2026-10-05T10:00:00Z'), datenbank: db })
    ).toBeNull();
    expect(mockFassung.spieleEin).not.toHaveBeenCalled();
  });

  it('spielt im Fenster einmal ein, auch bei einem zweiten Takt', async () => {
    const db = datenbank();
    expect(await nacht.takt({ jetzt: IM_FENSTER, datenbank: db })).toBe('laeuft');
    expect(await nacht.takt({ jetzt: IM_FENSTER + MIN, datenbank: db })).toBeNull();
    expect(mockFassung.spieleEin).toHaveBeenCalledTimes(1);
    expect(mockFassung.spieleEin).toHaveBeenCalledWith({ fassung: '0.8.15', durch: 'nachts' });
    expect(db.zeilen[0]).toMatchObject({ lauf: 'l1', von: '0.8.14', nach: '0.8.15' });
  });

  it('ist die Fassung nicht neuer, ist nichts zu tun, und nichts wird eingespielt', async () => {
    mockFassung.vorpruefung.mockRejectedValue(
      new ConflictError('Das Gerät trägt schon 0.8.14.', { keinBedarf: true })
    );
    const db = datenbank();
    expect(await nacht.takt({ jetzt: IM_FENSTER, datenbank: db })).toBe('nichts_zu_tun');
    expect(mockFassung.spieleEin).not.toHaveBeenCalled();
  });

  it('überspringt mit Grund, wenn die Vorprüfung scheitert', async () => {
    mockFassung.vorpruefung.mockRejectedValue(
      new ServiceUnavailableError('Auf dem Gerät sind nur 3,0 GB frei.')
    );
    const db = datenbank();
    expect(await nacht.takt({ jetzt: IM_FENSTER, datenbank: db })).toBe('uebersprungen');
    expect(db.zeilen[0]).toMatchObject({
      ergebnis: 'uebersprungen',
      grund: 'Auf dem Gerät sind nur 3,0 GB frei.',
    });
    expect(mockFassung.spieleEin).not.toHaveBeenCalled();
  });

  it('überspringt, wenn das Einspielen gar nicht erst anläuft (Sicherung scheitert vorher beim Start)', async () => {
    mockFassung.spieleEin.mockRejectedValue(
      new ConflictError('Es läuft schon eine Aktualisierung.')
    );
    const db = datenbank();
    expect(await nacht.takt({ jetzt: IM_FENSTER, datenbank: db })).toBe('uebersprungen');
  });
});

describe('Ergebnis aus dem Stand des Geräts', () => {
  const lauf = (status, extra = {}) => ({
    lauf: 'l1',
    status,
    von: '0.8.14',
    nach: '0.8.15',
    ...extra,
  });

  it('läuft noch: noch kein Ergebnis', () => {
    expect(nacht.ergebnisAusLauf(lauf('laeuft'))).toBeNull();
  });

  it('fertig: eingespielt', () => {
    expect(nacht.ergebnisAusLauf(lauf('fertig')).ergebnis).toBe('eingespielt');
  });

  it('zurückgerollt: zurückgefallen, mit dem Satz des Geräts', () => {
    const r = nacht.ergebnisAusLauf(
      lauf('zurueckgerollt', { meldung: 'Läuft wieder mit 0.8.14.' })
    );
    expect(r).toMatchObject({ ergebnis: 'zurueckgefallen', grund: 'Läuft wieder mit 0.8.14.' });
  });

  it('scheitert die Sicherung vorher, ist es übersprungen: es wurde nichts verändert', () => {
    const r = nacht.ergebnisAusLauf(
      lauf('fehlgeschlagen', { schritt: 'sichern', meldung: 'Die Sicherung ist fehlgeschlagen.' })
    );
    expect(r.ergebnis).toBe('uebersprungen');
  });

  it('scheitert es nach der Übergabe oder der Weg zurück, ist es fehlgeschlagen', () => {
    expect(nacht.ergebnisAusLauf(lauf('fehlgeschlagen', { schritt: 'auspacken' })).ergebnis).toBe(
      'fehlgeschlagen'
    );
    expect(nacht.ergebnisAusLauf(lauf('rueckweg_fehlgeschlagen')).ergebnis).toBe('fehlgeschlagen');
    expect(nacht.ergebnisAusLauf(lauf('abgebrochen')).ergebnis).toBe('fehlgeschlagen');
  });

  it('schließt eine offene Nacht ab, sobald das neue Backend den Stand liest', async () => {
    const db = datenbank({
      offen: [{ lauf: 'l1', gestartet: new Date(IM_FENSTER).toISOString() }],
    });
    mockFassung.stand.mockResolvedValue({ lauf: lauf('fertig') });
    await nacht.schliesseOffeneAb({ jetzt: IM_FENSTER + 20 * MIN, datenbank: db });
    expect(db.zeilen[0].ergebnis).toBe('eingespielt');
  });

  it('lässt eine Nacht offen, solange der Lauf läuft', async () => {
    const db = datenbank({
      offen: [{ lauf: 'l1', gestartet: new Date(IM_FENSTER).toISOString() }],
    });
    mockFassung.stand.mockResolvedValue({ lauf: lauf('laeuft') });
    await nacht.schliesseOffeneAb({ jetzt: IM_FENSTER + 20 * MIN, datenbank: db });
    expect(db.zeilen[0].ergebnis).toBe('laeuft');
  });

  it('nach drei Stunden ohne Ergebnis gilt die Nacht als fehlgeschlagen', async () => {
    const db = datenbank({
      offen: [{ lauf: 'l1', gestartet: new Date(IM_FENSTER).toISOString() }],
    });
    mockFassung.stand.mockResolvedValue({ lauf: null });
    await nacht.schliesseOffeneAb({ jetzt: IM_FENSTER + 4 * 60 * MIN, datenbank: db });
    expect(db.zeilen[0].ergebnis).toBe('fehlgeschlagen');
  });
});

describe('trockenlauf', () => {
  const eintragen = () => {
    const db = { query: jest.fn(async () => ({ rows: [{ trocken: true }] })) };
    return db;
  };

  it('prüft und berichtet, spielt nichts ein', async () => {
    const db = eintragen();
    await nacht.trockenlauf({ datenbank: db });
    expect(mockFassung.spieleEin).not.toHaveBeenCalled();
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO public\.update_nacht_laeufe/);
    expect(params[0]).toBe('trockenlauf');
    expect(params[1]).toMatch(/Es wurde nichts verändert/);
  });

  it('meldet, wenn die letzte Sicherung nicht gelang: dann wäre vorher keine sicher', async () => {
    mockSicherung.status.mockResolvedValue({
      laeuftGerade: null,
      letzteSicherung: { status: 'failed' },
    });
    const db = eintragen();
    await nacht.trockenlauf({ datenbank: db });
    expect(db.query.mock.calls[0][1][0]).toBe('uebersprungen');
  });
});
