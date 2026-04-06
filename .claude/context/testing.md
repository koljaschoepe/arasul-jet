# Context: Testing

## Quick Reference

| Stack    | Framework                           | Config                                       | Helpers                                                      |
| -------- | ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Backend  | Jest 29 + supertest                 | `jest.config.js`, `jest.setup.js`            | `__tests__/helpers/authMock.js`                              |
| Frontend | Vitest 3 + Testing Library React 16 | `vitest.config.ts`                           | `__tests__/helpers/renderWithProviders.tsx`, `testUtils.tsx` |
| Python   | Pytest                              | `tests/pytest.ini`, per-service `pytest.ini` | `tests/unit/conftest.py` (30+ module mocks)                  |
| E2E      | Playwright                          | `apps/dashboard-frontend/e2e/`               | 4 spec files                                                 |

## Run Tests

```bash
./scripts/test/run-tests.sh --backend     # Jest im Docker oder lokal
./scripts/test/run-tests.sh --frontend    # Vitest im Docker oder lokal
./scripts/test/run-tests.sh --all         # Beides
```

---

## Backend (Jest)

### Setup

`jest.setup.js` setzt:

- Env-Vars für DB, Services, MinIO (alles localhost/test)
- `RATE_LIMIT_ENABLED=false`
- `LOG_LEVEL=error`
- Global Timeout: 10s
- Global Hooks: `beforeEach` clearAllMocks, `afterAll` cleanup

### Auth-Mocking (WICHTIG)

```javascript
const { setupAuthMocks, generateTestToken, mockUser } = require('../helpers/authMock');

beforeEach(() => {
  setupAuthMocks(db); // Konfiguriert DB-Mock für Auth-Queries
});

test('protected route', async () => {
  const token = generateTestToken(); // Gültigen JWT erzeugen
  const response = await request(app).get('/api/protected').set('Authorization', `Bearer ${token}`);
});
```

`setupAuthMocks(db)` matcht DB-Queries per Pattern:

- `SELECT * FROM admin_users` → mockUser
- `SELECT * FROM active_sessions` → mockSession
- `SELECT * FROM token_blacklist` → empty (kein Blacklist)

### DB-Mocking Pattern

```javascript
const db = require('../../src/database');
jest.mock('../../src/database');

db.query.mockResolvedValue({ rows: [{ id: 1, name: 'test' }] });
// oder für spezifische Queries:
db.query.mockImplementation(query => {
  if (query.includes('admin_users')) return { rows: [mockUser] };
  return { rows: [] };
});
```

### Test-Datei-Konvention

```
__tests__/
  unit/           # Unit-Tests (mock alles)
    auth.test.js
    documents.test.js
    ...
  integration/    # Integration-Tests (Service-übergreifend)
    llm-pipeline.test.js
    rag-pipeline.test.js
    ...
  helpers/
    authMock.js   # Auth-Mock-Factory
    testHelpers.js # waitFor, createDeferred, cleanup
```

---

## Frontend (Vitest)

### Provider-Wrapper (WICHTIG)

```tsx
import { renderWithProviders, createMockApi } from '../helpers/renderWithProviders';

const mockApi = createMockApi({
  get: vi.fn().mockResolvedValue({ data: [...] }),
});

vi.mock('../../hooks/useApi', () => ({
  default: () => mockApi,
  useApi: () => mockApi,
}));

renderWithProviders(<MyComponent />, { route: '/settings' });
```

### Mock-Factories

```tsx
// renderWithProviders.tsx bietet:
createMockApi(overrides?)      // { get, post, put, patch, del, request }
createMockToast()              // { success, error, warning, info }
createMockAuth(overrides?)     // { user, isAuthenticated, login, logout }
createMockDownloads(overrides?) // { activeDownloads, startDownload }
createMockChatContext(overrides?) // Chat-State
```

### Vitest-spezifische Regeln

- `vi.mock()` statt `jest.mock()`, `vi.fn()` statt `jest.fn()`
- Default-Export-Mock MUSS `{ default: ... }` returnen:
  ```tsx
  vi.mock('../../hooks/useApi', () => ({
    default: () => mockApi,
  }));
  ```
- `vi.useFakeTimers({ shouldAdvanceTime: true })` für Timer + waitFor
- JSDOM gibt Farben als `rgb()` zurück (nicht hex)
- Env: `import.meta.env.VITE_*` (nicht process.env.REACT*APP*\*)

### Test-Datei-Konvention

```
src/__tests__/
  App.test.tsx
  contexts/        # Context-Tests
  hooks/           # Hook-Tests
  integration/     # Feature-übergreifende Tests
  helpers/
    renderWithProviders.tsx
    testUtils.tsx
  lib/
src/features/*/
  __tests__/       # Feature-spezifische Tests
```

---

## Python (Pytest)

### Conftest

`tests/unit/conftest.py` mockt 30+ Module (torch, numpy, qdrant_client, docker, etc.) damit Unit-Tests ohne Container-Dependencies laufen.

### Per-Service Tests

```
services/metrics-collector/tests/test_collector.py  # Unit-Tests
services/self-healing-agent/tests/test_healing_mock.py  # Mock-Tests
```

### Ausführen

```bash
cd services/metrics-collector && python -m pytest tests/
cd services/self-healing-agent && python -m pytest tests/
```

---

## Coverage-Lücken (Stand April 2026)

### Backend — Untestete Routes (23 von 40)

Admin: audit, selfhealing, settings, update |
AI: embeddings, knowledge-graph, memory, models, spaces |
Datentabellen: index, quotes, rows, tables |
External: alerts, claudeTerminal, events, externalApi |
Store: appstore | System: tailscale | Telegram: app, settings

### Frontend — ~110 von 145 Components ohne Tests

### Python — 11 von 13 Services ohne Tests

Kritisch: document-indexer (16 Module, 0 Tests)
