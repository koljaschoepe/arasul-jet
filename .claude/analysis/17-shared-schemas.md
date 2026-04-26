# Phase-4: Shared Schemas & Type-Sicherheit – Analyse

**Datum:** 2026-04-21  
**Domain:** Frontend↔Backend Konsistenz | Zod Schemas | TypeScript Types  
**Git-Referenz:** `dd75755` (Phase-4 API-01), `55f8774` (Phase-4 API-06)

---

## Executive Summary

Das `@arasul/shared-schemas` Workspace wurde in Phase-4 API-01 eingeführt, um eine Single-Source-of-Truth (SSOT) für Request/Response-Validierung zwischen Frontend und Backend zu schaffen. Die Implementation ist **teilweise vollständig**: LLM/Chat-Schemas sind zentral verwaltet, aber **nicht alle Backend-Routes nutzen gemeinsame Schemas**, und **Frontend-Forms importieren Schemas noch nicht systematisch**. Das ErrorEnvelope-Pattern aus API-06 ist implementiert, aber die Schemas sind noch minimal ausgebaut.

**Kernerkenntnisse:**

- ✅ Workspace-Setup & Build-Konfiguration funktioniert (tsup, CJS/ESM)
- ✅ Backend-Middleware (validateBody) ist etabliert und nutzt Zod
- ✅ Error-Envelope `{ error: { code, message, details } }` als Type definiert
- ⚠️ Nur 2 Schemas in shared-schemas; 20+ lokale Backend-Schemas bleiben Duplikate
- ⚠️ Frontend importiert Zod-Schemas noch nicht in Forms (außer Login)
- ⚠️ Keine Tests für Schemas (z.B. Beispiel-Payloads → safeParse)
- ⚠️ TanStack Query Keys sind nicht zentral verwaltet

---

## Projektstruktur

```
packages/shared-schemas/
├── src/
│   ├── index.ts         (Export-Hub)
│   ├── errors.ts        (ErrorBody, ErrorEnvelope, ERROR_CODES)
│   └── llm.ts           (ChatBody, PrioritizeJobBody + Types)
├── package.json         (Zod, tsup)
└── tsconfig.json        (ES2022, ESNext, declaration: true)

dist/                     (Generated: .cjs, .js, .d.ts)
```

### Build-Output

```
Exports in package.json:
  - main: "./dist/index.cjs"      (CommonJS für Backend)
  - module: "./dist/index.js"     (ESM für Frontend)
  - types: "./dist/index.d.ts"
```

---

## Schema-Coverage-Analyse

### Shared Schemas (SSOT)

| Schema                | Datei     | Backend-Route              | Frontend-Import | Status         |
| --------------------- | --------- | -------------------------- | --------------- | -------------- |
| `ChatBody`            | llm.ts    | POST /llm/chat             | ChatContext.tsx | ✅ Beide       |
| `ChatInput` (Type)    | llm.ts    | -                          | ChatContext.tsx | ✅ Type-Export |
| `PrioritizeJobBody`   | llm.ts    | POST /llm/queue/prioritize | -               | ⚠️ BE-only     |
| `ErrorBody`           | errors.ts | Global                     | useApi.ts       | ✅ Implizit    |
| `ErrorEnvelope`       | errors.ts | Global                     | useApi.ts       | ✅ Implizit    |
| `ERROR_CODES` (Const) | errors.ts | API meta                   | -               | ✅ Definiert   |

### Backend-lokale Schemas (Duplikate)

| Schema                | Datei          | Status       | BLOCKER                   |
| --------------------- | -------------- | ------------ | ------------------------- |
| `LoginBody`           | auth.js        | Backend-only | ⚠️ Frontend hat eigenes   |
| `ChangePasswordBody`  | auth.js        | Backend-only | ⚠️ FE nicht implementiert |
| `CreateChatBody`      | chats.js       | Backend-only | ⚠️ Duplikat möglich       |
| `PostMessageBody`     | chats.js       | Backend-only | ⚠️ Duplikat möglich       |
| `PatchChatBody`       | chats.js       | Backend-only | ⚠️ Duplikat möglich       |
| `RagQueryBody`        | rag.js         | Backend-only | ⚠️ Duplikat möglich       |
| `DownloadBody`        | models.js      | Backend-only | ⚠️ Duplikat möglich       |
| `ExternalLlmChatBody` | externalApi.js | Backend-only | ⚠️ Separate impl          |
| `+15 weitere`         | Various        | Backend-only | ⚠️                        |

