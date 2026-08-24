"""
Document processing module for Document Indexer.

Handles document parsing, hashing, metadata extraction,
AI analysis, and the shared indexing pipeline used by both
process_new_document() and _index_existing_document().
"""

import hashlib
import logging
import os
import shutil
import uuid
from collections import OrderedDict
from io import BytesIO
from typing import Dict, List, Optional, Any

from document_parsers import (
    parse_pdf, parse_pdf_streaming, parse_docx, parse_txt, parse_markdown,
    parse_yaml_table, parse_image, parse_html
)
from metadata_extractor import extract_metadata, extract_key_topics
from text_chunker import chunk_text_hierarchical, MIN_CHILD_WORDS
from spell_corrector import update_domain_dictionary
from entity_extractor import extract_from_document

from config import (
    PARENT_CHUNK_SIZE, CHILD_CHUNK_SIZE, CHILD_CHUNK_OVERLAP,
    ENABLE_AI_ANALYSIS, CHUNK_CONTEXT_MODE
)

logger = logging.getLogger(__name__)


STREAMING_PDF_THRESHOLD = 50  # Use streaming parser for PDFs with more than 50 pages


def parse_pdf_smart(file_obj):
    """Use streaming parser for large PDFs (>50 pages) to reduce memory usage."""
    import fitz
    file_obj.seek(0)
    pdf_bytes = file_obj.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)
    doc.close()

    file_obj.seek(0)
    if page_count > STREAMING_PDF_THRESHOLD:
        logger.info(f"Large PDF ({page_count} pages), using streaming parser")
        return "\n\n".join(parse_pdf_streaming(file_obj))
    return parse_pdf(file_obj)


# File parsers registry
PARSERS = {
    '.pdf': parse_pdf_smart,
    '.txt': parse_txt,
    '.md': parse_markdown,
    '.markdown': parse_markdown,
    '.docx': parse_docx,
    '.yaml': parse_yaml_table,
    '.yml': parse_yaml_table,
    # Markup → plain text
    '.html': parse_html,
    '.htm': parse_html,
    '.xml': parse_html,
    # Plain-text data formats
    '.csv': parse_txt,
    '.json': parse_txt,
    '.log': parse_txt,
    # Image formats (OCR)
    '.png': parse_image,
    '.jpg': parse_image,
    '.jpeg': parse_image,
    '.tiff': parse_image,
    '.tif': parse_image,
    '.bmp': parse_image,
    '.webp': parse_image,
}

# Supported MIME types mapping
SUPPORTED_MIMES = {
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/yaml': '.yaml',
    'application/x-yaml': '.yaml',
    'text/html': '.html',
    'application/xml': '.xml',
    'text/xml': '.xml',
    'text/csv': '.csv',
    'application/json': '.json',
    # Image formats (OCR)
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/tiff': '.tiff',
    'image/bmp': '.bmp',
    'image/webp': '.webp',
}


def calculate_content_hash(data: bytes) -> str:
    """Calculate SHA256 hash of file content."""
    return hashlib.sha256(data).hexdigest()


def calculate_file_hash(filename: str, size: int) -> str:
    """Calculate quick hash from filename and size."""
    return hashlib.sha256(f"{filename}:{size}".encode()).hexdigest()


def get_mime_type(filename: str) -> str:
    """Get MIME type from filename."""
    ext = os.path.splitext(filename.lower())[1]
    mime_map = {
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.markdown': 'text/markdown',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.yaml': 'text/yaml',
        '.yml': 'text/yaml',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.xml': 'application/xml',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.log': 'text/plain',
        # Bilder (OCR) — konsistent mit PARSERS/SUPPORTED_MIMES.
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
    }
    return mime_map.get(ext, 'application/octet-stream')


