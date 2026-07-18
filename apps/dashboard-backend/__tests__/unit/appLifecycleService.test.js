/**
 * Unit tests for appLifecycleService — Container-Lifecycle der Workspace-Apps.
 *
 * Deckt ab: startApp('n8n') startet beide Container, stopApp('n8n') stoppt
 * beide, eine App ohne Lifecycle ist ein sicherer No-op, ein Docker-Fehler
 * wird sauber behandelt (kein Crash, ok:false), reconcileApps folgt dem
 * gespeicherten enabled-Flag.
 */

const mockContainer = {
  inspect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};

jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getContainer: jest.fn(() => mockContainer),
  },
  startContainer: jest.fn(),
  stopContainer: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { docker } = require('../../src/services/core/docker');
const db = require('../../src/database');
const appLifecycle = require('../../src/services/app/appLifecycleService');

beforeEach(() => {
  jest.clearAllMocks();
  mockContainer.inspect.mockResolvedValue({ State: { Running: false } });
  mockContainer.start.mockResolvedValue(undefined);
  mockContainer.stop.mockResolvedValue(undefined);
});

describe('appLifecycleService.startApp', () => {
  test("startApp('n8n') startet beide Container (n8n + n8n-runners)", async () => {
    mockContainer.inspect.mockResolvedValue({ State: { Running: false } });

    const res = await appLifecycle.startApp('n8n');

    expect(res.hasLifecycle).toBe(true);
    expect(res.ok).toBe(true);
    expect(res.containers).toHaveLength(2);
    const names = docker.getContainer.mock.calls.map(c => c[0]);
    expect(names).toEqual(['n8n', 'n8n-runners']);
    expect(mockContainer.start).toHaveBeenCalledTimes(2);
    expect(mockContainer.stop).not.toHaveBeenCalled();
  });

  test('bereits laufender Container wird nicht erneut gestartet (idempotent)', async () => {
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } });

    const res = await appLifecycle.startApp('n8n');

    expect(res.ok).toBe(true);
    expect(mockContainer.start).not.toHaveBeenCalled();
  });
});

describe('appLifecycleService.stopApp', () => {
  test("stopApp('n8n') stoppt beide Container in umgekehrter Reihenfolge", async () => {
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } });

    const res = await appLifecycle.stopApp('n8n');

    expect(res.hasLifecycle).toBe(true);
    expect(res.ok).toBe(true);
    const names = docker.getContainer.mock.calls.map(c => c[0]);
    expect(names).toEqual(['n8n-runners', 'n8n']);
    expect(mockContainer.stop).toHaveBeenCalledTimes(2);
    expect(mockContainer.start).not.toHaveBeenCalled();
  });

  test('nicht vorhandener Container (404) beim Stoppen gilt als erledigt', async () => {
    const notFound = new Error('no such container');
    notFound.statusCode = 404;
    mockContainer.inspect.mockRejectedValue(notFound);

    const res = await appLifecycle.stopApp('n8n');

    expect(res.ok).toBe(true);
    expect(mockContainer.stop).not.toHaveBeenCalled();
  });
});

describe('appLifecycleService — Apps ohne Lifecycle', () => {
  test("unbekannte App ist ein sicherer No-op (startApp)", async () => {
    const res = await appLifecycle.startApp('terminal');

    expect(res.hasLifecycle).toBe(false);
    expect(res.ok).toBe(true);
    expect(res.containers).toEqual([]);
    expect(docker.getContainer).not.toHaveBeenCalled();
  });

  test("unbekannte App ist ein sicherer No-op (stopApp)", async () => {
    const res = await appLifecycle.stopApp('spotify');

    expect(res.hasLifecycle).toBe(false);
    expect(res.ok).toBe(true);
    expect(docker.getContainer).not.toHaveBeenCalled();
  });
});

describe('appLifecycleService — Docker-Fehler', () => {
  test('inspect wirft → ok:false, kein Crash', async () => {
    mockContainer.inspect.mockRejectedValue(new Error('docker daemon unreachable'));

    const res = await appLifecycle.startApp('n8n');

    expect(res.ok).toBe(false);
    expect(res.hasLifecycle).toBe(true);
    expect(res.containers.every(c => c.ok === false)).toBe(true);
    expect(mockContainer.start).not.toHaveBeenCalled();
  });

  test('start wirft → ok:false, kein Crash', async () => {
    mockContainer.inspect.mockResolvedValue({ State: { Running: false } });
    mockContainer.start.mockRejectedValue(new Error('boom'));

    const res = await appLifecycle.startApp('n8n');

    expect(res.ok).toBe(false);
  });
});

describe('appLifecycleService.reconcileApps', () => {
  test('enabled=true → startet n8n', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'n8n', enabled: true }] });
    mockContainer.inspect.mockResolvedValue({ State: { Running: false } });

    await appLifecycle.reconcileApps();

    expect(mockContainer.start).toHaveBeenCalledTimes(2);
    expect(mockContainer.stop).not.toHaveBeenCalled();
  });

  test('enabled=false → stoppt n8n', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'n8n', enabled: false }] });
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } });

    await appLifecycle.reconcileApps();

    expect(mockContainer.stop).toHaveBeenCalledTimes(2);
    expect(mockContainer.start).not.toHaveBeenCalled();
  });

  test('fehlende Zeile → defensiv deaktiviert (stoppt n8n)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } });

    await appLifecycle.reconcileApps();

    expect(mockContainer.stop).toHaveBeenCalledTimes(2);
  });

  test('DB-Fehler blockiert den Boot nicht', async () => {
    db.query.mockRejectedValue(new Error('db down'));

    await expect(appLifecycle.reconcileApps()).resolves.toBeUndefined();
    expect(mockContainer.start).not.toHaveBeenCalled();
    expect(mockContainer.stop).not.toHaveBeenCalled();
  });
});
