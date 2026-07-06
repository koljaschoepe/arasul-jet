-- 097_document_status_partial.sql — Cleanup-Plan P6-17: partial-index status
--
-- Adds a 'partial' value to the document_status enum. Documents whose embedding
-- only partially succeeded (some child chunks failed to embed, but at least one
-- succeeded) were previously marked 'indexed' — silently hiding that the
-- knowledge base for that document is incomplete. They now get a distinct
-- 'partial' status: still searchable, but flagged for re-indexing.
--
-- Additive + idempotent: ADD VALUE IF NOT EXISTS is a no-op if the value already
-- exists. PostgreSQL 12+ (we run 16) permits ALTER TYPE ... ADD VALUE inside a
-- transaction block, as long as the new value is not *used* in the same
-- transaction. This migration only adds it (never uses it), so it is safe under
-- the runtime migration runner's per-file transaction wrapping.

ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'partial';
