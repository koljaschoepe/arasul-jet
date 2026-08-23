-- 161_kritische_ereignisse_zaehlen_vorfaelle.sql — ein Vorfall ist ein Vorfall,
-- nicht eine Protokollzeile (Plan 023, Befund vom 23.08.2026)
--
-- `get_critical_events_count()` entscheidet mit MAX_CRITICAL_EVENTS darueber,
-- ob das Geraet neu startet. Sie zaehlte bisher CRITICAL-Zeilen. Solange ein
-- Dienst ungesund blieb, schrieb die Selbstheilung aber im Takt ihres
-- Durchlaufs immer wieder dieselbe Zeile `service_escalation` fuer denselben
-- unveraenderten Zustand.
--
-- Auf dem Orin am 23.08.2026 gemessen, sieben Tage rueckwaerts:
--
--   service_escalation  pruef-llm-service   311 Zeilen an 61 Minuten
--   service_escalation  n8n-runners         283 Zeilen an 59 Minuten
--   service_escalation  n8n                 279 Zeilen an 60 Minuten
--   alles uebrige zusammen                   24 Zeilen
--
-- 97 Prozent aller kritischen Zeilen waren also Wiederholung. Am 19.08.2026 um
-- 21:39 stand deshalb im Protokoll "Multiple critical failures: 136 events in
-- 30min" und die Selbstheilung entschied auf Neustart. Dieselben 30 Minuten,
-- nach Vorfaellen gezaehlt: zwei. Der Neustart waere nicht ausgeloest worden.
--
-- Dass der Orin trotzdem seit dem 19.08.2026 durchlaeuft, liegt allein daran,
-- dass SELF_HEALING_REBOOT_ENABLED auf diesem Geraet aus steht. Im
-- unbeaufsichtigten Betrieb, den Gate G7 zusagt, steht der Schalter auf true
-- (`scripts/interactive_setup.sh`, UNATTENDED_MODE). Dort waere das Geraet in
-- vier Tagen dreimal neu gestartet, ohne dass ein Kunde je erfahren haette,
-- warum.
--
-- Ein Vorfall ist deshalb ab hier: ein Ereignistyp an einem Dienst. Dass
-- derselbe Vorfall haeufiger protokolliert wird, macht ihn nicht schlimmer.
-- Die Gegenrichtung bleibt scharf: drei VERSCHIEDENE kritische Vorfaelle in
-- 30 Minuten loesen weiterhin aus, und genau das war die Absicht.
--
-- Die Zeilen selbst bleiben unangetastet. Wer nachsehen will, wie oft ein
-- Vorfall auftrat, findet das weiterhin in `self_healing_events`.

CREATE OR REPLACE FUNCTION get_critical_events_count(
    p_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM (
        SELECT DISTINCT event_type, COALESCE(service_name, '')
        FROM self_healing_events
        WHERE severity IN ('CRITICAL', 'EMERGENCY')
          AND timestamp > NOW() - (p_minutes || ' minutes')::INTERVAL
    ) AS vorfaelle;

    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_critical_events_count(INTEGER) IS
  'Verschiedene kritische Vorfaelle (Ereignistyp je Dienst) im Fenster, nicht Protokollzeilen';
