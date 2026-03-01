/**
 * Unit tests for System Routes
 *
 * Tests all system endpoints (all public, no auth required):
 * - GET /api/system/status
 * - GET /api/system/info
 * - GET /api/system/network
 * - GET /api/system/thresholds
 * - POST /api/system/reload-config
 */

const request = require('supertest');

// Mock bcrypt to avoid native addon loading issues in test environment
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
  hashSync: jest.fn().mockReturnValue('hashed')
}));

// Mock dockerode to avoid Docker socket connection in tests
jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => ({
    listContainers: jest.fn().mockResolvedValue([])
  }));
});

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock dockerService
jest.mock('../../src/services/docker', () => ({
  getAllServicesStatus: jest.fn()
}));

// Mock axios
jest.mock('axios', () => ({
  get: jest.fn()
}));

// Mock child_process - uses execFile (not exec) to prevent shell injection
// Note: promisify adds callback as last arg, so detect it dynamically
jest.mock('child_process', () => ({
  execFile: jest.fn((...allArgs) => {
    const cb = typeof allArgs[allArgs.length - 1] === 'function' ? allArgs[allArgs.length - 1] : null;
    if (cb) cb(null, { stdout: '5.1.2', stderr: '' });
    return {};
  }),
  exec: jest.fn((...allArgs) => {
    const cb = typeof allArgs[allArgs.length - 1] === 'function' ? allArgs[allArgs.length - 1] : null;
    if (cb) cb(null, { stdout: '', stderr: '' });
    return {};
  })
}));

// Mock fs.promises while preserving the rest of the fs module
// (node-pre-gyp used by bcrypt needs fs.existsSync)
jest.mock('fs', () => {
  const realFs = jest.requireActual('fs');
  return {
    ...realFs,
    promises: {
      ...realFs.promises,
      readFile: jest.fn()
    }
  };
});

const db = require('../../src/database');
const dockerService = require('../../src/services/docker');
const axios = require('axios');
const childProcess = require('child_process');
const fs = require('fs');
const { app } = require('../../src/server');

// Helper: set up healthy service mock
function mockHealthyServices() {
  dockerService.getAllServicesStatus.mockResolvedValue({
    llm: { status: 'healthy' },
    embeddings: { status: 'healthy' },
    n8n: { status: 'healthy' },
    minio: { status: 'healthy' },
    postgres: { status: 'healthy' },
    self_healing: { status: 'healthy' }
  });
}

