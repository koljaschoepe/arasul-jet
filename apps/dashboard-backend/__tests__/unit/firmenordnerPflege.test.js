/**
 * Pflege der Ablage des Firmenordners (J33, 01.10.2026): Revisionen und
 * abgebrochene Uploads wachsen nicht still.
 *
 * Gemessen wird, was dieses Repo entscheidet:
 *
 *   1. Je Datei bleiben die `max` NEUESTEN Revisionen -- auch wenn Go die
 *      Nullen der Sekundenbruchteile abschneidet (`.05Z` ist AELTER als
 *      `.0508Z`, aber lexikografisch groesser).
 *   2. Entfernt wird die Revision UND ihre Sperrdatei, nur unter dem Bereich,
 *      aus dem sie stammt, und ohne Shell.
 *   3. `locks/` wird nicht als Knoten gelesen, und was nicht `.REV.` heisst,
 *      bleibt liegen.
 *   4. Die Spalte „Platz" bekommt die Revisionen getrennt, aus derselben Platte.
 *   5. Ohne Firmenordner ist alles ein stilles Nichts.
 */

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockExec = jest.fn();
jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getContainer: () => ({
      inspect: async () => ({ State: { Running: true } }),
      exec: async opts => {
        mockExec(opts.Cmd);
        return {
          start: async () => {
            const { EventEmitter } = require('events');
            const strom = new EventEmitter();
            setImmediate(() => {
              if (opts.Cmd[0] === 'opencloud') {
                const kopf = Buffer.from(
                  'Expired sessions:\n│ Space │ Upload Id │\n│ a │ b │\n│ c │ d │\n'
                );
                const vorspann = Buffer.alloc(8);
                vorspann[0] = 1;
                vorspann.writeUInt32BE(kopf.length, 4);
                strom.emit('data', Buffer.concat([vorspann, kopf]));
              }
              strom.emit('end');
            });
            return strom;
          },
          inspect: async () => ({ ExitCode: 0 }),
        };
      },
    }),
  },
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const pflege = require('../../src/services/firmenordner/ordnerPflege');

const KNOTEN = 'bc3ed22d-d8e2-4037-899f-b78d8307a236';

let wurzel;

function revision(bereich, zeit, bytes) {
  const dir = path.join(wurzel, bereich, '.oc-nodes', 'bc', '3e', 'd2', '2d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `-d8e2-4037-899f-b78d8307a236.REV.${zeit}`), 'x'.repeat(bytes));
  const locks = path.join(wurzel, bereich, '.oc-nodes', 'locks');
  fs.mkdirSync(locks, { recursive: true });
  fs.writeFileSync(path.join(locks, `${KNOTEN}.REV.${zeit}.mlock`), '');
}

beforeEach(() => {
  mockExec.mockClear();
  pflege.standVergessen();
  process.env.COMPOSE_PROFILES = 'firmenordner';
  process.env.FIRMENORDNER_INTERN = 'http://firmenordner:9200';
  process.env.FIRMENORDNER_ADMIN_PASSWORT = 'geheim';
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'pflege-'));
  pflege.orte.backend = wurzel;
});

afterEach(() => {
  fs.rmSync(wurzel, { recursive: true, force: true });
  delete process.env.COMPOSE_PROFILES;
  delete process.env.FIRMENORDNER_REVISIONEN_MAX;
});

describe('zeitSchluessel', () => {
  it('ordnet gekuerzte Sekundenbruchteile richtig', () => {
    const a = pflege.zeitSchluessel('2026-10-01T16:27:58.05Z');
    const b = pflege.zeitSchluessel('2026-10-01T16:27:58.050833061Z');
    expect(a < b).toBe(true);
    expect('2026-10-01T16:27:58.05Z' > '2026-10-01T16:27:58.050833061Z').toBe(true);
  });
});

describe('maxRevisionen', () => {
  it('nimmt zehn, wenn nichts oder Unsinn eingestellt ist', () => {
    expect(pflege.maxRevisionen()).toBe(10);
    process.env.FIRMENORDNER_REVISIONEN_MAX = 'viele';
    expect(pflege.maxRevisionen()).toBe(10);
    process.env.FIRMENORDNER_REVISIONEN_MAX = '0';
    expect(pflege.maxRevisionen()).toBe(10);
    process.env.FIRMENORDNER_REVISIONEN_MAX = '3';
    expect(pflege.maxRevisionen()).toBe(3);
  });
});

