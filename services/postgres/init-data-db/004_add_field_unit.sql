-- Add unit column to dt_fields for measurement units (kg, m, €, etc.)
ALTER TABLE dt_fields ADD COLUMN IF NOT EXISTS unit VARCHAR(50);
