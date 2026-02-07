# Datentabellen Excel-like Editor - Refactoring Plan

## Übersicht

Dieses Dokument beschreibt den vollständigen Plan zur Überarbeitung des Datentabellen-Features mit Fokus auf:
1. **Entfernung aller YAML-Implementierungen** - Nur PostgreSQL bleibt
2. **Excel-ähnliche Benutzeroberfläche** - Fullscreen-Editor mit Inline-Bearbeitung
3. **KI-SQL-Generation** - Natürlichsprachliche Abfragen für Tabellendaten
4. **Bugfixes und Layout-Optimierung**

---

## Phase 1: Cleanup - YAML-Implementierungen entfernen

### 1.1 Frontend-Dateien entfernen

| Datei | Aktion | Begründung |
|-------|--------|------------|
| `services/dashboard-frontend/src/components/YamlGridEditor.js` | Löschen | YAML-Grid nicht mehr benötigt |
| `services/dashboard-frontend/src/components/YamlCreateDialog.js` | Löschen | YAML-Erstellungsdialog nicht mehr benötigt |
| `services/dashboard-frontend/src/yamltable.css` | Löschen | Zugehörige Styles |

### 1.2 Backend-Dateien entfernen

| Datei | Aktion | Begründung |
|-------|--------|------------|
| `services/dashboard-backend/src/routes/yamlTables.js` | Löschen | YAML-API-Routes |
| `services/dashboard-backend/src/services/yamlQueryService.js` | Löschen | YAML-Query-Service |

### 1.3 Referenzen bereinigen

- **App.js**: Entferne Lazy-Imports für YamlGridEditor
- **DocumentManager.js**: Entferne YAML-Tabellen-Integration (falls vorhanden)
- **index.js (Backend)**: Entferne `/yaml-tables` Route-Mount

### 1.4 Shared Components behalten

Die folgenden Shared Components werden für Datentabellen wiederverwendet:
- `services/dashboard-frontend/src/components/shared/GridEditor/CellEditor.js`
- `services/dashboard-frontend/src/components/shared/GridEditor/DataCell.js`
- `services/dashboard-frontend/src/components/shared/GridEditor/FieldTypes.js`
- `services/dashboard-frontend/src/components/shared/GridEditor/index.js`

---

## Phase 2: Excel-like Fullscreen Editor

### 2.1 Neue Komponenten-Architektur

```
src/components/Database/
├── index.js                    # Export barrel
├── Database.css                # Gemeinsame Styles
├── DatabaseOverview.js         # Tabellenübersicht (existiert)
├── DatabaseTable.js            # Einzeltabellen-View (existiert, wird überarbeitet)
├── ExcelEditor.js              # NEU: Haupt-Excel-Editor
├── ExcelToolbar.js             # NEU: Toolbar mit Aktionen
├── ExcelGrid.js                # NEU: Die eigentliche Tabelle
├── ExcelCell.js                # NEU: Zellen-Komponente
├── InlineColumnCreator.js      # NEU: Inline-Spalten-Erstellung
├── ColumnMenu.js               # NEU: Spalten-Kontextmenü
├── CellContextMenu.js          # NEU: Zellen-Kontextmenü
└── ExcelKeyboardHandler.js     # NEU: Keyboard-Event-Handler
```

### 2.2 ExcelEditor - Hauptkomponente

**Datei:** `services/dashboard-frontend/src/components/Database/ExcelEditor.js`

**Features:**
- Fullscreen-Layout (volle verfügbare Breite/Höhe)
- Sticky Header für Spaltennamen
- Virtuelles Scrollen für große Datensätze (>1000 Zeilen)
- Keyboard-Navigation (Pfeiltasten, Tab, Enter, Escape)
- Undo/Redo Stack (50 Aktionen)
- Copy/Paste via Ctrl+C/V/X
- Multi-Zellen-Selektion (Shift+Klick)

**State-Management:**
```javascript
const [table, setTable] = useState(null);           // Tabellen-Metadaten
const [rows, setRows] = useState([]);               // Zeilendaten
const [fields, setFields] = useState([]);           // Spalten-Definition
const [activeCell, setActiveCell] = useState({row: 0, col: 0});
const [editingCell, setEditingCell] = useState(null);
const [selectedCells, setSelectedCells] = useState(new Set());
const [clipboard, setClipboard] = useState(null);
const [undoStack, setUndoStack] = useState([]);
const [redoStack, setRedoStack] = useState([]);
const [columnWidths, setColumnWidths] = useState({});
```

