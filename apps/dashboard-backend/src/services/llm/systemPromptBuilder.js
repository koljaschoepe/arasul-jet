/**
 * System Prompt Builder
 * Builds a layered system prompt from 4 sources:
 *   1. Global base (hardcoded German default)
 *   2. AI profile (YAML from MinIO/DB via memoryService)
 *   3. Company context (from company_context table)
 *   4. Project prompt (per conversation, from projects table)
 */

const yaml = require('js-yaml');
const memoryService = require('../memory/memoryService');
const logger = require('../../utils/logger');

// Layer 1: Hardcoded global base
const GLOBAL_BASE_PROMPT =
  'Du bist ein hilfreicher KI-Assistent. Antworte praezise und strukturiert auf Deutsch, es sei denn der Benutzer schreibt in einer anderen Sprache.';

/**
 * Sanitize user-supplied prompt content to mitigate prompt injection.
 * Strips common injection patterns and wraps content in clear delimiters.
 * @param {string} content - Raw user-supplied content
 * @param {string} label - Section label for the delimiter
 * @returns {string} Sanitized and delimited content
 */
function sanitizePromptContent(content, label) {
  if (!content || !content.trim()) {return '';}

  let sanitized = content;

  // Strip common prompt injection patterns (case-insensitive)
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi,
    /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
    /forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
    /you\s+are\s+now\s+(?:a\s+)?(?:new|different)\s+(?:AI|assistant|bot)/gi,
    /new\s+instructions?:\s*/gi,
    /system\s*:\s*/gi,
    /\[SYSTEM\]/gi,
    /<<\s*SYS\s*>>/gi,
    /<\/?system>/gi,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(sanitized)) {
      logger.warn(`[SystemPrompt] Stripped injection pattern from ${label}: ${pattern}`);
      sanitized = sanitized.replace(pattern, '[entfernt]');
    }
  }

  // Truncate excessively long content (max 5000 chars for context, 2000 for project prompt)
  const maxLen = label === 'Unternehmenskontext' ? 5000 : 2000;
  if (sanitized.length > maxLen) {
    logger.warn(`[SystemPrompt] Truncated ${label} from ${sanitized.length} to ${maxLen} chars`);
    sanitized = sanitized.slice(0, maxLen) + '\n[... gekuerzt]';
  }

  return sanitized;
}

// Simple TTL cache for profile and company context
const cache = {
  profile: { value: undefined, expiresAt: 0 },
  companyContext: { value: undefined, expiresAt: 0 },
};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Invalidate cached profile (call on profile update)
 */
function invalidateProfileCache() {
  cache.profile.expiresAt = 0;
}

/**
 * Invalidate cached company context (call on context update)
 */
function invalidateCompanyContextCache() {
  cache.companyContext.expiresAt = 0;
}

/**
 * Format a YAML profile string into a readable system prompt section.
 * @param {string} yamlString - Raw YAML from memoryService
 * @returns {string|null} Formatted section or null
 */
function formatProfile(yamlString) {
  if (!yamlString || !yamlString.trim()) {
    return null;
  }

  try {
    const data = yaml.load(yamlString);
    if (!data || typeof data !== 'object') {
      return null;
    }

    const lines = ['## KI-Profil'];
    if (data.firma) {
      lines.push(`- Firma: ${data.firma}`);
    }
    if (data.branche) {
      lines.push(`- Branche: ${data.branche}`);
    }
    if (data.sprache) {
      lines.push(`- Sprache: ${data.sprache}`);
    }
    if (data.mitarbeiter) {
      lines.push(`- Mitarbeiter: ${data.mitarbeiter}`);
    }
    if (data.produkte && Array.isArray(data.produkte) && data.produkte.length > 0) {
      lines.push(`- Produkte: ${data.produkte.join(', ')}`);
    }
    if (data.praeferenzen && typeof data.praeferenzen === 'object') {
      if (data.praeferenzen.antwortlaenge) {
        lines.push(`- Antwortlaenge: ${data.praeferenzen.antwortlaenge}`);
      }
      if (data.praeferenzen.formalitaet) {
        lines.push(`- Formalitaet: ${data.praeferenzen.formalitaet}`);
      }
    }

    // Only return if we have more than just the header
    return lines.length > 1 ? lines.join('\n') : null;
  } catch (err) {
    logger.debug(`[SystemPrompt] Could not parse profile YAML: ${err.message}`);
    return null;
  }
}

