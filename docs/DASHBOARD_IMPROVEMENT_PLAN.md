# Dashboard Analyse und Verbesserungsplan

**Datum:** 2026-01-05
**Analysierte Dateien:**
- `services/dashboard-frontend/src/App.js` (812 Zeilen)
- `services/dashboard-frontend/src/index.css` (2253 Zeilen)

---

## Inhaltsverzeichnis

1. [Kritische Bugs](#1-kritische-bugs)
2. [Schwellenwert-Inkonsistenzen](#2-schwellenwert-inkonsistenzen)
3. [Fehlende Features](#3-fehlende-features)
4. [24h Performance Chart Verbesserungen](#4-24h-performance-chart-verbesserungen)
5. [Design und UX Verbesserungen](#5-design-und-ux-verbesserungen)
6. [Code-Qualität](#6-code-qualität)
7. [Empfohlene Schwellenwerte](#7-empfohlene-schwellenwerte)
8. [Implementierungsplan](#8-implementierungsplan)

---

## 1. Kritische Bugs

### BUG-001: CPU Status Text zeigt falschen Wert
**Datei:** `App.js`, Zeilen 508-509
**Schweregrad:** Hoch
**Problem:** CPU zeigt bei hohen Werten "↓ Normal" statt "↓ High"

**Aktueller Code:**
```javascript
<div className={`stat-change ${metrics?.cpu < 70 ? 'stat-change-positive' : 'stat-change-negative'}`}>
  {metrics?.cpu < 70 ? '↑' : '↓'} Normal  // ← BUG: Immer "Normal"!
</div>
```

**Korrekter Code (wie bei RAM, Zeilen 521-522):**
```javascript
<div className={`stat-change ${metrics?.cpu < 70 ? 'stat-change-positive' : 'stat-change-negative'}`}>
  {metrics?.cpu < 70 ? '↑' : '↓'} {metrics?.cpu < 70 ? 'Normal' : 'High'}
</div>
```

### BUG-002: Pfeil-Logik ist semantisch falsch
**Datei:** `App.js`, Zeilen 508-509, 521-522, 545-546
**Schweregrad:** Mittel
**Problem:** Pfeile (↑/↓) suggerieren einen Trend, zeigen aber nur den aktuellen Status

**Aktuelles Verhalten:**
- `↑ Normal` = Wert ist niedrig (gut)
- `↓ High` = Wert ist hoch (schlecht)

**Problem:** Benutzer könnte denken, der Wert steigt/fällt. Besser wäre:
- Status-Badge ohne Pfeil: `Normal` / `High` / `Critical`
- ODER: Echter Trend basierend auf letztem Wert

**Empfehlung:** Status-Indikatoren ohne Pfeile:
```javascript
// Option A: Nur Status ohne Pfeil
{metrics?.cpu < 70 ? 'Normal' : (metrics?.cpu < 90 ? 'High' : 'Critical')}

// Option B: Mit Icon statt Pfeil
{metrics?.cpu < 70 ? '✓ Normal' : '⚠ High'}
```

---

## 2. Schwellenwert-Inkonsistenzen

### Aktuelle Schwellenwerte im Code:

| Metrik | Stelle | Normal | Warning | Critical |
|--------|--------|--------|---------|----------|
| **CPU/RAM/GPU** | `getProgressColor()` (Z.484-488) | < 70% | 70-90% | >= 90% |
| **CPU** | Status Badge (Z.508) | < 70% | - | >= 70% |
| **RAM** | Status Badge (Z.521) | < 70% | - | >= 70% |
| **Temperature** | Status Badge (Z.545) | < 70°C | - | >= 70°C |
| **Temperature** | Hidden Section (Z.746-747) | < 70°C | 70-80°C | > 80°C |
| **Storage** | `getProgressColor()` | < 70% | 70-90% | >= 90% |

### Problem: Zweistufige vs. Dreistufige Logik

**Top-Stats verwenden 2 Stufen:**
- Normal (< 70%)
- High (>= 70%)

**Progress Bars verwenden 3 Stufen:**
- Normal/Blau (< 70%)
- Warning/Gelb (70-90%)
- Critical/Rot (>= 90%)

### Empfehlung: Einheitliche Dreistufige Logik

```javascript
const getStatusInfo = (value, metric) => {
  const thresholds = {
    cpu:         { warning: 70, critical: 90 },
    ram:         { warning: 70, critical: 90 },
    gpu:         { warning: 70, critical: 90 },
    storage:     { warning: 70, critical: 85 },
    temperature: { warning: 65, critical: 80 }
  };

  const t = thresholds[metric];
  if (value >= t.critical) return { status: 'Critical', class: 'stat-change-critical', color: '#ef4444' };
  if (value >= t.warning)  return { status: 'Warning', class: 'stat-change-warning', color: '#f59e0b' };
  return { status: 'Normal', class: 'stat-change-positive', color: '#10b981' };
};
```

---

## 3. Fehlende Features

### MISSING-001: Keine GPU-Karte in Top-Stats
**Problem:** GPU wird im 24h-Chart angezeigt, aber hat keine eigene Top-Stat-Karte

**Lösung:** 5. Karte für GPU hinzufügen oder 4er-Grid auf 5er-Grid erweitern

**Alternative:** 2x3 Grid mit GPU und Network Speed

### MISSING-002: Storage ohne Status-Indikation
**Datei:** `App.js`, Zeilen 527-536
**Problem:** Storage zeigt nur GB-Werte, aber keinen Status-Badge

**Aktuell:**
```javascript
<div className="stat-sublabel">{formatBytes(totalDisk)}GB Total</div>
```

**Verbessert:**
```javascript
<div className={`stat-change ${metrics?.disk?.percent < 70 ? 'stat-change-positive' :
                              metrics?.disk?.percent < 90 ? 'stat-change-warning' : 'stat-change-negative'}`}>
  {metrics?.disk?.percent < 70 ? 'Normal' :
   metrics?.disk?.percent < 90 ? 'Warning' : 'Critical'} ({metrics?.disk?.percent?.toFixed(0)}%)
</div>
```

### MISSING-003: TopBar ist leer
**Datei:** `App.js`, Zeilen 423-429
**Problem:** Leere Funktion verschwendet Platz

**Aktuell:**
```javascript
function TopBar({ wsConnected, wsReconnecting, systemStatus, getStatusColor }) {
  return (
    <div className="header">
      {/* System messages removed as requested */}
    </div>
  );
}
```

**Möglichkeiten:**
1. Entfernen wenn nicht benötigt
2. Sinnvoll nutzen für:
   - WebSocket-Verbindungsstatus
   - System-Benachrichtigungen
   - Schnellzugriff-Buttons

---

## 4. 24h Performance Chart Verbesserungen

### CHART-001: Keine Y-Achsen-Einheiten

**Aktuell:** Y-Achse zeigt nur Zahlen (0, 25, 50, 75, 100)

**Verbessert:**
```javascript
<YAxis
  stroke="#94a3b8"
  style={{ fontSize: '0.85rem' }}
  tickFormatter={(value) => `${value}%`}
  domain={[0, 100]}
/>
```

### CHART-002: Tooltip ohne Einheiten

**Aktuell:**
```javascript
<Tooltip contentStyle={{...}} labelStyle={{...}} />
```

**Verbessert:**
```javascript
<Tooltip
  contentStyle={{...}}
  labelStyle={{...}}
  formatter={(value, name) => {
    const unit = name === 'Temp' ? '°C' : '%';
    return [`${value.toFixed(1)}${unit}`, name];
  }}
/>
```

### CHART-003: Fehlende Statistiken (Min/Max/Avg)

**Empfehlung:** Unter dem Chart eine Zeile mit:
```
CPU: Avg 45% | Max 78% | Min 12%  |  RAM: Avg 62% | Max 85% | Min 45%  | ...
```

**Implementation:**
```javascript
const calculateStats = (data, key) => {
  if (!data || data.length === 0) return { avg: 0, max: 0, min: 0 };
  const values = data.map(d => d[key]).filter(v => v !== undefined);
  return {
    avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
    max: Math.max(...values).toFixed(1),
    min: Math.min(...values).toFixed(1)
  };
};
```

### CHART-004: Zeitachse ohne Datum bei 24h

**Problem:** Bei 24h Daten zeigt die X-Achse nur Uhrzeit, nicht das Datum

**Aktuell:**
```javascript
time: new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
```

**Verbessert für 24h:**
```javascript
time: new Date(timestamp).toLocaleString('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit'
})
// Oder intelligente Formatierung basierend auf Zeitspanne
```

### CHART-005: Legende ist nicht interaktiv

**Empfehlung:** Klickbare Legende zum Ein/Ausblenden einzelner Linien

```javascript
const [visibleLines, setVisibleLines] = useState({ CPU: true, RAM: true, GPU: true, Temp: true });

<Legend
  onClick={(e) => setVisibleLines({...visibleLines, [e.dataKey]: !visibleLines[e.dataKey]})}
  payload={[
    { value: 'CPU', type: 'line', color: '#45ADFF', inactive: !visibleLines.CPU },
    ...
  ]}
/>
```

---

## 5. Design und UX Verbesserungen

### UX-001: Hover-Details auf Stat-Karten

**Problem:** Keine zusätzlichen Infos beim Hover über Stat-Karten

**Empfehlung:** Tooltip oder Expand mit:
- Durchschnitt letzte Stunde
- Höchstwert heute
- Trend (steigend/fallend)

### UX-002: Responsive Chart-Höhe

**Aktuell:** Feste Höhe von 300px

```javascript
<ResponsiveContainer width="100%" height={300}>
```

**Verbessert:**
```javascript
// In CSS
.chart-container {
  height: 300px;
}

@media (max-width: 768px) {
  .chart-container {
    height: 200px;
  }
}

@media (max-width: 576px) {
  .chart-container {
    height: 180px;
  }
}
```

### UX-003: Kein Echtzeit-Indikator

**Problem:** Benutzer sieht nicht, wann Daten zuletzt aktualisiert wurden

**Empfehlung:** "Zuletzt aktualisiert: vor 3 Sekunden" Anzeige

### UX-004: Keine Warnung bei kritischen Werten

**Problem:** Kritische Werte werden nur farblich hervorgehoben, keine aktive Warnung

**Empfehlung:** Bei kritischen Werten:
- Pulsierender Rahmen um die Karte
- Optional: Toast-Benachrichtigung
- Sound-Option (mit Benutzereinstellung)

### UX-005: Service-Links Grid nicht optimal

**Aktuell:** 2-Spalten Grid fest definiert

**Problem:** Bei nur 1 App wird eine halbe Zeile verschwendet

**Empfehlung:** Auto-fit Grid:
```css
.service-links-modern {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
```

---

## 6. Code-Qualität

### CODE-001: Hidden/Dead Code entfernen

**Datei:** `App.js`, Zeilen 669-806
**Problem:** Großer Block mit `style={{ display: 'none' }}`

```javascript
<div className="metrics-overview" style={{ display: 'none' }}>
  {/* ~140 Zeilen versteckter Code */}
</div>
```

**Empfehlung:** Entfernen oder als separate Komponente für alternativen View auslagern

### CODE-002: Doppelte Schwellenwert-Logik

**Problem:** Schwellenwerte sind an mehreren Stellen hardcoded

**Empfehlung:** Zentrale Konstanten-Datei:
```javascript
// src/constants/thresholds.js
export const THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  ram: { warning: 70, critical: 90 },
  gpu: { warning: 70, critical: 90 },
  storage: { warning: 70, critical: 85 },
  temperature: { warning: 65, critical: 80 }
};
```

### CODE-003: Fehlende PropTypes/TypeScript

**Problem:** Keine Typ-Validierung für Komponenten-Props

**Empfehlung:** PropTypes hinzufügen oder TypeScript Migration

### CODE-004: CSS-Klasse für stat-change-warning fehlt

**Datei:** `index.css`
**Problem:** Nur `stat-change-positive` und `stat-change-negative` existieren

**Fehlend:**
```css
.stat-change-warning {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.2);
}
```

---

## 7. Empfohlene Schwellenwerte

### Basierend auf Jetson AGX Orin Spezifikationen:

| Metrik | Normal | Warning | Critical | Begründung |
|--------|--------|---------|----------|------------|
| **CPU** | < 70% | 70-85% | > 85% | ARM-CPUs throtteln bei hoher Last |
| **RAM** | < 70% | 70-85% | > 85% | 64GB, Swap vermeiden |
| **GPU** | < 80% | 80-90% | > 90% | Jetson GPU toleriert höhere Last |
| **Storage** | < 70% | 70-85% | > 85% | SSD Performance sinkt bei Füllstand |
| **Temperatur** | < 60°C | 60-75°C | > 75°C | Jetson drosselt bei ~80°C |

### Anpassbare Umgebungsvariablen:

Die `.env` enthält bereits Self-Healing Schwellenwerte:
```bash
DISK_WARNING_PERCENT=80
DISK_CLEANUP_PERCENT=90
DISK_CRITICAL_PERCENT=95
CPU_CRITICAL_PERCENT=90
RAM_CRITICAL_PERCENT=90
```

**Empfehlung:** Dashboard sollte diese Werte aus der API laden, nicht hardcoden.

---

## 8. Implementierungsplan

### Phase 1: Bug-Fixes (Priorität Hoch)

| Task | Datei | Zeilen | Aufwand |
|------|-------|--------|---------|
| CPU Status Text Fix | App.js | 508-509 | 5 min |
| Storage Status Badge hinzufügen | App.js | 527-536 | 15 min |
| `stat-change-warning` CSS hinzufügen | index.css | - | 5 min |

### Phase 2: Schwellenwert-Vereinheitlichung (Priorität Mittel)

| Task | Datei | Aufwand |
|------|-------|---------|
| Zentrale Thresholds-Konstanten erstellen | constants/thresholds.js | 30 min |
| getStatusInfo() Funktion implementieren | App.js | 45 min |
| Alle Stat-Karten auf neue Logik umstellen | App.js | 30 min |
| Dreistufige Farblogik konsistent anwenden | App.js | 20 min |

### Phase 3: Chart-Verbesserungen (Priorität Mittel)

| Task | Datei | Aufwand |
|------|-------|---------|
| Y-Achse mit Einheiten | App.js | 10 min |
| Tooltip mit Einheiten | App.js | 15 min |
| Min/Max/Avg Statistiken | App.js | 45 min |
| Interaktive Legende | App.js | 30 min |

### Phase 4: UX-Verbesserungen (Priorität Niedrig)

| Task | Datei | Aufwand |
|------|-------|---------|
| GPU als 5. Stat-Karte | App.js | 30 min |
| Responsive Chart-Höhe | index.css | 15 min |
| "Zuletzt aktualisiert" Anzeige | App.js | 20 min |
| Kritische-Werte-Animation | index.css | 20 min |

### Phase 5: Code-Cleanup (Priorität Niedrig)

| Task | Datei | Aufwand |
|------|-------|---------|
| Hidden Code entfernen/refactoren | App.js | 20 min |
| TopBar sinnvoll nutzen oder entfernen | App.js | 15 min |
| PropTypes hinzufügen | App.js | 45 min |

---

## Zusammenfassung

### Kritische Fixes (Sofort):
1. **BUG-001:** CPU Status Text korrigieren
2. **MISSING-002:** Storage Status-Badge hinzufügen
3. **CODE-004:** Warning CSS-Klasse hinzufügen

### Empfohlene Verbesserungen (Kurzfristig):
1. Einheitliche Dreistufige Schwellenwert-Logik
2. Chart Tooltip mit Einheiten
3. Y-Achse mit % Beschriftung

### Nice-to-Have (Langfristig):
1. GPU Stat-Karte
2. Min/Max/Avg Statistiken
3. Interaktive Chart-Legende
4. Echtzeit-Update-Indikator

---

## Anhang: Aktuelle Farbcodes

```css
/* Status-Farben */
--success-color: #10b981;    /* Grün - Normal */
--warning-color: #f59e0b;    /* Orange - Warning */
--danger-color: #ef4444;     /* Rot - Critical */
--primary-color: #45ADFF;    /* Blau - Akzent */

/* Chart-Linien */
CPU:  #45ADFF (Blau)
RAM:  #8b5cf6 (Lila)
GPU:  #06b6d4 (Cyan)
Temp: #f59e0b (Orange)
```
