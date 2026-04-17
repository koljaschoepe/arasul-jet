# RAG-System Optimierungsplan — Arasul Platform

## Zusammenfassung der Analyse

### Methodik

- **10 parallele Code-Analyse-Agents** haben jede Schicht des RAG-Systems untersucht: Upload-Pipeline, Chunking, Embedding-Service, Qdrant-Integration, LLM-Prompt-Konstruktion, Document-Indexer, Frontend-Flow, DB-Schema, Chat-API, Best Practices Research
- **12 End-to-End-Tests** mit 4 realistischen Unternehmensdokumenten (Personalrichtlinie, IT-Sicherheitsrichtlinie, Produktkatalog, Quartalsbericht — insgesamt ~33.600 Zeichen, ~4.500 Woerter)
- **Ergebnis:** 4/12 Tests bestanden, 3/12 fehlgeschlagen (RAG fand keine Dokumente obwohl Antwort existiert), 5/12 durch Queue-Ueberlastung nicht auswertbar

### Was bereits gut funktioniert

1. **Hierarchisches Parent-Child-Chunking** mit deutschen Separatoren (§, Artikel, Absatz)
2. **BGE-M3 Embedding-Modell** (1024D, multilingual, SOTA)
3. **Hybrid Search** (Dense + BM25 Sparse + RRF Fusion via Qdrant)
4. **2-Stage Reranking** (FlashRank CPU + BGE CrossEncoder GPU mit Confidence-Skip)
5. **3-Tier Anti-Hallucination Prompts** (relevant/marginal/none)
6. **Knowledge Spaces** mit automatischem Routing
7. **Kontextuelles Chunk-Enrichment** mit Dokumenttitel und Abschnitt-Preview
8. **Knowledge Graph** mit Entity-Extraktion und Graph-Traversal

### Kritische Schwachstellen (identifiziert durch Tests)

| #   | Problem                                                                                                                                                                                                       | Schwere  | Betroffene Tests |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- |
| S1  | **Zu wenige Chunks pro Dokument** — 8.800-Byte-Dokument ergibt nur 4 Chunks, 4.852-Byte-Dokument nur 3 Chunks. Viele Informationen sind in Chunks zusammengepackt, die zu gross fuer praezises Retrieval sind | KRITISCH | Test 3, 5, 6     |
| S2  | **Retrieval scheitert bei spezifischen Fakten** — Variable Verguetung (Stufe 8), Bruttomarge Q4, Neukunden Q4 wurden nicht gefunden, obwohl die Info in den Dokumenten steht                                  | KRITISCH | Test 5, 6, 8     |
| S3  | **Falsche Source-Attribution** — Test 1 zitiert [2] (Produktkatalog) fuer Urlaubstage, obwohl die Info aus [1] (Personalrichtlinie) stammt                                                                    | MITTEL   | Test 1           |
| S4  | **Cross-Document-Queries** — Bei Fragen, die Infos aus mehreren Dokumenten kombinieren, wird manchmal nur ein Dokument gefunden                                                                               | MITTEL   | Test 3           |
| S5  | **word_count fehlt in DB** — Alle Dokumente haben word_count=None, was Monitoring und Qualitaetskontrolle erschwert                                                                                           | NIEDRIG  | Alle             |
| S6  | **Indexierung sehr langsam** — 120s Polling-Intervall + 1 Dokument pro Zyklus = 8+ Minuten fuer 4 Dokumente                                                                                                   | NIEDRIG  | Upload-Tests     |
| S7  | **Queue-Serialisierung** — Mehrere RAG-Anfragen hintereinander fuehren zu Queue-Stau, da nur 1 LLM-Stream gleichzeitig laeuft                                                                                 | NIEDRIG  | Test 8-12        |

---

## Phase 1: Chunking-Optimierung (KRITISCH — groesster Impact)

### Problem

Die aktuelle Konfiguration (Parent: 2000 Woerter, Child: 300 Woerter, Overlap: 75 Woerter) erzeugt zu wenige, zu grosse Chunks. Ein 8.800-Byte-Markdown-Dokument (~1.200 Woerter) ergibt nur 4 Child-Chunks. Das bedeutet:

- Jeder Chunk enthaelt ~300 Woerter (ganze Sektionen)
- Spezifische Fakten (z.B. "Variable Verguetung Stufe 8: 15%") gehen in grossen Chunks unter
- Die Embedding-Qualitaet sinkt, weil ein 300-Wort-Chunk zu viele verschiedene Themen abdeckt

### Massnahmen

#### 1.1 Child-Chunk-Groesse reduzieren

```python
# VORHER (config.py):
CHILD_CHUNK_SIZE = 300  # words
CHILD_CHUNK_OVERLAP = 75  # words

# NACHHER:
CHILD_CHUNK_SIZE = 150  # words (~200 tokens) — optimal fuer spezifische Fakten
CHILD_CHUNK_OVERLAP = 30  # words (~20%) — behaelt genug Kontext
```

**Begruendung:** Benchmarks (FloTorch 2026, NAACL 2025) zeigen:

- 256-512 Tokens optimal fuer Factoid-Queries
- 150 Woerter = ~200 Tokens, perfekt fuer deutsche Fachsprache
- Overlap von 20% statt 25% naeher am Benchmark-Optimum (15%)

#### 1.2 Minimum-Wort-Filter anpassen

```python
# VORHER:
MIN_CHILD_WORDS = 20

# NACHHER:
MIN_CHILD_WORDS = 15  # Erlaubt kurze aber informationsdichte Chunks (z.B. Tabellen-Header)
```

#### 1.3 Abschnittsbasiertes Chunking fuer Markdown

