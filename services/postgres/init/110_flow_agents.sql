-- 110_flow_agents.sql — Plan 010 · Schritt 1: Datenmodell & Provider-Registry
--
-- Zweck: Grundlage der Flow-Agenten-Orchestrierung (Plan 010). Führt vier neue,
-- rein additive Tabellen ein:
--   * flow_agents         — ein gespeicherter Agent (Prompt + Provider/Modell + Tools + Rechte).
--   * flows               — ein verzweigter Fluss als Graph-JSON (Knoten/Kanten),
--                           inkl. optionalem Zeitplan (Cron) und Webhook-Token für
--                           n8n (Schritt 7). Beide Spalten sind hier bereits angelegt,
--                           damit spätere Schritte KEINE bereits angewandte Migration
--                           editieren müssen (verboten laut services/postgres/CLAUDE.md).
--   * flow_runs           — der zuletzt gespeicherte Lauf pro Agent bzw. Fluss
--                           ("schlank": nur letzter Lauf; ältere Zeilen prunet die Engine).
--   * flow_provider_keys  — Admin-verwaltete, AES-256-GCM-verschlüsselte API-Keys
--                           externer Provider (OpenAI-kompatibel / Anthropic).
--
-- Diese Tabellen leben BEWUSST NEBEN den datei-basierten Workspace-Agenten
-- (Plan 008) — kein Bruch, keine Migration bestehender Agenten.
--
-- Verschlüsselung: flow_provider_keys.encrypted_key ist der AES-256-GCM-Blob
-- (IV || AuthTag || Ciphertext) als BYTEA — nie Klartext, Schlüssel aus JWT_SECRET
-- via apps/dashboard-backend/src/utils/tokenCrypto.js (gleiches Muster wie
-- Migration 107). Ein Zeilen-Leak ohne JWT_SECRET ist wertlos.
--
-- Forward-only und idempotent (CREATE TABLE/INDEX IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS), damit ein erneutes Ausführen folgenlos bleibt.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS flow_runs;
--   DROP TABLE IF EXISTS flows;
--   DROP TABLE IF EXISTS flow_agents;
--   DROP TABLE IF EXISTS flow_provider_keys;

