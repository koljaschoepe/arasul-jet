-- 195_stufen_standardperson_m5.sql -- Bei wem eine Freigabe liegt
-- (04.10.2026, M5, Auftrag flow-stufen-standardperson)
--
-- WARUM. Seit C7 liegt jede Freigabe bei allen, denen die App freigegeben ist.
-- Bei drei Menschen geht das, bei zwanzig fuehlt sich niemand gemeint, und die
-- Freigabe laeuft in ihre Frist. Das Zielbild (frontend.md, Flows und
-- Freigaben, Stufen): der Admin setzt je App und Stufe eine Standardperson,
-- jede neue Freigabe liegt zuerst bei ihr, jeder mit Zugang kann sie
-- uebernehmen oder weitergeben. Der Flow nennt weiter keine Person
-- (Beschluss 27.08.2026): die Person steht HIER, gesetzt in der Verwaltung,
-- und nicht in der Flow-Datei.
--
-- WAS DRINSTEHT.
--   app_stufen_personen   je App und Stufe hoechstens eine Standardperson.
--                         Die Stufe ist der Name aus `stufen` im Flow-Kopf
--                         (Kontrakt 8); zwei Flows derselben App mit einer
--                         Stufe `leitung` meinen dieselbe Leitung.
--   approvals.liegt_bei   bei wem die Anfrage jetzt liegt. NULL = bei allen,
--                         die sie entscheiden duerfen. Zeigt die Spalte auf
--                         jemanden, der den Zugang inzwischen verloren hat,
--                         gilt sie als NULL (die Abfragen pruefen das, nicht
--                         ein Trigger: der Kreis haengt an `app_members`).
--   approvals.liegt_seit  seit wann sie dort liegt.
--
-- Rollback (down):
--   ALTER TABLE public.approvals DROP COLUMN IF EXISTS liegt_seit;
--   ALTER TABLE public.approvals DROP COLUMN IF EXISTS liegt_bei;
--   DROP TABLE IF EXISTS public.app_stufen_personen;

CREATE TABLE IF NOT EXISTS public.app_stufen_personen (
  app_id       TEXT        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  stufe        TEXT        NOT NULL,
  -- Geht der Mensch, geht seine Zustaendigkeit mit; die Stufe faellt dann auf
  -- "bei allen mit Zugang" zurueck, und der Admin sieht den Hinweis.
  user_id      BIGINT      NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  gesetzt_von  BIGINT      REFERENCES public.admin_users(id) ON DELETE SET NULL,
  gesetzt_am   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, stufe)
);

COMMENT ON TABLE public.app_stufen_personen IS
  'Standardperson je App und Freigabestufe; neue Freigaben der Stufe liegen zuerst bei ihr. Migration 195.';

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS liegt_bei BIGINT
    REFERENCES public.admin_users(id) ON DELETE SET NULL;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS liegt_seit TIMESTAMPTZ;

COMMENT ON COLUMN public.approvals.liegt_bei IS
  'Bei wem die offene Anfrage liegt; NULL = bei allen, die entscheiden duerfen. Migration 195.';

-- Die Frage der Startseite: "was liegt bei mir?"
CREATE INDEX IF NOT EXISTS idx_approvals_liegt_bei
  ON public.approvals (liegt_bei)
  WHERE status = 'offen';
