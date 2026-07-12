# Arasul Design System

**Version**: 2.0.0
**Letzte Aktualisierung**: 2026-04-06

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
3. **Schwarz-First** - Drei Themes »Schwarz · Dunkel · Hell«; tiefschwarzes Theme als Standard für Jetson Edge-Device
4. **Klarheit** - Klare Hierarchie durch Farbe, Größe und Spacing
5. **Performance** - Tailwind CSS v4 + shadcn/ui Components — keine Custom-CSS außer für komplexe Animationen

### Farbphilosophie

Die Arasul-Plattform verwendet eine **neutrale monochrome Basis** (kein Blaustich)
mit **einem gedämpften Akzent** — nach dem Cursor-Prinzip: Flächentrennung über
zwei Hintergrundstufen, EINE Border-Farbe mit niedriger Alpha, Hover/Selection
als neutrale Alphas, Akzent nur für Primäraktionen/Aktivzustände.

- **Neutrale Flächen** → zwei Hintergrundstufen (Chrome vs. Fläche/Editor)
- **Graustufen/Alphas** → Text-Hierarchie, Borders, Hover
- **Akzent** → Schwarz/Dunkel: Graublau `#81A1C1`; Hell: entschärftes Arasul-Blau `#2D8FD9`

---

## Farbpalette — drei Themes

Umschaltung: `data-theme="black|dark|light"` + Klassen `dark`/`light` auf `<html>`
(`useTheme`). `:root` = Schwarz (Default), `[data-theme="dark"]` und `.light`
überschreiben nur die abweichenden Werte.

### Kern-Tokens pro Theme

| Token                   | Schwarz (`:root`)        | Dunkel (`[data-theme="dark"]`) | Hell (`.light`)       |
| ----------------------- | ------------------------ | ------------------------------ | --------------------- |
| `--background`          | `#0A0A0A` (Chrome)       | `#141414`                      | `#F6F6F6`             |
| `--card`/`--bg-subtle`  | `#121212` (Flächen)      | `#181818`                      | `#FFFFFF` / `#FAFAFA` |
| `--popover`             | `#161616`                | `#1c1c1c`                      | `#FFFFFF`             |
| `--secondary`/`--muted` | `#161616`                | `#181818`                      | `#ECECEC`             |
| `--bg-elevated`         | `#1e1e1e`                | `#242424`                      | `#FFFFFF`             |
| `--accent` (Hover)      | `rgba(228,228,228,0.07)` | erbt Schwarz                   | `rgba(16,16,16,0.05)` |
| `--border`              | `rgba(228,228,228,0.08)` | erbt Schwarz                   | `rgba(16,16,16,0.10)` |
| `--foreground`          | `#e6e6e6`                | erbt Schwarz                   | `#1a1a1a`             |
| `--muted-foreground`    | `rgba(228,228,228,0.55)` | erbt Schwarz                   | `#6b6b6b`             |
| `--primary`             | `#81A1C1`                | erbt Schwarz                   | `#2D8FD9`             |
| `--primary-hover`       | `#93b1cd`                | erbt Schwarz                   | `#4AA3E4`             |
| `--primary-active`      | `#6e91b4`                | erbt Schwarz                   | `#2478B8`             |
| `--ring`                | = `--primary`            | = `--primary`                  | = `--primary`         |
| `--scrollbar-thumb`     | `rgba(228,228,228,0.14)` | erbt Schwarz                   | `rgba(16,16,16,0.18)` |
| `--bg-terminal`         | `#0A0A0A`                | `#181818`                      | `#FFFFFF`             |

Scrollbars: Track transparent, Thumb neutral (Hover `0.28` bzw. `0.32` Alpha),
kein Gradient. Die `--primary-alpha-5…50`-Skala folgt je Theme dem Akzent.

Terminal (xterm) koppelt an das App-Theme über `src/lib/terminalThemes.ts`
(einzige sanktionierte Literal-Palette neben der Chart-Palette).

### Status-Farben (Nur bei semantischer Notwendigkeit)

