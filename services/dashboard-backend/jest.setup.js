/**
 * Jest Setup File
 * Sets required environment variables before tests run
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jwt-testing-minimum-32-chars';
process.env.JWT_EXPIRY = '24h';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_USER = 'test';
process.env.POSTGRES_PASSWORD = 'test';
process.env.POSTGRES_DB = 'test_db';
process.env.LLM_SERVICE_HOST = 'localhost';
process.env.LLM_SERVICE_PORT = '11434';
process.env.EMBEDDING_SERVICE_HOST = 'localhost';
process.env.EMBEDDING_SERVICE_PORT = '11435';
process.env.QDRANT_HOST = 'localhost';
process.env.QDRANT_PORT = '6333';
process.env.MINIO_HOST = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ROOT_USER = 'test';
process.env.MINIO_ROOT_PASSWORD = 'test-password';
