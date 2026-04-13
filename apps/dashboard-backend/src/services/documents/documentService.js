/**
 * Document Service — Orchestration Layer
 * Coordinates DB, MinIO, and Qdrant operations for document lifecycle management.
 *
 * Responsibilities:
 * - Document deletion flow (MinIO + DB + Qdrant)
 * - Document move flow (DB + Qdrant payload update)
 * - Batch operations (delete, move, reindex)
 * - Orphan cleanup logic
 * - Statistics gathering
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const pool = require('../../database');
const services = require('../../config/services');
const { ValidationError } = require('../../utils/errors');
const minioService = require('./minioService');
const qdrantService = require('./qdrantService');

const DOCUMENT_INDEXER_HOST = services.documentIndexer.host;
const DOCUMENT_INDEXER_PORT = services.documentIndexer.port;

/**
 * Delete a single document: MinIO file + Qdrant vectors + DB soft-delete.
 * MinIO and Qdrant failures are non-critical (logged, not thrown).
 * @param {string} documentId - Document ID
 * @param {string} filePath - MinIO file path
 * @returns {Promise<void>}
 */
async function deleteDocument(documentId, filePath) {
  // Validate file path before MinIO delete
  if (!minioService.isValidMinioPath(filePath)) {
    logger.error(`Invalid file path detected for deletion: ${filePath}`);
    throw new ValidationError('Ungültiger Dateipfad');
  }

  // Delete from MinIO (non-critical)
  await minioService.removeObject(filePath);

  // Delete from Qdrant (non-critical, with retry)
  const qdrantSuccess = await qdrantService.deleteDocumentVectors(documentId);
  if (!qdrantSuccess) {
    // Mark for later cleanup if Qdrant delete fails
    try {
      await pool.query(`UPDATE documents SET qdrant_cleanup_pending = true WHERE id = $1`, [
        documentId,
      ]);
    } catch {
      // Column may not exist yet - non-critical
    }
  }

  // Soft delete in database
  await pool.query(`UPDATE documents SET deleted_at = NOW(), status = 'deleted' WHERE id = $1`, [
    documentId,
  ]);
}

/**
 * Move a document to a new space: DB update + Qdrant payload sync.
 * @param {string} documentId - Document ID
 * @param {string|null} oldSpaceId - Current space ID
 * @param {string|null} newSpaceId - Target space ID (null for unassigned)
 * @returns {Promise<void>}
 */
async function moveDocument(documentId, oldSpaceId, newSpaceId) {
  // Get new space details for Qdrant payload
  let newSpaceName = '';
  let newSpaceSlug = '';
  if (newSpaceId) {
    const spaceDetails = await pool.query('SELECT name, slug FROM knowledge_spaces WHERE id = $1', [
      newSpaceId,
    ]);
    if (spaceDetails.rows.length > 0) {
      newSpaceName = spaceDetails.rows[0].name;
      newSpaceSlug = spaceDetails.rows[0].slug;
    }
  }

  // Update document's space in DB
  await pool.query(`UPDATE documents SET space_id = $1, updated_at = NOW() WHERE id = $2`, [
    newSpaceId,
    documentId,
  ]);

  // Update Qdrant payloads for all chunks of this document
  await qdrantService.updateDocumentSpacePayload(
    documentId,
    newSpaceId,
    newSpaceName,
    newSpaceSlug
  );

  // Update statistics for both old and new spaces (non-critical)
  await updateSpaceStatistics(oldSpaceId);
  await updateSpaceStatistics(newSpaceId);

  logger.info(`Document ${documentId} moved from space ${oldSpaceId} to ${newSpaceId}`);
}

/**
 * Batch delete multiple documents.
 * @param {string[]} ids - Document IDs to delete
 * @returns {Promise<{deleted: number, errors: Array}>}
 */
