-- 166_rueckbau_b7.sql — cleanup_old_metrics() ohne workflow_activity
-- (Phase B7 des Ueberordner-Plans vom 26.08.2026)
--
-- Migration 164 hat `workflow_activity` (001, n8n-Kopplung) entfernt, aber
-- `cleanup_old_metrics()` aus 001 loeschte weiter daraus. Auf dem Orin meldete
-- `run_all_cleanups()` seither `NOTICE: relation "workflow_activity" does not
-- exist`, und das war nicht nur eine Meldung: der EXCEPTION-Block in 001 fing
-- den Fehler, und die drei DELETEs dahinter (`self_healing_events`,
-- `system_snapshots`, `service_restarts`) liefen seit 164 nicht mehr.
--
-- Der EXCEPTION-Block faellt mit. `run_all_cleanups()` (165) huellt jeden
-- Aufruf selbst ein und schreibt den Fehler in sein JSON; ein zweiter Faenger
-- darunter haette den Fehler nur wieder in eine NOTICE verwandelt, die niemand
-- liest.

CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
    DELETE FROM metrics_cpu WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM metrics_ram WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM metrics_gpu WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM metrics_temperature WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM metrics_disk WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM self_healing_events WHERE timestamp < NOW() - INTERVAL '30 days';
    DELETE FROM system_snapshots WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM service_restarts WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_metrics() IS
  'Messwerte (7 Tage), Selbstheilungs-Ereignisse und Dienst-Neustarts (30 Tage). Ohne workflow_activity seit 166.';
