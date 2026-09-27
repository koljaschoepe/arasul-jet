/**
 * Was sich im Firmenordner waehrend der Sicherung bewegt hat (J35, 27.09.2026).
 *
 * `backup.sh` laesst eine Sicherung nicht mehr scheitern, weil waehrenddessen
 * jemand schreibt -- und sagt im Bericht, welche Dateien sich bewegt haben.
 * Hier wird gemessen, dass `GET /api/backup/status` das weiterreicht, und dass
 * ein Bericht von vor J35 `null` ergibt statt einer erfundenen Null.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/app/appStore', () => ({ spieleEin: jest.fn() }));
jest.mock('../../src/services/core/docker', () => ({
  docker: { getContainer: jest.fn() },
  getAllServicesStatus: jest.fn(),
}));

const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'sicherungsstatus-'));
process.env.BACKUP_REPORT_PATH = path.join(ORDNER, 'backup_report.json');
const sicherungsdienst = require('../../src/services/betrieb/sicherungsdienst');

function bericht(felder) {
  fs.writeFileSync(
    process.env.BACKUP_REPORT_PATH,
    JSON.stringify({ timestamp: new Date().toISOString(), status: 'completed', ...felder })
  );
}

afterAll(() => {
  fs.rmSync(ORDNER, { recursive: true, force: true });
});

describe('status: Firmenordner waehrend der Sicherung', () => {
  it('nennt Zahl und Pfade, und die Sicherung bleibt durchgelaufen', async () => {
    bericht({
      firmenordner_status: 'true',
      firmenordner_geaendert: 2,
      firmenordner_geaendert_dateien: ['./Angebote/neu.pdf', './Regeln.md'],
    });
    const s = await sicherungsdienst.status();
    expect(s.sichertWirklich).toBe(true);
    expect(s.letzteSicherung.firmenordnerGeaendert).toEqual({
      anzahl: 2,
      dateien: ['./Angebote/neu.pdf', './Regeln.md'],
    });
  });

  it('meldet null fuer einen Bericht von vor J35', async () => {
    bericht({ firmenordner_status: 'true' });
    const s = await sicherungsdienst.status();
    expect(s.letzteSicherung.firmenordnerGeaendert).toBeNull();
  });
});
