# Dashboard Frontend

Single Page Application (SPA) for the Arasul Platform dashboard.

## Overview

| Property | Value |
|----------|-------|
| Port | 3000 (internal), 80 (via Traefik) |
| Framework | React 18.2 |
| Routing | React Router 6.21 (lazy loading) |
| Charts | Recharts 2.10 |
| Build | Create React App 5.0 |
| Styling | Custom CSS (Dark Theme) |

## Directory Structure

```
src/
├── index.js              # React root entry point
├── App.js                # Main application (826 lines)
├── index.css             # Global styles & Design System (75 KB)
├── components/           # 23 React components
│   ├── ChatMulti.js      # Multi-chat with RAG & thinking blocks (1000+ lines)
│   ├── ModelStore.js     # LLM model management (500+ lines)
│   ├── DocumentManager.js# Document upload & spaces (800+ lines)
│   ├── AppStore.js       # App marketplace (600+ lines)
│   ├── Settings.js       # Settings hub with tabs (700+ lines)
│   ├── ClaudeCode.js     # Claude Code terminal (1200+ lines)
│   ├── ClaudeTerminal.js # Free-form LLM queries (200+ lines)
│   ├── TelegramBotApp.js # Telegram integration hub (500+ lines)
│   ├── TelegramSettings.js # Telegram config (300+ lines)
│   ├── TelegramSetupWizard.js # Legacy setup wizard (300+ lines)
│   ├── TelegramBots/        # Bot Management Module
│   │   ├── BotSetupWizard.js # Zero-Config 4-step wizard (800+ lines)
│   │   ├── TelegramBots.js   # Bot list & management (600+ lines)
│   │   └── TelegramBots.css  # Wizard styles (15 KB)
│   ├── PasswordManagement.js # Password UI (300+ lines)
│   ├── UpdatePage.js     # System updates (300+ lines)
│   ├── SelfHealingEvents.js # Event viewer (400+ lines)
│   ├── MarkdownEditor.js # MD editor with preview (400+ lines)
│   ├── MermaidDiagram.js # Mermaid renderer (100+ lines)
│   ├── SpaceModal.js     # Knowledge space modal (300+ lines)
│   ├── AppDetailModal.js # App details popup (200+ lines)
│   ├── Modal.js          # Reusable modal wrapper (100 lines)
│   ├── ConfirmIconButton.js # Confirmation button (100 lines)
│   ├── Skeleton.js       # Loading skeleton (100 lines)
│   ├── Login.js          # Authentication form (80 lines)
│   ├── ErrorBoundary.js  # Error handling (185 lines)
│   └── LoadingSpinner.js # Loading indicator
├── contexts/             # 3 React contexts
│   ├── AuthContext.js    # Authentication state
│   ├── DownloadContext.js# Model download tracking
│   └── ToastContext.js   # Toast notifications
├── hooks/
│   └── useWebSocketMetrics.js # Real-time metrics hook
├── config/
│   └── api.js            # API configuration
├── utils/
│   ├── token.js          # JWT utilities
│   └── formatting.js     # Date, size, number formatting
├── __tests__/            # 16 test files
│   ├── App.test.js
│   ├── ChatMulti.test.js
│   ├── ModelStore.test.js
│   ├── DocumentManager.test.js
│   ├── Settings.test.js
│   ├── Login.test.js
│   ├── UpdatePage.test.js
│   ├── SelfHealingEvents.test.js
│   ├── PasswordManagement.test.js
│   ├── TelegramSettings.test.js
│   ├── BotSetupWizard.test.js  # NEW: 16 tests for Zero-Config wizard
│   ├── ErrorBoundary.test.js
│   ├── LoadingSpinner.test.js
│   ├── ConfirmIconButton.test.js
│   ├── designSystem.test.js
│   └── codeQuality.test.js
└── *.css                 # 11 component stylesheets
    ├── chatmulti.css     # Chat UI (35 KB)
    ├── settings.css      # Settings (45 KB)
    ├── documents.css     # Documents (22 KB)
    ├── appstore.css      # App Store (33 KB)
    ├── modelstore.css    # Model Store (19 KB)
    ├── claudecode.css    # Claude Code (46 KB)
    ├── markdown-editor.css # Editor (15 KB)
    ├── telegram-bot-app.css # Telegram (20 KB)
    ├── space-modal.css   # Spaces (6 KB)
    └── UpdatePage.css    # Updates
```

## Routes

