-- 107_external_credentials.sql — Plan 008 · Schritt 14
--
-- Zweck: Ein einmaliger Login einer externen CLI (v1: Claude Code) in einem
-- Sandbox-Terminal soll `docker compose up -d --build` überleben, ohne dass
-- sich der Nutzer erneut anmelden muss. Dazu werden die von der CLI im
-- Container abgelegten Credential-Dateien pro Nutzer VERSCHLÜSSELT in der DB
-- gespeichert (AES-256-GCM, Schlüssel aus JWT_SECRET, via
-- apps/dashboard-backend/src/utils/tokenCrypto.js) und beim (Neu-)Start des
-- Container-Workspaces zurückgeschrieben.
--
-- Gespeichert wird ausschließlich der AES-256-GCM-Blob (IV || AuthTag ||
-- Ciphertext) als BYTEA — nie Klartext. Ein Zeilen-Leak ohne JWT_SECRET
-- ist damit wertlos.
--
-- Forward-only und idempotent (CREATE TABLE/INDEX IF NOT EXISTS), damit ein
-- erneutes Ausführen auf bereits migrierten Boxen folgenlos bleibt.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS user_external_credentials;

CREATE TABLE IF NOT EXISTS user_external_credentials (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  provider              VARCHAR(50) NOT NULL,
  encrypted_credentials BYTEA NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_external_credentials_user_provider_uniq UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_external_credentials_user_id
  ON user_external_credentials(user_id);

COMMENT ON TABLE user_external_credentials IS
  'Pro Nutzer verschlüsselt gespeicherte Credentials externer CLIs (Plan 008 Schritt 14). v1: provider=claude — die Claude-Code-Login-Dateien, damit ein Login einen Container-Rebuild überlebt.';
COMMENT ON COLUMN user_external_credentials.user_id IS
  'FK auf admin_users(id) — der Besitzer der Credentials (ON DELETE CASCADE).';
COMMENT ON COLUMN user_external_credentials.provider IS
  'Anbieter-Kennung der Credentials, z. B. ''claude''. Zusammen mit user_id eindeutig.';
COMMENT ON COLUMN user_external_credentials.encrypted_credentials IS
  'AES-256-GCM-Blob (IV || AuthTag || Ciphertext) des JSON-serialisierten Credential-Objekts; verschlüsselt via utils/tokenCrypto.js (Schlüssel aus JWT_SECRET). Niemals Klartext.';
COMMENT ON COLUMN user_external_credentials.created_at IS 'Zeitpunkt der ersten Speicherung.';
COMMENT ON COLUMN user_external_credentials.updated_at IS 'Zeitpunkt der letzten Aktualisierung (Upsert).';