async function batchDelete(ids) {
  let deleted = 0;
  const errors = [];

  // Batch fetch all documents in one query
  const docResult = await pool.query(
    'SELECT id, file_path FROM documents WHERE id = ANY($1) AND deleted_at IS NULL',
    [ids]
  );
  const docsById = new Map(docResult.rows.map(r => [r.id, r]));

  for (const id of ids) {
    const doc = docsById.get(id);
    if (!doc) {continue;}

    try {
      // Delete from MinIO
      if (doc.file_path && minioService.isValidMinioPath(doc.file_path)) {
        await minioService.removeObject(doc.file_path);
      }

      // Delete from Qdrant
      await qdrantService.deleteDocumentVectorsSimple(id);

      deleted++;
    } catch (err) {
      errors.push({ id, error: err.message });
    }
  }

  // Batch soft delete in DB
  if (deleted > 0 || docResult.rows.length > 0) {
    const successIds = ids.filter(id => docsById.has(id) && !errors.some(e => e.id === id));
    if (successIds.length > 0) {
      await pool.query(
        "UPDATE documents SET deleted_at = NOW(), status = 'deleted' WHERE id = ANY($1)",
        [successIds]
      );
    }
  }

  logger.info(`Batch delete: ${deleted}/${ids.length} documents deleted`);
  return { deleted, errors };
}

/**
 * Batch reindex multiple documents.
 * @param {string[]} ids - Document IDs to reindex
 * @returns {Promise<{queued: number}>}
 */
async function batchReindex(ids) {
  const result = await pool.query(
    `UPDATE documents SET status = 'pending', retry_count = 0
     WHERE id = ANY($1) AND deleted_at IS NULL
     RETURNING id`,
    [ids]
  );

  logger.info(`Batch reindex: ${result.rowCount}/${ids.length} documents queued`);
  return { queued: result.rowCount };
}

/**
 * Batch move multiple documents to a space.
 * @param {string[]} ids - Document IDs to move
 * @param {string|null} newSpaceId - Target space ID
 * @returns {Promise<{moved: number}>}
 */
async function batchMove(ids, newSpaceId) {
  // Get old space IDs for statistics update
  const oldSpaceIds = await pool.query(
    `SELECT DISTINCT space_id FROM documents WHERE id = ANY($1) AND space_id IS NOT NULL AND deleted_at IS NULL`,
    [ids]
  );

  const result = await pool.query(
    `UPDATE documents SET space_id = $1, updated_at = NOW()
     WHERE id = ANY($2) AND deleted_at IS NULL
     RETURNING id`,
    [newSpaceId, ids]
  );

  // Get new space details for Qdrant payload
  let newSpaceName = '';
  let newSpaceSlug = '';
  if (newSpaceId) {
    const spaceDetails = await pool.query('SELECT name, slug FROM knowledge_spaces WHERE id = $1', [
      newSpaceId,
    ]);
    if (spaceDetails.rows.length > 0) {
      newSpaceName = spaceDetails.rows[0].name;
      newSpaceSlug = spaceDetails.rows[0].slug;
    }
  }

  // Update Qdrant payloads for all moved documents (non-critical)
  const movedIds = result.rows.map(r => r.id);
  for (const docId of movedIds) {
    try {
      await qdrantService.updateDocumentSpacePayload(docId, newSpaceId, newSpaceName, newSpaceSlug);
    } catch (e) {
      logger.warn(`Batch move: Failed to update Qdrant for doc ${docId}: ${e.message}`);
    }
  }

  // Update space statistics for old and new spaces (non-critical)
  const spaceIdsToUpdate = new Set(oldSpaceIds.rows.map(r => r.space_id));
  if (newSpaceId) {
    spaceIdsToUpdate.add(newSpaceId);
  }
  for (const sid of spaceIdsToUpdate) {
    await updateSpaceStatistics(sid);
  }

  logger.info(
    `Batch move: ${result.rowCount}/${ids.length} documents moved to space ${newSpaceId}`
  );

  return { moved: result.rowCount };
}

/**
 * Detect and clean up orphaned files.
 * @param {boolean} dryRun - If true, only report without cleaning
 * @returns {Promise<Object>} Cleanup results
 */