### 2.3 Inline-Spalten-Erstellung

**Datei:** `services/dashboard-frontend/src/components/Database/InlineColumnCreator.js`

**UX-Flow:**
1. Letzte Spalte zeigt "+" Button
2. Klick öffnet Inline-Input direkt im Header
3. User tippt Spaltenname ein
4. Nach Enter: Dropdown zur Typ-Auswahl erscheint
5. Nach Typ-Auswahl: Spalte wird erstellt
6. Focus springt zur neuen Spalte

**Implementierung:**
```javascript
const InlineColumnCreator = memo(function InlineColumnCreator({ tableSlug, onColumnAdded }) {
    const [mode, setMode] = useState('button'); // 'button' | 'name' | 'type'
    const [name, setName] = useState('');
    const [selectedType, setSelectedType] = useState('text');
    const inputRef = useRef(null);

    const handleNameSubmit = () => {
        if (!name.trim()) {
            setMode('button');
            return;
        }
        setMode('type');
    };

    const handleTypeSelect = async (type) => {
        try {
            await axios.post(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields`, {
                name: name.trim(),
                field_type: type,
                is_required: false,
                is_unique: false
            });
            onColumnAdded();
            setName('');
            setMode('button');
        } catch (err) {
            console.error('Fehler beim Erstellen der Spalte:', err);
        }
    };

    // ... render logic
});
```

### 2.4 Schnelles Zeilen-Hinzufügen

**Konzept:** Die letzte Zeile ist immer eine "Geisterzeile" (ghost row)
- Erscheint ausgegraut/gedimmt
- Bei Eingabe in beliebige Zelle: Zeile wird erstellt
- Neue Geisterzeile erscheint darunter

**Implementierung:**
```javascript
// In ExcelGrid.js
const VisibleRows = useMemo(() => {
    const allRows = [...rows];
    // Füge Geisterzeile hinzu
    allRows.push({
        _id: 'ghost',
        _isGhost: true,
        ...fields.reduce((acc, f) => ({ ...acc, [f.slug]: '' }), {})
    });
    return allRows;
}, [rows, fields]);

const handleGhostRowEdit = async (fieldSlug, value) => {
    // Erstelle neue Zeile via API
    const newRow = await axios.post(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {
        [fieldSlug]: value
    });
    // Füge zur Liste hinzu
    setRows(prev => [...prev, newRow.data.data]);
};
```

### 2.5 Keyboard-Navigation

**Datei:** `services/dashboard-frontend/src/components/Database/ExcelKeyboardHandler.js`

**Tastenkombinationen:**
| Taste | Aktion |
|-------|--------|
| ↑↓←→ | Zellen-Navigation |
| Tab | Nächste Zelle (Shift+Tab: Vorherige) |
| Enter | Bearbeitung starten / Speichern + Nächste Zeile |
| Escape | Bearbeitung abbrechen |
| F2 | Bearbeitung starten (wie Excel) |
| Delete | Zelleninhalt löschen |
| Ctrl+C | Kopieren |
| Ctrl+X | Ausschneiden |
| Ctrl+V | Einfügen |
| Ctrl+Z | Rückgängig |
| Ctrl+Y / Ctrl+Shift+Z | Wiederholen |
| Ctrl+S | Speichern (bei Autosave optional) |
| Ctrl+A | Alle Zellen auswählen |

### 2.6 Spalten-Resize und Sortierung

**Resize:**
- Drag-Handle am rechten Rand jeder Spaltenüberschrift
- Spaltenbreiten werden im localStorage gespeichert
- Mindestbreite: 80px, Maximalbreite: 600px

**Sortierung:**
- Klick auf Spaltenüberschrift: ASC Sortierung
- Erneuter Klick: DESC Sortierung
- Dritter Klick: Sortierung entfernen
- Sortier-Indikator (Chevron) in der Überschrift

---

## Phase 3: KI-SQL-Generation Layer

### 3.1 Erweiterung des LLM Data Access Service

**Datei:** `services/dashboard-backend/src/services/llmDataAccessService.js`

**Neue Funktion: `generate_sql`**
```javascript
/**
 * Generate and execute SQL from natural language query
 * @param {string} query - Natural language query
 * @param {string} tableSlug - Target table slug
 * @returns {Object} { sql, results, explanation }
 */
