const { z } = require('zod');

const RagQueryBody = z
  .object({
    query: z
      .string({ error: 'Query is required and must be a string' })
      .trim()
      .min(1, 'Query is required and must be a string')
      .max(4000),
    top_k: z.number().int().min(1).max(50).optional(),
    thinking: z.boolean().optional(),
    conversation_id: z.union([z.number().int().positive(), z.string().trim().min(1).max(200)]),
    space_ids: z.array(z.string().trim().min(1).max(200)).max(50).nullable().optional(),
    auto_routing: z.boolean().optional(),
    model: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

// PATCH /api/rag/settings — every field optional; bounds keep a stray admin
// input from rendering the RAG pipeline unusable (e.g. final_k=0 or temp=10).
const UpdateRagSettingsBody = z
  .object({
    rag_top_k: z.number().int().min(1).max(50).optional(),
    rag_final_k: z.number().int().min(1).max(20).optional(),
    rag_score_threshold: z.number().min(0).max(1).optional(),
    rag_relevance_threshold: z.number().min(0).max(1).optional(),
    rag_rerank_enabled: z.boolean().optional(),
    rag_timeout_rerank_ms: z.number().int().min(1000).max(120000).optional(),
    llm_num_ctx_default: z.number().int().min(512).max(131072).nullable().optional(),
    llm_keep_alive_seconds: z.number().int().min(0).max(86400).optional(),
    llm_num_predict_default: z.number().int().min(64).max(16384).optional(),
    rag_temperature: z.number().min(0).max(2).optional(),
    rag_num_predict: z.number().int().min(64).max(16384).optional(),
    rag_mmr_lambda: z.number().min(0).max(1).optional(),
    rag_dedup_max_per_doc: z.number().int().min(1).max(10).optional(),
    rag_hybrid_search: z.boolean().optional(),
    rag_space_routing_threshold: z.number().min(0).max(1).optional(),
    rag_space_routing_max_spaces: z.number().int().min(1).max(10).optional(),
    llm_base_system_prompt: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

module.exports = {
  RagQueryBody,
  UpdateRagSettingsBody,
};
