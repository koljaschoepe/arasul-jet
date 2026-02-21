-- 003_tables_filter_fields.sql
-- Add space_id, status, and category fields to dt_tables for filtering support

-- Add new columns
ALTER TABLE dt_tables ADD COLUMN IF NOT EXISTS space_id UUID;
ALTER TABLE dt_tables ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE dt_tables ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Add CHECK constraint for status values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dt_tables_status_check'
    ) THEN
        ALTER TABLE dt_tables ADD CONSTRAINT dt_tables_status_check
            CHECK (status IN ('active', 'draft', 'archived'));
    END IF;
END $$;

-- Create indices for filtering performance
CREATE INDEX IF NOT EXISTS idx_dt_tables_space_id ON dt_tables(space_id);
CREATE INDEX IF NOT EXISTS idx_dt_tables_status ON dt_tables(status);
CREATE INDEX IF NOT EXISTS idx_dt_tables_category ON dt_tables(category);
