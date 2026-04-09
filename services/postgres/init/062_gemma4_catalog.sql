-- Migration 062: Add Google Gemma 4 models to catalog
-- Released April 2, 2026 — Apache 2.0 license
-- All variants are natively multimodal (vision), E2B/E4B also support audio
-- Architecture: Dense (E2B, E4B, 31B) and MoE (26B with 128 experts, 3.8B active)
-- Thinking mode supported on 26B and 31B

BEGIN;

-- ============================================================================
-- 1. Gemma 4 Edge Models (E2B, E4B) — optimized for Jetson Orin/NX/Nano
-- ============================================================================

INSERT INTO llm_model_catalog (
    id, name, description, ollama_name,
    size_bytes, ram_required_gb, category,
    capabilities, recommended_for,
    model_type, supports_thinking, rag_optimized,
    jetson_tested, performance_tier, ollama_library_url
) VALUES
    -- E2B: Ultra-lightweight edge model (5.1B total, 2.3B effective)
    ('gemma4:e2b-q4', 'Gemma 4 E2B',
     'Googles kompaktes Edge-Modell mit Vision- und Audio-Verstaendnis. Ideal fuer ressourcenbeschraenkte Geraete. 128K Kontext.',
     'gemma4:e2b',
     7516192768, 8, 'small',
     '["general", "multilingual", "vision", "audio", "edge-optimized"]'::jsonb,
     '["chat", "quick-tasks", "image-analysis", "voice-input"]'::jsonb,
     'vision', false, false,
     true, 1, 'https://ollama.com/library/gemma4'),

    ('gemma4:e2b-q8', 'Gemma 4 E2B Q8',
     'Gemma 4 E2B in hoeherer Quantisierung fuer bessere Qualitaet. Vision + Audio, 128K Kontext.',
     'gemma4:e2b-it-q8_0',
     8589934592, 10, 'small',
     '["general", "multilingual", "vision", "audio", "edge-optimized"]'::jsonb,
     '["chat", "quick-tasks", "image-analysis", "voice-input"]'::jsonb,
     'vision', false, false,
     true, 1, 'https://ollama.com/library/gemma4'),

    -- E4B: Balanced edge model (7.9B total, 4.5B effective)
    ('gemma4:e4b-q4', 'Gemma 4 E4B',
     'Ausgewogenes Edge-Modell mit starker Vision- und Audio-Verarbeitung. Beste Balance aus Qualitaet und Geschwindigkeit. 128K Kontext.',
     'gemma4:e4b',
     10066329600, 10, 'small',
     '["general", "multilingual", "vision", "audio", "reasoning", "edge-optimized"]'::jsonb,
     '["chat", "image-analysis", "voice-input", "document-analysis"]'::jsonb,
     'vision', false, true,
     true, 1, 'https://ollama.com/library/gemma4'),

    ('gemma4:e4b-q8', 'Gemma 4 E4B Q8',
     'Gemma 4 E4B in Q8-Quantisierung fuer maximale Edge-Qualitaet. Vision + Audio, 128K Kontext.',
     'gemma4:e4b-it-q8_0',
     12884901888, 12, 'small',
     '["general", "multilingual", "vision", "audio", "reasoning", "edge-optimized"]'::jsonb,
     '["chat", "image-analysis", "voice-input", "document-analysis"]'::jsonb,
     'vision', false, true,
     true, 1, 'https://ollama.com/library/gemma4'),

-- ============================================================================
-- 2. Gemma 4 26B MoE — best performance/efficiency ratio
-- ============================================================================

    -- 26B MoE Q4: 128 Experts, nur 3.8B aktiv pro Token
    ('gemma4:26b-q4', 'Gemma 4 26B MoE',
     'Mixture-of-Experts mit 128 Experten (3.8B aktiv pro Token). Near-31B Qualitaet bei deutlich schnellerer Inferenz. Multimodal (Vision), 256K Kontext, Thinking Mode.',
     'gemma4:26b',
     19327352832, 20, 'medium',
     '["general", "multilingual", "vision", "reasoning", "coding", "analysis", "moe"]'::jsonb,
     '["chat", "rag", "image-analysis", "complex-tasks", "coding"]'::jsonb,
     'vision', true, true,
     true, 2, 'https://ollama.com/library/gemma4'),

    ('gemma4:26b-q8', 'Gemma 4 26B MoE Q8',
     'Gemma 4 26B MoE in Q8-Quantisierung. Beste Qualitaet im MoE-Format. 256K Kontext, Thinking Mode.',
     'gemma4:26b-a4b-it-q8_0',
     30064771072, 30, 'large',
     '["general", "multilingual", "vision", "reasoning", "coding", "analysis", "moe"]'::jsonb,
     '["chat", "rag", "image-analysis", "complex-tasks", "coding"]'::jsonb,
     'vision', true, true,
     true, 2, 'https://ollama.com/library/gemma4'),

-- ============================================================================
-- 3. Gemma 4 31B Dense — maximum quality
-- ============================================================================

    -- 31B Dense Q4: Alle 30.7B Parameter aktiv
    ('gemma4:31b-q4', 'Gemma 4 31B',
     'Googles staerkstes Open-Source-Modell. Volle Dense-Architektur, Multimodal (Vision), 256K Kontext, Thinking Mode. GPQA 84.3%, LiveCodeBench 80%.',
     'gemma4:31b',
     21474836480, 22, 'large',
     '["general", "multilingual", "vision", "reasoning", "coding", "analysis", "creative", "research"]'::jsonb,
     '["complex-tasks", "analysis", "research", "coding", "rag", "image-analysis"]'::jsonb,
     'vision', true, true,
     true, 2, 'https://ollama.com/library/gemma4'),

    ('gemma4:31b-q8', 'Gemma 4 31B Q8',
     'Gemma 4 31B in Q8-Quantisierung fuer maximale Qualitaet. Near-Lossless, 256K Kontext, Thinking Mode.',
     'gemma4:31b-it-q8_0',
     36507222016, 36, 'xlarge',
     '["general", "multilingual", "vision", "reasoning", "coding", "analysis", "creative", "research"]'::jsonb,
     '["complex-tasks", "analysis", "research", "coding", "rag", "image-analysis"]'::jsonb,
     'vision', true, true,
     true, 3, 'https://ollama.com/library/gemma4')

ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    ollama_name = EXCLUDED.ollama_name,
    size_bytes = EXCLUDED.size_bytes,
    ram_required_gb = EXCLUDED.ram_required_gb,
    category = EXCLUDED.category,
    capabilities = EXCLUDED.capabilities,
    recommended_for = EXCLUDED.recommended_for,
    model_type = EXCLUDED.model_type,
    supports_thinking = EXCLUDED.supports_thinking,
    rag_optimized = EXCLUDED.rag_optimized,
    jetson_tested = EXCLUDED.jetson_tested,
    performance_tier = EXCLUDED.performance_tier,
    ollama_library_url = EXCLUDED.ollama_library_url,
    updated_at = NOW();

COMMIT;