async generate_sql(query, tableSlug = null) {
    // 1. Hole Tabellen-Schema
    const tables = await this.getTableSchemas(tableSlug);

    // 2. Erstelle Prompt für LLM
    const prompt = this.buildSQLPrompt(query, tables);

    // 3. Rufe LLM für SQL-Generation auf
    const llmResponse = await this.callLLM(prompt);

    // 4. Validiere generiertes SQL (nur SELECT erlaubt)
    const sql = this.validateAndSanitizeSQL(llmResponse.sql);

    // 5. Führe SQL aus
    const results = await dataDb.query(sql);

    return {
        sql,
        results: results.rows,
        explanation: llmResponse.explanation
    };
}
```

### 3.2 SQL-Sicherheit

**Erlaubte Operationen:**
- Nur SELECT-Statements
- Keine Subqueries mit INSERT/UPDATE/DELETE
- Keine DDL-Befehle (CREATE, DROP, ALTER)
- Parametrisierte Werte wo möglich

**Validierung:**
```javascript
validateAndSanitizeSQL(sql) {
    // Nur SELECT erlauben
    if (!sql.trim().toLowerCase().startsWith('select')) {
        throw new Error('Only SELECT statements allowed');
    }

    // Blockliste für gefährliche Keywords
    const blocked = ['insert', 'update', 'delete', 'drop', 'create', 'alter',
                     'truncate', 'grant', 'revoke', 'exec', 'execute'];

    const lowerSQL = sql.toLowerCase();
    for (const keyword of blocked) {
        if (lowerSQL.includes(keyword)) {
            throw new Error(`SQL keyword "${keyword}" not allowed`);
        }
    }

    return sql;
}
```

### 3.3 Neue API-Endpoints

**Route:** `POST /api/v1/datentabellen/query/natural`

**Request:**
```json
{
    "query": "Zeige mir alle Produkte über 100€ sortiert nach Preis",
    "tableSlug": "produkte"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "sql": "SELECT * FROM data_produkte WHERE preis > 100 ORDER BY preis DESC",
        "results": [...],
        "explanation": "Ich habe alle Produkte gefunden, deren Preis über 100€ liegt...",
        "rowCount": 25
    }
}
```

### 3.4 Frontend-Integration

**Neues Feature im ExcelEditor:**
- Chat-Icon in der Toolbar
- Öffnet Eingabefeld für natürlichsprachliche Abfragen
- Ergebnisse werden in der Tabelle hervorgehoben
- Option: Ergebnisse als gefilterte Ansicht zeigen

---

## Phase 4: Layout-Fixes und Responsive Design

### 4.1 Sidebar-Überlappung beheben

**Problem:** Tabelle wird abgeschnitten wenn Sidebar geöffnet ist

**Lösung in `index.css`:**
```css
.app {
    display: flex;
    height: 100vh;
    overflow: hidden;
}

.sidebar {
    flex-shrink: 0;
    width: var(--sidebar-width);
    transition: width 0.3s ease;
}

.sidebar.collapsed {
    width: var(--sidebar-width-collapsed);
}

.container {
    flex: 1;
    min-width: 0; /* Ermöglicht Schrumpfen unter min-content */
    overflow-y: auto;
    overflow-x: hidden;
}
```

### 4.2 Fullscreen-Editor Layout

**Neue CSS-Klassen in `Database.css`:**
```css
.excel-editor-fullscreen {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px); /* Minus Header-Höhe */
    width: 100%;
    overflow: hidden;
    background: var(--bg-dark);
}

.excel-toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-card);
}

.excel-grid-container {
    flex: 1;
    overflow: auto;
    position: relative;
}

.excel-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
}

.excel-table th,
.excel-table td {
    padding: 0;
    border: 1px solid var(--border-color);
    height: 32px;
}

