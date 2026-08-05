-- 133: claude_workspaces entfernen (Plan 015, Phase 1)
--
-- Die Tabelle (Migration 015) verwaltete Host→Container-Bind-Mounts für den
-- alten ttyd-basierten Claude-Code-Container (`services/claude-code/`). Dieser
-- Stack wird mit Plan 015 vollständig abgerissen; die Tabelle und ihre API
-- (`/api/workspaces`, `configService.getClaudeWorkspaceVolumes`) sind damit
-- verwaist. Der neue Terminal-Weg (Sandbox-`docker exec`) mountet den aktiven
-- Projektordner ohne diese Tabelle.
--
-- Rückbau, kein Datenverlust mit Bedeutung: die Zeilen beschrieben Mounts für
-- einen Container, den es nicht mehr gibt. Die Migration ist idempotent.

DROP TABLE IF EXISTS claude_workspaces CASCADE;
