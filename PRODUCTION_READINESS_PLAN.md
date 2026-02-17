# Production-Readiness Plan - Arasul Platform

> **Ziel:** Codebase bereit machen fuer Auslieferung auf einem NVIDIA Jetson AGX Orin an einen Kunden.
> **Szenario:** Single Jetson pro Kunde, offline-faehig, USB-Updates, ein Admin-Account, vorkonfiguriert + Setup-Wizard.
> **Erstellt:** 2026-02-17 | **Phasen:** 9 | **Geschaetzter Scope:** Hoch

---

## Uebersicht der Phasen

| Phase | Titel                                  | Bereich  | Abhaengigkeiten |
| ----- | -------------------------------------- | -------- | --------------- |
| 1     | Backend Security & Error Handling      | Backend  | Keine           |
| 2     | Frontend Production Hardening          | Frontend | Keine           |
| 3     | Application Security Audit             | Security | Phase 1         |
| 4     | Test-Infrastruktur & Critical Tests    | Tests    | Phase 1, 2      |
| 5     | Dokumentation synchronisieren          | Docs     | Phase 1, 2, 3   |
| 6     | Setup-Wizard & First-Run Experience    | Feature  | Phase 1, 2      |
| 7     | Offline-Update-System (USB)            | Feature  | Phase 1, 3      |
| 8     | OS-Level Hardening & Netzwerk-Security | Infra    | Phase 3         |
| 9     | Final QA & Deployment-Paket            | Release  | Alle            |

---

## Phase 1: Backend Security & Error Handling

**Scope:** Alle kritischen Backend-Bugs und Sicherheitsluecken fixen, die ein Deployment blockieren.

### 1.1 asyncHandler-Migration abschliessen

- [ ] `routes/auth.js` Line 263 (`GET /password-requirements`) - asyncHandler hinzufuegen
- [ ] `routes/auth.js` Line 274 (`GET /verify`) - asyncHandler + try-catch entfernen
- [ ] `routes/llm.js` Line 188 (`GET /jobs/:jobId/stream`) - asyncHandler (SSE-Route, Sonderbehandlung)
- [ ] `routes/telegramBots.js` Line 45 (`POST /webhook/:botId/:secret`) - asyncHandler (Telegram erwartet 200)
- [ ] `routes/telegramBots.js` Line 119 (`GET /models/claude`) - asyncHandler hinzufuegen
- [ ] `routes/settings.js` Line 281 (`GET /password-requirements`) - asyncHandler hinzufuegen
- [ ] `routes/docs.js` Lines 61, 64, 69 - Error-Handling fuer Swagger-Routen
- [ ] `routes/update.js` Lines 151-159 - Unhandled Promise Chain in `applyUpdate()` fixen

### 1.2 Shell-Injection-Risiken eliminieren

- [ ] `routes/system.js` Line 87 - `exec()` durch `execFile()` ersetzen fuer `dpkg`-Abfrage
- [ ] `routes/system.js` Line 121 - `exec('ping ...')` durch `execFile('ping', [...args])` ersetzen
- [ ] `routes/system.js` Lines 155, 158 - `exec('cat /etc/...')` durch `fs.readFile()` ersetzen
- [ ] Alle `child_process.exec()` Aufrufe im Backend auf `execFile()` oder `fs`-Operationen migrieren

### 1.3 Credential-Handling & Defaults fixen

- [ ] `routes/documents.js` Lines 103-104 - Default-MinIO-Credentials entfernen (Pflichtfeld ohne Fallback)
- [ ] Alle `process.env.X || 'default'`-Patterns pruefen - sensible Werte duerfen keine Defaults haben
- [ ] Startup-Validierung: Backend soll beim Start pruefen ob alle Pflicht-Env-Vars gesetzt sind
- [ ] Warnung/Abort wenn kritische Credentials fehlen (POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_PASSWORD)

### 1.4 Datenbank-Integritaet