async function cleanupOrphaned(dryRun) {
  // 1. Get all file_paths from DB (non-deleted documents)
  const dbResult = await pool.query(
    'SELECT id, filename, file_path, file_size, status FROM documents WHERE deleted_at IS NULL'
  );
  const dbPaths = new Set(dbResult.rows.map(r => r.file_path));
  const dbPathToDoc = new Map(dbResult.rows.map(r => [r.file_path, r]));

  // 2. List all objects in MinIO bucket
  let minioPaths;
  try {
    minioPaths = await minioService.listAllObjects();
  } catch (err) {
    logger.error(`Cleanup: Failed to list MinIO objects: ${err.message}`);
    throw new ValidationError('MinIO nicht erreichbar — Bereinigung nicht möglich');
  }

  // 3. Find orphaned MinIO files (in MinIO but not in DB)
  const orphanedInMinio = [];
  for (const minioPath of minioPaths) {
    if (!dbPaths.has(minioPath)) {
      orphanedInMinio.push(minioPath);
    }
  }

  // 4. Find orphaned DB records (in DB but file missing from MinIO)
  const orphanedInDb = [];
  for (const [dbPath, doc] of dbPathToDoc) {
    if (!minioPaths.has(dbPath)) {
      orphanedInDb.push({
        id: doc.id,
        filename: doc.filename,
        file_path: dbPath,
        status: doc.status,
      });
    }
  }

  // 5. Clean up if not dry run
  let deletedFromMinio = 0;
  let markedInDb = 0;

  if (!dryRun) {
    // Remove orphaned files from MinIO
    for (const orphanPath of orphanedInMinio) {
      if (!minioService.isValidMinioPath(orphanPath)) {
        logger.warn(`Cleanup: Skipping invalid path: ${orphanPath}`);
        continue;
      }
      try {
        const minio = minioService.getMinioClient();
        await minio.removeObject(minioService.MINIO_BUCKET, orphanPath);
        deletedFromMinio++;
        logger.info(`Cleanup: Removed orphaned MinIO file: ${orphanPath}`);
      } catch (err) {
        logger.warn(`Cleanup: Failed to remove ${orphanPath}: ${err.message}`);
      }
    }

    // Mark orphaned DB records as failed (batch update)
    if (orphanedInDb.length > 0) {
      const orphanIds = orphanedInDb.map(o => o.id);
      try {
        const updateResult = await pool.query(
          `UPDATE documents SET status = 'failed', error_message = 'Datei in MinIO nicht gefunden (Bereinigung)' WHERE id = ANY($1)`,
          [orphanIds]
        );
        markedInDb = updateResult.rowCount;
        logger.info(`Cleanup: Marked ${markedInDb} orphaned DB records as failed`);
      } catch (err) {
        logger.warn(`Cleanup: Failed to batch update orphaned records: ${err.message}`);
      }
    }
  }

  // Also clean up soft-deleted documents older than 30 days
  let purgedCount = 0;
  if (!dryRun) {
    const purgeResult = await pool.query(
      `DELETE FROM documents WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days' RETURNING id, file_path`
    );
    for (const row of purgeResult.rows) {
      if (row.file_path && minioService.isValidMinioPath(row.file_path)) {
        try {
          const minio = minioService.getMinioClient();
          await minio.removeObject(minioService.MINIO_BUCKET, row.file_path);
        } catch {
          /* already gone */
        }
      }
      purgedCount++;
    }
    if (purgedCount > 0) {
      logger.info(`Cleanup: Purged ${purgedCount} soft-deleted documents older than 30 days`);
    }
  }

  return {
    dryRun,
    orphanedInMinio,
    orphanedInDb,
    deletedFromMinio,
    markedInDb,
    purgedCount,
  };
}

/**
 * Get document statistics (with optional filters).
 * @param {Object} filters - { space_id, status, category_id }
 * @returns {Promise<Object>} Statistics object
 */
