# Einstellungen — Audit, Konsolidierung (9→6 Reiter) & Härtung

> Vollständige Überarbeitung des Einstellungsbereichs: 9 Reiter auf 6 konsolidieren,
> jeden Reiter funktional + zuverlässig machen, konsistente UX (Loading/Error/Empty,
> Toasts, Confirm-Dialoge), den bekannten Tailscale-Live-Bug beheben, und alles per
> Vitest + bestehender Playwright-E2E-Suite absichern und live auf dem Jetson verifizieren.

Basis: 10 parallele Research-Agenten (je Reiter + Shell + Cross-Cutting). Alle Befunde
unten sind mit `file:line` belegt.

---

## Goal & Success Criteria

**Done heißt:**

- Der Einstellungsbereich hat **6 statt 9 Reiter**: `Allgemein · KI · Sicherheit · Datenschutz · System · Fernzugriff`.
  - **KI** = Zusammenlegung von KI-Profil + RAG & LLM (2 Unterbereiche).
  - **System** = Zusammenlegung von Services + Updates + Self-Healing (3 Unterbereiche).
- **Jeder** Reiter lädt, zeigt Daten, speichert und meldet Erfolg/Fehler **konsistent** (einheitliches Loading→Error→Empty→Content-Muster, `<Button loading>`, Toast bei Erfolg, App-Dialog statt `window.confirm`/`window.prompt`).
- Der **Fernzugriff/Tailscale-Reiter funktioniert wieder** auf dem Gerät (kein falsches `installed:false` mehr, Zugriffskarte sichtbar).
- **Passwort ändern** (Dashboard + MinIO) funktioniert nachweislich live (real getestet, danach zurückgesetzt); der Recovery-Pfad (CLI) ist im Reiter dokumentiert.
- Bekannte Korrektheits-Bugs behoben (siehe Phasen): verschluckter `logout-all`-Fehler, toter Fehler-Branch bei Services, Access-Mismatch bei Datenschutz, englische Datumsangaben bei Self-Healing, verworfene Feld-Validierungsfehler, u.a.
- **Kaputter Deep-Link** `/settings?tab=…` (SystemHealthWidget) funktioniert.
- Vitest-Tests grün und an 6-Reiter-Struktur angepasst; `e2e/settings.spec.ts` erweitert; **Live-Playwright-Verifikation auf `https://192.168.0.197`** dokumentiert.

**User sieht/kann danach:** einen aufgeräumteren, schnell überschaubaren Einstellungsbereich, in dem wirklich jeder Reiter zuverlässig tut, was er soll — inkl. wieder funktionierendem Fernzugriff.

---

## Scope

**In scope**

- Frontend-Reorg `apps/dashboard-frontend/src/features/settings/` (+ `features/system/`) auf 6 Reiter mit Sub-Navigation für KI und System.
- Query-Param-Deep-Linking (`?tab=…`) im Settings-Shell + Fix der 2 SystemHealthWidget-Links.
- Konsistenz-Layer: `DataStateRenderer`, `<Button loading>`, `useConfirm`, einheitliche Toast-Erfolgsmeldung.
- Gezielte **Full-Stack-Korrektheitsfixes** (Frontend + Backend im Rahmen der Einstellungen), Backend nur mit `asyncHandler` + Custom-Errors aus `utils/errors.js`.
- Tailscale-Detection-Fix (`runOnHost` pull-before-create) inkl. Frontend-Resilienz.
- Tests (Vitest + bestehende Playwright-Suite erweitern) + Docs (API_REFERENCE, ADMIN_HANDBUCH).

**Out of scope** (dokumentieren, nicht bauen)

