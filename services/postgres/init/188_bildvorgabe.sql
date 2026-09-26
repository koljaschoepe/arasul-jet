-- 188_bildvorgabe.sql — Welches Modell ein Bild bekommt, sagt eine Messung
-- (26.09.2026, J35, Auftrag bildmodell-vorgabe-und-format)
--
-- WARUM. Eine App, die ein Bild ohne `model` an `llm/chat` schickt, bekam bis
-- hierher das Modell der Aufgabe `vision`, also `llava-phi3`. Am Orin mit fuenf
-- erfundenen Belegfotos gemessen (`scripts/test/bildmodelle-messen.sh`,
-- `tests/belege/`, drei Laeufe je Beleg, ueber die Warteschlange):
--
--   gemma4:e4b   90 von 90 Feldern richtig, rund 5 s je Beleg
--   llava-phi3    1 von 90 Feldern richtig, fuenf von fuenfzehn Aufrufen nach
--                 60 s abgebrochen, weil das Modell sich festredete
--
-- Eine Kanzlei fotografiert Belege; ein Vorgabemodell, das davon nichts liest,
-- macht die Bildfunktion wertlos.
--
-- WARUM EINE EIGENE SPALTE und nicht `is_task_default`. `gemma4:e4b` ist das
-- kleine schnelle TEXTmodell der Kurzliste (`task = 'text'`), und das bleibt es:
-- `POST /api/models/default` und der Rueckfall des Standards richten sich nach
-- der Aufgabe. Es liest Bilder zusaetzlich (`supports_vision_input`, Migration
-- 175). `idx_llm_catalog_task_default` laesst je Aufgabe genau einen Standard
-- zu, und die Aufgabe eines Modells umzudeuten, damit es Bilder als Vorgabe
-- bekommt, hiesse, eine zweite Frage mit der Antwort auf die erste zu
-- beantworten. `bildvorgabe` sagt genau das eine: dieses Modell bekommt ein Bild,
-- wenn niemand ein Modell nennt. Hoechstens eines je Geraet.
--
-- Die Kurzliste bleibt bei vier. `llava-phi3` bleibt darin als kleiner Rueckfall
-- (4 GB statt 10 GB), falls `gemma4:e4b` nicht am Geraet liegt; gelesen wird die
-- Spalte von `services/llm/bildmodell.js`, und der nimmt nur, was installiert ist.
--
-- Rollback (down):
--   DROP INDEX IF EXISTS public.idx_llm_catalog_bildvorgabe;
--   ALTER TABLE public.llm_model_catalog DROP COLUMN IF EXISTS bildvorgabe;

ALTER TABLE public.llm_model_catalog
    ADD COLUMN IF NOT EXISTS bildvorgabe BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_catalog_bildvorgabe
    ON public.llm_model_catalog (bildvorgabe) WHERE bildvorgabe;

UPDATE public.llm_model_catalog SET bildvorgabe = false
 WHERE bildvorgabe AND id <> 'gemma4:e4b';

UPDATE public.llm_model_catalog SET bildvorgabe = true, updated_at = NOW()
 WHERE id = 'gemma4:e4b' AND supports_vision_input AND NOT bildvorgabe;
