/**
 * Container Service Unit Tests
 * Tests for container lifecycle: start, stop, restart, logs, validateAppId
 *
 * Uses direct module mocking (same pattern as llmJobService.test.js)
 */

// Mock dependencies before requiring the module
jest.mock('../../src/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock docker module
const mockContainer = {
  start: jest.fn(),
  stop: jest.fn(),
  restart: jest.fn(),
  remove: jest.fn(),
  inspect: jest.fn(),
  logs: jest.fn(),
};

jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getContainer: jest.fn(() => mockContainer),
    createContainer: jest.fn(),
  },
}));

// Mock manifestService
jest.mock('../../src/services/app/manifestService', () => ({
  loadManifests: jest.fn().mockResolvedValue({}),
}));

// Mock configService
jest.mock('../../src/services/app/configService', () => ({
  logEvent: jest.fn().mockResolvedValue(true),
  getConfigOverrides: jest.fn().mockResolvedValue({}),
  getClaudeWorkspaceVolumes: jest.fn().mockResolvedValue([]),
}));

// Mock installService
jest.mock('../../src/services/app/installService', () => ({
  checkDependencies: jest.fn().mockResolvedValue(true),
}));

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const { docker } = require('../../src/services/core/docker');
const manifestService = require('../../src/services/app/manifestService');
const configService = require('../../src/services/app/configService');
const installService = require('../../src/services/app/installService');
const containerService = require('../../src/services/app/containerService');

