-- Migration 087: n8n External-Call Logging + Whitelist (Phase 1.7)
--
-- Zwei Tabellen:
--   1. n8n_external_call_log — protokolliert jede HTTP-Anfrage von n8n nach
--      außen (Workflow-ID, Ziel-URL, Zeitstempel, Status). Pflicht für Kanzlei-DSB
--      um Datenabfluss nachzuweisen.
--   2. n8n_allowed_external_domains — Whitelist administrativer Domains, die
--      n8n-Workflows kontaktieren dürfen. Default: leer (= alles geblockt).
--
-- Hinweis: Das Enforcement im n8n-Container (Custom-Node oder Egress-Firewall)
-- kommt in einer Folge-Iteration. Diese Migration legt nur das Schema an, sodass
-- das Logging und die Whitelist-Verwaltung ab sofort über das Dashboard möglich
-- sind. Ohne Enforcement ist die Whitelist eine Soll-Konfiguration, kein Block.

BEGIN;

CREATE TABLE IF NOT EXISTS n8n_external_call_log (
    id              BIGSERIAL PRIMARY KEY,
    workflow_id     VARCHAR(64),
    workflow_name   VARCHAR(255),
    execution_id    VARCHAR(64),
    target_url      TEXT NOT NULL,
    target_host     VARCHAR(255) NOT NULL,
    method          VARCHAR(10) NOT NULL DEFAULT 'GET',
    status_code     INTEGER,
    blocked         BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason    TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_n8n_calls_target_host
    ON n8n_external_call_log(target_host);
CREATE INDEX IF NOT EXISTS idx_n8n_calls_workflow
    ON n8n_external_call_log(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_n8n_calls_blocked
    ON n8n_external_call_log(blocked, created_at DESC) WHERE blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_n8n_calls_created_at
    ON n8n_external_call_log(created_at DESC);

COMMENT ON TABLE n8n_external_call_log IS
  'Phase 1.7: Audit-Trail für jeden externen HTTP-Call aus n8n-Workflows. '
  'Beweispflicht für Kanzlei-DSB.';

CREATE TABLE IF NOT EXISTS n8n_allowed_external_domains (
    id              SERIAL PRIMARY KEY,
    domain          VARCHAR(255) NOT NULL UNIQUE,
    description     TEXT,
    added_by        INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE n8n_allowed_external_domains IS
  'Phase 1.7: Whitelist externer Domains, die n8n-Workflows kontaktieren dürfen. '
  'Leer = alles geblockt. Verwaltung über Settings → n8n-Integration.';

-- Empfehlung für Default-Whitelist (nicht eingespielt, dokumentiert):
--   - api.telegram.org (für Telegram-Bots, falls aktiviert)
--   - oauth2.googleapis.com (für Google Workspace OAuth, falls genutzt)
-- Admin muss diese explizit über die UI hinzufügen.

COMMIT;
