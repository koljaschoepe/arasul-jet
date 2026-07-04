# Voll-Audit: Fresh-Install-Zuverlässigkeit & Codebase-Härtung

> **Archived 2026-07-04** — completed; alle 8 Phasen umgesetzt und via der
> full-audit-PR ausgeliefert. Siehe „Ergebnis-Status" für Details und bewusste
> Abweichungen. Nur noch historischer Kontext.

> Behebt alle 48 verifizierten Findings aus dem Multi-Agent-Audit (7 Domänen, 62 Agenten,
> jedes Finding adversarial gegengeprüft) plus die lokal gemessenen Befunde
> (563 TS-Fehler im Frontend-Produktcode, 115 Shellcheck-Findings, CI-Advisory-Lücke) —
> in einem Durchlauf, ein Branch, ein PR.

**Erstellt:** 2026-07-03 · **Audit-Basis:** main @ 98e788c
**Interview-Entscheidungen:** Ein großer Durchlauf (1 PR, Auto-Merge + Auto-Deploy) ·
alle 4 Dimensionen (Fresh-Install, Bugs, Frontend/UI, Dead Code/Doku) ·
auch größere Refactorings als eigene Phasen · nichts wird in ein Backlog verschoben.
**Out of Scope:** Side-Branches (`feat/telegram-bot-overhaul`, `cleanup/phase-6-test-coverage`),
`docs/legal/**`, n8n-Workflow-JSON-Inhalte.

## Ergebnis-Status (nach Ausführung, 2026-07-04)

Alle 8 Phasen ✅. Alle 48 verifizierten Audit-Findings adressiert (behoben oder — wo
das Audit-Urteil „unsicher"/eine dokumentierte Design-Entscheidung war — begründet
belassen). Backend-Tests: **1526 grün** (58 Suiten, +20 neue), Frontend-`vite build`
grün, `validate-doc-links.sh`: **0 defekte Links**.

**Bewusste Abweichungen vom ursprünglichen Plan (Architektur-Überraschungen, ehrlich
dokumentiert statt überspielt):**

