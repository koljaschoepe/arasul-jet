# Store Implementierungsplan

## Übersicht

Der neue **Store** vereint die bisherigen Reiter "Store" (AppStore) und "KI-Modelle" (ModelStore) in einer einheitlichen Oberfläche. Er bietet eine zentrale Anlaufstelle für alle Erweiterungen der Arasul Platform.

---

## Anforderungen (aus Interview)

| Aspekt | Entscheidung |
|--------|--------------|
| **Struktur** | Tabs: Start \| Modelle \| Apps |
| **URL** | `/store`, `/store/models`, `/store/apps` |
| **Startseite** | Kompakt: 3x Modell-Empfehlungen + 3x App-Empfehlungen |
| **Modell-Empfehlungen** | Jetson-optimiert basierend auf RAM (8/64/128 GB) |
| **App-Empfehlungen** | n8n, Telegram Bot, Claude Code |
| **Modell-Filter** | Nach Größe (Klein/Mittel/Groß) + Typ-Badges (LLM, OCR, Vision) |
| **App-Filter** | Vereinfacht: Empfohlen \| Alle |
| **Claude Code** | Featured auf Startseite + im Apps-Tab |
| **Suche** | Prominente globale Suche über alle Kategorien |
| **Downloads** | Sidebar-Badge beibehalten |
| **Ressourcen** | Warnung nur bei Konflikt |
| **Favoriten** | Pro Kategorie ein Default (wie bisher) |
| **Modell-Details** | Wie bisher (Größe, RAM, Capabilities, Empfohlen für, Ollama-Link) |
| **OCR-Integration** | Docker-Container (Tesseract, PaddleOCR) |
| **Alte URLs** | Entfernen (/models, /appstore) |
| **Sidebar** | "Store" mit FiPackage Icon |

---

## Architektur

### Neue Komponenten-Struktur

```
services/dashboard-frontend/src/
├── components/
│   └── Store/
│       ├── Store.js                 # Hauptkomponente mit Tabs
│       ├── Store.css                # Gemeinsame Styles
│       ├── StoreHome.js             # Startseite (Empfehlungen)
│       ├── StoreModels.js           # Modelle-Tab
│       ├── StoreApps.js             # Apps-Tab
│       ├── StoreSearch.js           # Globale Suchkomponente
│       ├── StoreModelCard.js        # Modell-Karte (refactored)
│       ├── StoreAppCard.js          # App-Karte (refactored)
│       └── StoreModelDetail.js      # Modell-Detail-Modal
```

### Backend-Erweiterungen

```
services/dashboard-backend/src/
├── routes/
│   └── store.js                     # Neuer unified Store-Endpoint
├── services/
│   ├── modelService.js              # Erweitert um OCR-Modelle
│   └── appService.js                # Unverändert
```

---

## Phase 1: Grundgerüst (Frontend)

### 1.1 Neue Store-Hauptkomponente

**Datei:** `components/Store/Store.js`

```jsx
// Struktur:
// - Header mit globalem Suchfeld
// - Tab-Navigation (Start | Modelle | Apps)
// - Content-Bereich basierend auf aktivem Tab
// - URL-Sync: /store → Start, /store/models → Modelle, /store/apps → Apps
```

**Features:**
- React Router nested routes für Tab-Navigation
- Globaler Suchzustand der an Child-Komponenten weitergegeben wird
- Lazy Loading für Tab-Inhalte
- DownloadContext-Integration für Fortschrittsanzeige

### 1.2 Tab-Komponenten

| Komponente | Route | Inhalt |
|------------|-------|--------|
| `StoreHome` | `/store` | 3 Modell-Karten + 3 App-Karten (empfohlen) |
| `StoreModels` | `/store/models` | Grid aller Modelle mit Größen/Typ-Filter |
| `StoreApps` | `/store/apps` | Grid aller Apps mit Empfohlen/Alle-Filter |

### 1.3 Globale Suche

