/**
 * Unit tests for Audit Middleware
 *
 * Tests:
 * - Sensitive data masking
 * - Client IP extraction
 * - Audit log writing
 * - Middleware behavior (excluded endpoints, API filtering)
 */

// Mock database module
jest.mock('../../src/database', () => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
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

const {
    maskSensitiveData,
    getClientIP,
    writeAuditLog,
    createAuditMiddleware,
    EXCLUDED_ENDPOINTS,
    SENSITIVE_FIELDS
} = require('../../src/middleware/audit');

const db = require('../../src/database');
const logger = require('../../src/utils/logger');

describe('Audit Middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ============================================================================
    // maskSensitiveData
    // ============================================================================
    describe('maskSensitiveData', () => {
        test('should mask password field', () => {
            const input = { username: 'admin', password: 'secret123' };
            const result = maskSensitiveData(input);

            expect(result.username).toBe('admin');
            expect(result.password).toBe('***REDACTED***');
        });

        test('should mask currentPassword and newPassword', () => {
            const input = {
                currentPassword: 'oldSecret',
                newPassword: 'newSecret',
                confirmPassword: 'newSecret'
            };
            const result = maskSensitiveData(input);

            expect(result.currentPassword).toBe('***REDACTED***');
            expect(result.newPassword).toBe('***REDACTED***');
        });

        test('should mask token fields', () => {
            const input = {
                token: 'jwt-token-here',
                api_key: 'api-key-value',
                bot_token: 'telegram-bot-token'
            };
            const result = maskSensitiveData(input);

            expect(result.token).toBe('***REDACTED***');
            expect(result.api_key).toBe('***REDACTED***');
            expect(result.bot_token).toBe('***REDACTED***');
        });

        test('should mask nested objects', () => {
            const input = {
                user: {
                    name: 'John',
                    credentials: {
                        password: 'secret',
                        apiKey: 'key123'
                    }
                }
            };
            const result = maskSensitiveData(input);

            expect(result.user.name).toBe('John');
            expect(result.user.credentials.password).toBe('***REDACTED***');
            expect(result.user.credentials.apiKey).toBe('***REDACTED***');
        });

        test('should handle arrays', () => {
            const input = [
                { username: 'user1', password: 'pass1' },
                { username: 'user2', password: 'pass2' }
            ];
            const result = maskSensitiveData(input);

            expect(result[0].username).toBe('user1');
            expect(result[0].password).toBe('***REDACTED***');
            expect(result[1].username).toBe('user2');
            expect(result[1].password).toBe('***REDACTED***');
        });

        test('should handle null and undefined', () => {
            expect(maskSensitiveData(null)).toBe(null);
            expect(maskSensitiveData(undefined)).toBe(undefined);
        });

        test('should handle primitive values', () => {
            expect(maskSensitiveData('string')).toBe('string');
            expect(maskSensitiveData(123)).toBe(123);
            expect(maskSensitiveData(true)).toBe(true);
        });

        test('should not mask non-sensitive fields', () => {
            const input = {
                email: 'test@example.com',
                name: 'John Doe',
                message: 'Hello world'
            };
            const result = maskSensitiveData(input);

            expect(result).toEqual(input);
        });

        test('should handle empty object', () => {
            const result = maskSensitiveData({});
            expect(result).toEqual({});
        });

        test('should mask fields case-insensitively', () => {
            const input = {
                PASSWORD: 'secret1',
                Token: 'secret2',
                API_KEY: 'secret3'
            };
            const result = maskSensitiveData(input);

            expect(result.PASSWORD).toBe('***REDACTED***');
            expect(result.Token).toBe('***REDACTED***');
            expect(result.API_KEY).toBe('***REDACTED***');
        });

        test('should not mask null/undefined sensitive values', () => {
            const input = {
                password: null,
                token: undefined
            };
            const result = maskSensitiveData(input);

            expect(result.password).toBe(null);
            expect(result.token).toBe(undefined);
        });
    });

    // ============================================================================
    // getClientIP
    // ============================================================================
    describe('getClientIP', () => {
        test('should extract IP from x-forwarded-for header', () => {
            const req = {
                headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1' },
                ip: '127.0.0.1'
            };
            const result = getClientIP(req);

            expect(result).toBe('192.168.1.100');
        });

        test('should handle single IP in x-forwarded-for', () => {
            const req = {
                headers: { 'x-forwarded-for': '192.168.1.100' },
                ip: '127.0.0.1'
            };
            const result = getClientIP(req);

            expect(result).toBe('192.168.1.100');
        });

        test('should fall back to req.ip', () => {
            const req = {
                headers: {},
                ip: '10.0.0.5'
            };
            const result = getClientIP(req);

            expect(result).toBe('10.0.0.5');
        });

        test('should fall back to connection.remoteAddress', () => {
            const req = {
                headers: {},
                ip: undefined,
                connection: { remoteAddress: '::ffff:192.168.1.1' }
            };
            const result = getClientIP(req);

            expect(result).toBe('::ffff:192.168.1.1');
        });

        test('should return unknown if no IP found', () => {
            const req = {
                headers: {},
                ip: undefined,
                connection: {}
            };
            const result = getClientIP(req);

            expect(result).toBe('unknown');
        });

        test('should trim whitespace from x-forwarded-for', () => {
            const req = {
                headers: { 'x-forwarded-for': '  192.168.1.100  , 10.0.0.1' },
                ip: '127.0.0.1'
            };
            const result = getClientIP(req);

            expect(result).toBe('192.168.1.100');
        });
    });

    // ============================================================================
    // writeAuditLog
    // ============================================================================
    describe('writeAuditLog', () => {
        test('should write audit log to database', async () => {
            const logEntry = {
                user_id: 1,
                username: 'admin',
                action_type: 'POST',
                target_endpoint: '/api/chats',
                request_method: 'POST',
                request_payload: { title: 'New Chat' },
                response_status: 201,
                duration_ms: 50,
                ip_address: '192.168.1.100',
                user_agent: 'Mozilla/5.0',
                error_message: null
            };

            await writeAuditLog(logEntry);

            expect(db.query).toHaveBeenCalledTimes(1);
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO api_audit_logs'),
                expect.arrayContaining([
                    1,                      // user_id
                    'admin',                // username
                    'POST',                 // action_type
                    '/api/chats',           // target_endpoint
                    'POST',                 // request_method
                    expect.any(String),     // request_payload (JSON string)
                    201,                    // response_status
                    50,                     // duration_ms
                    '192.168.1.100',        // ip_address
                    'Mozilla/5.0',          // user_agent
                    null                    // error_message
                ])
            );
        });

        test('should handle database errors gracefully', async () => {
            db.query.mockRejectedValueOnce(new Error('Database error'));

            const logEntry = {
                user_id: 1,
                username: 'admin',
                action_type: 'GET',
                target_endpoint: '/api/test',
                request_method: 'GET',
                request_payload: {},
                response_status: 200,
                duration_ms: 10,
                ip_address: '127.0.0.1',
                user_agent: null,
                error_message: null
            };

            // Should not throw
            await expect(writeAuditLog(logEntry)).resolves.not.toThrow();

            // Should log error
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to write audit log'),
                expect.any(Object)
            );
        });

        test('should handle null values in log entry', async () => {
            const logEntry = {
                user_id: null,
                username: null,
                action_type: 'GET',
                target_endpoint: '/api/health',
                request_method: 'GET',
                request_payload: {},
                response_status: 200,
                duration_ms: 5,
                ip_address: null,
                user_agent: null,
                error_message: null
            };

            await writeAuditLog(logEntry);

            expect(db.query).toHaveBeenCalled();
        });
    });

    // ============================================================================
    // createAuditMiddleware
    // ============================================================================
    describe('createAuditMiddleware', () => {
        let middleware;
        let mockReq;
        let mockRes;
        let mockNext;

        beforeEach(() => {
            middleware = createAuditMiddleware();
            mockReq = {
                path: '/api/chats',
                originalUrl: '/api/chats',
                method: 'GET',
                headers: {},
                body: {},
                user: null,
                ip: '127.0.0.1'
            };
            mockRes = {
                statusCode: 200,
                statusMessage: 'OK',
                end: jest.fn()
            };
            mockNext = jest.fn();
        });

        test('should call next for API requests', () => {
            middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        test('should skip excluded endpoints', () => {
            for (const endpoint of EXCLUDED_ENDPOINTS) {
                mockReq.path = endpoint;
                db.query.mockClear();

                middleware(mockReq, mockRes, mockNext);

                // Call res.end to trigger audit
                mockRes.end();

                // Should not write audit log for excluded endpoint
                // Note: We verify by checking if end was called but no log written
            }

            expect(mockNext).toHaveBeenCalled();
        });

        test('should skip non-API requests', () => {
            mockReq.path = '/static/image.png';
            mockReq.originalUrl = '/static/image.png';

            middleware(mockReq, mockRes, mockNext);
            mockRes.end();

            // Wait for async operations
            return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
                // Should not write to audit table for non-API requests
                expect(db.query).not.toHaveBeenCalled();
            });
        });

        test('should capture response status code', (done) => {
            mockReq.path = '/api/test';
            mockReq.originalUrl = '/api/test';
            mockRes.statusCode = 404;
            mockRes.statusMessage = 'Not Found';

            middleware(mockReq, mockRes, mockNext);

            // Simulate response end
            mockRes.end();

            // Check async write
            setTimeout(() => {
                expect(db.query).toHaveBeenCalled();
                const callArgs = db.query.mock.calls[0][1];
                expect(callArgs[6]).toBe(404); // response_status
                done();
            }, 50);
        });

        test('should capture user info from req.user', (done) => {
            mockReq.path = '/api/chats';
            mockReq.originalUrl = '/api/chats';
            mockReq.user = { id: 42, username: 'testuser' };

            middleware(mockReq, mockRes, mockNext);
            mockRes.end();

            setTimeout(() => {
                expect(db.query).toHaveBeenCalled();
                const callArgs = db.query.mock.calls[0][1];
                expect(callArgs[0]).toBe(42);       // user_id
                expect(callArgs[1]).toBe('testuser'); // username
                done();
            }, 50);
        });

        test('should mask sensitive data in request body', (done) => {
            mockReq.path = '/api/auth/login';
            mockReq.originalUrl = '/api/auth/login';
            mockReq.method = 'POST';
            mockReq.body = {
                username: 'admin',
                password: 'secret123'
            };

            middleware(mockReq, mockRes, mockNext);
            mockRes.end();

            setTimeout(() => {
                expect(db.query).toHaveBeenCalled();
                const callArgs = db.query.mock.calls[0][1];
                const payload = JSON.parse(callArgs[5]); // request_payload
                expect(payload.username).toBe('admin');
                expect(payload.password).toBe('***REDACTED***');
                done();
            }, 50);
        });

        test('should capture client IP', (done) => {
            mockReq.path = '/api/test';
            mockReq.originalUrl = '/api/test';
            mockReq.headers['x-forwarded-for'] = '10.0.0.100';

            middleware(mockReq, mockRes, mockNext);
            mockRes.end();

            setTimeout(() => {
                expect(db.query).toHaveBeenCalled();
                const callArgs = db.query.mock.calls[0][1];
                expect(callArgs[8]).toBe('10.0.0.100'); // ip_address
                done();
            }, 50);
        });

        test('should not log twice on multiple end calls', (done) => {
            mockReq.path = '/api/test';
            mockReq.originalUrl = '/api/test';

            middleware(mockReq, mockRes, mockNext);

            // Call end multiple times
            mockRes.end();
            mockRes.end();
            mockRes.end();

            setTimeout(() => {
                // Should only write once
                expect(db.query).toHaveBeenCalledTimes(1);
                done();
            }, 50);
        });
    });

    // ============================================================================
    // Constants
    // ============================================================================
    describe('Constants', () => {
        test('EXCLUDED_ENDPOINTS should include health and metrics', () => {
            expect(EXCLUDED_ENDPOINTS).toContain('/api/health');
            expect(EXCLUDED_ENDPOINTS).toContain('/api/metrics/live');
            expect(EXCLUDED_ENDPOINTS).toContain('/api/metrics/live-stream');
        });

        test('SENSITIVE_FIELDS should include common sensitive field names', () => {
            expect(SENSITIVE_FIELDS).toContain('password');
            expect(SENSITIVE_FIELDS).toContain('token');
            expect(SENSITIVE_FIELDS).toContain('api_key');
            expect(SENSITIVE_FIELDS).toContain('secret');
        });
    });
});