-- ---------------------------------------------------------------------------
-- flow_agents — ein einzelner, ausführbarer Agent
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flow_agents (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  name           VARCHAR(120) NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  system_prompt  TEXT NOT NULL DEFAULT '',
  provider       VARCHAR(50) NOT NULL DEFAULT 'ollama',
  model          VARCHAR(200) NOT NULL DEFAULT '',
  tools          JSONB NOT NULL DEFAULT '[]'::jsonb,
  allow_external BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT flow_agents_user_name_uniq UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_flow_agents_user_id ON flow_agents(user_id);

COMMENT ON TABLE flow_agents IS
  'Flow-Agenten (Plan 010): gespeicherte Agent-Konfiguration (Prompt, Provider/Modell, Tools, Rechte). Getrennt von den Datei-Agenten (Plan 008).';
COMMENT ON COLUMN flow_agents.provider IS
  'Modell-Provider: ''ollama'' (lokal), ''openai'' (OpenAI-kompatibel) oder ''anthropic''. Siehe providerRegistry.js.';
COMMENT ON COLUMN flow_agents.tools IS
  'JSON-Array der freigegebenen Tool-Namen (z. B. ["rag","minio"]). Externe/Web-Tools nur bei allow_external.';
COMMENT ON COLUMN flow_agents.allow_external IS
  'TRUE erlaubt Netz-/Cloud-Tools (Web/HTTP). Default FALSE — rein lokaler Agent erreicht kein externes Netz. Nur Admin darf setzen.';

-- ---------------------------------------------------------------------------
-- flows — verzweigter Fluss als Graph-JSON
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flows (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  name           VARCHAR(120) NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  graph          JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  schedule_cron  VARCHAR(120),
  run_token_hash TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT flows_user_name_uniq UNIQUE (user_id, name)
);

-- Schritt 7 legt diese Spalten hier bereits an (siehe Kopf); ADD COLUMN
-- IF NOT EXISTS macht die Migration auch auf Alt-Boxen robust.
ALTER TABLE flows ADD COLUMN IF NOT EXISTS schedule_cron  VARCHAR(120);
ALTER TABLE flows ADD COLUMN IF NOT EXISTS run_token_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_flows_user_id ON flows(user_id);
CREATE INDEX IF NOT EXISTS idx_flows_schedule_cron ON flows(schedule_cron) WHERE schedule_cron IS NOT NULL;

COMMENT ON TABLE flows IS
  'Flow-Agenten (Plan 010): ein verzweigter Fluss als Graph-JSON (Knoten=Agenten/Bedingungen, Kanten=Reihenfolge). Optional zeit-/webhook-getriggert.';
COMMENT ON COLUMN flows.graph IS
  'Fluss-Graph {"nodes":[...],"edges":[...]}. Von der Fluss-Engine (Schritt 4) interpretiert.';
COMMENT ON COLUMN flows.schedule_cron IS
  'Optionaler Cron-Ausdruck des Arasul-Schedulers (Schritt 7). NULL = kein Zeitplan.';
COMMENT ON COLUMN flows.run_token_hash IS
  'bcrypt-Hash des einmalig ausgegebenen Bearer-Tokens für POST /api/agents/:id/run (n8n, Schritt 7). Nie das Klartext-Token.';

-- ---------------------------------------------------------------------------
-- flow_runs — zuletzt gespeicherter Lauf (schlank)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flow_runs (
  id           BIGSERIAL PRIMARY KEY,
  agent_id     BIGINT REFERENCES flow_agents(id) ON DELETE CASCADE,
  flow_id      BIGINT REFERENCES flows(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  trigger      VARCHAR(20) NOT NULL DEFAULT 'manual',
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  input        TEXT NOT NULL DEFAULT '',
  output       TEXT NOT NULL DEFAULT '',
  error        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  CONSTRAINT flow_runs_target_chk CHECK (
    (agent_id IS NOT NULL AND flow_id IS NULL) OR
    (agent_id IS NULL AND flow_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_flow_runs_agent_id ON flow_runs(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_id  ON flow_runs(flow_id)  WHERE flow_id  IS NOT NULL;

COMMENT ON TABLE flow_runs IS
  'Flow-Agenten (Plan 010): zuletzt gespeicherter Lauf pro Agent bzw. Fluss. Bewusst schlank (nur letzter Lauf, kein Audit-Log in v1).';
COMMENT ON COLUMN flow_runs.trigger IS
  'Auslöser: ''manual'' | ''schedule'' | ''webhook''.';
COMMENT ON COLUMN flow_runs.status IS
  'Lauf-Status: ''pending'' | ''running'' | ''done'' | ''error''.';

-- ---------------------------------------------------------------------------
-- flow_provider_keys — Admin-verwaltete, verschlüsselte externe API-Keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flow_provider_keys (
  id            BIGSERIAL PRIMARY KEY,
  provider      VARCHAR(50) NOT NULL,
  base_url      TEXT,
  encrypted_key BYTEA NOT NULL,
  created_by    INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT flow_provider_keys_provider_uniq UNIQUE (provider)
);

COMMENT ON TABLE flow_provider_keys IS
  'Flow-Agenten (Plan 010): global Admin-verwaltete API-Keys externer Modell-Provider (openai, anthropic). Ein Key pro Provider (v1).';
COMMENT ON COLUMN flow_provider_keys.provider IS
  'Provider-Kennung: ''openai'' (OpenAI-kompatibel) oder ''anthropic''. ''ollama'' braucht keinen Key.';
COMMENT ON COLUMN flow_provider_keys.base_url IS
  'Optionale Basis-URL für OpenAI-kompatible Endpoints (z. B. eigener Gateway). NULL = Provider-Default.';
COMMENT ON COLUMN flow_provider_keys.encrypted_key IS
  'AES-256-GCM-Blob (IV || AuthTag || Ciphertext) des API-Keys; verschlüsselt via utils/tokenCrypto.js (Schlüssel aus JWT_SECRET). Niemals Klartext.';
