-- 111_drop_flow_agents.sql — Plan 011 · Schritt 3: Fluss-Layer entfernen
--
-- Zweck: Der komplette Agenten-/Fluss-Layer aus Plan 010 wird ersatzlos
-- entfernt (Nutzer-Entscheidung 2026-07-21, siehe docs/plans/done/011-*.html).
-- An seine Stelle treten Skills, die als Markdown-Dateien unter data/skills/
-- leben — also ohne eigene Tabellen. Diese Migration räumt die vier Tabellen
-- ab, die Migration 110 angelegt hat.
--
-- ACHTUNG — DIESE MIGRATION IST DESTRUKTIV UND NICHT UMKEHRBAR.
-- Gespeicherte Flüsse, Fluss-Agenten, Laufhistorie und die verschlüsselten
-- Provider-Keys sind danach nur noch über ein Backup wiederherstellbar. Das
-- ist die bewusste Entscheidung aus Plan 011 (§7 „Rollback"): ein sauberer
-- Schnitt statt einer stillgelegten Altlast. Der zugehörige Code bleibt in
-- der Git-Historie (Stand 39e65a1) erhalten.
--
-- Vor dem Anwenden wird auf dem Gerät gezählt, wie viele Datensätze betroffen
-- sind; die Zahlen stehen im Ausführungs-Report des Plans. Zählabfrage:
--   SELECT
--     (SELECT count(*) FROM flow_agents)        AS flow_agents,
--     (SELECT count(*) FROM flows)              AS flows,
--     (SELECT count(*) FROM flow_runs)          AS flow_runs,
--     (SELECT count(*) FROM flow_provider_keys) AS flow_provider_keys;
--
-- Keine andere Tabelle referenziert diese vier (kein eingehender Fremd-
-- schlüssel), daher ist kein CASCADE nötig und es hängt nichts mit dran.
--
-- Forward-only und idempotent (DROP TABLE IF EXISTS), damit ein erneutes
-- Ausführen folgenlos bleibt.
--
-- Nicht entfernt: sandbox_projects.agent_run_token_hash / _set_at. Diese
-- Spalten stammen aus Plan 008 und ihr Entfernen wäre ein separater,
-- invasiverer Eingriff ohne Nutzen (Plan 011, Schritt 3).

-- Reihenfolge: flow_runs zuerst — die Tabelle referenziert flow_agents/flows.
DROP TABLE IF EXISTS flow_runs;
DROP TABLE IF EXISTS flows;
DROP TABLE IF EXISTS flow_agents;
DROP TABLE IF EXISTS flow_provider_keys;