**Statistik:** 2 Schemas in shared-schemas, ~20+ lokale Backend-Schemas (nicht zentral)

---

## [MAJOR] Findings

### 1. **Frontend-Forms nutzen Schemas noch nicht**

**Problem:** Login-Form (Login.tsx) definiert **eigenes** LoginSchema lokal:

```typescript
// Dashboard-Frontend: Login.tsx
const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Backend: auth.js
const { LoginBody } = require('../schemas/auth');
// → Zod.parse nicht in shared-schemas
```

**Impact:**

- Keine Single-Source-of-Truth für Login
- Bei Backend-Änderung muss Frontend manuell aktualisiert werden
- Typecheck-Fehler möglich (z.B. password min 8 characters)

**Migration Path:**

1. Verschiebe `LoginBody` zu `packages/shared-schemas/src/auth.ts`
2. Export in `index.ts`
3. Backend & Frontend importieren von `@arasul/shared-schemas`
4. Linting: `npm run lint:backend && npm run lint:frontend` prüft Konsistenz

---

### 2. **ErrorEnvelope als Type definiert, aber nicht konsistent validiert**

**Status:** ✅ Type existiert, aber:

```typescript
// shared-schemas/errors.ts
export const ErrorEnvelope = z.object({
  error: ErrorBody,
  timestamp: z.string().min(1),
});
export type ErrorEnvelopePayload = z.infer<typeof ErrorEnvelope>;
```

**Problem:**

- Backend wirft Fehler als Envelope (korrekt)
- Frontend normalisiert Envelope in useApi.ts manuell (fallback-komplex)
- Keine Tests, dass Middleware + Handler Envelope korrekt shapes

**Evidence:** useApi.ts normalizeErrorBody() hat 4 Fallback-Varianten:

```typescript
// Canonical: { error: { code, message, details } }
// Legacy 1: { error: 'msg', code, details }
// Legacy 2: { message: 'msg', code, details }
// Edge: { message: 'msg' }
```

**Action Required:**

- Middleware sollte ErrorEnvelope.parse() prüfen
- Tests für Fehlerformat schreiben (alle Statuscode-Fälle)
- Einseitige Validierung entfernen, auf Type verlassen

---

### 3. **Keine Schema-Tests (z.B. safeParse Beispiele)**

**Problem:**

- Packages/shared-schemas/ hat **keine Tests**
- Zod-Schemas sind ungetestet
- Neue Schemas könnten Breaking Changes verursachen

**Beispiel, was fehlt:**

```typescript
// packages/shared-schemas/__tests__/llm.test.ts (NICHT VORHANDEN)
import { ChatBody } from '../src/llm';

describe('ChatBody', () => {
  it('accepts valid chat payload', () => {
    const valid = {
      messages: [{ role: 'user', content: 'Hi' }],
      conversation_id: 123,
      stream: true,
    };
    const result = ChatBody.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects empty messages', () => {
    const invalid = {
      messages: [],
      conversation_id: 123,
    };
    const result = ChatBody.safeParse(invalid);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].code).toBe('custom');
  });
});
```

**Setup Required:**

1. Vitest in `packages/shared-schemas/package.json`
2. `__tests__/` Verzeichnis + Test-Files
3. CI-Integration (npm run test:backend prüft auch shared-schemas)

---

### 4. **TanStack Query Keys nicht zentral verwaltet**

**Status:** Frontend hat `@tanstack/react-query` (^5.62.11), aber:

**Problem:**

- Query Keys sind **inline** in Components definiert (nicht verwaltet)
- Keine Query-Key-Factory
- Bei Backend-Change: manuelle Key-Updates überall