describe('Container Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContainer.start.mockReset().mockResolvedValue({});
    mockContainer.stop.mockReset().mockResolvedValue({});
    mockContainer.restart.mockReset().mockResolvedValue({});
    mockContainer.remove.mockReset().mockResolvedValue({});
    mockContainer.inspect.mockReset();
    mockContainer.logs.mockReset();
    manifestService.loadManifests.mockResolvedValue({});
  });

  // =====================================================
  // startApp
  // =====================================================
  describe('startApp()', () => {
    test('starts stopped app successfully', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ app_id: 'n8n', status: 'installed', container_name: 'n8n' }] }) // Get installation
        .mockResolvedValueOnce({ rows: [] }) // Update status to starting
        .mockResolvedValueOnce({ rows: [] }); // Update status to running

      const result = await containerService.startApp('n8n');

      expect(result.success).toBe(true);
      expect(mockContainer.start).toHaveBeenCalled();
    });

    test('returns success if app is already running', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ app_id: 'n8n', status: 'running', container_name: 'n8n' }],
      });

      const result = await containerService.startApp('n8n');

      expect(result.success).toBe(true);
      expect(result.message).toContain('läuft bereits');
      expect(mockContainer.start).not.toHaveBeenCalled();
    });

    test('throws for non-installed app', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(containerService.startApp('nonexistent')).rejects.toThrow(
        'nicht installiert'
      );
    });

    test('handles already-started container (304)', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ app_id: 'n8n', status: 'installed', container_name: 'n8n' }] })
        .mockResolvedValueOnce({ rows: [] }) // Update to starting
        .mockResolvedValueOnce({ rows: [] }); // Update to running

      const error304 = new Error('Already started');
      error304.statusCode = 304;
      mockContainer.start.mockRejectedValueOnce(error304);

      const result = await containerService.startApp('n8n');

      expect(result.success).toBe(true);
    });

    test('sets status to error on start failure', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ app_id: 'n8n', status: 'installed', container_name: 'n8n' }] })
        .mockResolvedValueOnce({ rows: [] }) // Update to starting
        .mockResolvedValueOnce({ rows: [] }); // Update to error

      mockContainer.start.mockRejectedValueOnce(new Error('Container start failed'));

      await expect(containerService.startApp('n8n')).rejects.toThrow('Container start failed');

      // Verify error status was written
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'error'"),
        expect.any(Array)
      );
    });

    test('handles builtin apps without docker', async () => {
      manifestService.loadManifests.mockResolvedValue({
        'claude-code': { builtin: true },
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ app_id: 'claude-code', status: 'installed' }] })
        .mockResolvedValueOnce({ rows: [] }); // Update status

      const result = await containerService.startApp('claude-code');

      expect(result.success).toBe(true);
      expect(result.message).toContain('aktiviert');
      expect(mockContainer.start).not.toHaveBeenCalled();
    });

    test('validates app ID format', async () => {
      await expect(containerService.startApp('')).rejects.toThrow('Invalid app ID');
      await expect(containerService.startApp('AB')).rejects.toThrow('Invalid app ID');
      await expect(containerService.startApp('a b')).rejects.toThrow('Invalid app ID');
      await expect(containerService.startApp('../etc/passwd')).rejects.toThrow('Invalid app ID');
    });
  });

  // =====================================================
  // stopApp
  // =====================================================
  describe('stopApp()', () => {
    test('stops running app successfully', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ app_id: 'n8n', status: 'running', container_name: 'n8n' }] })
        .mockResolvedValueOnce({ rows: [] }) // Update to stopping
        .mockResolvedValueOnce({ rows: [] }); // Update to installed

      mockContainer.inspect.mockResolvedValue({ State: { Running: true } });

      const result = await containerService.stopApp('n8n');

      expect(result.success).toBe(true);
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
    });

    test('returns success if app is already stopped', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ app_id: 'n8n', status: 'installed', container_name: 'n8n' }],
      });

      mockContainer.inspect.mockResolvedValue({ State: { Running: false } });

      const result = await containerService.stopApp('n8n');

      expect(result.success).toBe(true);
      expect(result.message).toContain('bereits gestoppt');
    });

    test('throws for non-installed app', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(containerService.stopApp('nonexistent')).rejects.toThrow('nicht installiert');
    });

    test('checks dependencies before stopping', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ app_id: 'n8n', status: 'running', container_name: 'n8n' }],
      });

      mockContainer.inspect.mockResolvedValue({ State: { Running: true } });
      mockContainer.stop.mockResolvedValue({});
      db.query.mockResolvedValue({ rows: [] }); // For remaining queries

      await containerService.stopApp('n8n');

      expect(installService.checkDependencies).toHaveBeenCalledWith('n8n');
    });

    test('handles already-stopped container (304)', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ app_id: 'n8n', status: 'running', container_name: 'n8n' }] })
        .mockResolvedValueOnce({ rows: [] }) // Update to stopping
        .mockResolvedValueOnce({ rows: [] }); // Update to installed

      mockContainer.inspect.mockResolvedValue({ State: { Running: true } });
      const error304 = new Error('Already stopped');
      error304.statusCode = 304;
      mockContainer.stop.mockRejectedValueOnce(error304);

      const result = await containerService.stopApp('n8n');

      expect(result.success).toBe(true);
    });

    test('handles builtin apps without docker', async () => {
      manifestService.loadManifests.mockResolvedValue({
        'claude-code': { builtin: true },
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ app_id: 'claude-code', status: 'running' }] })
        .mockResolvedValueOnce({ rows: [] }); // Update status

      const result = await containerService.stopApp('claude-code');

      expect(result.success).toBe(true);
      expect(result.message).toContain('deaktiviert');
    });
  });

  // =====================================================
  // restartApp
  // =====================================================
  describe('restartApp()', () => {
    test('restarts app successfully', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ app_id: 'n8n', status: 'running', container_name: 'n8n' }] })
        .mockResolvedValueOnce({ rows: [] }); // Update status

      mockContainer.restart.mockResolvedValue({});

      const result = await containerService.restartApp('n8n');

      expect(result.success).toBe(true);
      expect(mockContainer.restart).toHaveBeenCalledWith({ t: 10 });
    });

    test('throws for non-installed app', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(containerService.restartApp('nonexistent')).rejects.toThrow(
        'nicht installiert'
      );
    });

    test('handles builtin apps', async () => {
      manifestService.loadManifests.mockResolvedValue({
        'claude-code': { builtin: true },
      });

      db.query.mockResolvedValueOnce({
        rows: [{ app_id: 'claude-code', status: 'running' }],
      });

      const result = await containerService.restartApp('claude-code');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Built-in');
    });

    test('sets error status on restart failure', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ app_id: 'n8n', status: 'running', container_name: 'n8n' }] })
        .mockResolvedValueOnce({ rows: [] }); // Update to error

      mockContainer.restart.mockRejectedValueOnce(new Error('Restart failed'));

      await expect(containerService.restartApp('n8n')).rejects.toThrow('Restart failed');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'error'"),
        expect.any(Array)
      );
    });
  });

  // =====================================================
  // getAppLogs
  // =====================================================
  describe('getAppLogs()', () => {
    test('returns container logs', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ container_name: 'n8n' }],
      });

      const logBuffer = Buffer.from('2026-03-01T00:00:00Z Log line 1\n2026-03-01T00:00:01Z Log line 2');
      mockContainer.logs.mockResolvedValue(logBuffer);

      const logs = await containerService.getAppLogs('n8n', 50);

      expect(mockContainer.logs).toHaveBeenCalledWith(
        expect.objectContaining({
          stdout: true,
          stderr: true,
          tail: 50,
          timestamps: true,
        })
      );
    });

    test('throws for non-installed app', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(containerService.getAppLogs('nonexistent')).rejects.toThrow(
        'nicht installiert'
      );
    });

    test('returns info message for builtin apps', async () => {
      manifestService.loadManifests.mockResolvedValue({
        'claude-code': { builtin: true },
      });

      db.query.mockResolvedValueOnce({ rows: [{ container_name: 'claude-code' }] });

      const logs = await containerService.getAppLogs('claude-code');

      expect(logs).toContain('Built-in App');
      expect(logs).toContain('dashboard-backend');
    });

    test('validates app ID', async () => {
      await expect(containerService.getAppLogs('')).rejects.toThrow('Invalid app ID');
    });
  });

  // =====================================================
  // validateAppId (indirect via startApp/stopApp)
  // =====================================================
  describe('App ID Validation', () => {
    test('accepts valid app IDs', async () => {
      const validIds = ['n8n', 'telegram-bot', 'claude-code', 'my_app_123'];

      for (const id of validIds) {
        db.query.mockResolvedValueOnce({ rows: [] }); // Not installed
        // Should throw "not installed" rather than "invalid ID"
        await expect(containerService.startApp(id)).rejects.toThrow('nicht installiert');
      }
    });

    test('rejects dangerous app IDs', async () => {
      const dangerousIds = [
        '',
        'AB', // Too short
        'ab', // Too short (2 chars, minimum 3)
        'A'.repeat(65), // Too long
        'has spaces',
        '../../../etc',
        'UPPERCASE',
        'has.dots',
        '-starts-with-dash',
        'has@symbol',
      ];

      for (const id of dangerousIds) {
        await expect(containerService.startApp(id)).rejects.toThrow('Invalid app ID');
      }
    });
  });
});