**Komponente:** `StoreSearch.js`

- Prominentes Suchfeld im Store-Header
- Sucht in: Modell-Namen, Beschreibungen, Capabilities, App-Namen
- Debounced Input (300ms)
- Zeigt kategorisierte Ergebnisse (Modelle / Apps)
- Keyboard-Navigation (Pfeiltasten, Enter)

---

## Phase 2: Modelle-Tab

### 2.1 Filter-System

**Größen-Filter (Chips):**
- Klein (7-12 GB RAM)
- Mittel (15-25 GB RAM)
- Groß (30-40 GB RAM)
- Sehr Groß (45+ GB RAM)

**Typ-Badges (auf Karten):**
- LLM (Chat, Reasoning, Code)
- OCR (Texterkennung)
- Vision (Bildanalyse)
- Audio (Speech-to-Text) - für Zukunft

### 2.2 RAM-basierte Empfehlungen

```javascript
// Logik für Startseite-Empfehlungen
function getRecommendedModels(availableRamGB) {
  if (availableRamGB >= 64) {
    // Jetson AGX Orin 64GB
    return ['qwen3:32b-q4', 'llama3.1:70b-q4', 'qwen3:14b-q8'];
  } else if (availableRamGB >= 32) {
    return ['qwen3:14b-q8', 'mistral:7b-q8', 'deepseek-coder:6.7b'];
  } else {
    // 8GB Systeme
    return ['qwen3:7b-q8', 'mistral:7b-q8', 'gemma2:9b-q8'];
  }
}
```

### 2.3 Modell-Karten (StoreModelCard)

Wiederverwendung der bestehenden ModelStore-Karten mit Anpassungen:

- **Typ-Badge** oben rechts (LLM / OCR / Vision)
- **Installiert-Badge** wenn vorhanden
- **Favorit-Stern** für Default pro Typ
- **Download-Progress** wie bisher
- **Aktionen:** Download | Aktivieren | Löschen | Details

### 2.4 OCR-Modelle im Katalog

Neue Einträge in `llm_model_catalog` mit `model_type = 'ocr'`:

| ID | Name | Typ | Container | RAM |
|----|------|-----|-----------|-----|
| `tesseract:latest` | Tesseract OCR | ocr | Docker | 1 GB |
| `paddleocr:latest` | PaddleOCR | ocr | Docker | 4 GB |

---

## Phase 3: Apps-Tab

### 3.1 Vereinfachte Filter

Nur zwei Buttons:
- **Empfohlen** (default) - Zeigt featured Apps
- **Alle** - Zeigt alle verfügbaren Apps

### 3.2 Empfohlene Apps

Fest definiert:
1. **Claude Code** - KI-Programmierassistent (Featured)
2. **n8n** - Workflow-Automatisierung
3. **Telegram Bot** - Messaging-Integration

### 3.3 App-Karten (StoreAppCard)

Basiert auf bestehendem AppStore mit Anpassungen:
- **Status-Badge** (Läuft / Installiert / Verfügbar)
- **System-Badge** für System-Apps (nicht deinstallierbar)
- **Empfohlen-Badge** für featured Apps
- **Aktionen:** Installieren | Starten | Stoppen | Öffnen | Deinstallieren

---

## Phase 4: Backend-Erweiterungen

### 4.1 Neuer Store-Endpoint

**Route:** `GET /api/store`

Kombinierte Antwort für Startseite:

```json
{
  "recommendations": {
    "models": [...],  // 3 empfohlene Modelle
    "apps": [...]     // 3 empfohlene Apps
  },
  "systemInfo": {
    "availableRamGB": 48,
    "availableDiskGB": 120
  }
}
```

### 4.2 OCR-Container-Management

Erweiterung von `appService.js`:

- OCR-Container werden wie normale Apps behandelt
- Manifest-Dateien für Tesseract und PaddleOCR
- API-Endpoint für OCR-Anfragen (optional für später)

