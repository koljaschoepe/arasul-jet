/**
 * Datentabellen Indexing Service
 * Handles embedding and Qdrant vector storage for user-created tables
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const dataDb = require('../../dataDatabase');
const services = require('../../config/services');
const { escapeTableName } = require('../../utils/sqlIdentifier');
const { getEmbeddings } = require('../embeddingService');

const QDRANT_HOST = services.qdrant?.host || 'qdrant';
const QDRANT_PORT = services.qdrant?.port || 6333;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const BATCH_SIZE = 10;

/**
 * Index all rows of a table into Qdrant
 * @param {string} slug - Table slug
 * @returns {{ indexed: number, tableName: string }}
 */
async function indexTable(slug) {
  const tableResult = await dataDb.query('SELECT * FROM dt_tables WHERE slug = $1', [slug]);
  if (tableResult.rows.length === 0) {
    throw new Error(`Table not found: ${slug}`);
  }

  const table = tableResult.rows[0];
  const fieldsResult = await dataDb.query(
    'SELECT * FROM dt_fields WHERE table_id = $1 ORDER BY field_order',
    [table.id]
  );
  const fields = fieldsResult.rows;

  const rowsResult = await dataDb.query(`SELECT * FROM ${escapeTableName(slug)}`);
  const rows = rowsResult.rows;

  if (rows.length === 0) {
    // Clear any old vectors and update tracking
    await deleteTableVectors(table.id);
    await updateIndexTracking(slug, 0);
    return { indexed: 0, tableName: table.name };
  }

  // Convert rows to text for embedding
  const rowTexts = rows.map(row => {
    const parts = [`Tabelle: ${table.name}`];
    fields.forEach(field => {
      const value = row[field.slug];
      if (value !== null && value !== undefined && value !== '') {
        parts.push(`${field.name}: ${value}`);
      }
    });
    return parts.join('\n');
  });

  // Batch embed
  const allPoints = [];
  for (let i = 0; i < rowTexts.length; i += BATCH_SIZE) {
    const batch = rowTexts.slice(i, i + BATCH_SIZE);
    const batchRows = rows.slice(i, i + BATCH_SIZE);

    const vectors = await getEmbeddings(batch);
    if (!vectors) {
      logger.warn(`[IndexingService] Embedding batch failed, skipping ${batch.length} rows`);
      continue;
    }

    vectors.forEach((vector, idx) => {
      const row = batchRows[idx];
      const pointId = crypto
        .createHash('md5')
        .update(`datentabelle:${table.id}:${row._id}`)
        .digest('hex');

      allPoints.push({
        id: pointId,
        vector,
        payload: {
          source_type: 'datentabelle',
          table_id: table.id,
          table_slug: slug,
          table_name: table.name,
          row_id: row._id,
          text: batch[idx],
          indexed_at: Date.now() / 1000,
          preview: fields
            .slice(0, 3)
            .map(f => row[f.slug])
            .filter(v => v)
            .join(' | '),
        },
      });
    });
  }

  // Delete old vectors, then upsert new
  await deleteTableVectors(table.id);

  if (allPoints.length > 0) {
    await axios.put(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points`,
      { points: allPoints },
      { timeout: 60000 }
    );
  }

  // Update tracking fields
  await updateIndexTracking(slug, allPoints.length);

  return { indexed: allPoints.length, tableName: table.name };
}

/**
 * Delete all vectors for a table from Qdrant
 */
async function deleteTableVectors(tableId) {
  try {
    await axios.post(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/delete`,
      {
        filter: {
          must: [
            { key: 'source_type', match: { value: 'datentabelle' } },
            { key: 'table_id', match: { value: tableId } },
          ],
        },
      },
      { timeout: 30000 }
    );
  } catch (err) {
    logger.warn(`[IndexingService] Delete old vectors failed: ${err.message}`);
  }
}

/**
 * Remove table index from Qdrant
 * @param {string} slug - Table slug
 */
async function removeTableIndex(slug) {
  const tableResult = await dataDb.query('SELECT id, name FROM dt_tables WHERE slug = $1', [slug]);
  if (tableResult.rows.length === 0) {
    throw new Error(`Table not found: ${slug}`);
  }

  await deleteTableVectors(tableResult.rows[0].id);
  await dataDb.query(
    'UPDATE dt_tables SET last_indexed_at = NULL, index_row_count = 0, needs_reindex = FALSE WHERE slug = $1',
    [slug]
  );

  return { tableName: tableResult.rows[0].name };
}

/**
 * Update index tracking columns after indexing
 */
async function updateIndexTracking(slug, rowCount) {
  await dataDb.query(
    'UPDATE dt_tables SET needs_reindex = FALSE, last_indexed_at = NOW(), index_row_count = $1 WHERE slug = $2',
    [rowCount, slug]
  );
}

/**
 * Get indexing status for a table
 * @param {string} slug - Table slug
 */
async function getIndexStatus(slug) {
  const tableResult = await dataDb.query(
    'SELECT id, name, needs_reindex, last_indexed_at, index_row_count FROM dt_tables WHERE slug = $1',
    [slug]
  );

  if (tableResult.rows.length === 0) {
    throw new Error(`Table not found: ${slug}`);
  }

  const table = tableResult.rows[0];

  // Count actual vectors in Qdrant
  let indexedRows = 0;
  try {
    const countResponse = await axios.post(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/count`,
      {
        filter: {
          must: [
            { key: 'source_type', match: { value: 'datentabelle' } },
            { key: 'table_id', match: { value: table.id } },
          ],
        },
      },
      { timeout: 10000 }
    );
    indexedRows = countResponse.data.result?.count || 0;
  } catch {
    // Qdrant unavailable — use cached count
    indexedRows = table.index_row_count || 0;
  }

  const rowCountResult = await dataDb.query(
    `SELECT COUNT(*)::int as count FROM ${escapeTableName(slug)}`
  );
  const totalRows = rowCountResult.rows[0].count;

  return {
    table: table.name,
    indexed_rows: indexedRows,
    total_rows: totalRows,
    is_indexed: indexedRows > 0,
    is_complete: indexedRows === totalRows && !table.needs_reindex,
    needs_reindex: table.needs_reindex,
    last_indexed_at: table.last_indexed_at,
  };
}

module.exports = {
  indexTable,
  removeTableIndex,
  getIndexStatus,
};
