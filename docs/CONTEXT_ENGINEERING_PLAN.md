# Context Engineering Optimization Plan

**Arasul Platform - Claude Code Context Engineering**
**Erstellt: 2026-01-16**

---

## Executive Summary

Diese Analyse optimiert das Context Engineering für Claude Code, sodass alle Agents (Haupt-Agent und Subagents) das gesamte Projekt verstehen und effizient arbeiten können.

---

## 1. Aktuelle Situation

### 1.1 Was existiert

| Komponente | Status | Qualität |
|------------|--------|----------|
| `CLAUDE.md` | Vorhanden | Gut, aber veraltet (10 statt 13 Services) |
| `.claude/settings.local.json` | Vorhanden | Gut konfiguriert |
| `.claude/commands/*.md` | Vorhanden | 3 Workflow-Templates |
| `docs/INDEX.md` | Vorhanden | Telegram-Bot fehlt |
| Service READMEs | Vorhanden | Teilweise veraltet |
| API Dokumentation | Vorhanden | 47% undokumentiert |

### 1.2 Identifizierte Probleme

1. **Veraltete Architektur-Info**: CLAUDE.md zeigt 10 Services, es sind aber 13
2. **Fehlende Endpoints**: 85+ API-Endpoints nicht dokumentiert
3. **Keine Subagent-Kontextstrategie**: Subagents haben keinen standardisierten Kontext
4. **Duplizierte Migrations**: Migration-Nummern kollidieren (010_, 015_)
5. **Inkonsistente Referenzen**: Telegram-Bot nicht in INDEX.md

---

## 2. Context Engineering Strategie

### 2.1 Kontexthierarchie

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: CLAUDE.md (Primärkontext)                        │
│  - Projektübersicht, Architektur, Workflows                │
│  - Wird IMMER als erstes geladen                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: Domain-Specific Docs                              │
│  - docs/DESIGN_SYSTEM.md (Frontend)                         │
│  - docs/API_REFERENCE.md (Backend)                          │
│  - docs/DATABASE_SCHEMA.md (Datenbank)                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: Service READMEs                                   │
│  - services/{service}/README.md                             │
│  - Entry Points, lokale APIs, Dependencies                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: Source Code                                       │
│  - Implementierungsdetails nach Bedarf                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Kontextinjektions-Muster für Subagents

Wenn ein Task-Agent gestartet wird, sollte er diesen Kontext erhalten:

```markdown
## Projekt: Arasul Platform
- 13 Docker-Services auf NVIDIA Jetson AGX Orin
- Frontend: React 18 | Backend: Node.js/Express | DB: PostgreSQL 16
- AI: Ollama LLM + Sentence Transformers + Qdrant Vector DB

## Kritische Dateien
- CLAUDE.md: Entwicklungsrichtlinien
- docs/DESIGN_SYSTEM.md: Frontend-Design (MANDATORY)
- docs/API_REFERENCE.md: API-Dokumentation

## Aktuelle Task-Domäne
[Spezifische Kontextinformationen je nach Task]
```

---

## 3. Optimierungsplan

### Phase 1: CLAUDE.md Überarbeitung (Sofort)

**Änderungen:**

1. **Architektur aktualisieren**: 13 Services statt 10
   - Dashboard-Backend, Dashboard-Frontend
   - LLM-Service, Embedding-Service, Document-Indexer
   - PostgreSQL, MinIO, Qdrant
   - Metrics-Collector, Self-Healing-Agent
   - **NEU**: Telegram-Bot, n8n, Traefik

2. **Service-Map hinzufügen**: Vollständige Übersicht aller Entry Points

3. **Backend-Routes vervollständigen**: Alle 24 Route-Dateien auflisten

4. **Migrations-Übersicht aktualisieren**: 25 SQL-Dateien dokumentieren

5. **Subagent-Kontext-Sektion**: Standardkontext für Task-Agents

### Phase 2: Dokumentationslücken schließen (Priorität 1)

| Datei | Aktion | Aufwand |
|-------|--------|---------|
| `docs/ALERTS_SYSTEM.md` | Erstellen | 2h |
| `docs/CLAUDE_TERMINAL.md` | Erstellen | 1h |
| `docs/KNOWLEDGE_SPACES.md` | Erstellen | 1h |
| `docs/EVENTS_SYSTEM.md` | Erstellen | 2h |
| `docs/INDEX.md` | Telegram-Bot hinzufügen | 15min |
| `docs/API_REFERENCE.md` | 85+ Endpoints hinzufügen | 4h |

