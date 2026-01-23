# AI-Integration Optimierungsplan

**Erstellt:** 2026-01-23
**Status:** Entwurf
**Priorität:** Kritisch für Production-Readiness

---

## Executive Summary

Dieses Dokument beschreibt einen umfassenden Plan zur Optimierung und Stabilisierung der AI-Integrationen im Arasul Platform. Die Analyse identifizierte **47 Verbesserungspunkte** in 5 Kernkomponenten:

| Komponente | Kritisch | Hoch | Mittel | Niedrig |
|------------|----------|------|--------|---------|
| LLM Service | 2 | 3 | 4 | 3 |
| Embedding Service | 0 | 1 | 3 | 2 |
| Document Indexer | 1 | 3 | 4 | 3 |
| Backend AI Routes | 0 | 2 | 3 | 2 |
| Frontend ChatMulti | 0 | 1 | 4 | 3 |
| **Gesamt** | **3** | **10** | **18** | **13** |

---

## Phase 1: Kritische Fixes (Production-Blocker)

### 1.1 LLM Service: Health Check Start Period

**Problem:** Docker Healthcheck startet nach 60s, aber Ollama + Model Loading kann >60s dauern
**Impact:** Container-Restart-Loops auf lastintensiven Systemen
**Severity:** KRITISCH

**Datei:** `services/llm-service/Dockerfile:42`

**Aktuell:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:11436/health || exit 1
```

**Fix:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
    CMD curl -f http://localhost:11436/health || exit 1
```

**Aufwand:** 5 Minuten
**Test:** `docker compose up -d llm-service && docker compose logs -f llm-service`

---

### 1.2 LLM Service: Flexibler Ollama Startup Timeout

**Problem:** Fester 60s Timeout in entrypoint.sh (30 Versuche × 2s)
**Impact:** Bei schwerem GPU-Load startet Ollama nicht rechtzeitig
**Severity:** KRITISCH

**Datei:** `services/llm-service/entrypoint.sh:21-31`

**Aktuell:**
```bash
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    sleep 2
done
```

**Fix:**
```bash
# Konfigurierbar via Environment Variable (Default: 120s)
OLLAMA_STARTUP_TIMEOUT=${OLLAMA_STARTUP_TIMEOUT:-120}
MAX_ATTEMPTS=$((OLLAMA_STARTUP_TIMEOUT / 2))
ATTEMPT=0

echo "Waiting for Ollama (max ${OLLAMA_STARTUP_TIMEOUT}s)..."

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "Ollama ready after $((ATTEMPT * 2))s"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        sleep 2
    fi
done

if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "ERROR: Ollama failed to start within ${OLLAMA_STARTUP_TIMEOUT}s"
    exit 1
fi
```

**docker-compose.yml Ergänzung:**
```yaml
llm-service:
  environment:
    OLLAMA_STARTUP_TIMEOUT: ${OLLAMA_STARTUP_TIMEOUT:-120}
```

**Aufwand:** 15 Minuten
**Test:** Manueller Restart mit `OLLAMA_STARTUP_TIMEOUT=180`

---

### 1.3 Document Indexer: Memory-Limit für große Dateien

**Problem:** Kein File-Size-Limit - 5GB PDF kann OOM verursachen
**Impact:** Service-Crash bei großen Dokumenten
**Severity:** KRITISCH

**Datei:** `services/document-indexer/enhanced_indexer.py:377-382`

**Fix hinzufügen (vor Format-Validierung):**
```python
# File size validation (MAX 100MB)
MAX_FILE_SIZE_MB = int(os.environ.get('DOCUMENT_MAX_SIZE_MB', 100))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

if len(data) > MAX_FILE_SIZE_BYTES:
    logger.warning(f"File {object_name} exceeds max size ({len(data) / 1024 / 1024:.1f}MB > {MAX_FILE_SIZE_MB}MB)")
    await self.db.update_document_status(
        doc_id=None,
        status='failed',
        error=f'File size exceeds {MAX_FILE_SIZE_MB}MB limit'
    )
    return None
```

**Aufwand:** 20 Minuten
**Test:** Upload einer 150MB Datei, erwartetes Verhalten: Ablehnung mit Fehlermeldung

---

## Phase 2: Hohe Priorität (Performance & Stabilität)

