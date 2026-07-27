-- 121_project_git.sql — Plan 013, B9: GitHub Zwei-Wege-Sync.
--
-- Koppelt ein PROJEKT (projects.id) an genau EIN GitHub-Repository. Der Backend-
-- Git-Dienst hält dafür einen container-lokalen Checkout (local_path) und
-- gleicht ihn per clone/pull/push mit dem Repo ab.
--
-- Ein Projekt ↔ ein Repo → project_id ist der Primärschlüssel (1:1). Wer das Repo
-- wechseln will, koppelt neu (DELETE + INSERT über die Route).
--
-- Der Personal Access Token liegt AES-256-GCM-VERSCHLÜSSELT als BYTEA
-- (IV || AuthTag || Ciphertext, utils/tokenCrypto.js — Schlüssel aus JWT_SECRET),
-- exakt wie user_external_credentials (Migration 107). Nur die letzten 4 Zeichen
-- stehen im Klartext für die Anzeige („••••abcd"). Der Klartext-PAT verlässt das
-- Backend nie wieder.
--
-- Rein additiv, idempotent, forward-only. Rollback (down):
--   DROP TABLE IF EXISTS project_git;

CREATE TABLE IF NOT EXISTS project_git (
  project_id     UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  repo_url       TEXT NOT NULL,
  branch         VARCHAR(120) NOT NULL DEFAULT 'main',
  -- Verschlüsselter PAT (IV||AuthTag||Ciphertext). NULL nur, wenn (noch) keiner
  -- hinterlegt ist — ohne PAT sind nur öffentliche Repos lesbar, kein Push.
  pat_encrypted  BYTEA,
  -- Nur zur Anzeige (Maskierung), nie zur Authentisierung.
  pat_last4      VARCHAR(8),
  -- Container-lokaler Checkout-Pfad (unter PROJECT_GIT_DIR).
  local_path     TEXT,
  last_synced_at TIMESTAMPTZ,
  last_status    VARCHAR(16) NOT NULL DEFAULT 'neu'
                   CHECK (last_status IN ('neu', 'verbunden', 'synchronisiert', 'konflikt', 'fehler')),
  last_error     TEXT,
  -- Kurz-SHA des zuletzt synchronisierten Commits (Anzeige).
  last_commit    VARCHAR(64),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE project_git IS
  'Plan 013, B9: Kopplung Projekt ↔ GitHub-Repo (1:1). PAT AES-256-GCM-verschlüsselt (tokenCrypto), Checkout unter PROJECT_GIT_DIR.';
COMMENT ON COLUMN project_git.pat_encrypted IS
  'AES-256-GCM: IV(16) || AuthTag(16) || Ciphertext. Schlüssel aus JWT_SECRET (utils/tokenCrypto.js).';
COMMENT ON COLUMN project_git.last_status IS
  'neu=angelegt · verbunden=PAT/Repo geprüft · synchronisiert=letzter Sync ok · konflikt=Merge-Konflikt offen · fehler=letzter Sync fehlgeschlagen.';
