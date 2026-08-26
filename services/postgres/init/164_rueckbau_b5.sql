-- 164_rueckbau_b5.sql — n8n und die Plattform-Apps fallen
-- (Phase B5 des Ueberordner-Plans vom 26.08.2026)
--
-- Die Container n8n, n8n-runners und searxng sind mit den Commits dieser
-- Phase aus dem Stack, der Code dazu aus Backend und Oberflaeche. Diese
-- Migration zieht das Schema nach:
--
--   * das Schema `n8n`, das n8n beim ersten Start selbst angelegt und mit
--     111 Tabellen gefuellt hat (Workflows, Zugangsdaten, Laeufe). Es steht in
--     keiner Migration, deshalb faellt es hier als Ganzes.
--   * vier Tabellen der n8n-Kopplung: `workflow_activity` (001),
--     `n8n_external_call_log` und `n8n_allowed_external_domains` (087),
--     `arasul.n8n_audit_log` (090) samt Trigger-Funktionen.
--   * `arasul.platform_apps` (100, 108, 108a): der An-/Aus-Schalter der
--     kuratierten Kern-Apps. Das App-Modell aus Phase C3 ersetzt ihn.
--
-- VORHER SICHERN. Ein Abzug des Schemas `n8n` und der fuenf Tabellen liegt
-- auf dem Orin unter /home/arasul/sicherungen/b5-n8n-2026-08-26/ (mit dem
-- n8n-Verschluesselungsschluessel, ohne den die Zugangsdaten im Abzug
-- wertlos sind). Der Deploy legt vor jeder Migration zusaetzlich einen
-- vollen Abzug an (scripts/deploy/deploy-local.sh).
--
-- CASCADE mit IF EXISTS, wie in 163: an `n8n_audit_log` haengen die Trigger
-- aus 090 auf jeder n8n-Tabelle, und das Schema `n8n` traegt gut hundert
-- Fremdschluessel untereinander. Ausserhalb dieser Objekte verweist nichts
-- auf sie, CASCADE reisst also nichts Bleibendes mit.
--
-- Rueckwaerts: nicht vorgesehen. Wer n8n zurueckholt, spielt den Abzug ein
-- und baut die Compose-Dienste aus dem Stand 28348e36 wieder auf.

-- 1. Funktionen der n8n-Kopplung (090). Die Trigger auf den n8n-Tabellen
--    fallen mit dem Schema in Schritt 2; die Funktionen dahinter hier.
DROP FUNCTION IF EXISTS arasul.ensure_n8n_audit_triggers() CASCADE;
DROP FUNCTION IF EXISTS arasul.n8n_audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS arasul.cleanup_n8n_audit_log() CASCADE;

-- 2. Das Schema von n8n selbst.
DROP SCHEMA IF EXISTS n8n CASCADE;

-- 3. Die Tabellen der Kopplung und der Plattform-Apps.
DROP TABLE IF EXISTS arasul.n8n_audit_log CASCADE;
DROP TABLE IF EXISTS public.n8n_external_call_log CASCADE;
DROP TABLE IF EXISTS public.n8n_allowed_external_domains CASCADE;
DROP TABLE IF EXISTS public.workflow_activity CASCADE;
DROP TABLE IF EXISTS arasul.platform_apps CASCADE;
-- Vor Migration 090 landete ein unqualifiziertes CREATE TABLE in public;
-- 100 lief danach, also liegt platform_apps in arasul. Falls ein Geraet die
-- Tabelle aus einer aelteren Reihenfolge in public traegt, faellt sie hier.
DROP TABLE IF EXISTS public.platform_apps CASCADE;
