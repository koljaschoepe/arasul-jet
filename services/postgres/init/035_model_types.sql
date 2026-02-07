-- Migration 035: Add model_type column to llm_model_catalog
-- Supports: llm, ocr, vision, audio
-- This enables the unified Store to filter models by type

-- Add model_type column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'llm_model_catalog' AND column_name = 'model_type'
    ) THEN
        ALTER TABLE llm_model_catalog
        ADD COLUMN model_type VARCHAR(20) DEFAULT 'llm'
        CHECK (model_type IN ('llm', 'ocr', 'vision', 'audio'));

        COMMENT ON COLUMN llm_model_catalog.model_type IS 'Type of model: llm (language), ocr (text recognition), vision (image analysis), audio (speech)';
    END IF;
END $$;

-- Create index for type filtering
CREATE INDEX IF NOT EXISTS idx_model_catalog_type ON llm_model_catalog(model_type);

-- Insert OCR models into catalog (if not exist)
INSERT INTO llm_model_catalog (id, name, description, size_bytes, ram_required_gb, category, capabilities, recommended_for, model_type, performance_tier)
VALUES
    ('tesseract:latest', 'Tesseract OCR', 'Open-Source Texterkennung fuer Dokumente und Bilder. Unterstuetzt 100+ Sprachen.',
     536870912, 1, 'small', '["ocr", "pdf", "multi-language", "document-scanning"]'::jsonb,
     '["document-processing", "pdf-text-extraction", "image-text"]'::jsonb, 'ocr', 1),
    ('paddleocr:latest', 'PaddleOCR', 'KI-basierte Texterkennung mit GPU-Beschleunigung. Hohe Genauigkeit bei komplexen Layouts.',
     4294967296, 4, 'small', '["ocr", "table-recognition", "layout-analysis", "gpu-accelerated"]'::jsonb,
     '["document-processing", "table-extraction", "complex-layouts"]'::jsonb, 'ocr', 1)
ON CONFLICT (id) DO UPDATE SET
    model_type = EXCLUDED.model_type,
    capabilities = EXCLUDED.capabilities,
    recommended_for = EXCLUDED.recommended_for;

-- Update existing LLM models to explicitly set model_type = 'llm'
UPDATE llm_model_catalog SET model_type = 'llm' WHERE model_type IS NULL;
