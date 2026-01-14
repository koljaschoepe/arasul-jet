/**
 * Integration tests for Dashboard Backend API
 * Tests multiple endpoints and their interactions
 *
 * Uses mocked database and external services while testing real route integration
 */

const request = require('supertest');
const { generateTestToken, setupAuthMocks, mockUser } = require('../helpers/authMock');

// Mock external dependencies before requiring app
jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('axios');

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const axios = require('axios');
const app = require('../../src/server');

// Mock logger
logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

describe('API Integration Tests', () => {
    let authToken;

    beforeAll(() => {
        // Generate a valid token for tests
        authToken = generateTestToken();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup auth mocks for authenticated requests
        setupAuthMocks(db);
    });

    describe('Authentication Flow', () => {
        test('should reject requests without token', async () => {
            const response = await request(app)
                .get('/api/system/status');

            expect(response.status).toBe(401);
        });

        test('should reject requests with invalid token', async () => {
            // Setup auth to reject
            db.query.mockImplementation((query) => {
                if (query.includes('token_blacklist')) {
                    return Promise.resolve({ rows: [{ id: 1 }] }); // Token blacklisted
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/system/status')
                .set('Authorization', 'Bearer invalid_token_here');

            expect(response.status).toBe(401);
        });

        test('should accept valid token for protected endpoints', async () => {
            // Mock system status response
            axios.get.mockResolvedValue({ data: { status: 'OK' } });

            const response = await request(app)
                .get('/api/system/status')
                .set('Authorization', `Bearer ${authToken}`);

            // Should not be 401
            expect(response.status).not.toBe(401);
        });
    });

    describe('Health Check', () => {
        test('health check should be publicly accessible', async () => {
            const response = await request(app)
                .get('/api/health');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'OK');
        });

        test('health check should include timestamp', async () => {
            const response = await request(app)
                .get('/api/health');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('System Endpoints', () => {
        test('should return system status with auth', async () => {
            // Mock external service calls
            axios.get.mockImplementation((url) => {
                if (url.includes('11434')) {
                    return Promise.resolve({ data: { status: 'ok' } });
                }
                if (url.includes('11435')) {
                    return Promise.resolve({ data: { status: 'ok' } });
                }
                if (url.includes('5678')) {
                    return Promise.resolve({ data: { status: 'ok' } });
                }
                if (url.includes('9000')) {
                    return Promise.resolve({ data: {} });
                }
                return Promise.resolve({ data: {} });
            });

            // Mock database for self-healing status
            db.query.mockImplementation((query, params) => {
                // Auth queries
                if (query.includes('token_blacklist')) {
                    return Promise.resolve({ rows: [] });
                }
                if (query.includes('active_sessions') && query.includes('SELECT')) {
                    return Promise.resolve({ rows: [{ id: 1 }] });
                }
                if (query.includes('update_session_activity')) {
                    return Promise.resolve({ rows: [] });
                }
                if (query.includes('admin_users')) {
                    return Promise.resolve({ rows: [mockUser] });
                }
                // Self-healing status query
                if (query.includes('self_healing_events')) {
                    return Promise.resolve({
                        rows: [{
                            events_last_hour: 0,
                            critical_last_hour: 0
                        }]
                    });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/system/status')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('timestamp');
        });

        test('should return system info', async () => {
            const response = await request(app)
                .get('/api/system/info')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('version');
        });
    });

    describe('Metrics Endpoints', () => {
        test('should return live metrics', async () => {
            // Mock metrics collector response
            axios.get.mockResolvedValue({
                data: {
                    cpu: 25.5,
                    ram: 45.0,
                    gpu: 30.0,
                    temperature: 55,
                    disk: 60,
                    timestamp: new Date().toISOString()
                }
            });

            const response = await request(app)
                .get('/api/metrics/live')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('cpu');
            expect(response.body).toHaveProperty('ram');
            expect(response.body).toHaveProperty('timestamp');
        });

        test('should return historical metrics', async () => {
            db.query.mockImplementation((query, params) => {
                // Auth queries
                if (query.includes('token_blacklist')) {
                    return Promise.resolve({ rows: [] });
                }
                if (query.includes('active_sessions') && query.includes('SELECT')) {
                    return Promise.resolve({ rows: [{ id: 1 }] });
                }
                if (query.includes('update_session_activity')) {
                    return Promise.resolve({ rows: [] });
                }
                if (query.includes('admin_users')) {
                    return Promise.resolve({ rows: [mockUser] });
                }
                // Metrics history query
                if (query.includes('system_metrics')) {
                    return Promise.resolve({
                        rows: [
                            { cpu: 25, ram: 45, gpu: 30, temperature: 55, disk: 60, timestamp: new Date() },
                            { cpu: 26, ram: 46, gpu: 31, temperature: 56, disk: 60, timestamp: new Date() }
                        ]
                    });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/metrics/history?range=1h')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('metrics');
            expect(Array.isArray(response.body.metrics)).toBe(true);
        });

        test('should validate time range parameter', async () => {
            const response = await request(app)
                .get('/api/metrics/history?range=invalid')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Database Endpoints', () => {
        test('should return pool statistics', async () => {
            // Mock pool stats
            db.getPoolStats = jest.fn().mockReturnValue({
                totalCount: 10,
                idleCount: 5,
                waitingCount: 0,
                totalQueries: 1000,
                failedQueries: 5,
                poolUtilization: 50,
                errorRate: 0.5
            });

            const response = await request(app)
                .get('/api/database/pool')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('pool_stats');
        });

        test('should return database health', async () => {
            db.healthCheck = jest.fn().mockResolvedValue({
                healthy: true,
                latencyMs: 5,
                message: 'Database connection healthy'
            });

            const response = await request(app)
                .get('/api/database/health')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('database_healthy');
        });
    });

    describe('Self-Healing Endpoints', () => {
        test('should return self-healing events', async () => {
            db.query.mockImplementation((query, params) => {
                // Auth queries
                if (query.includes('token_blacklist')) {
                    return Promise.resolve({ rows: [] });
                }
                if (query.includes('active_sessions') && query.includes('SELECT')) {
                    return Promise.resolve({ rows: [{ id: 1 }] });
                }
                if (query.includes('update_session_activity')) {
                    return Promise.resolve({ rows: [] });
                }
                if (query.includes('admin_users')) {
                    return Promise.resolve({ rows: [mockUser] });
                }
                // Events query
                if (query.includes('self_healing_events')) {
                    return Promise.resolve({
                        rows: [
                            { id: 1, category: 'GPU', severity: 'WARNING', message: 'High usage', timestamp: new Date() }
                        ]
                    });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/self-healing/events')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('events');
            expect(Array.isArray(response.body.events)).toBe(true);
        });

        test('should return self-healing statistics', async () => {
            db.query.mockImplementation((query, params) => {
                // Auth queries
                if (query.includes('token_blacklist')) {
                    return Promise.resolve({ rows: [] });
                }
                if (query.includes('active_sessions') && query.includes('SELECT')) {
                    return Promise.resolve({ rows: [{ id: 1 }] });
                }
                if (query.includes('update_session_activity')) {
                    return Promise.resolve({ rows: [] });
                }
                if (query.includes('admin_users')) {
                    return Promise.resolve({ rows: [mockUser] });
                }
                // Stats queries
                if (query.includes('COUNT')) {
                    return Promise.resolve({
                        rows: [{ total_events: 50 }]
                    });
                }
                if (query.includes('category')) {
                    return Promise.resolve({
                        rows: [{ category: 'GPU', count: 30 }, { category: 'RAM', count: 20 }]
                    });
                }
                if (query.includes('severity')) {
                    return Promise.resolve({
                        rows: [{ severity: 'WARNING', count: 40 }, { severity: 'CRITICAL', count: 10 }]
                    });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/self-healing/stats')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('total_events');
        });
    });

    describe('Error Handling', () => {
        test('should return 404 for non-existent endpoints', async () => {
            const response = await request(app)
                .get('/api/nonexistent/endpoint')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error');
        });

        test('should return proper error format', async () => {
            const response = await request(app)
                .get('/api/nonexistent');

            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('timestamp');
            expect(typeof response.body.error).toBe('string');
            expect(typeof response.body.timestamp).toBe('string');
        });

        test('should handle malformed JSON gracefully', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .set('Content-Type', 'application/json')
                .send('{ invalid json }');

            // Should return 400 for malformed JSON
            expect(response.status).toBe(400);
        });
    });

    describe('Request Validation', () => {
        test('should return 400 for missing required fields on login', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        test('should return 400 for invalid request body', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    invalid: 'data'
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });
    });
});