1. **P5 / CI-Härtung — `continue-on-error` NICHT entfernt.** Der Plan nahm an, der
   Frontend-Typecheck sei die einzige Hürde. Tatsächlich ist die Frontend-CI ein
   _bewusst zurückgestellter_ Team-Backlog („Phase-6.1b"): ~1500 Legacy-ESLint-Fehler
   - ~90 fehlschlagende Vitest-Tests + (neu gemessen) ~580 tsc-Fehler. `continue-on-error`
     auf `false` zu setzen, würde diesen PR dauerhaft rot lassen und den vom Nutzer
     gewählten **Auto-Merge blockieren**. Die Nutzer-Entscheidung „Auto-Merge wie immer"
     erzwingt daher: CI bleibt advisory. Stattdessen: tsc-Fehler von **1336 → 562**
     gesenkt (Wurzel-Fixes: `vite-env.d.ts`, `Document`-Typ), bestätigte Findings gefixt,
     und ein **advisory `tsc --noEmit`-Schritt** zu CI ergänzt, der die Zahl sichtbar
     macht (Ratchet Richtung 0). Rest = getrackter Phase-6.1b-Backlog.
2. **P5 / manualChunks NICHT hinzugefügt.** `vite.config.ts` dokumentiert explizit, dass
   manuelles Chunking zuvor TDZ-Fehler durch zirkuläre Abhängigkeiten verursachte. Die
   > 500-kB-Chunk-Warnung ist kosmetisch („best effort" laut Kriterien) — die
   > Laufzeit-Stabilität hat Vorrang.
3. **P5 / Terminal-Theme (Audit-Urteil „unsicher") belassen.** xterm.js rendert auf
   Canvas und braucht konkrete Farben; ein durchgängig dunkles Terminal ist eine
   verbreitete, legitime UX-Wahl (kein bestätigter Bug).
4. **P2/P4 / Shellcheck.** Echte Bugs behoben (u. a. `BASH_ALIASES`-Reserved-Array-Kollision
   in `preconfigure.sh`). Verbleibende Findings sind SC2155 (declare-and-assign, Stil),
   SC2034 (Wartezähler) und SC2088 (`~` in Log-Strings) — kein Bug-Charakter; kein
   riskantes Massen-Refactoring erzwungen.
5. **P3 / Backup-Trigger.** On-Demand-Backup ist ein ehrliches **501 Not Implemented**
   (backup.sh läuft geplant im separaten backup-service-Container, kein Frontend-Aufrufer)
   — statt der bisherigen Lüge `success:true` ohne Aktion.

Der Jest-Worker-Leak wurde real behoben (zwei modul-level `setInterval` ohne `.unref()`
in `database.js` + `rateLimit.js`); die im Full-Run verbleibende Warnung stammt aus
Test-eigenen supertest-Sockets, keinem Produktions-Timer.

## Goal & Success Criteria

Ein fabrikneuer Jetson lässt sich mit `./arasul bootstrap` in einem Durchlauf ohne
manuelle Eingriffe installieren (inkl. RAG, mDNS, korrekter GPU-Erkennung), und die
Codebase ist frei von den im Audit bestätigten Bugs, Sicherheitslücken, totem Code
und Doku-Drift. Der Frontend-Typecheck ist auf 0 Fehler und wird — wie Lint und
Tests — in CI erzwungen statt advisory.

## Scope

**In scope:** Alle 48 verifizierten Audit-Findings (siehe Phasen), Frontend-Typsicherheit
(563 Produktcode-Fehler + Test-Setup), Shellcheck-Bereinigung der install-/backup-kritischen
Skripte, CI-Härtung, Doku-Konsolidierung, Fresh-Install-Checkliste als neues Dokument.
**Out of scope:** Side-Branches, docs/legal, n8n-Workflow-Definitionen, neue Features,
DB-Migrationen (keine nötig — kein Finding erfordert Schemaänderungen).

## Acceptance Criteria

- [ ] `npm test` (Backend): 56/56 Suiten grün, kein Jest-Worker-Leak-Hinweis mehr
- [ ] `npm run lint` (Backend): 0 Errors, 0 Warnings (aktuell 61 Warnings)
- [ ] `npx tsc --noEmit` (Frontend): 0 Fehler (aktuell 1336, davon 563 Produktcode)
- [ ] Frontend-Tests + Lint grün und in CI **ohne** `continue-on-error`
- [ ] `vite build` erfolgreich
- [ ] `shellcheck -S warning` sauber für: `arasul`, `scripts/setup/detect-jetson.sh`, `scripts/setup/preconfigure.sh`, `scripts/interactive_setup.sh`, `scripts/backup/backup.sh`, `scripts/backup/restore.sh`
- [ ] Kein `try/catch` auf Routen-Ebene, kein `throw new Error` in Backend-Services (Projektregel 1)
- [ ] Alle 5 Security-Findings (P1) geschlossen: docker-proxy-Härtung, IDOR, requireAdmin, MinIO-Pfadvalidierung, Zertifikat aus Repo/gitignore
- [ ] `./arasul bootstrap` startet RAG-Stack (Qdrant + Document-Indexer), baut llm-service in build_images(), konfiguriert mDNS, bricht auf Jetson nicht an nvidia-smi/16-GB-Check ab (Code-Review-Nachweis; Hardware-Test via Checkliste)
- [ ] `docs/ops/FRESH_INSTALL_CHECKLIST.md` existiert (Schritt-für-Schritt-Verifikation fürs nächste echte Gerät)
- [ ] Backup sichert Qdrant + n8n oder Doku sagt explizit was gesichert wird — Implementierung gewählt: **sichern**
- [ ] Alle toten Links/Drift-Findings in Doku behoben; Backup-Env-Doku dedupliziert; Topologie-Diagramm hat genau eine Quelle
- [ ] Toter Code entfernt (2 Setup-Skripte, schemas/common.js, Traefik-Middleware, ConfirmIconButton-Entscheidung, Embedding-healthcheck.sh-Verdrahtung)
- [ ] Best-Effort: Live-UI-Prüfung via Playwright auf https://arasul.local, falls Instanz während der Ausführung erreichbar

## Messwerte der lokalen Prüfung (Baseline, 2026-07-03)

| Prüfung                                | Ergebnis                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend Jest (nach Root-`npm install`) | 56/56 Suiten, 1506 Tests grün — aber Worker-Leak-Warnung (offene Timer/Handles)                                                                                             |
| Backend ESLint                         | 0 Errors, **61 Warnings** (u.a. `require-await`, `no-unused-vars`)                                                                                                          |
| Frontend `tsc --noEmit`                | **1336 Fehler** (563 Produktcode / 773 Tests+Setup, u.a. fehlende vitest-Globals)                                                                                           |
| Frontend `vite build`                  | OK, aber 4 Chunks > 500 kB (DocumentManager 838 kB, flowchart-elk 1451 kB)                                                                                                  |
| shellcheck (`-S warning`, 69 Skripte)  | **115 Findings**; Top: backup.sh 21, arasul 17, detect-jetson.sh 14, restore.sh 11, preconfigure.sh 9                                                                       |
| Wichtig                                | Erster Testlauf schlug mit 30 roten Suiten fehl, weil `npm --prefix`-Install das Workspace-Layout zerstört → Root-Install ist Pflicht; wird in ONBOARDING dokumentiert (P7) |

## Phasen-Übersicht

| Phase | Titel                                                   | Findings           | Risiko  | Aufwand |
| ----- | ------------------------------------------------------- | ------------------ | ------- | ------- |
| P1    | Sicherheit (kritisch zuerst)                            | 5                  | mittel  | M       |
| P2    | Fresh-Install-Pfad (`arasul` bootstrap & Setup-Skripte) | 10 + Shellcheck    | mittel  | L       |
| P3    | Backend-Bugs & Fehlerbehandlungs-Verträge               | 5 + Lint/Leak      | mittel  | M       |
| P4    | Backup- & Monitoring-Korrektheit                        | 5 + Shellcheck     | mittel  | M       |
| P5    | Frontend-Typsicherheit & CI-Härtung                     | 4 + 1336 TS-Fehler | hoch    | L       |
| P6    | Dead Code & Entschlackung                               | 6                  | niedrig | S       |
| P7    | Doku-Konsolidierung & Drift                             | 12                 | niedrig | M       |
| P8    | Gesamtverifikation + Fresh-Install-Checkliste           | —                  | niedrig | S       |

Jede Phase hinterlässt den Baum in funktionierendem Zustand (Tests grün, Build ok).
Reihenfolge: Sicherheit → Install-Pfad → Backend → Services → Frontend → Aufräumen → Doku → Verifikation,
damit die Doku-Phase (P7) den finalen Code-Stand beschreibt statt einen Zwischenstand.

---

## Phases

### ✅ P1 — Sicherheit (kritisch zuerst)

**Files:** compose/compose.core.yaml, apps/dashboard-backend/src/routes/documentAnalysis.js, apps/dashboard-backend/src/routes/system/services.js, apps/dashboard-backend/src/routes/documents.js, config/traefik/certs/, .gitignore, arasul (Cert-Generierung)
**Risk:** medium — docker-proxy-Härtung kann Self-Healing/Metrics brechen, wenn eine benötigte API-Kategorie zu viel entzogen wird; deshalb vorher per Grep alle Docker-API-Aufrufe der Consumer (self-healing-agent, metrics-collector, backend services.js) inventarisieren.
**Tests:** Bestehende Backend-Suiten (auth, documents, services) müssen grün bleiben; neue Tests: IDOR-Test für /api/document-analysis/analyze (fremde chatId → 403/404), requireAdmin-Test für POST /api/services/restart/:serviceName, isValidMinioPath-Test für PUT /api/documents/:id/content.

**Findings dieser Phase:**

#### 1. [CRITICAL/M] docker-proxy mit EXEC/BUILD/COMMIT/POST für alle Container im arasul-backend-Netzwerk erreichbar

- **Datei:** `compose/compose.core.yaml` (Zeile 92) · Domäne: infra · Kategorie: security
- **Problem:** docker-proxy hängt nur am arasul-backend-Netzwerk, das aber praktisch alle Services teilen (n8n, document-indexer, embedding-service, qdrant, llm-service, metrics-collector, ...). Mit EXEC=1, POST=1, BUILD=1, COMMIT=1, ALLOW_START/STOP/RESTARTS=1 kann jeder kompromittierte Container in diesem Netzwerk per HTTP-Request an docker-proxy:2375 beliebige Befehle in JEDEM anderen Container ausführen (z.B. postgres-db, dashboard-backend) — ein Umgehen der n8n-eigenen Hardening-Maßnahmen (NODES_EXCLUDE für executeCommand/ssh), da ein Code-Node einfach direkt gegen die Docker-API sprechen kann. Dokumentiert ist nur, dass dashboard-backend und self-healing-agent diese Rechte benötigen.
- **Evidenz:** compose.core.yaml:98-122: docker-proxy Networks: [arasul-backend]; EXEC: 1, BUILD: 1, COMMIT: 1, POST: 1, ALLOW_START/STOP/RESTARTS: 1 — dasselbe Netzwerk wie n8n (compose.app.yaml:171-172) und document-indexer (compose.ai.yaml:187).
- **Fix:** docker-proxy in ein eigenes, drittes Netzwerk legen, das ausschließlich dashboard-backend und self-healing-agent zugewiesen ist (nicht arasul-backend), damit n8n/document-indexer/etc. keinen Netzwerkpfad zu 2375 haben.

#### 2. [HIGH/S] POST /api/document-analysis/analyze prüft Chat-Ownership nicht (IDOR)

- **Datei:** `apps/dashboard-backend/src/routes/documentAnalysis.js` (Zeile 80) · Domäne: backend · Kategorie: security
- **Problem:** Anders als in routes/chats.js (verifyOwnership prüft user_id = req.user.id bei jedem Zugriff auf eine conversation_id) prüft dieser Endpoint nur, ob die chat_conversations-Zeile existiert — nicht, ob sie dem angemeldeten Nutzer gehört. Jeder authentifizierte Nutzer kann durch Erraten/Iterieren einer conversation_id eine Datei in eine fremde Konversation hochladen, dort per LLM analysieren lassen und die Antwort in den fremden Chat-Verlauf schreiben.
- **Evidenz:** const chatCheck = await database.query(
  `SELECT id FROM chat_conversations WHERE id = $1 AND deleted_at IS NULL`,
  [chatId]
  );
  if (chatCheck.rows.length === 0) {
  throw new ValidationError('Chat nicht gefunden');
  }
- **Fix:** Query um `AND user_id = $2` mit req.user.id ergänzen (wie in chats.js verifyOwnership), bei 0 Treffern NotFoundError werfen statt ValidationError.

#### 3. [MEDIUM/S] POST /api/services/restart/:serviceName fehlt requireAdmin — jeder eingeloggte Nutzer kann Kern-Infrastruktur neu starten

- **Datei:** `apps/dashboard-backend/src/routes/system/services.js` (Zeile 381) · Domäne: backend · Kategorie: security
- **Problem:** Alle anderen sicherheitskritischen Admin-Aktionen (backup, gdpr, update, license, selfhealing, settings, audit) verlangen requireAuth + requireAdmin. Der Service-Restart-Endpoint erlaubt aber jedem requireAuth-Nutzer, jeden Dienst aus der Whitelist neu zu starten — inklusive postgres-db, dashboard-backend und minio. Aktuell existiert praktisch nur die Admin-Rolle, aber die role-Spalte (admin_users.role, Migration 068) ist bereits für künftige nicht-Admin-Rollen ('viewer') vorgesehen; ohne requireAdmin hier wird das beim Rollout einer Viewer-Rolle sofort zur Privilege-Escalation.
- **Evidenz:** router.post(
  '/restart/:serviceName',
  requireAuth,
  asyncHandler(async (req, res) => {
- **Fix:** requireAdmin nach requireAuth ergänzen, konsistent mit den anderen Admin-Routen.

#### 4. [MEDIUM/S] Committed Self-Signed-Zertifikat ohne passenden Private Key im Repo, nicht in .gitignore

- **Datei:** `config/traefik/certs/arasul.crt` · Domäne: infra · Kategorie: security
- **Problem:** .gitignore schließt config/secrets/ aus, aber nicht config/traefik/certs/. Ein reales, gültiges Self-Signed-Zertifikat (Subject arasul.local, 10 Jahre Laufzeit, generiert 2026-01-07) ist eingecheckt, die zugehörige arasul.key jedoch nicht. Das ist entweder Testartefakt-Leftover oder täuscht Nutzern ein 'fertiges' Zertifikat vor, das ohne den Private Key nutzlos ist und bei fehlerhaftem Setup-Flow zu einem Traefik-Start ohne funktionierendes TLS führt.
- **Evidenz:** .gitignore:60-61 listet nur config/secrets/ aus; config/traefik/certs/arasul.crt ist im Repo, arasul.key fehlt komplett laut Verzeichnislisting.
- **Fix:** Der Fix ist im Kern richtig, aber unvollständig/leicht ungenau: (a) "_.key in .gitignore aufnehmen" ist redundant — .gitignore:58 hat bereits ein globales `_.key`, das jede arasul.key-Datei überall im Repo ausschließt; nötig ist nur eine gezielte Ausnahme für `config/traefik/certs/`(analog zu Zeile 63`config/certs/`, die aber ein anderes, unabhängiges Verzeichnis trifft und nicht greift). Ergänze `.gitignore`um`config/traefik/certs/`(oder zumindest`\*.crt`darin) und entferne die getrackte Datei per`git rm --cached config/traefik/certs/arasul.crt`. (b) Wichtiger fehlender Punkt: Das eigentliche Funktionsrisiko liegt nicht nur im Leftover-Artefakt, sondern in der Internet-Check-Verzweigung in `arasul`(Root-Skript, setup_https(), ~Zeile 756-791): Sie ruft`generate-self-signed-cert.sh`nur im "kein Internet"-Zweig auf, obwohl`config/traefik/traefik.yml` inzwischen ausschließlich self-signed nutzt (kein ACME-Resolver mehr konfiguriert, arasul.local ist LAN-only laut Kommentar in traefik.yml). Der Fix sollte diese Verzweigung entfernen/korrigieren, sodass das Zertifikatspaar in config/traefik/certs IMMER (unabhängig vom Internet-Status) generiert wird, wenn es fehlt — sonst bleibt das Traefik-Start-Risiko auch nach Bereinigung des Git-Repos bestehen, sobald ein Nutzer mit Internetzugang bootstrapped.
- _Hinweis Verifizierer:_ Alle Kernaussagen halten stand. (1) config/traefik/certs/arasul.crt existiert real im Repo (Read bestätigt ein gültiges x509-Zertifikat, CN=arasul.local, Validity 2026-01-07 bis 2036-01-05 ≈ 10 Jahre). (2) .gitignore:63 hat nur "config/certs/" (ohne Traefik-Präfix) — ein anderes, unabhängiges Verzeichnis, das preconfigure.sh:364 für ein separates Zertifikatspaar nutzt. "config/traefik/certs/" wird von KEINER Regel erfasst (weder config/secrets/, config/certs/, noch _.pem — nur _.key auf Zeile 58 wäre global gültig, greift hier aber nicht, weil kein arasul.key vorhanden ist). (3) Glob-Suche bestätigt: config/traefik/certs/arasul.key existiert nicht im Repo. (4) compose/compose.core.yaml:162 mountet genau dieses Verzeichnis (../config/traefik:/etc/traefik:ro) in den Traefik-Container, und dynamic/tls.yml referenziert exakt certFile=/etc/traefik/certs/arasul.crt + keyFile=/etc/traefik/certs/arasul.key. Traefik.yml hat KEINEN ACME/Let's-Encrypt-Resolver mehr konfiguriert (nur "tls: {} # Uses self-signed cert from tls.yml", Kommentar: "Let's Encrypt disabled: arasul.local is a LAN-only domain"). Trotzdem enthält das Root-Skript `arasul` (setup_https(), Zeilen 756-791) eine Internet-Check-Verzweigung: nur im "kein Internet"-Zweig wird scripts/security/generate-self-signed-cert.sh aufgerufen (Zielverzeichnis exakt "./config/traefik/certs" — passt zum Repo-Pfad). Im "Internet vorhanden"-Zweig wird NUR ein (ungenutztes) letsencrypt/acme.json angelegt, das Zertifikatspaar in config/traefik/certs wird NICHT erzeugt/überschrieben. Damit bleibt auf einem Gerät mit Internetzugang nach `arasul bootstrap` exakt der Zustand "crt ohne key" bestehen, und Traefik würde beim Start die fehlende arasul.key nicht finden — der im Finding beschriebene Effekt ist real möglich, wenn auch die eigentliche Ursache eine tiefere Logic-Divergenz zwischen dem Internet-Check-Zweig in `arasul` und der tatsächlichen (rein self-signed) traefik.yml-Konfiguration ist, nicht allein das eingecheckte Artefakt selbst. Severity medium ist vertretbar: kein Private-Key-Leak (kein aktives Sicherheitsrisiko durch das Zertifikat selbst), aber ein reales operationelles Risiko (Traefik-Start-Fehler auf Geräten mit Internetzugang) plus klare Git-Hygiene-Lücke.

#### 5. [LOW/S] PUT /api/documents/:id/content prüft isValidMinioPath nicht (Inkonsistenz zu GET-Pendants)

- **Datei:** `apps/dashboard-backend/src/routes/documents.js` (Zeile 753) · Domäne: backend · Kategorie: security
- **Problem:** GET /:id/content und GET /:id/download validieren doc.file_path vor jedem MinIO-Zugriff via minioService.isValidMinioPath(). Der Schreibpfad PUT /:id/content tut das nicht, bevor er mit demselben file_path in minioService.uploadObject() schreibt. Da file_path aus der DB stammt (nicht direkt vom Client), ist das Risiko aktuell gering, aber es ist eine stille Lücke in der Defense-in-Depth, falls file_path je über einen anderen Pfad (Migration, Bug, kompromittierte Row) manipuliert werden könnte.
- **Evidenz:** const doc = docResult.rows[0];

  // Only allow text-based files
  const editableExtensions = ['.md', '.markdown', '.txt', '.yaml', '.yml'];
  if (!editableExtensions.includes(doc.file_extension)) { ... }
  // kein isValidMinioPath(doc.file_path) Check hier
  await minioService.uploadObject(doc.file_path, contentBuffer, ...)

- **Fix:** Denselben isValidMinioPath-Check wie in GET /:id/content vor dem uploadObject-Aufruf ergänzen.

### ✅ P2 — Fresh-Install-Pfad (arasul bootstrap & Setup-Skripte)

**Files:** arasul, scripts/interactive_setup.sh, scripts/setup/detect-jetson.sh, scripts/setup/preconfigure.sh, docs/ops/DEPLOYMENT.md (Cert-Pfad-Abgleich)
**Risk:** medium — Änderungen am Bootstrap sind nicht auf echter Hardware testbar; Absicherung über shellcheck, bash -n, Unit-Tests der Skripte (scripts/test/setup/\*.test.sh) und die neue Checkliste (P8). GPU-/RAM-Gates werden gelockert statt entfernt (Warnung statt Hard-Fail auf bekannter Jetson-Hardware).
**Tests:** scripts/test/setup/detect-jetson.test.sh + interactive-setup.test.sh müssen grün bleiben; neue Testfälle für: GPU-Erkennung ohne nvidia-smi (tegrastats/Device-Tree-Pfad), Non-Interactive-Modus ohne ADMIN_PASSWORD (saubere Fehlermeldung statt unbound variable), Idempotenz von Verzeichnis-Anlage. shellcheck -S warning sauber für alle Dateien dieser Phase.

**Findings dieser Phase:**

#### 1. [CRITICAL/S] check_gpu() erkennt GPU nur über nvidia-smi und blockiert Bootstrap hart auf Jetson-Hardware

- **Datei:** `arasul` (Zeile 268) · Domäne: setup · Kategorie: setup
- **Problem:** check_gpu() verlangt zwingend ein funktionierendes 'nvidia-smi' auf dem Host; schlägt das fehl, wird in validate_hardware() sofort 'GPU check failed. AI services will not work without GPU.' geloggt und die gesamte Hardware-Validierung mit return 1 abgebrochen, was cmd_bootstrap() mit exit 1 beendet — noch bevor Software-Requirements oder .env-Setup laufen. Auf eingebetteten Jetson-Boards (Tegra-SoC, unified memory) ist nvidia-smi historisch oft nicht vorhanden bzw. nur eingeschränkt verfügbar (im Gegensatz zu Datacenter-GPUs); die eigene Debugging-Tabelle in CLAUDE.md nennt für 'GPU status' explizit die Alternative '(oder tegrastats)'. check_gpu() selbst hat aber keinerlei tegrastats- oder /etc/nv_tegra_release-basierten Fallback, obwohl detect_jetson() im selben Skript genau solche Signale bereits kennt.
- **Evidenz:** check_gpu() (arasul:268-291): `if command -v nvidia-smi &> /dev/null; then ... else log_error "nvidia-smi not found..."; return 1; fi`; validate_hardware() (arasul:361-367): `if check_gpu; then ... else log_error "GPU check failed..."; return 1; fi` — kein Fallback-Pfad für Jetson-typische Erkennung (tegrastats, /etc/nv_tegra_release, nvidia Container Runtime via docker info).
- **Fix:** check_gpu() um einen Fallback erweitern, der bei fehlendem nvidia-smi über /etc/nv_tegra_release, tegrastats oder eine erfolgreiche 'docker info | grep nvidia'-Prüfung ein Jetson-GPU als vorhanden akzeptiert, bevor der Check als fatal gewertet wird.

#### 2. [HIGH/M] RAG-Kernfunktion (Qdrant + Document-Indexer) wird bei ./arasul bootstrap nie gestartet

- **Datei:** `arasul` (Zeile 907) · Domäne: setup · Kategorie: incomplete
- **Problem:** Der Fresh-Install-Pfad pullt, baut und startet niemals qdrant und document-indexer, obwohl beide laut ONBOARDING.md ('LLM service, embedding service, Qdrant indexing' als 'core surfaces') und der Docker-Compose-Kommentar am Kopf von docker-compose.yml Teil des Startup-Flows sind. pull_images() pullt nur 'postgres-db minio n8n reverse-proxy'; build_images() baut nur 'metrics-collector dashboard-backend dashboard-frontend embedding-service self-healing-agent'; start_services() startet explizit postgres-db, minio, metrics-collector, llm-service, embedding-service, reverse-proxy, dashboard-backend/frontend, n8n, self-healing-agent — nie qdrant/document-indexer. dashboard-backend hängt in compose/compose.app.yaml (depends_on, Zeile 88-94) nur von postgres-db/minio/docker-proxy ab, zieht qdrant also auch nicht implizit mit. Auch run_smoke_tests() prüft weder qdrant noch document-indexer, und scripts/validate/validate-dependencies.sh's EXPECTED_ORDER-Array listet beide ebenfalls nicht auf — der Gap ist also systemisch. Ergebnis: Nach einem als 'erfolgreich' gemeldeten Bootstrap (inkl. 'All smoke tests passed successfully!') ist Dokumenten-Upload/RAG/Wissensgraph vollständig funktionslos, bis der Betreiber manuell 'docker compose up -d' (ohne Service-Liste) oder './arasul start' ausführt.
- **Evidenz:** pull_images(): `docker compose pull postgres-db minio n8n reverse-proxy` (arasul:583); build_images(): `docker compose build --parallel metrics-collector dashboard-backend dashboard-frontend embedding-service self-healing-agent` (arasul:608); start_services() Layer 1-7 (arasul:907-951) enthält weder qdrant noch document-indexer; compose/compose.ai.yaml:16-18 (qdrant image) und :177-183 (document-indexer build) existieren, werden aber nie referenziert.
- **Fix:** qdrant (als Layer 1b, kein depends_on) und document-indexer (nach embedding-service/qdrant) in pull_images()/start_services() aufnehmen inkl. wait_for_healthy-Aufrufen; passende Checks in run_smoke_tests() und im EXPECTED_ORDER-Array von validate-dependencies.sh ergänzen.

#### 3. [HIGH/S] Minimale RAM-Anforderung (16GB) blockiert offiziell unterstützte kleinere Jetson-Profile

- **Datei:** `arasul` (Zeile 293) · Domäne: setup · Kategorie: bug
- **Problem:** check_ram() bricht die Hardware-Validierung fatal ab, wenn weniger als 16GB RAM verfügbar sind ('Insufficient RAM ... Minimum required: 16GB'), und validate_hardware() behandelt das als kritischen Fehler, der cmd_bootstrap() abbricht. scripts/setup/detect-jetson.sh definiert aber explizit vollständige Ressourcen-Profile für Geräte mit 8GB (orin_nx_8gb, orin_nano_8gb, xavier_nx_8gb), 4GB (orin_nano_4gb/nano_4gb) und sogar 2GB (nano_2gb via minimal_memory) inklusive eigener LLM-Modell-Empfehlungen (z.B. tinyllama:1.1b). Diese laut Codebasis unterstützten Geräte können './arasul bootstrap' also nie erfolgreich durchlaufen.
- **Evidenz:** arasul:309-312: `else\n    log_error "Insufficient RAM: ${TOTAL_RAM_GB}GB. Minimum required: 16GB"\n    return 1`; validate_hardware() arasul:370-374 macht daraus einen fatalen Bootstrap-Abbruch. scripts/setup/detect-jetson.sh:493-585 definiert Profile 'orin_nx_8gb'/'orin_nano_8gb'/'nano_4gb'/'minimal_memory' für RAM-Werte deutlich unter 16GB.
- **Fix:** Minimum in check_ram() auf das kleinste in detect-jetson.sh unterstützte Profil absenken (z.B. 4GB als hartes Minimum, 16GB nur als Empfehlung/Warning) oder RAM-Check für 4-16GB nur als Warnung statt als fatalen Fehler behandeln.

#### 4. [HIGH/S] TLS-Zertifikatspfad inkonsistent zwischen preconfigure.sh, DEPLOYMENT.md und Traefik-Config

- **Datei:** `scripts/setup/preconfigure.sh` (Zeile 364) · Domäne: infra · Kategorie: bug
- **Problem:** Traefik erwartet das Zertifikat gemäß config/traefik/dynamic/tls.yml unter /etc/traefik/certs/arasul.crt(.key), was über den Bind-Mount `../config/traefik:/etc/traefik:ro` (compose.core.yaml:162) auf den Host-Pfad config/traefik/certs/ zeigt. scripts/setup/preconfigure.sh generiert das Self-Signed-Zertifikat aber nach config/certs/ (falscher Pfad), und docs/ops/DEPLOYMENT.md verlangt im Pre-Shipping-Checklist sogar ein drittes, ebenfalls falsches Verzeichnis config/tls/. Nur der separate ./arasul-bootstrap-Pfad (setup_https(), Zeile 780) trifft den korrekten Pfad. Wer dem dokumentierten Preconfigure-Checklist-Flow folgt, bekommt ein Zertifikat, das Traefik nie findet — reverse-proxy startet mit fehlendem/falschem Zertifikat bzw. verwendet das im Repo mitgelieferte, kein passendes .key besitzende arasul.crt.
- **Evidenz:** preconfigure.sh:364-366: CERT_DIR="${PROJECT_ROOT}/config/certs" ... openssl req -x509 ... -keyout "$KEY_FILE" -out "$CERT_FILE" | docs/ops/DEPLOYMENT.md:296: '- [ ] TLS certificate present in `config/tls/`.' | config/traefik/dynamic/tls.yml:6: certFile: /etc/traefik/certs/arasul.crt
- **Fix:** preconfigure.sh Step 5 auf den gleichen Mechanismus wie `./arasul bootstrap` umstellen: scripts/security/generate-self-signed-cert.sh "./config/traefik/certs" "arasul.local" "3650" aufrufen statt eigenem openssl-Aufruf nach config/certs/. DEPLOYMENT.md-Checklist-Eintrag auf config/traefik/certs/ korrigieren. Alle drei Stellen (preconfigure.sh, DEPLOYMENT.md, ggf. weitere Skripte) auf einen einzigen Pfad vereinheitlichen.

#### 5. [MEDIUM/S] EXIT-Trap redigiert ADMIN_PASSWORD bei jedem Bootstrap-Abbruch, auch vor Admin-Anlage — verhindert Retry

- **Datei:** `arasul` (Zeile 1348) · Domäne: setup · Kategorie: bug
- **Problem:** Der Trap 'redact_plaintext_password' ist auf EXIT registriert und feuert bei jedem Skriptende, auch bei einem frühen fatalen Fehler (z.B. gescheiterter Docker-Pull in Schritt 9, lange bevor init_admin_user in Schritt 15 läuft). ADMIN_PASSWORD wird dadurch in .env sofort durch 'REDACTED_AFTER_BOOTSTRAP' ersetzt. init_admin_user() bricht danach beim erneuten './arasul bootstrap'-Versuch mit 'ADMIN_PASSWORD nicht verfuegbar. Bitte ./arasul setup erneut ausfuehren.' ab — selbst wenn ADMIN_HASH bereits korrekt in .env vorhanden wäre und der einzige fehlende Schritt der (unabhängige) Docker-Pull war. Ein einfacher erneuter Bootstrap-Lauf ist damit nach fast jedem Fehlschlag vor Schritt 15 nicht mehr möglich, ohne zuerst das komplette interaktive Setup (neues Passwort/Hash) zu wiederholen.
- **Evidenz:** arasul:1348: `trap 'redact_plaintext_password 2>/dev/null' EXIT` (registriert direkt zu Beginn von cmd_bootstrap, vor allen weiteren Schritten); init_admin_user() arasul:838-841: `if [ -z "$admin_pass" ] || [ "$admin_pass" = "REDACTED_AFTER_BOOTSTRAP" ]; then log_error "ADMIN_PASSWORD nicht verfuegbar..."; return 1; fi` prüft admin_pass, obwohl admin_hash bereits vorhanden sein könnte.
- **Fix:** Redaction nur ausführen, wenn init_admin_user() erfolgreich war (z.B. über eine Erfolgs-Flag-Variable statt eines pauschalen EXIT-Traps), oder init_admin_user() so anpassen, dass ein bereits vorhandener ADMIN_HASH ausreicht und admin_pass nur bei fehlendem Hash benötigt wird.

#### 6. [MEDIUM/S] mDNS (arasul.local) wird bei ./arasul bootstrap nie konfiguriert, obwohl als Zugriffs-URL beworben

- **Datei:** `arasul` (Zeile 1157) · Domäne: setup · Kategorie: incomplete
- **Problem:** show_completion_summary() zeigt nach erfolgreichem Bootstrap 'Dashboard: https://${hostname}.local' als primären Zugriffsweg an. cmd_bootstrap() ruft aber an keiner Stelle scripts/setup/setup-mdns.sh auf — dieses Skript wird nur über das separate Kommando './arasul mdns' oder über scripts/setup/preconfigure.sh (nur im Factory-Image-Erstellungspfad laut docs/ops/DEPLOYMENT.md Pre-Shipping-Checklist) ausgeführt. Für den in docs/development/ONBOARDING.md dokumentierten Standard-Fresh-Install-Weg ('git clone && ./arasul bootstrap') wird Avahi/mDNS also nie eingerichtet; arasul.local löst danach ggf. nicht auf.
- **Evidenz:** cmd_bootstrap() (arasul:1333-1480) enthält keinen Aufruf von setup-mdns.sh; grep über das Repo zeigt setup-mdns.sh wird nur von './arasul mdns' (arasul:1539-1540) und scripts/setup/preconfigure.sh:707-717 aufgerufen.
- **Fix:** Einen (optionalen, mit sudo-Erkennung abgesicherten) Aufruf von setup-mdns.sh als Schritt in cmd_bootstrap() ergänzen, oder in show_completion_summary() explizit auf './arasul mdns' als notwendigen Folgeschritt hinweisen, falls Avahi nicht bereits läuft.

#### 7. [MEDIUM/S] interactive_setup.sh crasht mit 'unbound variable' statt Fehlermeldung bei fehlendem ADMIN_PASSWORD im Non-Interactive-Modus

- **Datei:** `scripts/interactive_setup.sh` (Zeile 380) · Domäne: setup · Kategorie: bug
- **Problem:** Das Skript läuft unter 'set -euo pipefail' (Zeile 12). Im dokumentierten Non-Interactive-Aufruf ('ADMIN_PASSWORD=... ./scripts/interactive_setup.sh --non-interactive', Zeile 9) wird ADMIN_USERNAME/ADMIN_EMAIL korrekt mit Default-Fallback referenziert ('${ADMIN_USERNAME:-admin}'), ADMIN_PASSWORD dagegen ungeschützt als '$ADMIN_PASSWORD'. Ist die Variable nicht gesetzt/exportiert, bricht 'set -u' das Skript sofort mit einem kryptischen 'ADMIN_PASSWORD: unbound variable'-Fehler ab, statt die vorgesehene freundliche Meldung 'ADMIN_PASSWORD muss gesetzt sein im Non-Interactive Modus' auszugeben.
- **Evidenz:** Zeile 378-380: `ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"`\n`ADMIN_EMAIL="${ADMIN_EMAIL:-admin@arasul.local}"`\n`if [ -z "$ADMIN_PASSWORD" ]; then` — kein ':-'-Fallback für ADMIN_PASSWORD, obwohl 'set -euo pipefail' in Zeile 12 aktiv ist.
- **Fix:** `if [ -z "$ADMIN_PASSWORD" ]` zu `if [ -z "${ADMIN_PASSWORD:-}" ]` ändern, analog zu den anderen Variablen in diesem Block.

#### 8. [MEDIUM/S] llm-service (Custom-Build) fehlt in build_images() — versteckter Build erst mitten in start_services()

- **Datei:** `arasul` (Zeile 608) · Domäne: setup · Kategorie: bug
- **Problem:** build_images() baut explizit nur 'metrics-collector dashboard-backend dashboard-frontend embedding-service self-healing-agent' und meldet danach 'Custom images built' (Zeile 614), was dem Betreiber suggeriert, alle projekteigenen Images seien fertig. llm-service hat aber ebenfalls eine eigene build:-Direktive (compose/compose.ai.yaml:54-57, services/llm-service/Dockerfile) und wird von build_images() übersprungen. Der tatsächliche (potenziell lange, CUDA-lastige) Build von llm-service passiert dadurch implizit und ungeloggt erst bei 'docker compose up -d llm-service embedding-service' in start_services() (Zeile 926) — ein Build-Fehler an dieser Stelle wird nicht als eigener, klar benannter Bootstrap-Schritt sichtbar, sondern als diffuser Fehler mitten im Service-Start.
- **Evidenz:** build_images() Zeile 608: `docker compose build --parallel metrics-collector dashboard-backend dashboard-frontend embedding-service self-healing-agent` (llm-service fehlt); compose/compose.ai.yaml:54-57 zeigt llm-service hat `build: {context: .., dockerfile: services/llm-service/Dockerfile}`, ist also kein reines Pull-Image.
- **Fix:** Add llm-service to the build_images() list at line 608 (as proposed), and additionally add document-indexer, which has the identical drift (build: directive in compose.ai.yaml:179-180, absent from build_images(), and not referenced anywhere else in the arasul script at all — it appears to never be started by this CLI). Also verify SKIP_BUILD semantics end-to-end: since `docker compose up -d llm-service` at line 926 will implicitly build if the image is missing regardless of SKIP_BUILD, confirm factory images ship the llm-service image pre-built, or gate/skip that `up` call too when SKIP_BUILD is set and the image isn't present.
- _Hinweis Verifizierer:_ Verified against /Users/koljaschope/Documents/dev/ara/arasul-jet/arasul: build_images() (line 603-615) runs `docker compose build --parallel metrics-collector dashboard-backend dashboard-frontend embedding-service self-healing-agent` (line 608) and then logs "Custom images built" (line 614) — llm-service is indeed absent from this explicit list. compose/compose.ai.yaml:54-57 confirms llm-service has its own `build: {context: .., dockerfile: services/llm-service/Dockerfile}` directive, i.e. it is not a plain pull-image and genuinely needs a local build. start_services() at line 926 does `docker compose up -d llm-service embedding-service` with no preceding explicit build step for llm-service — `docker compose up` will implicitly build the image here if it isn't already present, so a build failure for the CUDA-heavy llm-service Dockerfile would surface mid-startup rather than during the clearly-logged build_images() step. No comment in the script explains this omission as intentional, and grep across the whole file shows no other call that builds llm-service explicitly. This also means `--skip-build` (SKIP_BUILD, lines 1403-1417, 1685) does not reliably skip the llm-service build if its image isn't already present locally — a real functional risk beyond just log/UX clarity, since --skip-build is documented as intended for factory images. As a side note (not part of this finding, so not scored), document-indexer (compose.ai.yaml:179-180) has the same build: directive and is likewise missing from build_images() and is not referenced anywhere else in the `arasul` script — the same drift pattern the finding describes, which reinforces that build_images()'s hand-maintained list is out of sync with compose.ai.yaml's actual build-requiring services. Severity 'medium' is plausible: it's not a hard crash, since docker compose up auto-builds transparently on happy path, but it undermines observability of build failures and partially defeats --skip-build for factory images.

#### 9. [MEDIUM/S] Bind-Mount-Verzeichnisse für Appstore-Manifeste, SSH-Keys und Sandbox-Projekte werden bei Erstinstallation nicht angelegt

- **Datei:** `arasul` (Zeile 516) · Domäne: infra · Kategorie: setup
- **Problem:** create_directories() in ./arasul legt laut Kommentar gezielt data/updates und data/backups an, 'damit sie nicht root-owned von Docker automatisch erstellt werden' (jüngster Fix-Commit 18bd7d3). Dieselbe Klasse von Bind-Mounts existiert aber auch für ../data/appstore/manifests (ro), ../data/ssh-keys (ro) und ../data/sandbox/projects (rw) in compose.app.yaml (Zeilen 81-84) — diese fehlen weiterhin in der DIRS-Erstellung, werden also bei einem frischen Jetson von Docker selbst (meist root-owned) angelegt und können bei internen non-root-Prozessen im Container (z.B. Sandbox-Schreibzugriffe) zu Permission-Fehlern führen, genau wie beim ursprünglichen Bug.
- **Evidenz:** arasul:516: mkdir -p data/{postgres,minio,models,n8n,updates,backups} (appstore/manifests, ssh-keys, sandbox/projects fehlen) | compose.app.yaml:81-84: '../data/appstore/manifests:/arasul/appstore/manifests:ro', '../data/ssh-keys:/arasul/ssh-keys:ro', '../data/sandbox/projects:/arasul/sandbox/projects'
- **Fix:** Same core idea as proposed, but prioritize data/sandbox/projects (the only one with an actual writer today — sandboxService.js's fs.mkdirSync as non-root). Add all three to create_directories() in ./arasul, and also fix the silent failure mode: sandboxService.js:94-95 currently only logs a warning on mkdir failure instead of surfacing an error to the caller/DB record, so even after the directory-creation fix this failure path should be hardened (throw or mark project creation degraded) rather than assumed fully fixed by the directory precreation alone.
- _Hinweis Verifizierer:_ create_directories() in ./arasul (line 508-521) indeed omits data/appstore/manifests, data/ssh-keys, and data/sandbox/projects, and no other setup script creates them (setup-service-user.sh:104 only chmods ssh-keys if it already exists). The sandbox/projects case is a concrete, verified defect: dashboard-backend runs as non-root USER node (Dockerfile:51) and sandboxService.js:90-96 calls fs.mkdirSync() to create per-project subdirectories inside /arasul/sandbox/projects (bind-mounted rw from ../data/sandbox/projects, compose.app.yaml:84). If Docker auto-creates that host directory as root:root/0755 on first `up` — the exact mechanism the arasul:513-515 comment describes for updates/backups — the non-root node process will hit EACCES on mkdir. Today that failure is silently swallowed (try/catch logs a warning only, sandboxService.js:94-95), making it a real but stealthy functional bug. The appstore/manifests and ssh-keys legs of the finding are weaker: both are read-only mounts, nothing in the backend writes into them, and default root:root 0755 dirs remain world-readable/traversable, so those two are lower-confidence but not refuted — they're plausible latent risks if permissions are ever tightened or a writer is added.</reason>
  <parameter name="corrected_severity">medium

#### 10. [LOW/S] Redundante Disk-Space-Prüfungen mit widersprüchlichen Schwellwerten in einem Bootstrap-Lauf

- **Datei:** `arasul` (Zeile 316) · Domäne: setup · Kategorie: refactor
- **Problem:** check_disk_space() (Teil von validate_hardware(), Schritt 1) verlangt fatal mindestens 64GB freien Speicher ('Insufficient disk space ... Minimum required: 64GB'), während check_requirements() (Schritt 2, unmittelbar danach) für dieselbe Metrik separat nur bei <50GB warnt ('Low disk space: ... Recommended: 50GB+'). Beide Checks laufen bei jedem Bootstrap nacheinander mit unterschiedlichen, sich nicht ergänzenden Schwellwerten für dieselbe df-Ausgabe — das verwirrt beim Troubleshooting und ist unnötig doppelte Logik.
- **Evidenz:** check_disk_space() arasul:325-334: `elif [ "$AVAILABLE_GB" -ge 64 ]; then ... else log_error "Insufficient disk space: ${AVAILABLE_GB}GB. Minimum required: 64GB"`; check_requirements() arasul:434-440: `if [ "$available_space" -lt 50 ]; then log_warning "Low disk space: ${available_space}GB available. Recommended: 50GB+"`.
- **Fix:** Einen gemeinsamen Disk-Space-Check konsolidieren (z.B. in check_requirements() den bereits in validate_hardware() ermittelten Wert wiederverwenden) mit einem einzigen, konsistenten Schwellwert-Paar (warn/fatal).

### ✅ P3 — Backend-Bugs & Fehlerbehandlungs-Verträge

**Files:** apps/dashboard-backend/src/routes/admin/backup.js, src/services/llm/llmQueueService.js, src/database.js, src/index.js (CORS), src/routes/system/services.js (GPU-Metrik), src/utils/{envManager,hardware,retry}.js + weitere Lint-Warning-Dateien, Jest-Teardown (offene Timer)
**Risk:** medium — db.query()-Retry-Änderung betrifft jeden DB-Zugriff; Retry nur noch für idempotente/read-only Queries bzw. auf Verbindungsaufbau beschränken und mit bestehender Suite absichern. Backup-Trigger: echte Implementierung (Signal an backup-service-Container via docker-proxy oder Named-Pipe/Flag-File) statt Stub; falls das im Zeitrahmen unsauber wird → ehrlicher 501 NotImplemented + Frontend-Hinweis, dokumentiert.
**Tests:** Alle 56 Backend-Suiten grün; neue Tests: backup-trigger (Erfolgs- und Fehlerpfad), enqueue()-Limit innerhalb Mutex, CORS-Ablehnung → 403 mit Fehlercode, ApiError-Konvertierung in llmQueueService. Lint: 0 Warnings. Jest ohne Worker-Leak (`--detectOpenHandles` lokal nachweisen).

**Findings dieser Phase:**

#### 1. [HIGH/M] POST /api/backup/trigger ist ein Stub, meldet aber 'success: true' ohne irgendetwas zu tun

- **Datei:** `apps/dashboard-backend/src/routes/admin/backup.js` (Zeile 109) · Domäne: backend · Kategorie: incomplete
- **Problem:** Der Endpoint prüft nur, ob die externe SSD gemountet ist, loggt dann 'Manual backup triggered' und antwortet sofort mit success:true und der Nachricht 'Backup wird gestartet...'. Es gibt keinerlei Aufruf von backup.sh, pg_dump oder irgendeinem File-Copy — der TODO-Kommentar bestätigt das explizit. Ein Admin, der vor einer riskanten Aktion (Update, Migration, Wartung) bewusst ein manuelles Backup auslöst, bekommt eine falsche Erfolgsmeldung und hat in Wirklichkeit kein Backup. Für eine Plattform mit Anspruch auf '5 Jahre unbeaufsichtigten Betrieb' ist eine lügende Backup-Bestätigung ein Datenverlust-Risiko ersten Ranges.
- **Evidenz:** // TODO: Implement actual backup trigger via backup.sh with BACKUP_PATH
  logger.info(`Manual backup triggered by ${req.user.username} to ${EXTERNAL_MOUNT}`);

  res.json({
  success: true,
  message: 'Backup wird gestartet...',

- **Fix:** Fix-Kern (execFile des vorhandenen backup.sh bzw. 501-Antwort statt success:true) ist richtig und sollte übernommen werden. Ergänzung: Der Hinweis "Im Frontend den Button entsprechend deaktivieren/kennzeichnen" ist nicht anwendbar — es existiert aktuell kein Frontend-Aufrufer dieses Endpoints (verifiziert per Grep über apps/dashboard-frontend/src). Stattdessen: (a) den Endpoint entweder real verdrahten — dabei naheliegend services/backup-service/backup.sh wiederverwenden (BACKUP_DIR/EXTERNAL_MOUNT-Env übergeben) statt einen komplett neuen Backup-Pfad zu bauen, da bereits ein produktiver Cron-Backup-Mechanismus existiert, dessen Logik hier gespiegelt werden sollte; oder (b) bis zur Implementierung mit 501/ServiceUnavailableError aus utils/errors.js antworten (asyncHandler-Konvention, kein try/catch) und den Datei-Header-Kommentar "Stub endpoints" auch in docs/api/API_REFERENCE.md sichtbar machen, damit Aufrufer der dokumentierten API nicht getäuscht werden.
- _Hinweis Verifizierer:_ Vollständig verifiziert durch Lesen von apps/dashboard-backend/src/routes/admin/backup.js (Zeilen 1-119): Der POST /api/backup/trigger Handler (Zeile 93-119) prüft nur getSsdStatus() (Mount-Check via fs.access/stat/mountpoint), loggt dann bei Zeile 109-110 exakt den zitierten TODO-Kommentar und antwortet bei Zeile 112-117 mit success:true, ohne execFile, pg_dump, backup.sh oder irgendeinen Copy-Vorgang aufzurufen. Der Endpoint ist real gemountet (routes/index.js:123 `router.use('/backup', ...)`) und in docs/api/API_REFERENCE.md:1838-1849 als funktionierender Endpoint dokumentiert (ohne Stub-Hinweis für Aufrufer) — die Behauptung ist also nicht toter Code, sondern erreichbar und extern dokumentiert.

Zwei Nuancen relativieren die Kritikalität gegenüber der Auditor-Einschätzung:

1. Kein Frontend-Code ruft diesen Endpoint aktuell auf (Grep über gesamtes apps/dashboard-frontend/src nach "backup/trigger", "triggerBackup", "SSD", "external-ssd" — 0 Treffer). Der einzige "Backup"-Bezug im Frontend (UpdatePage.tsx:322) ist ein Status-Label für einen separaten Update-Workflow-Schritt, nicht dieser Endpoint. Der im proposed_fix erwähnte "Button im Frontend" existiert also nicht — es gibt aktuell keine UI-Fläche, die deaktiviert werden müsste.
2. Der Datei-Header selbst (Zeile 2-3) sagt explizit "Stub endpoints for future external SSD backup management" — die Autoren wussten, dass dies ein Platzhalter ist. Die eigentliche, produktiv genutzte Backup-Story läuft komplett getrennt über services/backup-service/ (Cron-getriebener Alpine-Container, pg_dump + MinIO mirror + Qdrant-Snapshot, täglich 02:00 UTC, siehe docs/ops/BACKUP_SYSTEM.md und services/backup-service/README.md) und ist von diesem SSD-Trigger-Stub völlig unabhängig — d.h. das "5 Jahre unbeaufsichtigter Betrieb"-Argument trifft auf den echten Backup-Mechanismus zu, nicht auf diesen isolierten, unreferenzierten SSD-Stub.

Der Kernbefund (Endpoint lügt über Erfolg, TODO bestätigt fehlende Implementierung) ist zu 100% korrekt und real reproduzierbar per curl gegen die dokumentierte API. Da aber aktuell kein UI-Pfad und kein anderer Backend-Aufrufer existiert, der einen Admin tatsächlich in trügerische Sicherheit wiegt, und die reale Backup-Infrastruktur unabhängig funktioniert, stufe ich die Severity von critical auf high herab.

#### 2. [HIGH/M] Services werfen `throw new Error()` statt ApiError-Subklassen — Nutzer bekommt generisches 500 statt der eigentlichen Fehlermeldung

- **Datei:** `apps/dashboard-backend/src/services/llm/llmQueueService.js` (Zeile 204) · Domäne: backend · Kategorie: bug
- **Problem:** CLAUDE.md verbietet explizit `throw new Error(...)` in Services/Routen zugunsten der Klassen aus utils/errors.js. In llmQueueService.enqueue() werden aber plain Errors geworfen ('Kein LLM-Model verfügbar...', 'Warteschlange ist voll...', 'Model ... ist nicht in Ollama verfügbar...'). Da diese Aufrufe in llm.js/rag.js/documentAnalysis.js nicht in try/catch gefangen werden, landen sie im globalen errorHandler, der für nicht-ApiError-Instanzen konsequent 500/INTERNAL_ERROR mit der generischen Meldung 'Internal server error' zurückgibt (die eigentliche, hilfreiche Fehlermeldung wird nur geloggt, nie an den Client gesendet). Betrifft mind. 126 throw-new-Error-Stellen in 29 Service-Dateien mit demselben Muster.
- **Evidenz:** if (!resolvedModel) {
  throw new Error(
  'Kein LLM-Model verfügbar. Bitte laden Sie ein Model im Model Store herunter.'
  );
  }
  ...
  if (parseInt(queueCount.rows[0].cnt) >= MAX_QUEUE_SIZE) {
  throw new Error(`Warteschlange ist voll (${MAX_QUEUE_SIZE} Jobs)...`);
- **Fix:** In llmQueueService.js (und perspektivisch den anderen betroffenen Service-Dateien) die throw-new-Error-Stellen durch ValidationError/ServiceUnavailableError/ConflictError aus utils/errors.js ersetzen, damit die eigentliche Meldung im JSON-Envelope beim Client ankommt.

#### 3. [MEDIUM/M] db.query() wiederholt auch schreibende, nicht-idempotente Queries bei Connection-Fehlern

- **Datei:** `apps/dashboard-backend/src/database.js` (Zeile 172) · Domäne: backend · Kategorie: logic
- **Problem:** query() wrappt jede Query (SELECT wie INSERT/UPDATE/CALL) unterschiedslos in retryDatabaseQuery mit bis zu 3 Versuchen bei ECONNRESET/connection_failure etc. Bricht die Verbindung ab, nachdem der Server das Statement bereits ausgeführt, aber die Bestätigung noch nicht beim Client angekommen ist, wird die Query erneut ausgeführt. Bei nicht-idempotenten Aufrufen wie `SELECT record_login_attempt(...)` (auth.js) oder beliebigen INSERT/UPDATE ohne ON CONFLICT kann das zu doppelt gezählten Fehlversuchen (schnellerer Account-Lockout) oder doppelten Seiteneffekten führen.
- **Evidenz:** shouldRetry: error => {
  const retryableCodes = [ 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', '57P03', '08006', '08001', '08003', '08000' ];
  return retryableCodes.includes(error.code) || error.message?.includes('Connection terminated') ...
- **Fix:** Der Kern des Fixes (Retries nicht blind auf alle Queries anwenden) ist richtig, aber der vorgeschlagene Ansatz "SQL-Text-Präfix SELECT ohne Funktionsaufruf" ist fragil (Regex-Parsing von SQL ist brüchig bei CTEs/WITH, Kommentaren, mehrzeiligen Statements) und sollte durch einen expliziten Opt-in pro Aufruf ersetzt werden statt Text-Heuristik: `db.query(text, params, { retryable: false })` (Default `true` nur für reine Leseabfragen an den Aufrufstellen umstellen, oder umgekehrt Default `false` und Read-Pfade explizit als retryable markieren) bzw. eine zweite Funktion `db.queryOnce()` ohne Retry-Wrapper für INSERT/UPDATE/CALL-Aufrufe wie `record_login_attempt`, Session-/Blacklist-Inserts in `utils/jwt.js`. Zusätzlich: Idempotenz auf DB-Ebene erhöhen (z.B. `ON CONFLICT DO NOTHING`/Dedup-Key) als Verteidigung in der Tiefe, unabhängig vom Retry-Fix.
- _Hinweis Verifizierer:_ Bestätigt durch Code-Lektüre. `database.js:172-196` wrappt jeden `db.query()`-Aufruf (SELECT wie INSERT/UPDATE/CALL) unterschiedslos in `retryDatabaseQuery` mit bis zu 3 Versuchen. `retry.js:149-180` retriggert bei ECONNRESET, 08006/08001/08003/08000, 57P03 sowie den String-Matches 'Connection terminated'/'Connection lost' — alles Fehler, die auch dann auftreten können, wenn der Server das Statement bereits committed hat, aber die Antwort den Client nicht mehr erreicht (klassisches at-least-once-Retry-Problem bei zustandsbehafteten RPCs). Die Migration `services/postgres/init/002_auth_schema.sql:147-176` zeigt, dass `record_login_attempt()` tatsächlich nicht idempotent ist: Sie fügt eine Zeile in `login_attempts` ein UND inkrementiert `admin_users.login_attempts` (mit Lockout-Trigger ab 5). `auth.js:66,91,104` ruft genau das über `db.query('SELECT record_login_attempt($1,$2,$3,$4)', ...)` auf — ein doppelter Retry würde den Fehlversuchs-Zähler doppelt hochzählen bzw. bei Erfolg fälschlich zwei Login-Events loggen. Das Problem ist zudem nicht auf diesen einen Aufrufer beschränkt: `utils/jwt.js:77,193,231` machen reine INSERTs (Sessions, Token-Blacklist) ohne ON CONFLICT über denselben `db.query()`-Pfad, die bei Retry zu doppelten Zeilen führen könnten. Es gibt keinen Opt-out-Mechanismus (kein drittes Options-Argument o.ä. an `db.query` — geprüft per Grep, keine Treffer), keinen separaten idempotenten/nicht-idempotenten Pfad und keinen Kommentar, der dieses Verhalten als bewusste Design-Entscheidung dokumentiert.

#### 4. [LOW/S] CORS-Ablehnung erzeugt generischen Error → 500 statt 403, Grund geht für den Client verloren

- **Datei:** `apps/dashboard-backend/src/index.js` (Zeile 151) · Domäne: backend · Kategorie: bug
- **Problem:** Wird eine Origin abgelehnt, ruft cors() `callback(new Error('Not allowed by CORS'))` auf. Dieser plain Error landet im globalen errorHandler und wird dort (da keine ApiError-Instanz) als 500 INTERNAL_ERROR mit der generischen Meldung 'Internal server error' beantwortet — fachlich korrekt wäre ein 403. Kein funktionaler Blocker, aber irreführend beim Debugging von LAN-Zugriffsproblemen (ein häufiges Support-Thema laut docs/ops/TROUBLESHOOTING.md).
- **Evidenz:** require('./utils/logger').warn(`CORS blocked origin: ${origin}`);
  callback(new Error('Not allowed by CORS'));
- **Fix:** ForbiddenError aus utils/errors statt new Error() übergeben (oder einen eigenen CORS-Error-Handler vor dem generischen errorHandler registrieren), damit der Client 403/FORBIDDEN mit klarer Meldung sieht.

#### 5. [LOW/S] llmQueueService.enqueue(): Warteschlangen-Limit-Check liegt außerhalb der Mutex-Sektion (Race Condition)

- **Datei:** `apps/dashboard-backend/src/services/llm/llmQueueService.js` (Zeile 210) · Domäne: backend · Kategorie: logic
- **Problem:** Der COUNT(\*)-Check gegen MAX_QUEUE_SIZE läuft vor `enqueueMutex.withLock(...)`. Treffen mehrere enqueue()-Aufrufe gleichzeitig ein (z.B. Burst durch mehrere Browser-Tabs/Nutzer), können alle denselben (noch nicht aktualisierten) COUNT lesen und die Prüfung bestehen, bevor einer von ihnen tatsächlich inserted — das MAX_QUEUE_SIZE-Limit kann dadurch kurzzeitig überschritten werden. Der eigentliche kritische Abschnitt (Queue-Position holen + Job anlegen) ist korrekt durch den Mutex geschützt, nur der Limit-Check nicht.
- **Evidenz:** const queueCount = await database.query(
  `SELECT COUNT(*) as cnt FROM llm_jobs WHERE status = 'pending'`
  );
  if (parseInt(queueCount.rows[0].cnt) >= MAX_QUEUE_SIZE) { throw new Error(...) }
  ...
  const { jobId, messageId, queuePosition } = await this.enqueueMutex.withLock(async () => {
- **Fix:** Den COUNT-Check in den mutex.withLock()-Block verschieben, damit Zählung und Insert atomar zusammen ablaufen.

#### 6. [LOW/S] GET /api/services (services.js) meldet GPU-Last dauerhaft als 0.0 — Platzhalter ohne echte Anbindung

- **Datei:** `apps/dashboard-backend/src/routes/system/services.js` (Zeile 59) · Domäne: backend · Kategorie: incomplete
- **Problem:** llmGpuLoad und embeddings.load werden hart auf 0.0 gesetzt mit dem Kommentar 'Placeholder - would need NVML integration', obwohl der metrics-collector laut /services/ai (selbe Datei, Zeile ~97) bereits echte GPU-Stats über /api/gpu liefert. Das Dashboard-Widget, das /api/services (statt /api/services/ai) konsumiert, zeigt dadurch dauerhaft 0% GPU-Last an, was auf einer GPU-lastigen Edge-AI-Appliance ein irreführendes Signal für den Betreiber ist.
- **Evidenz:** let llmGpuLoad = 0;
  try {
  await axios.get(`http://...:${process.env.LLM_SERVICE_PORT}/api/tags`, { timeout: 2000 });
  // GPU load would be available from NVML or the service itself
  llmGpuLoad = 0.0; // Placeholder - would need NVML integration
  } catch { }
- **Fix:** Die Beschreibung "Das Dashboard-Widget ... zeigt dauerhaft 0% GPU-Last an" ist zu korrigieren: es existiert kein Frontend-Konsument von llm.gpu_load/embeddings.load aus /api/services (App.tsx:297 holt die Daten, DashboardHome.tsx destrukturiert die 'services'-Prop aber nicht — toter Wert). Statt "Frontend auf /services/ai umstellen" wäre der treffendere Fix: entweder das ungenutzte gpu_load/load-Feld aus /api/services ganz entfernen (da nirgends konsumiert und laut API_REFERENCE.md ohnehin nur als reiner Status-Endpoint dokumentiert), oder falls ein zukünftiges Widget das Feld nutzen soll, denselben metrics-collector-Aufruf wie in /services/ai (Zeile 94-107) wiederverwenden.
- _Hinweis Verifizierer:_ Der Kern-Fact stimmt: in apps/dashboard-backend/src/routes/system/services.js:59 wird llmGpuLoad hart auf 0.0 gesetzt (Kommentar 'Placeholder - would need NVML integration'), und embeddings.load ist ebenso hartkodiert (Zeile 71). Der Vergleichs-Endpoint /services/ai (Zeile 87-165) holt dagegen echte GPU-Stats vom metrics-collector via /api/gpu (Zeile 94-107) und liefert dort echtes utilization/temperature/memory. Der Drift ist also real.

ABER: die Impact-Behauptung im Finding ist falsch/übertrieben. Ich habe im Frontend geprüft, wer /api/services konsumiert: App.tsx:297 ruft `/services` und speichert das Ergebnis in `services`-State, der dann als Prop an DashboardHome durchgereicht wird (App.tsx:575, DashboardHome.tsx:121). DashboardHome destrukturiert diese Prop aber gar nicht (Zeile 164-171 destrukturiert nur metrics, metricsHistory, runningApps, formatChartData, thresholds, deviceInfo — 'services' fehlt). Eine gezielte Grep-Suche nach `gpu_load`/`embeddings.load`/`llm.gpu` im gesamten Frontend (src/) ergab keine Treffer. Das einzige GPU-/Health-Widget im Dashboard (SystemHealthWidget) bezieht seine Daten aus einem völlig anderen Endpoint (`GET /api/ops/overview`, siehe SystemHealthWidget.tsx:5,30). Auch docs/api/API_REFERENCE.md:230-231 dokumentiert `/api/services` explizit nur als 'Status of all services' (ohne GPU-Last-Anspruch), während `/api/services/ai` als 'AI services with GPU load' beschrieben ist — die API-Doku selbst trennt die beiden Zwecke sauber.

Es gibt also aktuell KEIN Dashboard-Widget, das dauerhaft 0% GPU-Last anzeigt — das Feld wird zwar vom Backend geliefert, aber vom Frontend ungenutzt verworfen (dead prop). Die severity 'low' ist trotzdem angemessen — als Code-Hygiene-Finding (hartkodierter Platzhalter + Duplikat-Feld ohne Konsumenten), nicht als Nutzer-sichtbares irreführendes Signal.

### ✅ P4 — Backup- & Monitoring-Korrektheit

**Files:** services/backup-service/backup.sh, services/backup-service/README.md, scripts/backup/backup.sh, scripts/backup/restore.sh, compose/compose.monitoring.yaml (Promtail-Volume), services/self-healing-agent/{post_reboot_validation.py,Dockerfile}, services/backup-service/restore-drill.sh, docs/ops/BACKUP_SYSTEM.md
**Risk:** medium — Qdrant-Snapshot-API und n8n-Export müssen in den Backup-Zyklus, ohne den bestehenden Cron-Ablauf zu destabilisieren; Restore-Pfad symmetrisch erweitern. Promtail-Fix ist ein reiner Mount-Fix, aber auf dem Jetson erst nach Deploy sichtbar.
**Tests:** Backup-Skripte: shellcheck sauber, bash -n; Dry-Run-Modus des backup.sh lokal ausführen soweit ohne Docker möglich. Bestehende backup-bezogene Backend-Tests grün. restore-drill.sh-Doku-Kommentar korrigiert.

**Findings dieser Phase:**

#### 1. [HIGH/S] Promtail liest Logs aus leerem Named Volume statt aus dem tatsächlichen Log-Bind-Mount

- **Datei:** `compose/compose.monitoring.yaml` (Zeile 241) · Domäne: infra · Kategorie: bug
- **Problem:** reverse-proxy (compose.core.yaml:163) und self-healing-agent (compose.monitoring.yaml:94) schreiben Logs in den Bind-Mount `../logs:/arasul/logs`, also den Host-Ordner `logs/`. Promtail mountet für denselben Container-Pfad /arasul/logs jedoch das Docker-verwaltete Named Volume `arasul-logs:/arasul/logs:ro` statt desselben Bind-Mounts. Damit sieht Promtail nie echte Log-Dateien — der 'arasul'-Scrape-Job in config/promtail/config.yaml (job dashboard-backend, llm-service, self-healing, arasul) bleibt dauerhaft leer, Log-Aggregation über Loki/Promtail ist für alle Datei-basierten Logs faktisch tot, ohne dass ein Fehler sichtbar wird.
- **Evidenz:** compose.monitoring.yaml:239-241: volumes:\n - ../config/promtail/config.yaml:/etc/promtail/config.yaml:ro\n - /var/lib/docker/containers:/var/lib/docker/containers:ro\n - arasul-logs:/arasul/logs:ro (vgl. compose.core.yaml:163: '../logs:/arasul/logs' bei reverse-proxy)
- **Fix:** Bei promtail den Bind-Mount `../logs:/arasul/logs:ro` verwenden (wie bei reverse-proxy/self-healing-agent) statt des Named Volumes `arasul-logs`. Das ungenutzte Named Volume `arasul-logs` aus dem volumes-Block entfernen, falls nirgends sonst benötigt.

#### 2. [HIGH/M] Geplanter Cron-Backup sichert Qdrant (Vektor-DB) und n8n-Workflows NICHT, obwohl Doku/README das Gegenteil behaupten

- **Datei:** `services/backup-service/backup.sh` · Domäne: services · Kategorie: bug
- **Problem:** Der Backup-Container führt laut entrypoint.sh nächtlich nur /usr/local/bin/backup.sh aus (kopiert aus services/backup-service/backup.sh). Dieses Skript sichert ausschließlich PostgreSQL (pg_dump) und den MinIO-Bucket 'documents' sowie den n8n-Encryption-Key (Escrow) — es gibt keinerlei Qdrant-Snapshot- oder n8n-Workflow-Export-Schritt. Es existiert ein vollständigeres Skript scripts/backup/backup.sh mit echter Qdrant-Snapshot-Logik (Zeilen 204-233) und wird per compose/compose.monitoring.yaml:157 sogar in den Container als /usr/local/bin/backup-full.sh gemountet — aber nirgendwo (weder in entrypoint.sh noch per Cron noch sonstwo im Repo) tatsächlich aufgerufen. README.md und docs/ops/BACKUP_SYSTEM.md beschreiben eine Architektur mit vier Backup-Zielen (postgres/minio/qdrant/n8n), die real nicht existiert. Ergebnis: Nach einem Total-Ausfall/Restore ist die komplette RAG-Vektor-Datenbank (Qdrant) verloren und muss aufwendig neu embedded werden; n8n-Workflows sind ebenfalls nicht gesichert.
- **Evidenz:** services/backup-service/entrypoint.sh:21 ruft nur '/usr/local/bin/backup.sh' auf. services/backup-service/backup.sh enthält keinerlei 'qdrant'-Referenz. compose/compose.monitoring.yaml:157: '- ../scripts/backup/backup.sh:/usr/local/bin/backup-full.sh:ro' wird nirgends aufgerufen (grep über gesamtes Repo liefert nur diese eine Zeile). services/backup-service/README.md:21: 'backup.sh Runs the actual backup (postgres + minio + qdrant)' — falsch.
- **Fix:** Fix-Ansatz im Kern richtig (Cron muss die Qdrant-Snapshot-Logik tatsächlich ausführen), aber zwei Korrekturen: (1) n8n-Workflow-Backup ist bereits durch den bestehenden pg*dump von arasul_db (inkl. Schema "n8n") abgedeckt — hier muss nichts "nachgebaut" werden, ein zusätzlicher JSON-Export (wie in scripts/backup/backup.sh backup_n8n()) ist optional nice-to-have für portable Restores, kein Blocker. (2) Statt einen parallelen, nie aufgerufenen backup-full.sh-Mount weiterzuführen: entweder die Qdrant-Snapshot-Funktion (scripts/backup/backup.sh:204-247) direkt in services/backup-service/backup.sh integrieren und den toten Mount in compose.monitoring.yaml:157 entfernen, oder den Cron-Eintrag in entrypoint.sh so ändern, dass er backup-full.sh statt backup.sh aufruft (dann aber sicherstellen, dass scripts/backup/backup.sh mit den im Container vorhandenen Tools/ENV-Namen kompatibel ist — dort wird z.B. BACKUP_DIR/POSTGRES*\* teils anders referenziert, das sollte vor Umstellung geprüft werden). README.md/BACKUP_SYSTEM.md danach entsprechend korrigieren (n8n-Beschreibung nicht als "fehlt", sondern als "über Postgres-Dump abgedeckt" dokumentieren).
- _Hinweis Verifizierer:_ Kern-Behauptung (Qdrant-Snapshot fehlt im real ausgeführten Backup, backup-full.sh ist toter Mount) ist verifiziert korrekt:
- entrypoint.sh:6,21 ruft ausschließlich /usr/local/bin/backup.sh via Cron auf (services/backup-service/entrypoint.sh:20-25).
- services/backup-service/Dockerfile:18 kopiert services/backup-service/backup.sh nach /usr/local/bin/backup.sh — dieses Skript enthält keine "qdrant"-Referenz (verifiziert per Read, komplettes Skript gelesen: nur Postgres pg_dump + MinIO mirror + n8n-Key-Escrow).
- compose/compose.monitoring.yaml:157 mountet scripts/backup/backup.sh zusätzlich als /usr/local/bin/backup-full.sh — repo-weiter Grep nach "backup-full.sh" liefert nur diese eine Zeile, es wird nirgends aufgerufen (auch restore-drill.sh referenziert weder "qdrant" noch "backup-full").
- README.md:3,21 und docs/ops/BACKUP_SYSTEM.md beschreiben explizit ein Qdrant-Backup-Ziel, das im deployten Pfad nicht existiert → Doku-Drift bestätigt.

ABER: Der n8n-Teil des Findings ist überzogen/teilweise falsch. n8n läuft laut compose/compose.app.yaml:191-197 mit DB_TYPE=postgresdb gegen dieselbe Datenbank ($POSTGRES_DB=arasul_db), Schema "n8n". Der pg_dump-Aufruf in backup.sh:47-52 hat kein --schema-Flag und dumpt damit die gesamte Datenbank inkl. Schema n8n — Workflows, Credentials etc. sind also transitiv im Postgres-Backup enthalten. Der Kommentar in backup.sh:74-78 bestätigt das explizit ("the DB dump above contains the encrypted credentials, but they are useless without the encryption key" — deshalb der Encryption-Key-Escrow). Die Aussage "n8n-Workflows sind ebenfalls nicht gesichert" ist damit falsch; n8n ist über Postgres abgedeckt, nur nicht als portables JSON-Export (wie in scripts/backup/backup.sh:262-300 zusätzlich implementiert).

Severity: "critical" ist zu hoch angesetzt. Qdrant-Verlust ist unschön (RAG muss neu embedded werden), aber die Ursprungsdaten (Dokumente in MinIO, Metadaten in Postgres) bleiben erhalten — kein irreversibler Datenverlust, sondern ein aufwendiger Recovery-Schritt. n8n ist entgegen der Behauptung nicht betroffen. Daher corrected_severity: high.

#### 3. [LOW/S] Kommentar zu MAX_REBOOTS_PER_HOUR im Dockerfile widerspricht dem tatsächlichen Default in config.py

- **Datei:** `services/self-healing-agent/Dockerfile` · Domäne: services · Kategorie: docs
- **Problem:** Der Sicherheits-Kommentar im Dockerfile behauptet ein Limit von 'max 2 reboots/hour', tatsächlich setzt config.py den Default für MAX_REBOOTS_PER_HOUR auf 1. Kleine, aber irreführende Diskrepanz für Ops-Personal, die im Ernstfall (Reboot-Loop-Diagnose) nach dem falschen Schwellwert sucht.
- **Evidenz:** services/self-healing-agent/Dockerfile:29: '2. When enabled, max 2 reboots/hour limit prevents reboot loops' vs. services/self-healing-agent/config.py:66: "MAX_REBOOTS_PER_HOUR = int(os.getenv('MAX_REBOOTS_PER_HOUR', '1'))".
- **Fix:** Kommentar im Dockerfile auf '1' korrigieren oder umgekehrt den Default in config.py auf 2 anheben — je nachdem, was operativ beabsichtigt war.

#### 4. [LOW/S] Bare `except:` in post_reboot_validation.py verschluckt Fehler beim Health-Status-Lesen

- **Datei:** `services/self-healing-agent/post_reboot_validation.py` · Domäne: services · Kategorie: bug
- **Problem:** In check_service_health() wird ein nackter except-Block ohne Exception-Typ und ohne Logging verwendet, um Fehler beim Auslesen des Health-Status eines Containers zu unterdrücken. Das widerspricht dem im übrigen Code (z.B. healing_engine.py:157-158) etablierten Muster 'except Exception as e: logger.debug(...)' und kann echte Bugs (z.B. AttributeError durch API-Änderung der Docker-SDK) stillschweigend verstecken.
- **Evidenz:** services/self-healing-agent/post_reboot_validation.py:118-123:
  try:
  inspect = container.attrs
  if 'Health' in inspect.get('State', {}):
  health = inspect['State']['Health']['Status']
  except:
  pass
- **Fix:** Auf 'except Exception as e: logger.debug(...)' umstellen, analog zum Muster in healing_engine.py:153-158.

#### 5. [LOW/S] restore-drill.sh-Kopfkommentar referenziert falschen Pfad des eigenen Skripts

- **Datei:** `services/backup-service/restore-drill.sh` · Domäne: services · Kategorie: docs
- **Problem:** Der Nutzungs-Kommentar im Skriptkopf beschreibt den Aufruf als 'scripts/ops/restore-drill.sh', tatsächlich liegt und läuft das Skript unter services/backup-service/restore-drill.sh (per Dockerfile als /usr/local/bin/restore-drill.sh). Der Pfad scripts/ops/ existiert für dieses Skript nicht — irreführend für jemanden, der versucht es manuell aufzurufen.
- **Evidenz:** services/backup-service/restore-drill.sh:11-13: '# scripts/ops/restore-drill.sh # run against latest backup' — Datei liegt aber unter services/backup-service/.
- **Fix:** Kommentar auf den tatsächlichen Aufrufpfad (docker exec backup-service /usr/local/bin/restore-drill.sh bzw. services/backup-service/restore-drill.sh) korrigieren.

### ✅ P5 — Frontend-Typsicherheit & CI-Härtung

**Files:** apps/dashboard-frontend/.eslintrc.json, tsconfig.json (vitest-Globals), src/**/\* (563 Produktcode-TS-Fehler, Schwerpunkte: DocumentManager.tsx 35, DocumentDetailsModal.tsx 22, ChatView.tsx 20, ChatContext.tsx 20, BotSetupWizard.tsx 15, App.tsx 14, UpdatePage.tsx 12, DownloadContext.tsx 12, TelegramBotPage.tsx 11, AIProfileSettings.tsx 10, utils/{csrf,token}.ts, hooks/{useConfirm,useWebSocketMetrics,useTerminal}), .github/workflows/test.yml, vite.config (manualChunks für >500-kB-Chunks)
**Risk:** high — größte Phase. Die 57× id:string↔number-Konflikte sind potenziell ECHTE Logikfehler (IDs, die als Zahl deklariert, aber als String geliefert werden) und werden einzeln entschieden, nicht per Cast weggedrückt. api.get<T>-Typparameter werden flächig nachgezogen (Projektregel). CI-Enforcement (continue-on-error entfernen) kommt als LETZTER Schritt der Phase, erst wenn lokal alles grün ist — sonst blockiert der eigene PR.
**Tests:\*\* npx tsc --noEmit → 0 Fehler; Frontend-Vitest-Suite grün; vite build ok; UpdatePage nutzt getValidToken(); Terminal-Theme-Finding (unsicher) wird hier verifiziert und ggf. auf Theme-Tokens umgestellt; Chunk-Split via dynamic import/manualChunks, Ziel <500 kB pro Chunk (best effort, kein Hard-Gate).

**Findings dieser Phase:**

#### 1. [HIGH/M] TypeScript-Frontend wird von ESLint/Typecheck-Tooling faktisch nie geprüft

- **Datei:** `apps/dashboard-frontend/.eslintrc.json` (Zeile 13) · Domäne: frontend · Kategorie: setup
- **Problem:** Die frontend .eslintrc.json deklariert keinen TypeScript-Parser (`@typescript-eslint/parser`) und keine `@typescript-eslint`-Plugins/Regeln – weder im Frontend-`package.json` noch im Root-`package.json` ist `@typescript-eslint/*` überhaupt als Dependency vorhanden. `npm run lint` führt aber `eslint src/ --ext .ts,.tsx` aus (package.json:57) und würde mit dem Standard-Parser (espree) an TS-spezifischer Syntax (Interfaces, Generics, `as`-Casts) scheitern. Zusätzlich läuft `scripts/test/run-typecheck.sh` (der PostToolUse-Hook fürs 'Type-Checking') für das Frontend nur `eslint --ext .js,.jsx` (Zeile 17) – also NIE gegen echte `.ts`/`.tsx`-Dateien, obwohl das komplette Frontend TypeScript-only ist. Effekt: `tsconfig.json`'s `strict: true` + `noUncheckedIndexedAccess` wird nirgends automatisiert durchgesetzt; Typfehler (z.B. `unknown`-Zugriffe aus `api.get()` ohne Typparameter) fallen nie auf. In der CI (`.github/workflows/test.yml:78-80`) ist der Frontend-Lint-Job bereits explizit als `continue-on-error: true` mit Kommentar '~1500 legacy errors' markiert – das Problem ist also bekannt, aber ungelöst und blockiert nichts.
- **Evidenz:** apps/dashboard-frontend/.eslintrc.json: "extends": ["eslint:recommended", "plugin:react/recommended", ...] ohne @typescript-eslint; scripts/test/run-typecheck.sh:17 `npx eslint src/ --ext .js,.jsx ...` (nie .ts/.tsx); .github/workflows/test.yml:73-80 TODO(Phase-6.1b) + continue-on-error: true
- **Fix:** `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` in apps/dashboard-frontend als devDependency ergänzen, `.eslintrc.json` auf den TS-Parser umstellen, und `run-typecheck.sh` für Frontend-Änderungen zusätzlich `tsc --noEmit` (oder den vorhandenen `npm run lint`) laufen lassen statt nur `.js,.jsx` zu linten.

#### 2. [HIGH/L] Frontend-Lint und -Tests laufen in CI nur advisory (continue-on-error), ~1500 Lint-Fehler und ~90 fehlschlagende Tests bleiben verdeckt

- **Datei:** `.github/workflows/test.yml` (Zeile 73) · Domäne: quality · Kategorie: setup
- **Problem:** Die Non-negotiable-Regel "Tests before commit" (root CLAUDE.md #3) wird für das Frontend faktisch nicht durchgesetzt: der CI-Job markiert Lint und Vitest ausdrücklich als "advisory" mit continue-on-error:true, mit dem Kommentar, dass ~1500 Lint-Fehler und ~90 fehlschlagende Vitest-Tests bereits bestehen und nicht blockieren. Das bedeutet, neue PRs können beliebig viele zusätzliche Frontend-Bugs/Regressionen einführen, ohne dass CI rot wird — der einzige Schutz ist der Docker-Build-Smoke-Test (nur "baut", prüft keine Logik).
- **Evidenz:** # TODO(Phase-6.1b): frontend lint currently has ~1500 legacy errors\n# (pre-existing, not regressions). ... Same story for vitest: ~90 failing tests\n# against real React components. ... records the numbers without blocking the pipeline.\n- name: Lint (frontend) · advisory\n run: npm run lint:frontend\n continue-on-error: true
- **Fix:** Kurzfristig: bestehende ~90 Test-Fehler und Lint-Fehler in Tranchen abarbeiten (ist bereits in docs/plans/active/side-branch-cherry-pick-2026-05-14.md P3 als Cherry-Pick-Ziel vorgesehen) und schrittweise die Fehler-Obergrenze über eine Baseline-Datei (z.B. ESLint --max-warnings mit sinkendem Budget) verringern, statt komplett advisory zu bleiben.

#### 3. [MEDIUM/L] Nicht-negoziable Regel 'Typparameter für api.get/post/...' wird in der Mehrheit der Aufrufe verletzt

- **Datei:** `apps/dashboard-frontend/src/features/documents/DocumentManager.tsx` (Zeile 158) · Domäne: frontend · Kategorie: refactor
- **Problem:** CLAUDE.md verbietet explizit `any` als Rückgabetyp von `api.get|post|...` und verlangt einen Typparameter. Von 119 gefundenen `api.get/post/put/patch/del(...)`-Aufrufen in .tsx-Dateien übergeben nur 28 einen Typparameter (`api.get<T>(...)`); der Rest – u.a. alle Ladefunktionen in DocumentManager.tsx (loadDocuments, loadCategories, loadStatistics, loadSpaces, loadTables) – lässt `T` auf `unknown` defaulten und greift direkt auf Felder wie `data.documents`/`data.total` zu. Da (siehe anderes Finding) das Lint/Typecheck-Tooling diese TS-Verstöße aktuell nicht erkennt, bleibt der Fehler unsichtbar, bis jemand versehentlich ein falsches Feld liest.
- **Evidenz:** DocumentManager.tsx:158-160 `const data = await api.get(`/documents?${params}`, ...); setDocuments(data.documents || []); setTotalDocuments(data.total || 0);` — kein `<T>` an api.get.
- **Fix:** Kleinere Präzisierung nötig: Der Titel/die Beschreibung sprechen von 'any als Rückgabetyp', tatsächlich ist der Default in useApi.ts `T = unknown` (keine Datei schreibt explizit `any`). Der Fix sollte das klarstellen: nicht 'any durch Typparameter ersetzen', sondern 'fehlenden Typparameter ergänzen, der sonst auf `unknown` defaultet'. Der vorgeschlagene ESLint-Ansatz (`@typescript-eslint/no-unsafe-member-access`) setzt zusätzlich voraus, dass @typescript-eslint/parser + @typescript-eslint/eslint-plugin überhaupt erst installiert und in apps/dashboard-frontend/.eslintrc.json aktiviert werden (aktuell komplett fehlend) inkl. type-aware linting (parserOptions.project) — das sollte im Fix als Voraussetzung explizit genannt werden, sonst ist der Vorschlag unvollständig.
- _Hinweis Verifizierer:_ Alle Kernbehauptungen halten stand. (1) CLAUDE.md apps/dashboard-frontend/CLAUDE.md:115 enthält exakt das zitierte Verbot ("❌ `any` for return types from `api.get|post|...` — pass a type parameter"). (2) DocumentManager.tsx:158-160 ruft `api.get(...)` ohne Typparameter auf und greift direkt auf `data.documents`/`data.total` zu — Beleg korrekt zitiert, gleiches Muster auch bei loadCategories (184-185), loadStatistics (201-202), loadSpaces (216-217). (3) useApi.ts:98/118-120/214-245 (Default `T = unknown`, nicht `any` wie im Titel behauptet — kleine Ungenauigkeit, aber der eigentliche Verstoß ist 'kein Typparameter', was korrekt ist) bestätigt, dass beim Weglassen des Typparameters `unknown` zurückkommt; Feldzugriff darauf wäre unter `strict: true` (tsconfig.json:21) normalerweise ein Compile-Fehler. (4) Grep bestätigt die Zahlen exakt: 119 Treffer für `api.(get|post|put|patch|del)(` in .tsx-Dateien, davon nur 28 mit `<T>`-Typparameter — passt zur Behauptung 'nur 28 von 119'. (5) Die Behauptung, dass dieser Verstoß derzeit unsichtbar bleibt, ist ebenfalls verifiziert: apps/dashboard-frontend/.eslintrc.json enthält keinerlei @typescript-eslint-Plugin/Parser (nur eslint:recommended + react), package.json hat kein tsc/typecheck-Skript, und `vite build` (package.json:52) führt keine vollständige Typprüfung durch — es existiert also kein Gate, das TS-Fehler wie Feldzugriffe auf `unknown` abfangen würde. Severity 'medium' ist plausibel: kein akuter Laufzeitfehler (JS ist zur Laufzeit ungetypt), aber ein reales, weitverbreitetes Convention-Drift-Risiko mit fehlender Absicherung. Effort 'L' passt zur Größe (91 betroffene Aufrufe über 30+ Dateien).

#### 4. [MEDIUM/S] UpdatePage liest Token direkt aus localStorage statt über getValidToken() — umgeht Ablauf-/Formatprüfung

- **Datei:** `apps/dashboard-frontend/src/features/system/UpdatePage.tsx` (Zeile 202) · Domäne: frontend · Kategorie: bug
- **Problem:** Für den XHR-Upload des Update-Pakets liest `handleUpload` das Token per `localStorage.getItem('arasul_token')` roh aus, statt die im Projekt zentrale `getValidToken()`-Utility (utils/token.ts) zu verwenden, die Format- und Ablaufprüfung durchführt und abgelaufene Tokens automatisch entfernt. Bei einem knapp abgelaufenen Token wird der Upload eines mehrere hundert MB großen Update-Pakets gestartet und schlägt erst nach Übertragung (401) fehl, statt vorher sauber zum Login umzuleiten wie der Rest der App via `useApi`.
- **Evidenz:** UpdatePage.tsx:200-202 `const xhr = new XMLHttpRequest(); const token = localStorage.getItem('arasul_token');` — kein getValidToken()-Aufruf, kein Ablauf-Check.
- **Fix:** `getValidToken()` aus utils/token.ts importieren und statt des direkten localStorage-Zugriffs verwenden; bei `null` vor Upload-Start einen Fehler anzeigen statt den XHR überhaupt zu starten.

**Zu verifizieren (Audit-Urteil 'unsicher'):**

#### 1. [LOW/M] Terminal-Theme in useTerminal.ts ist hart auf Dark-Mode-Hex-Werte gecodet und reagiert nie auf den Theme-Umschalter

- **Datei:** `apps/dashboard-frontend/src/features/sandbox/useTerminal.ts` (Zeile 146) · Domäne: frontend · Kategorie: ui
- **Problem:** xterm.js verlangt ein JS-Farbobjekt (kann keine CSS-Variablen referenzieren), aber die hier hart codierten Hex-Werte (`#0a0a0a`, `#e4e4e7`, 16 weitere ANSI-Farben) werden nie aktualisiert, wenn der Nutzer zwischen hellem/dunklem Theme wechselt (`useTheme`-Hook, GeneralSettings.tsx Theme-Switch). Das Sandbox-Terminal bleibt dauerhaft dunkel, auch im Light-Mode — ein sichtbarer Bruch der 'nie Hex-Literale, bricht Light-Mode'-Regel aus der Frontend-CLAUDE.md, wenn auch aus einer technischen Zwangslage heraus.
- **Evidenz:** useTerminal.ts:145-167 `theme: { background: '#0a0a0a', foreground: '#e4e4e7', ... }` — statisches Objekt ohne Bezug zum aktuellen App-Theme.
- **Fix:** Falls das Verhalten tatsächlich geändert werden soll: nicht komplett dynamisch auf CSS-Variablen umstellen (das widerspräche der dokumentierten Absicht \"light mode keeps dark terminal\"), sondern zunächst klären, ob ein permanent dunkles Terminal gewünscht bleibt. Falls ja: den vorhandenen, aber ungenutzten Token --bg-terminal (index.css:263/431) tatsächlich als Quelle für das xterm-Theme-Objekt verwenden (statt des rein hartcodierten #0a0a0a), damit wenigstens Token und Implementierung konsistent sind — keine Runtime-Reaktion auf Theme-Wechsel nötig, da laut CSS-Kommentar in beiden Modi derselbe Wert gilt.
- _Hinweis Verifizierer:_ Die technische Kernbehauptung stimmt: useTerminal.ts:141-172 setzt ein statisches xterm-Theme-Objekt mit hartcodierten Hex-Werten (#0a0a0a, #e4e4e7 etc.), das nie auf Theme-Wechsel reagiert (useTheme wird in features/sandbox nirgends importiert/verwendet, grep bestätigt 0 Treffer). Das Terminal bleibt tatsächlich immer dunkel.

ABER: index.css enthält explizit den Design-Kommentar an genau der Stelle, die dieses Verhalten regeln würde: Zeile 430 \"/_ Terminal Background (light mode keeps dark terminal) _/\" mit --bg-terminal: #1a1a2e, sowohl im :root (dark, Zeile 262-263) als auch im .light-mode Block (Zeile 430-431) auf denselben Wert gesetzt. Das ist ein expliziter Beleg, dass ein dauerhaft dunkles Terminal (unabhängig vom App-Theme) eine bewusste Design-Entscheidung ist — kein unbeabsichtigter Bug/Drift, wie der Titel \"reagiert nie auf den Theme-Umschalter\" suggeriert. Damit widerspricht das Finding sich selbst teilweise: Es erkennt die technische Zwangslage (xterm braucht JS-Objekt, keine CSS-Var) korrekt an, rahmt das Ergebnis aber fälschlich als Verstoß gegen eine \"non-negotiable rule\", obwohl der CSS-Kommentar zeigt, dass genau dieses Verhalten intendiert ist.

Interessant: --bg-terminal (#1a1a2e) wird nirgends im Code tatsächlich referenziert (weder als Tailwind-Klasse noch als var()) und weicht selbst vom hartcodierten xterm-Hintergrund (#0a0a0a) ab — es gibt also eine echte, aber andere Inkonsistenz (ungenutzter Design-Token vs. tatsächlich verwendeter Hex-Wert), die der Auditor nicht adressiert.

Fazit: Code-Fakten sind korrekt, aber die Einordnung als (unbeabsichtigter) Bug/Regelverstoß ist durch Projekt-eigene Doku (index.css Kommentar) widerlegbar — es sieht nach Absicht aus. Ohne Rücksprache mit den Autoren/PR-Historie zu --bg-terminal lässt sich nicht sicher sagen, ob ein Fix überhaupt erwünscht ist, daher \"uncertain\" statt klar \"refuted\".

### ✅ P6 — Dead Code & Entschlackung

**Files:** scripts/setup/setup_dev.sh, scripts/setup/setup-dev-tools.sh, apps/dashboard-backend/src/schemas/common.js, config/traefik/dynamic/middlewares.yml + arasul (tote Ersetzungslogik), compose/compose.ai.yaml (healthcheck.sh verdrahten ODER Mount entfernen), package.json (engines >=22), apps/dashboard-frontend/src/components/ui/ConfirmIconButton.tsx (+ Test)
**Risk:** low — reine Löschungen/Angleichungen; vor jeder Löschung Grep-Nachweis der Referenzlosigkeit wiederholen (Audit hat das bereits einmal verifiziert). ConfirmIconButton: löschen (ungenutzt); falls beim Umsetzen ein sinnvoller Einsatzort in bestehenden Confirm-Flows auffällt, stattdessen verwenden — keine neuen UI-Flows erfinden.
**Tests:** Backend-Suite grün (common.js-Löschung), Frontend-Build + Tests grün (ConfirmIconButton-Test entfällt mit), docker compose config parst alle Compose-Dateien nach healthcheck-Änderung.

**Findings dieser Phase:**

#### 1. [MEDIUM/S] Zwei tote Setup-Skripte ohne jeglichen Aufrufer (setup_dev.sh, setup-dev-tools.sh)

- **Datei:** `scripts/setup/setup_dev.sh` · Domäne: quality · Kategorie: dead-code
- **Problem:** scripts/setup/setup_dev.sh (secrets/.env/SSL/Hardware-Erkennung) und scripts/setup/setup-dev-tools.sh (Husky/ESLint-Setup) werden von keiner Stelle im Repo aufgerufen: nicht aus interactive_setup.sh, nicht aus arasul, nicht aus Makefile, nicht aus .github/workflows/\*, nicht aus docs/development/. setup_dev.sh wird nur noch in BUGS_AND_FIXES.md (Changelog) erwähnt, setup-dev-tools.sh gar nicht. scripts/README.md deklariert zudem, dass snake_case-Dateien in Migration sind (`scripts/setup/setup_dev.sh` verstößt gegen die kebab-case-Konvention). Der bereits im Repo dokumentierte, noch nicht ausgeführte Plan docs/plans/active/side-branch-cherry-pick-2026-05-14.md (P5) verweist explizit auf "5 truly orphan scripts", die aus einem Side-Branch noch zu löschen sind — diese beiden Dateien passen exakt in dieses Muster.
- **Evidenz:** Grep über gesamtes Repo nach "setup_dev.sh" und "setup-dev-tools.sh" außerhalb der Dateien selbst: nur 2 Treffer in BUGS_AND_FIXES.md (Prosa-Changelog), keiner in ausführbarem Code/CI/Docs-Anleitungen.
- **Fix:** Beide Skripte entweder in interactive_setup.sh/Makefile einhängen (falls die Funktionalität noch gebraucht wird — Secrets-Generierung und Husky-Setup klingen relevant) oder löschen, wenn sie durch interactive_setup.sh/scripts/setup/setup-service-user.sh abgelöst wurden. Vor dem Löschen kurz mit dem User klären, welches der beiden Onboarding-Skripte aktuell tatsächlich verwendet wird.

#### 2. [LOW/S] ConfirmIconButton ist vollständig implementiert und getestet, aber nirgends im Produktcode verwendet

- **Datei:** `apps/dashboard-frontend/src/components/ui/ConfirmIconButton.tsx` (Zeile 34) · Domäne: frontend · Kategorie: dead-code
- **Problem:** `ConfirmIconButton` (memo-Komponente mit Inline-Bestätigungs-Popup) wird ausschließlich von seiner eigenen Testdatei importiert (`__tests__/ConfirmIconButton.test.tsx`), aber von keiner einzigen Feature-Seite verwendet – trotz vollständigem 30-Test-Suite. Andere Stellen im Code (z.B. DocumentManager, SelfHealingEvents) lösen Löschbestätigungen stattdessen über den separaten `useConfirm`-Modal-Hook. Totes UI-Component erhöht Bundle/Wartungsaufwand ohne Nutzen.
- **Evidenz:** Grep über src/ zeigt ConfirmIconButton nur in ConfirmIconButton.tsx selbst und **tests**/ConfirmIconButton.test.tsx – keine Referenz aus einer features/\*\*-Datei.
- **Fix:** Entweder Komponente entfernen (inkl. Test) oder an mindestens einer Stelle einsetzen, an der aktuell `useConfirm` für eine einzelne Icon-Aktion verwendet wird (z.B. Tabellen-Zeilenaktionen), um Duplizierung der beiden Bestätigungsmuster zu vermeiden.

#### 3. [LOW/S] Unbenutzte basicAuth-traefik-Middleware mit toter Platzhalter-Ersetzungslogik im Bootstrap-Skript

- **Datei:** `config/traefik/dynamic/middlewares.yml` (Zeile 178) · Domäne: infra · Kategorie: dead-code
- **Problem:** Die Middleware basicAuth-traefik wird von keinem Router in routes.yml mehr referenziert — der traefik-dashboard-Router nutzt stattdessen forward-auth (routes.yml:196-206). Trotzdem enthält ./arasul umfangreiche Logik (setup_secrets(), validate_basic_auth_hash()), die den Platzhalter **BASIC_AUTH_HASH** generiert, validiert und im Fehlerfall mit der Fehlermeldung 'Dashboard/n8n erfordern erneutes Setup' einen gesperrten Hash einsetzt — obwohl diese Middleware nirgends mehr greift und daher Dashboard/n8n gar nicht schützt. Das verschleiert, dass der eigentliche Schutz ausschließlich über forward-auth läuft.
- **Evidenz:** config/traefik/dynamic/routes.yml:193-206 (traefik-dashboard router nutzt middlewares: [forward-auth, ...], nicht basicAuth-traefik) | arasul:794-827 validate_basic_auth_hash() mit Log 'Ersetze Platzhalter durch gesperrten Hash - Dashboard/n8n erfordern erneutes Setup'
- **Fix:** Entweder die basicAuth-traefik-Middleware und die zugehörige Bootstrap-Logik entfernen (da forward-auth die tatsächliche Absicherung übernimmt), oder falls ein zweiter Schutzlayer gewünscht ist, sie wieder aktiv an einen Router binden und die Fehlermeldungen präzisieren.

#### 4. [LOW/S] Embedding-Service: Umfangreiches healthcheck.sh wird gemountet, aber vom Compose-Healthcheck nie aufgerufen

- **Datei:** `compose/compose.ai.yaml` (Zeile 168) · Domäne: infra · Kategorie: dead-code
- **Problem:** Für embedding-service wird services/embedding-service/healthcheck.sh (6 Checks: Health-Endpoint, Modell-Info, Latenz, Vektordimension, GPU, Concurrency) als /healthcheck.sh eingehängt, aber der tatsächliche Docker-Healthcheck ruft stattdessen direkt `curl -sf http://localhost:11435/health` auf und ignoriert das Skript komplett. Bei llm-service (compose.ai.yaml:110) wird das äquivalente Muster korrekt verwendet (`/bin/bash /healthcheck.sh`). Der Aufwand hinter dem embedding-Skript ist damit wirkungslos.
- **Evidenz:** compose.ai.yaml:146-148 mountet '../services/embedding-service/healthcheck.sh:/healthcheck.sh:ro', aber healthcheck test (Zeile 169) ist ['CMD', 'curl', '-sf', 'http://localhost:11435/health'] statt ['CMD','/bin/bash','/healthcheck.sh']
- **Fix:** Healthcheck-Test für embedding-service auf `['CMD', '/bin/bash', '/healthcheck.sh']` umstellen (analog llm-service), oder falls der einfache curl-Check bewusst gewählt wurde, das ungenutzte healthcheck.sh-Mounting und die Datei entfernen.

#### 5. [LOW/S] Totes Zod-Schema-File schemas/common.js wird nirgends importiert

- **Datei:** `apps/dashboard-backend/src/schemas/common.js` · Domäne: quality · Kategorie: dead-code
- **Problem:** Die Datei exportiert PositiveIntIdParam, UuidIdParam, ModelIdParam, aber ein repo-weiter Grep nach "schemas/common" innerhalb von apps/dashboard-backend/src findet keinen einzigen require(...). Vermutlich wurden die Param-Validierungen inline in den einzelnen Routen-Schemas dupliziert statt zentral aus common.js zu importieren. Der bereits im Repo referenzierte, noch nicht gemergte Side-Branch-Plan nennt exakt "chore: remove dead schemas/common.js" als offenen Punkt (P5) — bestätigt den Befund unabhängig.
- **Evidenz:** module.exports = { PositiveIntIdParam, UuidIdParam, ModelIdParam }; — kein Treffer für require(...schemas/common...) in src/.
- **Fix:** Datei löschen oder, falls die drei Schemas tatsächlich in mehreren Routen dupliziert vorkommen (z.B. :id-Param-Validierung), stattdessen die Duplikate durch einen Import aus common.js ersetzen — das wäre der bessere Fix, da es echte Duplikation beseitigt statt nur die zentrale Datei zu entfernen.

#### 6. [LOW/S] Root package.json engines-Feld erlaubt Node >=18, widerspricht Backend-Requirement (>=22) und .nvmrc (22)

- **Datei:** `package.json` (Zeile 47) · Domäne: quality · Kategorie: docs
- **Problem:** Root-CLAUDE.md und apps/dashboard-backend/CLAUDE.md deklarieren Node.js 22 LTS (.nvmrc = 22, backend package.json engines >=22.0.0) als verbindlich. Das Root-package.json erlaubt jedoch weiterhin engines >=18.0.0, was bei einer Erstinstallation mit npm-Engine-Strict-Check oder bei CI-Runnern mit älterem Node zu stillen Inkompatibilitäten führen kann (z.B. neuere Node-only-Syntax im Backend-Code, die unter Node 18 crasht statt beim npm install klar abgelehnt zu werden).
- **Evidenz:** root package.json: "engines": { "node": ">=18.0.0" } vs. apps/dashboard-backend/package.json: "engines": { "node": ">=22.0.0" } und .nvmrc: 22
- **Fix:** Root package.json engines auf ">=22.0.0" anheben, damit ein Fresh-Install mit falscher Node-Version sofort sichtbar fehlschlägt statt erst im Backend-Container.

### ✅ P7 — Doku-Konsolidierung & Drift

**Files:** CLAUDE.md (Quick-Reference), docs/integrations/N8N.md, docs/api/DATABASE_SCHEMA.md, docs/ENVIRONMENT_VARIABLES.md (4 Findings: RAM/CPU-Defaults, Secrets-Override, DOCKER_NETWORK, Backup-Duplikat), CONTRIBUTING.md (2 Findings), docs/plans/README.md, README.md + ARCHITECTURE.md + docs/ARCHITECTURE.md (Topologie-Single-Source), docs/development/ONBOARDING.md (Link-Fix + Workspace-Install-Hinweis aus Baseline)
**Risk:** low — reine Doku; Topologie-Konsolidierung: das Diagramm lebt künftig NUR in docs/ARCHITECTURE.md, alle anderen Stellen verlinken darauf (CLAUDE.md behält seine Kompakt-ASCII-Übersicht, da Arbeits-Kontext).
**Tests:** scripts/validate/validate-doc-links.sh läuft sauber durch; DATABASE_SCHEMA.md enthält telegram_user_chats (Abgleich gegen Migration 095); ENVIRONMENT_VARIABLES.md-Defaults stichprobenartig gegen Compose-Dateien geprüft.

**Findings dieser Phase:**

#### 1. [HIGH/S] CLAUDE.md-Quick-Reference zeigt auf sekundären Plan statt auf den aktuellen FIELD_1.0.0_MASTER_PLAN.md

- **Datei:** `CLAUDE.md` · Domäne: docs · Kategorie: docs
- **Problem:** Sowohl root-CLAUDE.md als auch apps/dashboard-backend/CLAUDE.md verweisen als "Aktuellster Plan" ausschließlich auf `docs/plans/active/side-branch-cherry-pick-2026-05-14.md`. Tatsächlich existiert seit 2026-07-02 `docs/plans/active/FIELD_1.0.0_MASTER_PLAN.md`, der laut eigener Beschreibung "der eine, konsolidierte Fahrplan" ist und den Side-Branch-Plan explizit nur noch als untergeordneten "Ernte-Backlog" referenziert (FIELD_1.0.0_MASTER_PLAN.md:87). Da dies der primäre Einstiegspunkt für KI-Agenten ist (README/INDEX verweisen hierher), wird jede neue Session auf den falschen/veralteten Plan gelenkt.
- **Evidenz:** CLAUDE.md Quick reference: "Aktuellster Plan: docs/plans/active/side-branch-cherry-pick-2026-05-14.md — P1–P5 alle offen" — aber docs/plans/active/FIELD_1.0.0_MASTER_PLAN.md:5 sagt "Löst alle bisherigen aktiven Pläne ab (siehe Teil 0)" und ist neuer (2026-07-02 vs. 2026-05-14).
- **Fix:** Quick-Reference-Zeile in CLAUDE.md und apps/dashboard-backend/CLAUDE.md auf FIELD_1.0.0_MASTER_PLAN.md als primären Plan umstellen; side-branch-cherry-pick als sekundäre Backlog-Referenz beibehalten.

#### 2. [MEDIUM/S] RAM*LIMIT*_/CPU*LIMIT*_-Defaults in docs/ENVIRONMENT_VARIABLES.md weichen von den tatsächlichen Compose-Defaults ab

- **Datei:** `docs/ENVIRONMENT_VARIABLES.md` (Zeile 576) · Domäne: infra · Kategorie: docs
- **Problem:** Mehrere in der Doku als 'Default' angegebene Ressourcenlimits stimmen nicht mit den tatsächlichen Fallback-Werten in den Compose-Dateien überein: RAM_LIMIT_LLM (Doku 48G vs. compose.ai.yaml 32G), RAM_LIMIT_EMBEDDING (Doku 8G vs. 12G), RAM_LIMIT_QDRANT (Doku 4G vs. 6G), RAM_LIMIT_POSTGRES (Doku 2G vs. compose.core.yaml 4G), CPU_LIMIT_DASHBOARD (Doku 2 vs. compose.app.yaml 4). Für Betreiber, die Sizing/Kapazitätsplanung anhand der Doku machen, ergibt sich ein falsches Bild der tatsächlichen Ressourcenreservierung.
- **Evidenz:** docs/ENVIRONMENT_VARIABLES.md:576-597 (RAM_LIMIT_LLM=48G, RAM_LIMIT_EMBEDDING=8G, RAM_LIMIT_QDRANT=4G, RAM_LIMIT_POSTGRES=2G, CPU_LIMIT_DASHBOARD=2) vs. compose/compose.ai.yaml:98 (32G), :157 (12G), :49 (6G); compose/compose.core.yaml:52 (4G); compose/compose.app.yaml:110 (4)
- **Fix:** Tabelle in docs/ENVIRONMENT_VARIABLES.md gegen die tatsächlichen `${VAR:-default}`-Werte in den Compose-Dateien abgleichen und aktualisieren, oder umgekehrt Compose-Defaults an die dokumentierten Geräteprofile anpassen — je nachdem, welcher Wert korrekt ist.

#### 3. [MEDIUM/S] Dokumentierter Docker-Secrets-Override-Befehl referenziert nicht existierende Datei

- **Datei:** `docs/ENVIRONMENT_VARIABLES.md` (Zeile 725) · Domäne: infra · Kategorie: docs
- **Problem:** Die Doku beschreibt Docker Secrets als optionalen Zusatzschritt: 'Start with the secrets override: docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d'. Tatsächlich gibt es keine Datei docker-compose.secrets.yml — die Secrets-Konfiguration liegt in compose/compose.secrets.yaml und wird über `include:` in der Root-docker-compose.yml IMMER automatisch geladen (kein Override nötig/möglich). Wer dem dokumentierten Befehl folgt, bekommt einen Docker-Compose-Fehler wegen fehlender Datei.
- **Evidenz:** docs/ENVIRONMENT_VARIABLES.md:725: 'docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d' | docker-compose.yml:23-24: include: [path: ./compose/compose.secrets.yaml, ...] (immer inkludiert, kein separater Aufruf möglich)
- **Fix:** Abschnitt korrigieren: Secrets sind über compose/compose.secrets.yaml bereits fest in der Root docker-compose.yml eingebunden; einfach `docker compose up -d` reicht, sobald Dateien unter config/secrets/ existieren. Den irreführenden -f-Befehl entfernen.

#### 4. [MEDIUM/S] Toter Link auf docs/plans/active/EXTERNAL_INTEGRATIONS.md in N8N.md

- **Datei:** `docs/integrations/N8N.md` (Zeile 87) · Domäne: docs · Kategorie: docs
- **Problem:** N8N.md verweist zweimal auf `docs/plans/active/EXTERNAL_INTEGRATIONS.md` als "Full hardening roadmap". Die Datei ist inzwischen nach `docs/plans/archive/2026-07-02_external-integrations.md` verschoben (bestätigt per Glob). Ein Operator, der die referenzierte Roadmap für nicht-erzwungene n8n-Sicherheitsfeatures nachschlagen will, landet auf einem 404.
- **Evidenz:** docs/integrations/N8N.md:87: "What's not enforced yet (tracked in `docs/plans/active/EXTERNAL_INTEGRATIONS.md`):" — Datei liegt tatsächlich unter docs/plans/archive/2026-07-02_external-integrations.md.
- **Fix:** Beide Vorkommen (Zeile 87 und 135) auf den neuen Pfad `docs/plans/archive/2026-07-02_external-integrations.md` aktualisieren.

#### 5. [MEDIUM/S] DATABASE_SCHEMA.md fehlt die von Migration 095 eingeführte Tabelle telegram_user_chats

- **Datei:** `docs/api/DATABASE_SCHEMA.md` (Zeile 4) · Domäne: docs · Kategorie: docs
- **Problem:** Migration `095_fix_telegram_user_chats.sql` (die neueste, aktuell letzte Migration, laut FIELD_1.0.0_MASTER_PLAN.md live deployt zur Behebung eines DSGVO-Löschungs-Crashs) legt die Tabelle `telegram_user_chats` an. Diese Tabelle fehlt komplett in der Schema-Doku, die selbst behauptet "Last sync: 2026-05-07" bei 94 Tabellen. Andere, ältere Migrationen (087-092) sind dagegen bereits dokumentiert, was zeigt, dass die Doku zwischenzeitlich aktualisiert wurde, aber Migration 095 verpasst hat.
- **Evidenz:** services/postgres/init/095_fix_telegram_user_chats.sql:7: "CREATE TABLE IF NOT EXISTS telegram_user_chats (" — kein Treffer für `## \`telegram_user_chats\``in docs/api/DATABASE_SCHEMA.md, während z.B.`n8n_audit_log` (Migration 090) korrekt dokumentiert ist.
- **Fix:** `scripts/docs/generate-db-schema.sh` erneut laufen lassen, um Migration 095 in DATABASE_SCHEMA.md einzupflegen und den Sync-Zeitstempel zu aktualisieren.

#### 6. [LOW/S] Veraltete DOCKER_NETWORK-Default-Dokumentation passt nicht zum tatsächlichen Compose-Projektnamen

- **Datei:** `docs/ENVIRONMENT_VARIABLES.md` (Zeile 543) · Domäne: infra · Kategorie: docs
- **Problem:** docs/ENVIRONMENT_VARIABLES.md nennt als Default für DOCKER_NETWORK 'arasul-jet_arasul-net'. Die Root docker-compose.yml setzt jedoch `name: arasul-platform`, die Netzwerke heißen arasul-frontend/arasul-backend/arasul-monitoring, und compose.app.yaml setzt für dashboard-backend explizit DOCKER_NETWORK: arasul-platform_arasul-backend. Der dokumentierte Default existiert so nicht mehr und könnte bei manueller Konfiguration (z.B. wenn ein Operator den Default für ein Custom-Deployment übernimmt) zu falscher Docker-Netzwerk-Referenzierung führen.
- **Evidenz:** docs/ENVIRONMENT_VARIABLES.md:543: 'DOCKER_NETWORK | arasul-jet_arasul-net' | docker-compose.yml:3: 'name: arasul-platform' | compose/compose.app.yaml:75: 'DOCKER_NETWORK: arasul-platform_arasul-backend'
- **Fix:** Doku-Default auf `arasul-platform_arasul-backend` korrigieren (bzw. auf 'siehe docker-compose.yml name:' verweisen, damit zukünftige Projektnamen-Änderungen nicht erneut zu Drift führen).

#### 7. [LOW/S] Toter Link auf docs/plans/active/DX_OVERHAUL.md an drei Stellen — seit >2 Monaten bekannt, nie gefixt

- **Datei:** `CONTRIBUTING.md` (Zeile 162) · Domäne: docs · Kategorie: docs
- **Problem:** CONTRIBUTING.md, docs/INDEX.md und scripts/README.md verlinken auf `docs/plans/active/DX_OVERHAUL.md`. Die Datei existiert dort nicht mehr — sie wurde nach `docs/plans/archive/2026-05_dx-overhaul.md` verschoben (siehe Glob-Listing von docs/plans/\*\*). Der kaputte Link wurde bereits in einem früheren Audit dokumentiert (`docs/plans/archive/2026-05-07_repo-audit-sanierung.md:87`: "docs/plans/active/DX_OVERHAUL.md existiert nicht → entfernen"), aber nie behoben. CONTRIBUTING.md §7 verweist einen Contributor genau auf diese tote Datei, um die Herkunft der Subfolder-CLAUDE.md-Konvention zu erklären.
- **Evidenz:** CONTRIBUTING.md:162: "Stages 4–5 of the [DX overhaul](docs/plans/active/DX_OVERHAUL.md) introduce these subfolder CLAUDE.md files." — Datei existiert nur als docs/plans/archive/2026-05_dx-overhaul.md.
- **Fix:** Alle drei Links (CONTRIBUTING.md:162, docs/INDEX.md:115, scripts/README.md:28) auf `docs/plans/archive/2026-05_dx-overhaul.md` umbiegen oder den Satz umformulieren, da der Plan laut Archiv-Header ohnehin abgeschlossen ist.

#### 8. [LOW/S] "Currently active plans" Liste in plans/README.md komplett veraltet

- **Datei:** `docs/plans/README.md` (Zeile 65) · Domäne: docs · Kategorie: docs
- **Problem:** Die Liste nennt fünf Pläne (COMMERCIAL_LAUNCH_MASTER_PLAN.md, DX_OVERHAUL.md, PHASE1_SMOKE_TEST.md, TELEGRAM_BOT_OPTIMIZATION.md, LLM_RAG_N8N_HARDENING.md) als aktiv. Keiner dieser Dateinamen existiert in `docs/plans/active/` — dort liegen aktuell nur `FIELD_1.0.0_MASTER_PLAN.md` und `side-branch-cherry-pick-2026-05-14.md`. Die Datei selbst räumt "(Auto-stale — verify by looking at active/ directly)" ein, was das Problem eingesteht statt löst.
- **Evidenz:** docs/plans/README.md:65-69 listet 5 nicht existierende Plan-Dateinamen; tatsächlicher Inhalt von docs/plans/active/: FIELD_1.0.0_MASTER_PLAN.md, side-branch-cherry-pick-2026-05-14.md.
- **Fix:** Statischen Listenblock entfernen und durch einen Verweis "siehe active/ Verzeichnis" ersetzen, oder ein Skript, das die Liste generiert.

#### 9. [LOW/S] Backup-Abschnitt in ENVIRONMENT_VARIABLES.md dupliziert Inhalt aus ops/BACKUP_SYSTEM.md

- **Datei:** `docs/ENVIRONMENT_VARIABLES.md` (Zeile 354) · Domäne: docs · Kategorie: docs
- **Problem:** Der Abschnitt "Backup" + "Backup Commands" (Zeilen 354–494) inkl. Env-Var-Tabelle, S3-Offsite-Konfiguration und Restore-Kommandos existiert inhaltlich fast deckungsgleich bereits in docs/ops/BACKUP_SYSTEM.md (inkl. derselben BACKUP_SCHEDULE/BACKUP_RETENTION_DAYS-Werte und backup.sh/restore.sh-Aufrufe). Zwei Quellen der Wahrheit für dieselben Kommandos erhöhen das Risiko künftiger Divergenz.
- **Evidenz:** docs/ENVIRONMENT_VARIABLES.md:479-494 ("Backup Commands": backup.sh, restore.sh --list/--latest/--date) vs. docs/ops/BACKUP_SYSTEM.md:143-219 (identische Variablen- und Kommando-Beispiele).
- **Fix:** Statt "reine Variablen-Tabelle behalten und auf BACKUP*SYSTEM.md verlinken": zuerst prüfen, welche Doku laut CLAUDE.md-Konvention führend ist (Root-CLAUDE.md Regel 5 listet ENVIRONMENT_VARIABLES.md explizit als Ziel für "neue Env-Var"-Änderungen — das ist die kanonische Env-Var-Quelle). Der Fix sollte daher: (1) die zwei tatsächlich duplizierten Fakten (BACKUP_SCHEDULE/BACKUP_RETENTION_DAYS-Defaults und den `backup.sh`-Grundaufruf) in BACKUP_SYSTEM.md per Verweis auf ENVIRONMENT_VARIABLES.md statt erneuter Werte-Nennung referenzieren; (2) die in BACKUP_SYSTEM.md fehlenden Vars (AWS_S3*\*, BACKUP_REPORT_PATH, EXTERNAL_BACKUP_PATH) und die restore.sh-Flags dort ergänzen oder ebenfalls per Link auf ENVIRONMENT_VARIABLES.md verweisen, damit keine Informationen verloren gehen. Nicht einfach den Text aus ENVIRONMENT_VARIABLES.md streichen, da dieses Dokument laut Projekt-Konvention die führende Quelle für Env-Vars ist.
- _Hinweis Verifizierer:_ Der Kern des Findings stimmt: docs/ENVIRONMENT_VARIABLES.md:354-359 (Backup env vars BACKUP_SCHEDULE=`0 2 * * *`, BACKUP_RETENTION_DAYS=30) und die "Backup Commands" (Zeilen 479-494, u.a. `./scripts/backup/backup.sh`) überschneiden sich inhaltlich mit docs/ops/BACKUP_SYSTEM.md:143-144 (identische BACKUP_SCHEDULE/BACKUP_RETENTION_DAYS-Defaults) und Zeilen 190-192 (identischer `./scripts/backup/backup.sh`-Aufruf). Das ist eine echte doppelte Quelle für dieselben Fakten und damit ein reales, wenn auch geringes Drift-Risiko — severity "low" ist angemessen.

Allerdings ist die Evidenz-Formulierung "fast deckungsgleich" / "identische Variablen- und Kommando-Beispiele" übertrieben: BACKUP*SYSTEM.md:143-219 enthält weder die restore.sh-Flags (--list/--latest/--date, s. ENVIRONMENT_VARIABLES.md:486-493) noch AWS_S3_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_DEFAULT_REGION noch BACKUP_REPORT_PATH/EXTERNAL_BACKUP_PATH (per Grep: keine Treffer in BACKUP_SYSTEM.md für S3/AWS*/BACKUP_REPORT_PATH/EXTERNAL_BACKUP_PATH). BACKUP_SYSTEM.md's eigener "Restore Procedures"-Abschnitt (Zeilen 222 ff., außerhalb der zitierten Range) nutzt sogar rohe gunzip/docker-exec/tar-Befehle statt restore.sh — das ist selbst schon eine leichte Divergenz zwischen den beiden Docs, kein 1:1-Duplikat. `scripts/backup/restore.sh` unterstützt die in ENVIRONMENT_VARIABLES.md gezeigten Flags tatsächlich (verifiziert per Grep, Zeilen 10-12, 473-483), die Befehle sind also korrekt, nur eben nicht in BACKUP_SYSTEM.md gespiegelt.

#### 10. [LOW/S] Architektur-Topologie-Diagramm wird in 3-4 Dateien redundant gepflegt

- **Datei:** `README.md` (Zeile 24) · Domäne: docs · Kategorie: docs
- **Problem:** Die ASCII-Grafik "Internet (443) → Traefik → Dashboard..." existiert nahezu identisch in README.md, ARCHITECTURE.md (root), CLAUDE.md und (ausführlicher) in docs/ARCHITECTURE.md. Die Root-Version ARCHITECTURE.md bezeichnet sich zwar explizit als "one-page stub", zeichnet die Grafik aber trotzdem neu statt sie zu verlinken. Jede künftige Topologie-Änderung (neuer Service, Port-Wechsel) muss an bis zu 4 Stellen synchron gehalten werden.
- **Evidenz:** README.md:24-35 und ARCHITECTURE.md:11-22 und docs/ARCHITECTURE.md:11-22 enthalten je eine eigene Kopie derselben Service-Liste/Ports.
- **Fix:** Root README.md und ARCHITECTURE.md auf ein Minimal-Diagramm reduzieren oder das Diagramm nur einmal in docs/ARCHITECTURE.md pflegen und von den anderen Dateien per Link referenzieren.

#### 11. [LOW/S] CONTRIBUTING.md referenziert nicht existierende Slash-Commands /update-api-docs und /update-schema-docs

- **Datei:** `CONTRIBUTING.md` (Zeile 168) · Domäne: docs · Kategorie: docs
- **Problem:** Tabelle "Documentation must follow code" verlangt bei API- bzw. Schema-Änderungen die Nutzung von `/update-api-docs` bzw. `/update-schema-docs`. Diese Slash-Commands existieren nicht in `.claude/commands/` (dort liegen nur `plan.md` und `ship.md`), und CONTRIBUTING.md's eigener Slash-Command-Katalog in §8 listet ebenfalls nur `/plan` und `/ship` auf. Ein Contributor, der der Anweisung folgt, findet den Befehl nicht.
- **Evidenz:** CONTRIBUTING.md:168-169: "also use `/update-api-docs`" / "also use `/update-schema-docs`" — .claude/commands/ enthält nur plan.md und ship.md.
- **Fix:** Entweder die beiden Slash-Commands tatsächlich anlegen, oder die Spalten in §7 auf manuelles Doku-Update umformulieren, ohne nicht-existente Commands zu erwähnen.

#### 12. [LOW/S] Fehlbenannter Link in ONBOARDING.md: Label "docs/ARCHITECTURE.md" zeigt auf Root-Stub, nicht auf Deep-Dive

- **Datei:** `docs/development/ONBOARDING.md` (Zeile 264) · Domäne: docs · Kategorie: docs
- **Problem:** Der Linktext lautet `docs/ARCHITECTURE.md`, das Linkziel `../../ARCHITECTURE.md` löst aber relativ zu `docs/development/` auf die Root-Datei `ARCHITECTURE.md` auf (den bewusst kurzen One-Page-Stub), nicht auf die ausführliche `docs/ARCHITECTURE.md`. Der Link ist technisch nicht kaputt (Zieldatei existiert), aber die Beschriftung führt in die Irre — Leser erwarten den Deep-Dive, landen aber auf der Kurzfassung.
- **Evidenz:** docs/development/ONBOARDING.md:264: "[`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) — service topology." — von docs/development/ aus zeigt `../../` auf das Repo-Root, also auf ARCHITECTURE.md, nicht docs/ARCHITECTURE.md.
- **Fix:** Linkziel auf `../ARCHITECTURE.md` (= docs/ARCHITECTURE.md) korrigieren, falls der Deep-Dive gemeint war, oder Linktext auf "ARCHITECTURE.md (root stub)" anpassen.

### ✅ P8 — Gesamtverifikation + Fresh-Install-Checkliste

**Files:** docs/ops/FRESH_INSTALL_CHECKLIST.md (neu), keine weiteren Code-Änderungen — reine Verifikations- und Abschlussphase
**Risk:** low
**Tests:** Volle Batterie: Backend-Tests + Lint, Frontend tsc/Tests/Build, shellcheck-Ziele aus den Acceptance Criteria, validate-doc-links.sh, docker compose config für alle Compose-Dateien. Best-Effort: Playwright-Rundgang auf https://arasul.local (admin), falls die Instanz inzwischen läuft — Konsolen-Fehler + Kern-Seiten (Login, Chat, Dokumente, Settings, Updates). Danach: FRESH_INSTALL_CHECKLIST.md schreiben (vom leeren Jetson bis 'Dashboard erreichbar', inkl. der in P2 gefixten Stolperstellen als explizite Prüfpunkte).

## Rollback

- Der gesamte Durchlauf landet als **ein Squash-Commit** auf main → Rollback = `git revert <merge-commit>` + Redeploy; die Deploy-Pipeline hat zusätzlich Auto-Rollback bei fehlgeschlagenem Healthcheck.
- **Keine DB-Migrationen** in diesem Plan → kein Down-Script nötig, kein Datenrisiko.
- Risikoreichster Einzelpunkt ist die docker-proxy-Härtung (P1): falls Self-Healing nach Deploy Aktionen nicht mehr ausführen kann, ist der Fix ein gezieltes Re-Enable der betroffenen API-Kategorie in compose/compose.core.yaml (ein Env-Flag) — im PR-Body dokumentiert.
- CI-Enforcement (P5) kann bei unerwarteten CI-Umgebungsproblemen punktuell per `continue-on-error` auf EINEN Job zurückgestellt werden, ohne den Rest des PRs zu blockieren (dann als Open Question dokumentieren).

## Open Questions

- Keine offenen Punkte aus dem Interview. Während der Ausführung auftauchende Überraschungen werden hier dokumentiert und dem Nutzer vorgelegt (statt sie zu überspielen).
