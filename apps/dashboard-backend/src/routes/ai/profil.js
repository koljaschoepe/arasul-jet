/**
 * Firmenprofil-Endpunkte.
 *
 * Hieß bis zum 24.08.2026 `memory.js` und trug neben dem Profil auch das
 * KI-Gedächtnis (`/list`, `/search`, `/stats`, CRUD). Das Gedächtnis lag in
 * Qdrant und ist mit dem Qdrant-Ausbau gestrichen worden — es hatte über die
 * gesamte Gerätelaufzeit 0 Einträge und meldete seinen Ausfall nicht.
 *
 * Das Präfix bleibt `/api/memory`, weil der Einrichtungsassistent und die
 * Einstellungsseite im Frontend darauf zeigen und eine öffentliche URL nicht
 * ohne Grund wandert. Die Datei heißt nach dem, was sie tut.
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { validateBody } = require('../../middleware/validate');
const { UpdateProfileBody, CreateProfileBody } = require('../../schemas/memory');
const profilService = require('../../services/memory/profilService');
const database = require('../../database');

// Alle Routen brauchen eine Anmeldung
router.use(requireAuth);

/**
 * GET /api/memory/profile - Firmenprofil als YAML holen
 */
router.get(
  '/profile',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const profile = await profilService.getProfile();
    res.json({ profile: profile || null });
  })
);

/**
 * PUT /api/memory/profile - Firmenprofil überschreiben
 */
router.put(
  '/profile',
  requireAdmin,
  validateBody(UpdateProfileBody),
  asyncHandler(async (req, res) => {
    const { profile } = req.body;
    await profilService.updateProfile(profile);
    const { invalidateProfileCache } = require('../../services/llm/systemPromptBuilder');
    invalidateProfileCache();
    res.json({ success: true });
  })
);

/**
 * POST /api/memory/profile - Profil aus den Angaben des Assistenten bauen
 */
router.post(
  '/profile',
  requireAdmin,
  validateBody(CreateProfileBody),
  asyncHandler(async (req, res) => {
    const { companyName, industry, teamSize, products, preferences } = req.body;

    const profileYaml = profilService.generateProfileYaml({
      firma: companyName,
      branche: industry || '',
      teamgroesse: teamSize || '',
      produkte: products || [],
      praeferenzen: preferences || {},
    });

    await profilService.updateProfile(profileYaml);
    const { invalidateProfileCache } = require('../../services/llm/systemPromptBuilder');
    invalidateProfileCache();
    res.json({ success: true, profile: profileYaml });
  })
);

// ============================================================================
// Kontext-Statistik
// ============================================================================
//
// Liegt hier, weil sie unter `/api/memory/context-stats` erreichbar ist und
// eine oeffentliche URL nicht ohne Grund wandert. Mit dem KI-Gedaechtnis hatte
// sie nie etwas zu tun: sie liest `compaction_log` und `llm_jobs`, also die
// Verdichtung von Gespraechen und den Tokenverbrauch. Beim Qdrant-Ausbau am
// 24.08.2026 ist sie zuerst versehentlich mitgegangen und wurde zurueckgeholt.

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

module.exports = router;
