-- 140_qwen3_default_coder.sql — Plan 021 Schritt 3: Qwen3.8-27B in den Modellkatalog
--
-- Nimmt Qwen3.8-27B (GGUF, Unsloth Dynamic V3, IQ4_XS) als wählbares Modell in den
-- Store auf. Das Modell ist auf dem Orin bereits gezogen und lädt/antwortet mit
-- Ollama 0.32.12 (empirisch bestätigt; 0.20.5 konnte die Hybrid-/Gated-DeltaNet-
-- Architektur nicht laden — deshalb der Engine-Bump in Schritt 3-Enabler).
--
-- BEWUSST KEIN is_default-Flip hier: der Live-Test auf dem Orin ergab ~9-10 tok/s
-- (dichtes 27B) gegenüber ~58 tok/s beim aktuellen MoE-Coder (qwen3-coder:30b,
-- 3B aktiv). Ein 6x langsamerer Default wäre eine spürbare Regression für den
-- stundenlangen Agenten-Workload. Qwen3.8 bleibt daher zunächst nur wählbar; der
-- MoE bleibt Default (Plan-021-Risikotabelle: „MoE bleibt Fallback-Default, bis
-- Qwen3.8 live bestätigt"). Der Default wird — falls gewünscht — bewusst über die
-- API/Store gesetzt (llm_installed_models.is_default), nicht hart per Migration
-- (das würde auf frischen Installs auf ein nicht installiertes Modell zeigen).

INSERT INTO llm_model_catalog (
    id, name, description, size_bytes, ram_required_gb, category,
    capabilities, recommended_for, jetson_tested, performance_tier,
    ollama_library_url, ollama_name, model_type, speed_tier
) VALUES (
    'qwen3.8:27b-iq4',
    'Qwen3.8 27B',
    'Neues dichtes 27B-Modell (Hybrid-Attention: lineare + volle Layer, 256K Kontext) mit Developer-Rolle für agentische Tools. Höhere Qualität/langer Kontext, aber deutlich langsamer als der MoE-Coder — als Alternative wählbar.',
    16000000000,
    22,
    'large',
    '["coding", "reasoning", "multilingual", "long-context", "agentic"]'::jsonb,
    '["coding", "complex-tasks", "long-documents"]'::jsonb,
    true,
    3,
    'https://huggingface.co/unsloth/Qwen3.8-27B-GGUF',
    'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
    'llm',
    'quality'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    size_bytes = EXCLUDED.size_bytes,
    ram_required_gb = EXCLUDED.ram_required_gb,
    category = EXCLUDED.category,
    capabilities = EXCLUDED.capabilities,
    recommended_for = EXCLUDED.recommended_for,
    jetson_tested = EXCLUDED.jetson_tested,
    performance_tier = EXCLUDED.performance_tier,
    ollama_library_url = EXCLUDED.ollama_library_url,
    ollama_name = EXCLUDED.ollama_name,
    model_type = EXCLUDED.model_type,
    speed_tier = EXCLUDED.speed_tier,
    updated_at = NOW();
