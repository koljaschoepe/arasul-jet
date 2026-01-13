# Arasul Design System

**Version**: 1.0.0
**Letzte Aktualisierung**: 2026-01-13

> Verbindliche Designrichtlinien für alle Frontend-Implementierungen.
> Claude Code MUSS diese Richtlinien bei jeder Codeänderung im Frontend befolgen.

---

## Inhaltsverzeichnis

1. [Design-Philosophie](#design-philosophie)
2. [Farbpalette](#farbpalette)
3. [Typografie](#typografie)
4. [Spacing-System](#spacing-system)
5. [Border & Radius](#border--radius)
6. [Schatten & Effekte](#schatten--effekte)
7. [Komponenten-Patterns](#komponenten-patterns)
8. [Responsive Design](#responsive-design)
9. [Animationen](#animationen)
10. [Checkliste für neue Komponenten](#checkliste-für-neue-komponenten)

---

## Design-Philosophie

### Kernprinzipien

1. **Minimalismus** - Nur das Wesentliche, keine überflüssigen Elemente
2. **Konsistenz** - Gleiche Patterns für gleiche Funktionen
3. **Dark-First** - Dunkles Theme als Standard für Jetson Edge-Device
4. **Klarheit** - Klare Hierarchie durch Farbe, Größe und Spacing
5. **Performance** - Leichtgewichtige CSS-Lösungen, keine schweren Frameworks

### Farbphilosophie

Die Arasul-Plattform verwendet eine **monochrome Basis** mit **Blau als einziger Akzentfarbe**:
- **Schwarz/Dunkelgrau** → Hintergründe, Tiefe
- **Graustufen** → Text-Hierarchie, Borders, sekundäre Elemente
- **Weiß/Hellgrau** → Primärer Text, wichtige Labels
- **Blau (#45ADFF)** → Interaktive Elemente, Aktionen, Fokus

---

## Farbpalette

### Primärfarbe (Blau)

Die einzige Akzentfarbe. Für alle interaktiven Elemente verwenden.

```css
--primary-color: #45ADFF;        /* Hauptfarbe für Buttons, Links, Aktionen */
--primary-hover: #6EC4FF;        /* Hover-Zustand (10% heller) */
--primary-active: #2D8FD9;       /* Active/Pressed-Zustand (10% dunkler) */
--primary-muted: rgba(69, 173, 255, 0.15);  /* Hintergrund-Akzent */
--primary-glow: rgba(69, 173, 255, 0.4);    /* Glow-Effekte */
```

| Verwendung | Farbe | Hex |
|------------|-------|-----|
| Buttons, Links, Icons (aktiv) | Primary | `#45ADFF` |
| Hover-Zustand | Primary Hover | `#6EC4FF` |
| Active/Pressed | Primary Active | `#2D8FD9` |
| Akzent-Hintergrund | Primary Muted | `rgba(69, 173, 255, 0.15)` |
| Fokus-Ring, Glow | Primary Glow | `rgba(69, 173, 255, 0.4)` |

### Graustufen (Neutral)

Für Hintergründe, Text und Strukturelemente.

```css
/* Dunkle Töne (Hintergründe) */
--bg-dark: #101923;              /* Dunkelster Hintergrund */
--bg-card: #1A2330;              /* Karten, Container */
--bg-card-hover: #222D3D;        /* Hover auf Karten */
--bg-elevated: #2A3544;          /* Erhöhte Elemente, Dropdowns */

/* Borders */
--border-color: #2A3544;         /* Standard Border */
--border-subtle: #1D2835;        /* Subtile Trennung */
--border-strong: #3A4554;        /* Betonte Border */

/* Text */
--text-primary: #F8FAFC;         /* Haupttext (fast weiß) */
--text-secondary: #CBD5E1;       /* Sekundärer Text */
--text-muted: #94A3B8;           /* Gedämpfter Text, Labels */
--text-disabled: #64748B;        /* Deaktivierter Text */
```

| Graustufe | Hex | Verwendung |
|-----------|-----|------------|
| Gray 900 | `#0F172A` | Dunkelste Flächen |
| Gray 850 | `#101923` | Haupt-Hintergrund |
| Gray 800 | `#1A2330` | Karten-Hintergrund |
| Gray 750 | `#222D3D` | Hover-Zustand auf Karten |
| Gray 700 | `#2A3544` | Erhöhte Elemente, Borders |
| Gray 600 | `#3A4554` | Starke Borders |
| Gray 500 | `#64748B` | Deaktivierter Text |
| Gray 400 | `#94A3B8` | Gedämpfter Text |
| Gray 300 | `#CBD5E1` | Sekundärer Text |
| Gray 200 | `#E2E8F0` | Subtiler Text (selten) |
| Gray 100 | `#F8FAFC` | Primärer Text |

### Status-Farben (Nur bei semantischer Notwendigkeit)

> **WICHTIG**: Status-Farben nur verwenden, wenn semantisch erforderlich.
> Bei neuen Features bevorzuge Graustufen + blaue Akzente.

```css
/* Nur für semantische Status-Anzeigen */
--status-success: #22C55E;       /* Erfolg, Aktiv, Verbunden */
--status-warning: #F59E0B;       /* Warnung, In Bearbeitung */
--status-error: #EF4444;         /* Fehler, Kritisch */
--status-info: #45ADFF;          /* Info (= Primary) */
```

| Status | Farbe | Hex | Beispiele |
|--------|-------|-----|-----------|
| Erfolg | Grün | `#22C55E` | "Indexiert", "Online", "Gespeichert" |
| Warnung | Amber | `#F59E0B` | "Verarbeitung", "Ausstehend" |
| Fehler | Rot | `#EF4444` | "Fehlgeschlagen", "Offline" |
| Info | Blau | `#45ADFF` | "Läuft", "Aktiv" (primäre Aktion) |

---

## Typografie

### Font-Stack

```css
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', source-code-pro, Menlo, Monaco, Consolas, monospace;
```

### Font-Größen

```css
/* Überschriften */
--text-3xl: 1.875rem;    /* 30px - Seiten-Titel */
--text-2xl: 1.5rem;      /* 24px - Abschnitt-Titel */
--text-xl: 1.25rem;      /* 20px - Karten-Titel */
--text-lg: 1.125rem;     /* 18px - Große Labels */

/* Body */
--text-base: 1rem;       /* 16px - Standard Body */
--text-sm: 0.875rem;     /* 14px - Sekundärer Text */
--text-xs: 0.75rem;      /* 12px - Kleine Labels, Badges */
--text-2xs: 0.625rem;    /* 10px - Sehr klein, nur Meta */
```

### Font-Gewichte

```css
--font-normal: 400;      /* Standard Text */
--font-medium: 500;      /* Leicht betont */
--font-semibold: 600;    /* Überschriften, Labels */
--font-bold: 700;        /* Starke Betonung */
```

### Typografie-Hierarchie

| Element | Größe | Gewicht | Farbe | Line-Height |
|---------|-------|---------|-------|-------------|
| Seiten-Titel (h1) | `1.875rem` | 700 | `--text-primary` | 1.2 |
| Abschnitt-Titel (h2) | `1.5rem` | 600 | `--text-primary` | 1.3 |
| Karten-Titel (h3) | `1.25rem` | 600 | `--text-primary` | 1.4 |
| Label (h4) | `0.875rem` | 600 | `--text-muted` | 1.4 |
| Body Text | `1rem` | 400 | `--text-secondary` | 1.6 |
| Small Text | `0.875rem` | 400 | `--text-muted` | 1.5 |
| Caption | `0.75rem` | 400 | `--text-disabled` | 1.4 |

---

## Spacing-System

### Feste Abstände

```css
--space-0: 0;
--space-1: 0.25rem;      /* 4px */
--space-2: 0.5rem;       /* 8px */
--space-3: 0.75rem;      /* 12px */
--space-4: 1rem;         /* 16px */
--space-5: 1.25rem;      /* 20px */
--space-6: 1.5rem;       /* 24px */
--space-8: 2rem;         /* 32px */
--space-10: 2.5rem;      /* 40px */
--space-12: 3rem;        /* 48px */
--space-16: 4rem;        /* 64px */
```

### Anwendung

| Kontext | Spacing |
|---------|---------|
| Inline-Elemente (Icons neben Text) | `--space-2` (8px) |
| Elemente in einer Gruppe | `--space-3` (12px) |
| Karten-Padding | `--space-5` (20px) |
| Abstand zwischen Karten | `--space-4` (16px) |
| Abschnitte trennen | `--space-8` (32px) |
| Seiten-Padding | `--space-6` (24px) |

---

## Border & Radius

### Border-Radius

```css
--radius-sm: 4px;        /* Badges, Tags */
--radius-md: 6px;        /* Buttons, kleine Inputs */
--radius-lg: 8px;        /* Inputs, kleine Karten */
--radius-xl: 12px;       /* Karten, Container */
--radius-2xl: 16px;      /* Modale, große Container */
--radius-full: 9999px;   /* Pills, runde Buttons */
```

### Anwendung

| Element | Radius |
|---------|--------|
| Status-Badges | `--radius-sm` (4px) |
| Buttons | `--radius-md` (6px) |
| Inputs, Textfelder | `--radius-lg` (8px) |
| Karten, Dropdowns | `--radius-xl` (12px) |
| Modale | `--radius-2xl` (16px) |
| Pills, Toggle-Gruppen | `--radius-full` |

### Border-Stile

```css
/* Standard */
border: 1px solid var(--border-color);

/* Subtil */
border: 1px solid var(--border-subtle);

/* Akzent (Fokus, Hover) */
border: 1px solid var(--primary-color);

/* Akzent mit Glow */
border: 1px solid var(--primary-color);
box-shadow: 0 0 0 3px var(--primary-muted);
```

---

## Schatten & Effekte

### Schatten-Hierarchie

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);

--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.5),
             0 2px 4px -1px rgba(69, 173, 255, 0.1);

--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.6),
             0 4px 6px -2px rgba(69, 173, 255, 0.2);

--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.7),
             0 10px 10px -5px rgba(69, 173, 255, 0.25);
```

### Glow-Effekte

```css
/* Hover-Glow für interaktive Elemente */
--glow-primary: 0 0 12px var(--primary-glow);

/* Fokus-Ring */
--focus-ring: 0 0 0 3px var(--primary-muted);
```

### Anwendung

| Element | Schatten |
|---------|----------|
| Ruhezustand | Kein Schatten oder `--shadow-sm` |
| Hover | `--shadow-md` + optional Glow |
| Erhöhte Elemente (Dropdown, Toast) | `--shadow-lg` |
| Modale | `--shadow-xl` |

---

## Komponenten-Patterns

### Buttons

#### Primary Button (Hauptaktion)

```css
.btn-primary {
  background: var(--primary-color);
  color: #000;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-primary:active {
  background: var(--primary-active);
  transform: scale(0.98);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
```

#### Secondary Button (Sekundäraktion)

```css
.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}
```

#### Ghost Button (Minimal)

```css
.btn-ghost {
  background: transparent;
  color: var(--text-muted);
  padding: 0.5rem;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-ghost:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
```

#### Icon Button

```css
.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-icon:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--primary-muted);
}
```

### Karten

```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  transition: all 0.2s ease;
}

.card:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
}

.card-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.card-description {
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.5;
}
```

### Inputs

```css
.input {
  width: 100%;
  min-height: 40px;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  color: var(--text-primary);
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition: all 0.2s ease;
}

.input::placeholder {
  color: var(--text-disabled);
}

.input:hover {
  border-color: var(--border-strong);
}

.input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: var(--focus-ring);
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Modale

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-2xl);
  padding: var(--space-6);
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-xl);
  animation: slideUp 0.3s ease;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: var(--space-4);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}
```

### Tabellen

```css
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-color);
}

