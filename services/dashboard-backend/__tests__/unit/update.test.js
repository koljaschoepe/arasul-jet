const request = require('supertest');
const express = require('express');

// Mock dependencies
jest.mock('../../src/database', () => ({
    query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

jest.mock('../../src/services/updateService', () => ({
    validateUpdate: jest.fn(),
    getUpdateState: jest.fn(),
    applyUpdate: jest.fn()
}));

jest.mock('../../src/middleware/auth', () => ({
    requireAuth: (req, res, next) => {
        req.user = { id: 1, username: 'admin', role: 'admin' };
        next();
    }
}));

// Mock multer to bypass actual file handling
jest.mock('multer', () => {
    const multer = () => ({
        fields: () => (req, res, next) => next()
    });
    multer.diskStorage = () => { };
    return multer;
});

// Mock fs.promises
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn().mockResolvedValue(undefined),
        rename: jest.fn().mockResolvedValue(undefined),
        unlink: jest.fn().mockResolvedValue(undefined),
        access: jest.fn().mockResolvedValue(undefined)
    }
}));

// Import dependencies after mocking
const updateRouter = require('../../src/routes/update');
const updateService = require('../../src/services/updateService');
const { errorHandler } = require('../../src/middleware/errorHandler');

const app = express();
app.use(express.json());

// Test middleware to inject req.files
app.use((req, res, next) => {
    if (req.headers['x-test-files']) {
        req.files = JSON.parse(req.headers['x-test-files']);
    }
    next();
});

app.use('/api/update', updateRouter);

// Error handler middleware (required for asyncHandler errors)
app.use(errorHandler);

describe('Update API Routes', () => {
    const validFiles = {
        file: [{
            fieldname: 'file',
            originalname: 'update.araupdate',
            destination: '/tmp/updates',
            filename: 'update.araupdate',
            path: '/tmp/updates/update.araupdate',
            size: 1024
        }],
        signature: [{
            fieldname: 'signature',
            originalname: 'update.araupdate.sig',
            destination: '/tmp/updates',
            filename: 'update.araupdate.sig',
            path: '/tmp/updates/update.araupdate.sig',
            size: 128
        }]
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/update/upload', () => {
        it('should reject if no file is uploaded', async () => {
            const response = await request(app)
                .post('/api/update/upload');

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('No update file uploaded');
        });

        it('should reject if signature is missing', async () => {
            const files = { ...validFiles };
            delete files.signature;

            const response = await request(app)
                .post('/api/update/upload')
                .set('x-test-files', JSON.stringify(files));

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Signature file is required for update validation');
        });

        it('should accept valid update and signature files', async () => {
            updateService.validateUpdate.mockResolvedValue({
                valid: true,
                manifest: {
                    version: '1.1.0',
                    components: []
                }
            });

            const response = await request(app)
                .post('/api/update/upload')
                .set('x-test-files', JSON.stringify(validFiles));

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('validated');
            expect(response.body.version).toBe('1.1.0');
        });

        it('should handle validation failure', async () => {
            updateService.validateUpdate.mockResolvedValue({
                valid: false,
                error: 'Invalid signature'
            });

            const response = await request(app)
                .post('/api/update/upload')
                .set('x-test-files', JSON.stringify(validFiles));

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid signature');
        });
    });

    describe('POST /api/update/apply', () => {
        it('should start update if valid', async () => {
            updateService.getUpdateState.mockResolvedValue({ status: 'idle' });
            updateService.applyUpdate.mockResolvedValue({ success: true });

            const response = await request(app)
                .post('/api/update/apply')
                .send({ file_path: '/arasul/updates/update.araupdate' });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('started');
            expect(updateService.applyUpdate).toHaveBeenCalledWith('/arasul/updates/update.araupdate');
        });

        it('should reject if update already in progress', async () => {
            updateService.getUpdateState.mockResolvedValue({
                status: 'in_progress',
                currentStep: 'backup'
            });

            const response = await request(app)
                .post('/api/update/apply')
                .send({ file_path: '/arasul/updates/update.araupdate' });

            expect(response.status).toBe(409);
            expect(response.body.error).toBe('Update already in progress');
        });

        it('should reject if file path missing', async () => {
            const response = await request(app)
                .post('/api/update/apply')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Update file path is required');
        });
    });
});
