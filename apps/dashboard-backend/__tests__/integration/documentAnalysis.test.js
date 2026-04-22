/**
 * Integration tests for POST /api/document-analysis/analyze and /extract
 *
 * Covers validation, chat-existence guard, extraction failure surfacing,
 * SSE happy path (job_started event with attachment metadata + truncation
 * flag), and the standalone /extract endpoint.
 *
 * External collaborators (MinIO, Document Indexer HTTP, LLM queue) are
 * mocked — the goal is to exercise route wiring, auth, and the DB
 * contract (chat_conversations / chat_messages / chat_attachments).
 */

const request = require('supertest');
const {
  generateTestToken,
  setupAuthMocks,
  mockUser,
  testRequiresAuth,
} = require('../helpers/authMock');

// Mock all external I/O before the app is required.
jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/documents/minioService', () => ({
  sanitizeFilename: jest.fn((name) => name),
  uploadObject: jest.fn().mockResolvedValue(undefined),
  removeObject: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/documents/extractionService', () => ({
  extractFromBuffer: jest.fn(),
}));
jest.mock('../../src/services/llm/llmQueueService', () => ({
  enqueue: jest.fn(),
  subscribeToJob: jest.fn(() => () => {}),
}));
jest.mock('../../src/services/llm/llmJobService', () => ({}));

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const minioService = require('../../src/services/documents/minioService');
const extractionService = require('../../src/services/documents/extractionService');
const llmQueueService = require('../../src/services/llm/llmQueueService');
const { app } = require('../../src/server');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

/**
 * Installs a db.query mock that satisfies:
 *   - auth middleware (blacklist/session/activity/user lookup)
 *   - chat_conversations existence (configurable via opts.chatExists)
 *   - chat_messages INSERT ... RETURNING id
 *   - chat_attachments INSERT and UPDATE
 */
function setupAnalyzeDb({ chatExists = true, messageId = 501 } = {}) {
  db.query.mockImplementation((sql) => {
    if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
    if (sql.includes('active_sessions') && sql.includes('SELECT'))
      return Promise.resolve({ rows: [{ id: 1 }] });
    if (sql.includes('update_session_activity')) return Promise.resolve({ rows: [] });
    if (sql.includes('admin_users')) return Promise.resolve({ rows: [mockUser] });
    if (sql.includes('FROM chat_conversations'))
      return Promise.resolve({ rows: chatExists ? [{ id: 42 }] : [] });
    if (sql.includes('INSERT INTO chat_messages'))
      return Promise.resolve({ rows: [{ id: messageId }] });
    if (sql.includes('chat_attachments')) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });
}

