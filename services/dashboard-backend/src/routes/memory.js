/**
 * Memory API Routes
 * Endpoints for AI memory management (profile, memories, stats).
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../utils/errors');
const memoryService = require('../services/memoryService');
const database = require('../database');

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// Profile Endpoints
// ============================================================================

/**
 * GET /api/memory/profile - Get AI profile YAML
 */
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await memoryService.getProfile();
    res.json({ profile: profile || null });
  })
);

/**
 * PUT /api/memory/profile - Update AI profile YAML
 */
router.put(
  '/profile',
  asyncHandler(async (req, res) => {
    const { profile } = req.body;
    if (!profile || typeof profile !== 'string') {
      throw new ValidationError('profile (string) is required');
    }
    await memoryService.updateProfile(profile);
    res.json({ success: true });
  })
);

/**
 * POST /api/memory/profile - Create profile from wizard data
 */
router.post(
  '/profile',
  asyncHandler(async (req, res) => {
    const { companyName, industry, teamSize, products, preferences } = req.body;
    if (!companyName) {
      throw new ValidationError('companyName is required');
    }

    const profileYaml = memoryService.generateProfileYaml({
      firma: companyName,
      branche: industry || '',
      teamgroesse: teamSize || '',
      produkte: products || [],
      praeferenzen: preferences || {},
    });

    await memoryService.updateProfile(profileYaml);
    res.json({ success: true, profile: profileYaml });
  })
);

// ============================================================================
// Memory CRUD Endpoints
// ============================================================================

/**
 * GET /api/memory/list - List all memories (paginated)
 */
router.get(
  '/list',
  asyncHandler(async (req, res) => {
    const type = req.query.type || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const { memories, total } = await memoryService.getAllMemories({ type, limit, offset });
    res.json({ memories, total, limit, offset });
  })
);

/**
 * GET /api/memory/search - Semantic memory search
 */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = req.query.q;
    if (!q) {
      throw new ValidationError('Query parameter q is required');
    }
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);

    const memories = await memoryService.searchRelevantMemories(q, limit, 0.3);
    res.json({ memories });
  })
);

/**
 * DELETE /api/memory/:id - Delete a single memory
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await memoryService.deleteMemory(id);
    res.json({ success: true });
  })
);

/**
 * PUT /api/memory/:id - Update a memory's content
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      throw new ValidationError('content (string) is required');
    }
    await memoryService.updateMemory(id, content);
    res.json({ success: true });
  })
);

// ============================================================================
// Stats & Admin Endpoints
// ============================================================================

/**
 * GET /api/memory/stats - Memory statistics
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const stats = await memoryService.getMemoryStats();
    res.json(stats);
  })
);

/**
 * GET /api/memory/context-stats - Context management statistics
 * Aggregated compaction and token usage data for monitoring.
 */
router.get(
  '/context-stats',
  asyncHandler(async (req, res) => {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    // Compaction stats
    const compactionResult = await database.query(
      `SELECT
       COUNT(*) AS total_compactions,
       COALESCE(AVG(compression_ratio), 0) AS avg_compression,
       COALESCE(SUM(memories_extracted), 0) AS total_memories_extracted,
       COALESCE(AVG(tokens_before), 0) AS avg_tokens_before,
       COALESCE(AVG(tokens_after), 0) AS avg_tokens_after,
       COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
       COALESCE(SUM(messages_compacted), 0) AS total_messages_compacted
     FROM compaction_log
     WHERE created_at >= $1`,
      [cutoff]
    );

    // Token usage stats from llm_jobs
    const tokenResult = await database.query(
      `SELECT
       COUNT(*) AS total_jobs,
       COALESCE(AVG(prompt_tokens), 0) AS avg_prompt_tokens,
       COALESCE(AVG(completion_tokens), 0) AS avg_completion_tokens,
       COALESCE(AVG(context_window_used), 0) AS avg_context_window
     FROM llm_jobs
     WHERE created_at >= $1
       AND status = 'completed'
       AND prompt_tokens IS NOT NULL`,
      [cutoff]
    );

    // Recent compaction log entries
    const recentResult = await database.query(
      `SELECT
       cl.conversation_id,
       cc.title AS conversation_title,
       cl.messages_compacted,
       cl.tokens_before,
       cl.tokens_after,
       cl.compression_ratio,
       cl.memories_extracted,
       cl.model_used,
       cl.duration_ms,
       cl.created_at
     FROM compaction_log cl
     LEFT JOIN chat_conversations cc ON cl.conversation_id = cc.id
     ORDER BY cl.created_at DESC
     LIMIT 10`
    );

    // Daily compaction activity (for chart)
    const dailyResult = await database.query(
      `SELECT
       DATE(created_at) AS day,
       COUNT(*) AS compactions,
       COALESCE(AVG(compression_ratio), 0) AS avg_compression,
       COALESCE(SUM(memories_extracted), 0) AS memories_extracted
     FROM compaction_log
     WHERE created_at >= $1
     GROUP BY DATE(created_at)
     ORDER BY day DESC
     LIMIT 30`,
      [cutoff]
    );

    const compaction = compactionResult.rows[0];
    const tokens = tokenResult.rows[0];

    res.json({
      period: `${days}d`,
      compaction: {
        total: parseInt(compaction.total_compactions),
        avgCompression: Math.round(parseFloat(compaction.avg_compression)),
        totalMemoriesExtracted: parseInt(compaction.total_memories_extracted),
        avgTokensBefore: Math.round(parseFloat(compaction.avg_tokens_before)),
        avgTokensAfter: Math.round(parseFloat(compaction.avg_tokens_after)),
        avgDurationMs: Math.round(parseFloat(compaction.avg_duration_ms)),
        totalMessagesCompacted: parseInt(compaction.total_messages_compacted),
      },
      tokens: {
        totalJobs: parseInt(tokens.total_jobs),
        avgPromptTokens: Math.round(parseFloat(tokens.avg_prompt_tokens)),
        avgCompletionTokens: Math.round(parseFloat(tokens.avg_completion_tokens)),
        avgContextWindow: Math.round(parseFloat(tokens.avg_context_window)),
      },
      recentCompactions: recentResult.rows,
      dailyActivity: dailyResult.rows,
    });
  })
);

/**
 * POST /api/memory/reindex - Reindex all memories into Qdrant
 */
router.post(
  '/reindex',
  asyncHandler(async (req, res) => {
    const count = await memoryService.reindexMemories();
    res.json({ success: true, indexed: count });
  })
);

/**
 * POST /api/memory/export - Export all memories as JSON
 */
router.post(
  '/export',
  asyncHandler(async (req, res) => {
    const { memories } = await memoryService.getAllMemories({ limit: 1000 });
    const profile = await memoryService.getProfile();

    res.json({
      exportedAt: new Date().toISOString(),
      profile: profile || null,
      memories,
    });
  })
);

/**
 * DELETE /api/memory/all - Delete all memories (requires confirmation)
 */
router.delete(
  '/all',
  asyncHandler(async (req, res) => {
    const { confirm } = req.body;
    if (confirm !== true) {
      throw new ValidationError('Set confirm: true to delete all memories');
    }
    await memoryService.deleteAllMemories();
    res.json({ success: true });
  })
);

module.exports = router;
