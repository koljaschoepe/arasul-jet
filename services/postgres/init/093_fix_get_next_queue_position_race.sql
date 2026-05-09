-- 093_fix_get_next_queue_position_race.sql
-- Repo-Deep-Audit 2026-05-08 P1.5.3
--
-- Problem: get_next_queue_position() reads MAX(queue_position) without any lock.
-- Two concurrent enqueue calls can read the same MAX value and both return the
-- same "next" position, producing duplicate queue slots and out-of-order
-- processing. An advisory lock alone is not enough because the SELECT and
-- the subsequent INSERT into llm_jobs run in separate auto-commit transactions
-- in the backend, so the lock is released between them.
--
-- Fix: back the position by a PostgreSQL sequence — nextval() is fully atomic
-- across concurrent connections by design. Positions become monotonically
-- increasing forever (positions of completed jobs are never reused), which is
-- fine because the queue is ordered, not gap-filled.

-- 1. Sequence keyed on llm_jobs.queue_position
CREATE SEQUENCE IF NOT EXISTS llm_jobs_queue_position_seq;

-- 2. Bring the sequence forward to MAX(existing)+1 so new jobs continue past
--    existing rows. setval() is idempotent and safe to re-run.
DO $$
DECLARE
    current_max INTEGER;
BEGIN
    SELECT COALESCE(MAX(queue_position), 0) INTO current_max FROM llm_jobs;
    PERFORM setval('llm_jobs_queue_position_seq', current_max + 1, false);
END $$;

-- 3. Replace the racy implementation with nextval()
CREATE OR REPLACE FUNCTION get_next_queue_position()
RETURNS INTEGER AS $$
BEGIN
    RETURN nextval('llm_jobs_queue_position_seq');
END;
$$ LANGUAGE plpgsql;
