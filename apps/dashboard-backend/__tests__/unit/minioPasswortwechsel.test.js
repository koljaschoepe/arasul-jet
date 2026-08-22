/**
 * Plan 023 J1: nach dem MinIO-Passwortwechsel muss der Dateizugriff weiterlaufen.
 *
 * Der Fall, um den es geht, sah aus wie Erfolg: die Einstellungsseite schreibt
 * die neue `.env`, startet MinIO neu und antwortet "changed successfully". Das
 * Backend selbst laeuft weiter — und hielt bis zum 22.08.2026 einen
 * zwischengespeicherten MinIO-Client mit dem ALTEN Geheimnis fest, weil es in
 * einer Modul-Konstante stand. Jeder Datei-Zugriff scheiterte danach mit
 * `SignatureDoesNotMatch`, bis jemand das Dashboard neu startete.
 *
 * Die Abnahme aus dem Plan nennt genau das: "Beide Passwoerter geaendert, neu
 * angemeldet, Dateizugriff geprueft."
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';
process.env.MINIO_ROOT_USER = 'arasul';
process.env.MINIO_ROOT_PASSWORD = 'altes-geheimnis-1234';

const gebaut = [];
jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(cfg => {
    gebaut.push(cfg);
    return { _cfg: cfg };
  }),
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const minioService = require('../../src/services/documents/minioService');

beforeEach(() => {
  gebaut.length = 0;
  minioService.clientZuruecksetzen();
  process.env.MINIO_ROOT_PASSWORD = 'altes-geheimnis-1234';
});

describe('MinIO-Client und das Geheimnis (Plan 023 J1)', () => {
  test('nimmt beim Bauen das Geheimnis aus der Umgebung', () => {
    minioService.getMinioClient();
    expect(gebaut).toHaveLength(1);
    expect(gebaut[0].secretKey).toBe('altes-geheimnis-1234');
  });

  test('baut den Client nur einmal, solange sich nichts aendert', () => {
    minioService.getMinioClient();
    minioService.getMinioClient();
    expect(gebaut).toHaveLength(1);
  });

  test('nach dem Zuruecksetzen gilt das NEUE Geheimnis', () => {
    // Der eigentliche Punkt. Vorher stand das alte in einer Modul-Konstante
    // und ueberlebte jedes Zuruecksetzen.
    minioService.getMinioClient();
    process.env.MINIO_ROOT_PASSWORD = 'neues-geheimnis-5678';
    minioService.clientZuruecksetzen();
    minioService.getMinioClient();

    expect(gebaut).toHaveLength(2);
    expect(gebaut[1].secretKey).toBe('neues-geheimnis-5678');
  });

  test('ohne Zuruecksetzen bleibt der alte Client stehen', () => {
    // Damit klar ist, WARUM die Route zuruecksetzen muss: eine Aenderung an
    // process.env allein reicht nicht.
    minioService.getMinioClient();
    process.env.MINIO_ROOT_PASSWORD = 'neues-geheimnis-5678';
    minioService.getMinioClient();
    expect(gebaut).toHaveLength(1);
  });
});