### Phase 3: Context Engineering Infrastruktur (Priorität 2)

1. **Kontext-Template erstellen**: `.claude/context/base.md`
2. **Service-spezifische Kontexte**: `.claude/context/{service}.md`
3. **Task-Kontext-Generator**: Script für automatische Kontextgenerierung

---

## 4. Optimierte CLAUDE.md Struktur

```markdown
# CLAUDE.md (Optimiert)

## 1. Quick Navigation (unverändert)
## 2. Workflow Rules (unverändert)

## 3. Project Overview (ERWEITERT)
- Hardware-Specs
- Service-Übersicht (13 Services)
- Tech-Stack Zusammenfassung

## 4. Complete Architecture (NEU)
- Vollständiges Service-Diagramm
- Alle Ports und Abhängigkeiten
- Startup-Reihenfolge

## 5. Service Reference (NEU)
- Entry Points für jeden Service
- Wichtige Dateien pro Service
- Dependencies

## 6. Backend Routes Complete (NEU)
- Alle 24 Route-Dateien
- Endpoint-Kategorien
- Auth-Requirements

## 7. Database Migrations (ERWEITERT)
- Alle 25 Migrations
- Schema-Gruppen
- Tabellen-Beziehungen

## 8. Frontend Design System (unverändert)

## 9. Common Development Tasks (unverändert)

## 10. Debugging Cheatsheet (unverändert)

## 11. Subagent Context Template (NEU)
- Standardkontext für Task-Agents
- Domain-spezifische Erweiterungen

## 12. Environment Variables (unverändert)

## 13. References (ERWEITERT)
```

---

## 5. Subagent-Kontext-Patterns

### 5.1 Basis-Kontext (Immer injizieren)

```markdown
# Arasul Platform Context

## Stack
- Frontend: React 18 SPA (Port 3000)
- Backend: Node.js/Express (Port 3001)
- Database: PostgreSQL 16 (Port 5432)
- AI: Ollama LLM (11434) + Embeddings (11435) + Qdrant (6333)
- Storage: MinIO S3 (9000)

## Kritische Regeln
1. DESIGN_SYSTEM.md befolgen (nur Blau #45ADFF als Akzent)
2. Tests vor Commit: ./scripts/run-tests.sh
3. API-Änderungen: docs/API_REFERENCE.md aktualisieren
4. Schema-Änderungen: docs/DATABASE_SCHEMA.md aktualisieren

## Entry Points
- Backend: services/dashboard-backend/src/index.js
- Frontend: services/dashboard-frontend/src/App.js
- Database: services/postgres/init/*.sql
```

### 5.2 Frontend-Kontext (Bei UI-Tasks)

```markdown
# Frontend Context Extension

## Design System (MANDATORY)
- Primär: #45ADFF (Blau)
- Hintergrund: #101923 / #1A2330
- Text: #F8FAFC / #CBD5E1 / #94A3B8
- Status: Grün #22C55E, Gelb #F59E0B, Rot #EF4444

## Komponenten-Struktur
services/dashboard-frontend/src/components/
├── App.js              # Router, Auth
├── ChatMulti.js        # AI Chat (Hauptkomponente)
├── Settings.js         # Settings-Tabs
├── DocumentManager.js  # Dokument-Upload
├── ClaudeTerminal.js   # Terminal-Interface
└── TelegramSettings.js # Telegram-Konfiguration

## Referenz-Patterns
- Karten-Layout: ChatMulti.js
- Form-Handling: Settings.js
- Modal-Pattern: AppDetailModal.js
```

### 5.3 Backend-Kontext (Bei API-Tasks)

```markdown
# Backend Context Extension

## Route-Struktur
services/dashboard-backend/src/routes/
├── auth.js       # Login, JWT
├── llm.js        # LLM Chat (SSE)
├── rag.js        # RAG Queries
├── chats.js      # Multi-Conversation
├── documents.js  # Dokument-CRUD
├── alerts.js     # Alert-System
├── events.js     # Event-Streaming
├── telegram.js   # Telegram-Integration
└── audit.js      # Audit-Logs

## Middleware
- auth.js: JWT-Validierung (require('../middleware/auth'))
- audit.js: Request-Logging
- rateLimit.js: Per-User Limits

## Referenz-Patterns
- Auth-Route: routes/auth.js
- SSE-Streaming: routes/llm.js
- CRUD: routes/documents.js
```

