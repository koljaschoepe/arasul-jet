/**
 * Integration tests for Audit API
 *
 * Tests:
 * - GET /api/audit/logs - Paginated audit log retrieval with filters
 * - GET /api/audit/stats/daily - Daily aggregated statistics
 * - GET /api/audit/stats/endpoints - Endpoint usage statistics
 */

const request = require('supertest');
const { generateTestToken, setupAuthMocks, mockUser } = require('../helpers/authMock');

// Mock external dependencies before requiring app
jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('axios');

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const { app } = require('../../src/server');

// Mock logger
logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

describe('Audit API Integration Tests', () => {
    let authToken;

    beforeAll(() => {
        authToken = generateTestToken();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockReset();
    });

    // ============================================================================
    // GET /api/audit/logs
    // ============================================================================
    describe('GET /api/audit/logs', () => {
        const mockAuditLogs = [
            {
                id: 1,
                timestamp: '2026-01-15T10:30:00.000Z',
                user_id: 1,
                username: 'admin',
                action_type: 'POST',
                target_endpoint: '/api/chats',
                request_method: 'POST',
                request_payload: { title: 'New Chat' },
                response_status: 201,
                duration_ms: 45,
                ip_address: '192.168.1.100',
                user_agent: 'Mozilla/5.0',
                error_message: null
            },
            {
                id: 2,
                timestamp: '2026-01-15T10:25:00.000Z',
                user_id: 1,
                username: 'admin',
                action_type: 'GET',
                target_endpoint: '/api/chats',
                request_method: 'GET',
                request_payload: {},
                response_status: 200,
                duration_ms: 25,
                ip_address: '192.168.1.100',
                user_agent: 'Mozilla/5.0',
                error_message: null
            }
        ];

        test('should require authentication', async () => {
            const response = await request(app)
                .get('/api/audit/logs');

            expect(response.status).toBe(401);
        });

        test('should return paginated audit logs', async () => {
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
                // Count query
                if (query.includes('COUNT(*)')) {
                    return Promise.resolve({ rows: [{ total: '150' }] });
                }
                // Data query
                if (query.includes('api_audit_logs') && query.includes('SELECT')) {
                    return Promise.resolve({ rows: mockAuditLogs });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/logs')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('logs');
            expect(response.body).toHaveProperty('pagination');
            expect(response.body.pagination).toMatchObject({
                total: 150,
                limit: 50,
                offset: 0,
                has_more: true
            });
            expect(response.body.logs).toHaveLength(2);
            expect(response.body.logs[0]).toHaveProperty('id', 1);
            expect(response.body.logs[0]).toHaveProperty('action_type', 'POST');
        });

        test('should respect limit and offset parameters', async () => {
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
                // Count query
                if (query.includes('COUNT(*)')) {
                    return Promise.resolve({ rows: [{ total: '100' }] });
                }
                // Data query - verify limit and offset are applied
                if (query.includes('api_audit_logs') && query.includes('LIMIT')) {
                    // Verify params include limit=10 and offset=20
                    expect(params).toContain(10);  // limit
                    expect(params).toContain(20);  // offset
                    return Promise.resolve({ rows: [mockAuditLogs[0]] });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/logs?limit=10&offset=20')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.pagination.limit).toBe(10);
            expect(response.body.pagination.offset).toBe(20);
        });

        test('should enforce max limit of 500', async () => {
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
                // Count query
                if (query.includes('COUNT(*)')) {
                    return Promise.resolve({ rows: [{ total: '1000' }] });
                }
                // Data query
                if (query.includes('api_audit_logs') && query.includes('LIMIT')) {
                    // Limit should be capped at 500
                    expect(params).toContain(500);
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/logs?limit=1000')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.pagination.limit).toBe(500);
        });

        test('should filter by action_type', async () => {
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
                // Count and data queries should include POST filter
                if (query.includes('api_audit_logs')) {
                    if (query.includes('action_type =')) {
                        expect(params).toContain('POST');
                    }
                    if (query.includes('COUNT(*)')) {
                        return Promise.resolve({ rows: [{ total: '50' }] });
                    }
                    return Promise.resolve({ rows: [mockAuditLogs[0]] });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/logs?action_type=POST')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.filters.action_type).toBe('POST');
        });

        test('should filter by user_id', async () => {
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
                // Data queries
                if (query.includes('api_audit_logs')) {
                    if (query.includes('user_id =')) {
                        expect(params).toContain(1);
                    }
                    if (query.includes('COUNT(*)')) {
                        return Promise.resolve({ rows: [{ total: '100' }] });
                    }
                    return Promise.resolve({ rows: mockAuditLogs });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/logs?user_id=1')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.filters.user_id).toBe(1);
        });

        test('should filter by endpoint with partial match', async () => {
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
                // Data queries
                if (query.includes('api_audit_logs')) {
                    if (query.includes('ILIKE')) {
                        expect(params).toContain('%chats%');
                    }
                    if (query.includes('COUNT(*)')) {
                        return Promise.resolve({ rows: [{ total: '25' }] });
                    }
                    return Promise.resolve({ rows: mockAuditLogs });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/logs?endpoint=chats')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.filters.endpoint).toBe('chats');
        });

        test('should filter by date range', async () => {
            const dateFrom = '2026-01-15T00:00:00.000Z';
            const dateTo = '2026-01-15T23:59:59.000Z';

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
                // Data queries
                if (query.includes('api_audit_logs')) {
                    if (query.includes('timestamp >=') && query.includes('timestamp <=')) {
                        expect(params).toContain(dateFrom);
                        expect(params).toContain(dateTo);
                    }
                    if (query.includes('COUNT(*)')) {
                        return Promise.resolve({ rows: [{ total: '50' }] });
                    }
                    return Promise.resolve({ rows: mockAuditLogs });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get(`/api/audit/logs?date_from=${dateFrom}&date_to=${dateTo}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.filters.date_from).toBe(dateFrom);
            expect(response.body.filters.date_to).toBe(dateTo);
        });

        test('should filter by status code range', async () => {
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
                // Data queries
                if (query.includes('api_audit_logs')) {
                    if (query.includes('response_status >=') && query.includes('response_status <=')) {
                        expect(params).toContain(400);
                        expect(params).toContain(499);
                    }
                    if (query.includes('COUNT(*)')) {
                        return Promise.resolve({ rows: [{ total: '10' }] });
                    }
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/logs?status_min=400&status_max=499')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.filters.status_min).toBe(400);
            expect(response.body.filters.status_max).toBe(499);
        });

        test('should handle database errors gracefully', async () => {
            db.query.mockImplementation((query) => {
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
                // Fail on audit queries
                if (query.includes('api_audit_logs')) {
                    return Promise.reject(new Error('Database connection failed'));
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/logs')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    // ============================================================================
    // GET /api/audit/stats/daily
    // ============================================================================
    describe('GET /api/audit/stats/daily', () => {
        const mockDailyStats = [
            {
                date: '2026-01-15',
                total_requests: 1250,
                unique_users: 5,
                success_count: 1180,
                client_error_count: 50,
                server_error_count: 20,
                avg_duration_ms: 45.23,
                max_duration_ms: 2500
            },
            {
                date: '2026-01-14',
                total_requests: 980,
                unique_users: 4,
                success_count: 950,
                client_error_count: 25,
                server_error_count: 5,
                avg_duration_ms: 38.50,
                max_duration_ms: 1800
            }
        ];

        test('should require authentication', async () => {
            const response = await request(app)
                .get('/api/audit/stats/daily');

            expect(response.status).toBe(401);
        });

        test('should return daily statistics with default 30 days', async () => {
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
                // Daily stats query
                if (query.includes('DATE(timestamp)') && query.includes('GROUP BY')) {
                    expect(params).toContain('30 days');
                    return Promise.resolve({ rows: mockDailyStats });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/stats/daily')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('stats');
            expect(response.body).toHaveProperty('days_included', 30);
            expect(response.body.stats).toHaveLength(2);
            expect(response.body.stats[0]).toMatchObject({
                date: '2026-01-15',
                total_requests: 1250,
                unique_users: 5
            });
        });

        test('should respect days parameter', async () => {
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
                // Daily stats query with 7 days
                if (query.includes('DATE(timestamp)') && query.includes('GROUP BY')) {
                    expect(params).toContain('7 days');
                    return Promise.resolve({ rows: mockDailyStats });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/stats/daily?days=7')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.days_included).toBe(7);
        });

        test('should enforce max 90 days', async () => {
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
                // Daily stats query - should cap at 90 days
                if (query.includes('DATE(timestamp)') && query.includes('GROUP BY')) {
                    expect(params).toContain('90 days');
                    return Promise.resolve({ rows: mockDailyStats });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/stats/daily?days=365')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.days_included).toBe(90);
        });

        test('should handle database errors gracefully', async () => {
            db.query.mockImplementation((query) => {
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
                // Fail on stats query
                if (query.includes('DATE(timestamp)')) {
                    return Promise.reject(new Error('Database error'));
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/stats/daily')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    // ============================================================================
    // GET /api/audit/stats/endpoints
    // ============================================================================
    describe('GET /api/audit/stats/endpoints', () => {
        const mockEndpointStats = [
            {
                target_endpoint: '/api/chats',
                action_type: 'GET',
                request_count: 500,
                unique_users: 3,
                error_count: 5,
                avg_duration_ms: 35.50,
                last_called: '2026-01-15T10:30:00.000Z'
            },
            {
                target_endpoint: '/api/llm/chat',
                action_type: 'POST',
                request_count: 250,
                unique_users: 3,
                error_count: 10,
                avg_duration_ms: 2500.00,
                last_called: '2026-01-15T10:25:00.000Z'
            }
        ];

        test('should require authentication', async () => {
            const response = await request(app)
                .get('/api/audit/stats/endpoints');

            expect(response.status).toBe(401);
        });

        test('should return endpoint statistics with defaults', async () => {
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
                // Endpoint stats query
                if (query.includes('target_endpoint') && query.includes('GROUP BY')) {
                    expect(params).toContain('7 days');
                    expect(params).toContain(20);  // default limit
                    return Promise.resolve({ rows: mockEndpointStats });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/stats/endpoints')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('endpoints');
            expect(response.body).toHaveProperty('days_included', 7);
            expect(response.body.endpoints).toHaveLength(2);
            expect(response.body.endpoints[0]).toMatchObject({
                target_endpoint: '/api/chats',
                action_type: 'GET',
                request_count: 500
            });
        });

        test('should respect days and limit parameters', async () => {
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
                // Endpoint stats query with custom params
                if (query.includes('target_endpoint') && query.includes('GROUP BY')) {
                    expect(params).toContain('14 days');
                    expect(params).toContain(50);  // custom limit
                    return Promise.resolve({ rows: mockEndpointStats });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/stats/endpoints?days=14&limit=50')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.days_included).toBe(14);
        });

        test('should enforce max days of 30 and max limit of 100', async () => {
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
                // Endpoint stats query - should cap values
                if (query.includes('target_endpoint') && query.includes('GROUP BY')) {
                    expect(params).toContain('30 days');
                    expect(params).toContain(100);  // capped limit
                    return Promise.resolve({ rows: mockEndpointStats });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/stats/endpoints?days=365&limit=500')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.days_included).toBe(30);
        });

        test('should handle database errors gracefully', async () => {
            db.query.mockImplementation((query) => {
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
                // Fail on endpoint stats query
                if (query.includes('target_endpoint')) {
                    return Promise.reject(new Error('Database error'));
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/stats/endpoints')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    // ============================================================================
    // Combined Filter Tests
    // ============================================================================
    describe('Combined Filters', () => {
        test('should combine multiple filters correctly', async () => {
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
                // Data queries with multiple filters
                if (query.includes('api_audit_logs')) {
                    // Should have WHERE clause with multiple conditions
                    expect(query).toContain('action_type =');
                    expect(query).toContain('user_id =');
                    expect(query).toContain('target_endpoint ILIKE');

                    if (query.includes('COUNT(*)')) {
                        return Promise.resolve({ rows: [{ total: '10' }] });
                    }
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .get('/api/audit/logs?action_type=POST&user_id=1&endpoint=chats')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.filters).toMatchObject({
                action_type: 'POST',
                user_id: 1,
                endpoint: 'chats'
            });
        });
    });
});
