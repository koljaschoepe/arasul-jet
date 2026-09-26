/**
 * Unit tests for External API Routes
 *
 * Tests all external API endpoints:
 * - POST /api/v1/external/llm/chat - LLM chat via queue
 * - GET /api/v1/external/llm/job/:jobId - Get job status
 * - GET /api/v1/external/llm/queue - Get queue status
 * - GET /api/v1/external/models - Get available models
 * - POST /api/v1/external/api-keys - Create API key (JWT auth)
 * - GET /api/v1/external/api-keys - List API keys (JWT auth)
 * - DELETE /api/v1/external/api-keys/:keyId - Revoke API key (JWT auth)
 */

const request = require('supertest');

// Mock database module
jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock llmQueueService
jest.mock('../../src/services/llm/llmQueueService', () => ({
  enqueue: jest.fn(),
  getQueueStatus: jest.fn()
}));

// Mock llmJobService
jest.mock('../../src/services/llm/llmJobService', () => ({
  getJob: jest.fn()
}));

// Mock modelService
jest.mock('../../src/services/llm/modelService', () => ({
  getInstalledModels: jest.fn(),
  getDefaultModel: jest.fn(),
  getLoadedModel: jest.fn()
}));

// Das Protokoll der Modellaufrufe (J35) hat seinen eigenen Test
// (kiProtokoll.test.js). Hier reicht es durch und merkt sich, was es bekam.
jest.mock('../../src/services/app/kiProtokoll', () => ({
  einreicherAus: jest.requireActual('../../src/services/app/kiProtokoll').einreicherAus,
  einreihen: jest.fn((_kontext, fn) => fn()),
  aufrufZumAuftrag: jest.fn()
}));

jest.mock('../../src/services/documents/extractionService', () => ({
  extractFromBuffer: jest.fn()
}));

// Mock apiKeyAuth middleware
jest.mock('../../src/middleware/apiKeyAuth', () => ({
  requireApiKey: jest.fn((req, res, next) => {
    if (req.headers['x-api-key'] === 'valid-api-key') {
      req.apiKey = {
        id: 1,
        userId: 1,
        name: 'Test API Key',
        allowed_endpoints: ['llm:chat', 'llm:status', 'document:extract']
      };
      next();
    } else if (req.headers['x-api-key'] === 'app-api-key') {
      // Der Schluessel einer App (C4): derselbe Besitzer, dazu App und Stand.
      req.apiKey = {
        id: 2,
        userId: 1,
        name: 'app faktum/live',
        appId: 'faktum',
        stand: 'live',
        allowed_endpoints: ['llm:chat', 'llm:status', 'document:extract']
      };
      next();
    } else {
      res.status(401).json({ error: 'Invalid API key' });
    }
  }),
  requireEndpoint: jest.fn((endpoint) => (req, res, next) => {
    if (req.apiKey && req.apiKey.allowed_endpoints.includes(endpoint)) {
      next();
    } else {
      res.status(403).json({ error: 'Endpoint not allowed' });
    }
  }),
  generateApiKey: jest.fn()
}));

const db = require('../../src/database');
const kiProtokoll = require('../../src/services/app/kiProtokoll');
const extractionService = require('../../src/services/documents/extractionService');
const llmQueueService = require('../../src/services/llm/llmQueueService');
const llmJobService = require('../../src/services/llm/llmJobService');
const modelService = require('../../src/services/llm/modelService');
const { generateApiKey } = require('../../src/middleware/apiKeyAuth');
const { app } = require('../../src/server');
const { generateTestToken } = require('../helpers/authMock');
const {
  ExtractStructuredAntwort,
  ExtractStructuredFehlschlag,
  ExtractStructuredLaeuft,
  ExtractStructuredAbgeholt
} = require('../../src/schemas/externalApi');

// Ein PNG mit einem Pixel, als Base64 -- genug fuer die Pruefung des Formats.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Der Katalog fuer die Wahl des Bildmodells: llava-phi3 und gemma4 lesen Bilder.
 * Die Reihenfolge ist die, die Postgres mit `bildvorgabe` (Migration 188) liefert:
 * gemma4:e4b zuerst.
 */
function katalogMitBildmodellen(query, params) {
  if (query.includes('llm_installed_models')) {
    return Promise.resolve({ rows: [{ id: 'gemma4:e4b' }, { id: 'llava-phi3' }] });
  }
  if (query.includes('supports_vision_input FROM llm_model_catalog')) {
    const liest = ['llava-phi3', 'gemma4:e4b'].includes(params[0]);
    return Promise.resolve({ rows: [{ supports_vision_input: liest }] });
  }
  return Promise.resolve({ rows: [] });
}