def strip_nul(text: str) -> str:
    """
    Entfernt NUL-Bytes (0x00) aus extrahiertem Text.

    Postgres-`text` darf alles ausser 0x00 enthalten. Manche PDFs liefern beim
    Extrahieren NUL-Bytes mit (fehlerhafte Font-/Encoding-Tabellen), und der
    erste Schreibversuch scheiterte dann mit „A string literal cannot contain
    NUL (0x00) characters" — das Dokument landete auf 'failed', obwohl der Text
    bis auf ein paar unsichtbare Bytes brauchbar war. Hier ist die einzige
    Stelle, an der ALLE Parser zusammenlaufen; wird hier bereinigt, sind auch
    Chunks, Metadaten, Graph und Spell-Corrector sauber.
    """
    if not text:
        return text
    if '\x00' not in text:
        return text
    bereinigt = text.replace('\x00', '')
    logger.warning(
        f"{len(text) - len(bereinigt)} NUL-Byte(s) aus extrahiertem Text entfernt"
    )
    return bereinigt


def parse_document(data: bytes, filename: str) -> Optional[str]:
    """
    Parse document and extract text.

    Rueckgabe-Vertrag (der Aufrufer unterscheidet die beiden Faelle!):
      None  -> nicht parsebar (unbekannter Typ oder Parser-Fehler)  -> 'failed'
      ''    -> sauber geparst, aber ohne Textinhalt                 -> 'stored'
    """
    _, ext = os.path.splitext(filename.lower())

    if ext not in PARSERS:
        logger.warning(f"Unsupported file type: {ext}")
        return None

    try:
        parser = PARSERS[ext]
        text = strip_nul(parser(BytesIO(data)))
        logger.debug(f"Parsed {filename}: {len(text)} characters")
        return text
    except Exception as e:
        logger.error(f"Parse error for {filename}: {e}")
        return None


def get_document_space_info(db, doc_id: str) -> Dict[str, str]:
    """
    Get Knowledge Space info for a document (RAG 2.0).

    Args:
        db: DatabaseManager instance
        doc_id: Document UUID

    Returns:
        Dict with space_id, space_name, space_slug
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT d.space_id, ks.name as space_name,
                           ks.slug as space_slug
                    FROM documents d
                    LEFT JOIN knowledge_spaces ks ON d.space_id = ks.id
                    WHERE d.id = %s
                """, (doc_id,))
                row = cur.fetchone()
                if row and row[0]:
                    return {
                        'space_id': str(row[0]),
                        'space_name': row[1] or '',
                        'space_slug': row[2] or ''
                    }
    except Exception as e:
        logger.debug(f"Failed to get space info for {doc_id}: {e}")
    return {'space_id': None, 'space_name': '', 'space_slug': ''}


def _template_context(
    chunk_text: str,
    document_title: str,
    parent_text: str,
    chunk_index: int,
    total_chunks: int,
    section_header: str = ''
) -> str:
    """
    Template-based contextualization (fast, no LLM needed).

    Adds document title, position, and section info as a header.
    """
    if total_chunks > 0:
        position = chunk_index / total_chunks
    else:
        position = 0
    pos_label = "Anfang" if position < 0.2 else "Ende" if position > 0.8 else "Mitte"

    context = f"[Dokument: {document_title}, Position: {pos_label}]"
    if section_header:
        context += f" [Abschnitt: {section_header}]"
    elif parent_text:
        parent_preview = parent_text[:150].strip().replace('\n', ' ')
        context += f" [Abschnitt: {parent_preview}...]"
    return f"{context}\n{chunk_text}"


# LLM context cache to avoid re-generating for re-indexed documents.
# Bounded LRU so a long-lived indexer doesn't grow this map unboundedly:
# 100k+ chunks across 1k+ docs would otherwise sit in process memory forever.
_LLM_CONTEXT_CACHE_MAX = int(os.getenv('INDEXER_LLM_CONTEXT_CACHE_MAX', '1000'))


class _LRUDict(OrderedDict):
    """Smallest viable LRU on top of OrderedDict — no extra dependency."""

    def __init__(self, maxsize: int):
        super().__init__()
        self._maxsize = maxsize

    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value

    def __setitem__(self, key, value):
        if key in self:
            self.move_to_end(key)
        super().__setitem__(key, value)
        while len(self) > self._maxsize:
            self.popitem(last=False)


