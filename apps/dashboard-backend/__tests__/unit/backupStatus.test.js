/**
 * `GET /api/backup/status` sagt die Wahrheit ueber die Sicherung (23.08.2026).
 *
 * Bis dahin stand `backupEnabled` auf `ssdStatus.mounted`, also auf "haengt
 * eine externe Platte dran". Auf dem Orin gemessen: keine Platte angesteckt,
 * Antwort `backupEnabled: false` — und gleichzeitig 38 Postgres-Sicherungen,
 * 328 WAL-Segmente, letzte Sicherung drei Stunden alt, Wiederherstellungsprobe
 * derselben Nacht mit sechs geprueften Tabellen.
 *
 * Das Geraet sichert also, und der Endpunkt sagte das Gegenteil. Wer eine
 * eigene Anwendung dagegen baut, schliesst daraus, die Sicherung sei aus.
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

function app(berichtPfad, mountPfad) {
  jest.resetModules();
  process.env.BACKUP_REPORT_PATH = berichtPfad;
  process.env.EXTERNAL_BACKUP_PATH = mountPfad;
  const routen = require('../../src/routes/admin/backup');
  const a = express();
  a.use(express.json());
  a.use('/api/backup', routen);
  return a;
}

function berichtMit(inhalt) {
  const ordner = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'backup-'));
  const datei = pathMod.join(ordner, 'backup_report.json');
  fsSync.writeFileSync(datei, JSON.stringify(inhalt));
  return datei;
}

test('ohne externe Platte, aber mit frischer Sicherung: backupEnabled ist wahr', async () => {
  const datei = berichtMit({ status: 'completed', timestamp: '2026-08-23T02:00:54+00:00' });
  const res = await request(app(datei, '/gibt-es-nicht')).get('/api/backup/status').expect(200);
  expect(res.body.ssd.mounted).toBe(false);
  expect(res.body.ssdBackupMoeglich).toBe(false);
  expect(res.body.backupEnabled).toBe(true);
  expect(res.body.letzteSicherung.status).toBe('completed');
});

test('ohne Bericht gilt die Sicherung als fehlend, nicht als unbekannt', async () => {
  // Wer nicht belegen kann, dass er gesichert hat, hat fuer diese Frage nicht
  // gesichert.
  const ordner = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'backup-leer-'));
  const res = await request(app(pathMod.join(ordner, 'fehlt.json'), '/gibt-es-nicht'))
    .get('/api/backup/status')
    .expect(200);
  expect(res.body.backupEnabled).toBe(false);
  expect(res.body.letzteSicherung.status).toBe('missing');
  expect(res.body.letzteSicherung.veraltet).toBe(true);
});

test('eine veraltete Sicherung zaehlt nicht als laufend', async () => {
  const datei = berichtMit({ status: 'completed', timestamp: '2026-01-01T00:00:00+00:00' });
  // Die Datei ist frisch geschrieben, also nicht veraltet; das Alter kommt aus
  // der Datei-Zeit. Hier wird sie kuenstlich alt gemacht.
  const alt = Date.now() - 72 * 36e5;
  fsSync.utimesSync(datei, alt / 1000, alt / 1000);
  const res = await request(app(datei, '/gibt-es-nicht')).get('/api/backup/status').expect(200);
  expect(res.body.letzteSicherung.veraltet).toBe(true);
  expect(res.body.backupEnabled).toBe(false);
});