// Helper: set up normal metrics mock (CPU 45%)
function mockNormalMetrics() {
  db.query.mockImplementation((query) => {
    if (query.includes('metrics_cpu')) {
      return Promise.resolve({
        rows: [{ cpu: 45, ram: 55, gpu: 30, temperature: 50, disk_percent: 40 }]
      });
    }
    if (query.includes('self_healing_events')) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('System Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // GET /api/system/status
  // ============================================================================
  describe('GET /api/system/status', () => {
    test('should return OK status when all services healthy', async () => {
      mockHealthyServices();
      mockNormalMetrics();

      const response = await request(app).get('/api/system/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('llm', 'healthy');
      expect(response.body).toHaveProperty('embeddings', 'healthy');
      expect(response.body).toHaveProperty('n8n', 'healthy');
      expect(response.body).toHaveProperty('minio', 'healthy');
      expect(response.body).toHaveProperty('postgres', 'healthy');
      expect(response.body).toHaveProperty('self_healing_active', true);
      expect(response.body).toHaveProperty('warnings');
      expect(response.body).toHaveProperty('criticals');
      expect(response.body.warnings).toHaveLength(0);
      expect(response.body.criticals).toHaveLength(0);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return WARNING when CPU is high', async () => {
      mockHealthyServices();

      db.query.mockImplementation((query) => {
        if (query.includes('metrics_cpu')) {
          return Promise.resolve({
            rows: [{ cpu: 85, ram: 55, gpu: 30, temperature: 50, disk_percent: 40 }]
          });
        }
        if (query.includes('self_healing_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app).get('/api/system/status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('WARNING');
      expect(response.body.warnings).toContain('CPU usage high');
      expect(response.body.criticals).toHaveLength(0);
    });

    test('should return CRITICAL when a service is down', async () => {
      dockerService.getAllServicesStatus.mockResolvedValue({
        llm: { status: 'exited' },
        embeddings: { status: 'healthy' },
        n8n: { status: 'healthy' },
        minio: { status: 'healthy' },
        postgres: { status: 'healthy' },
        self_healing: { status: 'healthy' }
      });
      mockNormalMetrics();

      const response = await request(app).get('/api/system/status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('CRITICAL');
      expect(response.body.criticals).toContain('llm is down');
      expect(response.body).toHaveProperty('llm', 'exited');
    });

    test('should return WARNING when a service is restarting', async () => {
      dockerService.getAllServicesStatus.mockResolvedValue({
        llm: { status: 'restarting' },
        embeddings: { status: 'healthy' },
        n8n: { status: 'healthy' },
        minio: { status: 'healthy' },
        postgres: { status: 'healthy' },
        self_healing: { status: 'healthy' }
      });
      mockNormalMetrics();

      const response = await request(app).get('/api/system/status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('WARNING');
      expect(response.body.warnings).toContain('llm is restarting');
    });

    test('should include last self-healing event when present', async () => {
      mockHealthyServices();

      db.query.mockImplementation((query) => {
        if (query.includes('metrics_cpu')) {
          return Promise.resolve({
            rows: [{ cpu: 45, ram: 55, gpu: 30, temperature: 50, disk_percent: 40 }]
          });
        }
        if (query.includes('self_healing_events')) {
          return Promise.resolve({
            rows: [{
              event_type: 'service_restart',
              severity: 'WARNING',
              description: 'Restarted llm-service due to OOM',
              timestamp: new Date().toISOString()
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app).get('/api/system/status');

      expect(response.status).toBe(200);
      expect(response.body.last_self_healing_event).toBe('Restarted llm-service due to OOM');
    });

    test('should report self_healing_active as false when self_healing service is not healthy', async () => {
      dockerService.getAllServicesStatus.mockResolvedValue({
        llm: { status: 'healthy' },
        embeddings: { status: 'healthy' },
        n8n: { status: 'healthy' },
        minio: { status: 'healthy' },
        postgres: { status: 'healthy' },
        self_healing: { status: 'exited' }
      });
      mockNormalMetrics();

      const response = await request(app).get('/api/system/status');

      expect(response.status).toBe(200);
      expect(response.body.self_healing_active).toBe(false);
    });
  });

  // ============================================================================
  // GET /api/system/info
  // ============================================================================
  describe('GET /api/system/info', () => {
    test('should return version and uptime info', async () => {
      // execFile mock is set at module level - returns '5.1.2' for dpkg-query
      const response = await request(app).get('/api/system/info');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('build_hash');
      expect(response.body).toHaveProperty('jetpack_version');
      expect(response.body).toHaveProperty('uptime_seconds');
      expect(response.body).toHaveProperty('hostname');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.uptime_seconds).toBe('number');
    });

    test('should return jetpack version from dpkg-query via execFile', async () => {
      // Reset execFile to return a known JetPack version
      childProcess.execFile.mockImplementationOnce((...allArgs) => {
        const cb = typeof allArgs[allArgs.length - 1] === 'function' ? allArgs[allArgs.length - 1] : null;
        const cmd = allArgs[0];
        const args = allArgs[1];
        expect(cmd).toBe('dpkg-query');
        expect(Array.isArray(args)).toBe(true);
        expect(args).toContain('nvidia-jetpack');
        if (cb) cb(null, { stdout: '5.1.2-b104', stderr: '' });
        return {};
      });

      const response = await request(app).get('/api/system/info');

      expect(response.status).toBe(200);
      expect(response.body.jetpack_version).toBe('5.1.2-b104');
    });

    test('should return unknown jetpack version when dpkg-query fails', async () => {
      childProcess.execFile.mockImplementationOnce((...allArgs) => {
        const cb = typeof allArgs[allArgs.length - 1] === 'function' ? allArgs[allArgs.length - 1] : null;
        if (cb) cb(new Error('dpkg-query: package not found'), null);
        return {};
      });

      const response = await request(app).get('/api/system/info');

      expect(response.status).toBe(200);
      expect(response.body.jetpack_version).toBe('unknown');
    });

    test('should use execFile (not exec) for dpkg-query to prevent shell injection', async () => {
      await request(app).get('/api/system/info');

      // Verify execFile was called with an array of args (not a shell string)
      const execFileCalls = childProcess.execFile.mock.calls;
      expect(execFileCalls.length).toBeGreaterThan(0);

      const [cmd, args] = execFileCalls[0];
      expect(cmd).toBe('dpkg-query');
      expect(Array.isArray(args)).toBe(true);
      // Array args means no shell interpolation - shell injection is not possible
      expect(args[0]).toBe('-W');
      expect(args[args.length - 1]).toBe('nvidia-jetpack');
    });
  });

  // ============================================================================
  // GET /api/system/network
  // ============================================================================
  describe('GET /api/system/network', () => {
    test('should return IP addresses and connectivity info', async () => {
      // ping succeeds: execFile callback gets null error
      childProcess.execFile.mockImplementation((...allArgs) => {
        const cb = typeof allArgs[allArgs.length - 1] === 'function' ? allArgs[allArgs.length - 1] : null;
        if (cb) cb(null, { stdout: '', stderr: '' });
        return {};
      });

      // n8n health check succeeds
      axios.get.mockResolvedValue({ data: { status: 'ok' } });

      const response = await request(app).get('/api/system/network');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ip_addresses');
      expect(Array.isArray(response.body.ip_addresses)).toBe(true);
      expect(response.body).toHaveProperty('mdns', 'arasul.local');
      expect(response.body).toHaveProperty('internet_reachable');
      expect(response.body).toHaveProperty('n8n_webhook_reachable');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should report internet_reachable false when ping fails', async () => {
      childProcess.execFile.mockImplementation((...allArgs) => {
        const cb = typeof allArgs[allArgs.length - 1] === 'function' ? allArgs[allArgs.length - 1] : null;
        const cmd = allArgs[0];
        if (cmd === 'ping') {
          if (cb) cb(new Error('ping: connect: Network is unreachable'), null);
        } else {
          if (cb) cb(null, { stdout: '5.1.2', stderr: '' });
        }
        return {};
      });

      axios.get.mockRejectedValue(new Error('Connection refused'));

      const response = await request(app).get('/api/system/network');

      expect(response.status).toBe(200);
      expect(response.body.internet_reachable).toBe(false);
    });

    test('should report n8n_webhook_reachable false when n8n is unreachable', async () => {
      childProcess.execFile.mockImplementation((...allArgs) => {
        const cb = typeof allArgs[allArgs.length - 1] === 'function' ? allArgs[allArgs.length - 1] : null;
        if (cb) cb(null, { stdout: '', stderr: '' });
        return {};
      });

      axios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const response = await request(app).get('/api/system/network');

      expect(response.status).toBe(200);
      expect(response.body.n8n_webhook_reachable).toBe(false);
    });

    test('should use execFile (not exec) for ping to prevent shell injection', async () => {
      childProcess.execFile.mockImplementation((...allArgs) => {
        const cb = typeof allArgs[allArgs.length - 1] === 'function' ? allArgs[allArgs.length - 1] : null;
        if (cb) cb(null, { stdout: '', stderr: '' });
        return {};
      });
      axios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await request(app).get('/api/system/network');

      const pingCall = childProcess.execFile.mock.calls.find(([cmd]) => cmd === 'ping');
      expect(pingCall).toBeDefined();

      const [cmd, args] = pingCall;
      expect(cmd).toBe('ping');
      // Args must be an array (not a shell string) - no shell injection possible
      expect(Array.isArray(args)).toBe(true);
      // Last arg should be the literal IP, not a shell expression
      expect(args[args.length - 1]).toBe('8.8.8.8');
    });
  });

  // ============================================================================
  // GET /api/system/thresholds
  // ============================================================================
  describe('GET /api/system/thresholds', () => {
    test('should return device thresholds for generic device', async () => {
      // On non-Jetson test machine, fs.readFile should throw / return empty
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const response = await request(app).get('/api/system/thresholds');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('device');
      expect(response.body).toHaveProperty('thresholds');
      expect(response.body).toHaveProperty('source');
      expect(response.body).toHaveProperty('timestamp');

      // Device info
      expect(response.body.device).toHaveProperty('type');
      expect(response.body.device).toHaveProperty('name');
      expect(response.body.device).toHaveProperty('cpu_cores');
      expect(response.body.device).toHaveProperty('total_memory_gb');

      // Thresholds structure
      expect(response.body.thresholds).toHaveProperty('cpu');
      expect(response.body.thresholds).toHaveProperty('ram');
      expect(response.body.thresholds).toHaveProperty('gpu');
      expect(response.body.thresholds).toHaveProperty('storage');
      expect(response.body.thresholds).toHaveProperty('temperature');

      // Each threshold has warning and critical
      expect(response.body.thresholds.cpu).toHaveProperty('warning');
      expect(response.body.thresholds.cpu).toHaveProperty('critical');
    });

    test('should detect Jetson AGX Orin and return appropriate thresholds', async () => {
      fs.promises.readFile.mockImplementation((path) => {
        if (path === '/etc/nv_tegra_release') return Promise.resolve('# R35 (release), REVISION: 4.1, TEGRA_VERSION=...');
        if (path === '/proc/device-tree/model') return Promise.resolve('NVIDIA Jetson AGX Orin\0');
        return Promise.reject(new Error('ENOENT'));
      });

      const response = await request(app).get('/api/system/thresholds');

      expect(response.status).toBe(200);
      expect(response.body.device.type).toBe('jetson_agx_orin');
      expect(response.body.device.name).toBe('NVIDIA Jetson AGX Orin');
      // AGX Orin has conservative temperature thresholds (throttles at ~85°C)
      expect(response.body.thresholds.temperature.warning).toBe(65);
      expect(response.body.thresholds.temperature.critical).toBe(80);
    });

    test('should fall back to generic thresholds when device detection fails', async () => {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const response = await request(app).get('/api/system/thresholds');

      expect(response.status).toBe(200);
      expect(response.body.device.type).toBe('generic');
      // Generic thresholds are more lenient
      expect(response.body.thresholds.cpu.warning).toBe(80);
      expect(response.body.thresholds.cpu.critical).toBe(95);
    });
  });

  // ============================================================================
  // POST /api/system/reload-config
  // ============================================================================
  describe('POST /api/system/reload-config', () => {
    test('should return success with reloaded items', async () => {
      const response = await request(app).post('/api/system/reload-config');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('reloaded');
      expect(response.body).toHaveProperty('note');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.reloaded)).toBe(true);
      expect(response.body.reloaded).toContain('rate_limits');
      expect(response.body.reloaded).toContain('logging_config');
    });

    test('should log the reload request', async () => {
      const logger = require('../../src/utils/logger');

      await request(app).post('/api/system/reload-config');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Configuration reload requested')
      );
    });
  });
});
