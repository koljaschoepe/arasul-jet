-- 135_extension_n8n_workflow.sql — Plan 017 Schritt 3: Flow-Erweiterungen live.
--
-- Eine Erweiterung vom Typ `flow` bekommt beim Live-Schalten einen echten
-- n8n-Workflow (Import + Aktivierung). Die n8n-Workflow-ID wird am Register-
-- Eintrag gemerkt, damit erneutes Live-Schalten denselben Workflow überschreibt,
-- Deaktivieren ihn pausiert und Löschen ihn abräumt.

ALTER TABLE extensions
  ADD COLUMN IF NOT EXISTS n8n_workflow_id TEXT;

COMMENT ON COLUMN extensions.n8n_workflow_id IS
  'n8n-Workflow-ID einer live geschalteten Flow-Erweiterung (Plan 017 Schritt 3); NULL bei App/Tool oder noch nicht importiert.';