- [ ] Neue Migration `037_fix_foreign_keys.sql` erstellen:
  - `update_events`: ON DELETE CASCADE fuer FK-Referenzen (Lines 25, 55, 56, 71, 81 in 004_update_schema.sql)
  - `documents.category_id`: ON DELETE SET NULL (009_documents_schema.sql Line 86)
  - `api_keys.created_by`: ON DELETE SET NULL (023_api_keys_schema.sql Line 10)
  - `telegram_*` Tabellen: ON DELETE CASCADE fuer user_id-Referenzen (024_telegram_app_schema.sql)
- [ ] Migration-Nummerierung fixen: Beide `032_*`-Dateien umbenennen (Konflikt aufloesen)
- [ ] Deprecated Migration-Dateien entfernen: `015_*.deprecated`, `016_*.deprecated`
- [ ] Fehlende Indexes hinzufuegen:
  - Composite Index `(conversation_id, created_at)` auf `chat_messages`
  - Index `space_id` auf documents-Tabelle fuer RAG-Queries
  - Composite Index `(status, uploaded_at)` auf documents-Tabelle

### 1.5 Input-Validierung & Response-Konsistenz

- [ ] `parseInt()`-Aufrufe absichern: `isNaN()`-Check nach jedem `parseInt()` (z.B. documents.js Line 182)
- [ ] POST-Endpoints konsistent 201 statt 200 zurueckgeben bei Resource-Erstellung
- [ ] Response-Format dokumentieren und konsistent machen: `{ data: ..., message: '...', timestamp: '...' }`

### 1.6 Logging-Cleanup

- [ ] Alle `console.log`/`console.error` im Backend durch `logger.*` ersetzen
- [ ] Debug-Statements entfernen oder auf `logger.debug()` Level setzen
- [ ] Sicherstellen dass Telegram-Bot-Tokens NICHT in Logs erscheinen (Token-Masking)

---

## Phase 2: Frontend Production Hardening

**Scope:** Frontend-Code produktionssicher machen - Error Boundaries, Performance, Konsistenz.

### 2.1 Error Boundaries fuer alle Routes

- [x] `App.js`: Jede lazy-geladene Route-Komponente in `<RouteErrorBoundary>` wrappen
- [x] `Settings.js` Lines 85-121: Sub-Komponenten (UpdatePage, SelfHealingEvents, TelegramSettings, ClaudeTerminal, PasswordManagement) in Error Boundaries wrappen
- [ ] `DocumentManager.js`: SpaceModal in Error Boundary wrappen
- [ ] `Store.js`: StoreHome, StoreApps, StoreModels in Error Boundaries wrappen

### 2.2 API-Konsistenz herstellen

- [x] `ClaudeTerminal.js` Lines 48, 60, 74 - Hardcoded `/api/claude-terminal/*` durch `${API_BASE}/...` ersetzen
- [x] `TelegramBots/BotDetailsModal.js` Lines 58-64 - `getAuthHeaders()` aus `config/api.js` verwenden statt lokaler Definition
- [x] Alle Komponenten pruefen: `fetch()` vs. Projekt-Standard sicherstellen (fetch + API_BASE + getAuthHeaders)
- [ ] Sicherstellen dass JEDER fetch-Aufruf Error-Handling hat (try-catch + Toast bei Fehler)

### 2.3 Hardcoded Farben durch CSS-Variablen ersetzen

- [x] `DocumentManager.js` Lines 55-59, 79, 103, 114, 132, 144 - Alle `#6b7280`, `#6366f1` etc. durch `var(--...)` ersetzen
- [x] `Settings.js` Lines 692, 699, 706 - `rgba(245, 158, 11, 0.2)` durch CSS-Variablen ersetzen
- [x] Grep nach verbleibenden Hex-Farben in JSX inline styles und beheben

### 2.4 Performance-Optimierungen