// Mock user and session for auth
const mockUser = { id: 1, username: 'admin', role: 'admin', is_active: true };
const mockSession = { user_id: 1, token_hash: 'hash' };

/**
 * Setup database mocks that handle both auth middleware queries
 * and custom route queries.
 */
function setupMocksWithAuth(customHandler) {
  db.query.mockImplementation((query, params) => {
    // Auth middleware queries
    if (query.includes('token_blacklist')) {
      return Promise.resolve({ rows: [] });
    }
    if (query.includes('active_sessions') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [mockSession] });
    }
    if (query.includes('update_session_activity')) {
      return Promise.resolve({ rows: [] });
    }
    if (query.includes('admin_users')) {
      return Promise.resolve({ rows: [mockUser] });
    }
    // Custom query handler
    if (customHandler) {
      return customHandler(query, params);
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('External API Routes', () => {
  let jwtToken;
  const apiKey = 'valid-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    jwtToken = generateTestToken();
  });

  // ============================================================================
  // POST /api/v1/external/llm/chat
  // ============================================================================
  describe('POST /api/v1/external/llm/chat', () => {
    test('should return 401 without API key', async () => {
      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .send({ prompt: 'Hello' });

      expect(response.status).toBe(401);
    });

    test('rechnet das Modell nach der Wartezeit noch: 202 mit llm/job als Weg (J35)', async () => {
      llmQueueService.enqueue.mockResolvedValueOnce({ jobId: 'job-w', model: 'm' });
      llmJobService.getJob.mockResolvedValue({ status: 'pending' });

      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Hallo', timeout_seconds: 1 });
      llmJobService.getJob.mockReset();

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        success: false,
        status: 'laeuft',
        job_id: 'job-w',
        abholen: 'llm/job/job-w'
      });
    });

    test('should return 400 if prompt is missing', async () => {
      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('prompt');
    });

    test('should enqueue job and return immediately with wait_for_result=false', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 123 }] });
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-uuid',
        messageId: 'msg-uuid',
        queuePosition: 1,
        model: 'qwen3:14b-q8'
      });

      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Hello', wait_for_result: false });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.job_id).toBe('job-uuid');
      expect(response.body.status).toBe('pending');
    });

    test('should return result when wait_for_result=true and job completes', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 123 }] });
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-uuid',
        messageId: 'msg-uuid',
        queuePosition: 0,
        model: 'qwen3:14b-q8'
      });
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-uuid',
        user_id: 1,
        status: 'completed',
        content: 'AI response here',
        thinking: null
      });

      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Hello', wait_for_result: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.response).toBe('AI response here');
    });

    test('should accept optional parameters', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 123 }] });
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-uuid',
        messageId: 'msg-uuid',
        queuePosition: 0,
        model: 'custom-model'
      });
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-uuid',
        user_id: 1,
        status: 'completed',
        content: 'Response',
        thinking: 'Thinking process'
      });

      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({
          prompt: 'Hello',
          model: 'custom-model',
          temperature: 0.5,
          max_tokens: 1024,
          thinking: true
        });

      expect(response.status).toBe(200);
      expect(llmQueueService.enqueue).toHaveBeenCalledWith(
        expect.any(Number),
        'chat',
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 1024,
          thinking: true
        }),
        expect.objectContaining({
          model: 'custom-model'
        })
      );
    });
  });

  // ============================================================================
  // POST /api/v1/external/llm/chat mit Bildern (J35)
  // ============================================================================
  describe('POST /api/v1/external/llm/chat mit images', () => {
    beforeEach(() => {
      db.query.mockImplementation(katalogMitBildmodellen);
      llmQueueService.enqueue.mockResolvedValue({ jobId: 'job-b', queuePosition: 1 });
    });

    test('ohne model nimmt das Geraet sein Bildmodell, das Bild geht in den Auftrag', async () => {
      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({
          prompt: 'Was steht auf der Quittung?',
          images: [`data:image/png;base64,${PNG}`],
          wait_for_result: false
        });

      expect(response.status).toBe(200);
      expect(llmQueueService.enqueue).toHaveBeenCalledWith(
        1,
        'chat',
        expect.objectContaining({ images: [PNG] }),
        expect.objectContaining({ model: 'gemma4:e4b' })
      );
    });

    test('die Bildvorgabe steht in der Rangfolge vor der Aufgabe vision', async () => {
      await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Was?', images: [PNG], wait_for_result: false });

      const sql = db.query.mock.calls
        .map(([q]) => q)
        .find(q => q.includes('llm_installed_models') && q.includes('ORDER BY'));
      const rang = sql.slice(sql.indexOf('ORDER BY'));
      expect(rang.indexOf('c.bildvorgabe DESC')).toBeGreaterThan(-1);
      expect(rang.indexOf('c.bildvorgabe DESC')).toBeLessThan(rang.indexOf("c.task = 'vision'"));
    });

    test('ein genanntes Bildmodell bleibt', async () => {
      await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Was?', images: [PNG], model: 'llava-phi3', wait_for_result: false });

      expect(llmQueueService.enqueue).toHaveBeenCalledWith(
        1,
        'chat',
        expect.any(Object),
        expect.objectContaining({ model: 'llava-phi3' })
      );
    });

    test('ein Textmodell wird mit 400 abgewiesen, statt das Bild fallen zu lassen', async () => {
      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Was?', images: [PNG], model: 'qwen3.8:27b-q4_K_M' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/liest keine Bilder/);
      expect(response.body.error.message).toMatch(/llava-phi3/);
      expect(llmQueueService.enqueue).not.toHaveBeenCalled();
    });

    test('ohne Bildmodell am Geraet: 503', async () => {
      db.query.mockImplementation(() => Promise.resolve({ rows: [] }));
      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Was?', images: [PNG] });

      expect(response.status).toBe(503);
      expect(llmQueueService.enqueue).not.toHaveBeenCalled();
    });

    test('nur PNG und JPEG', async () => {
      const gif = Buffer.from('GIF89a......').toString('base64');
      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Was?', images: [gif] });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/PNG oder JPEG/);
    });

    test('ohne images bleibt der Auftrag ohne Bilder', async () => {
      await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Hallo', wait_for_result: false });

      expect(llmQueueService.enqueue.mock.calls[0][2]).not.toHaveProperty('images');
    });
  });

  // ============================================================================
  // POST /api/v1/external/document/extract-structured (J35: im Protokoll)
  // ============================================================================
  describe('POST /api/v1/external/document/extract-structured', () => {
    test('der Aufruf steht im Protokoll: Weg, Mensch, Datei ohne Namen', async () => {
      extractionService.extractFromBuffer.mockResolvedValueOnce({
        text: 'Rechnung 12 EUR',
        metadata: {}
      });
      llmQueueService.enqueue.mockResolvedValueOnce({ jobId: 'job-s', model: 'gemma4:e4b' });
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-s',
        status: 'completed',
        content: '{"betrag": 12}'
      });

      const response = await request(app)
        .post('/api/v1/external/document/extract-structured')
        .set('X-API-Key', apiKey)
        .set('X-Arasul-User', 'anna')
        .field('schema', JSON.stringify({ betrag: 'number' }))
        .attach('file', Buffer.from('%PDF-1.4'), 'Rechnung.pdf');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ betrag: 12 });
      // Die Antwort ist genau die Form, die der Kontrakt nennt (J35).
      expect(ExtractStructuredAntwort.safeParse(response.body).success).toBe(true);
      expect(kiProtokoll.einreihen).toHaveBeenCalledWith(
        expect.objectContaining({
          endpunkt: 'document/extract-structured',
          einreicher: 'anna',
          datei: expect.objectContaining({ size: 8 })
        }),
        expect.any(Function)
      );
    });

    test('eine Liste ist kein Objekt: data ist null, die Antwort steht in raw_response', async () => {
      extractionService.extractFromBuffer.mockResolvedValueOnce({ text: 'x', metadata: {} });
      llmQueueService.enqueue.mockResolvedValueOnce({ jobId: 'job-l', model: 'gemma4:e4b' });
      llmJobService.getJob.mockResolvedValueOnce({ status: 'completed', content: '[1, 2]' });

      const response = await request(app)
        .post('/api/v1/external/document/extract-structured')
        .set('X-API-Key', apiKey)
        .field('schema', '{}')
        .attach('file', Buffer.from('x'), 'a.txt');

      expect(response.body.data).toBeNull();
      expect(response.body.raw_response).toBe('[1, 2]');
      expect(ExtractStructuredAntwort.safeParse(response.body).success).toBe(true);
    });

    test('scheitert das Modell, hat die 500 die Form des Fehlschlags', async () => {
      extractionService.extractFromBuffer.mockResolvedValueOnce({ text: 'x', metadata: {} });
      llmQueueService.enqueue.mockResolvedValueOnce({ jobId: 'job-f', model: 'gemma4:e4b' });
      llmJobService.getJob.mockResolvedValueOnce({ status: 'error', error_message: 'kaputt' });

      const response = await request(app)
        .post('/api/v1/external/document/extract-structured')
        .set('X-API-Key', apiKey)
        .field('schema', '{}')
        .attach('file', Buffer.from('x'), 'a.txt');

      expect(response.status).toBe(500);
      expect(ExtractStructuredFehlschlag.safeParse(response.body).success).toBe(true);
    });

    /**
     * Die App-Bau-Probe vom 26.09.2026: sechs Belege gleichzeitig, einer
     * bekam nach 60 s ein 408, und das Geraet hatte ihn zehn Sekunden spaeter
     * fertig. Rechnet der Auftrag nach der Wartezeit noch, ist das jetzt 202
     * mit dem Weg zum Abholen -- und der Auftrag wird nicht abgebrochen.
     */
    test('rechnet das Modell nach der Wartezeit noch: 202 mit dem Weg zum Abholen', async () => {
      extractionService.extractFromBuffer.mockResolvedValueOnce({
        text: 'Beleg 7 EUR',
        metadata: { ocr_used: true }
      });
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: '0b7c2c1e-0000-4000-8000-000000000001',
        model: 'qwen3.8:27b-q4_K_M'
      });
      llmJobService.getJob.mockResolvedValue({ status: 'processing' });
      llmQueueService.cancelJob = jest.fn(async () => {});

      const response = await request(app)
        .post('/api/v1/external/document/extract-structured')
        .set('X-API-Key', apiKey)
        .field('schema', '{}')
        .field('timeout_seconds', '1')
        .attach('file', Buffer.from('x'), 'beleg.jpg');
      llmJobService.getJob.mockReset();

      expect(response.status).toBe(202);
      expect(ExtractStructuredLaeuft.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        success: false,
        status: 'laeuft',
        job_id: '0b7c2c1e-0000-4000-8000-000000000001',
        abholen: 'document/extract-structured/0b7c2c1e-0000-4000-8000-000000000001',
        extracted_text: 'Beleg 7 EUR',
        filename: 'beleg.jpg',
        model: 'qwen3.8:27b-q4_K_M'
      });
      expect(llmQueueService.cancelJob).not.toHaveBeenCalled();
    });

    test('ohne schema: 400 im Fehler-Umschlag', async () => {
      const response = await request(app)
        .post('/api/v1/external/document/extract-structured')
        .set('X-API-Key', apiKey)
        .attach('file', Buffer.from('x'), 'a.txt');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toMatch(/schema is required/);
    });
  });

  // ============================================================================
  // GET /api/v1/external/document/extract-structured/:jobId (J35: abholen)
  // ============================================================================
  describe('GET /api/v1/external/document/extract-structured/:jobId', () => {
    const JOB = '0b7c2c1e-0000-4000-8000-000000000002';
    const WEG = `/api/v1/external/document/extract-structured/${JOB}`;

    test('fertig: 200 mit data, in der Form, die der Kontrakt nennt', async () => {
      kiProtokoll.aufrufZumAuftrag.mockResolvedValueOnce({ modell: 'gemma4:e4b' });
      llmJobService.getJob.mockResolvedValueOnce({
        id: JOB,
        user_id: '1', // bigint aus pg
        status: 'completed',
        content: '```json\n{"betrag": 7}\n```',
        queued_at: '2026-09-26T09:00:00Z',
        completed_at: '2026-09-26T09:01:10Z'
      });

      const response = await request(app).get(WEG).set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
      expect(ExtractStructuredAbgeholt.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        status: 'fertig',
        data: { betrag: 7 },
        model: 'gemma4:e4b',
        processing_time_ms: 70000
      });
      expect(kiProtokoll.aufrufZumAuftrag).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: JOB, endpunkt: 'document/extract-structured' })
      );
    });

    test('rechnet noch: wieder 202 mit demselben Weg', async () => {
      kiProtokoll.aufrufZumAuftrag.mockResolvedValueOnce({ modell: 'gemma4:e4b' });
      llmJobService.getJob.mockResolvedValueOnce({
        user_id: 1,
        status: 'pending',
        queued_at: new Date().toISOString()
      });

      const response = await request(app).get(WEG).set('X-API-Key', apiKey);

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        success: false,
        status: 'laeuft',
        abholen: `document/extract-structured/${JOB}`
      });
    });

    test('gescheitert: 500 in der Form des Fehlschlags', async () => {
      kiProtokoll.aufrufZumAuftrag.mockResolvedValueOnce({ modell: 'm' });
      llmJobService.getJob.mockResolvedValueOnce({
        user_id: 1,
        status: 'error',
        error_message: 'kaputt',
        queued_at: '2026-09-26T09:00:00Z',
        completed_at: '2026-09-26T09:00:05Z'
      });

      const response = await request(app).get(WEG).set('X-API-Key', apiKey);

      expect(response.status).toBe(500);
      expect(ExtractStructuredFehlschlag.safeParse(response.body).success).toBe(true);
    });

    test('ein Auftrag einer anderen App ist ein 404, und das Geraet sieht gar nicht erst nach', async () => {
      kiProtokoll.aufrufZumAuftrag.mockResolvedValueOnce(null);

      const response = await request(app).get(WEG).set('X-API-Key', apiKey);

      expect(response.status).toBe(404);
      expect(llmJobService.getJob).not.toHaveBeenCalled();
    });

    test('keine Kennung eines Auftrags: 400', async () => {
      const response = await request(app)
        .get('/api/v1/external/document/extract-structured/nicht-da')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(400);
    });
  });

  // ============================================================================
  // GET /api/v1/external/llm/job/:jobId
  // ============================================================================
  describe('GET /api/v1/external/llm/job/:jobId', () => {
    test('der Schluessel einer App sieht keinen Auftrag einer anderen App (J35)', async () => {
      kiProtokoll.aufrufZumAuftrag.mockResolvedValueOnce(null);
      const response = await request(app)
        .get('/api/v1/external/llm/job/job-uuid')
        .set('X-API-Key', 'app-api-key');
      expect(response.status).toBe(404);
      expect(llmJobService.getJob).not.toHaveBeenCalled();
    });

    test('und sieht den eigenen, gebunden an App und Stand', async () => {
      kiProtokoll.aufrufZumAuftrag.mockResolvedValueOnce({ modell: 'm' });
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-uuid',
        // So kommt es aus pg: `llm_jobs.user_id` ist bigint, also eine
        // Zeichenkette; der Schluessel traegt `created_by` (integer) als Zahl.
        // Mit `!==` war das nie gleich (Fund am Orin, 26.09.2026).
        user_id: '1',
        status: 'completed',
        content: 'Antwort'
      });
      const response = await request(app)
        .get('/api/v1/external/llm/job/job-uuid')
        .set('X-API-Key', 'app-api-key');
      expect(response.status).toBe(200);
      expect(response.body.content).toBe('Antwort');
      expect(kiProtokoll.aufrufZumAuftrag).toHaveBeenCalledWith({
        jobId: 'job-uuid',
        apiKey: expect.objectContaining({ appId: 'faktum', stand: 'live' })
      });
    });

    test('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/v1/external/llm/job/job-uuid');

      expect(response.status).toBe(401);
    });

    test('should return job status with valid API key', async () => {
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-uuid',
        user_id: 1,
        status: 'processing',
        queue_position: 0,
        content: null,
        thinking: null,
        error_message: null,
        queued_at: '2026-01-25T10:00:00Z',
        started_at: '2026-01-25T10:00:01Z',
        completed_at: null
      });

      const response = await request(app)
        .get('/api/v1/external/llm/job/job-uuid')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.job_id).toBe('job-uuid');
      expect(response.body.status).toBe('processing');
    });

    test('should return 404 if job not found', async () => {
      llmJobService.getJob.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/v1/external/llm/job/nonexistent')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // GET /api/v1/external/llm/queue
  // ============================================================================
  describe('GET /api/v1/external/llm/queue', () => {
    test('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/v1/external/llm/queue');

      expect(response.status).toBe(401);
    });

    test('should return queue status', async () => {
      llmQueueService.getQueueStatus.mockResolvedValueOnce({
        pending_count: 3,
        processing: {
          id: 'current-job',
          started_at: '2026-01-25T10:00:00Z'
        }
      });
      modelService.getLoadedModel.mockResolvedValueOnce({
        model_id: 'qwen3:14b-q8'
      });

      const response = await request(app)
        .get('/api/v1/external/llm/queue')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.queue_length).toBe(3);
      expect(response.body.loaded_model).toBe('qwen3:14b-q8');
      expect(response.body.processing.job_id).toBe('current-job');
    });

    test('should handle empty queue', async () => {
      llmQueueService.getQueueStatus.mockResolvedValueOnce({
        pending_count: 0,
        processing: null
      });
      modelService.getLoadedModel.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/v1/external/llm/queue')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
      expect(response.body.queue_length).toBe(0);
      expect(response.body.loaded_model).toBeNull();
      expect(response.body.processing).toBeNull();
    });
  });

  // ============================================================================
  // GET /api/v1/external/models
  // ============================================================================
  describe('GET /api/v1/external/models', () => {
    test('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/v1/external/models');

      expect(response.status).toBe(401);
    });

    test('should return available models', async () => {
      modelService.getInstalledModels.mockResolvedValueOnce([
        { id: 'model1', name: 'Model 1', category: 'chat', ram_required_gb: 8 },
        { id: 'model2', name: 'Model 2', category: 'coding', ram_required_gb: 16 }
      ]);
      modelService.getDefaultModel.mockResolvedValueOnce('model1');

      const response = await request(app)
        .get('/api/v1/external/models')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.models).toHaveLength(2);
      expect(response.body.models[0].is_default).toBe(true);
      expect(response.body.models[1].is_default).toBe(false);
      expect(response.body.default_model).toBe('model1');
    });
  });

  // ============================================================================
  // POST /api/v1/external/api-keys (JWT Auth)
  // ============================================================================
  describe('POST /api/v1/external/api-keys', () => {
    test('should return 401 without JWT token', async () => {
      const response = await request(app)
        .post('/api/v1/external/api-keys')
        .send({ name: 'New Key' });

      expect(response.status).toBe(401);
    });

    test('should return 400 if name is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/v1/external/api-keys')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('name');
    });

    test('should create API key with valid data', async () => {
      setupMocksWithAuth();
      generateApiKey.mockResolvedValueOnce({
        key: 'arasul_live_abc123...',
        keyPrefix: 'arasul_live_abc',
        keyId: 'key-uuid'
      });

      const response = await request(app)
        .post('/api/v1/external/api-keys')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Automation',
          description: 'For workflow automation',
          rate_limit_per_minute: 100,
          allowed_endpoints: ['llm:chat']
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.api_key).toBe('arasul_live_abc123...');
      expect(response.body.key_prefix).toBe('arasul_live_abc');
    });
  });

  // ============================================================================
  // GET /api/v1/external/api-keys (JWT Auth)
  // ============================================================================
  describe('GET /api/v1/external/api-keys', () => {
    test('should return 401 without JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/external/api-keys');

      expect(response.status).toBe(401);
    });

    test('should return list of API keys', async () => {
      setupMocksWithAuth((query, params) => {
        if (query.includes('api_keys') && query.includes('SELECT')) {
          return Promise.resolve({
            rows: [
              {
                id: 'key1',
                key_prefix: 'arasul_live_abc',
                name: 'Key 1',
                description: 'Test key',
                created_at: '2026-01-25T10:00:00Z',
                last_used_at: '2026-01-25T12:00:00Z',
                expires_at: null,
                is_active: true,
                rate_limit_per_minute: 60,
                allowed_endpoints: ['llm:chat']
              }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/external/api-keys')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.api_keys).toHaveLength(1);
      expect(response.body.api_keys[0].name).toBe('Key 1');
    });
  });

  // ============================================================================
  // DELETE /api/v1/external/api-keys/:keyId (JWT Auth)
  // ============================================================================
  describe('DELETE /api/v1/external/api-keys/:keyId', () => {
    test('should return 401 without JWT token', async () => {
      const response = await request(app)
        .delete('/api/v1/external/api-keys/key-uuid');

      expect(response.status).toBe(401);
    });

    test('should revoke API key', async () => {
      setupMocksWithAuth((query, params) => {
        if (query.includes('UPDATE api_keys')) {
          return Promise.resolve({
            rows: [{ key_prefix: 'arasul_live_abc' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/v1/external/api-keys/key-uuid')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('API key revoked');
    });

    test('should return 404 if key not found', async () => {
      setupMocksWithAuth((query, params) => {
        if (query.includes('UPDATE api_keys')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/v1/external/api-keys/nonexistent')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(404);
    });
  });
});