> **WICHTIG**: Status-Farben nur verwenden, wenn semantisch erforderlich.
> Bei neuen Features bevorzuge Graustufen + blaue Akzente.

```css
/* Nur für semantische Status-Anzeigen */
--status-success: #22c55e; /* Erfolg, Aktiv, Verbunden */
--status-warning: #f59e0b; /* Warnung, In Bearbeitung */
--status-error: #ef4444; /* Fehler, Kritisch */
--status-info: var(--primary); /* Info (= Akzent des aktiven Themes) */
```

| Status  | Farbe  | Hex              | Beispiele                            |
| ------- | ------ | ---------------- | ------------------------------------ |
| Erfolg  | Grün   | `#22C55E`        | "Indexiert", "Online", "Gespeichert" |
| Warnung | Amber  | `#F59E0B`        | "Verarbeitung", "Ausstehend"         |
| Fehler  | Rot    | `#EF4444`        | "Fehlgeschlagen", "Offline"          |
| Info    | Akzent | `var(--primary)` | "Läuft", "Aktiv" (primäre Aktion)    |

---

## Typografie

### Font-Stack

```css
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', source-code-pro, Menlo, Monaco, Consolas, monospace;
```

### Font-Größen

Die Font-Größen-Scale ist dichter als eine reine Tailwind-Default-Scale (14px
Standard-Body statt 16px, plus `--text-md` als 15px-Zwischenschritt). Werte
gespiegelt aus `apps/dashboard-frontend/src/index.css`:

```css
/* Überschriften / große Labels */
--text-4xl: 2rem; /* 32px - Hero / Seiten-Titel groß */
--text-3xl: 1.5rem; /* 24px - Seiten-Titel */
--text-2xl: 1.25rem; /* 20px - Abschnitt-Titel */
--text-xl: 1.125rem; /* 18px - Karten-Titel */
--text-lg: 1rem; /* 16px - Große Labels */

/* Body */
--text-md: 0.9375rem; /* 15px - Betonter Body */
--text-base: 0.875rem; /* 14px - Standard Body */
--text-sm: 0.8125rem; /* 13px - Sekundärer Text */
--text-xs: 0.75rem; /* 12px - Kleine Labels, Badges */
--text-2xs: 0.65rem; /* 10.4px - Sehr klein, nur Meta */
```

### Font-Gewichte

```css
--font-normal: 400; /* Standard Text */
--font-medium: 500; /* Leicht betont */
--font-semibold: 600; /* Überschriften, Labels */
--font-bold: 700; /* Starke Betonung */
```

### Typografie-Hierarchie

| Element              | Token         | Größe       | Gewicht | Farbe              | Line-Height |
| -------------------- | ------------- | ----------- | ------- | ------------------ | ----------- |
| Seiten-Titel (h1)    | `--text-3xl`  | `1.5rem`    | 700     | `--text-primary`   | 1.2         |
| Abschnitt-Titel (h2) | `--text-2xl`  | `1.25rem`   | 600     | `--text-primary`   | 1.3         |
| Karten-Titel (h3)    | `--text-xl`   | `1.125rem`  | 600     | `--text-primary`   | 1.4         |
| Label (h4)           | `--text-base` | `0.875rem`  | 600     | `--text-muted`     | 1.4         |
| Body Text            | `--text-base` | `0.875rem`  | 400     | `--text-secondary` | 1.6         |
| Small Text           | `--text-sm`   | `0.8125rem` | 400     | `--text-muted`     | 1.5         |
| Caption              | `--text-xs`   | `0.75rem`   | 400     | `--text-disabled`  | 1.4         |

---

## Spacing-System

### Feste Abstände

Benannte Scale (kein numerisches `--space-N`) mit Half-Steps für die häufigen
Zwischenwerte. Gespiegelt aus `apps/dashboard-frontend/src/index.css`:

