-- 150_lizenz_neu_lesen.sql — Plan 023 D3: eine Lizenz, eine Schreibweise
--
-- Am 21.08.2026 auf dem Orin gemessen, nachdem der Steckbrief aus D2 lief:
-- dieselbe Lizenz stand an sieben Modellen als "Apache License 2.0" und an
-- dreien als "apache-2.0". Ursache war die Rangfolge in `lizenzBezeichnung`:
-- das Kuerzel aus `general.license` hatte Vorrang vor dem Lizenztext, obwohl
-- der Text das Dokument selbst ist und die gelaeufige Bezeichnung traegt.
--
-- Die Rangfolge ist umgedreht. Damit die schon gelesenen Zeilen davon
-- profitieren, wird ihr Zeitstempel geleert; der naechste Modell-Abgleich
-- liest sie neu. Betroffen sind nur Zeilen, deren Lizenz wie ein Kuerzel
-- aussieht: klein geschrieben, ohne Leerzeichen.
--
-- Idempotent: nach dem Neulesen trifft die Bedingung nicht mehr zu.

UPDATE llm_model_catalog
   SET profile_read_at = NULL,
       updated_at = NOW()
 WHERE license IS NOT NULL
   AND license = lower(license)
   AND license NOT LIKE '% %';
