-- 158_zeitplan_erstellt_von.sql — der nächtliche Lauf braucht einen Nutzer
--
-- Fund vom 23.08.2026, auf dem Orin gemessen. Ein Zeitplan feuerte pünktlich,
-- und der Lauf scheiterte sofort:
--
--   null value in column "user_id" of relation "flow_runs"
--   violates not-null constraint
--
-- `zeitplanService.taktLauf` rief den Flow mit `userId: null` auf, weil in der
-- Tabelle kein Nutzer stand. Damit konnte die dritte Zusage aus H1 („läuft
-- nachts einmal von selbst") auf KEINEM Gerät je funktionieren. Der Zeitplan
-- selbst war in Ordnung, nur der Lauf danach nicht.
--
-- Wer den Zeitplan anlegt, steht im Brücken-Token; die interaktive Route
-- `flows/:name/run` reicht ihn längst durch. Diese Spalte hält ihn fest.
--
-- Nullable, weil Zeilen aus der Zeit davor keinen Nutzer haben. Für die greift
-- der Rückfall im Dienst (ältester Administrator), damit ein bestehender
-- Zeitplan nicht stillschweigend nie wieder läuft.
--
-- `admin_users` liegt in `public`. Kein Fremdschlüssel: `flow_runs.user_id`
-- hat auch keinen, und ein gelöschter Administrator soll einen Zeitplan nicht
-- mit abräumen — er fällt dann auf denselben Weg zurück wie eine alte Zeile.

ALTER TABLE public.extension_zeitplaene
  ADD COLUMN IF NOT EXISTS erstellt_von BIGINT;

COMMENT ON COLUMN public.extension_zeitplaene.erstellt_von IS
  'Nutzer, unter dem der nächtliche Lauf startet. NULL = Rückfall auf den ältesten Administrator.';