_llm_context_cache: '_LRUDict' = _LRUDict(_LLM_CONTEXT_CACHE_MAX)


def _llm_context(
    chunk_text: str,
    document_title: str,
    parent_text: str,
    chunk_index: int,
    total_chunks: int,
    section_header: str = ''
) -> str:
    """
    LLM-based contextualization (Anthropic Contextual Retrieval approach).

    Generates a concise description of the chunk's content and position
    within the document. Adds ~35% retrieval improvement.
    Falls back to template if LLM is unavailable.
    """
    import requests

    # Cache key: content-based to survive re-indexing
    cache_key = f"{document_title}:{chunk_index}:{hash(chunk_text[:100])}"
    if cache_key in _llm_context_cache:
        return f"{_llm_context_cache[cache_key]}\n\n{chunk_text}"

    # Build prompt with parent context for better understanding
    parent_preview = parent_text[:300].strip() if parent_text else ""
    section_info = f' im Abschnitt "{section_header}"' if section_header else ""

    prompt = (
        f'Hier ist ein Ausschnitt aus dem Dokument "{document_title}"{section_info}.\n\n'
        f'Kontext des uebergeordneten Abschnitts:\n{parent_preview}\n\n'
        f'Ausschnitt:\n{chunk_text[:500]}\n\n'
        f'Schreibe einen einzelnen kurzen Satz (max. 25 Woerter), der beschreibt, '
        f'worum es in diesem Ausschnitt geht und welche Schluesselbegriffe er enthaelt. '
        f'Antworte NUR mit dem Kontextsatz, ohne Erklaerung.'
    )

    llm_host = os.getenv('LLM_SERVICE_HOST', 'llm-service')
    llm_port = os.getenv('LLM_SERVICE_PORT', '11434')
    llm_model = os.getenv('LLM_MODEL', 'qwen3:14b-q8')

    try:
        response = requests.post(
            f"http://{llm_host}:{llm_port}/api/chat",
            json={
                "model": llm_model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {
                    "num_predict": 80,
                    "temperature": 0.1,
                }
            },
            timeout=30
        )
        response.raise_for_status()
        context_sentence = response.json().get('message', {}).get('content', '').strip()

        # Strip thinking tags if qwen3 returns them
        if '<think>' in context_sentence:
            import re
            context_sentence = re.sub(r'<think>.*?</think>\s*', '', context_sentence, flags=re.DOTALL).strip()

        if context_sentence and len(context_sentence) > 10:
            # Prefix with document title for extra retrieval signal
            full_context = f"[Dokument: {document_title}] {context_sentence}"
            _llm_context_cache[cache_key] = full_context
            return f"{full_context}\n\n{chunk_text}"

    except Exception as e:
        logger.warning(f"LLM contextualization failed for chunk {chunk_index}: {e}")

    # Fallback to template
    return _template_context(
        chunk_text, document_title, parent_text,
        chunk_index, total_chunks, section_header
    )


def contextualize_chunk(
    chunk_text: str,
    document_title: str,
    parent_text: str,
    chunk_index: int,
    total_chunks: int,
    section_header: str = ''
) -> str:
    """
    Add document context to a chunk before embedding (Contextual Retrieval).

    The context header helps the embedding model understand the chunk's
    position and topic within the document. The original chunk_text is
    stored unchanged in the Qdrant payload for display.

    Mode is controlled by CHUNK_CONTEXT_MODE config:
    - 'llm':       LLM-generated context (~35% retrieval improvement,
                   ~3-5s/chunk, blocks Ollama on the chat hot path)
    - 'heuristic': Template-based headers (default, fast, no LLM cost)
    - 'template':  Legacy alias for 'heuristic'
    Any non-'llm' value falls through to the template path.
    """
    if CHUNK_CONTEXT_MODE == 'llm':
        return _llm_context(
            chunk_text, document_title, parent_text,
            chunk_index, total_chunks, section_header
        )
    return _template_context(
        chunk_text, document_title, parent_text,
        chunk_index, total_chunks, section_header
    )