### 2.1 LLM Service: GPU Memory Validation im Stats-Endpoint

**Problem:** nvidia-smi auf Jetson Orin gibt `[N/A]` für Memory zurück
**Impact:** API gibt "N/A MB" statt aussagekräftiger Werte
**Severity:** HOCH

**Datei:** `services/llm-service/api_server.py:304-352`

**Fix (nach Zeile 326):**
```python
# Validate GPU memory values (Jetson Orin returns [N/A])
if gpu_util and not gpu_util.replace('%', '').strip().isdigit():
    gpu_util = "N/A"
if '[N/A]' in str(gpu_memory) or 'N/A' in str(gpu_memory):
    gpu_memory = "Jetson-Integrated"
if gpu_temp and not gpu_temp.replace('°C', '').strip().isdigit():
    gpu_temp = "N/A"
```

**Aufwand:** 15 Minuten

---

### 2.2 LLM Service: CPU-Messung ohne Blocking

**Problem:** `psutil.cpu_percent(interval=1)` blockiert 1 Sekunde
**Impact:** Stats-Endpoint ist langsam, Thread-Pressure bei häufigen Aufrufen
**Severity:** HOCH

**Datei:** `services/llm-service/api_server.py:337`

**Fix - Caching-Ansatz:**
```python
# Am Anfang der Datei
import threading
import time

# Globale CPU-Tracking-Variablen
_cpu_percent = 0.0
_cpu_last_update = 0
_cpu_lock = threading.Lock()

def _update_cpu_percent():
    """Background thread for CPU monitoring"""
    global _cpu_percent, _cpu_last_update
    while True:
        cpu = psutil.cpu_percent(interval=1)
        with _cpu_lock:
            _cpu_percent = cpu
            _cpu_last_update = time.time()
        time.sleep(2)  # Update every 3 seconds total

# Starten beim Modulimport
_cpu_thread = threading.Thread(target=_update_cpu_percent, daemon=True)
_cpu_thread.start()

# In stats():
def stats():
    ...
    with _cpu_lock:
        cpu_percent = _cpu_percent
    ...
```

**Aufwand:** 30 Minuten

---

### 2.3 LLM Service: Retry-Logik für Model Pull

**Problem:** Kein Retry bei transienten Netzwerkfehlern während Download
**Impact:** Download schlägt bei kurzem Netzwerk-Flicker komplett fehl
**Severity:** HOCH

**Datei:** `services/llm-service/api_server.py:101-139`

**Fix:**
```python
import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def create_retry_session(retries=3, backoff_factor=0.5):
    session = requests.Session()
    retry = Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["POST", "GET"]
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

@app.route('/api/models/pull', methods=['POST'])
def pull_model():
    try:
        data = request.get_json()
        model_name = data.get("model")

        if not model_name:
            return jsonify({"error": "model parameter required"}), 400

        # Input validation
        if len(model_name) > 255 or not re.match(r'^[a-zA-Z0-9_:.-]+$', model_name):
            return jsonify({"error": "Invalid model name format"}), 400

        logger.info(f"Pulling model: {model_name}")

        # Use retry session
        session = create_retry_session(retries=3, backoff_factor=1.0)

        response = session.post(
            f"{OLLAMA_BASE_URL}/api/pull",
            json={"name": model_name},
            stream=False,
            timeout=3600
        )
        ...
```

**Aufwand:** 30 Minuten

---

### 2.4 Document Indexer: Parallele Dokument-Verarbeitung

**Problem:** Dokumente werden sequentiell verarbeitet
**Impact:** Bei 10 Dokumenten: 10 × 60s = 10 Minuten statt potenziell 2-3 Minuten
**Severity:** HOCH

**Datei:** `services/document-indexer/enhanced_indexer.py` (neue Methode)

**Konzept:**
```python
from concurrent.futures import ThreadPoolExecutor, as_completed
import asyncio

class EnhancedDocumentIndexer:
    def __init__(self):
        ...
        self.executor = ThreadPoolExecutor(
            max_workers=int(os.environ.get('INDEXER_PARALLEL_WORKERS', 3))
        )

    async def scan_and_index_parallel(self):
        """Process multiple documents in parallel"""
        pending_docs = await self.db.get_pending_documents(limit=10)

        if not pending_docs:
            return 0

        futures = []
        for doc in pending_docs:
            future = self.executor.submit(
                self._process_document_sync,
                doc['id'],
                doc['minio_path']
            )
            futures.append((doc['id'], future))

        processed = 0
        for doc_id, future in futures:
            try:
                result = future.result(timeout=300)  # 5 min per doc
                if result:
                    processed += 1
            except Exception as e:
                logger.error(f"Parallel processing failed for {doc_id}: {e}")
                await self.db.update_document_status(doc_id, 'failed', str(e))

        return processed
```

