const { z } = require('zod');

// PATCH /api/rag/settings — jedes Feld optional; die Grenzen halten eine
// verrutschte Eingabe davon ab, die Generierung unbrauchbar zu machen.
//
// Die Felder mit `rag_`-Praefix sind am 24.08.2026 entfallen: sie steuerten
// Abruf, Rerank und Wissensraum-Routing der Qdrant-Suche, die mit demselben
// Tag ausgebaut wurde. Geblieben ist, was die Generierung steuert. Pfad und
// Praefix der Route bleiben, weil die Einstellungsseite darauf zeigt.
const UpdateRagSettingsBody = z
  .object({
    llm_num_ctx_default: z.number().int().min(512).max(131072).nullable().optional(),
    llm_keep_alive_seconds: z.number().int().min(0).max(86400).optional(),
    llm_num_predict_default: z.number().int().min(64).max(16384).optional(),
    llm_base_system_prompt: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

module.exports = {
  UpdateRagSettingsBody,
};
