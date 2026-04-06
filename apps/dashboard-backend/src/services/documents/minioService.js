/**
 * MinIO Service for Document Storage
 * Handles all MinIO object storage operations for the document management system.
 *
 * Responsibilities:
 * - MinIO client singleton management
 * - File upload / download / delete operations
 * - Filename sanitization and path validation
 * - Bucket quota enforcement
 */

const path = require('path');
const Minio = require('minio');
const logger = require('../../utils/logger');
const services = require('../../config/services');

// Configuration (using centralized service config)
const MINIO_HOST = services.minio.host;
const MINIO_PORT = services.minio.port;
const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER;
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD;
const MINIO_BUCKET = process.env.DOCUMENT_INDEXER_MINIO_BUCKET || 'documents';

if (!MINIO_ROOT_USER || !MINIO_ROOT_PASSWORD) {
  logger.error('MINIO_ROOT_USER and MINIO_ROOT_PASSWORD must be set in environment');
}

// MinIO client singleton
let minioClient = null;

/**
 * Get or create the MinIO client singleton
 * @returns {Minio.Client}
 */
function getMinioClient() {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: MINIO_HOST,
      port: MINIO_PORT,
      useSSL: false,
      accessKey: MINIO_ROOT_USER,
      secretKey: MINIO_ROOT_PASSWORD,
    });
  }
  return minioClient;
}

/**
 * SECURITY: Sanitize filename to prevent path traversal attacks
 * - Removes directory components (../, ./, /)
 * - Removes dangerous characters
 * - Limits length
 * @param {string} filename - Raw filename from user input
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // Get only the basename (removes directory traversal attempts)
  let sanitized = path.basename(filename);

  // Remove any remaining path separators and dangerous characters
  sanitized = sanitized
    .replace(/[/\\]/g, '_') // Replace slashes with underscores
    .replace(/\.\./g, '_') // Replace double dots
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1F]/g, '') // Remove Windows forbidden chars and control chars
    .replace(/^\.+/, '') // Remove leading dots (hidden files)
    .trim();

  // Limit length (preserve extension)
  const maxLength = 200;
  if (sanitized.length > maxLength) {
    const ext = path.extname(sanitized);
    const nameWithoutExt = sanitized.slice(0, -(ext.length || 0));
    sanitized = nameWithoutExt.slice(0, maxLength - ext.length) + ext;
  }

  // Fallback if empty after sanitization
  if (!sanitized || sanitized === '') {
    sanitized = 'unnamed_file';
  }

  return sanitized;
}

/**
 * Validate file path from database before MinIO operations.
 * Prevents path traversal attacks from manipulated database entries.
 * @param {string} filePath - The file path to validate
 * @returns {boolean} True if path is safe, false otherwise
 */
function isValidMinioPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Check for path traversal sequences
  if (filePath.includes('..') || filePath.includes('./')) {
    return false;
  }

  // Must not start with slash (absolute path)
  if (filePath.startsWith('/')) {
    return false;
  }

  // Must not contain backslashes (Windows path)
  if (filePath.includes('\\')) {
    return false;
  }

  // Must not contain null bytes
  if (filePath.includes('\x00')) {
    return false;
  }

  return true;
}

/**
 * Check if bucket has enough space (quota enforcement).
 * @param {Minio.Client} minio - MinIO client instance
 * @param {string} bucket - Bucket name
 * @returns {Promise<{usedBytes: number}|null>} Usage info or null if check not available
 */
async function checkBucketQuota(minio, bucket) {
  try {
    let totalSize = 0;
    const stream = minio.listObjectsV2(bucket, '', true);
    for await (const obj of stream) {
      totalSize += obj.size || 0;
    }
    return { usedBytes: totalSize };
  } catch {
    return null; // Quota check not available, allow upload
  }
}

/**
 * Upload a file to MinIO.
 * @param {string} objectName - Object key in MinIO
 * @param {Buffer} buffer - File contents
 * @param {number} size - File size in bytes
 * @param {Object} metadata - Content-Type and other metadata
 * @returns {Promise<void>}
 */
async function uploadObject(objectName, buffer, size, metadata) {
  const minio = getMinioClient();
  await minio.putObject(MINIO_BUCKET, objectName, buffer, size, metadata);
  logger.info(`Uploaded file to MinIO: ${objectName}`);
}

/**
 * Get an object stream from MinIO.
 * @param {string} objectName - Object key in MinIO
 * @returns {Promise<NodeJS.ReadableStream>}
 */
function getObject(objectName) {
  const minio = getMinioClient();
  return minio.getObject(MINIO_BUCKET, objectName);
}

/**
 * Get object metadata from MinIO.
 * @param {string} objectName - Object key in MinIO
 * @returns {Promise<Object>}
 */
function statObject(objectName) {
  const minio = getMinioClient();
  return minio.statObject(MINIO_BUCKET, objectName);
}

/**
 * Remove an object from MinIO (non-critical, logs warnings on failure).
 * @param {string} filePath - Object key to remove
 * @returns {Promise<boolean>} True if removed successfully
 */
async function removeObject(filePath) {
  try {
    const minio = getMinioClient();
    await minio.removeObject(MINIO_BUCKET, filePath);
    logger.info(`Deleted file from MinIO: ${filePath}`);
    return true;
  } catch (e) {
    logger.warn(`Failed to delete from MinIO: ${e.message}`);
    return false;
  }
}

/**
 * List all objects in the documents bucket.
 * @returns {Promise<Set<string>>} Set of object names
 */
async function listAllObjects() {
  const minio = getMinioClient();
  const paths = new Set();
  const stream = minio.listObjectsV2(MINIO_BUCKET, '', true);
  for await (const obj of stream) {
    paths.add(obj.name);
  }
  return paths;
}

/**
 * Get storage usage for the documents bucket.
 * @returns {Promise<{usedBytes: number}|null>}
 */
function getStorageUsage() {
  const minio = getMinioClient();
  return checkBucketQuota(minio, MINIO_BUCKET);
}

/**
 * Enforce bucket quota before upload.
 * @param {number} fileSize - Size of file to upload
 * @throws {Error} If quota would be exceeded
 * @returns {Promise<void>}
 */
async function enforceQuota(fileSize) {
  const { ValidationError } = require('../../utils/errors');
  const BUCKET_QUOTA_BYTES =
    parseInt(process.env.MINIO_DOCUMENTS_QUOTA_BYTES || '0') || 200 * 1024 * 1024 * 1024;
  if (BUCKET_QUOTA_BYTES > 0) {
    const minio = getMinioClient();
    const usage = await checkBucketQuota(minio, MINIO_BUCKET);
    if (usage && usage.usedBytes + fileSize > BUCKET_QUOTA_BYTES) {
      const usedGB = (usage.usedBytes / 1024 ** 3).toFixed(1);
      const limitGB = (BUCKET_QUOTA_BYTES / 1024 ** 3).toFixed(0);
      throw new ValidationError(
        `Speicherlimit erreicht (${usedGB} GB / ${limitGB} GB). Bitte löschen Sie nicht benötigte Dokumente.`
      );
    }
  }
}

module.exports = {
  getMinioClient,
  sanitizeFilename,
  isValidMinioPath,
  checkBucketQuota,
  uploadObject,
  getObject,
  statObject,
  removeObject,
  listAllObjects,
  getStorageUsage,
  enforceQuota,
  MINIO_BUCKET,
};