### 4.3 Modell-Typ-Erweiterung

Migration `030_model_types.sql`:

```sql
ALTER TABLE llm_model_catalog
ADD COLUMN model_type VARCHAR(20) DEFAULT 'llm'
CHECK (model_type IN ('llm', 'ocr', 'vision', 'audio'));

-- Index für Typ-Filter
CREATE INDEX idx_model_type ON llm_model_catalog(model_type);
```

---

## Phase 5: Navigation & Routing

### 5.1 App.js Änderungen

```jsx
// Entfernen:
// - Route für /models (ModelStore)
// - Route für /appstore (AppStore)
// - Sidebar-Eintrag für "KI-Modelle"

// Hinzufügen:
<Route path="/store" element={<Store />}>
  <Route index element={<StoreHome />} />
  <Route path="models" element={<StoreModels />} />
  <Route path="apps" element={<StoreApps />} />
</Route>

// Sidebar: Ein Eintrag "Store" mit FiPackage
```

### 5.2 Download-Badge Migration

Der Download-Badge bleibt auf dem Store-Sidebar-Eintrag:

```jsx
<Link to="/store" className={isActive('/store')}>
  <FiPackage />
  <span>Store</span>
  {downloadCount > 0 && (
    <span className="download-badge">{downloadCount}</span>
  )}
</Link>
```

---

## Phase 6: Styling

### 6.1 Gemeinsame Styles

**Datei:** `Store.css`

Zusammenführung der besten Patterns aus:
- `modelstore.css` (Modell-Karten, Progress-Bars)
- `appstore.css` (App-Karten, Status-Badges)

### 6.2 Design-System-Konformität

- **Primary Color:** #45ADFF
- **Backgrounds:** #101923, #1A2330, #2A3544
- **Cards:** 12px border-radius, hover elevation
- **Tabs:** Underline-Stil wie bestehend
- **Grid:** `repeat(auto-fill, minmax(300px, 1fr))`

---

## Phase 7: OCR-Container

### 7.1 Tesseract Container

**Manifest:** `apps/tesseract/manifest.json`

```json
{
  "id": "tesseract",
  "name": "Tesseract OCR",
  "description": "Open-Source Texterkennung für Dokumente und Bilder",
  "category": "ai",
  "appType": "official",
  "image": "tesseractshadow/tesseract4re:latest",
  "ports": [{ "internal": 8080, "external": 8085 }],
  "resources": { "memory": "1g", "cpus": "2" },
  "capabilities": ["ocr", "pdf", "multi-language"]
}
```

### 7.2 PaddleOCR Container

**Manifest:** `apps/paddleocr/manifest.json`

```json
{
  "id": "paddleocr",
  "name": "PaddleOCR",
  "description": "KI-basierte Texterkennung mit GPU-Beschleunigung",
  "category": "ai",
  "appType": "official",
  "image": "paddlecloud/paddleocr:latest",
  "ports": [{ "internal": 8080, "external": 8086 }],
  "resources": { "memory": "4g", "cpus": "4" },
  "capabilities": ["ocr", "table-recognition", "layout-analysis"]
}
```

---

## Migrations-Checkliste

### Frontend

- [ ] Neue Store-Komponenten erstellen
- [ ] Store.css mit kombinierten Styles
- [ ] App.js: Neue Routes hinzufügen
- [ ] App.js: Alte Routes entfernen
- [ ] Sidebar: Zwei Einträge → Ein Eintrag
- [ ] DownloadContext: An Store anpassen
- [ ] Tests für neue Komponenten

### Backend

- [ ] Migration 030_model_types.sql
- [ ] Store-Endpoint erstellen
- [ ] OCR-Modelle in Katalog einfügen
- [ ] Tesseract-Manifest erstellen
- [ ] PaddleOCR-Manifest erstellen
- [ ] Tests aktualisieren

### Dokumentation

- [ ] API_REFERENCE.md aktualisieren
- [ ] CLAUDE.md aktualisieren (neue Routes)
- [ ] README anpassen