Aktuell werden Markdown-Dokumente wie Fliesstext behandelt. Fuer strukturierte Dokumente (mit ## Headern) sollte der Chunker abschnittsbasiert arbeiten:

```python
# Neue Strategie in text_chunker.py:
def chunk_markdown_by_sections(text, max_child_size=150):
    """Split Markdown by ## headers first, then chunk within sections."""
    sections = re.split(r'\n(?=##\s)', text)
    for section in sections:
        header = section.split('\n')[0]
        if word_count(section) <= max_child_size:
            yield ChildChunk(text=section, ...)  # Keep small sections intact
        else:
            for chunk in _recursive_split(section, max_child_size):
                yield ChildChunk(text=f"{header}\n{chunk}", ...)  # Prepend header
```

**Impact:** Header-Kontext bleibt in jedem Chunk erhalten ("## 4. Verguetung und Benefits" steht im Chunk, nicht nur im Parent).

#### 1.4 Parent-Chunk-Groesse beibehalten

Die Parent-Chunk-Groesse von 2000 Woertern ist gut. Parents werden fuer den LLM-Kontext verwendet, nicht fuer Retrieval. Groessere Parents = besserer Kontext.

### Erwarteter Impact

- **2-3x mehr Chunks pro Dokument** (von 4 auf 8-12 fuer ein 1.200-Wort-Dokument)
- **Hoehere Retrieval-Praezision** fuer spezifische Fakten
- **Erfordert Re-Indexierung** aller bestehenden Dokumente

---

## Phase 2: Kontextuelles Chunking (HOCH — 35% Retrieval-Verbesserung)

### Problem

Aktuell wird jedem Child-Chunk ein kurzer Header vorangestellt:

```
[Dokument: Personalrichtlinie] [Abschnitt: ## 3. Urlaubsregelung...]
```

Das ist gut, aber nicht ausreichend. Anthropic's Forschung zeigt, dass ein **LLM-generierter Kontext-Satz** die Retrieval-Qualitaet um 35% verbessert.

### Massnahmen

#### 2.1 LLM-basierte Kontextualisierung bei Indexierung

```python
# In document_processor.py, vor dem Embedding:
def contextualize_chunk(chunk_text, full_document_text, document_title):
    """Generate a contextual description for each chunk using local LLM."""
    prompt = f"""Hier ist ein Ausschnitt aus dem Dokument "{document_title}".

Gib einen kurzen Satz (max. 30 Woerter), der beschreibt, wo sich dieser Ausschnitt
im Gesamtdokument befindet und worum es inhaltlich geht.

Ausschnitt:
{chunk_text[:500]}

Antwort (nur der Kontextsatz):"""

    context = call_local_llm(prompt, max_tokens=60, temperature=0.1)
    return f"{context}\n\n{chunk_text}"
```

**Kosten:** ~60 Tokens LLM-Inferenz pro Chunk. Bei 10 Chunks pro Dokument = 600 Tokens, auf Jetson ca. 3-5 Sekunden. Einmaliger Aufwand bei Indexierung.

#### 2.2 Kostenguenstigere Alternative: Template-basierte Kontextualisierung

Wenn LLM-Kosten zu hoch sind (z.B. bei 1000+ Dokumenten), kann ein Template-basierter Ansatz verwendet werden:

```python
def template_context(chunk, parent_chunk, doc_title, section_header, position):
    """Create context without LLM call."""
    pos_label = "Anfang" if position < 0.2 else "Ende" if position > 0.8 else "Mitte"
    return f"[Aus '{doc_title}', Abschnitt '{section_header}', Position: {pos_label}]\n\n{chunk.text}"
```

### Erwarteter Impact

- **35% weniger Retrieval-Fehler** (laut Anthropic's Benchmarks)
- **Bessere Embedding-Qualitaet** da jeder Chunk selbsterklaerend ist

---

## Phase 3: Retrieval-Pipeline Optimierung (HOCH)

### 3.1 Top-K erhoehen

```javascript
// VORHER (rag.js):
top_k: 5; // Default

// NACHHER:
top_k: 8; // Mehr Kandidaten = hoehere Recall
// Bei Reranking aktiv: fetchLimit = top_k * 5 = 40 (statt 25)
```

**Begruendung:** Mit kleineren Chunks (Phase 1) brauchen wir mehr Chunks fuer denselben Informationsgehalt.

### 3.2 Maximum Marginal Relevance (MMR) nach Reranking

Aktuell: Deduplication per Document (max 3 Chunks/Doc). Problem: Alle 3 Chunks koennen denselben Themenbereich abdecken.

```javascript
// In ragCore.js, nach rerankResults():
function applyMMR(results, lambda = 0.5, topK = 8) {
  const selected = [results[0]]; // Best result always included
  const remaining = results.slice(1);

  while (selected.length < topK && remaining.length > 0) {
    let bestScore = -Infinity;
    let bestIdx = 0;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = remaining[i].rerank_score || remaining[i].score;
      const maxSimilarity = Math.max(
        ...selected.map(s => cosineSimilarity(remaining[i].embedding, s.embedding))
      );
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  return selected;
}
```

**Impact:** Diversere Ergebnisse, weniger redundante Chunks.

### 3.3 BM25 Feldgewichtung

Aktuell werden alle Chunk-Texte gleich behandelt. Markdown-Header und Titel sollten staerker gewichtet werden:

```python
# In sparse_encoder.py:
def encode_with_field_boost(chunk_text, title, section_header):
    """BM25 encoding with field boosting."""
    boosted_text = f"{title} {title} {title} {title} "  # 4x boost
    boosted_text += f"{section_header} {section_header} "  # 2x boost
    boosted_text += chunk_text  # 1x
    return encode_sparse(boosted_text)
```

### 3.4 Relevance-Threshold anpassen

Die aktuellen Thresholds sind zu aggressiv (Tests 5, 6 gefiltert obwohl Antwort existiert):

```javascript
// VORHER:
RAG_RELEVANCE_THRESHOLD: 0.1; // Reranked minimum
RAG_VECTOR_SCORE_THRESHOLD: 0.015; // Vector minimum

// NACHHER:
RAG_RELEVANCE_THRESHOLD: 0.05; // Mehr Ergebnisse durchlassen
RAG_VECTOR_SCORE_THRESHOLD: 0.01; // Niedrigerer Vektor-Threshold
RAG_MARGINAL_FACTOR: 0.3; // Marginal ab 30% statt 50%
```

**Begruendung:** Lieber mehr (moeglicherweise marginal relevante) Ergebnisse anzeigen als wichtige Informationen filtern. Das Anti-Hallucination-Prompt-System faengt falsche Ergebnisse ab.

---

## Phase 4: Prompt-Engineering Optimierung (MITTEL)

### 4.1 Strengere Quellen-Attribution

Das aktuelle Problem (Test 1: falsches Dokument zitiert) liegt am LLM, nicht am Retrieval. Der Prompt muss strenger sein:

```javascript
// In llmJobProcessor.js, Tier 1 Prompt:
const STRICT_RAG_PROMPT = `Du bist ein professioneller Wissensassistent.

WICHTIG — Befolge diese Regeln EXAKT:
1. Antworte NUR mit Informationen aus den DOKUMENTEN unten.
2. Zitiere JEDE Aussage mit der KORREKTEN Quellennummer [1], [2] etc.
3. Die Nummer MUSS dem Dokument entsprechen, aus dem die Information stammt.
4. Wenn verschiedene Dokumente verschiedene Informationen liefern, nenne BEIDE mit den jeweiligen Quellen.
5. Wenn die Antwort NICHT in den Dokumenten steht, sage: "Diese Information ist in den vorliegenden Dokumenten nicht enthalten."
6. Erfinde NIEMALS Informationen.
7. Antworte auf Deutsch, strukturiert mit Aufzaehlungen bei mehreren Punkten.
8. Halte dich kurz und praezise — maximal 3-5 Saetze fuer einfache Fragen.`;
```

### 4.2 Explizite Chunk-Markierung im Kontext

```javascript
// In ragCore.js, buildHierarchicalContext():
// VORHER:
`[1] ${spaceBadge}${categoryBadge}${docName}:\n${chunkText}`
// NACHHER:
`--- DOKUMENT [1]: ${docName} (${spaceName}) ---\n${chunkText}\n--- ENDE DOKUMENT [1] ---`;
```

Klare Markierungen helfen schwachen LLMs, Quellen korrekt zuzuordnen.

### 4.3 Temperatur fuer RAG senken

```javascript
// VORHER:
temperature: 0.7; // Zu hoch fuer faktische Antworten

// NACHHER:
temperature: 0.2; // Deutlich niedriger fuer praezise, faktenbasierte Antworten
```

**Begruendung:** Temperatur 0.7 ist fuer kreative Tasks. RAG-Antworten muessen faktengetreu sein. Benchmarks empfehlen 0.1-0.3.

### 4.4 Response-Laenge begrenzen

```javascript
// VORHER:
num_predict: 32768; // Viel zu hoch fuer RAG — fuehrt zu Halluzination am Ende

// NACHHER fuer RAG:
num_predict: 2048; // Max 2K Tokens fuer RAG-Antworten — verhindert Abschweifen
```

---

## Phase 5: Indexierungs-Performance (MITTEL)

### 5.1 Batch-Indexierung statt Einzeldokument-Scan

```python
# In enhanced_indexer.py:
# VORHER: 1 Dokument pro Scan-Zyklus
# NACHHER: Alle pending Dokumente im Batch

def scan_and_index(self):
    pending_docs = self.db.get_pending_documents(limit=10)  # Bis zu 10 auf einmal
    for doc in pending_docs:
        self.process_document(doc)
```

### 5.2 Scan-Intervall verkuerzen

```yaml
# In compose.ai.yaml:
DOCUMENT_INDEXER_INTERVAL: 30 # Statt 120 Sekunden
```

**Impact:** Dokumente sind in 30-60 Sekunden statt 4-8 Minuten indexiert.

### 5.3 Word-Count bei Indexierung speichern

```python
# In document_processor.py, nach Text-Extraktion:
word_count = len(extracted_text.split())
db.update_document(doc_id, word_count=word_count)
```

---

## Phase 6: Evaluation-Framework (MITTEL)

### 6.1 Automatisierter RAG-Qualitaetstest

Ein Test-Suite mit vordefinierten Frage-Antwort-Paaren:

```javascript
// tests/rag-quality.test.js
const testCases = [
  {
    query: 'Wie viele Urlaubstage haben Mitarbeiter nach 10 Jahren?',
    expectedFacts: ['34 Arbeitstage'],
    expectedSource: 'personalrichtlinie',
    category: 'specific_fact',
  },
  {
    query: 'Was kostet VisionGuard Professional?',
    expectedFacts: ['49.900 EUR', '599 EUR/Monat'],
    expectedSource: 'produktkatalog',
    category: 'numeric_extraction',
  },
  // ... 50+ Test-Cases
];

for (const tc of testCases) {
  const result = await ragQuery(tc.query);

  // Metriken:
  const faithfulness = tc.expectedFacts.every(f => result.response.includes(f));
  const sourceCorrect = result.sources.some(s => s.document_name.includes(tc.expectedSource));
  const hasHallucination = containsUngrounded(result.response, result.sources);

  report.add({ ...tc, faithfulness, sourceCorrect, hasHallucination });
}
```

### 6.2 Metriken-Dashboard

Folgende Metriken im Frontend-Dashboard anzeigen:

- **Retrieval-Quote:** % der Queries, die mindestens 1 relevantes Dokument finden
- **Source-Qualitaet:** Durchschnittlicher Rerank-Score der Top-3 Ergebnisse
- **Antwortlaenge:** Durchschnittliche Antwortlaenge (zu lang = moeglicherweise Halluzination)
- **No-Document-Rate:** % der Queries ohne gefundene Dokumente

---

## Phase 7: Fortgeschrittene Techniken (LANGFRISTIG)

### 7.1 Step-Back Prompting

Fuer komplexe, analytische Fragen eine abstraktere Query generieren:

```javascript
async function stepBackQuery(originalQuery) {
  const prompt = `Formuliere eine allgemeinere, uebergeordnete Frage zu: "${originalQuery}"
  Beispiel: "Wie hoch ist die Bruttomarge Q4?" → "Welche Finanzkennzahlen hat das Unternehmen?"
  Antwort (nur die Frage):`;

  const stepBack = await llm.generate(prompt, { max_tokens: 50, temperature: 0.1 });
  const [originalResults, stepBackResults] = await Promise.all([
    hybridSearch(originalQuery),
    hybridSearch(stepBack),
  ]);
  return mergeAndDeduplicate(originalResults, stepBackResults);
}
```

### 7.2 Query-Routing nach Dokumenttyp

Verschiedene Dokumenttypen benoetigen verschiedene Retrieval-Strategien:

```javascript
function routeByDocumentType(query) {
  if (containsNumbers(query) || containsFinancialTerms(query)) {
    return { top_k: 10, strategy: 'table_aware' }; // Tabellen-lastige Dokumente
  }
  if (containsLegalTerms(query)) {
    return { top_k: 5, strategy: 'paragraph_exact' }; // Exakte Paragraph-Suche
  }
  return { top_k: 8, strategy: 'default' };
}
```

### 7.3 Agentic RAG (Langfristig)

Wenn das LLM function-calling unterstuetzt (Qwen3, Gemma 4):

```javascript
const ragTools = [
  {
    name: 'search_documents',
    description: 'Suche in der Wissensbasis nach relevanten Informationen',
    parameters: { query: 'string', space: 'string', top_k: 'number' },
  },
  {
    name: 'search_specific_section',
    description: 'Suche in einem bestimmten Abschnitt eines Dokuments',
    parameters: { document_name: 'string', section: 'string' },
  },
  {
    name: 'verify_fact',
    description: 'Verifiziere ob eine Aussage in den Dokumenten steht',
    parameters: { claim: 'string' },
  },
];
```

Das LLM entscheidet selbst, wann und wie oft es sucht. Iterative Verfeinerung statt Single-Shot.

### 7.4 FP16 fuer Embedding-Service aktivieren

```yaml
# compose.ai.yaml — bereits vorbereitet aber nicht aktiviert:
EMBEDDING_USE_FP16: 'true' # Halbiert VRAM von ~1.2GB auf ~600MB
```

---

## Implementierungs-Reihenfolge

| Phase                               | Aufwand              | Impact      | Dateien                                  |
| ----------------------------------- | -------------------- | ----------- | ---------------------------------------- |
| **Phase 1: Chunking**               | 2-3h Code + Re-Index | KRITISCH    | `text_chunker.py`, `config.py`           |
| **Phase 3.4: Thresholds**           | 30min                | HOCH        | `ragCore.js`, `.env`                     |
| **Phase 4.3: Temperatur**           | 5min                 | HOCH        | `llmJobProcessor.js`                     |
| **Phase 4.4: Response-Limit**       | 5min                 | HOCH        | `llmJobProcessor.js`                     |
| **Phase 4.1-4.2: Prompts**          | 1h                   | HOCH        | `llmJobProcessor.js`, `ragCore.js`       |
| **Phase 3.1-3.2: Retrieval**        | 2h                   | HOCH        | `ragCore.js`                             |
| **Phase 5: Indexierung**            | 1h                   | MITTEL      | `enhanced_indexer.py`, `compose.ai.yaml` |
| **Phase 2: Kontextuelles Chunking** | 3-4h                 | HOCH        | `document_processor.py`                  |
| **Phase 6: Evaluation**             | 4-6h                 | MITTEL      | Neuer Test-File                          |
| **Phase 7: Fortgeschritten**        | 8-16h                | LANGFRISTIG | Mehrere Files                            |

### Quick Wins (unter 1 Stunde, sofort umsetzbar)

1. `temperature: 0.7 → 0.2` in `llmJobProcessor.js`
2. `num_predict: 32768 → 2048` fuer RAG-Jobs
3. `RAG_RELEVANCE_THRESHOLD: 0.10 → 0.05`
4. `DOCUMENT_INDEXER_INTERVAL: 120 → 30`

### Mittelfristig (1-2 Tage)

1. Child-Chunk-Groesse reduzieren + Markdown-Section-Chunking
2. Prompt-Templates verschaerfen
3. MMR implementieren
4. Re-Indexierung aller Dokumente

### Langfristig (1-2 Wochen)

1. LLM-basierte kontextuelle Chunking-Beschreibungen
2. Evaluation-Framework
3. Agentic RAG
4. Step-Back Prompting

---

## Testergebnisse (Zusammenfassung)

| Test | Frage                                | Ergebnis                     | Problem                                                   |
| ---- | ------------------------------------ | ---------------------------- | --------------------------------------------------------- |
| 1    | Urlaubstage nach 10 Jahren           | BESTANDEN (korrekt: 34 Tage) | Falsche Source-Attribution ([2] statt [1])                |
| 2    | Jahresumsatz + Mitarbeiterzahl       | BESTANDEN (korrekt)          | Source aus Produktkatalog, nicht Quartalsbericht          |
| 3    | VisionGuard Professional Preis + SLA | FEHLGESCHLAGEN               | "Keine Informationen" obwohl im Produktkatalog            |
| 4    | MFA-Methoden                         | BESTANDEN (korrekt)          | Source falsch: [3] Personalrichtlinie statt IT-Sicherheit |
| 5    | Variable Verguetung Stufe 8          | FEHLGESCHLAGEN               | "Keine relevanten Dokumente" — Threshold zu hoch          |
| 6    | Bruttomarge Q4 2025 + EBITDA         | FEHLGESCHLAGEN               | "Keine relevanten Dokumente" — Chunk zu gross             |
| 7    | Psychische Gesundheit                | BESTANDEN (korrekt)          | OK                                                        |
| 8-12 | Diverse Fragen                       | NICHT AUSWERTBAR             | LLM-Queue ueberlastet                                     |

### Root-Cause-Analyse der Fehler

**Test 3 (VisionGuard Preis):** Das Wort "VisionGuard" kommt nur im Produktkatalog vor. Der Chunk, der die Preistabelle enthaelt, ist zu gross (300 Woerter, enthaelt den gesamten VisionGuard-Abschnitt + Teile von VisionAssist). Das Embedding dieses Chunks ist ein Durchschnitt ueber zu viele Themen → niedrige Similarity fuer eine spezifische Preisfrage.

**Test 5 (Variable Verguetung):** Die Information steht im Abschnitt "4.2 Variable Verguetung" der Personalrichtlinie. Dieser Abschnitt ist Teil eines 300-Wort-Chunks, der auch Gehaelter, Benefits und andere Themen abdeckt. Bei der Suche nach "variable Verguetung Stufe 8" ist die Cosine-Similarity mit dem breiten Chunk zu niedrig.

**Test 6 (Bruttomarge/EBITDA):** Die Finanztabellen im Quartalsbericht sind in einem grossen Chunk komprimiert. "Bruttomarge" ist ein einzelnes Wort in einer Tabelle — schwer fuer Embedding-basierte Suche zu finden.

**Gemeinsamer Nenner:** Alle Fehler resultieren aus **zu grossen Chunks**, die zu viele verschiedene Informationen in einem Embedding-Vektor komprimieren. Die Loesung ist kleinere Chunks (Phase 1).

---

_Erstellt: 16. April 2026_
_Basierend auf: 10-Agent-Analyse + 12 End-to-End-Tests_
_Naechste Revision: Nach Implementierung von Phase 1-3_
