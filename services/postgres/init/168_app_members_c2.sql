-- 168_app_members_c2.sql — Freigaben: welche App sieht welcher Mitarbeiter
-- (Phase C2 des Ueberordner-Plans vom 26.08.2026)
--
-- Diese Tabelle tritt an die Stelle von `space_members` (Migration 089). Die
-- alte Tabelle band einen Nutzer an einen Wissensraum; Wissensraeume gibt es
-- seit Phase B4 nicht mehr, Migration 163 hat `space_members` mit ihnen
-- verworfen. Was bleibt, ist die Frage dahinter, und die lautet jetzt: welche
-- App darf welcher Mitarbeiter sehen. Deshalb ist das hier keine Umbenennung,
-- sondern eine neue Tabelle mit demselben Zweck an neuer Stelle.
--
-- `app_id` ist bis Phase C3 ein FREIER TEXT. Das App-Modell (Manifest
-- `app.json`, Tabelle `apps`) kommt erst dort; bis dahin gibt es nichts, worauf
-- ein Fremdschluessel zeigen koennte. Die Freigabe ist trotzdem jetzt schon
-- notwendig, weil ohne sie die Mitarbeiterverwaltung nur die Haelfte kann:
-- anlegen ja, freigeben nein. C3 setzt den Fremdschluessel nach.
--
-- Kein `permission`-Feld wie in 089. Dort gab es drei Stufen (read, write,
-- admin) fuer einen Wissensraum. Eine App ist freigegeben oder nicht; wer
-- innerhalb der App was darf, entscheidet die App, nicht die Plattform.
-- Eine Spalte, die niemand liest, ist eine Zusage, die niemand einhaelt.

CREATE TABLE IF NOT EXISTS public.app_members (
  app_id           TEXT        NOT NULL,
  user_id          BIGINT      NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  freigegeben_von  BIGINT      REFERENCES public.admin_users(id) ON DELETE SET NULL,
  freigegeben_am   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, user_id)
);

-- Der Primaerschluessel beginnt mit `app_id` und traegt damit die Frage
-- "wer darf diese App". Die Gegenrichtung, "welche Apps darf dieser Mensch",
-- ist die haeufigere: sie steht hinter jedem Seitenaufruf eines Mitarbeiters.
CREATE INDEX IF NOT EXISTS idx_app_members_user ON public.app_members(user_id);

COMMENT ON TABLE public.app_members IS
  'Freigaben: welcher Mitarbeiter sieht welche App. Ersetzt space_members (089, verworfen mit 163); seit 168';
COMMENT ON COLUMN public.app_members.app_id IS
  'Kennung der App. Freier Text bis C3, danach Fremdschluessel auf apps.id';
COMMENT ON COLUMN public.app_members.freigegeben_von IS
  'Der Administrator, der freigegeben hat; NULL, wenn sein Konto geloescht wurde';
