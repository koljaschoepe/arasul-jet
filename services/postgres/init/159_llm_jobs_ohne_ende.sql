-- 159_llm_jobs_ohne_ende.sql — Laeufe, die keine Aufraeumung je erreicht
--
-- Fund vom 23.08.2026 auf dem Orin. In `llm_jobs` lagen neun Zeilen aus dem
-- April und Juli, obwohl die Aufraeumung stuendlich laeuft:
--
--   cancelled | 2026-07-30 21:20:36 | completed_at NULL
--   error     | 2026-04-16 20:44:31 | completed_at NULL
--
-- `cleanup_old_llm_jobs` loescht nach `completed_at < NOW() - 1 hour`. Wo
-- `completed_at` NULL ist, ist der Vergleich NULL, also nicht wahr, also wird
-- nie geloescht. Und `cleanup_stale_llm_jobs`, die `completed_at` nachtraegt,
-- greift nur bei `pending` und `streaming` — eine Zeile, die schon `error`
-- oder `cancelled` ist, erreicht sie nicht mehr.
--
-- Neun Zeilen sind nichts. Der Punkt ist ein anderer: das Geraet soll fuenf
-- Jahre unbeaufsichtigt laufen (Gate G7), und eine Zeile, die KEINE
-- Aufraeumung je erreicht, verschwindet nie wieder. Was sich nicht selbst
-- heilen kann, waechst.
--
-- Behoben ohne neue Funktion: dieselbe Aufraeumung nimmt jetzt auch die
-- Zeilen, deren Ende fehlt, gemessen an `queued_at`. Die Frist ist dort
-- bewusst laenger (ein Tag statt einer Stunde), weil `queued_at` der Anfang
-- ist und nicht das Ende — ein Lauf, der laenger als eine Stunde arbeitet,
-- soll nicht unter der eigenen Aufraeumung weggezogen werden.

CREATE OR REPLACE FUNCTION cleanup_old_llm_jobs()
RETURNS void AS $$
BEGIN
    DELETE FROM llm_jobs
    WHERE status IN ('completed', 'error', 'cancelled')
    AND (
        completed_at < NOW() - INTERVAL '1 hour'
        OR (completed_at IS NULL AND queued_at < NOW() - INTERVAL '1 day')
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_llm_jobs IS
    'Loescht beendete Laeufe: nach einer Stunde ab completed_at, und nach einem Tag ab queued_at, wenn completed_at fehlt (Fund 23.08.2026).';