- Neues „Passwort vergessen"-Self-Service (E-Mail/Token) — Appliance hat keinen Mailversand; Recovery bleibt CLI (`scripts/security/reset-password.sh`), wird nur im Reiter verlinkt/erklärt.
- MinIO-Objekt-Löschung beim GDPR-Delete (dokumentierte „Phase 5.7"-Lücke, größerer Eigenumfang).
- OTA-Update-Flow (`/update/check` + `/update/download`) im UI verdrahten (ungenutzte Backend-Endpoints bleiben ungenutzt).
- n8n-Passwortänderung im UI verdrahten (bleibt statische Info-Box).
- Umbau von Rate-Limit-State auf persistenten Store; hand-rolled YAML-Parser durch echte Lib ersetzen.
- Neues E2E-Framework — **bestehende** Playwright-Suite (`playwright.config.ts` + `e2e/`) wird erweitert (siehe Abweichung unten).

**Abweichung vom Interview (bewusst, per Blocker-Protokoll adoptiert):** Im Interview wurde „Playwright-E2E ins Repo" gewählt in der Annahme, es sei neue Infrastruktur. Research zeigt: eine **permanente** Playwright-Suite existiert bereits (`apps/dashboard-frontend/playwright.config.ts`, `e2e/settings.spec.ts` + 8 weitere Specs, ARM64/Jetson-tauglich, `E2E_BASE_URL`). Wir **erweitern** diese statt neu aufzusetzen — geringeres Risiko, kein CI-Umbau. Frontend-CI (lint/tsc/vitest/E2E) bleibt **advisory-only** (darf Auto-Merge nicht blockieren).

---

## Acceptance Criteria

1. Settings zeigt exakt 6 Reiter in der Reihenfolge `Allgemein · KI · Sicherheit · Datenschutz · System · Fernzugriff`; keine Referenz auf alte Reiter-Ids (`ai-profile`, `rag-llm`, `services`, `updates`, `selfhealing`) bleibt tot.
2. `?tab=system` (o.ä.) öffnet den korrekten Reiter; die beiden `SystemHealthWidget`-Links landen im richtigen Reiter.
3. KI-Reiter: Firmen-/Kontext- + RAG/LLM-Bereiche laden, speichern, melden Erfolg via Toast; leerer Firmenname wird als Validierungsfehler angezeigt (kein stilles `'Unbekannt'`); Backend-Feldfehler erscheinen feldnah statt als generischer Toast; Backend-Outage ≠ „kein Profil" (Error-State mit Retry).
4. Sicherheit: „Abmelden" + „Von allen Geräten abmelden" haben Confirm-Dialog; `logout-all`-Serverfehler wird dem User gemeldet (nicht verschluckt); Passwort ändern (Dashboard/MinIO) live erfolgreich getestet + zurückgesetzt; Recovery-Hinweis sichtbar.
5. Datenschutz: Export & Löschen konsistent gegated; type-to-confirm nutzt App-Dialog (kein `window.prompt`); 403/Timeout beim Export wird verständlich gemeldet.
6. System-Reiter: 3 Unterbereiche, je eigene `ComponentErrorBoundary`, kein doppeltes `<h1>`; Services hat manuellen Refresh + Self-Restart-Warnhinweis für `dashboard-backend`/`-frontend`; Self-Healing zeigt deutsche Relativ-Daten; Updates zeigt „Verbindung verloren, erneut versuchen"-Zustand während Apply.
7. Fernzugriff: Auf dem Gerät meldet `/api/tailscale/status` korrekt `installed:true`, die Zugriffskarte ist sichtbar; „Image fehlt" wird als eigener Fehler behandelt, nicht als `installed:false`.
8. Vitest: alle Settings-Tests grün und an 6 Reiter angepasst; `e2e/settings.spec.ts` deckt die 6 Reiter ab.
9. Live-Verifikation auf `https://192.168.0.197` durchgeführt und im PR dokumentiert (Screenshots/Notizen).
10. Docs aktualisiert: `API_REFERENCE.md` (company-context-Endpoints), `ADMIN_HANDBUCH.md` (6-Reiter-Layout).

---

## Phasen

Jede Phase lässt das System lauffähig. Reihenfolge ist bewusst: erst Struktur (P0), dann Konsistenz (P1), dann der höchstwertige Live-Bug (P2), dann Reiter-Korrektheit (P3–P5), dann Tests/Docs (P6–P7), dann Live-Verifikation (P8).

### ✅ P0 — Settings-Shell: Konsolidierung 9→6 + Deep-Linking

**Files:** `apps/dashboard-frontend/src/features/settings/Settings.tsx`, neue Wrapper `KISettings.tsx` + `SystemSettings.tsx` (in `features/settings/`), `apps/dashboard-frontend/src/features/dashboard/SystemHealthWidget.tsx`
**Risk:** medium — zentrale Navigation; `isDirty`-Verdrahtung und Error-Boundaries müssen erhalten bleiben.
**Inhalt:**

- `sections`-Array (`Settings.tsx:41-96`) auf 6 Einträge reduzieren: `general · ki · security · privacy · system · remote-access`.
- **KI-Wrapper** (`KISettings.tsx`): interne Sub-Nav (2 Segmente „Firmenprofil & Kontext" / „RAG & LLM"), rendert `AIProfileSettings` + `RagLlmSettings`, jede in eigener `ComponentErrorBoundary`; **beide** `onDirtyChange` in ein kombiniertes Dirty-Signal an das Shell durchreichen (sonst verliert der Guard eine Hälfte — `Settings.tsx:101,104-110`).
- **System-Wrapper** (`SystemSettings.tsx`): interne Sub-Nav (3 Segmente „Services"/„Updates"/„Self-Healing"), rendert `ServicesSettings` + `UpdatePage` + `SelfHealingEvents`, je eigene `ComponentErrorBoundary`; verschachtelte `<h1>` der Kinder auf Sub-Heading (`text-xl`) reduzieren.
  - **Abweichung (bewusst, nach Code-Review):** Sub-Sections werden **eager** importiert statt via `React.lazy`. Die gesamte Settings-Route ist bereits auf App-Ebene lazy-geladen (`App.tsx`), ein zweites Lazy-Splitting bringt kaum Nutzen bei zusätzlichem Suspense-Boilerplate; bei KI müssen zudem beide Kinder gleichzeitig gemountet bleiben (Dirty-Tracking).
- **Deep-Linking:** `activeSection` mit `?tab=`-Query synchronisieren (lesen beim Mount, `history.replaceState`/`setSearchParams` beim Wechsel). Default `general`. Damit wird der heute tote Link `/settings?tab=selfhealing` repariert.
- `SystemHealthWidget.tsx:178,229`: `to="/settings?tab=selfhealing"` → `?tab=system` (+ optional Sub-Anker).
- `ServicesSettings.tsx` nach `features/system/` verschieben (Konsistenz mit `UpdatePage`/`SelfHealingEvents`); Import-Pfade anpassen.
  **Tests (Phase-scoped):** `features/settings/__tests__/Settings.test.tsx`, `src/__tests__/integration/settings.test.tsx` müssen weiterhin bauen (werden in P6 auf 6 Reiter aktualisiert — hier nur nicht schlechter machen).

### ✅ P1 — Konsistenz-Layer (Übersichtlichkeit & UX)

**Files:** alle 7 Settings-Komponenten + `Settings.tsx`
**Risk:** low–medium — additiv, pro Reiter isoliert.
**Inhalt:**

- **Erfolgs-Feedback vereinheitlichen** auf `toast.success` (heute Mix: `AIProfileSettings.tsx:270,440-447` Inline-`Alert` vs. `RemoteAccessSettings.tsx:195` `toast.success`).
- **`<Button loading>`** (existiert seit 4c09655, `components/ui/shadcn/button.tsx:57-88`) statt manuellem `'Speichern...'`-String (`AIProfileSettings.tsx:457-466`, `RagLlmSettings.tsx:408`).
- **`useConfirm`** statt `window.confirm` (Dirty-Guard `Settings.tsx:106`) und statt `window.prompt` (GDPR-Delete, siehe P4).
- **`DataStateRenderer`** (`components/ui/DataStateRenderer.tsx:55`) für Loading→Error(+Retry)→Empty→Content überall dort, wo heute hand-gerollte `SkeletonCard`-Logik steht (z.B. `GeneralSettings.tsx:24-48`). Kein Zwang zur 100%-Migration, aber KI/System/Datenschutz einheitlich.
- Keine Hex-Literale (Research: aktuell alle Settings-Dateien token-konform — beim Neubau beibehalten).
  **Tests:** bestehende Komponententests dürfen nicht brechen (Label/Text bleiben gleich).

### ✅ P2 — Fernzugriff/Tailscale: Detection-Bug beheben (höchster Live-Wert)

**Files:** `apps/dashboard-backend/src/services/network/tailscaleService.js`, ggf. `apps/dashboard-backend/src/services/app/containerService.js` (bestehendes `pullImage`), `apps/dashboard-frontend/src/features/settings/RemoteAccessSettings.tsx`
**Risk:** medium — device-spezifisch (Docker-Proxy/`runOnHost`), muss auf dem Jetson verifiziert werden.
**Root Cause (belegt):** `runOnHost()` (`tailscaleService.js:47-87`) ruft `docker.createContainer({Image:'alpine:latest'})` **ohne vorheriges `pull`**. Ist `alpine:latest` nicht im Host-Daemon gecached → 404 „No such image" → gefangen in `isInstalled()` (`:103-106`) → stilles `installed:false`. Tailscale läuft aber real (Host-Install via `scripts/setup/setup-tailscale.sh`), daher der Widerspruch aus der Memory.
**Inhalt:**

- In `runOnHost()` (oder einmal lazy vor Erstnutzung) `alpine:latest` **pullen** (bestehendes `containerService.pullImage`-Muster wiederverwenden) und Pull-Stream abwarten, dann `createContainer`.
- „Image fehlt" **distinkt** behandeln (`ServiceUnavailableError` / eigener Status) statt in `installed:false` zu kollabieren — Backend-Fehlerklassen-Konvention.
- Härtung: `alpine:latest` für den 5-Jahre-Offline-Betrieb ins Factory-Image vorbacken (`scripts/deploy/create-factory-image.sh`) — als Notiz/TODO umsetzen falls risikoarm, sonst dokumentieren.
- **Frontend-Resilienz** (`RemoteAccessSettings.tsx:121-136`): transienter Fetch-Fehler darf nicht denselben `emptyStatus` erzeugen wie „nicht installiert" (Step 1) — Detection-Fehler vs. echtes „nicht installiert" trennen; „So erreichst du Arasul"-Karte nicht komplett verstecken, wenn nur die Detection wackelt.
  **Tests:** Backend-Unit für `runOnHost` Pull-Pfad (Image fehlt → distinkter Fehler, nicht `false`), sofern mockbar; sonst Live-Verifikation P8.

### ✅ P3 — KI-Reiter: Korrektheit

**Files:** `AIProfileSettings.tsx`, Backend `apps/dashboard-backend/src/routes/admin/settings.js`, `schemas/admin-settings.js`, `apps/dashboard-backend/src/routes/ai/memory.js`
**Risk:** low–medium.
**Inhalt:**

- **Empty-State-Swallowing** (`AIProfileSettings.tsx:128-136`): Backend-Outage von „noch kein Profil" trennen (Error-State + Retry statt stiller Leerzustand).
- **Feld-Validierungsfehler surfacen:** `details.issues` aus `ValidationError` (heute verworfen) feldnah anzeigen statt generischem Toast.
- **`companyName || 'Unbekannt'`-Fallback** (`:237`) entfernen → leerer Firmenname = sichtbarer Validierungsfehler; Backend `CompanyContextBody` (`schemas/admin-settings.js:18-22`) ein `.min(1)` geben (heute akzeptiert es leeren String).
- **Permission-Mismatch** (`/memory/profile` = `requireAuth`, `/settings/company-context` = `requireAdmin`): auf ein Modell vereinheitlichen (Empfehlung: beide `requireAdmin`, da Settings admin-only) und Teil-Speicher-Fehler (`Promise.all`, `:224-268`) sauber behandeln, damit kein halber Serverschreibvorgang unrolled zurückbleibt.
- **Redundanter synchroner `getEmbedding`-Call** beim Speichern (`settings.js:362`, Embedding heute ungenutzt) → non-blocking/fire-and-forget oder entfernen (spart ~bis-zu-Timeout pro Save).
- **API-Docs:** `GET/PUT /api/settings/company-context` in `docs/api/API_REFERENCE.md` ergänzen (fehlt komplett).
  **Tests:** neue/erweiterte Vitest für leeren Firmennamen + Error-vs-Empty; Backend bleibt asyncHandler/Zod-konform.

### ✅ P4 — Sicherheit & Datenschutz: Korrektheit

**Files:** `SecuritySettings.tsx`, `PasswordManagement.tsx`, `PrivacySettings.tsx`, `Settings.tsx` (`handleLogoutAll`), Backend `routes/auth.js`, `routes/admin/gdpr.js`
**Risk:** medium — auth-nah, vorsichtig.
**Inhalt (Sicherheit):**

- **Confirm-Dialog** für „Abmelden" und „Von allen Geräten abmelden" (heute keiner; `useConfirm` bereits im Ordner genutzt).
- **`logout-all`-Fehler nicht verschlucken** (`Settings.tsx:116-118`): Serverfehler dem User melden, dann lokal abmelden.
- **Doppelter Endpoint** `POST /auth/change-password` (`auth.js:299`) vs. `/settings/password/dashboard`: den ungenutzten entfernen oder als deprecated dokumentieren (Drift-Risiko).
- **Client-Max-Length** (500) spiegeln (heute nur Backend).
- **Recovery-Hinweis** im Reiter: „Passwort vergessen? → Operator/CLI (`scripts/security/reset-password.sh`)" — kein neuer Self-Service-Flow (out of scope).
- MinIO/n8n `.env`-Schreibvorgang ohne Rollback (`settings.js`): mindestens Warnung/Doku; echter Rollback optional.
  **Inhalt (Datenschutz):**
- **Access-Mismatch** (`gdpr.js:25-26` Export=`requireAdmin`, `:334` Delete=`requireAuth`, Tab aber allen sichtbar): auf konsistentes Gate bringen. Empfehlung: Export bleibt admin-only (so dokumentiert), aber **Frontend meldet 403 verständlich** (`showError:false`-Swallow, `PrivacySettings.tsx:24-44`) und der eingeloggte Admin kann exportieren; Tab-Sichtbarkeit ggf. an Rolle koppeln. **(Kleine offene Entscheidung — Default umgesetzt, siehe Open Questions.)**
- **`window.prompt()`** type-to-confirm → App-Dialog (`useConfirm`/`ConfirmModal`), konsistent mit dem Dialog eine Zeile darüber.
- Export **nicht gestreamt** (`gdpr.js` `res.json`): großes Export kann 30s-Timeout treffen → Timeout/Fehler verständlich melden; echtes Streaming optional/out-of-scope.
  **Tests:** Vitest für logout-all-Fehlerpfad + GDPR-Dialog; Passwort-POST-Body-Test bleibt (`{currentPassword,newPassword}`).

### ✅ P5 — System-Reiter: Korrektheit (Services/Updates/Self-Healing)

**Files:** `features/system/ServicesSettings.tsx` (nach Verschieben), `features/system/UpdatePage.tsx`, `features/system/SelfHealingEvents.tsx`, `apps/dashboard-frontend/src/utils/formatting.ts`
**Risk:** low–medium.
**Inhalt:**

- **Services:** toten `data.message`-Fehler-Branch entfernen (`ServicesSettings.tsx:131` — Backend wirft immer, liefert nie `{success:false}`); **manuellen Refresh-Button** ergänzen (heute nur 15s-Poll); **Self-Restart-Warnung** im Confirm-Dialog für `dashboard-backend`/`dashboard-frontend` (`ALLOWED_SERVICES`, `services.js:34-35`) — Neustart killt die aktive Verbindung, generischer Dialog warnt heute nicht.
- **Updates:** Reconnect/Backoff-Zustand während `apply` (`UpdatePage.tsx:150-153`): „Verbindung verloren, Update läuft weiter — erneut verbinden…" statt stiller Poll-Fehler; Stale-`in_progress`-Guard/Hinweis (permanentes 409 ohne Force-Reset, `update.js:164`).
- **Self-Healing:** `formatRelativeDate` (`utils/formatting.ts:71-86`) liefert Englisch in deutscher UI → deutsche Relativ-Daten (bestehende i18n-Util oder lokalisierte Strings); optional server-seitiger Severity-Filter + „mehr laden" (Backend unterstützt `offset/severity`, `selfhealing.js`), sonst „zeigt letzte 50"-Hinweis (kein stilles Abschneiden).
  **Tests:** `features/system/__tests__/SelfHealingEvents.test.tsx` an deutsche Daten anpassen; Services-Refresh Vitest.

### ✅ P6 — Tests (Vitest + Playwright-Suite)

**Files:** `features/settings/__tests__/Settings.test.tsx`, `src/__tests__/integration/settings.test.tsx`, `features/settings/__tests__/RagLlmSettings.test.tsx`, `PasswordManagement.test.tsx`, `apps/dashboard-frontend/e2e/settings.spec.ts`
**Risk:** low — CI advisory.
**Inhalt:**

- `Settings.test.tsx`: auf **6 Reiter** umstellen (`Allgemein/KI/Sicherheit/Datenschutz/System/Fernzugriff`); alte Label-Klicks (`Services`/`Updates`/`Self-Healing` als Top-Level) → Sub-Nav; „alte Reiter sind weg"-Assertions (Muster existiert bereits, `:145-146`).
- Integration-Test analog (`settings.test.tsx:102-112,131-142`).
- `e2e/settings.spec.ts`: 6 Reiter durchklicken, KI/System Sub-Nav, Save→Toast; Regex-Assertions auf neue Struktur schärfen.
- Keine CI-Gate-Änderung (advisory bleibt advisory).

### ✅ P7 — Docs

**Files:** `docs/api/API_REFERENCE.md`, `docs/ops/ADMIN_HANDBUCH.md`, ggf. `docs/development/DESIGN_SYSTEM.md`, `docs/api/DATABASE_SCHEMA.md` (company_context prüfen)
**Risk:** low.
**Inhalt:** company-context-Endpoints dokumentieren; ADMIN_HANDBUCH von 9 auf 6 Reiter aktualisieren; neue UX-Muster (falls eingeführt) im Design-System notieren.

### P8 — Live-Verifikation auf dem Jetson (Playwright MCP, autonom)

**Files:** keine (Verifikation) — Ergebnisse in PR-Body + Screenshots.
**Risk:** medium — reales Gerät; destruktive Aktionen nur bis Dialog (außer Passwort real+revert).
**Inhalt (nach Deploy des Branches auf dem Gerät, siehe Memory „Jetson live browser testing"):**

- Login mit vom User gelieferten Zugangsdaten auf `https://192.168.0.197`.
- **Alle 6 Reiter** durchklicken; jeweils Laden/Speichern/Toast prüfen; KI+System Sub-Nav.
- **Passwort (Dashboard) real ändern → verifizieren → zurücksetzen**; MinIO-Passwortfeld-Flow (safe).
- **Destruktiv nur bis Dialog** (nicht bestätigen): Konto löschen, Service-Neustart, Logout-all, Tailscale trennen.
- **Fernzugriff:** bestätigen, dass `installed:true` erkannt wird und die Zugriffskarte sichtbar ist (Kern-Live-Bug).
- Console-/Network-Fehler einsammeln; Screenshots je Reiter. Report in den PR.

---

## Rollback

- Rein additive/UI-lastige Änderungen; kein DB-Migrationsschema geändert → **kein Down-Script nötig**.
- Backend-Änderungen (Tailscale-Pull, company-context `.min(1)`, Permission-Angleich, Embedding-Call) sind lokal begrenzt; Rollback = Revert des Commits/PRs.
- Deploy erfolgt pro geänderten Service; bei Health-Fail greift der bestehende Auto-Rollback des Self-Hosted-Deploys.
- Kein Feature-Flag nötig; die Reiter-Konsolidierung ist als Ganzes revertierbar.

## Open Questions

- **Datenschutz-Gate (klein, Default gesetzt):** Export bleibt admin-only (wie dokumentiert), Frontend meldet 403 klar und der eingeloggte Admin kann exportieren. Falls stattdessen Export für alle Auth-User freigegeben werden soll (Angleich an Delete=`requireAuth`), bitte kurz sagen — sonst wird der Admin-only-Default umgesetzt.
- Zugangsdaten für `https://192.168.0.197` werden für P8 benötigt (bereits im Chat angefragt).
