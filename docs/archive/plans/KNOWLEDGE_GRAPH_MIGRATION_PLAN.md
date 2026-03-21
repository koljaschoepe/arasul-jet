# Migrationsplan: Hybrid RAG + Knowledge Graph

**Datum:** 2026-03-05
**Status:** Entwurf - Wartet auf Genehmigung
**Ziel:** RAG-Qualität auf ChatGPT/Claude-Niveau heben + Knowledge Graph für vernetzes Wissen

---

## Zusammenfassung

Basierend auf der Analyse von 12 Sub-Agents (6x Codebase, 6x Internet-Recherche) und dem User-Interview empfehle ich einen **zweistufigen Ansatz**:

1. **RAG-Qualität verbessern** (Phasen 1-2): Die aktuellen Probleme (Dokumente nicht gefunden, Tippfehler-Empfindlichkeit) sind Retrieval-Probleme, keine Knowledge-Graph-Probleme
2. **Knowledge Graph als Erweiterung** (Phasen 3-5): Für vernetzes Wissen, Multi-Hop-Reasoning und strukturierte Beziehungen

**Architektur-Entscheidungen:**

| Entscheidung          | Wahl                                             | Begründung                                         |
| --------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Graph-Datenbank       | **Apache AGE** (PostgreSQL-Extension)            | Null neue Container, nutzt bestehende PG-Instanz   |
| Entity-Extraktion     | **spaCy** (NLP-basiert)                          | Schnell, offline, ARM64-kompatibel, kein LLM nötig |
| Rechtschreibkorrektur | **SymSpell**                                     | 1M× schneller als Edit-Distance, offline, deutsch  |
| Embedding-Modell      | **BGE-M3** (beibehalten, Konsistenz fixen)       | Bereits installiert, multilingual, 1024d           |
| BM25                  | **Qdrant-native Sparse Vectors**                 | Eliminiert separaten BM25-Service, immer synchron  |
| Entity-Schema         | **Vordefiniert** (Person, Org, Produkt, Prozess) | Minimaler Wartungsaufwand, automatische Extraktion |

**Geschätzter Gesamtaufwand:** ~5 Phasen, jeweils 1-3 Tage Implementierung

---

## Phase 1: RAG Quick Fixes (Tag 1-2)

> **Ziel:** Sofortige Verbesserung der Retrieval-Qualität ohne große Umbauarbeiten

### 1.1 Embedding-Modell-Konsistenz prüfen und fixen

**Problem:** Der `enhanced_indexer.py` hat als Fallback `sentence-transformers/all-MiniLM-L6-v2` (384d), während `embedding_server.py` auf `BAAI/bge-m3` (1024d) steht. Wenn die Env-Vars nicht korrekt gesetzt sind, werden Dokumente mit einem anderen Modell indexiert als Queries embedded werden.

**Dateien:**

- `services/document-indexer/enhanced_indexer.py` (Zeile ~70)
- `services/embedding-service/embedding_server.py` (Zeile ~26)
- `compose/compose.ai.yaml` (Environment-Variablen)

**Aktion:**

```yaml
# compose/compose.ai.yaml - für BEIDE Services identisch setzen:
environment:
  EMBEDDING_MODEL: BAAI/bge-m3
  EMBEDDING_VECTOR_SIZE: 1024
```

**Nach dem Fix:** Alle Dokumente neu indexieren (Qdrant-Collection droppen + rebuild).

### 1.2 Relevanz-Schwellwerte senken

**Problem:** `RAG_RELEVANCE_THRESHOLD=0.5` und `RAG_VECTOR_SCORE_THRESHOLD=0.55` filtern zu aggressiv, besonders bei deutschen Dokumenten mit multilingualen Embeddings.

**Datei:** `apps/dashboard-backend/src/routes/rag.js` (Zeilen 48-49)

**Aktion:**

```javascript
// Vorher:
const RAG_RELEVANCE_THRESHOLD = parseFloat(process.env.RAG_RELEVANCE_THRESHOLD || '0.5');
const RAG_VECTOR_SCORE_THRESHOLD = parseFloat(process.env.RAG_VECTOR_SCORE_THRESHOLD || '0.55');

// Nachher:
const RAG_RELEVANCE_THRESHOLD = parseFloat(process.env.RAG_RELEVANCE_THRESHOLD || '0.3');
const RAG_VECTOR_SCORE_THRESHOLD = parseFloat(process.env.RAG_VECTOR_SCORE_THRESHOLD || '0.4');
```

### 1.3 BM25 Incremental-Rebuild fixen

**Problem:** `bm25_index.py` hängt bei inkrementellen Updates nur Chunk-IDs an, ohne den suchbaren Index neu zu bauen. Neue Dokumente sind per BM25 möglicherweise nicht findbar.

**Datei:** `services/document-indexer/bm25_index.py` (Zeile ~123-129)

**Aktion:** Nach jedem Indexing-Batch automatisch `/bm25/rebuild` triggern, oder den `add_document_chunks`-Methode ein explizites `self._rebuild_index()` hinzufügen.

### 1.4 SymSpell Rechtschreibkorrektur hinzufügen

**Problem:** Tippfehler im Query führen zu schlechten Ergebnissen, weil weder Embedding noch BM25 robust gegen Schreibfehler sind.

**Neue Dateien:**

- `services/document-indexer/spell_corrector.py`
- `services/document-indexer/data/de-100k.txt` (deutsches Frequenz-Wörterbuch)

**Abhängigkeit:** `symspellpy>=6.9.0` in `requirements.txt`

**Implementierung:**