- [ ] `DocumentManager.js`: Pagination hinzufuegen (50 Dokumente pro Seite)
- [ ] `DocumentManager.js`: StatusBadge, CategoryBadge, SpaceBadge mit `React.memo()` wrappen
- [ ] `DataTableEditor.js`: Virtualisierung fuer grosse Tabellen (react-window oder eigene Loesung)
- [ ] Lazy-Loading fuer schwere Modals: AppDetailModal, TelegramAppModal, SpaceModal, MarkdownEditor

### 2.5 Grosse Komponenten aufteilen (Top 3)

- [x] `DataTableEditor.js` (1640 LOC): AddFieldModal, ColumnMenu, CellContextMenu, CellEditor als eigene Dateien extrahieren (1640 -> 1155 LOC, -30%)
- [ ] `ExcelEditor.js` (1534 LOC): ColumnCreator, CellEditor, ColumnMenu als eigene Dateien extrahieren
- [x] `DocumentManager.js` (1462 LOC): SpaceBadge, StatusBadge, CategoryBadge extrahieren (1462 -> 1349 LOC, -8%)

### 2.6 Dead State & Memory Leaks

- [x] `ChatMulti.js` Line 40: `loadedModel` State ist AKTIV (RAM-Anzeige) - kein Dead State
- [x] `DataTableEditor.js` Lines 286-294, 477-492: Click-Outside-Handler verifiziert - korrekt mit Cleanup
- [x] Alle useEffect-Hooks auf fehlende Cleanup-Returns geprüft - alle OK
- [x] `ClaudeTerminal.js` Line 88: Clipboard-Zugriff gracefully mit try-catch gehandelt

### 2.7 Console-Statements entfernen

- [x] Alle `console.error()`, `console.warn()`, `console.log()` geprüft - nur in catch-Blöcken (Standard-Pattern) und mit DEBUG-Guards
- [x] MermaidDiagram.js, ClaudeTerminal.js, ErrorBoundary.js - alle in catch-Blöcken, kein Handlungsbedarf

---

## Phase 3: Application Security Audit

**Scope:** Systematisches Security-Review der gesamten Applikationsschicht.

### 3.1 Traefik-Konfiguration absichern

- [ ] `config/traefik/dynamic/middlewares.yml` Lines 218, 231 - PLACEHOLDER-Credentials durch generierte Hashes ersetzen (bei Deployment: `scripts/generate_htpasswd.sh`)
- [x] Pre-Deployment-Check in `scripts/validate_config.sh` hinzufuegen der PLACEHOLDER-Werte erkennt
- [ ] HTTP -> HTTPS Redirect erzwingen (Bewusst deaktiviert fuer LAN-HTTP-Zugriff auf Jetson, redirect-https Middleware definiert)
- [x] Rate-Limiting fuer `/api/auth/verify` (Forward-Auth) validiert - 30 req/min konfiguriert
- [x] CSP-Header, Referrer-Policy und Permissions-Policy in security-headers Middleware konfiguriert

### 3.2 Secrets-Management

- [x] `.env`-Datei: Permissions-Check beim Start (validate_config.sh prueft auf 0600)
- [x] `scripts/validate_config.sh`: Passwort-Staerke-Anforderung von 4 auf mindestens 12 Zeichen erhoeht + `arasul123` in Blocklist
- [x] JWT_SECRET: Mindestlaenge 32 Zeichen erzwungen (validate_config.sh + jwt.js process.exit(1))
- [x] Alle Default-Credentials aus Code entfernt: `tokenCrypto.js` (default-secret + statischer Salt), `telegramOrchestratorService.js` (verwendet jetzt tokenCrypto), `telegram.js` (leerer String), `telegramBots.js` (webhook secret Fallback)
- [x] Git-Hook (.husky/pre-commit) verhindert .env, .pem, admin.hash, config/secrets/ Commits
- [x] `password.js`: Minimum 12 Zeichen + Uppercase + Lowercase + Number Anforderungen

