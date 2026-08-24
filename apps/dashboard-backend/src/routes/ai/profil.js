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

module.exports = router;