def is_unchanged_and_complete(db, doc_id: str, content_hash: str) -> bool:
    """
    Content-Hash-Gate (Plan 012 Phase F Schritt 17).

    True, wenn genau dieser Inhalt bereits VOLLSTAENDIG indexiert ist — dann
    kostet ein erneuter Lauf nur GPU-Zeit ohne Nutzen.

    Bewusst streng: nur Status 'indexed' zaehlt. Ein 'partial' Dokument ist
    unvollstaendig und muss neu indexiert werden, auch wenn sich der Inhalt
    nicht geaendert hat. Bei fehlendem Dokument/Hash gilt "nicht uebersprungen"
    (fail-open Richtung Arbeit, nie Richtung stiller Auslassung).
    """
    if not content_hash:
        return False
    try:
        doc = db.get_document(doc_id)
    except Exception as e:
        logger.warning(f"Hash-Gate konnte {doc_id} nicht laden: {e}")
        return False
    if not doc:
        return False
    return (
        doc.get('status') == 'indexed'
        and doc.get('content_hash') == content_hash
        and (doc.get('chunk_count') or 0) > 0
    )


def run_indexing_pipeline(
    doc_id: str,
    data: bytes,
    filename: str,
    content_hash: str,
    db,
    analyzer,
    graph_store,
    skip_if_unchanged: bool = False,
    anreichern: bool = True
) -> Optional[int]:
    """
    Shared indexing pipeline for both new and existing documents.

    Performs: parse -> AI analysis -> chunk -> Textlayer -> post-process.

    Args:
        doc_id: Document UUID
        data: Raw file bytes
        filename: Filename
        content_hash: Content hash string
        db: DatabaseManager instance
        analyzer: DocumentAnalyzer instance
        graph_store: GraphStore instance or None
        skip_if_unchanged: Wenn True, wird ein bereits vollstaendig indexiertes
            Dokument mit identischem content_hash uebersprungen (Hash-Gate,
            Plan 012 Phase F Schritt 17). Default False, damit ein
            ausdruecklich angestossener /reindex IMMER neu baut — sonst waere
            der Knopf wirkungslos, was niemand erwartet.
        anreichern: Wenn False, wird die KI-Anreicherung (Zusammenfassung,
            Themen, Kategorie) NICHT hier ausgefuehrt. Das Dokument ist danach
            vollstaendig indexiert und durchsuchbar, nur ohne Zusammenfassung.
            Der Scan-Zyklus setzt das auf False und holt die Anreicherung
            nach, sobald keine neuen Dokumente mehr warten (Plan 023 G4).

    Returns:
        Number of chunks indexed, or None on failure
    """
    # Hash-Gate: identischer Inhalt + bereits vollstaendig indexiert -> nichts tun.
    if skip_if_unchanged and is_unchanged_and_complete(db, doc_id, content_hash):
        existing = db.get_document(doc_id) or {}
        chunk_count = existing.get('chunk_count') or 0
        logger.info(
            f"Ueberspringe {filename}: Inhalt unveraendert und vollstaendig "
            f"indexiert ({chunk_count} Chunks)"
        )
        return chunk_count

    # Pre-flight: check available disk space (need ~10x file size for chunks + embeddings)
    MIN_FREE_MB = 500
    try:
        free_mb = shutil.disk_usage('/').free // (1024 * 1024)
        if free_mb < MIN_FREE_MB:
            msg = f'Low disk space ({free_mb}MB free, need {MIN_FREE_MB}MB minimum)'
            logger.error(f"Skipping indexing for {filename}: {msg}")
            db.update_document_status(doc_id, 'failed', msg)
            return None
    except OSError:
        pass  # Non-critical — proceed if disk check fails

    # Plan 009: nicht-indexierbare Dateitypen (z. B. Office, ZIP, Binär, Bilder)
    # NICHT als 'failed' markieren. Der Upload nimmt beliebige Typen an; solche
    # Dateien werden gespeichert + herunterladbar, aber bewusst nicht indexiert.
    # Status 'stored' → der Explorer zeigt ein neutrales Icon statt roter Fehler.
    # Rückgabe 0 (nicht None): der Aufrufer wertet das als erfolgreich behandelt,
    # ohne Retry (siehe enhanced_indexer: chunk_count == 0 → doc_id).
    file_ext = os.path.splitext(filename.lower())[1]
    if file_ext not in PARSERS:
        logger.info(
            f"{filename}: nicht-indexierbarer Typ '{file_ext}' — gespeichert, nicht indexiert"
        )
        db.update_document_status(doc_id, 'stored')
        return 0

    # Parse document
    text = parse_document(data, filename)
    if text is None:
        db.update_document_status(doc_id, 'failed', 'Failed to parse document')
        return None
    if not text.strip():
        # Sauber geparst, nur ohne Text: ein Logo-PNG ohne Schrift, ein
        # Whiteboard-Foto, das die OCR nicht lesen kann, eine 0-Byte-Datei.
        # Das ist KEIN Fehler — vorher landeten genau diese Dateien auf
        # 'failed' (inkl. drei sinnloser Wiederholungen) und standen danach
        # dauerhaft als roter Fehler im Explorer. Gleiche Behandlung wie ein
        # nicht-indexierbarer Typ: gespeichert, herunterladbar, nicht indexiert.
        logger.info(
            f"{filename}: kein extrahierbarer Text — gespeichert, nicht indexiert"
        )
        db.update_document_status(doc_id, 'stored')
        return 0

    # Extract metadata
    file_ext = os.path.splitext(filename.lower())[1]
    metadata = extract_metadata(data, filename, file_ext)

    # Phase 5.3: persist extracted metadata so re-indexed documents (created via
    # dashboard upload without metadata) also get word_count/char_count/etc.
    # Idempotent for new documents — values match what process_new_document inserted.
    metadata_updates = {}
    for field in ('word_count', 'char_count', 'page_count', 'language', 'author'):
        value = metadata.get(field)
        if value is not None:
            metadata_updates[field] = value
    if metadata.get('title'):
        metadata_updates['title'] = metadata['title']
    if metadata_updates:
        try:
            db.update_document(doc_id, metadata_updates)
        except Exception as meta_err:
            logger.warning(
                f"Failed to persist metadata for {doc_id}: {meta_err}"
            )

    # RAG 2.0: Get space info for document
    space_info = get_document_space_info(db, doc_id)

    # Index into Qdrant (chunking + embedding + upsert)
    #
    # Plan 023 G4: ERST indexieren, DANN anreichern.
    #
    # Bis zum 22.08.2026 lief die KI-Analyse (Zusammenfassung, Kategorie,
    # Themen) davor, und jede davon ist ein Aufruf ans Sprachmodell. Am Geraet
    # gemessen, an einer Datei mit wenigen Zeilen:
    #
    #   15:26:03  Generating summary
    #   15:26:37  Categorizing          (34 s spaeter)
    #   15:26:56  Extracting topics     (weitere 19 s)
    #
    # Das Dokument wurde erst NACH alldem auf `indexed` gesetzt, war also
    # ueber eine Minute lang nicht auffindbar, obwohl der Textlayer in rund
    # einer Sekunde fertig gewesen waere. Die Anreicherung ist Beiwerk; die
    # Auffindbarkeit ist die Zusage.
    #
    # `category_name` steht deshalb auf 'Allgemein' wie im Fall ohne Analyse.
    # Der Wert landet ausschliesslich in der Qdrant-Nutzlast; die echte
    # Kategorie steht an der Dokumentzeile und wird unten nachgetragen, und von
    # dort liest sie auch das Backend.
    index_stats = {}
    chunk_count = schreibe_textlayer(
        doc_id=doc_id,
        text=text,
        metadata={
            'filename': filename,
            'content_hash': content_hash,
            'title': metadata.get('title', filename),
            'language': metadata.get('language', 'de'),
            'category_name': 'Allgemein',
            **space_info
        },
        db=db,
        stats=index_stats
    )

    # Mark as indexed (only if chunks were actually created).
    # P6-17: if some child chunks failed to embed (skipped_chunks > 0) but at
    # least one succeeded, mark 'partial' — the document is searchable but its
    # knowledge base is incomplete and should be re-indexed. Previously this was
    # silently reported as fully 'indexed'.
    if chunk_count and chunk_count > 0:
        # Frueher gab es hier 'partial': einzelne Chunks konnten am Einbetten
        # scheitern, waehrend andere durchkamen. Ohne Vektorzweig (24.08.2026)
        # gibt es diesen Fall nicht mehr — geschrieben wird der Textlayer, und
        # der geht ganz oder gar nicht.
        db.update_document_status(doc_id, 'indexed', chunk_count=chunk_count)
    else:
        db.update_document_status(
            doc_id, 'failed',
            'No chunks created \u2014 document may be empty or unparseable'
        )
        logger.warning(
            f"Document {filename} produced 0 chunks, marked as failed"
        )
        return 0

    logger.info(
        f"Successfully indexed document: {filename} ({chunk_count} chunks) "
        f"[space: {space_info.get('space_name', 'none')}]"
    )

    # Plan 023 G4: das Billige sofort, das Teure spaeter.
    #
    # Ohne KI-Analyse sind die Themen ein Regex-Lauf ueber den Text, also
    # Millisekunden. Der bleibt hier. Mit KI-Analyse sind es drei
    # Modellaufrufe, am 22.08.2026 auf dem Orin rund fuenfzig Sekunden je
    # Dokument, und die gehoeren nicht in die Warteschlange (siehe
    # `anreichern`).
    if not ENABLE_AI_ANALYSIS:
        try:
            simple_topics = extract_key_topics(text, max_topics=10)
            if simple_topics:
                db.update_document(doc_id, {'key_topics': simple_topics})
        except Exception as themen_err:
            logger.warning(
                f"Themen fuer {filename} uebersprungen: {themen_err}"
            )
    elif anreichern:
        reichere_an(doc_id, text, filename, metadata.get('title'), db, analyzer)

    # Knowledge Graph: extract entities and relations
    if graph_store:
        try:
            doc_title = metadata.get('title') or filename
            extraction = extract_from_document(text, str(doc_id), doc_title)
            if extraction:
                graph_store.store_document_graph(str(doc_id), extraction)
                entity_count = len(extraction.get('entities', []))
                relation_count = len(extraction.get('relations', []))
                logger.info(
                    f"Graph: {entity_count} entities, "
                    f"{relation_count} relations for {filename}"
                )
        except Exception as e:
            logger.warning(
                f"Knowledge graph extraction failed for {filename}: {e}"
            )

    return chunk_count