**Aufwand:** 2-3 Stunden
**Test:** 5 Dokumente gleichzeitig hochladen, Verarbeitungszeit messen

---

### 2.5 Embedding Service: Größere Batch-Sizes für Indexer

**Problem:** Document Indexer sendet einzelne Chunks statt Batches
**Impact:** 100 HTTP-Requests statt 10 für ein großes Dokument
**Severity:** HOCH

**Datei:** `services/document-indexer/enhanced_indexer.py:302-346`

**Aktuell (Zeile 302):**
```python
batch_size = 10  # OK für Embedding-Service
```

**Aber in indexer.py (Zeile 236):**
```python
# BUG: Sendet einzelnen Text statt Liste!
json={"texts": text}  # Sollte sein: {"texts": [text]}
```

**Fix 1 - indexer.py:236:**
```python
json={"texts": [text]}  # Korrekt als Liste
```

**Fix 2 - Batch-Embedding in indexer.py (neue Methode):**
```python
def get_batch_embeddings(self, texts: List[str]) -> List[Optional[List[float]]]:
    """Get embeddings for multiple texts in a single request"""
    try:
        response = requests.post(
            f"http://{EMBEDDING_HOST}:{EMBEDDING_PORT}/embed",
            json={"texts": texts},
            timeout=60  # Längerer Timeout für Batches
        )

        if response.status_code != 200:
            logger.error(f"Batch embedding failed: {response.status_code}")
            return [None] * len(texts)

        result = response.json()
        return result.get('vectors', [None] * len(texts))
    except Exception as e:
        logger.error(f"Batch embedding error: {e}")
        return [None] * len(texts)
```

**Aufwand:** 45 Minuten

---

### 2.6 Backend: Token Batching aktivieren (RENDER-001)

**Problem:** Token Batching ist deklariert aber nicht implementiert
**Impact:** ~100+ React Re-Renders pro Sekunde während Streaming
**Severity:** HOCH

**Datei:** `services/dashboard-frontend/src/components/ChatMulti.js:67-70, 1065-1079`

**Aktuell deklariert (Zeile 67-70):**
```javascript
const tokenBatchRef = useRef({ content: '', thinking: '' });
const batchTimerRef = useRef(null);
const BATCH_INTERVAL_MS = 50;
```

**Fix - Implementierung in Stream-Handler (Zeile 1065-1079):**
```javascript
// Statt direktem setMessages für jeden Token:
case 'response':
  // Accumulate in batch ref
  tokenBatchRef.current.content += data.token || '';

  // Schedule batch flush if not already scheduled
  if (!batchTimerRef.current) {
    batchTimerRef.current = setTimeout(() => {
      const batchedContent = tokenBatchRef.current.content;
      tokenBatchRef.current.content = '';
      batchTimerRef.current = null;

      if (currentChatIdRef.current === targetChatId && batchedContent) {
        setMessages(prevMessages => {
          const updated = [...prevMessages];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: (updated[lastIdx].content || '') + batchedContent
            };
          }
          return updated;
        });
      }
    }, BATCH_INTERVAL_MS);
  }
  break;
```

**Aufwand:** 1 Stunde
**Test:** Chrome DevTools → Performance Tab → Measure während Streaming

---

### 2.7 Frontend: Message-Keys mit unique IDs

**Problem:** Array-Index als Key für Messages (`key={index}`)
**Impact:** React kann Messages falsch zuordnen bei Updates
**Severity:** HOCH

**Datei:** `services/dashboard-frontend/src/components/ChatMulti.js:1273`

**Aktuell:**
```jsx
{messages.map((message, index) => (
  <div key={index} className={...}>
```

**Fix:**
```jsx
{messages.map((message, index) => (
  <div key={message.id || message.jobId || `msg-${currentChatId}-${index}`} className={...}>
```