```python
# services/document-indexer/spell_corrector.py
import os
from symspellpy import SymSpell, Verbosity

_sym_spell = None

def get_spell_checker():
    global _sym_spell
    if _sym_spell is None:
        _sym_spell = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
        # Deutsches Standard-Wörterbuch
        dict_path = os.getenv('GERMAN_DICT_PATH', '/app/data/de-100k.txt')
        _sym_spell.load_dictionary(dict_path, term_index=0, count_index=1)
        # Domain-spezifisches Wörterbuch (aus indexierten Dokumenten)
        domain_path = '/data/domain-dict.txt'
        if os.path.exists(domain_path):
            _sym_spell.load_dictionary(domain_path, term_index=0, count_index=1)
    return _sym_spell

def correct_query(query: str) -> tuple[str, list]:
    """Korrigiert Tippfehler. Gibt (korrigiert, korrekturen) zurück."""
    checker = get_spell_checker()
    words = query.split()
    corrected = []
    corrections = []
    for word in words:
        if len(word) < 3:
            corrected.append(word)
            continue
        suggestions = checker.lookup(word.lower(), Verbosity.CLOSEST, max_edit_distance=2)
        if suggestions and suggestions[0].distance > 0:
            corrected.append(suggestions[0].term)
            corrections.append({"original": word, "corrected": suggestions[0].term})
        else:
            corrected.append(word)
    return ' '.join(corrected), corrections
```

**API-Endpoint:** Neuer Endpoint in `api_server.py`:

```python
@app.route('/spellcheck', methods=['POST'])
def spellcheck():
    text = request.json.get('text', '')
    corrected, corrections = correct_query(text)
    return jsonify({"corrected": corrected, "corrections": corrections})
```

**Backend-Integration:** In `rag.js` vor der Query-Optimierung aufrufen:

```javascript
// In der RAG-Query-Pipeline, vor optimizeQuery():
const spellResult = await callDocumentIndexer('/spellcheck', { text: query });
const correctedQuery = spellResult?.corrected || query;
// correctedQuery an optimizeQuery() übergeben
```

### 1.5 Domain-Wörterbuch automatisch aufbauen

**Aktion:** Beim Indexing jedes Dokuments alle eindeutigen Wörter mit Häufigkeit extrahieren und in `/data/domain-dict.txt` schreiben. So erkennt SymSpell auch Fachbegriffe, Produktnamen und firmenspezifische Terminologie.

```python
# In enhanced_indexer.py, nach erfolgreichem Indexing:
def update_domain_dictionary(chunks):
    from collections import Counter
    word_freq = Counter()
    for chunk in chunks:
        words = re.findall(r'\b\w{3,}\b', chunk['text'].lower())
        word_freq.update(words)
    dict_path = '/data/domain-dict.txt'
    existing = Counter()
    if os.path.exists(dict_path):
        with open(dict_path) as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) == 2:
                    existing[parts[0]] = int(parts[1])
    existing.update(word_freq)
    with open(dict_path, 'w') as f:
        for word, count in existing.most_common():
            f.write(f"{word} {count}\n")
```

---

## Phase 2: Retrieval-Verbesserungen (Tag 3-5) ✅ IMPLEMENTIERT

> **Ziel:** Tiefgreifende Verbesserungen an der Retrieval-Pipeline

### 2.1 Qdrant-native Hybrid Search (BM25 in Qdrant)

**Problem:** Separater BM25-Index (`bm25_index.py`) ist nicht synchron mit Qdrant, erfordert eigenen Service, und hat Incremental-Update-Probleme.

**Lösung:** Seit Qdrant 1.10+ können Sparse Vectors (BM25) direkt in Qdrant gespeichert werden. Das eliminiert den separaten BM25-Index komplett.

**Datei:** `services/document-indexer/enhanced_indexer.py`

**Neue Collection-Konfiguration:**

```python
from qdrant_client.models import SparseVectorParams, Modifier

client.create_collection(
    collection_name="documents",
    vectors_config=VectorParams(size=1024, distance=Distance.COSINE, on_disk=True),
    sparse_vectors_config={
        "bm25": SparseVectorParams(
            modifier=Modifier.IDF  # BM25 IDF-Gewichtung
        )
    },
    hnsw_config=HnswConfigDiff(m=16, ef_construct=100),
    quantization_config=BinaryQuantization(
        binary_quantization=BinaryQuantizationConfig(always_ram=True)
    ),
)
```

**Beim Indexing:** Sparse Vectors automatisch generieren:

```python
# Qdrant 1.15.2+ kann Text direkt in Sparse Vectors konvertieren
point = PointStruct(
    id=chunk_uuid,
    vector={
        "": dense_embedding,          # Dense (BGE-M3)
        "bm25": chunk_text            # Qdrant konvertiert automatisch
    },
    payload={...}
)
```

**Beim Query:** Native Hybrid Search mit server-seitigem RRF:

```python
from qdrant_client.models import Prefetch, FusionQuery, Fusion

results = client.query_points(
    collection_name="documents",
    prefetch=[
        Prefetch(query=dense_embedding, using="", limit=20),
        Prefetch(query=query_text, using="bm25", limit=20),
    ],
    query=FusionQuery(fusion=Fusion.RRF),
    limit=10,
)
```

**Backend-Änderungen:** In `rag.js`:

- `searchBM25()` Funktion entfernen
- `searchKeywordChunks()` Funktion entfernen
- `reciprocalRankFusion()` Funktion entfernen
- `hybridSearch()` durch einzelnen Qdrant-Call ersetzen
- Fallback auf PostgreSQL FTS entfernen (nicht mehr nötig)