.table td {
  padding: var(--space-3) var(--space-4);
  font-size: 0.875rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
}

.table tr:hover td {
  background: var(--bg-card-hover);
}
```

### Status-Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: var(--radius-full);
}

/* Standard (Blau) */
.badge-default {
  background: var(--primary-muted);
  color: var(--primary-color);
}

/* Erfolg (nur bei semantischer Notwendigkeit) */
.badge-success {
  background: rgba(34, 197, 94, 0.15);
  color: #22C55E;
}

/* Warnung (nur bei semantischer Notwendigkeit) */
.badge-warning {
  background: rgba(245, 158, 11, 0.15);
  color: #F59E0B;
}

/* Fehler (nur bei semantischer Notwendigkeit) */
.badge-error {
  background: rgba(239, 68, 68, 0.15);
  color: #EF4444;
}

/* Neutral (Grau) */
.badge-neutral {
  background: var(--bg-elevated);
  color: var(--text-muted);
}
```

### Status-Dot

```css
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.active {
  background: var(--primary-color);
  box-shadow: 0 0 8px var(--primary-glow);
}

.status-dot.success {
  background: var(--status-success);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
}

.status-dot.warning {
  background: var(--status-warning);
}

.status-dot.error {
  background: var(--status-error);
}

.status-dot.inactive {
  background: var(--text-disabled);
}
```