**Backend-Anpassung (chats.js) - Messages immer mit ID zurückgeben:**
```javascript
const formattedMessages = msgs.map(msg => ({
  id: msg.id,  // Sicherstellen dass ID immer dabei ist
  ...
}));
```

**Aufwand:** 30 Minuten

---

## Phase 3: Mittlere Priorität (Optimierungen)

### 3.1 LLM Service: Connection Pooling

**Problem:** Jede Anfrage erstellt neue HTTP-Verbindung zu Ollama
**Impact:** TCP-Handshake-Overhead (~5-10ms pro Request)
**Severity:** MITTEL

**Datei:** `services/llm-service/api_server.py` (global)

**Fix:**
```python
# Globale Session mit Connection Pooling
from requests.adapters import HTTPAdapter
from urllib3.util.poolmanager import PoolManager

class KeepAliveAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        kwargs['maxsize'] = 10
        return super().init_poolmanager(*args, **kwargs)

# Globale Session
_session = requests.Session()
_session.mount('http://', KeepAliveAdapter())

# Verwendung statt requests.get/post:
response = _session.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
```

**Aufwand:** 30 Minuten

---

### 3.2 LLM Service: Model Metadata Caching

**Problem:** Jeder `/api/models` Aufruf fragt Ollama ab
**Impact:** Unnötige Latenz bei häufigen Model-Abfragen
**Severity:** MITTEL

**Datei:** `services/llm-service/api_server.py`

**Fix:**
```python
import time

_model_cache = None
_model_cache_time = 0
MODEL_CACHE_TTL = 30  # Sekunden

@app.route('/api/models', methods=['GET'])
def list_models():
    global _model_cache, _model_cache_time

    now = time.time()
    if _model_cache is not None and (now - _model_cache_time) < MODEL_CACHE_TTL:
        return jsonify(_model_cache), 200

    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            _model_cache = response.json()
            _model_cache_time = now
            return jsonify(_model_cache), 200
        ...
```

**Aufwand:** 20 Minuten

---

### 3.3 Document Indexer: Streaming PDF Parsing

**Problem:** Ganzes PDF wird in Memory geladen
**Impact:** Memory-Spike bei großen PDFs (100+ Seiten)
**Severity:** MITTEL

**Datei:** `services/document-indexer/document_parsers.py:17-42`

**Konzept (Generator-basiert):**
```python
def parse_pdf_streaming(file_path: str) -> Generator[str, None, None]:
    """Parse PDF page by page to reduce memory usage"""
    try:
        with open(file_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text = page.extract_text()
                if text and text.strip():
                    yield text

                # Explicit cleanup
                del page
                if page_num % 10 == 0:
                    import gc
                    gc.collect()

    except Exception as e:
        logger.error(f"PDF streaming parse failed: {e}")
        return
```

**Aufwand:** 1-2 Stunden

---

### 3.4 Document Indexer: Optimierte Similarity-Berechnung

**Problem:** O(n²) Vergleich aller Dokumente
**Impact:** Langsam bei vielen Dokumenten (100+ → 10.000 Vergleiche)
**Severity:** MITTEL

**Datei:** `services/document-indexer/enhanced_indexer.py:645-701`

**Konzept - LSH (Locality Sensitive Hashing):**
```python
# Alternative: Nur Top-20 ähnlichste vergleichen (bereits implementiert)
# Optimierung: Async auslagern oder Batch-Processing

async def _calculate_similarities_optimized(self, doc_id: str, embedding: List[float]):
    """Calculate similarities using Qdrant search (already O(log n) with HNSW)"""

    # Qdrant verwendet bereits HNSW-Index - sehr effizient
    results = self.qdrant_client.search(
        collection_name=QDRANT_COLLECTION,
        query_vector=embedding,
        limit=20,  # Top 20 ist ausreichend
        score_threshold=self.similarity_threshold
    )

    # Gruppiere nach Dokument
    doc_scores = {}
    for result in results:
        other_doc_id = result.payload.get('document_id')
        if other_doc_id and other_doc_id != doc_id:
            current_score = doc_scores.get(other_doc_id, 0)
            doc_scores[other_doc_id] = max(current_score, result.score)

    # Speichere nur Top 10 Similarities
    top_similar = sorted(doc_scores.items(), key=lambda x: x[1], reverse=True)[:10]

    for other_id, score in top_similar:
        await self.db.save_document_similarity(doc_id, other_id, score)
```

