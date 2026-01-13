/**
 * Documents Routes Unit Tests
 * Tests für alle /api/documents Endpoints
 */

const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

// Mock dependencies before requiring the routes
jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('axios');
jest.mock('minio');

const pool = require('../../src/database');
const logger = require('../../src/utils/logger');
const axios = require('axios');
const Minio = require('minio');

// Mock logger methods
logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

// Mock auth middleware
jest.mock('../../src/middleware/auth', () => ({
    requireAuth: (req, res, next) => {
        req.user = { username: 'testuser', id: 1 };
        next();
    }
}));

// Mock MinIO client
const mockMinioClient = {
    putObject: jest.fn().mockResolvedValue({}),
    getObject: jest.fn(),
    removeObject: jest.fn().mockResolvedValue({})
};

Minio.Client = jest.fn().mockImplementation(() => mockMinioClient);

// Import routes after mocking
const documentsRoutes = require('../../src/routes/documents');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/documents', documentsRoutes);

describe('Documents Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =====================================================
    // GET /api/documents - List Documents
    // =====================================================
    describe('GET /api/documents', () => {
        test('gibt leere Liste zurück wenn keine Dokumente', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })  // Count query
                .mockResolvedValueOnce({ rows: [] });  // Documents query

            const response = await request(app)
                .get('/api/documents');

            expect(response.status).toBe(200);
            expect(response.body.documents).toEqual([]);
            expect(response.body.total).toBe(0);
        });

        test('gibt Dokumentenliste mit Pagination zurück', async () => {
            const mockDocs = [
                { id: 'doc-1', filename: 'test1.pdf', status: 'indexed' },
                { id: 'doc-2', filename: 'test2.pdf', status: 'pending' }
            ];

            pool.query
                .mockResolvedValueOnce({ rows: [{ count: '50' }] })
                .mockResolvedValueOnce({ rows: mockDocs });

            const response = await request(app)
                .get('/api/documents')
                .query({ limit: 10, offset: 0 });

            expect(response.status).toBe(200);
            expect(response.body.documents).toHaveLength(2);
            expect(response.body.total).toBe(50);
            expect(response.body.limit).toBe(10);
            expect(response.body.offset).toBe(0);
        });

        test('filtert nach Status', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ count: '5' }] })
                .mockResolvedValueOnce({ rows: [{ id: 'doc-1', status: 'indexed' }] });

            const response = await request(app)
                .get('/api/documents')
                .query({ status: 'indexed' });

            expect(response.status).toBe(200);
            // Verify status filter is applied in query
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('d.status = $'),
                expect.arrayContaining(['indexed'])
            );
        });

        test('filtert nach space_id', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ count: '3' }] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .get('/api/documents')
                .query({ space_id: 'space-123' });

            expect(response.status).toBe(200);
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('d.space_id = $'),
                expect.arrayContaining(['space-123'])
            );
        });

        test('filtert unassigned Dokumente wenn space_id=null', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ count: '2' }] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .get('/api/documents')
                .query({ space_id: 'null' });

            expect(response.status).toBe(200);
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('d.space_id IS NULL'),
                expect.any(Array)
            );
        });

        test('Suche filtert nach Filename und Title', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ count: '1' }] })
                .mockResolvedValueOnce({ rows: [{ id: 'doc-1', filename: 'report.pdf' }] });

            const response = await request(app)
                .get('/api/documents')
                .query({ search: 'report' });

            expect(response.status).toBe(200);
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('ILIKE'),
                expect.arrayContaining(['%report%'])
            );
        });

        test('validiert order_by Parameter', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .get('/api/documents')
                .query({ order_by: 'filename', order_dir: 'ASC' });

            expect(response.status).toBe(200);
            // Invalid order_by should default to uploaded_at
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY d.filename ASC'),
                expect.any(Array)
            );
        });

        test('behandelt Datenbankfehler', async () => {
            pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

            const response = await request(app)
                .get('/api/documents');

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Fehler beim Laden der Dokumente');
        });
    });

    // =====================================================
    // GET /api/documents/statistics - Statistics
    // =====================================================
    describe('GET /api/documents/statistics', () => {
        test('gibt Statistiken zurück', async () => {
            const mockStats = {
                total_documents: 100,
                indexed_documents: 80,
                pending_documents: 15,
                failed_documents: 5
            };

            pool.query.mockResolvedValueOnce({ rows: [mockStats] });
            axios.get.mockResolvedValueOnce({
                data: { status: 'running', queue_length: 3 }
            });

            const response = await request(app)
                .get('/api/documents/statistics');

            expect(response.status).toBe(200);
            expect(response.body.total_documents).toBe(100);
            expect(response.body.indexer.status).toBe('running');
        });

        test('behandelt Indexer-Verbindungsfehler graceful', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ total: 50 }] });
            axios.get.mockRejectedValueOnce(new Error('Connection refused'));

            const response = await request(app)
                .get('/api/documents/statistics');

            expect(response.status).toBe(200);
            expect(response.body.indexer.status).toBe('unknown');
        });
    });

    // =====================================================
    // GET /api/documents/categories - Categories
    // =====================================================
    describe('GET /api/documents/categories', () => {
        test('gibt alle Kategorien zurück', async () => {
            const mockCategories = [
                { id: 1, name: 'Allgemein', is_system: true },
                { id: 2, name: 'Berichte', is_system: false }
            ];

            pool.query.mockResolvedValueOnce({ rows: mockCategories });

            const response = await request(app)
                .get('/api/documents/categories');

            expect(response.status).toBe(200);
            expect(response.body.categories).toHaveLength(2);
        });
    });

    // =====================================================
    // GET /api/documents/:id - Single Document
    // =====================================================
    describe('GET /api/documents/:id', () => {
        test('gibt Dokument-Details zurück', async () => {
            const mockDoc = {
                id: 'doc-123',
                filename: 'test.pdf',
                status: 'indexed',
                category_name: 'Reports'
            };

            pool.query
                .mockResolvedValueOnce({ rows: [mockDoc] })
                .mockResolvedValueOnce({ rows: [] });  // Access log

            const response = await request(app)
                .get('/api/documents/doc-123');

            expect(response.status).toBe(200);
            expect(response.body.document.id).toBe('doc-123');
        });

        test('gibt 404 für nicht existierendes Dokument', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .get('/api/documents/nonexistent');

            expect(response.status).toBe(404);
            expect(response.body.error).toBe('Dokument nicht gefunden');
        });
    });

    // =====================================================
    // POST /api/documents/upload - Upload
    // =====================================================
    describe('POST /api/documents/upload', () => {
        test('lädt PDF-Datei erfolgreich hoch', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] })  // Duplicate check
                .mockResolvedValueOnce({ rows: [] });  // Insert

            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('PDF content'), 'test.pdf');

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('uploaded');
            expect(response.body.document.status).toBe('pending');
            expect(mockMinioClient.putObject).toHaveBeenCalled();
        });

        test('lädt DOCX-Datei erfolgreich hoch', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('DOCX content'), 'test.docx');

            expect(response.status).toBe(201);
        });

        test('lädt Markdown-Datei erfolgreich hoch', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('# Markdown'), 'test.md');

            expect(response.status).toBe(201);
        });

        test('gibt 400 ohne Datei', async () => {
            const response = await request(app)
                .post('/api/documents/upload');

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Keine Datei hochgeladen');
        });

        test('lehnt ungültigen Dateityp ab', async () => {
            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('EXE content'), 'virus.exe');

            expect(response.status).toBe(400);
        });

        test('erkennt Duplikate und gibt 409', async () => {
            pool.query.mockResolvedValueOnce({
                rows: [{ id: 'existing-doc', filename: 'test.pdf' }]
            });

            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('PDF content'), 'test.pdf');

            expect(response.status).toBe(409);
            expect(response.body.error).toBe('Dokument existiert bereits');
            expect(response.body.existing_document.id).toBe('existing-doc');
        });

        test('validiert space_id wenn angegeben', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] })  // Space check - not found
                .mockResolvedValueOnce({ rows: [] }); // Duplicate check won't run

            const response = await request(app)
                .post('/api/documents/upload')
                .field('space_id', 'invalid-space')
                .attach('file', Buffer.from('PDF content'), 'test.pdf');

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Ungültiger Wissensbereich');
        });

        test('speichert mit gültiger space_id', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ id: 'space-1' }] })  // Space check
                .mockResolvedValueOnce({ rows: [] })  // Duplicate check
                .mockResolvedValueOnce({ rows: [] })  // Insert
                .mockResolvedValueOnce({ rows: [] }); // Update space statistics

            const response = await request(app)
                .post('/api/documents/upload')
                .field('space_id', 'space-1')
                .attach('file', Buffer.from('PDF content'), 'test.pdf');

            expect(response.status).toBe(201);
            expect(response.body.document.space_id).toBe('space-1');
        });

        test('sanitized Dateiname gegen Path-Traversal', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('content'), '../../../etc/passwd.pdf');

            expect(response.status).toBe(201);
            // Filename should be sanitized
            expect(response.body.document.filename).not.toContain('..');
            expect(response.body.document.filename).not.toContain('/');
        });
    });

    // =====================================================
    // DELETE /api/documents/:id - Delete
    // =====================================================
    describe('DELETE /api/documents/:id', () => {
        test('löscht Dokument erfolgreich', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ file_path: 'path/to/file.pdf' }] })  // Get doc
                .mockResolvedValueOnce({ rows: [] });  // Soft delete

            axios.post.mockResolvedValueOnce({ data: {} });  // Qdrant delete

            const response = await request(app)
                .delete('/api/documents/doc-123');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('deleted');
            expect(mockMinioClient.removeObject).toHaveBeenCalled();
        });

        test('gibt 404 für nicht existierendes Dokument', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .delete('/api/documents/nonexistent');

            expect(response.status).toBe(404);
        });

        test('behandelt MinIO-Löschfehler graceful', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ file_path: 'path/to/file.pdf' }] })
                .mockResolvedValueOnce({ rows: [] });

            mockMinioClient.removeObject.mockRejectedValueOnce(new Error('MinIO error'));
            axios.post.mockResolvedValueOnce({ data: {} });

            const response = await request(app)
                .delete('/api/documents/doc-123');

            // Should still succeed (graceful handling)
            expect(response.status).toBe(200);
            expect(logger.warn).toHaveBeenCalled();
        });

        test('behandelt Qdrant-Löschfehler graceful', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ file_path: 'path/to/file.pdf' }] })
                .mockResolvedValueOnce({ rows: [] });

            axios.post.mockRejectedValueOnce(new Error('Qdrant error'));

            const response = await request(app)
                .delete('/api/documents/doc-123');

            expect(response.status).toBe(200);
            expect(logger.warn).toHaveBeenCalled();
        });
    });

    // =====================================================
    // POST /api/documents/:id/reindex - Reindex
    // =====================================================
    describe('POST /api/documents/:id/reindex', () => {
        test('setzt Dokument-Status auf pending', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ id: 'doc-123' }] })  // Check exists
                .mockResolvedValueOnce({ rows: [] });  // Update status

            const response = await request(app)
                .post('/api/documents/doc-123/reindex');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('queued');
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'pending'"),
                expect.any(Array)
            );
        });

        test('gibt 404 für nicht existierendes Dokument', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .post('/api/documents/nonexistent/reindex');

            expect(response.status).toBe(404);
        });
    });

    // =====================================================
    // PATCH /api/documents/:id - Update Metadata
    // =====================================================
    describe('PATCH /api/documents/:id', () => {
        test('aktualisiert Titel', async () => {
            pool.query.mockResolvedValueOnce({
                rows: [{ id: 'doc-123', title: 'New Title' }]
            });

            const response = await request(app)
                .patch('/api/documents/doc-123')
                .send({ title: 'New Title' });

            expect(response.status).toBe(200);
            expect(response.body.document.title).toBe('New Title');
        });

        test('aktualisiert mehrere Felder', async () => {
            pool.query.mockResolvedValueOnce({
                rows: [{ id: 'doc-123', title: 'New Title', is_favorite: true }]
            });

            const response = await request(app)
                .patch('/api/documents/doc-123')
                .send({
                    title: 'New Title',
                    category_id: 2,
                    is_favorite: true,
                    user_notes: 'Important document'
                });

            expect(response.status).toBe(200);
        });

        test('gibt 400 ohne Updates', async () => {
            const response = await request(app)
                .patch('/api/documents/doc-123')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Keine Aktualisierungen angegeben');
        });

        test('gibt 404 für nicht existierendes Dokument', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .patch('/api/documents/nonexistent')
                .send({ title: 'New Title' });

            expect(response.status).toBe(404);
        });
    });

    // =====================================================
    // PUT /api/documents/:id/move - Move to Space (RAG 2.0)
    // =====================================================
    describe('PUT /api/documents/:id/move', () => {
        test('verschiebt Dokument in anderen Space', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ id: 'doc-123', space_id: 'old-space' }] })  // Get doc
                .mockResolvedValueOnce({ rows: [{ id: 'new-space' }] })  // Check new space
                .mockResolvedValueOnce({ rows: [] })  // Update doc
                .mockResolvedValueOnce({ rows: [] })  // Update old space stats
                .mockResolvedValueOnce({ rows: [] });  // Update new space stats

            const response = await request(app)
                .put('/api/documents/doc-123/move')
                .send({ space_id: 'new-space' });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('moved');
            expect(response.body.old_space_id).toBe('old-space');
            expect(response.body.new_space_id).toBe('new-space');
        });

        test('verschiebt Dokument in keinen Space (unassigned)', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ id: 'doc-123', space_id: 'old-space' }] })
                .mockResolvedValueOnce({ rows: [] })  // Update doc
                .mockResolvedValueOnce({ rows: [] });  // Update old space stats

            const response = await request(app)
                .put('/api/documents/doc-123/move')
                .send({ space_id: null });

            expect(response.status).toBe(200);
            expect(response.body.new_space_id).toBe(null);
        });

        test('gibt 404 für nicht existierendes Dokument', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .put('/api/documents/nonexistent/move')
                .send({ space_id: 'space-1' });

            expect(response.status).toBe(404);
        });

        test('gibt 400 für ungültigen Space', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ id: 'doc-123', space_id: null }] })
                .mockResolvedValueOnce({ rows: [] });  // Space not found

            const response = await request(app)
                .put('/api/documents/doc-123/move')
                .send({ space_id: 'invalid-space' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Ungültiger Wissensbereich');
        });
    });

    // =====================================================
    // GET /api/documents/:id/similar - Similar Documents
    // =====================================================
    describe('GET /api/documents/:id/similar', () => {
        test('gibt ähnliche Dokumente zurück', async () => {
            const mockSimilar = [
                { id: 'doc-2', filename: 'similar1.pdf', similarity: 0.85 },
                { id: 'doc-3', filename: 'similar2.pdf', similarity: 0.72 }
            ];

            pool.query.mockResolvedValueOnce({ rows: mockSimilar });

            const response = await request(app)
                .get('/api/documents/doc-123/similar');

            expect(response.status).toBe(200);
            expect(response.body.document_id).toBe('doc-123');
            expect(response.body.similar_documents).toHaveLength(2);
        });

        test('akzeptiert min_similarity Parameter', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .get('/api/documents/doc-123/similar')
                .query({ min_similarity: 0.9, limit: 5 });

            expect(response.status).toBe(200);
            expect(pool.query).toHaveBeenCalledWith(
                expect.any(String),
                ['doc-123', 0.9, 5]
            );
        });
    });

    // =====================================================
    // POST /api/documents/search - Semantic Search
    // =====================================================
    describe('POST /api/documents/search', () => {
        test('führt semantische Suche durch', async () => {
            // Mock embedding response
            axios.post.mockImplementation((url) => {
                if (url.includes('/embed')) {
                    return Promise.resolve({
                        data: { vectors: [[0.1, 0.2, 0.3]] }
                    });
                }
                if (url.includes('/points/search')) {
                    return Promise.resolve({
                        data: {
                            result: [
                                {
                                    payload: {
                                        document_id: 'doc-1',
                                        document_name: 'test.pdf',
                                        text: 'Relevant content here'
                                    },
                                    score: 0.95
                                }
                            ]
                        }
                    });
                }
                return Promise.resolve({ data: {} });
            });

            pool.query.mockResolvedValue({ rows: [] });  // Access log

            const response = await request(app)
                .post('/api/documents/search')
                .send({ query: 'test query', top_k: 5 });

            expect(response.status).toBe(200);
            expect(response.body.results).toHaveLength(1);
            expect(response.body.results[0].document_id).toBe('doc-1');
        });

        test('gibt 400 ohne Query', async () => {
            const response = await request(app)
                .post('/api/documents/search')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Suchbegriff erforderlich');
        });

        test('gibt 400 für ungültigen Query-Typ', async () => {
            const response = await request(app)
                .post('/api/documents/search')
                .send({ query: 123 });

            expect(response.status).toBe(400);
        });

        test('dedupliziert Ergebnisse nach Dokument-ID', async () => {
            axios.post.mockImplementation((url) => {
                if (url.includes('/embed')) {
                    return Promise.resolve({ data: { vectors: [[0.1, 0.2]] } });
                }
                if (url.includes('/points/search')) {
                    return Promise.resolve({
                        data: {
                            result: [
                                { payload: { document_id: 'doc-1', text: 'chunk 1' }, score: 0.95 },
                                { payload: { document_id: 'doc-1', text: 'chunk 2' }, score: 0.90 },
                                { payload: { document_id: 'doc-2', text: 'other doc' }, score: 0.85 }
                            ]
                        }
                    });
                }
                return Promise.resolve({ data: {} });
            });

            pool.query.mockResolvedValue({ rows: [] });

            const response = await request(app)
                .post('/api/documents/search')
                .send({ query: 'test', top_k: 10 });

            expect(response.status).toBe(200);
            // Should deduplicate to 2 unique documents
            expect(response.body.results).toHaveLength(2);
        });
    });

    // =====================================================
    // GET /api/documents/:id/content - Get Content
    // =====================================================
    describe('GET /api/documents/:id/content', () => {
        test('gibt Markdown-Inhalt zurück', async () => {
            pool.query
                .mockResolvedValueOnce({
                    rows: [{
                        filename: 'test.md',
                        file_path: 'path/test.md',
                        mime_type: 'text/markdown',
                        file_extension: '.md'
                    }]
                })
                .mockResolvedValueOnce({ rows: [] });  // Access log

            // Mock MinIO getObject stream
            const mockStream = {
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('# Test Content\n\nHello World');
                }
            };
            mockMinioClient.getObject.mockResolvedValueOnce(mockStream);

            const response = await request(app)
                .get('/api/documents/doc-123/content');

            expect(response.status).toBe(200);
            expect(response.body.content).toBe('# Test Content\n\nHello World');
            expect(response.body.file_extension).toBe('.md');
        });

        test('gibt 400 für nicht editierbare Dateitypen', async () => {
            pool.query.mockResolvedValueOnce({
                rows: [{
                    filename: 'test.pdf',
                    file_path: 'path/test.pdf',
                    mime_type: 'application/pdf',
                    file_extension: '.pdf'
                }]
            });

            const response = await request(app)
                .get('/api/documents/doc-123/content');

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Dieser Dateityp kann nicht bearbeitet werden');
            expect(response.body.allowed).toContain('.md');
        });

        test('gibt 404 für nicht existierendes Dokument', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .get('/api/documents/nonexistent/content');

            expect(response.status).toBe(404);
        });
    });

    // =====================================================
    // PUT /api/documents/:id/content - Update Content
    // =====================================================
    describe('PUT /api/documents/:id/content', () => {
        test('aktualisiert Markdown-Inhalt', async () => {
            pool.query
                .mockResolvedValueOnce({
                    rows: [{
                        filename: 'test.md',
                        file_path: 'path/test.md',
                        mime_type: 'text/markdown',
                        file_extension: '.md'
                    }]
                })
                .mockResolvedValueOnce({ rows: [] })  // Update document
                .mockResolvedValueOnce({ rows: [] });  // Access log

            const response = await request(app)
                .put('/api/documents/doc-123/content')
                .send({ content: '# Updated Content\n\nNew text here' });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('updated');
            expect(mockMinioClient.putObject).toHaveBeenCalled();
        });

        test('gibt 400 ohne content', async () => {
            const response = await request(app)
                .put('/api/documents/doc-123/content')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Inhalt erforderlich');
        });

        test('gibt 400 für nicht editierbare Dateitypen', async () => {
            pool.query.mockResolvedValueOnce({
                rows: [{
                    filename: 'test.docx',
                    file_path: 'path/test.docx',
                    mime_type: 'application/vnd.openxmlformats',
                    file_extension: '.docx'
                }]
            });

            const response = await request(app)
                .put('/api/documents/doc-123/content')
                .send({ content: 'new content' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Dieser Dateityp kann nicht bearbeitet werden');
        });

        test('setzt Status auf pending nach Update', async () => {
            pool.query
                .mockResolvedValueOnce({
                    rows: [{
                        filename: 'test.md',
                        file_path: 'path/test.md',
                        mime_type: 'text/markdown',
                        file_extension: '.md'
                    }]
                })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .put('/api/documents/doc-123/content')
                .send({ content: 'new content' });

            expect(response.status).toBe(200);
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'pending'"),
                expect.any(Array)
            );
        });
    });

    // =====================================================
    // GET /api/documents/:id/download - Download
    // =====================================================
    describe('GET /api/documents/:id/download', () => {
        test('streamt Datei-Download', async () => {
            pool.query
                .mockResolvedValueOnce({
                    rows: [{
                        filename: 'test.pdf',
                        file_path: 'path/test.pdf',
                        mime_type: 'application/pdf'
                    }]
                })
                .mockResolvedValueOnce({ rows: [] });  // Access log

            // Create a proper mock stream with pipe method
            const mockStream = {
                pipe: jest.fn((res) => {
                    res.end('PDF content');
                })
            };
            mockMinioClient.getObject.mockResolvedValueOnce(mockStream);

            const response = await request(app)
                .get('/api/documents/doc-123/download');

            // Check headers would be set (supertest may have already processed)
            expect(mockMinioClient.getObject).toHaveBeenCalledWith(
                expect.any(String),
                'path/test.pdf'
            );
        });

        test('gibt 404 für nicht existierendes Dokument', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .get('/api/documents/nonexistent/download');

            expect(response.status).toBe(404);
        });
    });

    // =====================================================
    // Filename Sanitization Tests
    // =====================================================
    describe('Filename Sanitization', () => {
        test('entfernt Path-Traversal Versuche', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('content'), '../../etc/passwd.pdf');

            expect(response.status).toBe(201);
            expect(response.body.document.filename).toBe('passwd.pdf');
        });

        test('entfernt führende Punkte', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('content'), '...hidden.md');

            expect(response.status).toBe(201);
            expect(response.body.document.filename).not.toMatch(/^\./);
        });

        test('entfernt Windows-verbotene Zeichen', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('content'), 'file<>:"|?.pdf');

            expect(response.status).toBe(201);
            const filename = response.body.document.filename;
            expect(filename).not.toMatch(/[<>:"|?*]/);
        });

        test('kürzt zu lange Dateinamen', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const longName = 'a'.repeat(300) + '.pdf';
            const response = await request(app)
                .post('/api/documents/upload')
                .attach('file', Buffer.from('content'), longName);

            expect(response.status).toBe(201);
            expect(response.body.document.filename.length).toBeLessThanOrEqual(200);
            expect(response.body.document.filename).toMatch(/\.pdf$/);
        });
    });
});

