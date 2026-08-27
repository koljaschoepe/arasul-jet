-- 175_kurzliste_c8.sql — Phase C8: der Katalog ist die Kurzliste
--
-- WARUM
--
-- Der Katalog trug siebzehn Eintraege. Vier davon werden benutzt; die anderen
-- dreizehn sind Modelle, die ein Kunde laden kann, die niemand auf diesem
-- Geraet gemessen hat und deren Fehlschlag Arasul erklaeren muesste. Zwei
-- Beispiele aus dem Bestand: `llama3.1:70b-q4` braucht 50 GB und passt in kein
-- ausgeliefertes Geraet, `tesseract:latest`/`paddleocr:latest` sind gar keine
-- Ollama-Modelle und wurden von `/download` und `/load` seit langem einzeln
-- abgewiesen.
--
-- Entscheidung Kolja 27.08.2026, festgelegt an `ollama list` am Orin. Vier
-- Modelle bleiben:
--
--   hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS   Standard, laeuft heute in den Flows
--   gemma4:e4b                              das kleine schnelle
--   nomic-embed-text                        Einbettungen (/v1/embeddings)
--   llava-phi3                              Bilder und eingescannter Text
--
-- Die Liste steht ausserhalb dieser Datei in `config/modelle/kurzliste.json`;
-- `scripts/test/kurzliste.py` haelt beide aneinander.
--
-- `is_task_default` steht in den VALUES bewusst auf false und wird erst in
-- Schritt 4 gesetzt: `idx_llm_catalog_task_default` (Migration 151) laesst nur
-- EINEN Standard je Aufgabe zu, und solange `minicpm-v:8b` und `gemma4:26b-q4`
-- noch dastehen, waere das Einfuegen mit true ein Indexfehler.
--
-- DIE KENNUNG IST DER OLLAMA-NAME. Das ist die Lehre aus Migration 141: Store,
-- Picker und Abgleich verbinden Katalog und Installiertes ueber `c.id = i.id`.
-- Steht dort eine Slug-Kennung (`gemma4:e4b-q4`), legt ein Direkt-Pull daneben
-- eine zweite Zeile mit dem rohen Namen an, und angezeigt wird die falsche.
-- Alle vier Kennungen sind deshalb genau der Name, unter dem Ollama das Modell
-- kennt.
--
-- WAS AM GERAET LIEGT, BLEIBT LIEGEN. Diese Migration raeumt die Datenbank,
-- nicht die Platte. Die gestrichenen Gewichte entfernt
-- `scripts/util/modelle-aufraeumen.sh` mit Liste und Rueckfrage, von Hand,
-- nach gruener Abnahme -- ein Deploy, der ungefragt 60 GB Modelle loescht,
-- waere die falsche Stelle fuer diese Entscheidung.

-- --- 1. Die vier Eintraege ---------------------------------------------------
-- `size_bytes` und `ram_required_gb` sind die Werte aus der Ablage des
-- Anbieters (fuer Qwen3.8 die aus Migration 141). Steht am Geraet schon eine
-- groessere, gemessene Zahl -- der frueher automatische Import las sie aus
-- `/api/tags` --, gewinnt die: sie stammt von dieser Platte.

INSERT INTO public.llm_model_catalog (
    id, name, description, ollama_name,
    size_bytes, ram_required_gb, category,
    capabilities, recommended_for,
    model_type, task, is_task_default, speed_tier,
    supports_thinking, supports_vision_input,
    jetson_tested, performance_tier, ollama_library_url
) VALUES
    ('hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS', 'Qwen3.8 27B',
     'Das Standardmodell dieses Geräts. Dichtes 27B-Modell mit langem Kontext und Werkzeugaufrufen; die Flows laufen darauf.',
     'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
     16000000000, 22, 'large',
     '["general", "multilingual", "reasoning", "long-context", "agentic"]'::jsonb,
     '["flows", "complex-tasks", "long-documents"]'::jsonb,
     'llm', 'text', false, 'quality',
     true, false,
     true, 3, 'https://huggingface.co/unsloth/Qwen3.8-27B-GGUF'),

    ('gemma4:e4b', 'Gemma 4 Kompakt',
     'Das kleine schnelle Modell. Antwortet in Sekunden statt in Minuten, für kurze Schritte, bei denen Tempo mehr zählt als Tiefe.',
     'gemma4:e4b',
     10066329600, 10, 'medium',
     '["general", "multilingual", "vision", "edge-optimized"]'::jsonb,
     '["quick-tasks", "chat"]'::jsonb,
     'llm', 'text', false, 'fast',
     false, true,
     true, 1, 'https://ollama.com/library/gemma4'),

    ('nomic-embed-text', 'Nomic Embed Text',
     'Rechnet Text in Vektoren um. Die OpenAI-kompatible Schnittstelle /v1/embeddings arbeitet damit.',
     'nomic-embed-text',
     274000000, 2, 'small',
     '["embedding"]'::jsonb,
     '["embeddings"]'::jsonb,
     'embedding', 'embedding', false, 'embed',
     false, false,
     true, 1, 'https://ollama.com/library/nomic-embed-text'),

    ('llava-phi3', 'LLaVA Phi-3',
     'Der Weg für Bilder und eingescannten Text. Liest, was auf einer Aufnahme oder einer gescannten Seite steht.',
     'llava-phi3',
     2900000000, 4, 'small',
     '["vision", "ocr"]'::jsonb,
     '["image-analysis", "scanned-documents"]'::jsonb,
     'vision', 'vision', false, 'vision',
     false, true,
     true, 1, 'https://ollama.com/library/llava-phi3')