### 5.4 Database-Kontext (Bei Schema-Tasks)

```markdown
# Database Context Extension

## Migrations (25 Dateien)
services/postgres/init/
├── 001-009: Core (metrics, auth, chat, documents)
├── 010-012: Features (alerts, models, appstore)
├── 013-014: Advanced (workspaces, knowledge)
├── 015-016: Integration (telegram, audit)
├── 023-025: Consolidation

## Wichtige Tabellen
- users, sessions (Auth)
- conversations, messages (Chat)
- documents, document_chunks (RAG)
- alert_config, notification_events (Alerts)
- telegram_config, telegram_security (Telegram)

## Idempotenz-Regel
CREATE TABLE IF NOT EXISTS ...
CREATE INDEX IF NOT EXISTS ...
```

---

## 6. Hook-Optimierung

### 6.1 Aktuelle Hooks

```json
{
  "PostToolUse": "Edit|Write → ./scripts/run-typecheck.sh",
  "Stop": "./scripts/run-tests.sh --backend + telegram-notify.sh",
  "Notification": "telegram-notify.sh"
}
```

### 6.2 Empfohlene Erweiterungen

```json
{
  "PreToolUse": {
    "matcher": "Write",
    "hooks": [{
      "type": "command",
      "command": "./scripts/check-design-system.sh $FILE"
    }]
  },
  "PostToolUse": {
    "matcher": "Bash(git commit:*)",
    "hooks": [{
      "type": "command",
      "command": "./scripts/update-session-state.sh"
    }]
  }
}
```

---

## 7. Metriken für Erfolg

| Metrik | Aktuell | Ziel |
|--------|---------|------|
| Dokumentierte Services | 11/13 | 13/13 |
| Dokumentierte API-Endpoints | 53% | 90% |
| Dokumentierte Migrations | 52% | 100% |
| Subagent-Erfolgsrate | Unbekannt | >90% |
| Durchschnittliche Kontextladezeit | N/A | <2s |

---

## 8. Implementierungs-Reihenfolge

### Sofort (Heute)
1. ✅ Codebase analysieren
2. ⏳ CLAUDE.md aktualisieren (13 Services, neue Routes)
3. ⏳ docs/INDEX.md aktualisieren (Telegram-Bot hinzufügen)

### Diese Woche
4. docs/ALERTS_SYSTEM.md erstellen
5. docs/CLAUDE_TERMINAL.md erstellen
6. docs/API_REFERENCE.md erweitern (85+ Endpoints)

### Nächste Woche
7. Service-spezifische Kontexte erstellen
8. Kontext-Generator-Script implementieren
9. Hook-System erweitern

---

## 9. Referenz: Vollständige Service-Liste

| # | Service | Port | Typ | Entry Point |
|---|---------|------|-----|-------------|
| 1 | dashboard-frontend | 3000 | React SPA | src/App.js |
| 2 | dashboard-backend | 3001 | Node.js/Express | src/index.js |
| 3 | postgres-db | 5432 | PostgreSQL 16 | init/*.sql |
| 4 | llm-service | 11434 | Ollama | api_server.py |
| 5 | embedding-service | 11435 | Flask | embedding_server.py |
| 6 | document-indexer | 8080 | Flask | indexer.py |
| 7 | qdrant | 6333 | Vector DB | - |
| 8 | minio | 9000 | S3 Storage | - |
| 9 | metrics-collector | 9100 | aiohttp | collector.py |
| 10 | self-healing-agent | 9200 | Python | healing_engine.py |
| 11 | telegram-bot | 8090 | python-telegram-bot | bot.py |
| 12 | n8n | 5678 | Workflow Engine | - |
| 13 | reverse-proxy | 80/443 | Traefik | routes.yml |

---

## 10. Nächste Schritte

1. **CLAUDE.md aktualisieren** - Implementierung der optimierten Version
2. **INDEX.md korrigieren** - Fehlende Services hinzufügen
3. **API-Dokumentation erweitern** - 85+ fehlende Endpoints
4. **Kontext-Templates erstellen** - .claude/context/ Verzeichnis
5. **Session-State aktualisieren** - Tracking der Änderungen
