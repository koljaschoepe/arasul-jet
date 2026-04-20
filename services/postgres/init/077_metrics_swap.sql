-- Migration 077: Add metrics_swap table for swap utilization history.
-- Mirrors metrics_ram shape — the performance chart on the dashboard now
-- plots RAM / Swap / Temperatur instead of the old CPU / RAM / GPU trio.

CREATE TABLE IF NOT EXISTS metrics_swap (
    timestamp  TIMESTAMPTZ NOT NULL PRIMARY KEY,
    value      DOUBLE PRECISION NOT NULL CHECK (value >= 0 AND value <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_swap_timestamp
    ON metrics_swap("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_swap_recent
    ON metrics_swap("timestamp" DESC);