---

## Responsive Design

### Breakpoints

```css
/* Mobile First Approach */
--breakpoint-sm: 576px;    /* Small phones */
--breakpoint-md: 768px;    /* Tablets */
--breakpoint-lg: 1024px;   /* Small laptops */
--breakpoint-xl: 1280px;   /* Desktop */
--breakpoint-2xl: 1536px;  /* Large desktop */
```

### Media Queries

```css
/* Tablet und größer */
@media (min-width: 768px) { }

/* Desktop */
@media (min-width: 1024px) { }

/* Große Bildschirme */
@media (min-width: 1280px) { }
```

### Grid-System

```css
/* Standard Grid */
.grid {
  display: grid;
  gap: var(--space-4);
}

/* Responsive Spalten */
.grid-cols-1 { grid-template-columns: repeat(1, 1fr); }
.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
.grid-cols-4 { grid-template-columns: repeat(4, 1fr); }

/* Auto-fit für responsive Karten */
.grid-auto {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
```

---

## Animationen

### Keyframes

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Transitions

```css
/* Standard Transition */
--transition-fast: 0.15s ease;
--transition-base: 0.2s ease;
--transition-slow: 0.3s ease;

/* Empfohlene Verwendung */
transition: all var(--transition-base);
transition: background-color var(--transition-fast);
transition: transform var(--transition-base), box-shadow var(--transition-base);
```

