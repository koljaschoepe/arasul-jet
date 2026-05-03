-- Migration 088: 7-Jahre-Retention für Security-Audit-Log (Phase 1.5)
--
-- StBerG (Steuerberatergesetz) und vergleichbare Berufsrechte verlangen die
-- Aufbewahrung berufsbezogener Audit-Spuren für 7 Jahre. Bisher: 1 Jahr.
-- Diese Migration erhöht den Default und ergänzt eine separate Funktion, sodass
-- ein Custom-Retention nicht versehentlich darunter geht.

BEGIN;

-- 1) Default des bestehenden Cleanup-Calls auf 7 Jahre.
CREATE OR REPLACE FUNCTION cleanup_old_security_audit_logs(retention_days INTEGER DEFAULT 2555)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Phase 1.5: Untergrenze erzwingen — niemals weniger als 7 Jahre löschen,
    -- auch nicht bei explizitem retention_days-Argument. Schützt vor
    -- versehentlichen Cleanup-Aufrufen mit kleinem Wert.
    IF retention_days < 2555 THEN
        retention_days := 2555;
    END IF;

    DELETE FROM audit_logs
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_security_audit_logs IS
  'Phase 1.5: Removes security audit logs older than retention_days (Default + Untergrenze 7 Jahre / 2555 Tage). '
  'Erfüllt StBerG, BRAO, KBV-Aufbewahrungspflichten.';

-- 2) Failure-Counter für Async-Audit-Writes (Backend liest Wert für Metric).
CREATE TABLE IF NOT EXISTS audit_log_health (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    failure_count   BIGINT NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_failure_reason TEXT,
    last_success_at TIMESTAMPTZ
);

INSERT INTO audit_log_health (id) VALUES (1) ON CONFLICT DO NOTHING;

COMMENT ON TABLE audit_log_health IS
  'Phase 1.5: Health-Counter für asynchrone Audit-Writes. Wird von auditLog.js bei jedem Write aktualisiert.';

COMMIT;
