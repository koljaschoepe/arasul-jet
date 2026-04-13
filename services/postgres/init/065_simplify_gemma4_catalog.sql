-- Migration 065: Simplify Gemma 4 catalog to 3 clear variants
-- Remove Q8 and E2B variants — keep one model per tier with clear German names:
--   Kompakt (E4B, 10GB) | Standard (26B MoE, 20GB) | Pro (31B Dense, 22GB)

BEGIN;

-- 1. Remove redundant variants (Q8 = marginal gain for much more RAM, E2B = superseded by E4B)
DELETE FROM llm_model_catalog
WHERE id IN (
    'gemma4:e2b-q4',
    'gemma4:e2b-q8',
    'gemma4:e4b-q8',
    'gemma4:26b-q8',
    'gemma4:31b-q8'
);

-- 2. Rename remaining 3 with clear, non-technical names and better descriptions
UPDATE llm_model_catalog SET
    name = 'Gemma 4 Kompakt',
    description = 'Schnell und effizient. Ideal fuer einfache Aufgaben, Bildanalyse und kleinere Geraete. 128K Kontext.'
WHERE id = 'gemma4:e4b-q4';

UPDATE llm_model_catalog SET
    name = 'Gemma 4 Standard',
    description = 'Beste Balance aus Qualitaet und Geschwindigkeit. Empfohlen fuer die meisten Anwendungen. Multimodal, 256K Kontext, Thinking Mode.'
WHERE id = 'gemma4:26b-q4';

UPDATE llm_model_catalog SET
    name = 'Gemma 4 Pro',
    description = 'Maximale Qualitaet. Ideal fuer komplexe Aufgaben, Analyse, Forschung und Programmierung. Multimodal, 256K Kontext, Thinking Mode.'
WHERE id = 'gemma4:31b-q4';

COMMIT;