**Infrastruktur:** `arasul-bm25-index` Volume und BM25-bezogene Endpoints im document-indexer können entfernt werden.

### 2.2 Kontextuelles Chunking

**Problem:** Jeder Child-Chunk verliert seinen Dokumentkontext. Ein Chunk wie "Die Leistung beträgt 120kW" ist ohne Kontext nicht zuordenbar.

**Lösung:** Vor dem Embedding jedem Chunk einen Kontext-Header voranstellen (Anthropic "Contextual Retrieval" Ansatz).

**Datei:** `services/document-indexer/enhanced_indexer.py`

```python
def contextualize_chunk(chunk_text, document_title, parent_text, chunk_index, total_chunks):
    """Kontextualisiert einen Chunk vor dem Embedding."""
    context = f"[Dokument: {document_title}]"
    if chunk_index == 0:
        context += " [Anfang]"
    elif chunk_index == total_chunks - 1:
        context += " [Ende]"
    # Ersten 150 Zeichen des Parent-Chunks als Kontext
    if parent_text:
        parent_preview = parent_text[:150].strip().replace('\n', ' ')
        context += f" [Abschnitt: {parent_preview}...]"
    return f"{context}\n{chunk_text}"
```

**Wichtig:** Der Kontext-Header wird NUR für das Embedding verwendet, nicht für die Anzeige. Der originale `chunk_text` bleibt in der Payload unverändert.

### 2.3 RRF K-Parameter tunen

**Datei:** `apps/dashboard-backend/src/routes/rag.js` (Zeile 38)

```javascript
// Vorher: const RRF_K = 60;
// Wenn wir Qdrant-native RRF nutzen, wird das dort konfiguriert.
// Alternativ bei eigenem RRF: K=30 für stärkere Gewichtung der Top-Ergebnisse
const RRF_K = parseInt(process.env.RRF_K || '30');
```

### 2.4 Alle Dokumente neu indexieren

Nach Abschluss von Phase 2 müssen alle Dokumente neu indexiert werden:

1. Qdrant-Collection `documents` löschen
2. Neue Collection mit Dense + Sparse Vectors erstellen
3. Alle Dokumente in PostgreSQL auf `status='pending'` setzen
4. Document-Indexer neu starten → re-indexiert alles

```sql
-- In PostgreSQL:
UPDATE documents SET status = 'pending', indexed_at = NULL WHERE deleted_at IS NULL;
```

### Deployment Phase 1+2 (Schritt-für-Schritt)

```bash
# 1. Stop services
docker compose stop document-indexer dashboard-backend

# 2. Rebuild containers with new code
docker compose up -d --build document-indexer dashboard-backend

# 3. Delete old Qdrant collection (MUST do - collection format changed to named vectors)
docker exec -it postgres-db psql -U arasul -d arasul_db -c "
  -- Delete old Qdrant collection via API
  SELECT 'Collection must be deleted via Qdrant API';
"
# Actually: use curl to delete the collection
curl -X DELETE http://localhost:6333/collections/documents

# 4. Reset all documents to pending (triggers re-indexing)
docker exec -it postgres-db psql -U arasul -d arasul_db -c "
  UPDATE documents SET status = 'pending', indexed_at = NULL WHERE deleted_at IS NULL;
  DELETE FROM document_chunks;
  DELETE FROM document_parent_chunks;
  DELETE FROM document_similarities;
"

# 5. Restart document-indexer (creates new collection + re-indexes everything)
docker compose restart document-indexer

# 6. Monitor progress
docker compose logs -f document-indexer
```

**Wichtig:** Die neue Qdrant Collection hat Named Vectors (`dense` + `bm25` sparse), daher MUSS die alte Collection gelöscht werden. Ein einfaches Re-Index reicht nicht.

### Deployment Phase 3 (Knowledge Graph)

```bash
# 1. Run migration to create KG tables
docker exec -it postgres-db psql -U arasul -d arasul_db -f /docker-entrypoint-initdb.d/044_knowledge_graph_schema.sql

# 2. Rebuild document-indexer (spaCy + entity extraction)
docker compose up -d --build document-indexer

# 3. Rebuild dashboard-backend (new /api/knowledge-graph routes)
docker compose up -d --build dashboard-backend

# 4. Reset documents for re-indexing (now includes KG extraction)
docker exec -it postgres-db psql -U arasul -d arasul_db -c "
  UPDATE documents SET status = 'pending', indexed_at = NULL WHERE deleted_at IS NULL;
  DELETE FROM document_chunks;
  DELETE FROM document_parent_chunks;
  DELETE FROM document_similarities;
"

# 5. Restart document-indexer to trigger re-index
docker compose restart document-indexer

# 6. Monitor (look for "Graph: N entities, M relations" log lines)
docker compose logs -f document-indexer
```

**Hinweis:** Der spaCy-Download (`de_core_news_lg`, ~560MB) erhöht die Build-Zeit des document-indexer Containers erheblich. Falls `de_core_news_lg` fehlschlägt (z.B. kein ARM64-Wheel), wird automatisch `de_core_news_sm` verwendet.

---

## Phase 3: Knowledge Graph Integration (Tag 6-10) ✅ IMPLEMENTIERT

> **Ziel:** Knowledge Graph in bestehende PostgreSQL-Instanz integrieren
>
> **Abweichung vom Plan:** Statt Apache AGE (erfordert Custom-PG-Build, ARM64-Risiko)
> nutzen wir **PostgreSQL-native Tabellen + Recursive CTEs**. Gleiche Funktionalität,
> null Container-Änderungen, voll ARM64-kompatibel.

### 3.1 Apache AGE installieren