---

## Risiken & Mitigationen

| Risiko | Mitigation |
|--------|------------|
| Regression in ModelStore-Funktionalität | Alle bestehenden Tests behalten und erweitern |
| DownloadContext-Kompatibilität | Schrittweise Migration, Context bleibt kompatibel |
| OCR-Container auf Jetson | ARM64-kompatible Images verwenden |
| Breaking Change für Bookmarks | Redirect-Seite mit Hinweis (optional) |

---

## Zeitschätzung

| Phase | Umfang |
|-------|--------|
| Phase 1: Grundgerüst | Mittel |
| Phase 2: Modelle-Tab | Mittel (Refactoring) |
| Phase 3: Apps-Tab | Klein (Refactoring) |
| Phase 4: Backend | Klein |
| Phase 5: Navigation | Klein |
| Phase 6: Styling | Mittel |
| Phase 7: OCR-Container | Mittel |

---

## Nächste Schritte

1. **Feedback zu diesem Plan einholen**
2. **Phase 1 starten:** Store-Grundgerüst mit Tabs
3. **Iterativ entwickeln:** Jede Phase testen bevor zur nächsten
4. **OCR separat validieren:** Container auf Jetson testen

---

## Geklärte Fragen

| Frage | Entscheidung |
|-------|--------------|
| OCR-Modelle Anzeige | Als **Typ-Filter** im Modelle-Tab (neben LLM, Vision) |
| OCR-Integration | **Automatisch** - Document-Indexer erkennt installierte OCR-Engine |

---

## Phase 8: OCR-Auto-Integration

### 8.1 Document-Indexer Erweiterung

Der Document-Indexer prüft automatisch ob eine OCR-Engine installiert ist:

```python
# document_parsers.py
async def get_available_ocr_engine():
    """Prüft welche OCR-Engine verfügbar ist."""
    # Priorität: PaddleOCR > Tesseract > None
    if await is_container_running('paddleocr'):
        return 'paddleocr'
    elif await is_container_running('tesseract'):
        return 'tesseract'
    return None

async def extract_text_from_image(image_path):
    """Extrahiert Text aus Bild mit verfügbarer OCR-Engine."""
    engine = await get_available_ocr_engine()
    if engine == 'paddleocr':
        return await call_paddleocr_api(image_path)
    elif engine == 'tesseract':
        return await call_tesseract_api(image_path)
    else:
        logger.warning("Keine OCR-Engine installiert")
        return None
```

### 8.2 Automatische PDF-OCR

Bei PDF-Upload:
1. Prüfen ob PDF durchsuchbar ist
2. Falls nicht → OCR-Engine aufrufen
3. Extrahierten Text indexieren

```python
async def process_pdf(pdf_path):
    text = extract_pdf_text(pdf_path)
    if not text or len(text.strip()) < 50:
        # PDF ist wahrscheinlich ein Scan
        ocr_text = await extract_text_from_image(pdf_to_images(pdf_path))
        text = ocr_text or text
    return text
```

---

## Finale Zusammenfassung

Der neue **Store** wird:

1. **Drei Tabs** haben: Start | Modelle | Apps
2. **Startseite** zeigt 3 empfohlene Modelle (RAM-basiert) + 3 empfohlene Apps
3. **Modelle-Tab** filtert nach Größe + Typ (LLM/OCR/Vision)
4. **Apps-Tab** zeigt Empfohlen/Alle
5. **Globale Suche** durchsucht Modelle und Apps
6. **OCR-Container** (Tesseract, PaddleOCR) erscheinen als Modell-Typ
7. **OCR-Integration** passiert automatisch im Document-Indexer
8. **URL**: `/store`, `/store/models`, `/store/apps`
9. **Alte URLs** werden entfernt

---

*Erstellt am: 2026-02-07*
*Basierend auf Benutzer-Interview*
*Status: Bereit zur Implementierung*
