/**
 * `GET /api/backup/status` sagt die Wahrheit ueber die Sicherung (23.08.2026,
 * fortgeschrieben in Phase C9 am 27.08.2026).
 *
 * Bis zum 23.08.2026 stand `backupEnabled` auf „haengt eine externe Platte
 * dran". Auf dem Orin gemessen: keine Platte angesteckt, Antwort `false` — und
 * gleichzeitig 38 Postgres-Sicherungen, 328 WAL-Segmente, letzte Sicherung
 * drei Stunden alt. Das Geraet sicherte also, und der Endpunkt sagte das
 * Gegenteil.
 *
 * Seit Phase C9 heisst das Feld `sichertWirklich` und daneben steht
 * `ausserhalb`: wann zuletzt eine Kopie AUSSER HAUS entstanden ist. Das sind
 * zwei Fragen, und sie haben zwei Antworten — die zweite ist leer, solange
 * noch nie eine Kopie ausserhalb entstanden ist, und sagt das, statt zu
 * schweigen.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';
process.env.RATE_LIMIT_ENABLED = 'false';

const os = require('os');
const pathMod = require('path');
const fsSync = require('fs');
const request = require('supertest');
const express = require('express');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 1, username: 'admin', role: 'admin' };
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
  ROLLEN: ['admin', 'mitarbeiter'],
}));

// Der Sicherungsdienst spricht ueber den Docker-Proxy mit dem
// Sicherungs-Container. Fuer die Frage dieses Tests -- was ANTWORTET der
// Endpunkt auf die Berichte, die auf der Platte liegen -- braucht es keinen
// Docker; die Statusabfrage fasst ihn ohnehin nicht an.
jest.mock('../../src/services/core/docker', () => ({
  docker: { getContainer: jest.fn() },
  getAllServicesStatus: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn() }));

function ordnerMit(dateien) {
  const ordner = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'sicherung-'));
  for (const [name, inhalt] of Object.entries(dateien)) {
    fsSync.writeFileSync(pathMod.join(ordner, name), JSON.stringify(inhalt));
  }
  return ordner;
}

function app(ordner) {
  jest.resetModules();
  process.env.BACKUP_REPORT_PATH = pathMod.join(ordner, 'backup_report.json');
  const routen = require('../../src/routes/admin/backup');
  const a = express();
  a.use(express.json());
  a.use('/api/backup', routen);
  return a;
}

test('eine frische Sicherung zaehlt, auch ohne Datentraeger ausserhalb', async () => {
  const ordner = ordnerMit({
    'backup_report.json': {
      status: 'completed',
      timestamp: '2026-08-27T02:00:54+00:00',
      total_size: '4.9G',
      apps_status: 'true',
      flows_status: 'true',
      config_status: 'true',
      extern_status: 'kein_ziel',
      encrypted: 'true',
    },
  });
  const res = await request(app(ordner)).get('/api/backup/status').expect(200);

  expect(res.body.data.sichertWirklich).toBe(true);
  expect(res.body.data.letzteSicherung.status).toBe('completed');
  expect(res.body.data.letzteSicherung.apps).toBe('true');
  expect(res.body.data.letzteSicherung.verschluesselt).toBe(true);

  // Nie eine Kopie ausserhalb: leer, aber vorhanden — und der letzte Versuch
  // steht daneben, damit ein Mensch sieht, WARUM sie leer ist.
  expect(res.body.data.ausserhalb.vorhanden).toBe(false);
  expect(res.body.data.ausserhalb.zeitpunkt).toBeNull();
  expect(res.body.data.ausserhalb.bytes).toBeNull();
  expect(res.body.data.ausserhalb.letzterVersuch).toBe('kein_ziel');
});

test('Datum und Groesse der letzten Kopie ausserhalb sind lesbar', async () => {
  const ordner = ordnerMit({
    'backup_report.json': {
      status: 'completed',
      timestamp: '2026-08-27T02:00:54+00:00',
      extern_status: 'kopiert',
    },
    'extern_bericht.json': {
      zeitpunkt: '2026-08-27T02:03:11+02:00',
      ziel: '/arasul/extern',
      dateien: 4,
      bytes: 5211334,
    },
  });
  const res = await request(app(ordner)).get('/api/backup/status').expect(200);

  expect(res.body.data.ausserhalb.vorhanden).toBe(true);
  expect(res.body.data.ausserhalb.zeitpunkt).toBe('2026-08-27T02:03:11+02:00');
  expect(res.body.data.ausserhalb.bytes).toBe(5211334);
  expect(res.body.data.ausserhalb.dateien).toBe(4);
});

test('die Kopie ausserhalb ueberlebt eine Nacht ohne Datentraeger', async () => {
  // Der Tagesbericht sagt „nicht eingehaengt". Das Datum der LETZTEN echten
  // Kopie darf davon nicht verschwinden — sonst sieht ein Betreiber nach einer
  // Nacht ohne Stick so aus, als haette er nie eine Kopie ausser Haus gehabt.
  const ordner = ordnerMit({
    'backup_report.json': { status: 'completed', extern_status: 'nicht_eingehaengt' },
    'extern_bericht.json': { zeitpunkt: '2026-08-20T02:03:11+02:00', bytes: 42, dateien: 4 },
  });
  const res = await request(app(ordner)).get('/api/backup/status').expect(200);

  expect(res.body.data.ausserhalb.vorhanden).toBe(true);
  expect(res.body.data.ausserhalb.zeitpunkt).toBe('2026-08-20T02:03:11+02:00');
  expect(res.body.data.ausserhalb.letzterVersuch).toBe('nicht_eingehaengt');
});

test('ohne Bericht gilt die Sicherung als fehlend, nicht als unbekannt', async () => {
  // Wer nicht belegen kann, dass er gesichert hat, hat fuer diese Frage nicht
  // gesichert.
  const ordner = ordnerMit({});
  const res = await request(app(ordner)).get('/api/backup/status').expect(200);

  expect(res.body.data.sichertWirklich).toBe(false);
  expect(res.body.data.letzteSicherung.status).toBe('fehlt');
  expect(res.body.data.letzteSicherung.veraltet).toBe(true);
});

test('eine veraltete Sicherung zaehlt nicht als laufend', async () => {
  const ordner = ordnerMit({
    'backup_report.json': { status: 'completed', timestamp: '2026-01-01T00:00:00+00:00' },
  });
  // Das Alter kommt aus der Datei-Zeit, nicht aus dem Feld im Bericht: eine
  // Datei, die seit drei Tagen niemand angefasst hat, ist der Beleg dafuer,
  // dass seit drei Tagen nicht gesichert wurde.
  const datei = pathMod.join(ordner, 'backup_report.json');
  const alt = Date.now() - 72 * 36e5;
  fsSync.utimesSync(datei, alt / 1000, alt / 1000);

  const res = await request(app(ordner)).get('/api/backup/status').expect(200);
  expect(res.body.data.letzteSicherung.veraltet).toBe(true);
  expect(res.body.data.sichertWirklich).toBe(false);
});