**Beispiel-Pattern (aktuell NICHT vorhanden):**

```typescript
// packages/shared-schemas/src/queryKeys.ts (NICHT VORHANDEN)
export const queryKeys = {
  chat: {
    all: ['chats'] as const,
    lists: () => [...queryKeys.chat.all, 'list'] as const,
    list: (filter: string) => [...queryKeys.chat.lists(), { filter }] as const,
    details: () => [...queryKeys.chat.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.chat.details(), id] as const,
  },
  models: {
    all: ['models'] as const,
    list: () => [...queryKeys.models.all, 'list'] as const,
    installed: () => [...queryKeys.models.list(), 'installed'] as const,
  },
};
```

**Actions:**

1. Erstelle `packages/shared-schemas/src/queryKeys.ts`
2. Export in `index.ts`
3. Frontend: `import { queryKeys } from '@arasul/shared-schemas'`
4. Refactor alle useQuery()-Aufrufe

---

### 5. **Backend-Schemas sind noch zu lokal**

**Routes ohne validateBody (12):**

```
❌ admin/gdpr.js
❌ admin/audit.js
❌ admin/backup.js
❌ admin/selfhealing.js
❌ documentImages.js
❌ documentAnalysis.js
❌ system/database.js
❌ system/logs.js
❌ system/metrics.js
❌ store/store.js
❌ docs.js
```

**Problematisch:** POST/PUT/PATCH ohne Validation kann zu:

- Datenverlust (typen umwandlung)
- Security-Lücken (unexpected fields)
- API-Inkonsistenz

**Action:**

1. Inventory: Welche POST/PUT/PATCH-Routes existieren?
2. Für jede: Zod-Schema definieren
3. Minimale Schemas (leere object erlaubt) bis Details bekannt

---

## [MINOR] Findings

### 6. **Build-Konfiguration ist gut, aber ESM-Importierung noch nicht vollständig**

**Status:** ✅ funktioniert, aber Warnung möglich

```json
// Frontend
"dependencies": {
  "@arasul/shared-schemas": "file:../../packages/shared-schemas"
}
```

**Risk:**

- Vite kann shared-schemas/dist optimieren
- Wenn shared-schemas nicht gebaut ist → Frontend build fehlschlag
- CI-Pipeline muss shared-schemas zuerst bauen

**Fix:** Root package.json build script:

```json
{
  "scripts": {
    "build:all": "npm run build -w packages/shared-schemas && npm run build -w apps/dashboard-frontend && npm run build -w apps/dashboard-backend"
  }
}
```

---

### 7. **Keine Error-Envelope Konsistenzprüfung im Testing**

**Problem:** Verschiedene Fehler-Shapes im Code:

- `{ error: { code, message, details }, timestamp }` (korrekt)
- `{ error: 'string', timestamp }` (rateLimit.js)
- `{ message: 'string' }` (ohne Struktur)

**Lösung:**

```typescript
// apps/dashboard-backend/__tests__/integration/errorHandler.test.js
it('all error responses match ErrorEnvelope schema', async () => {
  const response = await request(app).post('/api/nonexistent');
  const { ErrorEnvelope } = require('@arasul/shared-schemas');
  const parsed = ErrorEnvelope.safeParse(response.body);
  expect(parsed.success).toBe(true);
});
```

---

### 8. **Frontend Login-Schema Duplikat**

**Status:** ⚠️ Minor (nur 1 Form, aber Anti-Pattern)

```typescript
// Frontend: duplicate LoginSchema
const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Backend: nur partial constraints
const LoginBody = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
```

**Inconsistency:** Frontend erlaubt password > 256 chars (BE lehnt ab)

---

## Migration-Todo-Liste

### Phase 1: Shared-Schemas Ausbau (1-2 Sprints)

