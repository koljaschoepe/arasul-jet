/**
 * Shared Constants
 * Single source of truth for status values and enums used across Frontend and Backend.
 */

// Model installation status
const MODEL_STATUS = {
  AVAILABLE: 'available',
  DOWNLOADING: 'downloading',
  ERROR: 'error',
  NOT_INSTALLED: 'not_installed',
};

// Message roles (LLM chat)
const MESSAGE_ROLE = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

// Streaming job status
const JOB_STATUS = {
  PENDING: 'pending',
  STREAMING: 'streaming',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled',
};

// App/Service runtime status
const SERVICE_STATUS = {
  RUNNING: 'running',
  INSTALLED: 'installed',
  AVAILABLE: 'available',
  ERROR: 'error',
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
};

// Document processing status
const DOCUMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// Model size categories
const MODEL_CATEGORY = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  XLARGE: 'xlarge',
};

module.exports = {
  MODEL_STATUS,
  MESSAGE_ROLE,
  JOB_STATUS,
  SERVICE_STATUS,
  DOCUMENT_STATUS,
  MODEL_CATEGORY,
};