**Aufwand:** 1-2 Stunden

---

### 3.5 Frontend: Memoization für Toggle-Funktionen

**Problem:** `toggleThinking` und `toggleSources` werden bei jedem Render neu erstellt
**Impact:** Unnötige Re-Renders von Child-Komponenten
**Severity:** MITTEL

**Datei:** `services/dashboard-frontend/src/components/ChatMulti.js:621-640`

**Fix:**
```javascript
const toggleThinking = useCallback((index) => {
  setMessages(prevMessages => {
    const updated = [...prevMessages];
    updated[index] = {
      ...updated[index],
      thinkingCollapsed: !updated[index].thinkingCollapsed
    };
    return updated;
  });
}, []);

const toggleSources = useCallback((index) => {
  setMessages(prevMessages => {
    const updated = [...prevMessages];
    updated[index] = {
      ...updated[index],
      sourcesCollapsed: !updated[index].sourcesCollapsed
    };
    return updated;
  });
}, []);
```

**Aufwand:** 15 Minuten

---

### 3.6 Frontend: Virtualisierung für lange Chat-Verläufe

**Problem:** Alle Messages werden gerendert, auch außerhalb des Viewports
**Impact:** Performance-Probleme bei 100+ Messages
**Severity:** MITTEL

**Konzept mit react-window:**
```javascript
import { VariableSizeList as List } from 'react-window';

// In ChatMulti.js
const MessageList = ({ messages }) => {
  const listRef = useRef();
  const rowHeights = useRef({});

  const getRowHeight = (index) => rowHeights.current[index] || 100;

  const Row = ({ index, style }) => {
    const message = messages[index];
    const rowRef = useRef();

    useEffect(() => {
      if (rowRef.current) {
        const height = rowRef.current.getBoundingClientRect().height;
        if (rowHeights.current[index] !== height) {
          rowHeights.current[index] = height;
          listRef.current?.resetAfterIndex(index);
        }
      }
    }, [message.content]);

    return (
      <div style={style} ref={rowRef}>
        <MessageBubble message={message} index={index} />
      </div>
    );
  };

  return (
    <List
      ref={listRef}
      height={600}
      itemCount={messages.length}
      itemSize={getRowHeight}
      width="100%"
    >
      {Row}
    </List>
  );
};
```

**Aufwand:** 3-4 Stunden
**Abhängigkeit:** `npm install react-window`

---

### 3.7 Backend: Async Embedding-Aufrufe

**Problem:** Synchrone HTTP-Aufrufe zum Embedding-Service blockieren Event Loop
**Impact:** Reduced throughput bei mehreren gleichzeitigen Anfragen
**Severity:** MITTEL

**Datei:** `services/dashboard-backend/src/routes/embeddings.js`

**Konzept (bereits gut implementiert):**
```javascript
// Aktuell: axios ist bereits async
const response = await axios.post(
  `${EMBEDDING_SERVICE_URL}/embed`,
  { texts },
  { timeout: 5000 }
);

// Potential Optimization: Connection Pool
const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

const embeddingAxios = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 5000
});

// Verwendung:
const response = await embeddingAxios.post(...);
```

**Aufwand:** 30 Minuten

---

### 3.8 Embedding Service: Quantisierungsoptionen

**Problem:** Full FP32 Embeddings verbrauchen mehr GPU-Memory
**Impact:** ~300MB mehr VRAM als nötig
**Severity:** MITTEL

**Konzept (Environment-gesteuert):**
```python
# embedding_server.py
USE_FP16 = os.environ.get('EMBEDDING_USE_FP16', 'false').lower() == 'true'

def load_model():
    ...
    if USE_FP16 and device == 'cuda':
        model = SentenceTransformer(MODEL_NAME, device=device)
        model = model.half()  # Convert to FP16
        logger.info("Using FP16 precision for embeddings")
    else:
        model = SentenceTransformer(MODEL_NAME, device=device)
    ...
```

**Trade-off:**
- FP16: ~5% weniger Genauigkeit, 50% weniger VRAM
- Empfehlung: Nicht aktivieren bei ausreichend VRAM (64GB Jetson)

