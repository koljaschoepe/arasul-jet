/**
 * Document Analysis Routes — Security Unit Tests
 *
 * Focus: IDOR guard on POST /api/document-analysis/analyze. A user must not be
 * able to attach/analyse a document against a conversation they do not own.
 *
 * Auth is mocked at middleware level (req.user.id = 1), mirroring documents.test.js.
 */

const request = require('supertest');
const express = require('express');

jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/documents/minioService');
jest.mock('../../src/services/documents/extractionService');
jest.mock('../../src/services/llm/llmQueueService');
jest.mock('../../src/services/llm/llmJobService');

jest.mock('../../src/middleware/auth', () => ({
    requireAuth: (req, res, next) => {
        req.user = { username: 'testuser', id: 1 };
        req.tokenData = { userId: 1, username: 'testuser', jti: 'test-jti', type: 'access' };
        next();
    },
}));

jest.mock('../../src/middleware/rateLimit', () => ({
    uploadLimiter: (req, res, next) => next(),
    generalLimiter: (req, res, next) => next(),
    generalAuthLimiter: (req, res, next) => next(),
}));

const database = require('../../src/database');
const logger = require('../../src/utils/logger');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

const analysisRoutes = require('../../src/routes/documentAnalysis');
const { errorHandler } = require('../../src/middleware/errorHandler');

const app = express();
app.use('/api/document-analysis', analysisRoutes);
app.use(errorHandler);

describe('POST /api/document-analysis/analyze — IDOR guard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        database.query.mockReset();
    });

    test('lehnt Konversation ab, die dem Nutzer nicht gehört (404)', async () => {
        // Ownership-Query liefert keine Zeile → fremde/nicht existierende Konversation
        database.query.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .post('/api/document-analysis/analyze')
            .field('conversation_id', '999')
            .attach('file', Buffer.from('# Hallo'), 'test.md');

        expect(response.status).toBe(404);
        // Ownership-Query MUSS user_id einschließen und darf nicht nur auf id prüfen
        const [sql, params] = database.query.mock.calls[0];
        expect(sql).toContain('user_id');
        expect(params).toEqual([999, 1]);
    });

    test('lehnt Request ohne conversation_id ab (400)', async () => {
        const response = await request(app)
            .post('/api/document-analysis/analyze')
            .attach('file', Buffer.from('# Hallo'), 'test.md');

        expect(response.status).toBe(400);
    });
});