| Path | Component | Lazy | Description |
|------|-----------|------|-------------|
| `/` | DashboardHome | No | Main dashboard with metrics & charts |
| `/chat` | ChatMulti | Yes | Multi-conversation AI chat |
| `/documents` | DocumentManager | Yes | Document upload & RAG management |
| `/settings` | Settings | Yes | System configuration hub |
| `/appstore` | AppStore | Yes | App marketplace |
| `/models` | ModelStore | Yes | LLM model management |
| `/claude-code` | ClaudeCode | Yes | Claude Code terminal |
| `/telegram-bot` | TelegramBotApp | Yes | Telegram app integration |

## Key Components

### App.js (Main Application)

- JWT authentication with axios interceptors
- Automatic token refresh on 401 responses (ML-004 FIX)
- WebSocket connection for live metrics
- HTTP polling fallback when WebSocket fails
- Collapsible sidebar (Ctrl+B toggle)
- Theme toggle (dark/light) with localStorage persistence
- ErrorBoundary wrapper for crash recovery

### ChatMulti.js (Hauptkomponente)

| Feature | Description |
|---------|-------------|
| Multi-Conversation | Sidebar with search/filter |
| RAG Toggle | Document-based Q&A |
| Model Selection | Choose from installed models |
| Knowledge Spaces | RAG 2.0 auto-routing |
| Thinking Blocks | `<think>` tag visualization |
| SSE Streaming | Real-time response display |
| Queue Tracking | Job persistence across tabs |
| Token Batching | RC-001 - Reduces re-renders |
| Race Conditions | RACE-001 - Chat switch handling |

### ModelStore.js

- Curated model catalog browsing
- Download progress with SSE streaming
- Activate/deactivate models (one in VRAM)
- Set default model for new chats
- Favorite models (localStorage)
- Performance metrics display
- P3-001: Progress visualization fix

### DocumentManager.js

- Document upload (PDF, TXT, DOCX, Markdown)
- Knowledge Spaces integration
- Upload progress tracking
- Indexing status monitoring
- Document deletion with confirmation
- Pagination and filtering
- Integration with MinIO storage

### Settings.js (Tab Container)

| Tab | Component | Features |
|-----|-----------|----------|
| Password | PasswordManagement | Dashboard/MinIO/n8n passwords |
| Telegram | TelegramSettings | Bot configuration |
| Updates | UpdatePage | System update management |
| Events | SelfHealingEvents | Self-healing history |
| Claude | ClaudeTerminal | LLM query interface |

### TelegramBots Module (Bot Management)

#### BotSetupWizard.js (Zero-Config Setup)

4-Schritt-Wizard für automatische Bot-Einrichtung:

| Step | Title | Features |
|------|-------|----------|
| 1 | Bot Token | Token-Validierung, Bot-Info-Anzeige |
| 2 | LLM Provider | Ollama/Claude Auswahl, Modell-Liste |
| 3 | System Prompt | Persoenlichkeit definieren, Templates |
| 4 | Chat verbinden | Deep-Link, WebSocket-Erkennung |

**Features:**
- WebSocket real-time Chat-Erkennung
- Polling-Fallback bei WebSocket-Fehler
- Exponential Backoff mit Jitter
- Deep-Link QR-Code Anzeige
- Token-Sichtbarkeit Toggle
- Retry-Logik bei Netzwerkfehlern

#### TelegramBots.js (Bot-Verwaltung)

| Feature | Description |
|---------|-------------|
| Bot-Liste | Alle Bots mit Status-Anzeige |
| Aktivieren/Deaktivieren | Webhook setzen/entfernen |
| Bot bearbeiten | LLM-Einstellungen aendern |
| Bot loeschen | Mit Bestaetigung |
| Test-Nachricht | Funktionstest senden |

## State Management

### Context Providers

#### AuthContext (`contexts/AuthContext.js`)

```javascript
// Provides:
- user: Current user object
- token: JWT token
- isAuthenticated: Boolean
- isLoading: Auth check in progress
- login(credentials): Promise
- logout(): void
- checkAuth(): Promise
```

**Features:**
- JWT storage in localStorage (`arasul_token`)
- Auto-logout on 401 responses
- Session verification on mount
- Cookie + localStorage fallback

#### DownloadContext (`contexts/DownloadContext.js`)

```javascript
// Provides:
- downloads: Map of active downloads
- startDownload(modelId): void
- cancelDownload(modelId): void
- getProgress(modelId): number
- onComplete(callback): void
```

**Features:**
- Persists across page navigation
- SSE streaming progress updates
- Polling fallback (RC-004 FIX)
- Abort controller for cancellation

#### ToastContext (`contexts/ToastContext.js`)