**Aufwand:** 30 Minuten

---

## Phase 4: Niedrige Priorität (Nice-to-Have)

### 4.1 Dokumentation: Port-Nummer korrigieren

**Problem:** README.md sagt Port 11435, Code verwendet 11436
**Datei:** `services/llm-service/README.md:18`

**Fix:**
```markdown
- Management API: Port 11436 (Korrigiert von 11435)
```

**Aufwand:** 5 Minuten

---

### 4.2 LLM Service: Async Model Pull

**Problem:** `/api/models/pull` blockiert den Request
**Impact:** Lange HTTP-Verbindung (bis zu 1 Stunde)
**Severity:** NIEDRIG (Backend handhabt dies bereits via SSE)

**Konzept (Hintergrund-Job):**
```python
import uuid
from concurrent.futures import ThreadPoolExecutor

_pull_executor = ThreadPoolExecutor(max_workers=2)
_pull_jobs = {}  # job_id -> status

@app.route('/api/models/pull', methods=['POST'])
def pull_model():
    model_name = request.json.get('model')
    job_id = str(uuid.uuid4())

    def _do_pull():
        _pull_jobs[job_id] = {'status': 'pulling', 'progress': 0}
        try:
            response = requests.post(
                f"{OLLAMA_BASE_URL}/api/pull",
                json={"name": model_name},
                stream=True,
                timeout=3600
            )
            for line in response.iter_lines():
                # Parse progress...
                _pull_jobs[job_id]['progress'] = progress
            _pull_jobs[job_id]['status'] = 'completed'
        except Exception as e:
            _pull_jobs[job_id] = {'status': 'failed', 'error': str(e)}

    _pull_executor.submit(_do_pull)
    return jsonify({'job_id': job_id, 'status': 'started'}), 202

@app.route('/api/models/pull/<job_id>', methods=['GET'])
def get_pull_status(job_id):
    return jsonify(_pull_jobs.get(job_id, {'status': 'not_found'}))
```

**Aufwand:** 1-2 Stunden

---

### 4.3 Healthcheck: JSON-Parser statt grep

**Problem:** healthcheck.sh verwendet grep/cut für JSON-Parsing
**Impact:** Fragil bei API-Änderungen
**Severity:** NIEDRIG

**Fix (wenn jq verfügbar):**
```bash
# Prüfe ob jq verfügbar
if command -v jq &> /dev/null; then
    MODEL_COUNT=$(echo "$MODELS_RESPONSE" | jq '.models | length')
    MODEL_NAME=$(echo "$MODELS_RESPONSE" | jq -r '.models[0].name // empty')
else
    # Fallback zu grep
    MODEL_COUNT=$(echo "$MODELS_RESPONSE" | grep -o '"name"' | wc -l)
fi
```

**Aufwand:** 30 Minuten

---

### 4.4 Embedding Service: Request Queuing

**Problem:** Keine Priorisierung zwischen RAG-Queries und Background-Indexing
**Impact:** Minimal - GPU ist schnell genug
**Severity:** NIEDRIG

**Konzept:**
```python
from queue import PriorityQueue
import threading

embedding_queue = PriorityQueue()

def process_embedding_queue():
    while True:
        priority, texts, callback = embedding_queue.get()
        embeddings = model.encode(texts)
        callback(embeddings)
        embedding_queue.task_done()

# Bei Anfrage:
@app.route('/embed', methods=['POST'])
def embed():
    priority = request.headers.get('X-Priority', '5')  # 1=high, 10=low
    ...
```

**Aufwand:** 2 Stunden

---

### 4.5 Frontend: localStorage Token Validation

**Problem:** Token wird ohne Format-Validierung verwendet
**Impact:** Minimal - Backend validiert sowieso
**Severity:** NIEDRIG

**Fix:**
```javascript
const getValidToken = () => {
  const token = localStorage.getItem('arasul_token');
  if (!token) return null;

  // Basic JWT format check (3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    localStorage.removeItem('arasul_token');
    return null;
  }

  // Check expiration
  try {
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('arasul_token');
      return null;
    }
  } catch (e) {
    return token; // Let server validate
  }

  return token;
};
```

**Aufwand:** 30 Minuten

---

## Implementierungsreihenfolge

