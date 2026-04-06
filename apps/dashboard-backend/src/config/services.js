/**
 * Centralized Service Configuration
 * All internal service URLs defined in one place
 */

// LLM Service (Ollama) — supports deprecated LLM_HOST/LLM_PORT for backward compat
const LLM_SERVICE_HOST = process.env.LLM_SERVICE_HOST || process.env.LLM_HOST || 'llm-service';
const LLM_SERVICE_PORT = process.env.LLM_SERVICE_PORT || process.env.LLM_PORT || '11434';
const LLM_MANAGEMENT_PORT =
  process.env.LLM_SERVICE_MANAGEMENT_PORT || process.env.LLM_MANAGEMENT_PORT || '11436';

// Embedding Service
const EMBEDDING_SERVICE_HOST = process.env.EMBEDDING_SERVICE_HOST || 'embedding-service';
const EMBEDDING_SERVICE_PORT = process.env.EMBEDDING_SERVICE_PORT || '11435';

// Qdrant Vector Database
const QDRANT_HOST = process.env.QDRANT_HOST || 'qdrant';
const QDRANT_PORT = process.env.QDRANT_PORT || '6333';

// Metrics Collector
const METRICS_COLLECTOR_HOST = process.env.METRICS_COLLECTOR_HOST || 'metrics-collector';
const METRICS_COLLECTOR_PORT = '9100';

// MinIO Object Storage
const MINIO_HOST = process.env.MINIO_HOST || 'minio';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000');
const MINIO_CONSOLE_PORT = parseInt(process.env.MINIO_CONSOLE_PORT || '9001');

// Document Indexer
const DOCUMENT_INDEXER_HOST = process.env.DOCUMENT_INDEXER_HOST || 'document-indexer';
const DOCUMENT_INDEXER_PORT = process.env.DOCUMENT_INDEXER_API_PORT || '9102';

// Self-Healing Agent
const SELF_HEALING_HOST = process.env.SELF_HEALING_HOST || 'self-healing-agent';
const SELF_HEALING_PORT = process.env.SELF_HEALING_PORT || '9200';

// n8n Workflow Engine
const N8N_HOST = process.env.N8N_HOST || 'n8n';
const N8N_PORT = process.env.N8N_PORT || '5678';

// TIMEOUT-002: Default timeouts per service type (ms)
// Individual axios calls can override these, but this ensures nothing hangs forever
const timeouts = {
  health: 5000, // Health/readiness checks
  query: 15000, // DB/search queries
  upload: 30000, // File uploads
  embed: 30000, // Single embedding
  embedBatch: 120000, // Batch embedding
  generate: 600000, // LLM generation (streaming)
  pull: 3600000, // Model download (1h)
  webhook: 10000, // External webhooks (Telegram, etc.)
  default: 30000, // Fallback for anything unspecified
};

// Constructed URLs
const services = {
  // LLM Service
  llm: {
    host: LLM_SERVICE_HOST,
    port: LLM_SERVICE_PORT,
    managementPort: LLM_MANAGEMENT_PORT,
    url: `http://${LLM_SERVICE_HOST}:${LLM_SERVICE_PORT}`,
    managementUrl: `http://${LLM_SERVICE_HOST}:${LLM_MANAGEMENT_PORT}`,
    tagsEndpoint: `http://${LLM_SERVICE_HOST}:${LLM_SERVICE_PORT}/api/tags`,
    chatEndpoint: `http://${LLM_SERVICE_HOST}:${LLM_SERVICE_PORT}/api/chat`,
    generateEndpoint: `http://${LLM_SERVICE_HOST}:${LLM_SERVICE_PORT}/api/generate`,
    psEndpoint: `http://${LLM_SERVICE_HOST}:${LLM_SERVICE_PORT}/api/ps`,
  },

  // Embedding Service
  embedding: {
    host: EMBEDDING_SERVICE_HOST,
    port: EMBEDDING_SERVICE_PORT,
    url: `http://${EMBEDDING_SERVICE_HOST}:${EMBEDDING_SERVICE_PORT}`,
    embedEndpoint: `http://${EMBEDDING_SERVICE_HOST}:${EMBEDDING_SERVICE_PORT}/embed`,
    healthEndpoint: `http://${EMBEDDING_SERVICE_HOST}:${EMBEDDING_SERVICE_PORT}/health`,
  },

  // Qdrant
  qdrant: {
    host: QDRANT_HOST,
    port: QDRANT_PORT,
    url: `http://${QDRANT_HOST}:${QDRANT_PORT}`,
    collectionsEndpoint: `http://${QDRANT_HOST}:${QDRANT_PORT}/collections`,
  },

  // Metrics Collector
  metrics: {
    host: METRICS_COLLECTOR_HOST,
    port: METRICS_COLLECTOR_PORT,
    url: `http://${METRICS_COLLECTOR_HOST}:${METRICS_COLLECTOR_PORT}`,
    metricsEndpoint: `http://${METRICS_COLLECTOR_HOST}:${METRICS_COLLECTOR_PORT}/metrics`,
    healthEndpoint: `http://${METRICS_COLLECTOR_HOST}:${METRICS_COLLECTOR_PORT}/health`,
  },

  // MinIO
  minio: {
    host: MINIO_HOST,
    port: MINIO_PORT,
    consolePort: MINIO_CONSOLE_PORT,
    endpoint: `${MINIO_HOST}:${MINIO_PORT}`,
  },

  // Document Indexer
  documentIndexer: {
    host: DOCUMENT_INDEXER_HOST,
    port: DOCUMENT_INDEXER_PORT,
    url: `http://${DOCUMENT_INDEXER_HOST}:${DOCUMENT_INDEXER_PORT}`,
    indexEndpoint: `http://${DOCUMENT_INDEXER_HOST}:${DOCUMENT_INDEXER_PORT}/index`,
    statusEndpoint: `http://${DOCUMENT_INDEXER_HOST}:${DOCUMENT_INDEXER_PORT}/status`,
  },

  // Self-Healing Agent
  selfHealing: {
    host: SELF_HEALING_HOST,
    port: SELF_HEALING_PORT,
    url: `http://${SELF_HEALING_HOST}:${SELF_HEALING_PORT}`,
  },

  // n8n
  n8n: {
    host: N8N_HOST,
    port: N8N_PORT,
    url: `http://${N8N_HOST}:${N8N_PORT}`,
  },
};

module.exports = services;
module.exports.timeouts = timeouts;