### 3.3 Swagger/API-Docs absichern

- [x] `routes/docs.js` - requireAuth Middleware fuer alle Swagger-UI-Routen in Production
- [x] Swagger nur im Development-Modus ohne Auth zugaenglich, in Production hinter Admin-Auth
- [x] API-Schema (openapi.json/yaml) hinter gleicher Auth geschuetzt

### 3.4 Docker-Socket-Sicherheit

- [ ] Docker Socket Proxy evaluieren (z.B. `tecnativa/docker-socket-proxy`) - Phase 8 (OS-Hardening)
- [ ] Nur notwendige Docker-API-Calls erlauben (container list, logs, restart - KEIN exec, build, push) - benoetigt Socket Proxy
- [x] Self-Healing-Agent: `cap_drop: ALL` + spezifische `cap_add` + `security_opt: no-new-privileges`
- [x] Dashboard-Backend: `security_opt: no-new-privileges` hinzugefuegt

### 3.5 XSS-Praevention im Frontend

- [x] `MermaidDiagram.js`: DOMPurify korrekt konfiguriert mit SVG-Profil + `securityLevel: 'strict'` (verifiziert)
- [x] ChatMessage: react-markdown ohne rehype-raw - HTML wird automatisch gestripped (verifiziert, sicher)
- [x] `dangerouslySetInnerHTML`: Nur 1 Vorkommen (MermaidDiagram.js), korrekt mit DOMPurify sanitized (verifiziert)
- [x] CSP-Header in Traefik konfiguriert (Content-Security-Policy, Referrer-Policy, Permissions-Policy)
- [x] URL-Sanitization (`sanitizeUrl()`) fuer API-gesourcte href-Attribute: AppDetailModal, ModelStore, StoreModels, BotSetupWizard

### 3.6 Token-Sicherheit

- [ ] Refresh-Token-Strategie implementieren (kurze JWT-Lifetime + Refresh) - komplexes Feature, separate Phase
- [x] Token-Blacklist fuer Logout (Backend-seitig) - bereits implementiert via `token_blacklist` + `active_sessions` DB-Tabellen
- [x] X-User-Id/X-User-Name/X-User-Email Headers in Traefik Forward-Auth: Risiko akzeptabel innerhalb Docker-Netzwerk-Isolation
- [x] Bearer-Token-Parsing case-insensitive gemacht (auth.js Middleware Konsistenz)
- [x] Default-Secret-Fallbacks in Token-Encryption entfernt (siehe 3.2)

### 3.7 Loki-Logging absichern

- [ ] `config/loki/local-config.yaml` Line 4: `auth_enabled: true` setzen (nicht noetig wenn Port nicht exponiert)
- [x] Loki Port 3100 extern entfernt - nur noch ueber Docker-Netzwerk erreichbar

---

## Phase 4: Test-Infrastruktur & Critical Tests

**Scope:** Failing Tests fixen + Tests fuer kritische Flows schreiben. Kein E2E, keine 80%-Coverage.

### 4.1 Backend: Failing Tests fixen

- [x] `pdfkit`-Dependency in `devDependencies` hinzufuegen ODER als Mock in jest.setup.js konfigurieren
- [x] Alle 18 failing Test-Suites durchlaufen lassen und Ergebnis validieren
- [x] Integration-Tests (`api.test.js`, `audit.test.js`) fixen

### 4.2 Backend: Fehlende Route-Tests schreiben

- [x] `events.test.js` - Events-Route testen (GET, POST, Error-Cases)
- [x] `metrics.test.js` - Metrics-Route testen
- [x] `models.test.js` - Models-Route testen
- [x] `settings.test.js` - Settings-Route testen (inkl. Service-Restart-Whitelist)
- [x] `store.test.js` - Store-Route testen
- [x] `system.test.js` - System-Route testen (besonders: keine Shell-Injection)

### 4.3 Frontend: Failing Tests fixen

