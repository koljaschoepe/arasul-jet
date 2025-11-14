-- Migration: Add total column to metrics_disk table
-- This migration is idempotent and safe to run multiple times

-- Check if total column exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'metrics_disk'
        AND column_name = 'total'
    ) THEN
        -- Add total column
        ALTER TABLE metrics_disk
        ADD COLUMN total BIGINT NOT NULL DEFAULT 0 CHECK (total >= 0);

        -- Update existing rows to calculate total from used + free
        UPDATE metrics_disk
        SET total = used + free;

        -- Log migration
        INSERT INTO self_healing_events (event_type, severity, description, action_taken, service_name, success)
        VALUES (
            'database_migration',
            'INFO',
            'Added total column to metrics_disk table',
            'ALTER TABLE metrics_disk ADD COLUMN total',
            'postgres-db',
            true
        );

        RAISE NOTICE 'Migration 003: Added total column to metrics_disk';
    ELSE
        RAISE NOTICE 'Migration 003: total column already exists, skipping';
    END IF;
END $$;
