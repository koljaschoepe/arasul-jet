# Frontend Context - React 18 SPA

## Entry Points
- **Main App**: `services/dashboard-frontend/src/App.js`
- **Components**: `services/dashboard-frontend/src/components/`
- **Tests**: `services/dashboard-frontend/src/__tests__/`
- **Styles**: `services/dashboard-frontend/src/*.css`

## Design System (MANDATORY)

### Colors
```
Primary Blue:   #45ADFF (buttons, links, active)
Hover Blue:     #6EC4FF
Active Blue:    #2D8FD9

Background:     #101923 (main), #1A2330 (cards)
Border:         #2A3544
Text:           #F8FAFC (primary), #CBD5E1 (secondary), #94A3B8 (muted)

Status:
- Success: #22C55E (online, indexed)
- Warning: #F59E0B (processing, pending)
- Error:   #EF4444 (failed, offline)
```

### CSS Variables (ALWAYS use in JSX)
```javascript
// GOOD - use CSS variables
style={{ color: 'var(--primary-color)' }}
style={{ background: 'var(--bg-card)' }}

// BAD - never hardcode hex in JSX inline styles
style={{ color: '#45ADFF' }}
style={{ background: '#1a2330' }}
```

### Component Patterns
```css
/* Button Primary */
background: var(--primary-color); color: #000; border-radius: 6px;

/* Card */
background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px;

/* Input */
background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 8px;

/* Hover Effect */
transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.5);
```

## API Integration (MANDATORY PATTERN)

### API Base URL
```javascript
// ALWAYS import from config
import { API_BASE, getAuthHeaders } from '../config/api';

// GOOD
fetch(`${API_BASE}/endpoint`, { headers: getAuthHeaders() })

// BAD - never use /api/ directly
fetch('/api/endpoint', { headers: { ... } })
```

### Auth Headers
```javascript
// ALWAYS use getAuthHeaders() from config/api.js
import { getAuthHeaders } from '../config/api';
const response = await fetch(`${API_BASE}/data`, { headers: getAuthHeaders() });

// BAD - never define getAuthHeaders locally in components
const getAuthHeaders = () => { ... }; // WRONG - already exists in config/api.js
```

### HTTP Client
- Use `fetch` for all API calls (project standard)
- `axios` is installed but deprecated - do NOT use it for new code
- Auth interceptors are handled via `getAuthHeaders()`

## CSS File Convention
- Component CSS: Same name as component (e.g., `ChatMulti.js` -> `chatmulti.css`)
- Page-level CSS: In `src/` directory
- Always import CSS at end of import block: `import '../chatmulti.css';`

## Key Components

| Component | Purpose | Reference For |
|-----------|---------|---------------|
| ChatMulti.js | AI chat interface | Main pattern, SSE handling |
| Settings.js | Settings tabs | Tab navigation, forms |
| DocumentManager.js | Document upload | File handling, lists |
| ModelStore.js | Model management | API integration |
| TelegramBotsPage.js | Telegram bots | Multi-bot management |

## Hooks (src/hooks/)

| Hook | Purpose |
|------|---------|
| useConfirm | Confirmation dialogs (replaces window.confirm) |
| useMinLoadingTime | Prevents flash of loading |
| useTokenBatching | Optimizes streaming token rendering |
| useWebSocketMetrics | WebSocket with exponential backoff |

## Contexts (src/contexts/)

| Context | Purpose |
|---------|---------|
| AuthContext | Auth state + 401 interception |
| ToastContext | Toast notifications via `useToast()` |
| DownloadContext | File download management |

## Testing
```bash
# Run frontend tests
cd services/dashboard-frontend && npm test

# Design system compliance test
npm test -- designSystem.test.js
```

## Checklist Before Commit
- [ ] Only blue (#45ADFF) as accent color
- [ ] CSS variables in JSX, never hardcoded hex
- [ ] API calls use `API_BASE` from `config/api.js`
- [ ] Auth headers via `getAuthHeaders()` from `config/api.js`
- [ ] Hover/Focus states defined
- [ ] Responsive (Mobile-First)
- [ ] Transitions: `all 0.2s ease`
