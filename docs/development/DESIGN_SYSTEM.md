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
3. **Dark-First** - Dunkles Theme als Standard für Jetson Edge-Device
4. **Klarheit** - Klare Hierarchie durch Farbe, Größe und Spacing
5. **Performance** - Tailwind CSS v4 + shadcn/ui Components — keine Custom-CSS außer für komplexe Animationen

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
--primary-color: #45adff; /* Hauptfarbe für Buttons, Links, Aktionen */
--primary-hover: #6ec4ff; /* Hover-Zustand (10% heller) */
--primary-active: #2d8fd9; /* Active/Pressed-Zustand (10% dunkler) */
--primary-muted: rgba(69, 173, 255, 0.15); /* Hintergrund-Akzent */
--primary-glow: rgba(69, 173, 255, 0.4); /* Glow-Effekte */
```

| Verwendung                    | Farbe          | Hex                        |
| ----------------------------- | -------------- | -------------------------- |
| Buttons, Links, Icons (aktiv) | Primary        | `#45ADFF`                  |
| Hover-Zustand                 | Primary Hover  | `#6EC4FF`                  |
| Active/Pressed                | Primary Active | `#2D8FD9`                  |
| Akzent-Hintergrund            | Primary Muted  | `rgba(69, 173, 255, 0.15)` |
| Fokus-Ring, Glow              | Primary Glow   | `rgba(69, 173, 255, 0.4)`  |

### Graustufen (Neutral)

Für Hintergründe, Text und Strukturelemente.

```css
/* Dunkle Töne (Hintergründe) */
--bg-dark: #101923; /* Dunkelster Hintergrund */
--bg-card: #1a2330; /* Karten, Container */
--bg-card-hover: #222d3d; /* Hover auf Karten */
--bg-elevated: #2a3544; /* Erhöhte Elemente, Dropdowns */

/* Borders */
--border-color: #2a3544; /* Standard Border */
--border-subtle: #1d2835; /* Subtile Trennung */
--border-strong: #3a4554; /* Betonte Border */

/* Text */
--text-primary: #f8fafc; /* Haupttext (fast weiß) */
--text-secondary: #cbd5e1; /* Sekundärer Text */
--text-muted: #94a3b8; /* Gedämpfter Text, Labels */
--text-disabled: #64748b; /* Deaktivierter Text */
```

| Graustufe | Hex       | Verwendung                |
| --------- | --------- | ------------------------- |
| Gray 900  | `#0F172A` | Dunkelste Flächen         |
| Gray 850  | `#101923` | Haupt-Hintergrund         |
| Gray 800  | `#1A2330` | Karten-Hintergrund        |
| Gray 750  | `#222D3D` | Hover-Zustand auf Karten  |
| Gray 700  | `#2A3544` | Erhöhte Elemente, Borders |
| Gray 600  | `#3A4554` | Starke Borders            |
| Gray 500  | `#64748B` | Deaktivierter Text        |
| Gray 400  | `#94A3B8` | Gedämpfter Text           |
| Gray 300  | `#CBD5E1` | Sekundärer Text           |
| Gray 200  | `#E2E8F0` | Subtiler Text (selten)    |
| Gray 100  | `#F8FAFC` | Primärer Text             |

### Status-Farben (Nur bei semantischer Notwendigkeit)

> **WICHTIG**: Status-Farben nur verwenden, wenn semantisch erforderlich.
> Bei neuen Features bevorzuge Graustufen + blaue Akzente.

```css
/* Nur für semantische Status-Anzeigen */
--status-success: #22c55e; /* Erfolg, Aktiv, Verbunden */
--status-warning: #f59e0b; /* Warnung, In Bearbeitung */
--status-error: #ef4444; /* Fehler, Kritisch */
--status-info: #45adff; /* Info (= Primary) */
```

| Status  | Farbe | Hex       | Beispiele                            |
| ------- | ----- | --------- | ------------------------------------ |
| Erfolg  | Grün  | `#22C55E` | "Indexiert", "Online", "Gespeichert" |
| Warnung | Amber | `#F59E0B` | "Verarbeitung", "Ausstehend"         |
| Fehler  | Rot   | `#EF4444` | "Fehlgeschlagen", "Offline"          |
| Info    | Blau  | `#45ADFF` | "Läuft", "Aktiv" (primäre Aktion)    |

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
- [ ] Nur `--primary-color` (#45ADFF) als Akzentfarbe
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
2. **`:root` (Dark) + `.light` (Overrides)** — die **einzige Wertequelle** für alle
   Farben. `:root` hält die Dark-Theme-Werte (Default), `.light` überschreibt nur
   die abweichenden. Kein Wert wird an mehreren Stellen doppelt gepflegt.
3. **`@theme inline`** — mappt die Runtime-Variablen aus (2) auf Tailwind-Utility-Tokens,
   damit jede Utility theme-aware ist:

```css
/* @theme inline — Mapping, KEINE Werte */
--color-bg-card: var(--bg-card);        → className="bg-bg-card"
--color-text-muted: var(--text-muted);  → className="text-text-muted"
--color-primary: var(--primary);        → className="bg-primary"
/* Werte selbst: :root { --bg-card: #1a2330 } + .light { --bg-card: #ffffff } */
```

### Dark/Light über EINE Mechanik

Der Theme-Wechsel läuft ausschließlich über die Klasse **`html.dark`** bzw. `.light`
am Wurzelelement (`@custom-variant dark (&:is(.dark *))`). Die früheren
`body.light-mode`/`.dark-mode`-Abhängigkeiten entfallen — `useTheme` toggelt nur
noch die Wurzel-Klasse. Neue Komponenten brauchen **keine** eigenen Dark/Light-Zweige:
solange sie Tokens verwenden, folgen sie dem Theme automatisch.

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

Faithfuller Spiegel des `:root` (Dark) + `@theme`-Blocks aus
`apps/dashboard-frontend/src/index.css`. Farbwerte leben **nur** hier bzw. im
`.light`-Override — nie im Komponenten-Code.

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
  /* shadcn/ui Semantic (Dark) — die Wertequelle */
  --background: #101923;
  --foreground: #f8fafc;
  --card: #1a2330;
  --primary: #45adff;
  --primary-foreground: #000000;
  --muted: #1d2835;
  --muted-foreground: #94a3b8;
  --destructive: #ef4444;
  --success: #10b981;
  --warning: #f59e0b;
  --border: #2a3544;
  --input: #2a3544;
  --ring: #45adff;

  /* Arasul-Aliase (mappen auf die shadcn-Werte, kein Doppel-Pflegen) */
  --primary-hover: #6ec4ff;
  --primary-active: #2d8fd9;
  --bg-card: var(--card);
  --bg-card-hover: var(--accent);
  --bg-elevated: #2a3544;
  --bg-subtle: #1d2835;
  --text-primary: var(--foreground);
  --text-secondary: #cbd5e1;
  --text-muted: var(--muted-foreground);
  --text-disabled: #64748b;
  --border-subtle: var(--muted);
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