```css
--space-2xs: 0.125rem; /* 2px */
--space-xs: 0.25rem; /* 4px */
--space-sm: 0.5rem; /* 8px */
--space-md: 1rem; /* 16px */
--space-lg: 1.5rem; /* 24px */
--space-xl: 2rem; /* 32px */
--space-2xl: 3rem; /* 48px */
--space-3xl: 4rem; /* 64px */

/* Half-steps (häufige Zwischenwerte) */
--space-xs-sm: 0.375rem; /* 6px */
--space-sm-md: 0.75rem; /* 12px */
--space-md-lg: 1.25rem; /* 20px */
--space-lg-xl: 1.75rem; /* 28px */
```

### Anwendung

| Kontext                            | Spacing                |
| ---------------------------------- | ---------------------- |
| Inline-Elemente (Icons neben Text) | `--space-sm` (8px)     |
| Elemente in einer Gruppe           | `--space-sm-md` (12px) |
| Karten-Padding                     | `--space-md-lg` (20px) |
| Abstand zwischen Karten            | `--space-md` (16px)    |
| Abschnitte trennen                 | `--space-xl` (32px)    |
| Seiten-Padding                     | `--space-lg` (24px)    |

---

## Border & Radius

### Border-Radius

Definiert im `@theme`-Block von `apps/dashboard-frontend/src/index.css`
(`--radius-pill` zusätzlich in `:root`):

```css
--radius-xs: 4px; /* Badges, Tags */
--radius-sm: 6px; /* Buttons, kleine Inputs */
--radius-md: 8px; /* Inputs, kleine Karten */
--radius-lg: 12px; /* Karten, Container */
--radius-xl: 16px; /* Modale, große Container */
--radius-pill: 9999px; /* Pills, runde Buttons */
```

### Anwendung

| Element               | Radius               |
| --------------------- | -------------------- |
| Status-Badges         | `--radius-xs` (4px)  |
| Buttons               | `--radius-sm` (6px)  |
| Inputs, Textfelder    | `--radius-md` (8px)  |
| Karten, Dropdowns     | `--radius-lg` (12px) |
| Modale                | `--radius-xl` (16px) |
| Pills, Toggle-Gruppen | `--radius-pill`      |

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

--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(69, 173, 255, 0.1);

--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -2px rgba(69, 173, 255, 0.2);

--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(69, 173, 255, 0.25);
```

### Glow-Effekte

```css
/* Hover-Glow für interaktive Elemente */
--glow-primary: 0 0 12px var(--primary-glow);

