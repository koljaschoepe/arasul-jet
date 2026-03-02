/**
 * Update Service Tests
 *
 * Tests for UpdateService:
 * - compareVersions (pure function)
 * - verifySignature
 * - extractManifest
 * - validateUpdate
 * - createBackup
 * - saveUpdateState / getUpdateState
 * - scanUsbDevices / _findUpdateFiles
 * - applyUpdate orchestration
 * - rollback
 * - waitForServiceHealth
 */

// Mock external dependencies
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

jest.mock('../../src/services/core/docker', () => ({
  getAllServicesStatus: jest.fn(),
}));

const mockExecFile = jest.fn();
jest.mock('child_process', () => ({
  execFile: mockExecFile,
  spawn: jest.fn(),
}));

const mockFs = {
  access: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  stat: jest.fn(),
  rm: jest.fn(),
  readdir: jest.fn(),
  copyFile: jest.fn(),
};

jest.mock('fs', () => ({
  promises: mockFs,
  createWriteStream: jest.fn(() => ({
    close: jest.fn(),
    on: jest.fn(),
  })),
  createReadStream: jest.fn(() => ({
    pipe: jest.fn(),
    on: jest.fn(),
  })),
}));

jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  return {
    ...actualCrypto,
    verify: jest.fn(),
    createHash: jest.fn(() => ({
      update: jest.fn(),
      digest: jest.fn(() => 'abc123hash'),
    })),
  };
});

const crypto = require('crypto');
const db = require('../../src/database');

// Import after mocking — updateService is a singleton instance
const updateService = require('../../src/services/app/updateService');

// promisify(execFile) returns a function — we need to mock it at module level
// The service uses execFileAsync = promisify(execFile)
// Since promisify wraps execFile, we mock execFile's callback behavior
beforeAll(() => {
  mockExecFile.mockImplementation((cmd, args, cb) => {
    if (typeof cb === 'function') {
      cb(null, { stdout: '', stderr: '' });
    }
    return { stdout: '', stderr: '' };
  });
});