**Was:** Apache AGE ist eine PostgreSQL-Extension, die Cypher-Queries (wie Neo4j) direkt in PostgreSQL ermöglicht. Null neue Container.

**Datei:** `services/postgres/Dockerfile` (oder direkt im Container installieren)

```dockerfile
# Option A: In PostgreSQL-Container installieren
FROM postgres:16

RUN apt-get update && apt-get install -y \
    build-essential \
    libreadline-dev \
    zlib1g-dev \
    flex \
    bison \
    postgresql-server-dev-16 \
    git

RUN git clone https://github.com/apache/age.git /tmp/age && \
    cd /tmp/age && \
    make PG_CONFIG=/usr/bin/pg_config install && \
    rm -rf /tmp/age

# Option B: Direkt das Apache AGE Docker-Image nutzen
# FROM apache/age:PG16_latest
```

**Migration:** Neue SQL-Migration `044_knowledge_graph_schema.sql`:

```sql
-- Apache AGE Extension laden
CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

-- Knowledge Graph erstellen
SELECT create_graph('arasul_kg');

-- Vordefinierte Entity-Labels erstellen (Cypher)
SELECT * FROM cypher('arasul_kg', $$
    CREATE (:_schema {
        entity_types: ['Person', 'Organisation', 'Produkt', 'Technologie', 'Prozess', 'Konzept', 'Ort', 'Dokument'],
        relation_types: ['ARBEITET_BEI', 'VERANTWORTLICH_FUER', 'NUTZT', 'ABHAENGIG_VON', 'FOLGT_AUF', 'REFERENZIERT', 'GEHOERT_ZU', 'BEFINDET_IN', 'ERSTELLT_VON', 'ENTHAELT', 'VERWANDT_MIT']
    })
    RETURN true
$$) as (result agtype);
```

### 3.2 spaCy für deutsche Entity-Extraktion

**Warum spaCy statt LLM:**

- LLM-basierte Extraktion: 36h für 19 Dateien (lokal) → Wochen für 10.000 Dokumente
- spaCy NLP: Sekunden pro Dokument, offline, ARM64-kompatibel

**Installation im Document-Indexer:**

```dockerfile
# services/document-indexer/Dockerfile
RUN pip install spacy>=3.7
RUN python -m spacy download de_core_news_lg
```

**Neue Datei:** `services/document-indexer/entity_extractor.py`

```python
import spacy
import re
from typing import List, Dict, Tuple

nlp = spacy.load("de_core_news_lg")

# Mapping von spaCy-Labels auf unser Schema
ENTITY_TYPE_MAP = {
    'PER': 'Person',
    'ORG': 'Organisation',
    'LOC': 'Ort',
    'MISC': 'Konzept',
}

def extract_entities(text: str) -> List[Dict]:
    """Extrahiert Entitäten aus Text mit spaCy NER."""
    doc = nlp(text)
    entities = []
    seen = set()

    for ent in doc.ents:
        normalized = ent.text.strip()
        if normalized.lower() in seen or len(normalized) < 2:
            continue
        seen.add(normalized.lower())

        entity_type = ENTITY_TYPE_MAP.get(ent.label_, 'Konzept')
        entities.append({
            'name': normalized,
            'type': entity_type,
            'label': ent.label_,
            'start': ent.start_char,
            'end': ent.end_char,
        })

    return entities

def extract_relations(text: str, entities: List[Dict]) -> List[Dict]:
    """Extrahiert Beziehungen basierend auf Kookkurrenz in Sätzen."""
    doc = nlp(text)
    relations = []

    for sent in doc.sents:
        sent_entities = [
            e for e in entities
            if e['start'] >= sent.start_char and e['end'] <= sent.end_char
        ]
        # Kookkurrenz-basierte Relationen: Entitäten im selben Satz
        for i, e1 in enumerate(sent_entities):
            for e2 in sent_entities[i+1:]:
                relation_type = infer_relation_type(e1, e2, sent.text)
                relations.append({
                    'source': e1['name'],
                    'source_type': e1['type'],
                    'target': e2['name'],
                    'target_type': e2['type'],
                    'relation': relation_type,
                    'context': sent.text[:200],
                })

    return relations

def infer_relation_type(e1: Dict, e2: Dict, sentence: str) -> str:
    """Inferiert den Beziehungstyp aus Entity-Typen und Satz-Kontext."""
    type_pair = (e1['type'], e2['type'])
    s = sentence.lower()

    # Regelbasierte Zuordnung
    if type_pair == ('Person', 'Organisation'):
        if any(w in s for w in ['arbeitet', 'leitet', 'führt', 'beschäftigt']):
            return 'ARBEITET_BEI'
        return 'GEHOERT_ZU'

    if 'Produkt' in type_pair or 'Technologie' in type_pair:
        if any(w in s for w in ['nutzt', 'verwendet', 'einsetzt', 'basiert']):
            return 'NUTZT'
        if any(w in s for w in ['abhängig', 'benötigt', 'erfordert']):
            return 'ABHAENGIG_VON'
        return 'VERWANDT_MIT'

    if 'Prozess' in type_pair:
        if any(w in s for w in ['nach', 'dann', 'anschließend', 'folgt']):
            return 'FOLGT_AUF'
        return 'VERWANDT_MIT'

    return 'VERWANDT_MIT'

def extract_from_document(text: str, document_id: str, document_title: str) -> Dict:
    """Vollständige Extraktion für ein Dokument."""
    entities = extract_entities(text)
    relations = extract_relations(text, entities)

    # Dokument-Entity hinzufügen
    doc_entity = {
        'name': document_title,
        'type': 'Dokument',
        'label': 'DOC',
        'start': 0,
        'end': len(text),
    }

    # ENTHAELT-Relationen vom Dokument zu allen Entitäten
    for entity in entities:
        relations.append({
            'source': document_title,
            'source_type': 'Dokument',
            'target': entity['name'],
            'target_type': entity['type'],
            'relation': 'ENTHAELT',
            'context': f"Dokument '{document_title}' enthält {entity['type']} '{entity['name']}'",
        })

    return {
        'entities': [doc_entity] + entities,
        'relations': relations,
    }
```

