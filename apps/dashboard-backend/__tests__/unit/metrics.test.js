/**
 * Unit tests for Metrics Routes
 *
 * Tests:
 * - GET /api/metrics/live  (no auth, rate-limited, collector + DB fallback)
 * - GET /api/metrics/history (no auth, rate-limited, range validation)
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

// Mock axios (used by metrics route to call metrics collector)
jest.mock('axios');

// Mock rate limit middleware so it does not block test requests
jest.mock('../../src/middleware/rateLimit', () => ({
    apiLimiter: (req, res, next) => next(),
    metricsLimiter: (req, res, next) => next(),
    llmLimiter: (req, res, next) => next(),
    loginLimiter: (req, res, next) => next(),
    webhookLimiter: (req, res, next) => next(),
    createUserRateLimiter: () => (req, res, next) => next()
}));

// Mock services config
jest.mock('../../src/config/services', () => ({
    metrics: {
        url: 'http://localhost:9100',
        metricsEndpoint: 'http://localhost:9100/metrics',
        host: 'localhost',
        port: 9100
    },
    llm: { url: 'http://localhost:11434', host: 'localhost', port: 11434 },
    embedding: { url: 'http://localhost:11435', host: 'localhost', port: 11435 },
    qdrant: { url: 'http://localhost:6333', host: 'localhost', port: 6333 },
    minio: { url: 'http://localhost:9000', host: 'localhost', port: 9000 },
    documentIndexer: { url: 'http://localhost:9102', host: 'localhost', port: 9102 }
}));

const axios = require('axios');
const db = require('../../src/database');
const { app } = require('../../src/server');

describe('Metrics Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ==========================================================================
    // GET /api/metrics/live
    // ==========================================================================
    describe('GET /api/metrics/live', () => {
        test('should return live metrics from collector when available', async () => {
            const collectorResponse = {
                cpu: 42.5,
                ram: 58.3,
                gpu: 25.0,
                temperature: 52.0,
                disk: { used: 120, free: 380, total: 500, percent: 24 },
                timestamp: '2024-01-01T00:00:00.000Z',
                source: 'collector'
            };

            axios.get.mockResolvedValueOnce({ data: collectorResponse });

            const response = await request(app).get('/api/metrics/live');

            expect(response.status).toBe(200);
            expect(response.body.cpu).toBe(42.5);
            expect(response.body.ram).toBe(58.3);
            expect(response.body.gpu).toBe(25.0);
            expect(response.body.temperature).toBe(52.0);
            expect(response.body.disk).toBeDefined();
        });

        test('should fallback to database when collector is unavailable', async () => {
            // Collector request fails
            axios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            // Database fallback returns row
            db.query.mockResolvedValueOnce({
                rows: [{
                    cpu: '45.5',
                    ram: '62.3',
                    gpu: '30.0',
                    temperature: '55.0',
                    disk: { used: 100, free: 200, total: 300, percent: 33 }
                }]
            });

            const response = await request(app).get('/api/metrics/live');

            expect(response.status).toBe(200);
            expect(response.body.cpu).toBe(45.5);
            expect(response.body.ram).toBe(62.3);
            expect(response.body.gpu).toBe(30.0);
            expect(response.body.temperature).toBe(55.0);
            expect(response.body.source).toBe('database_fallback');
        });

        test('should return proper structure with cpu/ram/gpu/temperature', async () => {
            // Collector fails, use database fallback
            axios.get.mockRejectedValueOnce(new Error('Timeout'));

            db.query.mockResolvedValueOnce({
                rows: [{
                    cpu: '78.0',
                    ram: '91.2',
                    gpu: '55.5',
                    temperature: '70.0',
                    disk: { used: 250, free: 50, total: 300, percent: 83 }
                }]
            });

            const response = await request(app).get('/api/metrics/live');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('cpu');
            expect(response.body).toHaveProperty('ram');
            expect(response.body).toHaveProperty('gpu');
            expect(response.body).toHaveProperty('temperature');
            expect(response.body).toHaveProperty('disk');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('source', 'database_fallback');
        });

        test('should return 503 when both collector and database are unavailable', async () => {
            axios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
            db.query.mockRejectedValueOnce(new Error('Database connection failed'));

            const response = await request(app).get('/api/metrics/live');

            expect(response.status).toBe(503);
            expect(response.body).toHaveProperty('error');
        });

        test('should not require authentication', async () => {
            const collectorResponse = {
                cpu: 10,
                ram: 20,
                gpu: 5,
                temperature: 40,
                disk: { used: 50, free: 150, total: 200, percent: 25 }
            };
            axios.get.mockResolvedValueOnce({ data: collectorResponse });

            // Request without Authorization header
            const response = await request(app).get('/api/metrics/live');

            expect(response.status).toBe(200);
        });
    });

    // ==========================================================================
    // GET /api/metrics/history
    // ==========================================================================
    describe('GET /api/metrics/history', () => {
        const mockHistoryRow = {
            timestamp: '2024-01-01T00:00:00Z',
            cpu: '45',
            ram: '62',
            gpu: '30',
            temperature: '55',
            disk_used: '33'
        };

        test('should return history for valid range (24h)', async () => {
            db.query.mockResolvedValueOnce({ rows: [mockHistoryRow] });

            const response = await request(app)
                .get('/api/metrics/history')
                .query({ range: '24h' });

            expect(response.status).toBe(200);
            expect(response.body.range).toBe('24h');
            expect(response.body).toHaveProperty('timestamps');
            expect(response.body).toHaveProperty('cpu');
            expect(response.body).toHaveProperty('ram');
            expect(response.body).toHaveProperty('gpu');
            expect(response.body).toHaveProperty('temperature');
            expect(response.body).toHaveProperty('disk_used');
            expect(Array.isArray(response.body.timestamps)).toBe(true);
            expect(Array.isArray(response.body.cpu)).toBe(true);
        });

        test('should return 400 for invalid range', async () => {
            const response = await request(app)
                .get('/api/metrics/history')
                .query({ range: 'invalid' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        test('should default to 24h when no range specified', async () => {
            db.query.mockResolvedValueOnce({ rows: [mockHistoryRow] });

            const response = await request(app).get('/api/metrics/history');

            expect(response.status).toBe(200);
            expect(response.body.range).toBe('24h');
        });

        test('should accept all valid range values', async () => {
            const validRanges = ['1h', '6h', '12h', '24h', '48h', '7d', '30d'];

            for (const range of validRanges) {
                db.query.mockResolvedValueOnce({ rows: [mockHistoryRow] });

                const response = await request(app)
                    .get('/api/metrics/history')
                    .query({ range });

                expect(response.status).toBe(200);
                expect(response.body.range).toBe(range);
            }
        });

        test('should parse numeric values from database rows', async () => {
            db.query.mockResolvedValueOnce({
                rows: [
                    {
                        timestamp: '2024-01-01T00:00:00Z',
                        cpu: '45.5',
                        ram: '62.3',
                        gpu: '30.1',
                        temperature: '55.7',
                        disk_used: '33.2'
                    },
                    {
                        timestamp: '2024-01-01T00:15:00Z',
                        cpu: '50.0',
                        ram: '65.0',
                        gpu: '35.0',
                        temperature: '57.0',
                        disk_used: '34.0'
                    }
                ]
            });

            const response = await request(app)
                .get('/api/metrics/history')
                .query({ range: '1h' });

            expect(response.status).toBe(200);
            expect(response.body.cpu).toHaveLength(2);
            expect(response.body.cpu[0]).toBe(45.5);
            expect(response.body.ram[0]).toBe(62.3);
            expect(response.body.gpu[0]).toBe(30.1);
            expect(response.body.temperature[0]).toBe(55.7);
            expect(response.body.disk_used[0]).toBe(33.2);
        });

        test('should handle null database values by returning 0', async () => {
            db.query.mockResolvedValueOnce({
                rows: [{
                    timestamp: '2024-01-01T00:00:00Z',
                    cpu: null,
                    ram: null,
                    gpu: null,
                    temperature: null,
                    disk_used: null
                }]
            });

            const response = await request(app)
                .get('/api/metrics/history')
                .query({ range: '6h' });

            expect(response.status).toBe(200);
            expect(response.body.cpu[0]).toBe(0);
            expect(response.body.ram[0]).toBe(0);
            expect(response.body.gpu[0]).toBe(0);
            expect(response.body.temperature[0]).toBe(0);
            expect(response.body.disk_used[0]).toBe(0);
        });

        test('should return timestamp in response', async () => {
            db.query.mockResolvedValueOnce({ rows: [mockHistoryRow] });

            const response = await request(app)
                .get('/api/metrics/history')
                .query({ range: '12h' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('timestamp');
            expect(typeof response.body.timestamp).toBe('string');
            const ts = new Date(response.body.timestamp);
            expect(ts.toString()).not.toBe('Invalid Date');
        });

        test('should not require authentication', async () => {
            db.query.mockResolvedValueOnce({ rows: [mockHistoryRow] });

            // Request without Authorization header
            const response = await request(app)
                .get('/api/metrics/history')
                .query({ range: '24h' });

            expect(response.status).toBe(200);
        });
    });
});