describe('UpdateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('');
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.rm.mockResolvedValue(undefined);
    mockFs.copyFile.mockResolvedValue(undefined);
    updateService.updateInProgress = false;
    updateService.currentUpdate = null;
  });

  // =========================================================================
  // compareVersions (pure function)
  // =========================================================================
  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(updateService.compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should return 1 when first version is greater (major)', () => {
      expect(updateService.compareVersions('2.0.0', '1.0.0')).toBe(1);
    });

    it('should return -1 when first version is smaller (major)', () => {
      expect(updateService.compareVersions('1.0.0', '2.0.0')).toBe(-1);
    });

    it('should compare minor versions correctly', () => {
      expect(updateService.compareVersions('1.2.0', '1.1.0')).toBe(1);
      expect(updateService.compareVersions('1.1.0', '1.2.0')).toBe(-1);
    });

    it('should compare patch versions correctly', () => {
      expect(updateService.compareVersions('1.0.2', '1.0.1')).toBe(1);
      expect(updateService.compareVersions('1.0.1', '1.0.2')).toBe(-1);
    });

    it('should handle multi-digit version numbers', () => {
      expect(updateService.compareVersions('1.10.0', '1.9.0')).toBe(1);
      expect(updateService.compareVersions('10.0.0', '9.99.99')).toBe(1);
    });

    it('should throw on invalid version format', () => {
      expect(() => updateService.compareVersions('1.0', '1.0.0')).toThrow(/Invalid version format/);
      expect(() => updateService.compareVersions('abc', '1.0.0')).toThrow(/Invalid version format/);
      expect(() => updateService.compareVersions('1.0.0', 'v1.0.0')).toThrow(/Invalid version format/);
    });

    it('should handle equal complex versions', () => {
      expect(updateService.compareVersions('12.34.56', '12.34.56')).toBe(0);
    });
  });

  // =========================================================================
  // verifySignature
  // =========================================================================
  describe('verifySignature', () => {
    const updatePath = '/tmp/update.araupdate';
    const sigPath = '/tmp/update.araupdate.sig';

    it('should return invalid when public key not found', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await updateService.verifySignature(updatePath, sigPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Public key not found');
    });

    it('should return invalid for bad public key format', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValueOnce('not a valid PEM key'); // public key

      const result = await updateService.verifySignature(updatePath, sigPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid public key format');
    });

    it('should return invalid when signature file not found', async () => {
      mockFs.access
        .mockResolvedValueOnce(undefined) // public key exists
        .mockRejectedValueOnce(new Error('ENOENT')); // sig not found
      mockFs.readFile.mockResolvedValueOnce('-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----');

      const result = await updateService.verifySignature(updatePath, sigPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Signature file not found');
    });

    it('should return invalid for empty signature file', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile
        .mockResolvedValueOnce('-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----') // public key
        .mockResolvedValueOnce(Buffer.alloc(0)); // empty signature

      const result = await updateService.verifySignature(updatePath, sigPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Empty signature');
    });

    it('should return invalid for empty update file', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile
        .mockResolvedValueOnce('-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----')
        .mockResolvedValueOnce(Buffer.from('sig-data')); // signature
      mockFs.stat.mockResolvedValueOnce({ size: 0 }); // empty update file

      const result = await updateService.verifySignature(updatePath, sigPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Empty update file');
    });

    it('should return valid when crypto.verify returns true', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile
        .mockResolvedValueOnce('-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----')
        .mockResolvedValueOnce(Buffer.from('signature-bytes'))
        .mockResolvedValueOnce(Buffer.from('update-file-data'));
      mockFs.stat.mockResolvedValueOnce({ size: 1024 });
      crypto.verify.mockReturnValue(true);
      db.query.mockResolvedValue({ rows: [] });

      const result = await updateService.verifySignature(updatePath, sigPath);

      expect(result.valid).toBe(true);
      expect(result.hash).toBe('abc123hash');
    });

    it('should return invalid when crypto.verify returns false', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile
        .mockResolvedValueOnce('-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----')
        .mockResolvedValueOnce(Buffer.from('bad-sig'))
        .mockResolvedValueOnce(Buffer.from('update-data'));
      mockFs.stat.mockResolvedValueOnce({ size: 1024 });
      crypto.verify.mockReturnValue(false);
      db.query.mockResolvedValue({ rows: [] });

      const result = await updateService.verifySignature(updatePath, sigPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });
  });

  // =========================================================================
  // saveUpdateState / getUpdateState
  // =========================================================================
  describe('saveUpdateState / getUpdateState', () => {
    it('should save state to file', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT')); // No existing state

      await updateService.saveUpdateState({ status: 'in_progress', currentStep: 'backup' });

      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('update_state.json'),
        expect.stringContaining('"status": "in_progress"')
      );
    });

    it('should merge with existing state', async () => {
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({ status: 'in_progress', version: '1.1.0' })
      );

      await updateService.saveUpdateState({ currentStep: 'migrations' });

      const writeCall = mockFs.writeFile.mock.calls[0];
      const written = JSON.parse(writeCall[1]);
      expect(written.status).toBe('in_progress');
      expect(written.version).toBe('1.1.0');
      expect(written.currentStep).toBe('migrations');
    });

    it('should return null when no state file exists', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const state = await updateService.getUpdateState();

      expect(state).toBeNull();
    });

    it('should return parsed state', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ status: 'completed', version: '1.2.0' })
      );

      const state = await updateService.getUpdateState();

      expect(state.status).toBe('completed');
      expect(state.version).toBe('1.2.0');
    });
  });

  // =========================================================================
  // scanUsbDevices
  // =========================================================================
  describe('scanUsbDevices', () => {
    it('should return empty array when no media/mnt dirs exist', async () => {
      mockFs.readdir.mockRejectedValue(new Error('ENOENT'));

      const results = await updateService.scanUsbDevices();

      expect(results).toEqual([]);
    });

    it('should find .araupdate files on USB', async () => {
      // /media readdir
      mockFs.readdir
        .mockResolvedValueOnce(['usb-drive']) // /media entries
        .mockResolvedValueOnce([
          { name: 'update-v1.1.0.araupdate', isFile: () => true, isDirectory: () => false },
          { name: 'readme.txt', isFile: () => true, isDirectory: () => false },
        ]) // /media/usb-drive entries (withFileTypes)
        .mockRejectedValueOnce(new Error('ENOENT')); // /mnt

      mockFs.stat
        .mockResolvedValueOnce({ isDirectory: () => true }) // /media/usb-drive is dir
        .mockResolvedValueOnce({ size: 52428800, mtime: new Date('2025-06-01') }); // file stat

      const results = await updateService.scanUsbDevices();

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('update-v1.1.0.araupdate');
      expect(results[0].device).toBe('usb-drive');
    });

    it('should skip non-directory entries', async () => {
      mockFs.readdir.mockResolvedValueOnce(['file.txt']).mockRejectedValueOnce(new Error('ENOENT'));
      mockFs.stat.mockResolvedValueOnce({ isDirectory: () => false });

      const results = await updateService.scanUsbDevices();

      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // _findUpdateFiles
  // =========================================================================
  describe('_findUpdateFiles', () => {
    it('should return empty at depth 0', async () => {
      const files = await updateService._findUpdateFiles('/some/dir', 0);
      expect(files).toEqual([]);
    });

    it('should find .araupdate files', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'update.araupdate', isFile: () => true, isDirectory: () => false },
        { name: 'other.zip', isFile: () => true, isDirectory: () => false },
      ]);

      const files = await updateService._findUpdateFiles('/media/usb', 1);

      expect(files).toEqual(['/media/usb/update.araupdate']);
    });

    it('should recurse into subdirectories', async () => {
      mockFs.readdir
        .mockResolvedValueOnce([
          { name: 'subdir', isFile: () => false, isDirectory: () => true },
        ]) // /media/usb
        .mockResolvedValueOnce([
          { name: 'nested.araupdate', isFile: () => true, isDirectory: () => false },
        ]); // /media/usb/subdir

      const files = await updateService._findUpdateFiles('/media/usb', 2);

      expect(files).toEqual(['/media/usb/subdir/nested.araupdate']);
    });
  });

  // =========================================================================
  // applyUpdate
  // =========================================================================
  describe('applyUpdate', () => {
    it('should reject if update already in progress', async () => {
      updateService.updateInProgress = true;

      const result = await updateService.applyUpdate('/tmp/update.araupdate');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Update already in progress');
    });

    it('should reject if validation fails', async () => {
      // Mock validateUpdate to fail
      const origValidate = updateService.validateUpdate;
      updateService.validateUpdate = jest.fn().mockResolvedValue({
        valid: false,
        error: 'Invalid signature',
      });

      // saveUpdateState needs fs mocks
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await updateService.applyUpdate('/tmp/update.araupdate');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
      expect(updateService.updateInProgress).toBe(false);

      updateService.validateUpdate = origValidate;
    });
  });

  // =========================================================================
  // checkAllServicesHealthy
  // =========================================================================
  describe('checkAllServicesHealthy', () => {
    const dockerService = require('../../src/services/core/docker');

    it('should return true when all critical services are healthy', async () => {
      dockerService.getAllServicesStatus.mockResolvedValue({
        llm: { status: 'healthy' },
        embeddings: { status: 'healthy' },
        postgres: { status: 'healthy' },
        minio: { status: 'healthy' },
        dashboard_backend: { status: 'healthy' },
      });

      const result = await updateService.checkAllServicesHealthy();

      expect(result).toBe(true);
    });

    it('should return false when a critical service is unhealthy', async () => {
      dockerService.getAllServicesStatus.mockResolvedValue({
        llm: { status: 'unhealthy' },
        embeddings: { status: 'healthy' },
        postgres: { status: 'healthy' },
        minio: { status: 'healthy' },
        dashboard_backend: { status: 'healthy' },
      });

      const result = await updateService.checkAllServicesHealthy();

      expect(result).toBe(false);
    });

    it('should return false when a critical service is missing', async () => {
      dockerService.getAllServicesStatus.mockResolvedValue({
        llm: { status: 'healthy' },
        // postgres missing
        minio: { status: 'healthy' },
      });

      const result = await updateService.checkAllServicesHealthy();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      dockerService.getAllServicesStatus.mockRejectedValue(new Error('Docker down'));

      const result = await updateService.checkAllServicesHealthy();

      expect(result).toBe(false);
    });
  });
});