- [x] `designSystem.test.js` - CSS-Variable-Checks reparieren
- [x] `codeQuality.test.js` - Unhandled-Promise-Warnings fixen
- [x] `ChatMulti.test.js` - Async-Timeout-Issues loesen
- [x] `ErrorBoundary.test.js` - `window.history.back` Mock fixen

### 4.4 Frontend: Kritische Komponenten testen

- [x] `ChatMessage.test.js` - Core-Chat-UI (Rendering, Markdown, Code-Blocks) - 61 Tests
- [x] `ChatTabsBar.test.js` - Tab-Wechsel, Erstellen, Schliessen - 64 Tests
- [ ] `TelegramBots.test.js` - Bot-Liste, Status-Anzeige
- [ ] `DatabaseTable.test.js` - Tabellen-Rendering, CRUD-Operationen

### 4.5 Python-Tests stabilisieren

- [x] `pdfkit`, `psutil`, `qdrant_client`, `sentence_transformers` als Test-Dependencies oder Mocks konfigurieren (conftest.py)
- [x] GPU-Recovery-Tests: Mock-Assertions und KeyError auf 'status' fixen (54 pass)
- [x] Self-Healing-Engine-Tests: 25 Failures gefixt (40 pass)
- [x] Document-Indexer-Tests: Parser-Mock-Pattern gefixt (55 pass)
- [x] LLM-Service-Tests: Exception-Klassen auf Mocks erhalten (31 pass)
- [x] Embedding-Service-Tests: numpy-Mock mit FakeNdarray ersetzt (29 pass)
- [ ] CI-Pipeline (`test.yml`): Python-Test-Job so konfigurieren dass Dependencies vorhanden sind

### 4.6 Coverage-Threshold anpassen

- [x] Backend: Coverage-Schwelle auf 30% gesetzt (realistisch bei aktuell 34% Coverage)
- [x] Frontend: Coverage-Schwelle eingerichtet (25% Statements/Lines, 20% Branches/Functions)

---

## Phase 5: Dokumentation synchronisieren

**Scope:** Alle Docs mit dem aktuellen Code-Stand abgleichen.

### 5.1 DATABASE_SCHEMA.md aktualisieren

- [ ] Migrationen 029-036 dokumentieren (model_capabilities, performance_metrics, datentabellen, telegram_multi_bot, telegram_voice, telegram_app_status, model_types, rag_performance)
- [ ] "Next migration: 029" auf "Next migration: 038" korrigieren (nach Phase 1 FK-Migration)
- [ ] arasul_data_db Schema dokumentieren

### 5.2 API_REFERENCE.md aktualisieren

- [ ] `/api/store/*`-Endpoints hinzufuegen
- [ ] `/api/telegram-app/*`-Endpoints verifizieren
- [ ] Datentabellen-Sub-Routen-Struktur dokumentieren
- [ ] Request/Response-Formate auf aktuelle Implementierung pruefen

### 5.3 ENVIRONMENT_VARIABLES.md aktualisieren

- [ ] 15+ fehlende Telegram-Bot-2.0-Variablen dokumentieren (LLM, Voice, Provider)
- [ ] OLLAMA_MODELS Auto-Detection dokumentieren
- [ ] RAM-Limits fuer alle Services tabellarisch auffuehren

### 5.4 CLAUDE_ARCHITECTURE.md aktualisieren

- [ ] Route-Count von 28 auf 31 korrigieren
- [ ] Promtail in Service-Tabelle hinzufuegen
- [ ] document-indexer-Details erweitern

### 5.5 README.md fuer Kunden-Deployment

- [ ] Kunden-README erstellen: Systemanforderungen, Quick-Start, Support-Kontakt
- [ ] Interne Entwickler-Docs von Kunden-Docs trennen
- [ ] Lizenz-/Copyright-Hinweise pruefen

---

## Phase 6: Setup-Wizard & First-Run Experience

