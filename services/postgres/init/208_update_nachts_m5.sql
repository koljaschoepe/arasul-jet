-- 208_update_nachts_m5.sql -- Aktualisierung nachts auf Wunsch (04.10.2026, M5,
-- Auftrag update-nachts)
--
-- WARUM. Der Administrator kann das Gerät eine neue Fassung in einem festen
-- Nachtfenster selbst einspielen lassen (Verwaltung, Gerät, Aktualisierung).
-- Dazu braucht es zwei Dinge: den Schalter und ein Protokoll, was in jeder Nacht
-- geschah -- das Protokoll ist zugleich der Hinweis am Morgen auf der Startseite.
--
--   system_settings.update_nachts   der Schalter; aus als Vorgabe
--   update_nacht_laeufe             eine Zeile je Nacht (und je Trockenlauf)
--
-- Eine Nacht ist ein Fenster, benannt nach dem Tag, an dem es beginnt (`fenster`,
-- Datum in der Zeit des Geräts). Wer die Zeile anlegt, führt die Nacht aus: der
-- Eindeutigkeitsindex lässt es genau einmal je Fenster zu, auch wenn das
-- Backend mitten in der Nacht neu startet. Trockenläufe (`trocken`) zählen nicht
-- dazu.
--
--   ergebnis   laeuft | eingespielt | zurueckgefallen | fehlgeschlagen |
--              uebersprungen | nichts_zu_tun | trockenlauf
--   grund      ein Satz für einen Menschen (warum übersprungen, was schiefging)
--   gesehen_am wann der Administrator den Hinweis weggeklickt hat
--
-- Rollback (down): DROP TABLE public.update_nacht_laeufe; die Spalte fallen
-- lassen. Ohne sie spielt das Gerät nie von selbst ein.

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS update_nachts BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.update_nacht_laeufe (
  id          BIGSERIAL PRIMARY KEY,
  fenster     DATE NOT NULL,
  trocken     BOOLEAN NOT NULL DEFAULT false,
  ergebnis    TEXT NOT NULL CHECK (ergebnis IN (
                'laeuft', 'eingespielt', 'zurueckgefallen', 'fehlgeschlagen',
                'uebersprungen', 'nichts_zu_tun', 'trockenlauf')),
  grund       TEXT,
  von         TEXT,
  nach        TEXT,
  lauf        TEXT,
  gestartet   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  beendet     TIMESTAMPTZ,
  gesehen_am  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_update_nacht_laeufe_fenster
  ON public.update_nacht_laeufe (fenster) WHERE NOT trocken;
CREATE INDEX IF NOT EXISTS idx_update_nacht_laeufe_gestartet
  ON public.update_nacht_laeufe (gestartet DESC);

COMMENT ON TABLE public.update_nacht_laeufe IS
  'Was in jeder Nacht mit der Aktualisierung nachts geschah; zugleich der Hinweis am Morgen.';