ON CONFLICT (id) DO UPDATE SET
    name               = EXCLUDED.name,
    description        = EXCLUDED.description,
    ollama_name        = EXCLUDED.ollama_name,
    -- Unqualifiziert und nicht `public.llm_model_catalog.…`: in einem
    -- ON CONFLICT DO UPDATE spricht man die Zielzeile ueber den Namen der
    -- Tabelle an, den der INSERT als Alias gesetzt hat.
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

-- WOHER `supports_thinking` UND `supports_vision_input` KOMMEN. Beide Spalten
-- werden gelesen, und zwar an verschiedenen Stellen: `llmJobProcessor` schaltet
-- das Denken fuer einen Auftrag der externen Schnittstelle daran ab,
-- `/api/models/:id/capabilities` zeigt sie an. Nicht gesetzt hiesse auf einem
-- frischen Geraet `false` fuer alle vier -- also eine Aussage, und zwar eine
-- falsche.
--
--   Sehen: `gemma4:e4b` ist nach Migration 062 nativ multimodal, `llava-phi3`
--   ist ein reines Bildmodell. Die beiden anderen sind Text.
--
--   Denken: fuer `hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS` steht hier `true`,
--   und das ist keine neue Behauptung, sondern das Angleichen an das, was das
--   Geraet ohnehin tut. Der Flow-Runner entscheidet ueber
--   `agentConfig.kannDenken`, eine Regel ueber den NAMEN: alles aus der
--   qwen3-Familie ausser `coder` und `nothink` denkt. Das Standardmodell faellt
--   darunter und laeuft seit C6 so, mit gruener Flow-Abnahme. Stuende in der
--   Spalte `false`, saehen zwei Stellen dasselbe Modell verschieden.
--   Die drei anderen denken nicht: ein Einbettungsmodell und ein Bildmodell
--   koennen es nicht, und Gemma 4 kann es nach Migration 062 erst ab 26B.

-- --- 2. Der Installationsstand wandert auf die neue Kennung ------------------
-- `gemma4:e4b-q4` hiess die Slug-Zeile, ihr `ollama_name` war `gemma4:e4b`.
-- Wer das Modell geladen hatte, hat seinen Eintrag unter der Slug-Kennung; ohne
-- diesen Schritt stuende das Modell nach der Migration als „nicht installiert"
-- da, bis der naechste Abgleich mit Ollama laeuft.
INSERT INTO public.llm_installed_models (id, status, download_progress, downloaded_at, last_used_at, usage_count)
SELECT 'gemma4:e4b', alt.status, alt.download_progress, alt.downloaded_at, alt.last_used_at, alt.usage_count
  FROM public.llm_installed_models alt
 WHERE alt.id = 'gemma4:e4b-q4'
ON CONFLICT (id) DO NOTHING;

-- --- 3. Der Rest faellt ------------------------------------------------------
-- Erst das Installierte, dann der Katalog: `llm_installed_models` haelt keine
-- Fremdschluessel auf den Katalog, aber `getInstalledModels` verbindet beide,
-- und eine Zeile ohne Katalogeintrag waere von da an unsichtbar und
-- unloeschbar.
DELETE FROM public.llm_installed_models
 WHERE id NOT IN (
    'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS', 'gemma4:e4b', 'nomic-embed-text', 'llava-phi3'
 );

DELETE FROM public.llm_model_catalog
 WHERE id NOT IN (
    'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS', 'gemma4:e4b', 'nomic-embed-text', 'llava-phi3'
 );

-- --- 4. Ein Standard je Aufgabe ---------------------------------------------
-- `idx_llm_catalog_task_default` (Migration 151) laesst hoechstens einen zu.
-- Gesetzt wird deshalb NACH dem Loeschen, sonst stiesse der Eintrag fuer
-- `text` mit `gemma4:26b-q4` zusammen, das gerade noch dasteht.
UPDATE public.llm_model_catalog SET is_task_default = false
 WHERE is_task_default AND id <> 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS'
   AND task = 'text';

UPDATE public.llm_model_catalog SET is_task_default = true, updated_at = NOW()
 WHERE id IN ('hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS', 'nomic-embed-text', 'llava-phi3')
   AND COALESCE(is_task_default, false) = false;

-- --- 5. Das Standardmodell ---------------------------------------------------
-- Hing das Flag an einem gestrichenen Modell, ist es mit Schritt 3 gefallen.
-- Es gehoert auf den Standard der Kurzliste, sobald der installiert ist; ein
-- `is_default` auf einem Modell, das nicht auf der Platte liegt, waere ein
-- Versprechen ohne Deckung.
UPDATE public.llm_installed_models SET is_default = false
 WHERE is_default AND id <> 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS';

UPDATE public.llm_installed_models SET is_default = true
 WHERE id = 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS'
   AND status = 'available'
   AND NOT EXISTS (SELECT 1 FROM public.llm_installed_models d WHERE d.is_default);

-- --- 6. Die Spalte fuer selbst hinzugefuegte Modelle -------------------------
-- Migration 160 legte sie an, damit ein Kunde einen selbst eingetragenen
-- Katalogeintrag wieder loeschen kann. Mit der Kurzliste gibt es diesen Weg
-- nicht mehr: `POST /api/models/katalog`, `POST /api/models/quelle/pruefen`
-- und `DELETE /api/models/katalog/*` fallen in dieser Phase, und der Katalog
-- kommt wieder ausschliesslich aus Migrationen. Eine Spalte, die trennt, was
-- geloescht werden darf, hat dann nichts mehr zu trennen.
DROP INDEX IF EXISTS idx_llm_catalog_selbst_hinzugefuegt;
ALTER TABLE public.llm_model_catalog DROP COLUMN IF EXISTS selbst_hinzugefuegt;