```javascript
// Provides:
- showToast(message, type, duration): void
- types: 'success' | 'error' | 'warning' | 'info'
```

**Features:**
- Auto-dismiss with configurable duration
- ARIA live regions for accessibility
- Icon support per type

### Custom Hooks

#### useWebSocketMetrics (`hooks/useWebSocketMetrics.js`)

```javascript
const { metrics, isConnected, error } = useWebSocketMetrics();

// Features:
- WebSocket: wss://host/api/metrics/live-stream
- Exponential backoff: 1s → 30s (10 attempts max)
- HTTP polling fallback after max reconnections
- Jitter support (±25%) prevents thundering herd
- 5-second update intervals
- Automatic cleanup on unmount
```

## Utility Modules

### token.js (`utils/token.js`)

```javascript
getValidToken()      // Validates format & expiration
setToken(token)      // Store in localStorage
removeToken()        // Clear token
hasValidToken()      // Check if valid
getTokenExpiration() // Get expiration date
```

- Token expiration warning at 5 minutes
- Supports non-standard JWT formats

### formatting.js (`utils/formatting.js`)

```javascript
formatDate(date)        // DD.MM.YYYY, HH:mm (German)
formatFileSize(bytes)   // Human-readable (B, KB, MB, GB, TB)
formatBytes(bytes, dec) // Configurable decimals
formatUptime(seconds)   // 2d 5h 30m format
formatNumber(num)       // German locale
formatPercent(num, dec) // Percentage with decimals
formatRelativeDate(d)   // "5m ago" format
```

### api.js (`config/api.js`)

```javascript
API_BASE             // Base URL from env or '/api'
defaultFetchOptions  // Content-Type & credentials
getAuthHeaders()     // Bearer token helper
getHeaders()         // Combined headers with auth
```

## Real-time Updates

### WebSocket Connection

```
wss://host/api/metrics/live-stream
```

| Setting | Value |
|---------|-------|
| Update interval | 5 seconds |
| Initial retry delay | 1 second |
| Max retry delay | 30 seconds |
| Max attempts | 10 |
| Jitter | ±25% |
| Fallback | HTTP polling |

### SSE Streaming (LLM/RAG)

- Server-Sent Events for chat responses
- Supports thinking blocks (`<think>` tags)
- Progress indicators during generation
- Queue status updates
- Model download progress

### Telegram WebSocket

```
wss://host/api/telegram-app/ws
```

| Message Type | Direction | Purpose |
|--------------|-----------|---------|
| subscribe | Client→Server | Subscribe to setup token |
| subscribed | Server→Client | Confirmation |
| setup_complete | Server→Client | Chat detected |
| progress | Server→Client | Status updates |
| error | Server→Client | Error notification |
| ping/pong | Bidirectional | Keep-alive |

**Features:**
- Real-time Chat-Erkennung bei Bot-Setup
- Automatische Reconnection bei Verbindungsabbruch
- Polling-Fallback nach max. 3 Reconnect-Versuchen

## API Integration

```javascript
// Base URL
const API_BASE = process.env.REACT_APP_API_URL || '/api';

// WebSocket URL (auto-detected)
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/api`;
```

### Key API Endpoints Called

| Category | Endpoints |
|----------|-----------|
| Auth | `/api/auth/login`, `/logout`, `/me` |
| Chat | `/api/llm/chat` (SSE), `/api/chats` |
| RAG | `/api/rag/query` (SSE), `/api/spaces` |
| Models | `/api/models/catalog`, `/download` (SSE) |
| Documents | `/api/documents/upload`, list, delete |
| Metrics | `/api/metrics/live`, WebSocket stream |
| System | `/api/system/status`, `/info`, `/network` |

### Axios Interceptors

- **Request**: Adds `Authorization: Bearer <token>`
- **Response**: Handles 401 with automatic logout

## Design System

> **Reference:** [docs/DESIGN_SYSTEM.md](../../docs/DESIGN_SYSTEM.md)

### Color Palette

```css
/* Primary (Blue - Only Accent Color) */
--color-primary:     #45ADFF;
--color-primary-hover: #6EC4FF;
--color-primary-active: #2D8FD9;
--color-primary-muted: rgba(69, 173, 255, 0.15);

/* Backgrounds */
--bg-dark:     #101923;  /* Main background */
--bg-card:     #1A2330;  /* Cards */
--bg-hover:    #222D3D;  /* Hover on cards */
--border:      #2A3544;  /* Standard border */

/* Text */
--text-primary:   #F8FAFC;  /* White */
--text-secondary: #CBD5E1;  /* Gray */
--text-muted:     #94A3B8;  /* Dimmed */