// =====================================================
// File Filter Tests (Integration with Multer)
// =====================================================
describe('File Type Validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('akzeptiert .pdf', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .post('/api/documents/upload')
            .attach('file', Buffer.from('PDF'), 'test.pdf');

        expect(response.status).toBe(201);
    });

    test('akzeptiert .docx', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .post('/api/documents/upload')
            .attach('file', Buffer.from('DOCX'), 'test.docx');

        expect(response.status).toBe(201);
    });

    test('akzeptiert .md', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .post('/api/documents/upload')
            .attach('file', Buffer.from('MD'), 'test.md');

        expect(response.status).toBe(201);
    });

    test('akzeptiert .txt', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .post('/api/documents/upload')
            .attach('file', Buffer.from('TXT'), 'test.txt');

        expect(response.status).toBe(201);
    });

    test('lehnt .exe ab', async () => {
        const response = await request(app)
            .post('/api/documents/upload')
            .attach('file', Buffer.from('EXE'), 'virus.exe');

        expect(response.status).toBe(400);
    });

    test('lehnt .js ab', async () => {
        const response = await request(app)
            .post('/api/documents/upload')
            .attach('file', Buffer.from('JS'), 'script.js');

        expect(response.status).toBe(400);
    });

    test('lehnt .html ab', async () => {
        const response = await request(app)
            .post('/api/documents/upload')
            .attach('file', Buffer.from('HTML'), 'page.html');

        expect(response.status).toBe(400);
    });
});

// =====================================================
// Security Tests
// =====================================================
describe('Security Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('verhindert SQL-Injection in search Parameter', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .get('/api/documents')
            .query({ search: "'; DROP TABLE documents; --" });

        expect(response.status).toBe(200);
        // Query should use parameterized queries
        expect(pool.query).toHaveBeenCalledWith(
            expect.any(String),
            expect.arrayContaining(["%'; DROP TABLE documents; --%"])
        );
    });

    test('verhindert Injection in order_by Parameter', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .get('/api/documents')
            .query({ order_by: 'filename; DROP TABLE documents;' });

        expect(response.status).toBe(200);
        // Invalid order_by should be ignored and default used
        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('ORDER BY d.uploaded_at'),
            expect.any(Array)
        );
    });

    test('Access Log erfasst Benutzeraktionen', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'doc-123' }] })
            .mockResolvedValueOnce({ rows: [] });  // Access log

        await request(app).get('/api/documents/doc-123');

        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('document_access_log'),
            expect.arrayContaining(['doc-123', 'view', 'testuser'])
        );
    });
});