def chunk_id_fuer(doc_id: str, chunk_global_index: int) -> str:
    """Deterministische UUID fuer einen Kind-Chunk.

    Stand bis zum 24.08.2026 in `qdrant_manager.py`. Sie gehoerte nie dorthin:
    die ID ist der Primaerschluessel der Zeile in `document_chunks`, also des
    Textlayers, und wurde von Qdrant nur mitbenutzt. Beim Ausbau von Qdrant ist
    sie deshalb hierher gewandert — unveraendert, damit bestehende Zeilen
    weiter getroffen werden.
    """
    return str(uuid.UUID(
        hashlib.md5(f"{doc_id}:{chunk_global_index}".encode()).hexdigest()
    ))


def schreibe_textlayer(
    doc_id: str,
    text: str,
    metadata: Dict[str, Any],
    db,
    stats: Optional[Dict[str, int]] = None
) -> int:
    """
    Den Text eines Dokuments zerlegen und als Textlayer nach PostgreSQL
    schreiben.

    Hiess bis zum 24.08.2026 `_index_to_qdrant` und tat zweierlei: sie schrieb
    den Textlayer nach Postgres UND Vektoren nach Qdrant. Der Qdrant-Zweig lag
    seit Plan 021 Schritt 8 hinter einem Schalter, der auf dem Geraet auf
    `false` stand — er lief also seit Monaten nicht mehr. Mit dem Ausbau von
    Qdrant am 24.08.2026 ist er ersatzlos entfallen.

    Geblieben ist das Muster des Parent-Document-Retrievers, weil der
    agentische Pfad es nutzt: grosse Eltern-Chunks fuer den Zusammenhang,
    kleine Kind-Chunks fuer die genaue Fundstelle. Beide liegen in Postgres.

    Args:
        doc_id: Dokument-UUID
        text: der vollstaendige Text
        metadata: Metadaten des Dokuments
        db: DatabaseManager
        stats: optionales Ausgabe-Dict; wird mit 'skipped_chunks' (immer 0) und
            'total_children' gefuellt, damit der Aufrufer den Status setzen
            kann.

    Returns:
        Zahl der geschriebenen Kind-Chunks
    """
    db.update_document_status(doc_id, 'processing')

    try:
        parent_chunks = chunk_text_hierarchical(
            text, PARENT_CHUNK_SIZE, CHILD_CHUNK_SIZE, CHILD_CHUNK_OVERLAP
        )
        if not parent_chunks:
            logger.warning(f"No chunks generated for document {doc_id}")
            return 0

        # Winzige Kind-Chunks aussortieren — Ueberschriften, Seitenzahlen. Erst
        # rechnen, dann anwenden, damit ein kurzes Dokument nicht komplett
        # wegfiltert.
        kept_by_parent = [
            [c for c in parent.children if c.word_count >= MIN_CHILD_WORDS]
            for parent in parent_chunks
        ]
        if any(kept_by_parent):
            new_parents = []
            for parent, kept in zip(parent_chunks, kept_by_parent):
                if kept:
                    parent.children = kept
                    new_parents.append(parent)
            parent_chunks = new_parents
        else:
            # Alles unter der Schwelle heisst: das Dokument ist kurz, nicht
            # rauschig. Eine kurze Notiz wurde sonst faelschlich als
            # „Index fehlgeschlagen" gefuehrt.
            logger.info(
                f"Document {doc_id}: all chunks below {MIN_CHILD_WORDS} words — "
                f"short document, indexing as-is"
            )

        global_idx = 0
        for parent in parent_chunks:
            for child in parent.children:
                child.global_index = global_idx
                global_idx += 1

        total_children = sum(len(p.children) for p in parent_chunks)
        doc_title = metadata.get('title', metadata.get('filename', ''))
        logger.info(
            f"Document {doc_id}: {len(parent_chunks)} parent chunks, "
            f"{total_children} child chunks to index"
        )

        # Eltern-Chunks nach PostgreSQL, mit ihren DB-IDs zurueck
        parent_id_map = db.save_parent_chunks(doc_id, parent_chunks)

        chunk_records = []
        domain_texts = []

        for parent in parent_chunks:
            parent_db_id = parent_id_map.get(parent.parent_index)

            for child in parent.children:
                # Der Zusammenhang wird weiterhin gebildet: er steht im
                # Protokoll und dient der Nachvollziehbarkeit der Zerlegung.
                # Gespeichert wird der Originaltext, wie zuvor auch.
                contextualize_chunk(
                    child.text, doc_title, parent.text,
                    child.global_index, total_children,
                    section_header=getattr(child, 'section_header', '')
                )
                chunk_records.append({
                    'id': chunk_id_fuer(doc_id, child.global_index),
                    'chunk_index': child.global_index,
                    'child_index': child.child_index,
                    'parent_chunk_id': parent_db_id,
                    'text': child.text,
                    'char_start': child.char_start,
                    'char_end': child.char_end,
                    'word_count': child.word_count,
                })
                domain_texts.append(child.text)

            if parent.children:
                logger.info(
                    f"Contextualized {len(parent.children)} chunks for "
                    f"parent {parent.parent_index + 1}/{len(parent_chunks)} "
                    f"(mode={CHUNK_CONTEXT_MODE})"
                )

        # Ohne Vektorzweig kann kein Chunk mehr am Einbetten scheitern. Der
        # Schluessel bleibt im Dict, weil der Aufrufer ihn liest.
        if stats is not None:
            stats['skipped_chunks'] = 0
            stats['total_children'] = total_children

        # Kind-Chunks nach PostgreSQL — das ist der Textlayer, aus dem der
        # agentische Pfad liest.
        db.save_chunks(doc_id, chunk_records)
        logger.info(
            f"Textlayer: {len(chunk_records)} Chunks fuer Dokument {doc_id} "
            f"geschrieben"
        )

        if domain_texts:
            try:
                update_domain_dictionary(domain_texts)
            except Exception as e:
                logger.warning(
                    f"Domain dictionary update failed (non-critical): {e}"
                )

        return len(chunk_records)

    except Exception as e:
        logger.error(
            f"Indexing error for {doc_id}: {e}", exc_info=True
        )
        # Die schon geschriebenen parent_chunks-Zeilen zuruecknehmen. Ohne das
        # waechst bei wiederholten Versuchen ein Friedhof verwaister Zeilen,
        # waehrend das Dokument nie fertig wird.
        try:
            removed = db.delete_parent_chunks(doc_id)
            if removed:
                logger.info(f"Rolled back {removed} parent_chunk row(s) for {doc_id}")
        except Exception as cleanup_err:
            logger.warning(
                f"Failed to rollback parent_chunks for {doc_id}: {cleanup_err}"
            )
        raise