### 3.3 Graph-Speicherung via Apache AGE

**Neue Datei:** `services/document-indexer/graph_store.py`

```python
import psycopg2
import json

class GraphStore:
    def __init__(self, dsn):
        self.dsn = dsn

    def _get_conn(self):
        conn = psycopg2.connect(self.dsn)
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute("LOAD 'age'")
            cur.execute("SET search_path = ag_catalog, '$user', public")
        return conn

    def upsert_entity(self, conn, name: str, entity_type: str, properties: dict = None):
        """Entity erstellen oder aktualisieren (Merge-Semantik)."""
        props = json.dumps(properties or {})
        query = f"""
            SELECT * FROM cypher('arasul_kg', $$
                MERGE (e:{entity_type} {{name: '{self._escape(name)}'}})
                ON CREATE SET e.created_at = timestamp()
                ON MATCH SET e.updated_at = timestamp()
                SET e += {props}
                RETURN id(e)
            $$) as (id agtype)
        """
        with conn.cursor() as cur:
            cur.execute(query)
            return cur.fetchone()

    def upsert_relation(self, conn, source: str, source_type: str,
                        target: str, target_type: str,
                        relation: str, properties: dict = None):
        """Beziehung erstellen oder aktualisieren."""
        props = json.dumps(properties or {})
        query = f"""
            SELECT * FROM cypher('arasul_kg', $$
                MATCH (s:{source_type} {{name: '{self._escape(source)}'}}),
                      (t:{target_type} {{name: '{self._escape(target)}'}})
                MERGE (s)-[r:{relation}]->(t)
                ON CREATE SET r.created_at = timestamp()
                SET r += {props}
                RETURN id(r)
            $$) as (id agtype)
        """
        with conn.cursor() as cur:
            cur.execute(query)
            return cur.fetchone()

    def store_document_graph(self, document_id: str, extraction_result: dict):
        """Speichert alle Entitäten und Relationen eines Dokuments."""
        conn = self._get_conn()
        try:
            for entity in extraction_result['entities']:
                self.upsert_entity(conn, entity['name'], entity['type'], {
                    'source_document': document_id
                })

            for relation in extraction_result['relations']:
                self.upsert_relation(
                    conn,
                    relation['source'], relation['source_type'],
                    relation['target'], relation['target_type'],
                    relation['relation'],
                    {'context': relation.get('context', '')[:200]}
                )

            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def query_related(self, entity_name: str, max_depth: int = 2, limit: int = 20):
        """Findet verwandte Entitäten bis zu einer bestimmten Tiefe."""
        conn = self._get_conn()
        try:
            query = f"""
                SELECT * FROM cypher('arasul_kg', $$
                    MATCH path = (start {{name: '{self._escape(entity_name)}'}})
                                 -[*1..{max_depth}]-(related)
                    RETURN DISTINCT related.name as name,
                           label(related) as type,
                           length(path) as distance
                    ORDER BY distance
                    LIMIT {limit}
                $$) as (name agtype, type agtype, distance agtype)
            """
            with conn.cursor() as cur:
                cur.execute(query)
                return cur.fetchall()
        finally:
            conn.close()

    def get_document_entities(self, document_title: str):
        """Alle Entitäten eines Dokuments abrufen."""
        conn = self._get_conn()
        try:
            query = f"""
                SELECT * FROM cypher('arasul_kg', $$
                    MATCH (d:Dokument {{name: '{self._escape(document_title)}'}})-[:ENTHAELT]->(e)
                    RETURN e.name as name, label(e) as type
                $$) as (name agtype, type agtype)
            """
            with conn.cursor() as cur:
                cur.execute(query)
                return cur.fetchall()
        finally:
            conn.close()

    def find_connections(self, entity1: str, entity2: str, max_depth: int = 4):
        """Findet Verbindungspfade zwischen zwei Entitäten."""
        conn = self._get_conn()
        try:
            query = f"""
                SELECT * FROM cypher('arasul_kg', $$
                    MATCH path = shortestPath(
                        (a {{name: '{self._escape(entity1)}'}})
                        -[*1..{max_depth}]-
                        (b {{name: '{self._escape(entity2)}'}})
                    )
                    RETURN [n IN nodes(path) | n.name] as nodes,
                           [r IN relationships(path) | type(r)] as relations
                $$) as (nodes agtype, relations agtype)
            """
            with conn.cursor() as cur:
                cur.execute(query)
                return cur.fetchall()
        finally:
            conn.close()

    @staticmethod
    def _escape(s: str) -> str:
        """Cypher-Injection verhindern."""
        return s.replace("'", "\\'").replace("\\", "\\\\")
```

### 3.4 Indexing-Pipeline erweitern

**Datei:** `services/document-indexer/enhanced_indexer.py`

Nach dem bestehenden Chunking + Embedding-Schritt den Entity-Extraktor und Graph-Store aufrufen:

