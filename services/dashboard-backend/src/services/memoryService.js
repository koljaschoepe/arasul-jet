/**
 * Memory Service
 * Persistent AI memory system with MinIO storage + Qdrant vector search.
 *
 * Features:
 *  - Extract memories from conversations (LLM-based)
 *  - Store memories in PostgreSQL (metadata) + Qdrant (vectors)
 *  - Semantic search for relevant memories per query
 *  - Profile management (YAML in MinIO)
 *  - Memory deduplication via cosine similarity (>0.9)
 *  - Hard limits to prevent context overflow
 */

const Minio = require('minio');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const database = require('../database');
const services = require('../config/services');
const { estimateTokens } = require('./tokenService');

// Service URLs
const EMBEDDING_URL = services.embedding.embedEndpoint;
const QDRANT_URL = services.qdrant.url;
const LLM_SERVICE_URL = services.llm.url;

// Memory limits
const MAX_MEMORIES = 500;
const MAX_TIER2_SNIPPETS = 3;
const MAX_TIER2_TOKENS = 400;
const MAX_PROFILE_BYTES = 2048;
const DEDUP_THRESHOLD = 0.9;
const MEMORY_COLLECTION = 'memories';
const MEMORY_BUCKET = 'memory';

// MinIO client (lazy init)
let minioClient = null;

function getMinioClient() {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: services.minio.host,
      port: services.minio.port,
      useSSL: false,
      accessKey: process.env.MINIO_ROOT_USER,
      secretKey: process.env.MINIO_ROOT_PASSWORD,
    });
  }
  return minioClient;
}

// ============================================================================
// Embedding Helper
// ============================================================================

/**
 * Get embedding vector for text via embedding service.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {throw new Error(`Embedding service returned ${response.status}`);}
  const data = await response.json();
  return data.vectors[0];
}

// ============================================================================
// Qdrant Collection Management
// ============================================================================

/**
 * Ensure the memories Qdrant collection exists.
 */
async function ensureQdrantCollection() {
  try {
    const resp = await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {return;} // Already exists

    // Get vector dimension from embedding service
    let dimension = 1024; // Default for BGE-M3
    try {
      const testEmbed = await getEmbedding('test');
      dimension = testEmbed.length;
    } catch {
      // Use default
    }

    await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: dimension, distance: 'Cosine' },
      }),
      signal: AbortSignal.timeout(10000),
    });
    logger.info(`[Memory] Created Qdrant collection '${MEMORY_COLLECTION}' (dim=${dimension})`);
  } catch (err) {
    logger.warn(`[Memory] Could not ensure Qdrant collection: ${err.message}`);
  }
}

// ============================================================================
// MinIO Operations
// ============================================================================

/**
 * Ensure the memory bucket exists in MinIO.
 */
async function ensureBucket() {
  try {
    const client = getMinioClient();
    const exists = await client.bucketExists(MEMORY_BUCKET);
    if (!exists) {
      await client.makeBucket(MEMORY_BUCKET);
      logger.info(`[Memory] Created MinIO bucket '${MEMORY_BUCKET}'`);
    }
  } catch (err) {
    logger.warn(`[Memory] Could not ensure bucket: ${err.message}`);
  }
}

/**
 * Read a file from MinIO.
 * @param {string} path - Object path within memory bucket
 * @returns {Promise<string|null>}
 */
async function readFile(path) {
  try {
    const client = getMinioClient();
    const stream = await client.getObject(MEMORY_BUCKET, path);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.code === 'NotFound') {return null;}
    logger.debug(`[Memory] readFile(${path}) error: ${err.message}`);
    return null;
  }
}

/**
 * Write a file to MinIO.
 * @param {string} path - Object path within memory bucket
 * @param {string} content - File content
 */
async function writeFile(path, content) {
  await ensureBucket();
  const client = getMinioClient();
  await client.putObject(MEMORY_BUCKET, path, Buffer.from(content, 'utf-8'));
}

// ============================================================================
// Profile Operations (Tier 1)
// ============================================================================

/**
 * Get the AI profile YAML.
 * Priority: MinIO file → DB fallback → null
 * @returns {Promise<string|null>}
 */
async function getProfile() {
  // Try MinIO first
  const yaml = await readFile('profiles/default.yaml');
  if (yaml) {return yaml;}

  // Fallback to DB
  try {
    const result = await database.query(`SELECT ai_profile_yaml FROM system_settings WHERE id = 1`);
    if (result.rows.length > 0 && result.rows[0].ai_profile_yaml) {
      return result.rows[0].ai_profile_yaml;
    }
  } catch {
    // No profile yet
  }
  return null;
}

/**
 * Save or update the AI profile.
 * @param {string} yamlContent - YAML string
 */