/* Status (Only when semantically necessary) */
--color-success: #22C55E;  /* Indexed, Online */
--color-warning: #F59E0B;  /* Processing */
--color-error:   #EF4444;  /* Failed, Offline */
```

### Responsive Breakpoints

| Device | Width |
|--------|-------|
| MacBook Pro 16" | 1728px |
| MacBook Pro 14" | 1512px |
| MacBook Air 13" | 1280px |
| External Monitor | 1920px |
| Tablet | 768px |
| Mobile | 576px, 375px |

### Component Patterns

```css
/* Button Primary */
background: #45ADFF;
color: #000;
border-radius: 6px;
padding: 0.625rem 1rem;

/* Card */
background: #1A2330;
border: 1px solid #2A3544;
border-radius: 12px;
padding: 1.25rem;

/* Input */
background: #101923;
border: 1px solid #2A3544;
border-radius: 8px;

/* Transitions */
transition: all 0.2s ease;

/* Hover Effect */
transform: translateY(-2px);
box-shadow: 0 4px 6px rgba(0,0,0,0.5);
```

## Accessibility Features

- Skip-to-content link
- ARIA labels on interactive elements
- ARIA live regions for notifications
- Keyboard navigation (Tab, Enter, Escape)
- Focus indicators on all controls
- Screen reader friendly labels
- Reduced motion support

## Performance Optimizations

| Optimization | Implementation |
|--------------|----------------|
| Lazy Loading | React.lazy() for routes |
| Token Batching | RC-001 - Batched state updates |
| Memoization | React.memo on heavy components |
| WebSocket Fallback | Prevents connection storms |
| Jitter | Prevents thundering herd |
| Suspense | Loading fallbacks |

## Known Issues & Fixes

| ID | Issue | Fix |
|----|-------|-----|
| ML-004 | 401 not triggering logout | AuthContext handles globally |
| RC-001 | Token re-renders | Batched updates |
| RC-004 | Download stuck | Polling fallback |
| RACE-001 | Chat switch race | AbortController |
| P3-001 | Progress not visible | Percentage display |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| REACT_APP_API_URL | /api | Backend API base URL |
| REACT_APP_WS_URL | auto-detected | WebSocket base URL |
| NODE_ENV | development | Build target |

## Development

```bash
# Install dependencies
npm install

# Development server (port 3000)
npm start

# Production build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Testing

- **Framework**: Jest + React Testing Library
- **Test files**: 15 in `src/__tests__/`
- **Coverage**: Component, integration, design system tests

### Test Categories

| Category | Files | Focus |
|----------|-------|-------|
| Component | 11 | Individual components |
| Integration | 2 | User flows |
| Design System | 1 | Color/style verification |
| Code Quality | 1 | Linting checks |

## Build & Deployment

### Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm ci && npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 3000
```

### nginx.conf Features

- SPA routing (all routes → index.html)
- Gzip compression
- 1-year cache for static assets
- Security headers (X-Frame-Options, X-XSS-Protection)
- Health endpoint at `/health`

### Build Output

```
build/
├── index.html
├── static/
│   ├── css/main.[hash].css
│   ├── js/main.[hash].js
│   └── media/
└── asset-manifest.json
```

## Dependencies

### Production (10)

- react (18.2.0) - UI framework
- react-dom (18.2.0) - DOM rendering
- react-router-dom (6.21.1) - Client-side routing
- recharts (2.10.3) - Charting library
- axios (1.6.5) - HTTP client
- react-icons (5.0.1) - Icon library (1000+ icons)
- date-fns (3.0.6) - Date utilities
- react-markdown (9.0.1) - Markdown rendering
- remark-gfm (4.0.0) - GitHub Flavored Markdown
- dompurify (3.0.8) - HTML sanitization
- mermaid (10.9.0) - Diagram rendering

### Development (4)

- react-scripts (5.0.1) - Create React App tooling
- @testing-library/react (14.1.2) - Component testing
- @testing-library/jest-dom (6.2.0) - DOM matchers
- @testing-library/user-event (14.5.2) - User interaction

## Health Check

```bash
# Docker health check
curl http://localhost:3000/health

# Or check for index.html
test -f /usr/share/nginx/html/index.html
```

## Related Documentation

- [Design System](../../docs/DESIGN_SYSTEM.md) - UI guidelines (MANDATORY)
- [Dashboard Backend](../dashboard-backend/README.md) - Backend API
- [API Guide](../../docs/API_GUIDE.md) - API usage examples
- [API Reference](../../docs/API_REFERENCE.md) - Complete endpoint list