```python
# In der index_document() Methode, nach erfolgreichem Qdrant-Upsert:

from entity_extractor import extract_from_document
from graph_store import GraphStore

graph_store = GraphStore(dsn=POSTGRES_DSN)

def index_document(document):
    # ... bestehender Code: Parse, Chunk, Embed, Qdrant-Upsert ...

    # NEU: Entity-Extraktion + Knowledge Graph
    try:
        full_text = ' '.join([chunk['text'] for chunk in chunks])
        extraction = extract_from_document(
            text=full_text,
            document_id=str(document['id']),
            document_title=document['title'] or document['filename']
        )
        graph_store.store_document_graph(str(document['id']), extraction)

        logger.info(f"Graph: {len(extraction['entities'])} entities, "
                     f"{len(extraction['relations'])} relations for {document['filename']}")
    except Exception as e:
        logger.warning(f"Graph extraction failed for {document['filename']}: {e}")
        # Nicht-fataler Fehler - Dokument ist trotzdem indexiert
```

### 3.5 Backend-API für Graph-Queries

**Neue Datei:** `apps/dashboard-backend/src/routes/ai/knowledge-graph.js`

```javascript
const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const database = require('../../config/database');

// Graph-Queries via Apache AGE
async function cypherQuery(query) {
  const client = await database.pool.connect();
  try {
    await client.query("LOAD 'age'");
    await client.query("SET search_path = ag_catalog, '$user', public");
    const result = await client.query(query);
    return result.rows;
  } finally {
    client.release();
  }
}

// GET /api/knowledge-graph/entities?search=BMW
router.get(
  '/entities',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { search, type, limit = 50 } = req.query;
    let cypher;
    if (search) {
      cypher = `SELECT * FROM cypher('arasul_kg', $$
      MATCH (e) WHERE e.name =~ '(?i).*${search}.*'
      RETURN e.name as name, label(e) as type
      LIMIT ${parseInt(limit)}
    $$) as (name agtype, type agtype)`;
    } else if (type) {
      cypher = `SELECT * FROM cypher('arasul_kg', $$
      MATCH (e:${type}) RETURN e.name as name, label(e) as type
      LIMIT ${parseInt(limit)}
    $$) as (name agtype, type agtype)`;
    }
    const rows = await cypherQuery(cypher);
    res.json({ entities: rows });
  })
);

// GET /api/knowledge-graph/related/:entityName
router.get(
  '/related/:entityName',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { entityName } = req.params;
    const { depth = 2, limit = 20 } = req.query;
    const cypher = `SELECT * FROM cypher('arasul_kg', $$
    MATCH path = ({name: '${entityName}'})-[*1..${depth}]-(related)
    RETURN DISTINCT related.name as name, label(related) as type,
           length(path) as distance
    ORDER BY distance LIMIT ${limit}
  $$) as (name agtype, type agtype, distance agtype)`;
    const rows = await cypherQuery(cypher);
    res.json({ entity: entityName, related: rows });
  })
);

// GET /api/knowledge-graph/stats
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    const entityCount = await cypherQuery(`
    SELECT * FROM cypher('arasul_kg', $$
      MATCH (e) RETURN count(e) as count
    $$) as (count agtype)
  `);
    const relationCount = await cypherQuery(`
    SELECT * FROM cypher('arasul_kg', $$
      MATCH ()-[r]->() RETURN count(r) as count
    $$) as (count agtype)
  `);
    res.json({
      entities: entityCount[0]?.count || 0,
      relations: relationCount[0]?.count || 0,
    });
  })
);

module.exports = router;
```

**Route registrieren:** In `routes/index.js`:

```javascript
router.use('/knowledge-graph', require('./ai/knowledge-graph'));
```

---

## Phase 4: Hybrid Retrieval Pipeline (Tag 11-14) ✅ IMPLEMENTIERT

> **Ziel:** Vector-Suche und Graph-Traversal in einer einheitlichen RAG-Pipeline kombinieren
>
> **Implementierung:**
>
> - `graphEnrichedRetrieval()` in `rag.js`: Entity-Extraktion + Graph-Traversal parallel zum Hybrid Search
> - `buildHierarchicalContext()` erweitert um Level 4 (Wissensverknüpfungen)
> - `POST /api/knowledge-graph/query` für n8n-Workflows
> - Graph-Metadaten im SSE `rag_metadata` Event für Frontend-Anzeige

### 4.1 Graph-angereicherte RAG-Query

**Datei:** `apps/dashboard-backend/src/routes/rag.js`

Die bestehende RAG-Pipeline wird um einen Graph-Retrieval-Schritt erweitert:

```
Bisherige Pipeline:
  Query → Spell-Check → Optimize → Embed → Hybrid Search → Rerank → LLM

Neue Pipeline:
  Query → Spell-Check → Optimize → Embed
    ├→ Vector+BM25 Hybrid Search (Qdrant)  ─┐
    └→ Entity-Extraktion → Graph Traversal ─┤
                                             ├→ Merge + Rerank → LLM
```

**Implementierung:**