**Scope:** Ersteinrichtungs-Erlebnis fuer den Kunden: Vorkonfiguration + interaktiver Wizard.

### 6.1 First-Run-Erkennung

- [ ] Backend: Endpoint `GET /api/system/setup-status` - prueft ob Ersteinrichtung abgeschlossen
- [ ] Frontend: Bei erstem Login auf Setup-Wizard umleiten statt Dashboard
- [ ] Status in DB speichern: `system_settings` Tabelle mit `setup_completed: boolean`

### 6.2 Setup-Wizard Frontend

- [ ] Neuer Wizard-Komponent mit Steps:
  1. **Willkommen** - Sprachauswahl (Deutsch default), Firmename/Logo-Upload
  2. **Admin-Passwort** - Initiales Passwort aendern (Pflicht)
  3. **Netzwerk** - Hostname, IP-Konfiguration pruefen/bestaetigen
  4. **KI-Modelle** - Verfuegbare Ollama-Modelle anzeigen, Standard-Modell waehlen
  5. **Zusammenfassung** - Alle Einstellungen anzeigen, bestaetigen
- [ ] Wizard-State persistent halten (bei Abbruch/Neustart fortsetzen)
- [ ] Skip-Option fuer erfahrene Admins

### 6.3 Vorkonfigurations-Script

- [ ] `scripts/preconfigure.sh` erstellen:
  - SSH-Keys generieren
  - Admin-Hash generieren
  - .env mit sicheren Zufallswerten befuellen
  - SSL-Zertifikate generieren
  - Docker-Images vorziehen
  - Ollama-Modelle vorladen
- [ ] Idempotent machen (mehrfach ausfuehrbar)

### 6.4 Health-Check Dashboard

- [ ] System-Status-Seite fuer Kunden: alle 15 Services auf einen Blick
- [ ] Farbcodiert: Gruen (OK), Gelb (Warnung), Rot (Fehler)
- [ ] Auto-Refresh alle 30 Sekunden

---

## Phase 7: Offline-Update-System (USB)

**Scope:** Sicheres, zuverlaessiges USB-Update-Paket fuer Kunden ohne Internet.

### 7.1 Update-Paket-Format definieren

- [ ] Paket-Struktur: `arasul-update-v{VERSION}.tar.gz`
  - `manifest.json`: Version, Checksums, Abhaengigkeiten, Kompatibilitaet
  - `images/`: Docker-Images als tar-Dateien
  - `migrations/`: SQL-Migrations seit letzter Version
  - `config/`: Konfigurationsaenderungen
  - `scripts/`: Pre-/Post-Update-Scripts
  - `signature`: GPG-Signatur des Pakets

### 7.2 Update-Build-Pipeline

- [ ] `scripts/build-update-package.sh` erstellen:
  - Docker-Images exportieren (`docker save`)
  - SQL-Diff seit letzter Version sammeln
  - Konfigurationsaenderungen sammeln
  - Paket zusammenpacken und signieren
  - Pruefsummen generieren (SHA256)

### 7.3 Update-Upload via UI

- [ ] Frontend: Update-Seite in Settings erweitern
  - USB-Stick erkennen oder manueller File-Upload
  - Signatur-Verifikation vor Installation
  - Fortschrittsanzeige mit Schritten
  - Rollback-Option bei Fehler
- [ ] Backend: `POST /api/update/upload` erweitern
  - Signatur-Verifikation
  - Kompatibilitaets-Check (Version, Hardware)
  - Backup vor Update (automatisch)
  - Schrittweise Installation mit Rollback

### 7.4 Update-Anwende-Logik

- [ ] Pre-Update: Automatisches Backup aller Daten
- [ ] Docker-Images laden: `docker load < image.tar`
- [ ] Migrations ausfuehren: Sequenziell mit Rollback-Support
- [ ] Konfiguration aktualisieren: Merge mit bestehender Config
- [ ] Services neustarten: `docker compose up -d`
- [ ] Post-Update-Verifikation: Health-Checks aller Services
- [ ] Rollback-Trigger: Wenn Health-Checks fehlschlagen, automatisch zurueckrollen