.excel-cell-content {
    padding: 4px 8px;
    height: 100%;
    display: flex;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
```

### 4.3 Responsive Breakpoints

**Mobile (< 768px):**
- Toolbar wird vertikal
- Spalten können horizontal gescrollt werden
- Mindestbreite der Tabelle: 600px

**Tablet (768px - 1024px):**
- Toolbar passt sich an
- Spalten-Resize funktioniert per Touch

**Desktop (> 1024px):**
- Volle Funktionalität
- Spalten-Resize per Drag
- Keyboard-Shortcuts aktiv

---

## Phase 5: Bugs und Edge Cases

### 5.1 Kritische Bugs zu beheben

| Bug | Datei | Problem | Lösung |
|-----|-------|---------|--------|
| Race Condition Autosave | DataTableEditor.js | Stale State bei schnellen Edits | Functional State Updates verwenden |
| Search Pagination | DatabaseTable.js:797-802 | Reset nur bei Start, nicht bei Clear | Immer auf Page 1 bei Search-Änderung |
| Required Field Validation | CellEditor.js | Keine Erzwingung bei Pflichtfeldern | Validierung bei Blur hinzufügen |
| Duplicate CSS Rules | Database.css | Doppelte Definitionen | CSS bereinigen |

### 5.2 Undo/Redo Stack Fix

```javascript
// Korrektur für Race Condition
const handleCellSave = useCallback((rowId, fieldSlug, newValue, direction) => {
    const oldValue = rows.find(r => r._id === rowId)?.[fieldSlug];

    // Verwende functional update
    setRows(prevRows => {
        const newRows = prevRows.map(row =>
            row._id === rowId ? { ...row, [fieldSlug]: newValue } : row
        );
        return newRows;
    });

    // Undo-Stack mit korrektem State
    setUndoStack(prev => [
        ...prev.slice(-MAX_UNDO_HISTORY + 1),
        { rowId, fieldSlug, oldValue, newValue }
    ]);
    setRedoStack([]);

    // API-Call
    updateCell(rowId, fieldSlug, newValue);
}, [rows, updateCell]);
```

---

## Phase 6: Performance-Optimierungen

### 6.1 Virtuelles Scrollen

**Für große Datensätze (>500 Zeilen):**
```javascript
import { FixedSizeList as List } from 'react-window';

const VirtualizedGrid = memo(function VirtualizedGrid({ rows, fields, rowHeight = 32 }) {
    const Row = ({ index, style }) => {
        const row = rows[index];
        return (
            <div style={style} className="excel-row">
                {fields.map(field => (
                    <ExcelCell
                        key={field.slug}
                        row={row}
                        field={field}
                    />
                ))}
            </div>
        );
    };

    return (
        <List
            height={window.innerHeight - 120}
            itemCount={rows.length}
            itemSize={rowHeight}
        >
            {Row}
        </List>
    );
});
```

### 6.2 Debouncing und Memoization

```javascript
// Debounced Search
const debouncedSearch = useMemo(
    () => debounce((query) => fetchRows(1, query), 300),
    [fetchRows]
);

// Memoized Rows
const sortedRows = useMemo(() => {
    if (!sortField) return rows;
    return [...rows].sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        return sortOrder === 'asc'
            ? String(aVal).localeCompare(String(bVal))
            : String(bVal).localeCompare(String(aVal));
    });
}, [rows, sortField, sortOrder]);
```

---

## Implementierungs-Reihenfolge

### Sprint 1: Cleanup (2-3 Stunden) ✅ ABGESCHLOSSEN
1. [x] YAML-Dateien entfernen
2. [x] Referenzen bereinigen
3. [x] Tests anpassen

### Sprint 2: Excel Editor Grundstruktur (4-6 Stunden) ✅ ABGESCHLOSSEN
1. [x] ExcelEditor.js Grundstruktur
2. [x] ExcelGrid.js mit Zellen (integriert in ExcelEditor.js)
3. [x] ExcelToolbar.js (integriert in ExcelEditor.js)
4. [x] CSS-Anpassungen für Fullscreen

### Sprint 3: Inline-Features (3-4 Stunden) ✅ ABGESCHLOSSEN
1. [x] InlineColumnCreator.js (integriert in ExcelEditor.js)
2. [x] Ghost-Row für schnelles Hinzufügen
3. [x] Spalten-Resize
4. [x] Sortierung

### Sprint 4: Keyboard & Clipboard (3-4 Stunden) ✅ ABGESCHLOSSEN
1. [x] ExcelKeyboardHandler.js (integriert in ExcelEditor.js)
2. [x] Navigation (Pfeiltasten, Tab)
3. [x] Copy/Paste/Cut
4. [x] Undo/Redo

### Sprint 5: KI-Integration (4-5 Stunden) ✅ ABGESCHLOSSEN
1. [x] SQL-Generation Service erweitern
2. [x] Neue API-Endpoints
3. [x] Frontend Chat-Integration
4. [x] Sicherheits-Validierung

### Sprint 6: Layout & Polishing (2-3 Stunden) ✅ ABGESCHLOSSEN
1. [x] Sidebar-Fix (min-width: 0 für Container)
2. [x] Responsive Design (Tablet, Mobile, Small Mobile)
3. [ ] Performance-Optimierung (virtuelles Scrollen - optional)
4. [x] Bug-Fixes (unbenutzte Variablen entfernt)

---

## Dateien-Änderungen Zusammenfassung

### Zu löschende Dateien:
- `services/dashboard-frontend/src/components/YamlGridEditor.js`
- `services/dashboard-frontend/src/components/YamlCreateDialog.js`
- `services/dashboard-frontend/src/yamltable.css`
- `services/dashboard-backend/src/routes/yamlTables.js`
- `services/dashboard-backend/src/services/yamlQueryService.js`

### Neue Dateien:
- `services/dashboard-frontend/src/components/Database/ExcelEditor.js`
- `services/dashboard-frontend/src/components/Database/ExcelGrid.js`
- `services/dashboard-frontend/src/components/Database/ExcelToolbar.js`
- `services/dashboard-frontend/src/components/Database/ExcelCell.js`
- `services/dashboard-frontend/src/components/Database/InlineColumnCreator.js`
- `services/dashboard-frontend/src/components/Database/ColumnMenu.js`
- `services/dashboard-frontend/src/components/Database/CellContextMenu.js`
- `services/dashboard-frontend/src/components/Database/ExcelKeyboardHandler.js`

### Zu modifizierende Dateien:
- `services/dashboard-frontend/src/App.js` - YAML-Imports entfernen
- `services/dashboard-frontend/src/components/Database/Database.css` - Neue Styles
- `services/dashboard-frontend/src/index.css` - Layout-Fixes
- `services/dashboard-backend/src/index.js` - YAML-Route entfernen
- `services/dashboard-backend/src/services/llmDataAccessService.js` - SQL-Generation

---

## Akzeptanzkriterien

### Funktional:
- [x] Tabelle nimmt volle Bildschirmbreite/-höhe ein
- [x] Inline-Spalten-Erstellung funktioniert
- [x] Typ-Auswahl nach Nameneingebeeingabe
- [x] Keyboard-Navigation wie in Excel
- [x] Copy/Paste funktioniert system-übergreifend
- [x] Undo/Redo bis 50 Schritte
- [x] Sortierung per Klick auf Spaltenüberschrift
- [x] Spalten-Resize per Drag
- [x] Schnelles Zeilen-Hinzufügen via Ghost-Row
- [x] KI kann Tabellendaten via SQL abfragen (Phase 3)

### Performance:
- [ ] Tabellen mit 1000+ Zeilen laden in <2 Sekunden
- [ ] Keine Lag bei Keyboard-Navigation
- [ ] Virtuelles Scrollen bei >500 Zeilen

### Design:
- [ ] Folgt dem Arasul Design System
- [x] Primärfarbe: #45ADFF
- [x] Dark Theme: #101923 / #1A2330
- [x] Responsive auf Mobile/Tablet/Desktop

### Bugs behoben:
- [x] Keine Sidebar-Überlappung mehr (min-width: 0 Fix)
- [x] Search Pagination funktioniert korrekt
- [x] Keine Race Conditions bei Autosave (functional state updates)

---

## Geschätzte Gesamtzeit

| Phase | Geschätzte Zeit |
|-------|-----------------|
| Cleanup | 2-3 Stunden |
| Excel Editor | 4-6 Stunden |
| Inline-Features | 3-4 Stunden |
| Keyboard & Clipboard | 3-4 Stunden |
| KI-Integration | 4-5 Stunden |
| Layout & Polishing | 2-3 Stunden |
| **Gesamt** | **18-25 Stunden** |

---

*Plan erstellt: 07.02.2026*
*Letzte Aktualisierung: 07.02.2026*

---

## Implementierungsfortschritt

### Phase 1 & 2 abgeschlossen (07.02.2026)

**Erstellt:**
- `ExcelEditor.js` - Vollständiger Excel-like Fullscreen Editor mit:
  - InlineColumnCreator für Inline-Spalten-Erstellung
  - CellEditor für verschiedene Feldtypen
  - ColumnMenu für Spaltenaktionen (Umbenennen, Typ ändern, Löschen)
  - CellContextMenu für Rechtsklick-Aktionen
  - Ghost-Row für schnelles Zeilen-Hinzufügen
  - Keyboard-Navigation (Pfeiltasten, Tab, Enter, F2, Escape, Delete)
  - Clipboard-Support (Ctrl+C/X/V)
  - Undo/Redo (Ctrl+Z/Y)
  - Spalten-Resize per Drag
  - Sortierung per Klick auf Spaltenüberschrift
  - Pagination mit konfigurierbarer Seitengröße
  - CSV-Export

**Gelöscht:**
- `YamlGridEditor.js`
- `YamlCreateDialog.js`
- `yamltable.css`
- `yamlTables.js` (Backend)
- `yamlQueryService.js` (Backend)

**Modifiziert:**
- `DatabaseTable.js` - Verwendet jetzt ExcelEditor
- `App.js` - Routing für /database und /database/:slug hinzugefügt, Navigation mit "Tabellen" Link
- `index.js` (Backend) - YAML-Route entfernt

### Phase 3 abgeschlossen (07.02.2026)

**Erweitert:**
- `llmDataAccessService.js` - Neue Funktionen:
  - `getTableSchema()` - Holt Schema einer Tabelle
  - `getAllTableSchemas()` - Holt alle Tabellen-Schemas
  - `validateSQL()` - Validiert SQL (nur SELECT, keine gefährlichen Keywords)
  - `generateAndExecuteSQL()` - Generiert SQL aus natürlicher Sprache via LLM
  - `executeValidatedSQL()` - Führt validiertes SQL aus

- `datentabellen/index.js` - Neue API-Endpoints:
  - `POST /api/v1/datentabellen/query/natural` - Natürlichsprachliche Abfragen
  - `POST /api/v1/datentabellen/query/sql` - Direkte SQL-Ausführung (validiert)
  - `GET /api/v1/datentabellen/schema/:tableSlug` - Tabellen-Schema
  - `GET /api/v1/datentabellen/schemas` - Alle Schemas

- `ExcelEditor.js` - Neue Komponente:
  - `AIQueryPanel` - Seitenpanel für KI-Abfragen
  - Button "KI-Abfrage" in der Toolbar
  - Filterbare Ergebnisanzeige mit "Als Filter anwenden"
  - Beispielabfragen als Inspiration

- `Database.css` - Neue Styles für AI-Panel

**Sicherheitsfeatures:**
- Nur SELECT-Statements erlaubt
- Blockliste für gefährliche SQL-Keywords
- Keine SQL-Kommentare erlaubt
- Keine mehrfachen Statements
- Validierung vor Ausführung

### Phase 4 abgeschlossen (07.02.2026)

**Layout-Fixes (index.css):**
- Container: `min-width: 0` hinzugefügt - ermöglicht korrektes Schrumpfen im Flex-Container
- Container: `overflow-x: hidden` hinzugefügt
- Neue Varianten: `.container--fullscreen`, `.container--dense`

**Responsive Design (Database.css):**
- Tablet-Breakpoint (≤1024px):
  - Toolbar flex-wrap
  - Kleinere Buttons und Schriftgrößen
  - Grid-Anpassungen
- Mobile-Breakpoint (≤768px):
  - Header/Toolbar wrap
  - Button-Text ausgeblendet (außer wichtige)
  - Pagination vertikal
  - Mindestbreite für Tabellenzellen
  - 16px Schriftgröße für Inputs (verhindert iOS-Zoom)
- Small Mobile (≤480px):
  - Kompaktes Padding
  - Alle Button-Texte ausgeblendet
  - Pagination-Text ausgeblendet

**Bug-Fixes:**
- `DatabaseOverview.js`: Unbenutzten `useNavigate` Import entfernt
