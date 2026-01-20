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

### Component Patterns
```css
/* Button Primary */
background: #45ADFF; color: #000; border-radius: 6px;

/* Card */
background: #1A2330; border: 1px solid #2A3544; border-radius: 12px;

/* Input */
background: #101923; border: 1px solid #2A3544; border-radius: 8px;

/* Hover Effect */
transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.5);
```

## Key Components

| Component | Purpose | Reference For |
|-----------|---------|---------------|
| ChatMulti.js | AI chat interface | Main pattern, SSE handling |
| Settings.js | Settings tabs | Tab navigation, forms |
| DocumentManager.js | Document upload | File handling, lists |
| ModelStore.js | Model management | API integration |
| TelegramSettings.js | Telegram config | Form validation |

## Testing
```bash
# Run frontend tests
cd services/dashboard-frontend && npm test

# Design system compliance test
npm test -- designSystem.test.js
```

## API Integration
- Base URL: `/api/` (proxied via Traefik)
- Auth: JWT token in `Authorization: Bearer <token>`
- SSE: Used for `/api/llm/chat` and `/api/rag/query`
- WebSocket: `/api/metrics/live-stream` for real-time metrics

## Checklist Before Commit
- [ ] Only blue (#45ADFF) as accent color
- [ ] Grayscale from defined palette
- [ ] Status colors only when semantically necessary
- [ ] Hover/Focus states defined
- [ ] Responsive (Mobile-First)
- [ ] Transitions: `all 0.2s ease`