### 7.5 Versionsverwaltung

- [ ] `VERSION`-Datei im Root-Verzeichnis pflegen
- [ ] Changelog: `CHANGELOG.md` mit kundenlesbaren Aenderungen
- [ ] Migrations-Tracker: Welche Migrationen auf welchem System gelaufen sind

---

## Phase 8: OS-Level Hardening & Netzwerk-Security

**Scope:** Jetson-OS absichern fuer Kunden-Deployment (Full Security Audit).

### 8.1 SSH-Hardening

- [ ] SSH-Key-Only-Auth (Passwort-Login deaktivieren)
- [ ] SSH auf nicht-Standard-Port (z.B. 2222)
- [ ] `PermitRootLogin no`
- [ ] `MaxAuthTries 3`
- [ ] Fail2ban installieren und konfigurieren
- [ ] SSH-Banner mit Warnung

### 8.2 Firewall-Konfiguration

- [ ] UFW oder iptables konfigurieren:
  - Nur Ports 80 (HTTP), 443 (HTTPS), 2222 (SSH) offen
  - Alle anderen Ports nur intern (Docker-Netzwerk)
  - Rate-Limiting auf Netzwerk-Ebene
- [ ] Docker-Netzwerk-Isolation pruefen (kein direkter Zugriff auf interne Ports)

### 8.3 User-Isolation

- [ ] Dedizierter `arasul`-User fuer alle Services (kein root)
- [ ] Docker-Gruppe nur fuer Service-Account
- [ ] Keine interaktive Shell fuer Service-Account
- [ ] Home-Verzeichnis-Permissions: 0750

### 8.4 Auto-Updates deaktivieren

- [ ] `unattended-upgrades` deaktivieren (Kunden-System soll stabil bleiben)
- [ ] NVIDIA JetPack-Updates nur manuell ueber Update-Paket
- [ ] Kernel-Updates deaktivieren

### 8.5 AppArmor-Profile

- [ ] AppArmor fuer Docker-Container aktivieren
- [ ] Custom-Profile fuer Self-Healing-Agent (eingeschraenkte Capabilities)
- [ ] Custom-Profile fuer Backend (kein Dateisystem-Zugriff ausserhalb Volumes)

### 8.6 Filesystem-Hardening

- [ ] `/tmp` mit noexec mounten
- [ ] Docker-Volumes mit noexec wo moeglich
- [ ] Read-only Filesystem fuer Container wo moeglich
- [ ] Audit-Logging: `auditd` fuer kritische Pfade

### 8.7 Netzwerk-Segmentierung

- [ ] Docker-Netzwerke aufteilen:
  - `arasul-frontend`: Nur Traefik + Frontend
  - `arasul-backend`: Backend + DB + AI-Services
  - `arasul-monitoring`: Loki + Promtail + Metrics
- [ ] Inter-Netzwerk-Kommunikation nur ueber definierte Pfade

### 8.8 Security-Scanning

- [ ] Trivy-Scan aller Docker-Images (Vulnerability-Report)
- [ ] OWASP ZAP Basis-Scan gegen die Applikation
- [ ] Dependency-Audit: `npm audit` + `pip audit`
- [ ] Ergebnisse dokumentieren und kritische Findings fixen

---

## Phase 9: Final QA & Deployment-Paket

**Scope:** Alles zusammenfuehren, testen und ein auslieferbares Paket erstellen.

### 9.1 Integrations-Test auf echtem Jetson

- [ ] Clean-Install auf frischem Jetson testen
- [ ] Preconfigure-Script ausfuehren
- [ ] Setup-Wizard durchlaufen
- [ ] Alle Kernfunktionen manuell testen:
  - Login/Logout
  - Chat mit LLM (Ollama)
  - Dokument-Upload + RAG-Query
  - Telegram-Bot erstellen + Nachricht senden
  - Datentabellen erstellen + bearbeiten
  - Settings aendern
  - Backup/Restore
  - USB-Update einspielen