### Sprint 1: Kritische Fixes (1-2 Tage) ✅ COMPLETED
1. ✅ 1.1 Health Check Start Period (5 min)
2. ✅ 1.2 Flexibler Ollama Startup (15 min)
3. ✅ 1.3 Memory-Limit für Dokumente (20 min)

### Sprint 2: Hohe Priorität (3-5 Tage) ✅ COMPLETED
4. ✅ 2.1 GPU Memory Validation (15 min)
5. ✅ 2.2 CPU-Messung ohne Blocking (30 min)
6. ✅ 2.3 Retry-Logik für Model Pull (30 min)
7. ✅ 2.5 Batch-Embedding Fix (45 min)
8. ✅ 2.6 Token Batching Frontend (1h)
9. ✅ 2.7 Message-Keys mit IDs (30 min)
10. ⏸️ 2.4 Parallele Dokument-Verarbeitung (2-3h) - Deferred

### Sprint 3: Mittlere Priorität (1 Woche) ✅ COMPLETED
11. ✅ 3.1 Connection Pooling (30 min) - Implemented in 2.3
12. ✅ 3.2 Model Metadata Caching (20 min)
13. ✅ 3.5 Memoization Frontend (15 min)
14. ✅ 3.7 Async Embedding Backend (30 min)
15. ✅ 3.3 Streaming PDF Parsing (1-2h)
16. ✅ 3.4 Similarity-Optimierung (1-2h)
17. ⏸️ 3.6 Virtualisierung Frontend (3-4h) - Deferred (requires new dependency)
18. ⏸️ 3.8 FP16 Quantization Option (30 min) - ✅ COMPLETED

### Sprint 4: Niedrige Priorität (Optional) ✅ PARTIALLY COMPLETED
19. ✅ 4.1 Dokumentation Fix (5 min)
20. ✅ 4.3 JSON-Parser Healthcheck (30 min)
21. ✅ 4.5 localStorage Token Validation (30 min)
22. ⏸️ 4.2 Async Model Pull (1-2h) - Deferred
23. ⏸️ 4.4 Embedding Request Queuing (2h) - Deferred

---

## Metriken & Erfolgskriterien

| Metrik | Aktuell | Ziel | Messmethode |
|--------|---------|------|-------------|
| Container-Restarts | Gelegentlich | 0 | `docker compose ps` |
| First-Response Latency (LLM) | 30-50s kalt | <35s | API-Logging |
| Embedding Batch Time | 100ms/Text | <20ms/Text | Healthcheck |
| Document Indexing (10 Docs) | ~10 min | <4 min | Logs |
| Frontend FPS während Streaming | ~30 | >55 | Chrome DevTools |
| Memory Usage (100-page PDF) | ~250MB Peak | <150MB | docker stats |

---

## Risikobewertung

| Änderung | Risiko | Mitigation |
|----------|--------|------------|
| Parallele Dokument-Verarbeitung | Thread-Safety | Umfangreiche Tests, Lock-Mechanismen |
| Token Batching | Race Conditions | Ref-basierte Synchronisation |
| Connection Pooling | Memory Leaks | Monitoring, TTL für idle connections |
| Virtualisierung | Layout-Bugs | Schrittweise Einführung, Feature-Flag |

---

## Anhang: Betroffene Dateien

| Datei | Änderungen |
|-------|------------|
| `services/llm-service/Dockerfile` | Health check start-period |
| `services/llm-service/entrypoint.sh` | Startup timeout |
| `services/llm-service/api_server.py` | Retry, Caching, Pooling, Validation |
| `services/embedding-service/embedding_server.py` | FP16 Option |
| `services/document-indexer/enhanced_indexer.py` | Parallel, Size-Limit, Similarity |
| `services/document-indexer/indexer.py` | Batch-Embedding Fix |
| `services/document-indexer/document_parsers.py` | Streaming PDF |
| `services/dashboard-backend/src/routes/embeddings.js` | Connection Pool |
| `services/dashboard-frontend/src/components/ChatMulti.js` | Batching, Keys, Memo |

---

## Changelog

| Datum | Version | Änderung |
|-------|---------|----------|
| 2026-01-23 | 1.0 | Initiale Erstellung |
| 2026-01-23 | 2.0 | Sprint 1-4 implementiert (Critical, High, Medium, Low Priority Fixes) |