describe('revisionenBegrenzen', () => {
  it('entfernt die aeltesten jenseits der Grenze samt Sperrdatei', async () => {
    revision('firma', '2026-10-01T10:00:00.1Z', 10);
    revision('firma', '2026-10-01T10:00:00.05Z', 10); // aelter als .1Z? Nein: .05 < .1
    revision('firma', '2026-10-01T12:00:00Z', 10);
    revision('firma', '2026-10-01T11:00:00.123456789Z', 10);

    const r = await pflege.revisionenBegrenzen({ max: 2 });

    expect(r.entfernt).toBe(2);
    expect(r.bytes).toBe(20);
    const befehl = mockExec.mock.calls[0][0];
    expect(befehl.slice(0, 3)).toEqual(['rm', '-f', '--']);
    const basis = '/var/lib/opencloud/posix/projects/firma/.oc-nodes';
    expect(befehl).toEqual(
      expect.arrayContaining([
        `${basis}/bc/3e/d2/2d/-d8e2-4037-899f-b78d8307a236.REV.2026-10-01T10:00:00.05Z`,
        `${basis}/locks/${KNOTEN}.REV.2026-10-01T10:00:00.05Z.mlock`,
        `${basis}/bc/3e/d2/2d/-d8e2-4037-899f-b78d8307a236.REV.2026-10-01T10:00:00.1Z`,
        `${basis}/locks/${KNOTEN}.REV.2026-10-01T10:00:00.1Z.mlock`,
      ])
    );
    // Die zwei neuesten bleiben.
    expect(befehl.join(' ')).not.toContain('T12:00:00Z');
    expect(befehl.join(' ')).not.toContain('T11:00:00');
  });

  it('fasst nichts an, solange es nicht mehr als die Grenze gibt', async () => {
    revision('firma', '2026-10-01T10:00:00Z', 5);
    revision('firma', '2026-10-01T11:00:00Z', 5);
    const r = await pflege.revisionenBegrenzen({ max: 2 });
    expect(r.entfernt).toBe(0);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('zaehlt je Datei und je Bereich getrennt', async () => {
    revision('firma', '2026-10-01T10:00:00Z', 5);
    revision('firma', '2026-10-01T11:00:00Z', 5);
    revision('projekte', '2026-10-01T10:00:00Z', 5);
    const r = await pflege.revisionenBegrenzen({ max: 2 });
    expect(r.entfernt).toBe(0);
  });

  it('ist ohne Firmenordner ein stilles Nichts', async () => {
    delete process.env.COMPOSE_PROFILES;
    revision('firma', '2026-10-01T10:00:00Z', 5);
    revision('firma', '2026-10-01T11:00:00Z', 5);
    const r = await pflege.revisionenBegrenzen({ max: 1 });
    expect(r.entfernt).toBe(0);
    expect(mockExec).not.toHaveBeenCalled();
  });
});

describe('revisionenJeBereich', () => {
  it('zaehlt Anzahl und Bytes je Bereich und ueberspringt locks/', async () => {
    revision('firma', '2026-10-01T10:00:00Z', 7);
    revision('firma', '2026-10-01T11:00:00Z', 5);
    fs.writeFileSync(path.join(wurzel, 'firma', '.oc-nodes', 'bc', 'nebenbei.txt'), 'zzz');
    const werte = await pflege.revisionenJeBereich();
    expect(werte.firma).toEqual({ anzahl: 2, bytes: 12 });
  });

  it('kennt ohne Ablage keinen Bereich und erfindet keine Null', async () => {
    pflege.orte.backend = path.join(wurzel, 'gibt-es-nicht');
    const werte = await pflege.revisionenJeBereich();
    expect(werte).toEqual({});
  });
});

describe('uploadsAufraeumen', () => {
  it('ruft nur den Befehl des Dienstes mit --expired und zaehlt die Zeilen', async () => {
    const r = await pflege.uploadsAufraeumen();
    expect(mockExec).toHaveBeenCalledWith([
      'opencloud',
      'storage-users',
      'uploads',
      'sessions',
      '--expired',
      '--clean',
    ]);
    expect(r.entfernt).toBe(2);
  });

  it('ist ohne Firmenordner ein stilles Nichts', async () => {
    delete process.env.COMPOSE_PROFILES;
    const r = await pflege.uploadsAufraeumen();
    expect(r.entfernt).toBe(0);
    expect(mockExec).not.toHaveBeenCalled();
  });
});

describe('sperrenAufraeumen', () => {
  const alt = new Date(Date.now() - 3 * 3600 * 1000);

  function sperre(name, mtime = alt) {
    const dir = path.join(wurzel, 'firma', '.oc-nodes', 'locks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), '');
    fs.utimesSync(path.join(dir, name), mtime, mtime);
  }

  it('entfernt nur Sperren ohne Knoten oder Revision und ohne frische', async () => {
    revision('firma', '2026-10-01T12:00:00Z', 1); // Revision und ihre Sperre bleiben
    sperre(`${KNOTEN}.mlock`); // Knoten bc3e… gibt es nur als Revision: Knoten fehlt
    sperre('aaaaaaaa-1111-2222-3333-444444444444.mlock');
    sperre('bbbbbbbb-1111-2222-3333-444444444444.mlock', new Date()); // frisch
    sperre('.mlock'); // gehoert nicht zum Muster
    const dir = path.join(wurzel, 'firma', '.oc-nodes', 'cc', 'cc', 'cc', 'cc');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '-1111-2222-3333-444444444444'), '');
    sperre('cccccccc-1111-2222-3333-444444444444.mlock'); // Knoten da

    const r = await pflege.sperrenAufraeumen();

    const weg = mockExec.mock.calls[0][0];
    const basis = '/var/lib/opencloud/posix/projects/firma/.oc-nodes/locks';
    expect(r.entfernt).toBe(2);
    expect(weg).toEqual(
      expect.arrayContaining([
        `${basis}/${KNOTEN}.mlock`,
        `${basis}/aaaaaaaa-1111-2222-3333-444444444444.mlock`,
      ])
    );
    expect(weg.join(' ')).not.toContain('bbbbbbbb');
    expect(weg.join(' ')).not.toContain('cccccccc');
    expect(weg.join(' ')).not.toContain('REV');
  });
});