```javascript
// Neue Funktion in rag.js:
async function graphEnrichedRetrieval(query, vectorResults) {
  try {
    // 1. Entitäten aus Query extrahieren
    const entityResponse = await axios.post(
      `${DOCUMENT_INDEXER_URL}/extract-entities`,
      { text: query },
      { timeout: 5000 }
    );
    const queryEntities = entityResponse.data.entities || [];

    if (queryEntities.length === 0) {
      return { graphContext: null, graphEntities: [] };
    }

    // 2. Für jede Entität verwandte Informationen aus dem Graph laden
    const graphResults = [];
    for (const entity of queryEntities.slice(0, 3)) {
      // Max 3 Entitäten
      const related = await cypherQuery(`
        SELECT * FROM cypher('arasul_kg', $$
          MATCH (e {name: '${entity.name}'})-[r]-(related)
          RETURN e.name as source, type(r) as relation,
                 related.name as target, label(related) as target_type
          LIMIT 10
        $$) as (source agtype, relation agtype, target agtype, target_type agtype)
      `);
      graphResults.push(...related);
    }

    // 3. Graph-Kontext als Text formatieren
    if (graphResults.length > 0) {
      const graphContext = formatGraphContext(queryEntities, graphResults);
      return { graphContext, graphEntities: queryEntities };
    }

    return { graphContext: null, graphEntities: queryEntities };
  } catch (error) {
    logger.warn(`Graph enrichment failed: ${error.message}`);
    return { graphContext: null, graphEntities: [] };
  }
}

function formatGraphContext(entities, graphResults) {
  let context = '## Wissensverknüpfungen\n';
  context += 'Folgende Zusammenhänge sind aus dem Wissensgraphen bekannt:\n\n';

  for (const result of graphResults) {
    const relation = result.relation.replace(/_/g, ' ').toLowerCase();
    context += `- ${result.source} → ${relation} → ${result.target} (${result.target_type})\n`;
  }

  return context;
}
```

### 4.2 Hierarchischen Kontext erweitern

**Datei:** `rag.js` → `buildHierarchicalContext()`

Der bestehende 3-Level-Kontext wird um Level 4 (Graph) erweitert:

```
Level 1: Unternehmenshintergrund (company_context)
Level 2: Relevante Wissensbereiche (Knowledge Spaces)
Level 3: Gefundene Dokumente (Parent Chunks)
Level 4: Wissensverknüpfungen (Knowledge Graph)  ← NEU
```

### 4.3 n8n API-Endpoint für Graph-Queries

**Datei:** `apps/dashboard-backend/src/routes/ai/knowledge-graph.js`

Zusätzlicher Endpoint für n8n-Workflows:

```javascript
// POST /api/knowledge-graph/query
// Für n8n: Freitext-Frage → Graph-angereicherter Kontext
router.post(
  '/query',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { question, include_documents = true } = req.body;

    // 1. Entitäten extrahieren
    const entities = await extractEntities(question);

    // 2. Graph traversieren
    const graphContext = await graphEnrichedRetrieval(question, []);

    // 3. Optional: Dokument-Chunks mit Entity-Boost
    let documentContext = null;
    if (include_documents) {
      documentContext = await vectorSearch(question, entities);
    }

    res.json({
      entities,
      graph_context: graphContext,
      document_context: documentContext,
    });
  })
);
```

---

## Phase 5: LLM-basierte Graph-Verfeinerung (Optional, Tag 15+) ✅ IMPLEMENTIERT

> **Ziel:** LLM nutzen um den automatisch erstellten Graph zu verbessern - aber nur für kleine Batches, nicht für die initiale Konstruktion
>
> **Implementierung:**
>
> - Migration 045: `refined` Flag + `canonical_id` Self-Reference auf `kg_entities`, `refined` auf `kg_relations`
> - `graph_refiner.py`: Entity Resolution (Trigram-Similarity → LLM-Entscheidung → DB-Merge) + Relation Refinement (VERWANDT_MIT → spezifische Typen via LLM)
> - API: `POST /refine-graph` + `GET /refine-graph/status` im document-indexer
> - Backend: `POST /api/knowledge-graph/refine` + `GET /api/knowledge-graph/refine/status` (Proxy + DB-Fallback)

### 5.1 LLM-Verfeinerung bei Bedarf

Statt alle Entitäten per LLM zu extrahieren (zu langsam), nutzen wir das LLM nur für:

- **Entity Resolution:** "BMW", "BMW AG", "Bayerische Motoren Werke" → eine Entität
- **Relation Refinement:** Kookkurrenz-basierte "VERWANDT_MIT" in spezifischere Relationen umwandeln

```python
# Batch-Job: Nachts oder bei geringer Last ausführen
async def refine_graph_batch(batch_size=50):
    """Verfeinert die letzten N unrefinten Entitäten via LLM."""
    unrefined = get_unrefined_entities(limit=batch_size)

    prompt = f"""Analysiere folgende Entitäten und ihre Beziehungen.
    Identifiziere Duplikate (gleiche Entität, verschiedene Schreibweisen).
    Schlage spezifischere Beziehungstypen vor.

    Entitäten: {json.dumps(unrefined, ensure_ascii=False)}

    Antwort als JSON:
    {{
        "merges": [{{old_names: ["BMW AG", "BMW"], canonical: "BMW", type: "Organisation"}}],
        "refined_relations": [{{source: "...", target: "...", old: "VERWANDT_MIT", new: "NUTZT"}}]
    }}"""

    result = await ollama_generate(prompt)
    apply_refinements(result)
```

### 5.2 Inkrementelle Graph-Updates

Neue Dokumente werden automatisch verarbeitet:

1. spaCy extrahiert Entitäten (Sekunden)
2. AGE speichert mit MERGE-Semantik (Duplikate werden erkannt)
3. Optional: LLM-Verfeinerung nachts im Batch

---

## Infrastruktur-Änderungen

### Neue Dependencies

**Document-Indexer (`services/document-indexer/requirements.txt`):**

```
spacy>=3.7
symspellpy>=6.9.0
# spaCy-Modell wird im Dockerfile installiert
```

**PostgreSQL-Container:**

```
Apache AGE Extension (build from source oder apache/age Image)
```

### Kein neuer Container nötig