async function getStatistics(filters) {
  const { space_id, status, category_id } = filters;
  const hasFilters = space_id || status || category_id;
  let stats;

  if (hasFilters) {
    const result = await pool.query('SELECT * FROM get_filtered_document_statistics($1, $2, $3)', [
      space_id || null,
      status || null,
      category_id ? parseInt(category_id, 10) : null,
    ]);
    stats = result.rows[0];
  } else {
    const result = await pool.query('SELECT * FROM get_document_statistics()');
    stats = result.rows[0];
  }

  // Get table count from data-db (cross-db) with matching filters
  let tableCount = 0;
  try {
    const dataDb = require('../../dataDatabase');

    const tableConditions = [];
    const tableParams = [];
    let tParamIndex = 1;

    if (space_id) {
      tableConditions.push(`space_id = $${tParamIndex++}`);
      tableParams.push(space_id);
    }
    if (status) {
      const statusMap = { indexed: 'active', pending: 'draft', failed: 'archived' };
      const tableStatus = statusMap[status] || status;
      tableConditions.push(`status = $${tParamIndex++}`);
      tableParams.push(tableStatus);
    }
    if (category_id) {
      const catResult = await pool.query('SELECT name FROM document_categories WHERE id = $1', [
        parseInt(category_id, 10),
      ]);
      if (catResult.rows.length > 0) {
        tableConditions.push(`category = $${tParamIndex++}`);
        tableParams.push(catResult.rows[0].name);
      } else {
        tableConditions.push('1 = 0');
      }
    }

    const tableWhere = tableConditions.length > 0 ? `WHERE ${tableConditions.join(' AND ')}` : '';
    const tcResult = await dataDb.query(
      `SELECT COUNT(*)::int as count FROM dt_tables ${tableWhere}`,
      tableParams
    );
    tableCount = tcResult.rows[0].count;
  } catch (e) {
    logger.warn(`Failed to get table count from data-db: ${e.message}`);
  }

  // Get indexer status (non-critical)
  let indexerStatus = { status: 'unknown' };
  try {
    const indexerResponse = await axios.get(
      `http://${DOCUMENT_INDEXER_HOST}:${DOCUMENT_INDEXER_PORT}/status`,
      { timeout: 5000 }
    );
    indexerStatus = indexerResponse.data;
  } catch (e) {
    logger.warn(`Failed to get indexer status: ${e.message}`);
  }

  return {
    total_documents: Number(stats.total_documents) || 0,
    indexed_documents: Number(stats.indexed_documents) || 0,
    pending_documents: Number(stats.pending_documents) || 0,
    failed_documents: Number(stats.failed_documents) || 0,
    total_chunks: Number(stats.total_chunks) || 0,
    total_size_bytes: Number(stats.total_size_bytes) || 0,
    documents_by_category: stats.documents_by_category,
    table_count: tableCount,
    indexer: indexerStatus,
  };
}

/**
 * Get storage usage information.
 * @returns {Promise<Object>}
 */
async function getStorageInfo() {
  const usage = await minioService.getStorageUsage();
  const quotaBytes =
    parseInt(process.env.MINIO_DOCUMENTS_QUOTA_BYTES || '0') || 200 * 1024 * 1024 * 1024;

  const countResult = await pool.query(
    'SELECT COUNT(*) as total, COALESCE(SUM(file_size), 0) as total_size FROM documents WHERE deleted_at IS NULL'
  );
  const { total, total_size } = countResult.rows[0];

  return {
    documents: parseInt(total),
    used_bytes: usage ? usage.usedBytes : parseInt(total_size),
    quota_bytes: quotaBytes,
    usage_percent: usage ? Math.round((usage.usedBytes / quotaBytes) * 100) : null,
  };
}

/**
 * Update space statistics (non-critical).
 * @param {string|null} spaceId - Space ID to update
 */
async function updateSpaceStatistics(spaceId) {
  if (!spaceId) {
    return;
  }
  try {
    await pool.query('SELECT update_space_statistics($1)', [spaceId]);
  } catch (e) {
    logger.warn(`Failed to update space statistics: ${e.message}`);
  }
}

module.exports = {
  deleteDocument,
  moveDocument,
  batchDelete,
  batchReindex,
  batchMove,
  cleanupOrphaned,
  getStatistics,
  getStorageInfo,
  updateSpaceStatistics,
};