### Hover-Effekte

```css
/* Lift-Effekt */
.lift:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

/* Scale-Effekt */
.scale:hover {
  transform: scale(1.02);
}

/* Glow-Effekt */
.glow:hover {
  box-shadow: var(--glow-primary);
}
```

---

## Checkliste für neue Komponenten

Verwende diese Checkliste bei jeder neuen Frontend-Komponente:

### Farben
- [ ] Nur `--primary-color` (#45ADFF) als Akzentfarbe
- [ ] Graustufen für Hintergründe und Text aus der Palette
- [ ] Status-Farben (Grün/Gelb/Rot) nur wenn semantisch notwendig
- [ ] Kein Lila, Cyan oder andere Farben

### Typografie
- [ ] Font-Family: `var(--font-primary)` oder `var(--font-mono)`
- [ ] Font-Größen aus dem definierten System
- [ ] Korrekte Text-Hierarchie (Primary → Secondary → Muted)

### Spacing
- [ ] Padding/Margin aus dem Spacing-System
- [ ] Konsistente Abstände zwischen Elementen
- [ ] Karten-Padding: `var(--space-5)` (20px)

### Interaktivität
- [ ] Hover-States definiert
- [ ] Focus-States mit `--focus-ring`
- [ ] Disabled-States mit `opacity: 0.5`
- [ ] Cursor: pointer für klickbare Elemente

### Responsive
- [ ] Mobile-First Ansatz
- [ ] Breakpoints aus dem System verwenden
- [ ] Grid/Flex für Layout

### Animation
- [ ] `transition: all var(--transition-base)`
- [ ] Keine abrupten Zustandsänderungen
- [ ] Hover-Lift oder Hover-Scale bei Karten/Buttons

### Konsistenz
- [ ] Border-Radius aus dem System
- [ ] Schatten aus der Hierarchie
- [ ] Pattern von existierenden Komponenten übernommen

---

## Beispiel-Implementierung

### Neue Karten-Komponente

```jsx
// components/FeatureCard.js
import React from 'react';
import './FeatureCard.css';

const FeatureCard = ({ icon, title, description, onClick }) => (
  <div className="feature-card" onClick={onClick}>
    <div className="feature-card-icon">
      {icon}
    </div>
    <h3 className="feature-card-title">{title}</h3>
    <p className="feature-card-description">{description}</p>
  </div>
);

export default FeatureCard;
```

```css
/* components/FeatureCard.css */
.feature-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  cursor: pointer;
  transition: all var(--transition-base);
}

.feature-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.feature-card-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-muted);
  border-radius: var(--radius-lg);
  color: var(--primary-color);
  font-size: 1.5rem;
  margin-bottom: var(--space-4);
}

.feature-card-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.feature-card-description {
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.5;
}
```

---

## CSS-Variablen Referenz (Kopiervorlage)

```css
:root {
  /* Primary (Blau) */
  --primary-color: #45ADFF;
  --primary-hover: #6EC4FF;
  --primary-active: #2D8FD9;
  --primary-muted: rgba(69, 173, 255, 0.15);
  --primary-glow: rgba(69, 173, 255, 0.4);

  /* Backgrounds */
  --bg-dark: #101923;
  --bg-card: #1A2330;
  --bg-card-hover: #222D3D;
  --bg-elevated: #2A3544;

  /* Borders */
  --border-color: #2A3544;
  --border-subtle: #1D2835;
  --border-strong: #3A4554;

  /* Text */
  --text-primary: #F8FAFC;
  --text-secondary: #CBD5E1;
  --text-muted: #94A3B8;
  --text-disabled: #64748B;

  /* Status (nur wenn semantisch notwendig) */
  --status-success: #22C55E;
  --status-warning: #F59E0B;
  --status-error: #EF4444;

  /* Typography */
  --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(69, 173, 255, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -2px rgba(69, 173, 255, 0.2);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(69, 173, 255, 0.25);
  --focus-ring: 0 0 0 3px var(--primary-muted);
  --glow-primary: 0 0 12px var(--primary-glow);

  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-base: 0.2s ease;
  --transition-slow: 0.3s ease;
}
```

---

*Dieses Design-System ist verbindlich für alle Frontend-Entwicklungen.*
*Bei Fragen oder Ergänzungen: docs/DESIGN_SYSTEM.md aktualisieren.*