/* Fokus-Ring */
--focus-ring: 0 0 0 3px var(--primary-muted);
```

### Anwendung

| Element                            | Schatten                         |
| ---------------------------------- | -------------------------------- |
| Ruhezustand                        | Kein Schatten oder `--shadow-sm` |
| Hover                              | `--shadow-md` + optional Glow    |
| Erhöhte Elemente (Dropdown, Toast) | `--shadow-lg`                    |
| Modale                             | `--shadow-xl`                    |

---

## Komponenten-Patterns

### Workspace-Shell (IDE-Layout, Plan `ide-workspace-shell`)

Die Workspace-Shell (`features/workspace/`, Feature-Flag `workspace-shell`)
nutzt **dieselben Theme-Tokens** wie der Rest der App, aber IDE-typisch
kompaktere Dichte: schmale Leisten (`h-9` für Tab-/Explorer-Header, `w-12`
Activity-Bar), `text-xs` in Explorer/Tabs, enge Paddings (`px-3`, `py-0.5`).
Keine neuen Farbwerte — ausschließlich `bg-background`, `bg-accent`,
`border-border`, `text-muted-foreground` etc. Panels sind mit
`react-resizable-panels` (Group/Panel/Separator) umgesetzt; der Separator ist
`w-px bg-border` mit `hover:bg-primary`.

Oberhalb von Activity-Bar und Panels sitzt die **WorkspaceMenuBar** (`h-9`,
volle Breite, Cursor-minimal): links Marke + `Datei`/`Ansicht`-Dropdowns
(shadcn `dropdown-menu`, `text-xs`-Trigger), rechts der Einstellungen-Button.
Aktionen, die UI in anderen Panels öffnen (z. B. »Neuer Ordner…« → Explorer-
Dialog), laufen als Request über den `workspaceStore`
(`requestExplorerAction`), nicht über Cross-Component-Props. `⌘B`/`Ctrl+B`
toggelt den Explorer.

### Interaktions-States (verbindlich)

Jede interaktive Primitive (Button, Input, Card-als-Link, Tab, Select …) muss
**alle vier** States konsistent bedienen. States werden als Tailwind-Utility-
Varianten **innerhalb einer `cva()`-Definition** ausgedrückt und via `cn()`
komponiert — **nicht** als hand-geschriebene `:hover`/`:focus`-CSS-Regeln.
Referenzimplementierung: `apps/dashboard-frontend/src/components/ui/shadcn/button.tsx`.

| State           | Konvention                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `hover`         | Token-basierte Farb-/Elevation-Änderung (`hover:bg-primary-hover`, `hover:shadow-md`), nie neuer Hue.                  |
| `focus-visible` | Sichtbarer Ring über `focus-visible:ring-2 focus-visible:ring-ring` (Tastatur-Fokus), kein `outline:none` ohne Ersatz. |
| `disabled`      | `disabled:pointer-events-none disabled:opacity-50` — einheitlich über alle Primitives.                                 |
| `loading`       | Nicht-interaktiv + sichtbarer Spinner/Skeleton; Layout darf nicht springen (Platz reservieren).                        |

Timings kommen aus den `--transition-*`-Tokens (siehe [Transitions](#transitions)),
niemals hardcodiert. Farben immer aus Tokens — keine Hex-Literale.

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
  color: #22c55e;
}

/* Warnung (nur bei semantischer Notwendigkeit) */
.badge-warning {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

/* Fehler (nur bei semantischer Notwendigkeit) */
.badge-error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
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
--breakpoint-sm: 576px; /* Small phones */
--breakpoint-md: 768px; /* Tablets */
--breakpoint-lg: 1024px; /* Small laptops */
--breakpoint-xl: 1280px; /* Desktop */
--breakpoint-2xl: 1536px; /* Large desktop */
```

### Media Queries

```css
/* Tablet und größer */
@media (min-width: 768px) {
}

/* Desktop */
@media (min-width: 1024px) {
}

/* Große Bildschirme */
@media (min-width: 1280px) {
}
```

### Grid-System

```css
/* Standard Grid */
.grid {
  display: grid;
  gap: var(--space-4);
}

/* Responsive Spalten */
.grid-cols-1 {
  grid-template-columns: repeat(1, 1fr);
}
.grid-cols-2 {
  grid-template-columns: repeat(2, 1fr);
}
.grid-cols-3 {
  grid-template-columns: repeat(3, 1fr);
}
.grid-cols-4 {
  grid-template-columns: repeat(4, 1fr);
}

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
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
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
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
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
transition:
  transform var(--transition-base),
  box-shadow var(--transition-base);
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

### Datei & Struktur

- [ ] TypeScript (`.tsx`) — keine `.js`/`.jsx`
- [ ] In `src/features/<feature>/` mit barrel export (`index.ts`)
- [ ] Props als TypeScript `interface` definiert

### Styling

- [ ] Tailwind CSS Klassen (keine neue `.css` Datei wenn vermeidbar)
- [ ] shadcn Components verwenden wo möglich (Button, Card, Dialog, Input, Badge, etc.)
- [ ] `cn()` für conditional Classes
- [ ] Nur `--primary-color` (Akzent des aktiven Themes) als Akzentfarbe
- [ ] Status-Farben (Grün/Gelb/Rot) nur wenn semantisch notwendig
- [ ] Keine hardcoded Hex-Werte — Tailwind-Tokens oder CSS-Variablen

### Icons & UI

- [ ] `lucide-react` Icons (keine react-icons)
- [ ] Deutsche UI-Texte
- [ ] Loading/Error States über `LoadingSpinner` / `EmptyState`

### Interaktivität

- [ ] Hover-States (`hover:bg-bg-card-hover`, `hover:border-primary`)
- [ ] Focus-States (`focus:ring-2 focus:ring-primary`)
- [ ] Disabled-States (`disabled:opacity-50 disabled:cursor-not-allowed`)
- [ ] `transition-all duration-200` für Übergänge

### API & State

- [ ] `useApi()` Hook für REST-Calls
- [ ] `useToast()` für Notifications
- [ ] `useConfirm()` für Bestätigungen

### Responsive

- [ ] Mobile-First Ansatz
- [ ] Tailwind Breakpoints: `sm:`, `md:`, `lg:`, `xl:`

---

## Implementierung (Stand: April 2026)

### Tech-Stack für neue Komponenten

- **TypeScript** (`.tsx`) — keine `.js`/`.jsx` Dateien
- **Tailwind CSS v4** — Utility-First, Design-Tokens via `@theme`
- **shadcn/ui** — Radix-basierte Components in `src/components/ui/shadcn/`
- **lucide-react** — Icons (keine react-icons)
- **`cn()`** — clsx + tailwind-merge für conditional Classes (`src/lib/utils.ts`)

### Beispiel: Neue Karten-Komponente

```tsx
// features/example/FeatureCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureCardProps {
  title: string;
  description: string;
  status?: 'active' | 'inactive';
  onClick?: () => void;
}