async function updateProfile(yamlContent) {
  // Enforce size limit
  if (Buffer.byteLength(yamlContent, 'utf-8') > MAX_PROFILE_BYTES) {
    throw new Error(`Profile exceeds maximum size of ${MAX_PROFILE_BYTES} bytes`);
  }

  // Save to MinIO
  await writeFile('profiles/default.yaml', yamlContent);

  // Also save to DB as backup
  try {
    await database.query(
      `UPDATE system_settings SET ai_profile_yaml = $1, ai_profile_updated_at = NOW() WHERE id = 1`,
      [yamlContent]
    );
  } catch (err) {
    logger.debug(`[Memory] Could not save profile to DB: ${err.message}`);
  }
}

/**
 * Generate a YAML profile from structured data.
 * @param {Object} data
 * @returns {string}
 */
function generateProfileYaml({ firma, branche, teamgroesse, produkte, praeferenzen }) {
  const lines = [];
  if (firma) {lines.push(`firma: "${firma}"`);}
  if (branche) {lines.push(`branche: "${branche}"`);}
  lines.push(`sprache: "de"`);
  if (teamgroesse) {lines.push(`mitarbeiter: ${teamgroesse}`);}
  if (produkte && produkte.length > 0) {
    lines.push('produkte:');
    for (const p of produkte) {
      lines.push(`  - ${p}`);
    }
  }
  if (praeferenzen) {
    lines.push('praeferenzen:');
    if (praeferenzen.antwortlaenge) {lines.push(`  antwortlaenge: "${praeferenzen.antwortlaenge}"`);}
    if (praeferenzen.formalitaet) {lines.push(`  formalitaet: "${praeferenzen.formalitaet}"`);}
  }
  return lines.join('\n') + '\n';
}

// ============================================================================
// Memory Extraction (Pre-Compaction Flush)
// ============================================================================

/**
 * Extract memories from messages using the LLM.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} model - Model to use
 * @returns {Promise<Array<{type: string, content: string}>>}
 */
async function extractMemories(messages, model) {
  if (!messages || messages.length === 0) {return [];}

  const formattedMessages = messages
    .map(m => `${m.role === 'user' ? 'Benutzer' : 'Assistent'}: ${m.content}`)
    .join('\n\n');

  const prompt = `/no_think
Extrahiere wichtige Fakten aus diesem Gespraech.

Kategorien:
- FAKT: Konkrete Information (Name, Zahl, Datum, Pfad)
- ENTSCHEIDUNG: Getroffene Entscheidung mit Begruendung
- PRAEFERENZ: Benutzerpraeferenz oder Arbeitsweise

Format (STRIKT einhalten, eine Zeile pro Eintrag):
FAKT: [Beschreibung]
ENTSCHEIDUNG: [Was] - [Warum]
PRAEFERENZ: [Beschreibung]

Wenn nichts Relevantes: antworte mit KEINE_MEMORIES

Gespraech:
${formattedMessages}`;

  try {
    // Resolve ollama_name
    let ollamaName = model;
    try {
      const result = await database.query(
        `SELECT COALESCE(ollama_name, id) as name FROM llm_model_catalog WHERE id = $1`,
        [model]
      );
      if (result.rows.length > 0) {ollamaName = result.rows[0].name;}
    } catch {
      /* use model as-is */
    }

    const response = await fetch(`${LLM_SERVICE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaName,
        prompt,
        stream: false,
        keep_alive: parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300'),
        options: { temperature: 0.2, num_predict: 512 },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {return [];}
    const data = await response.json();
    const text = (data.response || '').replace(/<think>[\s\S]*?<\/think>/g, '');

    if (text.includes('KEINE_MEMORIES')) {return [];}

    // Parse structured output
    return parseMemories(text);
  } catch (err) {
    logger.error(`[Memory] Extract failed: ${err.message}`);
    return [];
  }
}

/**
 * Parse LLM memory extraction output.
 * @param {string} text
 * @returns {Array<{type: string, content: string}>}
 */
function parseMemories(text) {
  const memories = [];
  const regex = /^(FAKT|ENTSCHEIDUNG|PRAEFERENZ):\s*(.+)$/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const typeMap = { FAKT: 'fact', ENTSCHEIDUNG: 'decision', PRAEFERENZ: 'preference' };
    const type = typeMap[match[1]] || 'fact';
    const content = match[2].trim();
    if (content.length > 10) {
      // Skip trivially short entries
      memories.push({ type, content });
    }
  }
  return memories;
}

// ============================================================================
// Memory Storage (with deduplication)
// ============================================================================

/**
 * Save extracted memories with deduplication.
 * @param {Array<{type: string, content: string}>} memories
 * @param {number|null} conversationId
 * @returns {Promise<number>} Number of new memories saved
 */
async function saveMemories(memories, conversationId = null) {
  if (!memories || memories.length === 0) {return 0;}

  await ensureQdrantCollection();

  let saved = 0;
  for (const memory of memories) {
    try {
      // Generate embedding
      const embedding = await getEmbedding(memory.content);

      // Check for duplicates (cosine similarity > 0.9)
      const isDuplicate = await checkDuplicate(embedding);
      if (isDuplicate) {
        logger.debug(`[Memory] Skipping duplicate: "${memory.content.substring(0, 50)}..."`);
        continue;
      }

      // Enforce max memories limit
      const countResult = await database.query(
        `SELECT COUNT(*) as cnt FROM ai_memories WHERE is_active = TRUE`
      );
      if (parseInt(countResult.rows[0].cnt) >= MAX_MEMORIES) {
        // Delete oldest memory
        await database.query(
          `DELETE FROM ai_memories WHERE id = (
            SELECT id FROM ai_memories WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1
          )`
        );
      }

      // Save to PostgreSQL
      const memoryId = uuidv4();
      const qdrantPointId = uuidv4();

      await database.query(
        `INSERT INTO ai_memories (id, type, content, source_conversation_id, qdrant_point_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [memoryId, memory.type, memory.content, conversationId, qdrantPointId]
      );

      // Save to Qdrant
      await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id: qdrantPointId,
              vector: embedding,
              payload: {
                type: memory.type,
                content: memory.content,
                memory_id: memoryId,
                source_conversation_id: conversationId,
                created_at: new Date().toISOString(),
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });

      saved++;
    } catch (err) {
      logger.error(`[Memory] Failed to save memory: ${err.message}`);
    }
  }

  logger.info(`[Memory] Saved ${saved}/${memories.length} memories (conv: ${conversationId})`);
  return saved;
}