### 9.2 Performance-Baseline

- [ ] Startup-Zeit messen (Cold Boot bis UI erreichbar)
- [ ] Chat-Response-Latenz messen (verschiedene Modelle)
- [ ] Dokument-Indexierung-Geschwindigkeit messen
- [ ] Memory-Footprint aller Services dokumentieren
- [ ] Baseline-Werte als Referenz in Docs festhalten

### 9.3 Deployment-Checkliste erstellen

- [ ] Pre-Shipping-Checkliste:
  - [ ] Alle Tests gruen
  - [ ] Trivy-Scan ohne Critical/High
  - [ ] .env mit sicheren Credentials
  - [ ] Admin-Passwort geaendert (nicht Default)
  - [ ] SSH-Keys konfiguriert
  - [ ] Firewall aktiv
  - [ ] Backup-Cron aktiv
  - [ ] Alle Services healthy
  - [ ] Setup-Wizard funktioniert
  - [ ] USB-Update getestet

### 9.4 Kunden-Dokumentation

- [ ] Quick-Start-Guide (1 Seite): Einschalten, IP finden, Browser oeffnen
- [ ] Admin-Handbuch: Alle Features erklaert (Screenshots)
- [ ] Troubleshooting-Guide: Haeufige Probleme + Loesungen
- [ ] Support-Kontakt-Informationen

### 9.5 Deployment-Image erstellen

- [ ] Reproducible Build: Alle Docker-Images mit festen Tags
- [ ] `scripts/create-deployment-image.sh`:
  - Docker-Images pullen/builden
  - Ollama-Modelle vorladen
  - Datenbank initialisieren
  - System-Test ausfuehren
  - Image fuer Jetson-Cloning erstellen (optional)
- [ ] Oder: Golden Image mit Jetson SDK Manager clonen

### 9.6 Post-Deployment-Monitoring

- [ ] Heartbeat-Endpoint fuer Remote-Monitoring (optional, wenn Kunde erlaubt)
- [ ] Log-Export fuer Support-Faelle (anonymisiert)
- [ ] Fernwartungs-Prozess dokumentieren (SSH-Tunnel oder VPN)

---

## Abhaengigkeiten-Diagramm

```
Phase 1 (Backend) ──┬──> Phase 3 (Security) ──> Phase 8 (OS Hardening) ──┐
                    ├──> Phase 4 (Tests)                                  │
                    ├──> Phase 5 (Docs)                                   ├──> Phase 9 (Final QA)
Phase 2 (Frontend) ─┤                                                     │
                    ├──> Phase 6 (Setup Wizard)                           │
                    └──> Phase 7 (USB Update) ────────────────────────────┘
```

**Parallele Arbeit moeglich:**

- Phase 1 + Phase 2 gleichzeitig (Backend + Frontend unabhaengig)
- Phase 5 kann nach Phase 1+2 beginnen
- Phase 6 + Phase 7 koennen parallel laufen (nach Phase 1+2)
- Phase 3 + Phase 8 sequenziell (OS-Hardening baut auf App-Security auf)
- Phase 9 ganz am Ende (benoetigt alle anderen Phasen)

---

## Hinweise fuer die Arbeit in Claude Code

Jede Phase ist als **eigener Claude-Code-Chat** konzipiert. Starte jeden Chat mit:

```
Arbeite Phase X des PRODUCTION_READINESS_PLAN.md ab.
```

Claude Code hat Zugriff auf diesen Plan und kann die Checkboxen abarbeiten. Nach jeder Phase:

1. Tests laufen lassen (`./scripts/run-tests.sh`)
2. Aenderungen committen mit `feat:` oder `fix:` Prefix
3. Abgehakte Items in diesem Plan markieren