| Komponente  | Wo                           | Änderung                 |
| ----------- | ---------------------------- | ------------------------ |
| Apache AGE  | Bestehender PostgreSQL       | Extension installieren   |
| spaCy       | Bestehender Document-Indexer | pip install + Modell     |
| SymSpell    | Bestehender Document-Indexer | pip install + Wörterbuch |
| Graph-API   | Bestehender Backend          | Neue Route               |
| Qdrant BM25 | Bestehender Qdrant           | Collection-Config ändern |

### RAM-Impact

| Komponente                      | Zusätzlicher RAM           |
| ------------------------------- | -------------------------- |
| spaCy de_core_news_lg           | ~560 MB (einmalig geladen) |
| SymSpell Wörterbücher           | ~20 MB                     |
| Apache AGE Graph (10K Entities) | ~50-200 MB (in PG)         |
| **Gesamt zusätzlich**           | **~800 MB**                |

Bei 64GB Gesamt ist das vernachlässigbar.

---

## Risiken und Mitigationen

| Risiko                                | Wahrscheinlichkeit | Mitigation                                              |
| ------------------------------------- | ------------------ | ------------------------------------------------------- |
| Apache AGE kompiliert nicht für ARM64 | Mittel             | Fallback: Kuzu embedded (Python `pip install kuzu`)     |
| spaCy NER-Qualität ungenügend         | Niedrig            | LLM-Verfeinerung (Phase 5) korrigiert Fehler            |
| Qdrant-native BM25 nicht kompatibel   | Niedrig            | Bestehenden BM25-Index beibehalten, nur fixen           |
| Graph wird zu groß (>1M Knoten)       | Niedrig            | Pruning-Job: Entitäten mit nur 1 Verbindung entfernen   |
| Performance-Regression                | Mittel             | A/B-Testing: alte vs neue Pipeline mit gleichen Queries |

---

## Erfolgsmetriken

| Metrik                     | Aktuell (geschätzt) | Ziel nach Migration           |
| -------------------------- | ------------------- | ----------------------------- |
| Dokument gefunden (Recall) | ~60-70%             | >90%                          |
| Tippfehler-Toleranz        | ~0%                 | >80% (1-2 Zeichen)            |
| Multi-Hop-Fragen           | Nicht möglich       | Grundlegend möglich           |
| Antwort-Latenz             | 1-2s Retrieval      | 3-8s (mit Graph)              |
| Indexing-Zeit pro Dokument | ~30-120s            | ~60-180s (+Entity-Extraktion) |

---

## Reihenfolge der Implementierung

```
Phase 1 (Tag 1-2): Quick Fixes
  ├── 1.1 Embedding-Konsistenz fixen
  ├── 1.2 Schwellwerte senken
  ├── 1.3 BM25 Rebuild fixen
  ├── 1.4 SymSpell einbauen
  └── 1.5 Domain-Wörterbuch
  → TESTEN, VERIFIZIEREN

Phase 2 (Tag 3-5): Retrieval
  ├── 2.1 Qdrant-native Hybrid Search
  ├── 2.2 Kontextuelles Chunking
  ├── 2.3 RRF K-Tuning
  └── 2.4 Komplett neu indexieren
  → TESTEN, VERIFIZIEREN

Phase 3 (Tag 6-10): Knowledge Graph
  ├── 3.1 Apache AGE installieren
  ├── 3.2 spaCy Entity-Extraktion
  ├── 3.3 Graph Store
  ├── 3.4 Indexing-Pipeline erweitern
  └── 3.5 Backend-API
  → TESTEN, VERIFIZIEREN

Phase 4 (Tag 11-14): Hybrid Pipeline
  ├── 4.1 Graph-angereichertes Retrieval
  ├── 4.2 Hierarchischen Kontext erweitern
  └── 4.3 n8n API-Endpoint
  → TESTEN, VERIFIZIEREN

Phase 5 (Optional, Tag 15+): LLM-Verfeinerung
  ├── 5.1 Entity Resolution via LLM
  └── 5.2 Inkrementelle Updates
```

---

## Quellen

- [Microsoft GraphRAG](https://microsoft.github.io/graphrag/) - Referenzarchitektur
- [LazyGraphRAG](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/) - 99.9% Kostenreduktion
- [LightRAG (EMNLP 2025)](https://github.com/HKUDS/LightRAG) - Leichtgewichtige Alternative
- [Apache AGE](https://age.apache.org/) - PostgreSQL Graph Extension
- [Kuzu](https://github.com/kuzudb/kuzu) - Embedded Graph DB (Fallback)
- [SymSpell](https://github.com/mammothb/symspellpy) - Schnelle Rechtschreibkorrektur
- [Qdrant Hybrid Search](https://qdrant.tech/articles/sparse-vectors/) - Native BM25 Sparse Vectors
- [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) - Kontextuelles Chunking
- [spaCy German Models](https://spacy.io/models/de) - Deutsche NLP-Modelle
- [Jina ColBERT v2](https://jina.ai/news/jina-colbert-v2-multilingual-late-interaction-retriever-for-embedding-and-reranking/) - Late Interaction Reranking
- [HybridRAG Paper](https://arxiv.org/abs/2408.04948) - Vector + Graph Kombination
- [Towards Practical GraphRAG](https://arxiv.org/abs/2507.03226) - Dependency-basierte Extraktion (94% LLM-Qualität)
- [Qdrant + Neo4j GraphRAG Tutorial](https://qdrant.tech/documentation/examples/graphrag-qdrant-neo4j/)
- [Lettria Case Study](https://qdrant.tech/blog/case-study-lettria-v2/) - 20-25% Accuracy Uplift mit Hybrid