/**
 * Check if a similar memory already exists (deduplication).
 * @param {number[]} embedding
 * @returns {Promise<boolean>}
 */
async function checkDuplicate(embedding) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: embedding,
        limit: 1,
        score_threshold: DEDUP_THRESHOLD,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {return false;}
    const data = await response.json();
    return (data.result || []).length > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Memory Search (Tier 2)
// ============================================================================

/**
 * Search for relevant memories based on the current query.
 * @param {string} query - Current user message
 * @param {number} maxResults - Max results (default 3)
 * @param {number} minScore - Min similarity score (default 0.5)
 * @returns {Promise<Array<{type: string, content: string, score: number, created_at: string}>>}
 */
async function searchRelevantMemories(query, maxResults = MAX_TIER2_SNIPPETS, minScore = 0.5) {
  try {
    const embedding = await getEmbedding(query);

    const response = await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: embedding,
        limit: maxResults,
        score_threshold: minScore,
        with_payload: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {return [];}
    const data = await response.json();

    // Enforce token limit on results
    const results = [];
    let totalTokens = 0;

    for (const point of data.result || []) {
      const content = point.payload?.content || '';
      const tokens = estimateTokens(content);
      if (totalTokens + tokens > MAX_TIER2_TOKENS) {break;}

      results.push({
        type: point.payload?.type || 'fact',
        content,
        score: point.score,
        created_at: point.payload?.created_at || '',
      });
      totalTokens += tokens;
    }

    return results;
  } catch (err) {
    logger.debug(`[Memory] Search failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// Memory CRUD Operations
// ============================================================================

/**
 * Get all memories (paginated).
 * @param {Object} options
 * @returns {Promise<{memories: Array, total: number}>}
 */
async function getAllMemories({ type = null, limit = 50, offset = 0 } = {}) {
  let query = `SELECT id, type, content, source_conversation_id, importance, created_at, updated_at
               FROM ai_memories WHERE is_active = TRUE`;
  const params = [];

  if (type) {
    params.push(type);
    query += ` AND type = $${params.length}`;
  }

  query += ` ORDER BY created_at DESC`;
  params.push(limit);
  query += ` LIMIT $${params.length}`;
  params.push(offset);
  query += ` OFFSET $${params.length}`;

  const result = await database.query(query, params);

  const countQuery = type
    ? `SELECT COUNT(*) as cnt FROM ai_memories WHERE is_active = TRUE AND type = $1`
    : `SELECT COUNT(*) as cnt FROM ai_memories WHERE is_active = TRUE`;
  const countResult = await database.query(countQuery, type ? [type] : []);

  return {
    memories: result.rows,
    total: parseInt(countResult.rows[0].cnt),
  };
}

/**
 * Delete a memory by ID.
 * @param {string} memoryId - UUID
 */
async function deleteMemory(memoryId) {
  // Get Qdrant point ID before deleting from DB
  const result = await database.query(`SELECT qdrant_point_id FROM ai_memories WHERE id = $1`, [
    memoryId,
  ]);

  if (result.rows.length > 0 && result.rows[0].qdrant_point_id) {
    // Delete from Qdrant
    try {
      await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}/points/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [result.rows[0].qdrant_point_id],
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      logger.debug(`[Memory] Qdrant delete failed: ${err.message}`);
    }
  }

  await database.query(`DELETE FROM ai_memories WHERE id = $1`, [memoryId]);
}

/**
 * Update a memory's content.
 * @param {string} memoryId
 * @param {string} content
 */
async function updateMemory(memoryId, content) {
  await database.query(`UPDATE ai_memories SET content = $1, updated_at = NOW() WHERE id = $2`, [
    content,
    memoryId,
  ]);

  // Re-embed and update in Qdrant
  const result = await database.query(
    `SELECT qdrant_point_id, type FROM ai_memories WHERE id = $1`,
    [memoryId]
  );

  if (result.rows.length > 0 && result.rows[0].qdrant_point_id) {
    try {
      const embedding = await getEmbedding(content);
      await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id: result.rows[0].qdrant_point_id,
              vector: embedding,
              payload: {
                type: result.rows[0].type,
                content,
                memory_id: memoryId,
                updated_at: new Date().toISOString(),
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      logger.debug(`[Memory] Qdrant update failed: ${err.message}`);
    }
  }
}

/**
 * Delete all memories.
 */
async function deleteAllMemories() {
  await database.query(`DELETE FROM ai_memories`);

  // Delete Qdrant collection and recreate
  try {
    await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10000),
    });
    await ensureQdrantCollection();
  } catch (err) {
    logger.debug(`[Memory] Qdrant collection reset failed: ${err.message}`);
  }
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get memory statistics.
 * @returns {Promise<Object>}
 */
async function getMemoryStats() {
  const result = await database.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE type = 'fact') as facts,
      COUNT(*) FILTER (WHERE type = 'decision') as decisions,
      COUNT(*) FILTER (WHERE type = 'preference') as preferences,
      MAX(updated_at) as last_updated
    FROM ai_memories WHERE is_active = TRUE
  `);

  const stats = result.rows[0] || {};
  const profile = await getProfile();

  return {
    total: parseInt(stats.total) || 0,
    facts: parseInt(stats.facts) || 0,
    decisions: parseInt(stats.decisions) || 0,
    preferences: parseInt(stats.preferences) || 0,
    lastUpdated: stats.last_updated,
    hasProfile: !!profile,
    profileSize: profile ? Buffer.byteLength(profile, 'utf-8') : 0,
  };
}

// ============================================================================
// Reindex
// ============================================================================

/**
 * Reindex all memories into Qdrant.
 * @returns {Promise<number>} Number of memories reindexed
 */
async function reindexMemories() {
  // Delete and recreate collection
  try {
    await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    /* Might not exist */
  }

  await ensureQdrantCollection();

  // Get all active memories
  const result = await database.query(
    `SELECT id, type, content, source_conversation_id, created_at FROM ai_memories WHERE is_active = TRUE`
  );

  let indexed = 0;
  for (const row of result.rows) {
    try {
      const embedding = await getEmbedding(row.content);
      const pointId = uuidv4();

      await fetch(`${QDRANT_URL}/collections/${MEMORY_COLLECTION}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id: pointId,
              vector: embedding,
              payload: {
                type: row.type,
                content: row.content,
                memory_id: row.id,
                source_conversation_id: row.source_conversation_id,
                created_at: row.created_at?.toISOString() || new Date().toISOString(),
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });

      // Update qdrant_point_id in DB
      await database.query(`UPDATE ai_memories SET qdrant_point_id = $1 WHERE id = $2`, [
        pointId,
        row.id,
      ]);

      indexed++;
    } catch (err) {
      logger.error(`[Memory] Reindex failed for ${row.id}: ${err.message}`);
    }
  }

  logger.info(`[Memory] Reindexed ${indexed}/${result.rows.length} memories`);
  return indexed;
}

module.exports = {
  // Memory extraction
  extractMemories,
  saveMemories,
  searchRelevantMemories,

  // CRUD
  getAllMemories,
  deleteMemory,
  updateMemory,
  deleteAllMemories,

  // Profile
  getProfile,
  updateProfile,
  generateProfileYaml,

  // MinIO
  readFile,
  writeFile,

  // Index + Stats
  reindexMemories,
  getMemoryStats,

  // Init
  ensureQdrantCollection,
  ensureBucket,

  // For testing
  parseMemories,
};
