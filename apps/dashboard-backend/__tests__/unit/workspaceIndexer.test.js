/**
 * Unit tests for the workspace RAG indexer (Plan 008 Schritt 13).
 *
 * MinIO, the DB and documentService are mocked so we can assert the load-bearing
 * behaviours: INSERT-first-THEN-upload ordering (race guard against the 30s
 * indexer scan), the space_id-NULL skip, and the delete-old-version-on-rewrite
 * cleanup.
 */

const crypto = require('crypto');

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/documents/minioService', () => ({
  sanitizeFilename: jest.fn(name => name),
  uploadObject: jest.fn().mockResolvedValue(undefined),
  MINIO_BUCKET: 'documents',
}));
jest.mock('../../src/services/documents/documentService', () => ({
  deleteDocument: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('fs', () => ({
  promises: { stat: jest.fn(), readFile: jest.fn(), readdir: jest.fn() },
}));

const fs = require('fs').promises;
const db = require('../../src/database');
const minioService = require('../../src/services/documents/minioService');
const documentService = require('../../src/services/documents/documentService');
const { indexWorkspaceFile } = require('../../src/services/agents/workspaceIndexer');

const WORKSPACE = { space_id: 'space-1', slug: 'ws', host_path: '/data/ws' };
const BUFFER = Buffer.from('hallo welt');
const HASH = crypto.createHash('sha256').update(BUFFER).digest('hex');

function mockFile(buffer = BUFFER) {
  fs.stat.mockResolvedValue({ isFile: () => true, size: buffer.length });
  fs.readFile.mockResolvedValue(buffer);
}

beforeEach(() => {
  jest.clearAllMocks();
  minioService.uploadObject.mockResolvedValue(undefined);
  documentService.deleteDocument.mockResolvedValue(undefined);
  minioService.sanitizeFilename.mockImplementation(name => name);
});

test('skips (never indexes) when the workspace has no space_id', async () => {
  const res = await indexWorkspaceFile({
    workspace: { ...WORKSPACE, space_id: null },
    relPath: 'notiz.md',
    absPath: '/data/ws/notiz.md',
  });
  expect(res).toEqual({ indexed: false, skipped: 'no-space' });
  expect(db.query).not.toHaveBeenCalled();
  expect(minioService.uploadObject).not.toHaveBeenCalled();
});

test('skips unsupported (binary/non-text) extensions', async () => {
  const res = await indexWorkspaceFile({
    workspace: WORKSPACE,
    relPath: 'bild.png',
    absPath: '/data/ws/bild.png',
  });
  expect(res).toEqual({ indexed: false, skipped: 'unsupported-extension' });
  expect(db.query).not.toHaveBeenCalled();
});

test('INSERTs the scoped documents row BEFORE uploading to MinIO (race guard)', async () => {
  mockFile();
  const order = [];
  db.query.mockImplementation(async sql => {
    if (/SELECT id, content_hash/.test(sql)) {
      order.push('select');
      return { rows: [] };
    }
    if (/INSERT INTO documents/.test(sql)) {
      order.push('insert');
      return { rows: [{ id: 'new-doc' }] };
    }
    return { rows: [] };
  });
  minioService.uploadObject.mockImplementation(async () => {
    order.push('upload');
  });

  const res = await indexWorkspaceFile({
    workspace: WORKSPACE,
    relPath: 'notiz.md',
    absPath: '/data/ws/notiz.md',
  });

  expect(res.indexed).toBe(true);
  expect(order).toEqual(['select', 'insert', 'upload']);
  // scoped insert carries the workspace space_id + pending status
  const insertCall = db.query.mock.calls.find(([sql]) => /INSERT INTO documents/.test(sql));
  expect(insertCall[1]).toContain('space-1');
  expect(insertCall[0]).toMatch(/'pending'/);
  expect(documentService.deleteDocument).not.toHaveBeenCalled();
});

test('on re-write (new hash) deletes the previous version so no stale chunks remain', async () => {
  mockFile();
  const order = [];
  db.query.mockImplementation(async sql => {
    if (/SELECT id, content_hash/.test(sql)) {
      order.push('select');
      return {
        rows: [{ id: 'old-doc', content_hash: 'stale-hash', file_path: 'workspace/space-1/old' }],
      };
    }
    if (/INSERT INTO documents/.test(sql)) {
      order.push('insert');
      return { rows: [{ id: 'new-doc' }] };
    }
    return { rows: [] };
  });
  minioService.uploadObject.mockImplementation(async () => order.push('upload'));
  documentService.deleteDocument.mockImplementation(async () => order.push('delete'));

  const res = await indexWorkspaceFile({
    workspace: WORKSPACE,
    relPath: 'notiz.md',
    absPath: '/data/ws/notiz.md',
  });

  expect(res.indexed).toBe(true);
  // old version removed only AFTER the new row + object are in place
  expect(order).toEqual(['select', 'insert', 'upload', 'delete']);
  expect(documentService.deleteDocument).toHaveBeenCalledWith('old-doc', 'workspace/space-1/old');
});

test('skips when content is unchanged (same hash already indexed)', async () => {
  mockFile();
  db.query.mockImplementation(async sql => {
    if (/SELECT id, content_hash/.test(sql)) {
      return { rows: [{ id: 'doc-1', content_hash: HASH, file_path: 'workspace/space-1/x' }] };
    }
    return { rows: [] };
  });

  const res = await indexWorkspaceFile({
    workspace: WORKSPACE,
    relPath: 'notiz.md',
    absPath: '/data/ws/notiz.md',
  });

  expect(res).toEqual({ indexed: false, skipped: 'unchanged', documentId: 'doc-1' });
  expect(minioService.uploadObject).not.toHaveBeenCalled();
  expect(db.query).toHaveBeenCalledTimes(1); // only the lookup SELECT
});

test('duplicate global content (ON CONFLICT DO NOTHING) → no upload, no delete', async () => {
  mockFile();
  db.query.mockImplementation(async sql => {
    if (/SELECT id, content_hash/.test(sql)) {
      return { rows: [] };
    }
    if (/INSERT INTO documents/.test(sql)) {
      return { rows: [] }; // ON CONFLICT DO NOTHING
    }
    return { rows: [] };
  });

  const res = await indexWorkspaceFile({
    workspace: WORKSPACE,
    relPath: 'notiz.md',
    absPath: '/data/ws/notiz.md',
  });

  expect(res).toEqual({ indexed: false, skipped: 'duplicate-content' });
  expect(minioService.uploadObject).not.toHaveBeenCalled();
  expect(documentService.deleteDocument).not.toHaveBeenCalled();
});
