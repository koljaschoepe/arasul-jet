# Context Management Plan - Arasul Platform

> Inspiriert von OpenClaws innovativem Context-Management-System, angepasst fuer
> lokale LLMs auf NVIDIA Jetson AGX Orin mit begrenzten Ressourcen.

---

## Inhaltsverzeichnis

1. [Uebersicht & Vision](#1-uebersicht--vision)
2. [Architektur: Tiered Memory Injection](#2-architektur-tiered-memory-injection)
3. [Phase 1: Token-Infrastruktur](#phase-1-token-infrastruktur)
4. [Phase 2: Dynamischer Context Budget Manager](#phase-2-dynamischer-context-budget-manager)
5. [Phase 3: Conversation Compaction](#phase-3-conversation-compaction)
6. [Phase 4: Pre-Compaction Memory Flush](#phase-4-pre-compaction-memory-flush)
7. [Phase 5: Persistent Memory System (MinIO)](#phase-5-persistent-memory-system-minio)
8. [Phase 6: Pruning (Tool-Result Trimming)](#phase-6-pruning-tool-result-trimming)
9. [Phase 7: Setup Wizard Integration](#phase-7-setup-wizard-integration)
10. [Phase 8: Memory Settings UI](#phase-8-memory-settings-ui)
11. [Phase 9: Ollama-Optimierung](#phase-9-ollama-optimierung)
12. [Datenbank-Migrationen](#datenbank-migrationen)
13. [API-Endpunkte](#api-endpunkte)
14. [Implementierungsreihenfolge](#implementierungsreihenfolge)

---

## 1. Uebersicht & Vision

### Problem

Das aktuelle System hat **kein Context-Window-Management**:

- Dashboard-Chat sendet ALLE Nachrichten an Ollama ohne Token-Limit
- Kein `num_ctx` pro Request → Ollama nutzt unkontrollierte Defaults
- Kein Token-Counting → Context-Overflow wird nicht erkannt
- Keine Zusammenfassung → Lange Chats versagen ohne Warnung
- Kein Langzeit-Gedaechtnis → Jeder Chat startet bei Null

### Loesung: 4-Saeulen-System

```
┌──────────────────────────────────────────────────────────────────┐
│                    CONTEXT MANAGEMENT SYSTEM                      │
├──────────────┬───────────────┬──────────────┬────────────────────┤
│  TOKEN       │  COMPACTION   │  PERSISTENT  │  PRUNING           │
│  COUNTING    │               │  MEMORY      │                    │
│              │               │              │                    │
│  Dynamische  │  Auto-        │  Langzeit-   │  Alte Tool-        │
│  Budget-     │  Zusammen-    │  Gedaechtnis │  Ergebnisse        │
│  Verwaltung  │  fassung bei  │  ueber       │  entfernen,        │
│  pro Modell  │  70% Fuell-   │  Sessions    │  Thinking-Blocks   │
│              │  stand        │  hinweg      │  komprimieren      │
│              │               │  (MinIO)     │                    │
└──────────────┴───────────────┴──────────────┴────────────────────┘
```

### Kern-Innovation: Tiered Memory Injection

Statt das gesamte Memory in den Kontext zu kippen (wie bei OpenClaw mit
grossen Cloud-Modellen), nutzen wir ein **3-Stufen-System** das maximal
**10-15% des Context-Windows** verbraucht:

| Tier | Inhalt                      | Tokens        | Injektion         |
| ---- | --------------------------- | ------------- | ----------------- |
| T1   | Ultra-Kompakt-Profil (YAML) | 100-200       | IMMER             |
| T2   | Relevante Memory-Snippets   | 200-400       | Semantische Suche |
| T3   | Conversation Summary        | 200-500       | Nur nach Compact  |
| ---  | **Gesamt Memory-Overhead**  | **max ~1000** | **~12% von 8K**   |

Vergleich mit OpenClaw: OpenClaw nutzt bis zu 35.600 Tokens fuer Bootstrap-
Dateien allein. Das ist bei 200K Context-Windows kein Problem - bei unseren
8K-32K aber toedlich. Unser System ist 35x kompakter.

---

## 2. Architektur: Tiered Memory Injection

### Token-Budget-Verteilung (Beispiel: 8192 Tokens)

```
┌─────────────────────────────────────────────────┐
│ TOTAL CONTEXT BUDGET: 8192 Tokens               │
│ (dynamisch via /api/show pro Modell)             │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌─ System Prompt ─────────────┐  ~200 Tokens   │
│  │  Rollenanweisung, Regeln    │  (2.4%)        │
│  └─────────────────────────────┘                 │
│                                                  │
│  ┌─ Tier 1: Profil (YAML) ────┐  ~150 Tokens   │
│  │  Firma, Branche, Praefs    │  (1.8%)        │
│  └─────────────────────────────┘                 │
│                                                  │
│  ┌─ Tier 2: Relevante Memories┐  ~300 Tokens   │
│  │  Top 2-3 per Semantic Search│  (3.7%)        │
│  └─────────────────────────────┘                 │
│                                                  │
│  ┌─ Tier 3: Conv. Summary ────┐  ~400 Tokens   │
│  │  (nur wenn kompaktiert)     │  (4.9%)        │
│  └─────────────────────────────┘                 │
│                                                  │
│  ┌─ RAG Context ──────────────┐  0-2000 Tokens  │
│  │  (nur bei RAG-Queries)      │  (0-24%)       │
│  └─────────────────────────────┘                 │
│                                                  │
│  ┌─ Conversation History ─────┐  DYNAMISCH      │
│  │  Letzte 6-8 Nachrichten     │  ~3000 Tokens  │
│  │  (fuellt den Rest)          │  (37%)         │
│  └─────────────────────────────┘                 │
│                                                  │
│  ┌─ Response Reserve ─────────┐  2048 Tokens    │
│  │  Platz fuer die Antwort     │  (25%)         │
│  └─────────────────────────────┘                 │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Vergleich: 8K vs 32K Modelle

| Komponente            | 8K CTX   | 32K CTX   | Anpassung        |
| --------------------- | -------- | --------- | ---------------- |
| System Prompt         | 200      | 200       | Fix              |
| Tier 1 (Profil)       | 150      | 150       | Fix              |
| Tier 2 (Memories)     | 200      | 400       | +1 Snippet       |
| Tier 3 (Summary)      | 300      | 600       | Detaillierter    |
| RAG Context           | 1500     | 8000      | Mehr Chunks      |
| Conversation History  | 3500     | 18500     | Mehr Nachrichten |
| Response Reserve      | 2048     | 4096      | Groesser         |
| **Total**             | **7898** | **31946** |                  |
| **Memory-Overhead %** | **~8%**  | **~4%**   | Skaliert gut     |

---

## Phase 1: Token-Infrastruktur

### Ziel

Token-Counting + dynamische Model-Context-Erkennung einbauen.

### 1.1 Neuer Service: `tokenService.js`

**Datei:** `services/dashboard-backend/src/services/tokenService.js`

```javascript
// Tiered Token-Counting:
// 1. Ollama /api/tokenize (wenn verfuegbar, exakt)
// 2. Heuristik chars/4 (Fallback, ~90% genau)

module.exports = {
  estimateTokens(text),           // Schnelle Schaetzung
  countTokensExact(model, text),  // Via Ollama API
  fitsInBudget(text, budget),     // Budget-Check
};
```

**Implementierungsdetails:**

- `/api/tokenize` Feature-Detection beim Start (einmal testen, Ergebnis cachen)
- Fallback: `Math.ceil(text.length / 4)` (bereits in `telegramLLMService.js:37-40`)
- Zusaetzlich: Wort-basierte Korrektur fuer deutschen Text: `words * 1.3`
- Kein externes npm-Paket noetig - die eingebaute Heuristik reicht fuer das
  Budget-Management (wir brauchen keine 100% Genauigkeit, ~90% reicht)

### 1.2 Neuer Service: `modelContextService.js`

**Datei:** `services/dashboard-backend/src/services/modelContextService.js`

```javascript
// Dynamische Context-Window-Erkennung pro Modell
// Cached Ergebnisse fuer 10 Minuten (Model-Wechsel selten)

module.exports = {
  getModelContextSize(modelName),     // /api/show → context_length
  getEffectiveBudget(modelName),      // context_length - response_reserve
  getTokenBudget(modelName),          // Aufgeschluesselt nach Komponenten
};
```

**Implementierungsdetails:**

- Ruft Ollama `/api/show` auf und extrahiert `context_length` aus `model_info`
- Cache mit 10-Minuten-TTL (LRU-Map, max 10 Eintraege)
- Fallback-Werte falls `/api/show` fehlschlaegt:
  - Qwen3: 32768
  - Llama3.1: 8192
  - Mistral: 32768
  - Default: 4096
- Gibt strukturiertes Budget-Objekt zurueck:

```javascript
{
  contextWindow: 32768,          // Vom Modell
  systemPrompt: 200,             // Fix
  tier1Memory: 150,              // Fix (Profil)
  tier2Memory: 300,              // Dynamisch (2-3 Snippets)
  tier3Summary: 400,             // Dynamisch (Compaction-Ergebnis)
  responseReserve: 2048,         // Konfigurierbar
  availableForHistory: 29670,    // Rest fuer Conversation
  compactionThreshold: 0.70,     // 70% Trigger
}
```

### 1.3 Aenderungen an bestehenden Dateien

**`llmQueueService.js`** - Ollama-Response-Metadaten auslesen:

- In `streamFromOllama()` bei `data.done === true`:
  - `data.prompt_eval_count` → tatsaechliche Input-Tokens
  - `data.eval_count` → tatsaechliche Output-Tokens
  - In `llm_jobs` Tabelle speichern (neue Spalten)

**`docker-compose.yml`** - Ollama Environment:

- `OLLAMA_FLASH_ATTENTION=1` hinzufuegen
- `OLLAMA_KV_CACHE_TYPE=q8_0` hinzufuegen (halbiert KV-Cache-Speicher)
- `OLLAMA_NUM_PARALLEL=1` hinzufuegen (Queue regelt das bereits)

### Dateien

| Aktion  | Datei                                                            |
| ------- | ---------------------------------------------------------------- |
| NEU     | `services/dashboard-backend/src/services/tokenService.js`        |
| NEU     | `services/dashboard-backend/src/services/modelContextService.js` |
| AENDERN | `services/dashboard-backend/src/services/llmQueueService.js`     |
| AENDERN | `docker-compose.yml`                                             |

---

## Phase 2: Dynamischer Context Budget Manager

### Ziel

Vor jedem LLM-Call: Token-Budget berechnen, History trimmen, Compaction triggern.

### 2.1 Neuer Service: `contextBudgetManager.js`

**Datei:** `services/dashboard-backend/src/services/contextBudgetManager.js`

Dies ist das **Herzs des Systems**. Der Budget Manager wird vor jedem
LLM-Aufruf in `llmQueueService.js` aufgerufen.

```javascript
module.exports = {
  // Hauptfunktion: Baut den optimierten Prompt
  async buildOptimizedPrompt({
    messages,           // Alle Nachrichten der Conversation
    systemPrompt,       // System-Anweisung
    model,              // Aktuelles Modell
    conversationId,     // Fuer Compaction-Lookup
    ragContext,         // Optional: RAG-Kontext
    userId,             // Fuer Memory-Lookup
  }),

  // Gibt zurueck:
  // {
  //   prompt: string,              // Fertiger Prompt
  //   systemPrompt: string,        // System + Tier1 + Tier2
  //   messages: array,             // Getrimmte Messages
  //   compacted: boolean,          // Wurde kompaktiert?
  //   tokenBreakdown: {            // Debug-Info
  //     system: 200,
  //     tier1: 150,
  //     tier2: 280,
  //     tier3: 0,
  //     rag: 1200,
  //     history: 3500,
  //     total: 5330,
  //     budget: 6144,
  //     utilization: 0.87,
  //   }
  // }
};
```

**Algorithmus:**

```
1. getModelContextSize(model) → contextWindow
2. budget = contextWindow - responseReserve
3. systemTokens = estimateTokens(systemPrompt)
4. tier1Tokens = estimateTokens(profileYAML)
5. tier2Tokens = estimateTokens(relevantMemories)  // max 3 Snippets
6. ragTokens = estimateTokens(ragContext) || 0
7. tier3Tokens = 0  // noch keine Summary
8. historyBudget = budget - systemTokens - tier1 - tier2 - rag - tier3

9. FOR message IN messages (newest → oldest):
     msgTokens = estimateTokens(message.content)
     IF runningTotal + msgTokens > historyBudget:
       BREAK → Compaction noetig fuer aeltere Messages
     includedMessages.unshift(message)
     runningTotal += msgTokens

10. IF aeltere Messages uebrig UND runningTotal > budget * 0.70:
      → Trigger Compaction (Phase 3)
      → Ersetze aeltere Messages mit Summary
      tier3Tokens = estimateTokens(summary)
      Recalculate historyBudget

11. Baue fertigen Prompt:
      [System + Tier1 + Tier2] als system
      [Tier3 Summary] + [Included Messages] als prompt
```

### 2.2 Integration in `llmQueueService.js`

**processChatJob()** aendern (Zeile 499-566):

```javascript
// VORHER:
const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');

// NACHHER:
const optimized = await contextBudgetManager.buildOptimizedPrompt({
  messages,
  systemPrompt,
  model,
  conversationId: job.conversation_id,
  userId: job.user_id,
});

// Token-Breakdown loggen
logger.info(`Context budget: ${JSON.stringify(optimized.tokenBreakdown)}`);

// Optimierten Prompt verwenden
const prompt = optimized.prompt;
const systemPrompt = optimized.systemPrompt;
```

**processRAGJob()** aendern (Zeile 571-598):

- RAG-Context wird als `ragContext` Parameter uebergeben
- Budget Manager beruecksichtigt RAG-Tokens im Budget
- Bei grossen RAG-Kontexten: Conversation History wird aggressiver getrimmt

### Dateien

| Aktion  | Datei                                                             |
| ------- | ----------------------------------------------------------------- |
| NEU     | `services/dashboard-backend/src/services/contextBudgetManager.js` |
| AENDERN | `services/dashboard-backend/src/services/llmQueueService.js`      |

---

## Phase 3: Conversation Compaction

### Ziel

Aeltere Nachrichten automatisch zusammenfassen wenn der Context voll wird.

### 3.1 Neuer Service: `compactionService.js`

**Datei:** `services/dashboard-backend/src/services/compactionService.js`

```javascript
module.exports = {
  // Kompaktiert aeltere Nachrichten
  async compactMessages({
    conversationId,
    messagesToCompact,       // Array der alten Messages
    existingSummary,         // Vorherige Summary (fuer inkrementelle Updates)
    model,                   // Aktuelles Modell
    targetTokens,            // Ziel-Token-Laenge der Summary
  }),

  // Laedt bestehende Compaction-Summary
  async getCompactionSummary(conversationId),

  // Speichert Compaction-Ergebnis
  async saveCompactionSummary(conversationId, summary, metadata),
};
```

**Compaction-Prompt (optimiert fuer deutsche lokale Modelle):**

```
/no_think
Fasse das folgende Gespraech praezise zusammen.

BEHALTE:
- Hauptthema und Ziel
- Konkrete Fakten, Zahlen, Dateinamen, URLs
- Getroffene Entscheidungen
- Offene Fragen und naechste Schritte

IGNORIERE:
- Hoeflichkeitsfloskeln und Smalltalk
- Wiederholungen
- Fehlgeschlagene Versuche (nur das Endergebnis)

{existingSummary ? "Bisherige Zusammenfassung:\n" + existingSummary : ""}

Neue Nachrichten:
{messagesToCompact}

Zusammenfassung (maximal {targetTokens} Woerter):
```

**Wichtige Design-Entscheidungen:**

1. **Inkrementelle Compaction**: Bei wiederholter Compaction wird die bestehende
   Summary + neue Nachrichten zusammengefasst (nicht alles von Null).
   → Spart ~60% GPU-Zeit gegenueber vollstaendiger Re-Kompaktierung

2. **`/no_think` Prefix**: Deaktiviert Thinking-Modus bei Qwen3 fuer Compaction
   → Spart ~30% Tokens (kein `<think>` Block in der Summary)

3. **Niedrige Temperature (0.3)**: Fakten-treue Zusammenfassung, weniger kreativ

4. **Kleines `num_predict`**: Summary auf max `targetTokens * 2` begrenzen

### 3.2 Compaction-Ergebnis speichern

Neues Feld in `chat_conversations`:

```sql
ALTER TABLE chat_conversations
ADD COLUMN compaction_summary TEXT DEFAULT NULL,
ADD COLUMN compaction_token_count INTEGER DEFAULT 0,
ADD COLUMN compaction_message_count INTEGER DEFAULT 0,
ADD COLUMN last_compacted_at TIMESTAMPTZ DEFAULT NULL;
```

Die Summary wird in der Conversation gespeichert, nicht in einer separaten Tabelle.
So bleibt sie mit der Conversation verknuepft und wird bei Loeschung automatisch
mitgeloescht.

### 3.3 Frontend: Transparente Anzeige

In `ChatMulti.js` bzw. `ChatMessage.js`:

- Neuer SSE-Event-Typ: `compaction`
- Banner-Nachricht im Chat:
  ```
  ╔═══════════════════════════════════════╗
  ║ Kontext zusammengefasst               ║
  ║ 4.821 → 482 Tokens (90% Einsparung)  ║
  ╚═══════════════════════════════════════╝
  ```
- Wird als System-Message mit `role: 'system'` und `type: 'compaction'` dargestellt
- Nicht klickbar, nur informativ

### Dateien

| Aktion    | Datei                                                             |
| --------- | ----------------------------------------------------------------- |
| NEU       | `services/dashboard-backend/src/services/compactionService.js`    |
| AENDERN   | `services/dashboard-backend/src/services/llmQueueService.js`      |
| AENDERN   | `services/dashboard-backend/src/services/contextBudgetManager.js` |
| AENDERN   | `services/dashboard-frontend/src/components/ChatMulti.js`         |
| AENDERN   | `services/dashboard-frontend/src/components/Chat/ChatMessage.js`  |
| MIGRATION | `services/postgres/init/040_context_management_schema.sql`        |

---

## Phase 4: Pre-Compaction Memory Flush

### Ziel

Bevor kompaktiert wird: Wichtige Fakten extrahieren und dauerhaft speichern.
Dies ist die innovativste Idee von OpenClaw - kein anderes System macht das.

### 4.1 Memory-Extraktion vor Compaction

**Integration in `compactionService.js`:**

```javascript
async function compactMessages({ conversationId, messagesToCompact, ... }) {
  // SCHRITT 1: Memory Flush (VOR der Kompaktierung!)
  const extractedMemories = await memoryService.extractMemories(
    messagesToCompact,
    model
  );

  // SCHRITT 2: Memories speichern
  if (extractedMemories.length > 0) {
    await memoryService.saveMemories(extractedMemories, conversationId);
  }

  // SCHRITT 3: Dann erst kompaktieren
  const summary = await generateSummary(messagesToCompact, model, targetTokens);

  return { summary, extractedMemories };
}
```

### 4.2 Memory-Extraktions-Prompt

```
/no_think
Extrahiere wichtige Fakten aus diesem Gespraech.

Kategorien:
- FAKT: Konkrete Information (Name, Zahl, Datum, Pfad)
- ENTSCHEIDUNG: Getroffene Entscheidung mit Begruendung
- PRAEFERENZ: Benutzerpraeferenz oder Arbeitsweise

Format (STRIKT einhalten, eine Zeile pro Eintrag):
FAKT: [Beschreibung]
ENTSCHEIDUNG: [Was] - [Warum]
PRAEFERENZ: [Beschreibung]

Wenn nichts Relevantes: antworte mit KEINE_MEMORIES

Gespraech:
{messages}
```

**Parsing:** Einfaches Regex-Parsing der Antwort (`/^(FAKT|ENTSCHEIDUNG|PRAEFERENZ): (.+)$/gm`)

**Kosten:** Ein zusaetzlicher LLM-Call (~500-1000 Input-Tokens, ~100-300 Output-Tokens).
Bei 20 tok/s dauert das ~5-15 Sekunden. Akzeptabel, da Compaction selten passiert
(ca. alle 20-40 Nachrichten).

### Dateien

| Aktion  | Datei                                                                      |
| ------- | -------------------------------------------------------------------------- |
| AENDERN | `services/dashboard-backend/src/services/compactionService.js`             |
| NEU     | `services/dashboard-backend/src/services/memoryService.js` (siehe Phase 5) |

---

## Phase 5: Persistent Memory System (MinIO)

### Ziel

Langzeit-Gedaechtnis ueber Sessions hinweg. Markdown-Dateien in MinIO fuer
Portabilitaet und einfaches Backup.

### 5.1 MinIO-Bucket-Struktur

```
minio://memory/
├── profiles/
│   └── default.yaml              # Tier 1: User/Firmen-Profil
├── global/
│   ├── MEMORY.md                 # Globale Fakten & Praeferenzen
│   └── decisions/
│       ├── 2026-02-24.md         # Taegl. Entscheidungs-Log
│       └── 2026-02-25.md
├── conversations/
│   └── {conversationId}/
│       └── summary.md            # Conversation-Compaction-Summary
└── index.json                    # Suchindex (optional, Qdrant bevorzugt)
```

### 5.2 Tier 1: Ultra-Kompakt-Profil (`profiles/default.yaml`)

Dies wird bei JEDEM LLM-Call injiziert. Daher maximal ~150 Tokens:

```yaml
# Auto-generiert aus Setup-Wizard + laufenden Extraktionen
firma: 'Beispiel GmbH'
branche: 'IT-Dienstleistungen'
sprache: 'de'
standort: 'Berlin'
mitarbeiter: 25
produkte:
  - Webentwicklung
  - Cloud-Hosting
praeferenzen:
  antwortlaenge: 'mittel'
  formalitaet: 'professionell-locker'
  code_sprache: 'javascript'
```

**Warum YAML statt Markdown?**

- YAML ist ~40% kompakter als Markdown fuer strukturierte Daten
- Bei 150 Token Budget zaehlt jedes Token
- Leicht maschinenlesbar fuer Updates
- LLMs verstehen YAML genauso gut wie Markdown

**Injektion:** Als Teil des System-Prompts:

```
Du bist ein KI-Assistent fuer folgendes Unternehmen:
{yaml_content}
Beruecksichtige diesen Kontext in deinen Antworten.
```

### 5.3 Tier 2: Semantische Memory-Suche

Memories werden in Qdrant indiziert (bestehendes System nutzen!):

**Neue Qdrant-Collection:** `memories`

```javascript
{
  vectors: { size: 1024, distance: 'Cosine' },
  payload: {
    type: 'fact' | 'decision' | 'preference',
    content: 'PostgreSQL statt MongoDB fuer das Projekt',
    source_conversation_id: 42,
    created_at: '2026-02-24T10:30:00Z',
    importance: 0.8,  // Optional: wie wichtig ist das Memory?
  }
}
```

**Suche bei jedem LLM-Call:**

```javascript
// In contextBudgetManager.js:
const relevantMemories = await memoryService.searchRelevantMemories(
  currentQuery,     // Letzte User-Nachricht
  maxResults: 3,    // Top 3 relevanteste
  minScore: 0.5,    // Mindest-Aehnlichkeit
);
// → Array von max 3 Memory-Snippets, je ~100 Tokens
```

**Injektion in den Prompt:**

```
Relevante Erinnerungen aus frueheren Gespraechen:
- Am 24.02 wurde entschieden: PostgreSQL statt MongoDB
- Der Benutzer bevorzugt kurze, praegnante Antworten
- Das Projekt nutzt React 18 mit TypeScript
```

### 5.4 Neuer Service: `memoryService.js`

**Datei:** `services/dashboard-backend/src/services/memoryService.js`

```javascript
const minioClient = require('../config/minio');
const qdrantService = require('./qdrantService');

module.exports = {
  // Memory-Operationen
  async extractMemories(messages, model),
  async saveMemories(memories, conversationId),
  async searchRelevantMemories(query, maxResults, minScore),
  async getAllMemories(type),
  async deleteMemory(memoryId),
  async updateMemory(memoryId, content),

  // Profil-Operationen
  async getProfile(),
  async updateProfile(yamlContent),
  async updateProfileField(key, value),

  // MinIO-Operationen
  async readFile(path),
  async writeFile(path, content),
  async listFiles(prefix),

  // Index-Operationen
  async reindexMemories(),
  async getMemoryStats(),
};
```

### 5.5 Memory-Deduplizierung

Problem: Gleiche Fakten koennten mehrfach extrahiert werden.

Loesung: Vor dem Speichern semantische Aehnlichkeit pruefen:

```javascript
async function saveMemories(memories, conversationId) {
  for (const memory of memories) {
    // Embedding generieren
    const embedding = await getEmbedding(memory.content);

    // Pruefen ob aehnliches Memory existiert (> 0.9 Similarity)
    const existing = await qdrant.search('memories', embedding, {
      limit: 1,
      score_threshold: 0.9,
    });

    if (existing.length > 0) {
      // Update statt Insert (neueres Datum)
      await updateMemory(existing[0].id, memory);
    } else {
      // Neues Memory speichern
      await insertMemory(memory, embedding, conversationId);
    }
  }
}
```

### 5.6 Memory-Limits (VRAM-Schutz)

Harte Limits um Context-Overflow zu verhindern:

| Limit                   | Wert     | Begruendung                           |
| ----------------------- | -------- | ------------------------------------- |
| Max Tier 1 (Profil)     | 200 Tok  | Wird bei jedem Call injiziert         |
| Max Tier 2 (Memories)   | 400 Tok  | Max 3 Snippets a ~130 Tok             |
| Max Tier 3 (Summary)    | 600 Tok  | Compaction-Summary                    |
| Max gesamt Memory       | 1200 Tok | Hartes Limit, nie ueberschritten      |
| Max Memories in Qdrant  | 500      | Aelteste werden automatisch geloescht |
| Max Profil-YAML Groesse | 2 KB     | ~500 Tokens                           |

### Dateien

| Aktion    | Datei                                                             |
| --------- | ----------------------------------------------------------------- |
| NEU       | `services/dashboard-backend/src/services/memoryService.js`        |
| AENDERN   | `services/dashboard-backend/src/services/contextBudgetManager.js` |
| MIGRATION | `services/postgres/init/040_context_management_schema.sql`        |

---

## Phase 6: Pruning (Tool-Result Trimming)

### Ziel

Alte, irrelevante Daten aus dem Kontext entfernen OHNE die History zu zerstoeren.

### 6.1 Was wird gepruned?

| Kategorie         | Aktion                          | Einsparung |
| ----------------- | ------------------------------- | ---------- |
| Thinking-Blocks   | Entfernen aus Context-Injection | 30-50%     |
| Tool-Ergebnisse   | Nur letzte 2 behalten           | 20-40%     |
| Lange Nachrichten | Auf 500 Tokens kuerzen          | 10-30%     |
| System-Messages   | Compaction-Banner entfernen     | 5-10%      |

### 6.2 Integration in `contextBudgetManager.js`

```javascript
function pruneMessages(messages, budgetRemaining) {
  return messages.map(msg => {
    let content = msg.content;

    // 1. Thinking-Blocks entfernen (nicht im Kontext noetig)
    if (msg.thinking) {
      msg.thinking = null; // Thinking nicht an LLM senden
    }

    // 2. Alte Tool-Ergebnisse kuerzen
    if (msg.role === 'assistant' && containsToolResult(content)) {
      const age = messages.length - messages.indexOf(msg);
      if (age > 4) {
        // Aelter als 4 Nachrichten
        content = truncateToolResult(content, 200);
      }
    }

    // 3. Extrem lange Nachrichten kuerzen
    const msgTokens = estimateTokens(content);
    if (msgTokens > 500 && msg !== messages[messages.length - 1]) {
      content = truncateToTokens(content, 500) + '\n[... gekuerzt]';
    }

    return { ...msg, content };
  });
}
```

### 6.3 Wichtig: Pruning ist transient

- Pruning veraendert NICHT die Datenbank
- Nur die In-Memory-Kopie fuer den aktuellen LLM-Call
- Originale Messages bleiben vollstaendig in `chat_messages`

### Dateien

| Aktion  | Datei                                                             |
| ------- | ----------------------------------------------------------------- |
| AENDERN | `services/dashboard-backend/src/services/contextBudgetManager.js` |

---

## Phase 7: Setup Wizard Integration

### Ziel

Im bestehenden Setup-Wizard (5 Schritte) einen neuen Schritt einfuegen:
**"KI-Profil"** - interaktive Abfrage von Firmeninformationen.

### 7.1 Neuer Wizard-Schritt: "KI-Profil"

**Position:** Nach Schritt 1 (Willkommen) und vor Schritt 2 (Passwort)

**Neue STEPS-Definition:**

```javascript
const STEPS = [
  { id: 1, title: 'Willkommen', description: 'System einrichten' },
  { id: 2, title: 'KI-Profil', description: 'Ihr Unternehmen' }, // NEU
  { id: 3, title: 'Passwort', description: 'Admin-Passwort aendern' },
  { id: 4, title: 'Netzwerk', description: 'Konnektivitaet pruefen' },
  { id: 5, title: 'KI-Modelle', description: 'Modell auswaehlen' },
  { id: 6, title: 'Zusammenfassung', description: 'Einrichtung abschliessen' },
];
```

### 7.2 KI-Profil-Schritt: UI-Design

Interaktive Fragen mit Vorschlaegen (wie `AskUserQuestion`):

**Frage 1: Unternehmensname** (aus Schritt 1 uebernommen)

```
┌─────────────────────────────────────────┐
│ Wie heisst Ihr Unternehmen?             │
│                                          │
│ [Beispiel GmbH________________]         │
│                                          │
│ Vorschlaege:                            │
│   ○ [Firmenname] GmbH                  │
│   ○ [Firmenname] AG                    │
│   ○ [Firmenname] e.K.                  │
│   ○ Eigene Eingabe...                  │
└─────────────────────────────────────────┘
```

**Frage 2: Branche**

```
┌─────────────────────────────────────────┐
│ In welcher Branche sind Sie taetig?      │
│                                          │
│   ○ IT & Software                       │
│   ○ Handel & E-Commerce                │
│   ○ Produktion & Fertigung             │
│   ○ Beratung & Dienstleistungen        │
│   ○ Gesundheit & Medizin              │
│   ○ Eigene Eingabe...                  │
└─────────────────────────────────────────┘
```

**Frage 3: Teamgroesse**

```
┌─────────────────────────────────────────┐
│ Wie gross ist Ihr Team?                  │
│                                          │
│   ○ 1-5 Mitarbeiter                    │
│   ○ 6-20 Mitarbeiter                   │
│   ○ 21-100 Mitarbeiter                 │
│   ○ 100+ Mitarbeiter                   │
└─────────────────────────────────────────┘
```

**Frage 4: Hauptprodukte/Services** (Freitext + Vorschlaege)

```
┌─────────────────────────────────────────┐
│ Was sind Ihre Hauptprodukte/-services?   │
│ (Komma-getrennt)                        │
│                                          │
│ [Webentwicklung, Cloud-Hosting___]      │
└─────────────────────────────────────────┘
```

**Frage 5: KI-Antwortpraeferenzen**

```
┌─────────────────────────────────────────┐
│ Wie soll der KI-Assistent antworten?    │
│                                          │
│   ○ Kurz & praegnant                   │
│   ○ Ausfuehrlich & detailliert         │
│   ○ Professionell-formell              │
│   ○ Locker & direkt                    │
└─────────────────────────────────────────┘
```

### 7.3 Speicherung

Bei "Weiter" oder "Fertig":

1. **YAML-Profil generieren** aus den Antworten
2. **In MinIO speichern:** `memory/profiles/default.yaml`
3. **Company-Context aktualisieren:** `PUT /api/settings/company-context`
4. **Embedding generieren** fuer das Profil (fuer Tier 2 Suche)

### 7.4 Backend-Endpunkte

**Neuer Endpunkt:** `POST /api/memory/profile`

```javascript
router.post(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyName, industry, teamSize, products, preferences } = req.body;

    // YAML generieren
    const profileYaml = generateProfileYaml({
      firma: companyName,
      branche: industry,
      teamgroesse: teamSize,
      produkte: products,
      praeferenzen: preferences,
    });

    // In MinIO speichern
    await memoryService.writeFile('profiles/default.yaml', profileYaml);

    // Company-Context aktualisieren (fuer RAG)
    await updateCompanyContext(companyName, industry, products);

    res.json({ success: true });
  })
);
```

### Dateien

| Aktion  | Datei                                                        |
| ------- | ------------------------------------------------------------ |
| AENDERN | `services/dashboard-frontend/src/components/SetupWizard.js`  |
| AENDERN | `services/dashboard-frontend/src/components/SetupWizard.css` |
| AENDERN | `services/dashboard-backend/src/routes/system.js`            |
| NEU     | `services/dashboard-backend/src/routes/memory.js`            |

---

## Phase 8: Memory Settings UI

### Ziel

Eigene Settings-Seite: "KI-Gedaechtnis" mit allen Memories, Suche, Edit/Delete.

### 8.1 Neue Route: `/settings/memory`

**Datei:** `services/dashboard-frontend/src/components/MemorySettings.js`

### 8.2 UI-Bereiche

```
┌──────────────────────────────────────────────────────────────┐
│  KI-Gedaechtnis                                [Suche: ___]  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ Unternehmensprofil ─────────────────────────────────┐   │
│  │  Firma: Beispiel GmbH                                 │   │
│  │  Branche: IT-Dienstleistungen                        │   │
│  │  Team: 25 Mitarbeiter                                │   │
│  │  [Bearbeiten]                                         │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Gespeicherte Erinnerungen (24) ─────────────────────┐   │
│  │                                                        │   │
│  │  FAKT  24.02.2026                                     │   │
│  │  Das Projekt nutzt PostgreSQL 16 als Datenbank        │   │
│  │  Quelle: Chat "Datenbankplanung"        [x Loeschen] │   │
│  │                                                        │   │
│  │  ENTSCHEIDUNG  23.02.2026                             │   │
│  │  React 18 statt Vue.js fuer das Frontend              │   │
│  │  Quelle: Chat "Tech-Stack Review"       [x Loeschen] │   │
│  │                                                        │   │
│  │  PRAEFERENZ  22.02.2026                               │   │
│  │  Antworten immer auf Deutsch                          │   │
│  │  Quelle: Chat "Einstellungen"           [x Loeschen] │   │
│  │                                                        │   │
│  │  [Mehr laden...]                                      │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Statistiken ────────────────────────────────────────┐   │
│  │  Gesamt: 24 Erinnerungen                             │   │
│  │  Fakten: 12  |  Entscheidungen: 8  |  Praef.: 4     │   │
│  │  Speicher: 48 KB in MinIO                            │   │
│  │  Letztes Update: vor 2 Stunden                       │   │
│  │                                                        │   │
│  │  [Alle loeschen]  [Exportieren]  [Neu indizieren]    │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 8.3 API-Endpunkte fuer Memory Settings

| Method | Endpunkt              | Beschreibung                      |
| ------ | --------------------- | --------------------------------- |
| GET    | `/api/memory/profile` | Profil-YAML laden                 |
| PUT    | `/api/memory/profile` | Profil-YAML aktualisieren         |
| POST   | `/api/memory/profile` | Profil aus Wizard-Daten erstellen |
| GET    | `/api/memory/list`    | Alle Memories (paginiert)         |
| GET    | `/api/memory/search`  | Semantische Suche                 |
| DELETE | `/api/memory/:id`     | Memory loeschen                   |
| PUT    | `/api/memory/:id`     | Memory bearbeiten                 |
| GET    | `/api/memory/stats`   | Statistiken                       |
| POST   | `/api/memory/reindex` | Qdrant neu indizieren             |
| POST   | `/api/memory/export`  | Alle Memories als JSON/MD export  |
| DELETE | `/api/memory/all`     | Alle Memories loeschen (Confirm)  |

### 8.4 Frontend-Integration

**Sidebar-Navigation:** Neuer Menuepunkt unter "Einstellungen":

```javascript
{ icon: <FiBrain />, label: 'KI-Gedaechtnis', path: '/settings/memory' }
```

### Dateien

| Aktion  | Datei                                                           |
| ------- | --------------------------------------------------------------- |
| NEU     | `services/dashboard-frontend/src/components/MemorySettings.js`  |
| NEU     | `services/dashboard-frontend/src/components/MemorySettings.css` |
| NEU     | `services/dashboard-backend/src/routes/memory.js`               |
| AENDERN | `services/dashboard-backend/src/index.js` (Route registrieren)  |
| AENDERN | `services/dashboard-frontend/src/App.js` (Route + Nav)          |

---

## Phase 9: Ollama-Optimierung

### Ziel

Ollama-Konfiguration fuer maximale Effizienz auf dem Jetson optimieren.

### 9.1 Docker-Compose Aenderungen

```yaml
llm-service:
  environment:
    OLLAMA_HOST: 0.0.0.0:11434
    OLLAMA_FLASH_ATTENTION: '1' # NEU: Aktiviert FlashAttention
    OLLAMA_KV_CACHE_TYPE: 'q8_0' # NEU: Halbiert KV-Cache-Speicher
    OLLAMA_NUM_PARALLEL: '1' # NEU: Ein Request (Queue regelt)
    OLLAMA_MAX_LOADED_MODELS: '1' # NEU: Ein Modell gleichzeitig
    LLM_MODEL: ${LLM_MODEL:-qwen3:14b-q8}
    LLM_KEEP_ALIVE_SECONDS: ${LLM_KEEP_ALIVE_SECONDS:-300}
```

**Effekt:**

| Optimierung         | Einsparung           | Qualitaetsverlust |
| ------------------- | -------------------- | ----------------- |
| Flash Attention     | 20-30% schneller     | Keiner            |
| KV-Cache q8_0       | 50% weniger VRAM     | Minimal (~1%)     |
| NUM_PARALLEL=1      | Kein VRAM-Sharing    | Keiner            |
| MAX_LOADED_MODELS=1 | Kein Dual-Model-VRAM | Keiner            |

### 9.2 Festes `num_ctx` statt dynamisch

**Wichtig:** Unterschiedliche `num_ctx`-Werte pro Request zwingen Ollama zum
Model-Reload (langsam!). Stattdessen: Festes `num_ctx` setzen und Context
auf Anwendungsebene managen.

Empfohlene Strategie:

- **Standard-CTX fuer kleine Modelle (7B):** 8192
- **Standard-CTX fuer mittlere Modelle (14B):** 16384
- **Standard-CTX fuer grosse Modelle (32B+):** 32768

Dies wird ueber die Model-Catalog-Tabelle konfiguriert (neue Spalte
`recommended_ctx`), nicht ueber Environment-Variablen.

### 9.3 Model-Katalog erweitern

```sql
ALTER TABLE llm_model_catalog
ADD COLUMN context_window INTEGER DEFAULT NULL,
ADD COLUMN recommended_ctx INTEGER DEFAULT 8192;

UPDATE llm_model_catalog SET context_window = 32768, recommended_ctx = 16384
WHERE id LIKE 'qwen3:%';

UPDATE llm_model_catalog SET context_window = 131072, recommended_ctx = 8192
WHERE id LIKE 'llama3.1:%';

UPDATE llm_model_catalog SET context_window = 32768, recommended_ctx = 8192
WHERE id LIKE 'mistral:%';

UPDATE llm_model_catalog SET context_window = 8192, recommended_ctx = 8192
WHERE id LIKE 'gemma2:%';
```

### Dateien

| Aktion    | Datei                                                      |
| --------- | ---------------------------------------------------------- |
| AENDERN   | `docker-compose.yml`                                       |
| MIGRATION | `services/postgres/init/040_context_management_schema.sql` |

---

## Datenbank-Migrationen

### Migration: `040_context_management_schema.sql`

```sql
-- ============================================================
-- 040: Context Management System
-- Compaction, Memory, Token-Tracking, Model-Context-Windows
-- ============================================================

-- 1. Compaction-Felder in chat_conversations
ALTER TABLE chat_conversations
ADD COLUMN IF NOT EXISTS compaction_summary TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS compaction_token_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS compaction_message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_compacted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Token-Tracking in llm_jobs
ALTER TABLE llm_jobs
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS context_window_used INTEGER DEFAULT NULL;

-- 3. Model-Context-Windows
ALTER TABLE llm_model_catalog
ADD COLUMN IF NOT EXISTS context_window INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recommended_ctx INTEGER DEFAULT 8192;

-- Bekannte Context-Windows setzen
UPDATE llm_model_catalog SET context_window = 32768, recommended_ctx = 16384
WHERE id IN ('qwen3:7b-q8', 'qwen3:14b-q8', 'qwen3:32b-q4');

UPDATE llm_model_catalog SET context_window = 131072, recommended_ctx = 8192
WHERE id IN ('llama3.1:8b', 'llama3.1:70b-q4');

UPDATE llm_model_catalog SET context_window = 32768, recommended_ctx = 8192
WHERE id IN ('mistral:7b-q8');

UPDATE llm_model_catalog SET context_window = 8192, recommended_ctx = 8192
WHERE id IN ('gemma2:9b-q8');

UPDATE llm_model_catalog SET context_window = 16384, recommended_ctx = 8192
WHERE id IN ('deepseek-coder:6.7b');

-- 4. Memory-Tracking-Tabelle (fuer Stats und Verwaltung)
CREATE TABLE IF NOT EXISTS ai_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('fact', 'decision', 'preference')),
    content TEXT NOT NULL,
    source_conversation_id BIGINT REFERENCES chat_conversations(id)
        ON DELETE SET NULL,
    qdrant_point_id UUID,
    importance DECIMAL(3,2) DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_ai_memories_type ON ai_memories(type);
CREATE INDEX idx_ai_memories_active ON ai_memories(is_active)
    WHERE is_active = TRUE;
CREATE INDEX idx_ai_memories_created ON ai_memories(created_at DESC);

-- 5. Memory-Profil in system_settings
ALTER TABLE system_settings
ADD COLUMN IF NOT EXISTS ai_profile_yaml TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_profile_updated_at TIMESTAMPTZ DEFAULT NULL;

-- 6. Compaction-Statistiken
CREATE TABLE IF NOT EXISTS compaction_log (
    id SERIAL PRIMARY KEY,
    conversation_id BIGINT REFERENCES chat_conversations(id) ON DELETE CASCADE,
    messages_compacted INTEGER NOT NULL,
    tokens_before INTEGER NOT NULL,
    tokens_after INTEGER NOT NULL,
    compression_ratio DECIMAL(5,2),
    memories_extracted INTEGER DEFAULT 0,
    model_used VARCHAR(100),
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compaction_log_conversation
    ON compaction_log(conversation_id);

-- 7. Cleanup-Funktion: Alte Compaction-Logs
CREATE OR REPLACE FUNCTION cleanup_old_compaction_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM compaction_log WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 8. Setup-Wizard Schritt-Erweiterung (6 statt 5)
UPDATE system_settings SET setup_step = LEAST(setup_step, 6)
WHERE setup_step IS NOT NULL;
```

---

## API-Endpunkte

### Neue Route: `/api/memory`

| Method | Endpunkt                   | Auth | Beschreibung                             |
| ------ | -------------------------- | ---- | ---------------------------------------- |
| GET    | `/api/memory/profile`      | Ja   | Profil-YAML laden                        |
| PUT    | `/api/memory/profile`      | Ja   | Profil aktualisieren                     |
| POST   | `/api/memory/profile`      | Ja   | Profil aus Wizard erstellen              |
| GET    | `/api/memory/list`         | Ja   | Memories paginiert (type, limit, offset) |
| GET    | `/api/memory/search?q=...` | Ja   | Semantische Memory-Suche                 |
| GET    | `/api/memory/stats`        | Ja   | Statistiken (Anzahl, Groesse, etc.)      |
| DELETE | `/api/memory/:id`          | Ja   | Einzelnes Memory loeschen                |
| PUT    | `/api/memory/:id`          | Ja   | Memory-Text bearbeiten                   |
| POST   | `/api/memory/reindex`      | Ja   | Qdrant Collection neu aufbauen           |
| POST   | `/api/memory/export`       | Ja   | Alle Memories als JSON exportieren       |
| DELETE | `/api/memory/all`          | Ja   | Alle Memories loeschen (bestaetigt)      |

### Erweiterte Endpunkte

| Method | Endpunkt                     | Aenderung                             |
| ------ | ---------------------------- | ------------------------------------- |
| GET    | `/api/chats/:id/messages`    | + `compaction_summary` Feld           |
| GET    | `/api/models/installed`      | + `context_window`, `recommended_ctx` |
| PUT    | `/api/system/setup-step`     | Step-Range erweitert auf 0-6          |
| POST   | `/api/system/setup-complete` | + `aiProfile` Feld                    |

---

## Implementierungsreihenfolge

### Sprint 1: Fundament (Phase 1 + 9)

**Geschaetzter Aufwand: 2-3 Tage**

1. `tokenService.js` erstellen
2. `modelContextService.js` erstellen
3. Docker-Compose Ollama-Optimierungen
4. DB-Migration `040_context_management_schema.sql`
5. Ollama-Response-Metadaten in `llmQueueService.js` auslesen
6. Tests

**Ergebnis:** Token-Counting funktioniert, Modell-Context-Windows bekannt,
Ollama laeuft optimiert.

### Sprint 2: Budget Manager + Pruning (Phase 2 + 6)

**Geschaetzter Aufwand: 2-3 Tage**

1. `contextBudgetManager.js` erstellen
2. Pruning-Logik in Budget Manager
3. Integration in `llmQueueService.js` (`processChatJob` + `processRAGJob`)
4. Token-Breakdown Logging
5. Tests

**Ergebnis:** Context-Overflow unmoeglich. Jeder LLM-Call respektiert das
Token-Budget des aktuellen Modells.

### Sprint 3: Compaction (Phase 3 + 4)

**Geschaetzter Aufwand: 3-4 Tage**

1. `compactionService.js` erstellen
2. Pre-Compaction Memory Flush (Extraktions-Prompt)
3. Integration in Budget Manager (Auto-Trigger bei 70%)
4. Compaction-Banner im Frontend (SSE-Event)
5. `compaction_log` Tabelle befuellen
6. Tests

**Ergebnis:** Lange Chats funktionieren. Alte Nachrichten werden zusammengefasst,
wichtige Fakten vorher extrahiert.

### Sprint 4: Memory System (Phase 5)

**Geschaetzter Aufwand: 3-4 Tage**

1. `memoryService.js` erstellen
2. MinIO-Bucket `memory` erstellen
3. Qdrant-Collection `memories` erstellen
4. Memory-Deduplizierung
5. Tier 1 + Tier 2 Injection in `contextBudgetManager.js`
6. `ai_memories` Tabelle befuellen
7. Tests

**Ergebnis:** AI merkt sich Fakten und Entscheidungen. Jeder Chat profitiert
von frueherem Wissen.

### Sprint 5: Setup Wizard (Phase 7)

**Geschaetzter Aufwand: 2-3 Tage**

1. Neuer Wizard-Schritt "KI-Profil"
2. Interaktive Fragen-UI (Radio Buttons + Freitext)
3. YAML-Profil-Generierung
4. Backend-Endpunkt `POST /api/memory/profile`
5. Company-Context Auto-Update
6. Tests

**Ergebnis:** Beim ersten Start wird das AI-Profil eingerichtet.

### Sprint 6: Memory Settings UI (Phase 8)

**Geschaetzter Aufwand: 2-3 Tage**

1. `MemorySettings.js` Komponente
2. Memory-Liste mit Pagination
3. Such-Funktion
4. Edit/Delete pro Memory
5. Profil-Editor
6. Statistiken-Anzeige
7. Export/Import
8. Sidebar-Navigation erweitern

**Ergebnis:** User hat volle Kontrolle ueber das AI-Gedaechtnis.

---

### Gesamt-Timeline

```
Sprint 1 ████████░░░░░░░░░░░░░░░░  Fundament (Token + Ollama)
Sprint 2 ░░░░░░░░████████░░░░░░░░  Budget Manager + Pruning
Sprint 3 ░░░░░░░░░░░░░░░░█████████ Compaction + Memory Flush
Sprint 4 ░░░░░░░░░░░░░░░░░░░░░░░░█████████ Memory System
Sprint 5 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████ Setup Wizard
Sprint 6 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████ Memory UI
```

Jeder Sprint baut auf dem vorherigen auf. Nach Sprint 2 ist das System
bereits produktiv nutzbar (kein Context-Overflow mehr). Die Sprints 3-6
fuegen zunehmend intelligentere Features hinzu.

---

## Zusammenfassung der Innovationen

| Feature              | OpenClaw                 | Arasul (dieser Plan)           |
| -------------------- | ------------------------ | ------------------------------ |
| Context Budget       | Gross (200K Tokens)      | Klein (8K-32K) → Tiered        |
| Memory Overhead      | ~35.600 Tokens Bootstrap | Max 1.200 Tokens (35x kleiner) |
| Bootstrap-Dateien    | 7 Markdown-Dateien       | 1 YAML-Profil (150 Tokens)     |
| Memory-Suche         | SQLite + FTS5            | Qdrant + BM25 (existierend)    |
| Memory-Storage       | Lokale Markdown-Dateien  | MinIO (portabel, backupbar)    |
| Compaction           | Vollstaendig             | Inkrementell (60% schneller)   |
| Pre-Compaction Flush | Ja                       | Ja (uebernommen)               |
| Pruning              | Cache-TTL basiert        | Alter + Relevanz basiert       |
| Token-Counting       | Anthropic API            | Ollama /api/tokenize + Heur.   |
| Hardware-Ziel        | Cloud-Modelle            | Lokale 7B-32B auf Jetson       |
| Profil-Einrichtung   | IDENTITY.md manuell      | Setup-Wizard interaktiv        |

---

## Referenzen

- [OpenClaw Context Management Docs](https://docs.openclaw.ai/concepts/context)
- [OpenClaw Memory System Docs](https://docs.openclaw.ai/concepts/memory)
- [OpenClaw Compaction Docs](https://docs.openclaw.ai/concepts/compaction)
- [Ollama KV-Cache Quantization](https://blog.peddals.com/en/ollama-vram-fine-tune-with-kv-cache/)
- [Ollama Context Length Docs](https://docs.ollama.com/context-length)
- [Ollama API /api/show](https://github.com/ollama/ollama/blob/main/docs/api.md)