def reichere_an(doc_id, text, filename, titel, db, analyzer, abbruch=None) -> bool:
    """
    Zusammenfassung, Themen und Kategorie nachtragen (Plan 023 G4).

    Beiwerk, kein Muss: der Text ist zu diesem Zeitpunkt bereits indexiert und
    durchsuchbar. Ein Fehler hier darf das Dokument nicht kippen, deshalb faengt
    die Funktion selbst und meldet nur, ob es geklappt hat.

    Getrennt vom Indexieren, weil die drei Modellaufrufe am 22.08.2026 auf dem
    Orin rund fuenfzig Sekunden brauchten. Steckten sie in der Warteschlange,
    wartete eine gerade geschriebene Datei hinter jedem Vorgaenger: bei
    einundsiebzig offenen Dokumenten ueber eine Stunde, gemessen.

    Args:
        doc_id: Dokument-UUID
        text: der bereits extrahierte Text
        filename: Dateiname, nur fuer die Protokollzeile
        titel: Titel aus den Metadaten oder None
        db: DatabaseManager
        analyzer: DocumentAnalyzer
        abbruch: Aufruf ohne Argumente, der True liefert, sobald etwas
            Wichtigeres wartet. Wird zwischen den drei Modellaufrufen geprueft.

    Returns:
        True, wenn etwas geschrieben wurde. Auch ein unterbrochener Lauf kann
        True liefern: die Zusammenfassung allein ist besser als nichts.
    """
    try:
        logger.info(f"Running AI analysis for {filename}")
        analysis = analyzer.analyze_document(
            text=text,
            filename=filename,
            title=titel,
            categories=db.get_categories(),
            abbruch=abbruch
        )
        updates = {}
        if analysis.get('summary'):
            updates['summary'] = analysis['summary']
        if analysis.get('key_topics'):
            updates['key_topics'] = analysis['key_topics']
        if analysis.get('category'):
            cat = db.get_category_by_name(analysis['category'])
            if cat:
                updates['category_id'] = cat['id']
                updates['category_confidence'] = analysis.get(
                    'category_confidence', 0.5
                )
        if updates:
            db.update_document(doc_id, updates)
            return True
        return False
    except Exception as anreicherung_err:
        logger.warning(
            f"Anreicherung fuer {filename} uebersprungen: {anreicherung_err}"
        )
        return False
