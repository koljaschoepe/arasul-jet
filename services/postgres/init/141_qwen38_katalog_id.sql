-- 141_qwen38_katalog_id.sql — Plan 021: Qwen3.8-Katalogeintrag auf die Ollama-Id
--
-- Migration 140 legte den Katalogeintrag mit der Slug-Id "qwen3.8:27b-iq4" an.
-- Ein DIREKT gezogenes Modell (`ollama pull hf.co/...`) registriert sich aber in
-- `llm_installed_models` mit der OLLAMA-Id ("hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS"),
-- und der Sync legte dafür eine zweite Katalogzeile mit rohem Namen an. Store/Picker
-- verknüpfen Katalog↔Installiert über `c.id = i.id` → getroffen wird die rohe Zeile,
-- angezeigt der Ollama-Name statt "Qwen3.8 27B".
--
-- Fix: die guten Metadaten (Name/Tier/…) auf die Zeile mit der OLLAMA-Id legen —
-- die trifft `c.id = i.id` sowohl beim Direkt-Pull als auch beim Store-Download —
-- und die redundante Slug-Zeile entfernen. Idempotent (ON CONFLICT / DELETE-no-op),
-- funktioniert auf frischen Boxen (nur Slug-Zeile) wie auf diesem Gerät (beide Zeilen).

INSERT INTO llm_model_catalog (
    id, name, description, size_bytes, ram_required_gb, category,
    capabilities, recommended_for, jetson_tested, performance_tier,
    ollama_library_url, ollama_name, model_type, speed_tier
) VALUES (
    'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
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

-- Redundante Slug-Zeile aus Migration 140 entfernen (kein Duplikat im Store).
DELETE FROM llm_model_catalog WHERE id = 'qwen3.8:27b-iq4';