/**
 * Load company context from DB (with cache).
 * @param {Object} database - Database instance
 * @returns {Promise<string>}
 */
async function loadCompanyContext(database) {
  const now = Date.now();
  if (cache.companyContext.expiresAt > now && cache.companyContext.value !== undefined) {
    return cache.companyContext.value;
  }

  try {
    const result = await database.query('SELECT content FROM company_context WHERE id = 1');
    const content = result.rows.length > 0 && result.rows[0].content ? result.rows[0].content : '';
    cache.companyContext = { value: content, expiresAt: now + CACHE_TTL_MS };
    return content;
  } catch (err) {
    logger.warn(`[SystemPrompt] Could not fetch company context: ${err.message}`);
    return '';
  }
}

/**
 * Load AI profile (with cache).
 * @returns {Promise<string|null>}
 */
async function loadProfile() {
  const now = Date.now();
  if (cache.profile.expiresAt > now && cache.profile.value !== undefined) {
    return cache.profile.value;
  }

  try {
    const yaml = await memoryService.getProfile();
    cache.profile = { value: yaml, expiresAt: now + CACHE_TTL_MS };
    return yaml;
  } catch (err) {
    logger.debug(`[SystemPrompt] Could not load profile: ${err.message}`);
    cache.profile = { value: null, expiresAt: now + CACHE_TTL_MS };
    return null;
  }
}

/**
 * Load project system prompt for a conversation.
 * @param {Object} database - Database instance
 * @param {string|null} conversationId
 * @returns {Promise<string>}
 */
async function loadProjectPrompt(database, conversationId) {
  if (!conversationId) {
    return '';
  }

  try {
    const result = await database.query(
      `SELECT p.system_prompt FROM projects p
       JOIN chat_conversations c ON c.project_id = p.id
       WHERE c.id = $1 AND p.system_prompt != ''`,
      [conversationId]
    );
    return result.rows.length > 0 ? result.rows[0].system_prompt : '';
  } catch (err) {
    logger.debug(`[SystemPrompt] Could not fetch project prompt: ${err.message}`);
    return '';
  }
}

/**
 * Build the combined system prompt from all layers.
 * @param {Object} database - Database instance
 * @param {string|null} conversationId - Current conversation ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeTools=true] - Whether to include tools section
 * @returns {Promise<string>} Combined system prompt
 */
async function buildSystemPrompt(database, conversationId, { includeTools = true } = {}) {
  const parts = [GLOBAL_BASE_PROMPT];

  // Layer 2: AI Profile
  const profileYaml = await loadProfile();
  const profileSection = formatProfile(profileYaml);
  if (profileSection) {
    parts.push(profileSection);
  }

  // Layer 3: Company Context (sanitized — user-editable content)
  const companyContext = await loadCompanyContext(database);
  if (companyContext) {
    const sanitized = sanitizePromptContent(companyContext, 'Unternehmenskontext');
    if (sanitized) {
      parts.push(`## Unternehmenskontext\n${sanitized}`);
    }
  }

  // Layer 4: Project Prompt (sanitized — user-editable content)
  const projectPrompt = await loadProjectPrompt(database, conversationId);
  if (projectPrompt) {
    const sanitized = sanitizePromptContent(projectPrompt, 'Projektanweisungen');
    if (sanitized) {
      parts.push(`## Projektanweisungen\n${sanitized}`);
    }
  }

  // Layer 5: Available Tools (only for medium/complex queries)
  if (includeTools) {
    try {
      const toolRegistry = require('../../tools');
      const toolsPrompt = await toolRegistry.generateToolsPrompt();
      if (toolsPrompt) {
        parts.push(toolsPrompt);
      }
    } catch {
      // Tools not available - ignore
    }
  }

  return parts.join('\n\n');
}

module.exports = {
  buildSystemPrompt,
  formatProfile,
  invalidateProfileCache,
  invalidateCompanyContextCache,
  GLOBAL_BASE_PROMPT,
  // Exposed for testing
  _cache: cache,
  _loadCompanyContext: loadCompanyContext,
  _loadProfile: loadProfile,
  _loadProjectPrompt: loadProjectPrompt,
};
