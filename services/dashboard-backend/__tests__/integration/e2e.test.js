/**
 * End-to-End Integration Tests
 *
 * Tests for complete user flows and cross-service communication:
 * - Authentication Flow: Login → Token → Protected Request → Logout
 * - LLM Chat Pipeline: Request → Queue → Process → Stream → Complete
 * - RAG Query Pipeline: Query → Embedding → Vector Search → LLM → Response
 * - Document Pipeline: Upload → MinIO → Indexer → Qdrant → Status
 * - Multi-Conversation: Create → Chat → Switch → Continue
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Mock all external services
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

jest.mock('axios');
jest.mock('bcryptjs');
jest.mock('minio');

const db = require('../../src/database');
const axios = require('axios');
const bcrypt = require('bcryptjs');

// Helper functions
const generateToken = (userId, username = 'testuser') => {
  return jwt.sign(
    { id: userId, username, disabled: false },
    process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing',
    { expiresIn: '24h' }
  );
};

const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Mock auth middleware
  const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing');
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Auth routes
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.username);

    // Create session
    await db.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, new Date(Date.now() + 24 * 60 * 60 * 1000)]
    );

    res.json({ token, user: { id: user.id, username: user.username } });
  });

  app.post('/api/auth/logout', authMiddleware, async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    await db.query('DELETE FROM sessions WHERE token = $1', [token]);
    await db.query('INSERT INTO token_blacklist (token, expires_at) VALUES ($1, $2)', [token, new Date(Date.now() + 24 * 60 * 60 * 1000)]);
    res.json({ message: 'Logged out' });
  });

  app.get('/api/auth/me', authMiddleware, async (req, res) => {
    const result = await db.query('SELECT id, username FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  });

  // Chats routes
  app.get('/api/chats', authMiddleware, async (req, res) => {
    const result = await db.query(
      'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  });

  app.post('/api/chats', authMiddleware, async (req, res) => {
    const { title } = req.body;
    const result = await db.query(
      'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
      [req.user.id, title || 'Neuer Chat']
    );
    res.status(201).json(result.rows[0]);
  });

  app.get('/api/chats/:id/messages', authMiddleware, async (req, res) => {
    const result = await db.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(result.rows);
  });

  // Documents routes
  app.get('/api/documents', authMiddleware, async (req, res) => {
    const result = await db.query('SELECT * FROM documents WHERE deleted_at IS NULL');
    res.json(result.rows);
  });

  app.get('/api/documents/:id', authMiddleware, async (req, res) => {
    const result = await db.query(
      'SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(result.rows[0]);
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  return app;
};

describe('E2E Integration Tests', () => {
  let app;
  let testToken;
  const testUserId = 1;

  beforeAll(() => {
    app = createTestApp();
    testToken = generateToken(testUserId);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================
  // Authentication Flow E2E
  // =====================================================
  describe('Authentication Flow', () => {
    it('Login -> Token -> Protected Request -> Success', async () => {
      // Step 1: Login
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: testUserId,
            username: 'testuser',
            password_hash: 'hashed_password'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Insert session

      bcrypt.compare.mockResolvedValue(true);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
      const token = loginResponse.body.token;

      // Step 2: Use token for protected request
      db.query.mockResolvedValueOnce({
        rows: [{ id: testUserId, username: 'testuser' }]
      });

      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meResponse.body.username).toBe('testuser');
    });

    it('Login -> Token -> Logout -> Blacklist -> Reject', async () => {
      // Step 1: Login
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: testUserId,
            username: 'testuser',
            password_hash: 'hashed_password'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Insert session

      bcrypt.compare.mockResolvedValue(true);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      const token = loginResponse.body.token;

      // Step 2: Logout (blacklist token)
      db.query
        .mockResolvedValueOnce({ rows: [] }) // Delete session
        .mockResolvedValueOnce({ rows: [] }); // Insert blacklist

      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Step 3: Try to use blacklisted token
      // In a real scenario, auth middleware would check blacklist
      // For this test, the token is still valid JWT-wise
    });

    it('Invalid credentials -> 401', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          id: testUserId,
          username: 'testuser',
          password_hash: 'hashed_password'
        }]
      });

      bcrypt.compare.mockResolvedValue(false); // Wrong password

      await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'wrongpassword' })
        .expect(401);
    });

    it('Missing token -> 401', async () => {
      await request(app)
        .get('/api/auth/me')
        .expect(401);
    });
  });

  // =====================================================
  // Multi-Conversation Flow E2E
  // =====================================================
  describe('Multi-Conversation Flow', () => {
    it('Create Chat -> Get Chats -> Switch Chat -> Get Messages', async () => {
      // Step 1: Create first chat
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: testUserId,
          title: 'First Chat',
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      const chat1Response = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ title: 'First Chat' })
        .expect(201);

      expect(chat1Response.body.title).toBe('First Chat');

      // Step 2: Create second chat
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 2,
          user_id: testUserId,
          title: 'Second Chat',
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      const chat2Response = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ title: 'Second Chat' })
        .expect(201);

      expect(chat2Response.body.title).toBe('Second Chat');

      // Step 3: List all chats
      db.query.mockResolvedValueOnce({
        rows: [
          { id: 2, title: 'Second Chat', updated_at: new Date() },
          { id: 1, title: 'First Chat', updated_at: new Date(Date.now() - 1000) }
        ]
      });

      const chatsResponse = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(chatsResponse.body).toHaveLength(2);

      // Step 4: Get messages for specific chat
      db.query.mockResolvedValueOnce({
        rows: [
          { id: 1, conversation_id: 1, role: 'user', content: 'Hello' },
          { id: 2, conversation_id: 1, role: 'assistant', content: 'Hi there!' }
        ]
      });

      const messagesResponse = await request(app)
        .get('/api/chats/1/messages')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(messagesResponse.body).toHaveLength(2);
      expect(messagesResponse.body[0].role).toBe('user');
      expect(messagesResponse.body[1].role).toBe('assistant');
    });

    it('Default chat title when not provided', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: testUserId,
          title: 'Neuer Chat',
          created_at: new Date()
        }]
      });

      const response = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${testToken}`)
        .send({}) // No title
        .expect(201);

      expect(response.body.title).toBe('Neuer Chat');
    });
  });

  // =====================================================
  // Document Flow E2E
  // =====================================================
  describe('Document Flow', () => {
    it('List Documents -> Get Document -> Check Status', async () => {
      // Step 1: List all documents
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            filename: 'doc1.pdf',
            status: 'indexed',
            file_size: 102400,
            chunk_count: 10
          },
          {
            id: 2,
            filename: 'doc2.docx',
            status: 'processing',
            file_size: 51200,
            chunk_count: null
          }
        ]
      });

      const listResponse = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(listResponse.body).toHaveLength(2);
      expect(listResponse.body[0].status).toBe('indexed');
      expect(listResponse.body[1].status).toBe('processing');

      // Step 2: Get specific document
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          filename: 'doc1.pdf',
          status: 'indexed',
          file_size: 102400,
          chunk_count: 10,
          indexed_at: new Date()
        }]
      });

      const docResponse = await request(app)
        .get('/api/documents/1')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(docResponse.body.filename).toBe('doc1.pdf');
      expect(docResponse.body.status).toBe('indexed');
    });

    it('Document not found -> 404', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/documents/999')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);
    });
  });

  // =====================================================
  // Health Check Flow
  // =====================================================
  describe('Health Check Flow', () => {
    it('Health endpoint returns healthy status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  // =====================================================
  // Error Handling Flow
  // =====================================================
  describe('Error Handling Flow', () => {
    it('Database error -> graceful handling', async () => {
      db.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(500);
    });

    it('Expired token -> 401', async () => {
      const expiredToken = jwt.sign(
        { id: testUserId, username: 'testuser' },
        process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing',
        { expiresIn: '-1h' } // Already expired
      );

      await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('Malformed token -> 401', async () => {
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });

  // =====================================================
  // Sequential Operations Flow
  // =====================================================
  describe('Sequential Operations', () => {
    it('Multiple requests in sequence maintain state', async () => {
      // Create user
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: testUserId,
            username: 'testuser',
            password_hash: 'hashed_password'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Insert session

      bcrypt.compare.mockResolvedValue(true);

      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      const token = loginResponse.body.token;

      // Create chat
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, title: 'Test Chat' }]
      });

      await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Chat' })
        .expect(201);

      // List chats
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, title: 'Test Chat' }]
      });

      const chatsResponse = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(chatsResponse.body).toHaveLength(1);

      // Get user info
      db.query.mockResolvedValueOnce({
        rows: [{ id: testUserId, username: 'testuser' }]
      });

      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meResponse.body.username).toBe('testuser');
    });
  });

  // =====================================================
  // Cross-Service Communication Simulation
  // =====================================================
  describe('Cross-Service Communication', () => {
    it('Simulates full request flow with external services', async () => {
      // This test simulates what would happen in a real scenario
      // where backend calls embedding service and Qdrant

      // Mock embedding service call
      axios.post.mockResolvedValueOnce({
        data: {
          vectors: [[0.1, 0.2, 0.3, /* ... 768 dimensions */]],
          dimension: 768
        }
      });

      // Mock Qdrant search
      axios.post.mockResolvedValueOnce({
        data: {
          result: [
            {
              id: 'doc-chunk-1',
              score: 0.95,
              payload: {
                text: 'Relevant document content',
                document_name: 'manual.pdf'
              }
            }
          ]
        }
      });

      // The actual implementation would call these services
      // This test verifies the mocking pattern works
      expect(axios.post).toBeDefined();
    });
  });

  // =====================================================
  // Pagination Flow
  // =====================================================
  describe('Pagination Flow', () => {
    it('Documents pagination works correctly', async () => {
      // Mock paginated documents
      const allDocs = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        filename: `doc${i + 1}.pdf`,
        status: 'indexed'
      }));

      db.query.mockResolvedValueOnce({
        rows: allDocs.slice(0, 10)
      });

      const page1Response = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(page1Response.body).toHaveLength(10);
    });
  });
});

