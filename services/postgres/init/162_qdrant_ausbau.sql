-- 162_qdrant_ausbau.sql — was von Qdrant in der Datenbank uebrig war
-- (24.08.2026)
--
-- Plan 021 Schritt 8 hatte klassisches Vektor-RAG durch agentisches ersetzt.
-- Qdrant lief seitdem nicht mehr, aber Code und Schema standen weiter, und
-- drei Features fielen still durch, statt zu melden, dass sie nichts tun. Am
-- 24.08.2026 ist der Code ausgebaut worden; diese Migration zieht das Schema
-- nach.
--
-- WAS HIER WEGGEHT UND WARUM ES GEFAHRLOS IST, auf dem Orin gemessen:
--
--   ai_memories                 0 Zeilen ueber die gesamte Laufzeit des
--                               Geraets, keine Fremdschluessel darauf. Die
--                               Tabelle hielt Verweise auf Qdrant-Punkte
--                               (qdrant_point_id); ohne Qdrant wurde nie eine
--                               Zeile geschrieben. Der Dienst dahinter
--                               (memoryService) meldete den Ausfall nicht.
--
--   system_settings.rag_*       13 Regler fuer Abruf, Rerank und
--                               Wissensraum-Routing der Vektorsuche. Nach dem
--                               Ausbau liest sie kein Code mehr:
--                               SETTINGS_COLUMNS fuehrt nur noch die vier
--                               llm_-Spalten, und UpdateRagSettingsBody
--                               nimmt nur noch diese an.
--
-- WAS BLEIBT, obwohl der Name das Gegenteil nahelegt:
--
--   knowledge_spaces.description_embedding   Das Wissensraum-Routing rechnet
--       die Aehnlichkeit in JavaScript ueber diese Spalte (routes/ai/spaces.js,
--       POST /api/spaces/route). Es hat Qdrant nie gebraucht, nur den
--       embedding-service, und der laeuft weiter.
--
--   document_chunks / document_parent_chunks   Der Textlayer. Am 24.08.2026
--       37 638 Chunks aus 1217 Dokumenten. Er ist der Grund, warum der
--       Ausbau kein Feature kostet: der agentische Pfad liest hier.
--
--   system_settings.llm_*       Steuern die Generierung, nicht die Suche.
--       Die Einstellungsseite zeigt sie.
--
-- Rueckwaerts: nicht vorgesehen. Wer klassisches Vektor-RAG zurueckholen will,
-- baut es neu auf und legt das Schema dabei passend an. Ein DROP mit IF EXISTS
-- laeuft auf einem Geraet, das die Spalten schon nicht mehr hat, ohne Fehler
-- durch.

BEGIN;

-- Das KI-Gedaechtnis. CASCADE ist hier bewusst NICHT gesetzt: gaebe es wider
-- Erwarten doch eine abhaengige Tabelle, soll die Migration abbrechen und
-- nicht stillschweigend fremde Daten mitnehmen.
DROP TABLE IF EXISTS ai_memories;

ALTER TABLE system_settings
  DROP COLUMN IF EXISTS rag_top_k,
  DROP COLUMN IF EXISTS rag_final_k,
  DROP COLUMN IF EXISTS rag_score_threshold,
  DROP COLUMN IF EXISTS rag_relevance_threshold,
  DROP COLUMN IF EXISTS rag_rerank_enabled,
  DROP COLUMN IF EXISTS rag_timeout_rerank_ms,
  DROP COLUMN IF EXISTS rag_temperature,
  DROP COLUMN IF EXISTS rag_num_predict,
  DROP COLUMN IF EXISTS rag_mmr_lambda,
  DROP COLUMN IF EXISTS rag_dedup_max_per_doc,
  DROP COLUMN IF EXISTS rag_hybrid_search,
  DROP COLUMN IF EXISTS rag_space_routing_threshold,
  DROP COLUMN IF EXISTS rag_space_routing_max_spaces;

-- Vermerk fuer Dokumente, deren Vektoren beim Loeschen nicht wegkamen. Auf dem
-- Orin gab es die Spalte gar nicht — der Code fing das mit Fehlercode 42703 ab.
ALTER TABLE documents
  DROP COLUMN IF EXISTS qdrant_cleanup_pending;

COMMIT;
