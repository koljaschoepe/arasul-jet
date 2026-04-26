# Auth & Session — Funktionale Findings

## MAJORS (funktional, nicht Security)

### F1: WebSocket-Session-Expiry nicht geprüft

- `apps/dashboard-backend/src/index.js:577-610`
- Token-Verifikation nur beim Upgrade — danach läuft Connection weiter, auch wenn Token abläuft oder User sich ausloggt
- Betrifft: Metrics-Stream (:353, 5s), Sandbox-Terminal, Telegram-WS
- Fix: Periodische Revalidation (60s) oder bei jedem Send

### F2: Token-Expiry-Warnung wird nicht angezeigt

- `apps/dashboard-frontend/src/contexts/AuthContext.tsx:149-177`
- Custom-Event `arasul:token-expiring` wird dispatched — aber KEIN Consumer implementiert
- User fliegt ohne Warnung raus → verlorene Chat-Inputs/Uploads
- Fix: TokenExpiryWarning-Component mit Modal "Sitzung läuft ab"

### F3: Active-Sessions-UI fehlt komplett

- Backend: `GET /api/auth/sessions` vorhanden (auth.js:280-300) — liefert JTI, IP, UA
- Frontend: Keine UI — User sieht nicht welche Geräte eingeloggt sind, kann keine einzeln widerrufen
- Fix: Settings → Sicherheit → "Aktive Sitzungen" mit Revoke-Button

### F4: Session-Cleanup-Job fehlt

- `cleanupExpiredAuth()` existiert (jwt.js:264-271)
- Aber kein Background-Job ruft es auf
- `active_sessions` + `token_blacklist` wachsen unbegrenzt
- Fix: Nightly-Cron in sessionCleanupService.js

## MINORS

### F5: Password-Change Auto-Logout race

- `features/settings/PasswordManagement.tsx:194-200`
- Nach dashboard-password change: 2s Delay → Redirect "/", aber kein explizites logout()
- Fix: `logout()` vor redirect

### F6: RemoteAccessSettings nutzt sessionStorage statt Context

- `features/settings/RemoteAccessSettings.tsx:62-79`
- Stale-Cache bei API-Fehler

### F7: Logout abortet nicht in-flight-Requests

- useApi.ts fehlt AbortController-Cleanup bei 401/logout

## FEHLENDE FEATURES (Frontend-UI fehlt, Backend ready)

- User-Management-UI (Admin-CRUD für Benutzer)
- Token-Refresh-Endpoint (POST /auth/refresh)
- 2FA/MFA — nicht implementiert
- Password-Reset-Flow — nicht implementiert
- Rollensystem nur "admin" — keine feineren Permissions

## OK / FUNKTIONIERT

- Login-Flow (JWT + DB-Session + Cookie)
- Logout (Blacklist + Session-Delete + Cookie-Clear)
- Logout-All (alle Sessions widerrufen)
- Session-Persistenz über Container-Restart (DB-backed)
- 401-Handling (useApi.ts:169 → AuthContext.logout)
- Cross-Tab-Sync (localStorage-Event → Logout)
- requireAuth / requireAdmin Middleware
- CSRF-Token-Handling (generiert, gesendet)
