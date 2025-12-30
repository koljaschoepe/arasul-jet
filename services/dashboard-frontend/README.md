# Dashboard Frontend

Single Page Application (SPA) for the Arasul Platform dashboard.

## Overview

| Property | Value |
|----------|-------|
| Port | 3000 (internal), 8080 (via Traefik) |
| Framework | React 18.2 |
| Routing | React Router 6.21 |
| Charts | Recharts 2.10 |
| Build | Create React App 5.0 |

## Directory Structure

```
src/
├── index.js              # React root entry point
├── App.js                # Main application, routing, WebSocket setup
├── index.css             # Global styles
├── components/
│   ├── ChatMulti.js      # Multi-conversation AI chat with RAG toggle
│   ├── DocumentManager.js# Document upload and management
│   ├── MarkdownEditor.js # Markdown editing component
│   ├── Settings.js       # Settings page with tabs
│   ├── PasswordManagement.js # Password change UI
│   ├── UpdatePage.js     # System update management
│   ├── SelfHealingEvents.js # Self-healing event viewer
│   ├── Login.js          # Authentication form
│   ├── Chat.js           # Legacy single chat (deprecated)
│   ├── ErrorBoundary.js  # Error handling wrapper
│   └── LoadingSpinner.js # Loading state component
├── chat.css              # Chat component styles
├── chatmulti.css         # Multi-chat styles
├── settings.css          # Settings page styles
├── documents.css         # Document manager styles
└── markdown-editor.css   # Editor styles
```

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | DashboardHome | Main dashboard with metrics & charts |
| `/chat` | ChatMulti | Multi-conversation AI chat |
| `/documents` | DocumentManager | Document upload & RAG management |
| `/settings` | Settings | System settings & password management |

## Key Components

### App.js (Main Application)
- JWT authentication with axios interceptors
- Automatic token refresh on 401 responses
- WebSocket connection for live metrics
- HTTP polling fallback when WebSocket fails
- System status monitoring

### ChatMulti.js
- Multi-conversation support with sidebar
- RAG toggle for document-based Q&A
- SSE streaming for LLM responses
- Thinking block visualization (`<think>` tags)
- Message persistence to PostgreSQL
- Auto-generated conversation titles

### DocumentManager.js
- Document upload (PDF, TXT, DOCX, Markdown)
- Upload progress tracking
- Indexing status monitoring
- Document deletion
- Integration with MinIO storage

### Settings.js
- Tab-based navigation
- General settings
- Password management (Dashboard, MinIO, n8n)
- Update management
- Self-healing event viewer

## State Management

The application uses React's built-in state management:

- **App-level state**: Authentication, metrics, system info, services status
- **Component-level state**: Form data, UI state, local data
- **Local storage**: JWT token (`arasul_token`), user info (`arasul_user`)

No external state library (Redux, MobX) is used.

## Real-time Updates

### WebSocket Connection
```
ws://host/api/metrics/live-stream
```

- Connects on authentication
- 5-second metric updates
- Exponential backoff reconnection (1s → 30s max)
- Maximum 10 reconnection attempts
- Automatic HTTP polling fallback

### SSE Streaming (LLM/RAG)
- Server-Sent Events for chat responses
- Supports thinking blocks
- Progress indicators during generation

## API Integration

All API calls use axios with automatic auth headers:

```javascript
// Base URL
const API_BASE = process.env.REACT_APP_API_URL || '/api';

// WebSocket URL
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = `${WS_PROTOCOL}//${window.location.host}/api`;
```

### Interceptors
- Request: Adds `Authorization: Bearer <token>` header
- Response: Handles 401 errors with automatic logout

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| REACT_APP_API_URL | /api | Backend API base URL |
| REACT_APP_WS_URL | auto-detected | WebSocket base URL |

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
```

## Styling

The application uses custom CSS with:

- CSS custom properties (variables)
- Dark theme by default
- Responsive design with media queries
- Flexbox and CSS Grid layouts
- Smooth transitions and animations

### Color Scheme
- Primary: `#45ADFF` (blue)
- Background: `#0f1419` (dark)
- Surface: `#1a2330` (dark gray)
- Success: `#10b981` (green)
- Warning: `#f59e0b` (amber)
- Error: `#ef4444` (red)

## Dependencies

### Production
- react (18.2.0) - UI framework
- react-dom (18.2.0) - DOM rendering
- react-router-dom (6.21.1) - Client-side routing
- recharts (2.10.3) - Charting library
- axios (1.6.5) - HTTP client
- react-icons (5.0.1) - Icon library
- date-fns (3.0.6) - Date utilities
- react-markdown (9.0.1) - Markdown rendering
- remark-gfm (4.0.0) - GitHub Flavored Markdown

### Development
- react-scripts (5.0.1) - Create React App tooling

## Build Output

Production build creates optimized static files in `/build`:

```
build/
├── index.html
├── static/
│   ├── css/
│   └── js/
└── asset-manifest.json
```

Served by Traefik reverse proxy at `http://host:8080/`.

## Related Documentation

- [Dashboard Backend](../dashboard-backend/README.md) - Backend API
- [API Guide](../../docs/API_GUIDE.md) - API usage examples