- [ ] Verschiebe `LoginBody, ChangePasswordBody` zu `packages/shared-schemas/src/auth.ts`
- [ ] Erstelle `packages/shared-schemas/src/chats.ts` mit `CreateChatBody, PatchChatBody, PatchChatSettingsBody, PostMessageBody`
- [ ] Erstelle `packages/shared-schemas/src/rag.ts` mit `RagQueryBody`
- [ ] Erstelle `packages/shared-schemas/src/models.ts` mit `DownloadBody, DefaultModelBody`
- [ ] Erstelle `packages/shared-schemas/src/queryKeys.ts` für TanStack Query Key-Factory
- [ ] npm run build in shared-schemas prüft (dist muss existieren)
- [ ] Backend: Alle Schemas von lokalen imports → shared-schemas umschalten

### Phase 2: Frontend-Integration (1 Sprint)

- [ ] Login.tsx: `LoginSchema` → `import { LoginBody } from '@arasul/shared-schemas'`
- [ ] ChatContext: `ChatInput` wird bereits importiert (✅ ok)
- [ ] Refactor alle useQuery()-Aufrufe mit centralen Query Keys
- [ ] useApi.ts: ErrorEnvelope.parse() für Response-Validierung (optional, fallback bleibt)

### Phase 3: Testing & Validation (1 Sprint)

- [ ] Setup Vitest in `packages/shared-schemas`
- [ ] Schreibe Tests: llm.test.ts, auth.test.ts, errors.test.ts
- [ ] Integration-Tests: Backend-Routes geben Envelope mit korrektem Shape zurück
- [ ] CI: `npm test` läuft auch für shared-schemas

### Phase 4: Aufräumen (optional, aber sauberer)

- [ ] Entferne lokale Duplikate in `apps/dashboard-backend/src/schemas/` nachdem shared-schemas importiert
- [ ] Dokumentation: ADR für "Schemas sind in shared-schemas zentral"
- [ ] Developer-Guide: "Wie neue Route-Schemas hinzufügen?"

---

## TypeScript-Konsistenz Checkpunkt

**Wo Type-Sicherheit aktuell gegeben ist:**

- ✅ `ChatInput` (re-export von `z.infer<ChatBody>`)
- ✅ `ErrorBodyPayload, ErrorEnvelopePayload` (Types definiert)
- ✅ Backend-Middleware bestätigt Body als Zod-validiert

**Wo Type-Sicherheit fehlt:**

- ❌ Frontend-Forms: Lokale `LoginSchema` statt shared Type
- ❌ TanStack Query: Query-Response-Types nicht definiert
- ❌ RAG/Models Routes: Keine shared Schemas → Backend/Frontend können driften

---

## Zusammenfassung & Nächste Schritte

| Bereich                      | Status            | Priorität | Aufwand |
| ---------------------------- | ----------------- | --------- | ------- |
| Workspace Setup              | ✅ OK             | -         | -       |
| Error Envelope Type          | ✅ OK             | -         | -       |
| Chat/LLM Schemas (shared)    | ✅ OK             | -         | -       |
| Other Routes (local Schemas) | ⚠️ 20+ duplicates | **MAJOR** | Medium  |
| Frontend Form Integration    | ⚠️ Manual         | **MAJOR** | Small   |
| Schema Testing               | ❌ None           | **MAJOR** | Medium  |
| Query Keys (centralized)     | ❌ None           | **MAJOR** | Small   |
| Build CI/Pipeline            | ✅ Partial        | MINOR     | Small   |

### Quick Win (1 Tag)

1. Verschiebe `auth.ts` zu shared-schemas
2. Frontend-Login refactorieren
3. Schreibe 1-2 Schema-Tests

### Mittelfristig (2-3 Sprints)

1. Alle Core-Routes (auth, chats, models, rag) → shared-schemas
2. Query-Keys Factory definieren
3. Test-Coverage für Schemas

### Langfristig

1. Alle 20+ Backend-Schemas centralisieren (iterativ)
2. OpenAPI/TypeGen aus Zod (optional, für externe API)
3. Frontend-Form-Builder mit Zod-Schema-Inference

---

**Report generiert:** 2026-04-21  
**Analyseur:** Claude Code Agent (Haiku 4.5)  
**Codebase-größe:** 178 Backend-Routes, ~50+ API-Endpoints, 3-Tier Architecture
