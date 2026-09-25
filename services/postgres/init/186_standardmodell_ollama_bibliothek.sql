-- 186_standardmodell_ollama_bibliothek.sql — J35: das Standardmodell kommt aus
-- der Ollama-Bibliothek
--
-- Waechter: scripts/test/kurzliste.py liest diese Migration.
--
-- WARUM
--
-- Seit C8 (Migration 175) war der Standard der Kurzliste
-- `hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS`, geladen ueber Ollamas Bruecke zu
-- Hugging Face. Am 25.09.2026 hat die Installation gezeigt, dass diese Kennung
-- keine feste Sache ist: Hugging Face erzeugt das Manifest erst beim Abruf, der
-- config-Blob kam als 404 zurueck, und dieselbe Kennung zeigte auf eine andere
-- Datei (14,25 GB statt 15,7 GB). Ein Geraet, das in fuenf Jahren neu
-- aufgesetzt wird, bekaeme unter demselben Namen etwas anderes -- oder nichts.
--
-- Seither ist der Standard `qwen3.8:27b-q4_K_M` aus der offiziellen
-- Ollama-Bibliothek (https://ollama.com/library/qwen3.8). Dort ist das Manifest
-- eine gespeicherte Datei mit festem Digest
-- (sha256:25b843619e944cd0ae6069f94ff4e5e26a16e109ccbc0a66a0f05979ed70098e,
-- Layer zusammen 17741871917 Bytes); `config/modelle/kurzliste.json` traegt
-- ihn, und die Installation prueft genau diesen Wert nach dem Holen.
--
-- Die Kennung ist wieder der Ollama-Name (Lehre aus Migration 141, siehe 175):
-- Katalog und Installiertes verbinden sich ueber `c.id = i.id`.
--
-- WAS AM GERAET LIEGT, BLEIBT LIEGEN -- wie in 175. Die alten Gewichte unter
-- `hf.co/...` raeumt `scripts/util/modelle-aufraeumen.sh` von Hand weg, nicht
-- diese Migration und nicht der Deploy.

-- --- 1. Der neue Eintrag ------------------------------------------------------
-- Werte wie in 175, mit drei Unterschieden: die Groesse ist die Summe der Layer
-- aus dem Manifest (17741871917 Bytes statt der 16 GB der IQ4_XS-Datei), der
-- RAM-Bedarf steigt entsprechend von 22 auf 24 GB, und die Adresse ist die der
-- Ollama-Bibliothek.
--
-- Der Name ist `Qwen 3.8 27B` mit Leerzeichen: das ist das Muster des Katalogs
-- (Migration 147) und genau das, was `modellAnzeigeName` im Frontend aus der
-- Kennung ableitet. 175 hatte beim Upsert wieder `Qwen3.8 27B` geschrieben;
-- mit der neuen Zeile sagen Katalog und Ableitung dasselbe.
--
-- `supports_vision_input` bleibt false, obwohl das Paket der Bibliothek einen
-- Vision-Projector mitbringt. Die Spalte entscheidet in `llmJobProcessor`, ob
-- ein Bild direkt an das Modell geht oder ueber `llava-phi3` (den Standard der
-- Aufgabe `vision`). Dass Qwen 3.8 auf dem Orin unter Ollama 0.32.12 Bilder
-- liest, hat niemand gemessen; bis dahin bleibt der gemessene Weg der Weg.
--
-- `is_task_default` steht auch hier auf false und wird erst in Schritt 4
-- gesetzt: `idx_llm_catalog_task_default` (Migration 151) laesst nur EINEN
-- Standard je Aufgabe zu, und der alte Eintrag traegt ihn noch.
INSERT INTO public.llm_model_catalog (
    id, name, description, ollama_name,
    size_bytes, ram_required_gb, category,
    capabilities, recommended_for,
    model_type, task, is_task_default, speed_tier,
    supports_thinking, supports_vision_input,
    jetson_tested, performance_tier, ollama_library_url
) VALUES (
    'qwen3.8:27b-q4_K_M', 'Qwen 3.8 27B',
    'Das Standardmodell dieses Geräts. Dichtes 27B-Modell mit langem Kontext und Werkzeugaufrufen; die Flows laufen darauf.',
    'qwen3.8:27b-q4_K_M',
    17741871917, 24, 'large',
    '["general", "multilingual", "reasoning", "long-context", "agentic"]'::jsonb,
    '["flows", "complex-tasks", "long-documents"]'::jsonb,
    'llm', 'text', false, 'quality',
    true, false,
    true, 3, 'https://ollama.com/library/qwen3.8'
)
ON CONFLICT (id) DO UPDATE SET
    name               = EXCLUDED.name,
    description        = EXCLUDED.description,
    ollama_name        = EXCLUDED.ollama_name,
    size_bytes         = GREATEST(EXCLUDED.size_bytes, llm_model_catalog.size_bytes),
    ram_required_gb    = EXCLUDED.ram_required_gb,
    category           = EXCLUDED.category,
    capabilities       = EXCLUDED.capabilities,
    recommended_for    = EXCLUDED.recommended_for,
    model_type         = EXCLUDED.model_type,
    task               = EXCLUDED.task,
    supports_thinking     = EXCLUDED.supports_thinking,
    supports_vision_input = EXCLUDED.supports_vision_input,
    speed_tier         = EXCLUDED.speed_tier,
    jetson_tested      = EXCLUDED.jetson_tested,
    performance_tier   = EXCLUDED.performance_tier,
    ollama_library_url = EXCLUDED.ollama_library_url,
    updated_at         = NOW();

-- --- 2. Gespeicherte Verweise ziehen um --------------------------------------
-- Wo ein Mensch oder ein Paket „das Standardmodell" gemeint und dafuer die alte
-- Kennung hinterlegt hat, zeigte sie nach Schritt 3 ins Leere: der Lauf fragte
-- Ollama nach einem Modell, das es nicht mehr gibt. Es ist dasselbe Modell aus
-- einer anderen Quelle, also wandert der Verweis mit.
--
--   flow_settings.modell      Die Ueberschreibung des Administrators (C6/D4).
--                              Sie ueberlebt jedes App-Update und wuerde sonst
--                              still jeden Lauf des Flows scheitern lassen.
--   app_flows.definition      Die registrierte Kopie des Frontmatters (C6).
--                              Der Stand soll sich nicht aendern, weil jemand
--                              eine Datei anfasst -- hier aendert ihn die
--                              Plattform, weil sie das Modell austauscht, das
--                              sie selbst vorgegeben hat. Bringt das naechste
--                              Paket die alte Kennung wieder mit, ist das ein
--                              Befund an der App, nicht an diesem Geraet.
--   system_settings            `selected_model`, heute ungelesen (179 liess es
--                              stehen); umgezogen, damit keine tote Kennung
--                              darin wartet.
--
-- NICHT umgezogen wird Geschichte: `flow_run_steps.modell`, `llm_jobs`,
-- `llm_model_switches` und die Messwerte sagen, womit ein Lauf WIRKLICH
-- gerechnet hat, und das war die alte Datei.
UPDATE public.flow_settings
   SET modell = 'qwen3.8:27b-q4_K_M', geaendert_am = NOW()
 WHERE modell = 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS';

UPDATE public.app_flows
   SET definition = jsonb_set(definition, '{modell}', '"qwen3.8:27b-q4_K_M"'::jsonb)
 WHERE definition->>'modell' = 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS';

UPDATE public.system_settings
   SET selected_model = 'qwen3.8:27b-q4_K_M'
 WHERE selected_model = 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS';

-- --- 3. Der alte Eintrag faellt ---------------------------------------------
-- Erst das Installierte, dann der Katalog (Begruendung in 175, Schritt 3). Den
-- Installationsstand uebernimmt die neue Zeile NICHT: es sind andere Gewichte,
-- und „installiert" hiesse hier eine Datei, die noch niemand geholt hat. Ob
-- `qwen3.8:27b-q4_K_M` am Geraet liegt, sagt der naechste Abgleich mit Ollama.
DELETE FROM public.llm_installed_models
 WHERE id = 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS';

DELETE FROM public.llm_model_catalog
 WHERE id = 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS';

-- --- 4. Ein Standard je Aufgabe ---------------------------------------------
-- Nach dem Loeschen, sonst stiesse das Flag mit dem alten Eintrag zusammen.
-- Das erste UPDATE raeumt jeden anderen Standard fuer `text` weg (etwa ein von
-- Hand auf `gemma4:e4b` gesetzter), damit das zweite am Index vorbeikommt.
UPDATE public.llm_model_catalog SET is_task_default = false
 WHERE is_task_default AND task = 'text' AND id <> 'qwen3.8:27b-q4_K_M';

UPDATE public.llm_model_catalog SET is_task_default = true, updated_at = NOW()
 WHERE id = 'qwen3.8:27b-q4_K_M'
   AND COALESCE(is_task_default, false) = false;

-- --- 5. Das Standardmodell ---------------------------------------------------
-- Hing `is_default` am alten Eintrag, ist es mit Schritt 3 gefallen. Es geht
-- auf den neuen, sobald der installiert ist und kein anderes Modell das Flag
-- traegt -- dieselbe Regel wie 175, Schritt 5. Liegt das Modell noch nicht am
-- Geraet, bleibt das Flag leer; sobald der Abgleich mit Ollama es als
-- installiert fuehrt, findet `getDefaultModel()` es ueber `is_task_default`
-- fuer `text` (D6) -- auch ohne Flag.
UPDATE public.llm_installed_models SET is_default = true
 WHERE id = 'qwen3.8:27b-q4_K_M'
   AND status = 'available'
   AND NOT EXISTS (SELECT 1 FROM public.llm_installed_models d WHERE d.is_default);