describe('POST /api/document-analysis/analyze', () => {
  let token;

  beforeAll(() => {
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    minioService.sanitizeFilename.mockImplementation((n) => n);
    minioService.uploadObject.mockResolvedValue(undefined);
    extractionService.extractFromBuffer.mockReset();
    llmQueueService.enqueue.mockReset();
    llmQueueService.subscribeToJob.mockReset();
  });

  testRequiresAuth(app, 'post', '/api/document-analysis/analyze');

  test('returns 400 when no file attached', async () => {
    setupAuthMocks(db);
    const response = await request(app)
      .post('/api/document-analysis/analyze')
      .set('Authorization', `Bearer ${token}`)
      .field('conversation_id', '42');

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/Keine Datei hochgeladen/);
  });

  test('returns 400 when conversation_id is missing', async () => {
    setupAuthMocks(db);
    const response = await request(app)
      .post('/api/document-analysis/analyze')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('dummy'), 'doc.txt');

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/conversation_id ist erforderlich/);
  });

  test('returns 400 when conversation_id is not a positive integer', async () => {
    setupAuthMocks(db);
    const response = await request(app)
      .post('/api/document-analysis/analyze')
      .set('Authorization', `Bearer ${token}`)
      .field('conversation_id', 'not-a-number')
      .attach('file', Buffer.from('dummy'), 'doc.txt');

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/Ungültige conversation_id/);
  });

  test('returns 400 when chat is not found or soft-deleted', async () => {
    setupAnalyzeDb({ chatExists: false });
    const response = await request(app)
      .post('/api/document-analysis/analyze')
      .set('Authorization', `Bearer ${token}`)
      .field('conversation_id', '999')
      .attach('file', Buffer.from('hello'), 'doc.txt');

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/Chat nicht gefunden/);
  });

  test('returns 400 for unsupported file extensions (multer fileFilter)', async () => {
    setupAnalyzeDb();
    const response = await request(app)
      .post('/api/document-analysis/analyze')
      .set('Authorization', `Bearer ${token}`)
      .field('conversation_id', '42')
      .attach('file', Buffer.from('payload'), 'evil.exe');

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/nicht unterstützt/);
  });

  test('returns 503 when text extraction fails and marks attachment failed', async () => {
    setupAnalyzeDb();
    extractionService.extractFromBuffer.mockRejectedValue(new Error('OCR exploded'));

    const response = await request(app)
      .post('/api/document-analysis/analyze')
      .set('Authorization', `Bearer ${token}`)
      .field('conversation_id', '42')
      .attach('file', Buffer.from('hello'), 'doc.txt');

    expect(response.status).toBe(503);
    expect(response.body.error.message).toMatch(/Textextraktion fehlgeschlagen/);

    const updates = db.query.mock.calls.filter(([sql]) =>
      sql.includes("extraction_status = 'failed'")
    );
    expect(updates).toHaveLength(1);
  });

  test('happy path: enqueues LLM job and streams job_started SSE event', async () => {
    setupAnalyzeDb({ messageId: 777 });
    extractionService.extractFromBuffer.mockResolvedValue({
      text: 'extracted body text',
      metadata: { pages: 1, ocr_used: false },
    });
    llmQueueService.enqueue.mockResolvedValue({
      jobId: 'job-xyz',
      messageId: 888,
      queuePosition: 1,
    });
    // Immediately complete the job so supertest receives a terminated stream.
    llmQueueService.subscribeToJob.mockImplementation((jobId, cb) => {
      process.nextTick(() => cb({ type: 'token', data: 'hi', done: false }));
      process.nextTick(() => cb({ type: 'done', done: true }));
      return () => {};
    });

    const response = await request(app)
      .post('/api/document-analysis/analyze')
      .set('Authorization', `Bearer ${token}`)
      .field('conversation_id', '42')
      .field('prompt', 'Summarize please')
      .attach('file', Buffer.from('hello'), 'doc.txt');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/event-stream/);

    // First SSE event carries the attachment metadata + userMessageId.
    const firstEvent = response.text
      .split('\n\n')
      .map((chunk) => chunk.replace(/^data: /, ''))
      .filter(Boolean)[0];
    const parsed = JSON.parse(firstEvent);
    expect(parsed).toMatchObject({
      type: 'job_started',
      jobId: 'job-xyz',
      messageId: 888,
      userMessageId: 777,
      queuePosition: 1,
      attachment: {
        filename: 'doc.txt',
        extractedChars: 'extracted body text'.length,
        truncated: false,
      },
    });

    expect(llmQueueService.enqueue).toHaveBeenCalledTimes(1);
    const [chatId, jobType, requestData] = llmQueueService.enqueue.mock.calls[0];
    expect(chatId).toBe(42);
    expect(jobType).toBe('chat');
    expect(requestData.messages[0].content).toContain('Frage des Benutzers: Summarize please');
    expect(requestData.stream).toBe(true);
  });

  test('marks attachment truncated=true when extracted text exceeds 30k chars', async () => {
    setupAnalyzeDb();
    const longText = 'x'.repeat(30001);
    extractionService.extractFromBuffer.mockResolvedValue({
      text: longText,
      metadata: {},
    });
    llmQueueService.enqueue.mockResolvedValue({
      jobId: 'job-long',
      messageId: 1,
      queuePosition: 1,
    });
    llmQueueService.subscribeToJob.mockImplementation((_id, cb) => {
      process.nextTick(() => cb({ type: 'done', done: true }));
      return () => {};
    });

    const response = await request(app)
      .post('/api/document-analysis/analyze')
      .set('Authorization', `Bearer ${token}`)
      .field('conversation_id', '42')
      .attach('file', Buffer.from('hello'), 'doc.txt');

    expect(response.status).toBe(200);
    const firstChunk = response.text.split('\n\n').filter(Boolean)[0].replace(/^data: /, '');
    const payload = JSON.parse(firstChunk);
    expect(payload.attachment.truncated).toBe(true);
    expect(payload.attachment.originalChars).toBe(longText.length);

    // The enqueued prompt must include the truncation marker, not the full text.
    const requestData = llmQueueService.enqueue.mock.calls[0][2];
    expect(requestData.messages[0].content).toContain('[... Text gekürzt, da zu lang ...]');
  });
});

describe('POST /api/document-analysis/extract', () => {
  let token;

  beforeAll(() => {
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    setupAuthMocks(db);
    minioService.sanitizeFilename.mockImplementation((n) => n);
    extractionService.extractFromBuffer.mockReset();
  });

  testRequiresAuth(app, 'post', '/api/document-analysis/extract');

  test('returns 400 when no file attached', async () => {
    const response = await request(app)
      .post('/api/document-analysis/extract')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/Keine Datei hochgeladen/);
  });

  test('returns 400 for unsupported file type', async () => {
    const response = await request(app)
      .post('/api/document-analysis/extract')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('payload'), 'evil.exe');

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/nicht unterstützt/);
  });

  test('returns extracted text + metadata on success', async () => {
    extractionService.extractFromBuffer.mockResolvedValue({
      text: 'plain text',
      metadata: { pages: 3, ocr_used: true },
    });

    const response = await request(app)
      .post('/api/document-analysis/extract')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hello'), 'doc.txt');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      text: 'plain text',
      filename: 'doc.txt',
      metadata: { pages: 3, ocr_used: true },
    });
    expect(response.body.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  test('surfaces extractionService errors to the client', async () => {
    extractionService.extractFromBuffer.mockRejectedValue(new Error('indexer down'));

    const response = await request(app)
      .post('/api/document-analysis/extract')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hello'), 'doc.txt');

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error');
  });
});