export function FeatureCard({ title, description, status, onClick }: FeatureCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200',
        'hover:bg-bg-card-hover hover:border-primary hover:-translate-y-0.5 hover:shadow-md'
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15 text-primary">
          <Settings className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {status && (
          <Badge variant={status === 'active' ? 'default' : 'secondary'}>
            {status === 'active' ? 'Aktiv' : 'Inaktiv'}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-muted">{description}</p>
      </CardContent>
    </Card>
  );
}
```

### Token-Architektur (eine Quelle, drei Schichten)

`index.css` hat **eine** Token-Quelle statt mehrerer überlappender Farb-Ebenen.
Der Aufbau (von statisch → thematisch → Utility):

1. **`@theme`** — statische, theme-unabhängige Tokens: Radius, Fonts, Chart-Palette
   (`--radius-*`, `--font-*`, `--color-chart-1…5`).
2. **`:root` (Schwarz) + `[data-theme="dark"]` + `.light` (Overrides)** — die
   **einzige Wertequelle** für alle Farben. `:root` hält die Schwarz-Werte
   (Default), die beiden Override-Blöcke überschreiben nur die abweichenden.
   Kein Wert wird an mehreren Stellen doppelt gepflegt.
3. **`@theme inline`** — mappt die Runtime-Variablen aus (2) auf Tailwind-Utility-Tokens,
   damit jede Utility theme-aware ist:

```css
/* @theme inline — Mapping, KEINE Werte */
--color-bg-card: var(--bg-card);        → className="bg-bg-card"
--color-text-muted: var(--text-muted);  → className="text-text-muted"
--color-primary: var(--primary);        → className="bg-primary"
/* Werte selbst: :root { --card: #121212 } + [data-theme="dark"] { --card: #181818 } + .light { --card: #ffffff } */
```

### Drei Themes über EINE Mechanik

Der Theme-Wechsel läuft über `useTheme` (`'black' | 'dark' | 'light'`, Default
`black`, localStorage `arasul_theme`): es setzt `data-theme="black|dark|light"`
**und** die Klassen `dark` (für black+dark, hält `@custom-variant dark
(&:is(.dark *))` am Leben) bzw. `.light` auf `<html>`. Neue Komponenten brauchen
**keine** eigenen Theme-Zweige: solange sie Tokens verwenden, folgen sie dem
Theme automatisch.

### CSS-Variablen vs. Tailwind

| Kontext                  | Verwende                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| shadcn Components        | Tailwind-Klassen (`bg-primary`, `text-muted-foreground`)             |
| Custom Components        | Tailwind-Klassen mit Design-Tokens (`bg-bg-card`, `text-text-muted`) |
| Inline-Styles (Ausnahme) | CSS-Variablen (`var(--primary-color)`)                               |
| Animationen/Keyframes    | CSS in feature-spezifischen `.css` Dateien                           |

Farb-Literale (`#rrggbb`) in Komponenten sind verboten — die einzige legitime Ausnahme
sind technische Paletten (z.B. Xterm-Farben in `TerminalTabs.tsx`, Chart-Palette im
`@theme`-Block), die mit Kommentar markiert sind.

---

## CSS-Variablen Referenz (Kopiervorlage)

Faithfuller Spiegel des `:root` (Schwarz) + `@theme`-Blocks aus
`apps/dashboard-frontend/src/index.css`. Farbwerte leben **nur** hier bzw. in den
Overrides `[data-theme="dark"]` / `.light` — nie im Komponenten-Code.

```css
@theme {
  /* Border-Radius (statisch, theme-unabhängig) */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* Fonts */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', source-code-pro, Menlo, Monaco, Consolas, monospace;

  /* Chart-Palette (recharts referenziert diese Tokens) */
  --color-chart-1: #45adff;
  --color-chart-2: #a78bfa;
  --color-chart-3: #f97316;
  --color-chart-4: #22d3ee;
  --color-chart-5: #f472b6;
}

:root {
  /* shadcn/ui Semantic (Schwarz, Default) — die Wertequelle */
  --background: #0a0a0a;
  --foreground: #e6e6e6;
  --card: #121212;
  --primary: #81a1c1;
  --primary-foreground: #0a0a0a;
  --muted: #161616;
  --muted-foreground: rgba(228, 228, 228, 0.55);
  --accent: rgba(228, 228, 228, 0.07);
  --destructive: #ef4444;
  --success: #10b981;
  --warning: #f59e0b;
  --border: rgba(228, 228, 228, 0.08);
  --input: rgba(228, 228, 228, 0.1);
  --ring: #81a1c1;

  /* Arasul-Aliase (mappen auf die shadcn-Werte, kein Doppel-Pflegen) */
  --primary-hover: #93b1cd;
  --primary-active: #6e91b4;
  --bg-card: var(--card);
  --bg-card-hover: var(--accent);
  --bg-elevated: #1e1e1e;
  --bg-subtle: #121212;
  --text-primary: var(--foreground);
  --text-secondary: #c2c2c2;
  --text-muted: var(--muted-foreground);
  --text-disabled: #6b6b6b;
  --border-subtle: var(--muted);
  --scrollbar-thumb: rgba(228, 228, 228, 0.14);
  --scrollbar-thumb-hover: rgba(228, 228, 228, 0.28);
  --radius-pill: 9999px;

  /* Spacing (benannt + Half-Steps) */
  --space-2xs: 0.125rem;
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
  --space-3xl: 4rem;
  --space-xs-sm: 0.375rem;
  --space-sm-md: 0.75rem;
  --space-md-lg: 1.25rem;
  --space-lg-xl: 1.75rem;

  /* Font-Größen (14px Standard-Body) */
  --text-2xs: 0.65rem;
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.875rem;
  --text-md: 0.9375rem;
  --text-lg: 1rem;
  --text-xl: 1.125rem;
  --text-2xl: 1.25rem;
  --text-3xl: 1.5rem;
  --text-4xl: 2rem;

  /* Icon-Größen */
  --icon-xs: 14px;
  --icon-sm: 16px;
  --icon-md: 20px;
  --icon-lg: 24px;
  --icon-xl: 32px;
  --icon-2xl: 48px;

  /* Shadows (Dark) */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px var(--primary-alpha-10);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -2px var(--primary-alpha-20);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px var(--primary-alpha-30);

  /* Transitions (die eine Quelle für Interaktions-Timings) */
  --transition-fast: 0.15s ease;
  --transition-base: 0.2s ease;
  --transition-slow: 0.3s ease;
}
```

---

_Dieses Design-System ist verbindlich für alle Frontend-Entwicklungen._
_Die Farb-Tokens und Spacing-Werte sind die Single Source of Truth — Tailwind-Klassen und shadcn-Components bauen darauf auf._