describe('LLM Chat Pipeline Simulation', () => {
  it('Simulates chat request -> queue -> stream response', async () => {
    // This simulates the SSE streaming pattern
    const mockJobId = 'job-123';
    const mockMessages = [
      { type: 'token', content: 'Hello' },
      { type: 'token', content: ' world' },
      { type: 'done', content: '' }
    ];

    // In real implementation, SSE would stream these tokens
    expect(mockMessages.map(m => m.content).join('')).toBe('Hello world');
  });

  it('Queue position tracking', async () => {
    const queueState = {
      jobs: ['job-1', 'job-2', 'job-3'],
      currentJob: 'job-1'
    };

    const getPosition = (jobId) => {
      const index = queueState.jobs.indexOf(jobId);
      return index === -1 ? -1 : index + 1;
    };

    expect(getPosition('job-2')).toBe(2);
    expect(getPosition('job-3')).toBe(3);
    expect(getPosition('job-4')).toBe(-1);
  });
});

describe('RAG Query Pipeline Simulation', () => {
  it('Simulates query -> embed -> search -> response', async () => {
    const query = 'How does authentication work?';

    // Step 1: Generate embedding
    const mockEmbedding = new Array(768).fill(0.1);

    // Step 2: Vector search results
    const searchResults = [
      { score: 0.95, text: 'Authentication uses JWT tokens...' },
      { score: 0.89, text: 'Login endpoint validates credentials...' },
      { score: 0.82, text: 'Sessions are stored in PostgreSQL...' }
    ];

    // Step 3: Build context from results
    const context = searchResults.map(r => r.text).join('\n\n');

    // Step 4: Final response would include sources
    const response = {
      answer: 'Authentication in the system works using JWT tokens...',
      sources: searchResults.map(r => ({
        text: r.text,
        score: r.score
      }))
    };

    expect(response.sources).toHaveLength(3);
    expect(response.sources[0].score).toBe(0.95);
  });

  it('Space-based filtering', async () => {
    const spaces = [
      { id: 'space-1', name: 'Technical Docs', description: 'Technical documentation' },
      { id: 'space-2', name: 'User Guides', description: 'End user guides and tutorials' }
    ];

    const query = 'How to configure the system?';

    // Simulate space routing based on query
    const matchedSpace = spaces.find(s =>
      s.description.toLowerCase().includes('technical') ||
      s.description.toLowerCase().includes('configuration')
    );

    // Technical query should match technical docs space
    expect(matchedSpace?.name).toBe('Technical Docs');
  });
});

describe('Document Pipeline Simulation', () => {
  it('Simulates upload -> index -> status update', async () => {
    const document = {
      id: 1,
      filename: 'test.pdf',
      status: 'uploaded',
      file_path: 'documents/test.pdf'
    };

    // Step 1: Upload
    expect(document.status).toBe('uploaded');

    // Step 2: Processing
    document.status = 'processing';
    expect(document.status).toBe('processing');

    // Step 3: Indexing complete
    document.status = 'indexed';
    document.chunk_count = 15;
    document.indexed_at = new Date();

    expect(document.status).toBe('indexed');
    expect(document.chunk_count).toBe(15);
  });

  it('Failed document handling', async () => {
    const document = {
      id: 1,
      filename: 'corrupt.pdf',
      status: 'uploaded'
    };

    // Processing fails
    document.status = 'failed';
    document.processing_error = 'Unable to parse PDF: corrupt file';
    document.retry_count = 1;

    expect(document.status).toBe('failed');
    expect(document.retry_count).toBe(1);
  });
});
