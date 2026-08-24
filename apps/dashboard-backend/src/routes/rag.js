/**
 * Einstellungen für Abruf und Generierung (`/api/rag/settings`).
 *
 * Diese Datei trug bis zum 24.08.2026 die RAG-Suche: `/query`, `/status`,
 * `/metrics` und `/fix-space-ids`, alle über Qdrant. Plan 021 Schritt 8 hat
 * klassisches Vektor-RAG durch agentisches ersetzt (grep, Symbolsuche,
 * benanntes Datei-Lesen), Qdrant lief seitdem nicht mehr, und die Routen
 * lieferten leere Trefferlisten, ohne das zu sagen. Am 24.08.2026 sind sie
 * samt Qdrant gestrichen worden.
 *
 * Übrig bleibt, was weiterlebt: die Regler in `system_settings`. Die Spalten
 * mit `llm_`-Präfix steuern die Generierung und den Basis-System-Prompt und
 * werden von der Einstellungsseite gebraucht. Pfad und Präfix bleiben, weil
 * das Frontend darauf zeigt.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { UpdateRagSettingsBody } = require('../schemas/rag');
const { ValidationError } = require('../utils/errors');
const systemSettings = require('../services/system-settings/systemSettingsService');

/**
 * GET /api/rag/settings
 * Admin: current DB-backed RAG/LLM tunables (raw column values; null = env/code default).
 */
router.get(
  '/settings',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const select = systemSettings.SETTINGS_COLUMNS.join(', ');
    const result = await db.query(`SELECT ${select} FROM system_settings WHERE id = 1`);
    res.json({ data: result.rows[0] || {} });
  })
);

/**
 * PATCH /api/rag/settings
 * Admin: update RAG/LLM tunables. Takes effect immediately (cache reload) —
 * no restart needed. Body is validated + bounded by UpdateRagSettingsBody.
 */
router.patch(
  '/settings',
  requireAuth,
  requireAdmin,
  validateBody(UpdateRagSettingsBody),
  asyncHandler(async (req, res) => {
    const entries = Object.entries(req.body);
    if (entries.length === 0) {
      throw new ValidationError('No settings provided');
    }

    // '' on the prompt means "reset to built-in default"
    const normalized = entries.map(([key, value]) =>
      key === 'llm_base_system_prompt' && value === '' ? [key, null] : [key, value]
    );

    const setClauses = normalized.map(([key], i) => `${key} = $${i + 1}`).join(', ');
    const values = normalized.map(([, value]) => value);
    await db.query(`UPDATE system_settings SET ${setClauses} WHERE id = 1`, values);

    await systemSettings.reload();
    logger.info(
      `[rag-settings] Updated by ${req.user.username}: ${normalized.map(([k]) => k).join(', ')}`
    );

    const select = systemSettings.SETTINGS_COLUMNS.join(', ');
    const result = await db.query(`SELECT ${select} FROM system_settings WHERE id = 1`);
    res.json({ data: result.rows[0] || {} });
  })
);

module.exports = router;
