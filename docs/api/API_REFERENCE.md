# API Reference

Quick reference for all Dashboard Backend API endpoints.

**Base URL:** `http://host:8080/api` (via Traefik) or `http://host:3001/api` (direct)

## Authentication

All endpoints except `/api/health` and `/api/auth/login` require JWT authentication.

**Two authentication methods are supported:**

1. **Authorization Header (traditional):**

   ```
   Authorization: Bearer <token>
   ```

2. **HttpOnly Cookie (for LAN access):**

   ```
   Cookie: arasul_session=<token>
   ```

   The cookie is automatically set on login and enables session persistence when accessing via different IPs or hostnames in the same LAN.

Tokens expire after 24 hours (configurable via `JWT_EXPIRY`).

**Rollen (Phase C1, 27.08.2026).** Jeder Benutzer trägt in `admin_users.role`
eine von zwei Rollen: `admin` verwaltet Mitarbeiter, Apps, Freigaben, Modelle
und den Betrieb; `mitarbeiter` sieht seine freigegebenen Apps, Freigaben und
eigenen Flow-Läufe. Jede Route prüft mit `requireRole(...)`; alles, was nicht
Admin ist und nicht ausdrücklich Mitarbeiter, antwortet `403 FORBIDDEN`. In
den Tabellen unten gilt deshalb: **ohne Vermerk ist eine Route nur für den
Administrator**; Routen für beide Rollen sind mit „auch Mitarbeiter" markiert.
Die externe API (`/api/v1/external`, API-Schlüssel) ist davon unberührt.
Welche Route was prüft, listet `python3 scripts/test/rollenregeln.py --json`;
gegen das Gerät misst es `scripts/test/rollen-abnahme.sh`.

---

## Endpoints Overview

### Public (No Auth)

| Method | Endpoint          | Description                                                                                                           |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`     | Health check                                                                                                          |
| GET    | `/api/_meta`      | API surface (route groups, version, errorCodes)                                                                       |
| POST   | `/api/auth/login` | Login with username or e-mail + password (sets cookie); response carries `user.role` and `user.passwortWechselNoetig` |

**GET /api/\_meta:**

Returns a description of the live API surface — used by the frontend and
external clients to discover available route groups and the canonical
list of error codes. No auth required.

`version` is what a human should read, not a parseable number: without
`SYSTEM_VERSION` set it is the literal string `Vorserie` (see
`utils/version.js`). The same holds for `version` in `GET /api/health` and
`GET /api/system/info`.

Seit Phase C10 (27.08.2026) setzt der Bau diese Zahl: der Installer schreibt
sie aus `arasul-release.json` in die `.env`, der Deploy stempelt sie aus Git
(`scripts/lib/fassung.sh`). Ein Gerät, das noch `Vorserie` meldet, hat also
keine Fassung aus dem Bau bekommen, und es nimmt dann auch keine
Aktualisierung an (`validateManifest`).
Stand: 2026-08-27. Quelle: `apps/dashboard-backend/src/utils/version.js`.

```json
{
  "name": "arasul-dashboard-backend",
  "version": "Vorserie",
  "node": "v22.x.x",
  "uptimeSeconds": 12345,
  "routes": { "core": ["..."], "flows": ["..."], "system": ["..."], "...": [] },
  "errorCodes": ["VALIDATION_ERROR", "UNAUTHORIZED", "..."],
  "timestamp": "2026-..."
}
```

### Authentication

| Method | Endpoint                    | Description                                                       | Rate Limit    |
| ------ | --------------------------- | ----------------------------------------------------------------- | ------------- |
| GET    | `/api/auth/needs-setup`     | Public: is the box still without an admin?                        | 30/min        |
| POST   | `/api/auth/setup`           | Public, self-closing: create the FIRST admin                      | 10/15min      |
| POST   | `/api/auth/login`           | Login with username/password (sets cookie)                        | 10/15min      |
| GET    | `/api/auth/session`         | Public probe: 200 in both cases, `authenticated`                  | 120/min       |
| POST   | `/api/auth/logout`          | Logout (blacklists token, clears cookie) (auch Mitarbeiter)       | 30/min        |
| POST   | `/api/auth/logout-all`      | Invalidate all sessions for current user (auch Mitarbeiter)       | -             |
| POST   | `/api/auth/change-password` | Change own password (invalidates all sessions) (auch Mitarbeiter) | 3/15min, user |
| POST   | `/api/auth/refresh-cookie`  | Re-sync session cookie from Bearer token (auch Mitarbeiter)       | -             |
| GET    | `/api/auth/verify`          | Verify token (for Traefik forward-auth)                           | -             |
| GET    | `/api/auth/me`              | Get current user info (auch Mitarbeiter)                          | -             |
| GET    | `/api/auth/csrf`            | Re-mint the CSRF token cookie for this session (auch Mitarbeiter) | -             |
| GET    | `/api/auth/sessions`        | List active sessions for current user (auch Mitarbeiter)          | -             |

> Stand: 2026-08-20 · Quelle: `src/routes/auth.js`, `src/middleware/rateLimit.js`
>
> Beim Eintragen von `/api/auth/session` (Plan 023 C3) gegengeprüft: drei
> Angaben in dieser Tabelle waren falsch. `logout` steht auf 30 **pro Minute**,
> nicht 30 pro 15 Minuten, und `logout-all` und `refresh-cookie` haben
> überhaupt keinen Limiter. `change-password` zählt je Nutzer, nicht je IP.
> Alle Werte oben stammen jetzt aus dem Code, nicht aus dem vorigen Stand
> dieser Datei.

**GET /api/auth/session:**

Der Prüfpunkt für „gibt es hier eine Sitzung". Antwortet in **beiden** Fällen
mit 200, nie mit 401:

```json
{ "authenticated": false, "user": null, "timestamp": "2026-..." }
```

Damit die Oberfläche das bei jedem Seitenaufruf fragen kann, ohne dass der
Browser für eine 401 eine Fehlerzeile in die Konsole schreibt (Befund F-02).
Erkennt sowohl den `Authorization: Bearer`-Kopf als auch das
`httpOnly`-Sitzungscookie `arasul_session`. `/api/auth/me` bleibt die
geschützte Route und antwortet ohne Sitzung weiter mit 401.

**`user.passwortWechselNoetig` (Phase D1):**

`/api/auth/login`, `/api/auth/me` und `/api/auth/session` tragen im
`user`-Objekt zusätzlich `passwortWechselNoetig: boolean`. `true` heißt: das
aktuelle Passwort hat **jemand anderes** gesetzt — der Administrator über
`PUT /api/benutzer/:id/passwort`, beim Anlegen des Kontos, oder der Bootstrap
eines frischen Geräts. Die Oberfläche verlangt dann den Wechsel, bevor sie die
Shell zeigt.

Das **Backend sperrt deswegen nichts.** Es sagt, was der Fall ist; eine Sperre
dort müsste jeden Weg einzeln kennen, und der eine Weg, den sie offenlassen
müsste, ist ausgerechnet `POST /api/auth/change-password`. Genau dieser Aufruf
setzt das Kennzeichen zurück (`admin_users.passwort_vom_admin`, Migration 178)
und beendet als einziger alle Sitzungen des Betroffenen — der Wechsel führt
also immer über eine neue Anmeldung.

**POST /api/auth/logout-all:**

Invalidates every active session for the current user by blacklisting all their tokens. Use this when a device is lost or a security incident is suspected. Auth required.

```json
// Response
{
  "success": true,
  "message": "Logged out from all sessions successfully",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/auth/change-password:**

Changes the current user's own password. All existing sessions are invalidated afterward — the user must log in again with the new password.

```json
// Request
{
  "currentPassword": "current-password",
  "newPassword": "new-password"
}

// Response
{
  "success": true,
  "message": "Password changed successfully. Please log in again with your new password.",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/auth/refresh-cookie:**

Re-syncs the `arasul_session` HttpOnly cookie from the current Bearer token. The frontend calls this right before navigating to a Traefik forward-auth-gated route when the user may have logged in under a different hostname and the cookie is missing for the current origin.

```json
// Response
{
  "success": true,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/auth/csrf:**

Mints a fresh CSRF token, sets it as the non-HttpOnly `arasul_csrf` cookie (4 h, matching the session), and returns it in the body. The CSRF cookie is otherwise only created at login and rotated on state-changing requests; if it expires or is cleared while the session/Bearer auth is still valid, mutations fail with `403 CSRF_INVALID`. `useApi` calls this automatically to re-mint the token and retry the failed request exactly once — no re-login needed. Auth required.

```json
// Response
{
  "csrfToken": "…64-char hex…",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/auth/verify:**

Used by Traefik forward-auth middleware to protect gated routes (the Traefik dashboard).
Returns user info headers on success:

- `X-User-Id`: User ID
- `X-User-Name`: Username
- `X-User-Email`: Email (if set)

### System

| Method | Endpoint                        | Description                                 |
| ------ | ------------------------------- | ------------------------------------------- |
| GET    | `/api/system/status`            | System health (OK/WARNING/CRITICAL)         |
| GET    | `/api/system/info`              | Version, build hash, uptime                 |
| GET    | `/api/system/network`           | IP addresses, mDNS, connectivity            |
| GET    | `/api/system/thresholds`        | Device-specific metric thresholds           |
| GET    | `/api/system/heartbeat`         | Lebenszeichen, ohne Anmeldung               |
| GET    | `/api/system/ca-zertifikat`     | CA-Zertifikat des Geräts, als Datei         |
| GET    | `/api/system/diagnostics/quick` | Lagebild als JSON, ohne Archiv              |
| POST   | `/api/system/diagnostics`       | Diagnosearchiv erzeugen und ausliefern      |
| POST   | `/api/system/reload-config`     | Ratenbremse und Protokollstufe neu einlesen |

**GET /api/system/ca-zertifikat:**

Auth: Administrator. Liefert das CA-Zertifikat dieses Geräts als Datei
(`application/x-x509-ca-cert`, Dateiname `<netzname>-ca.crt`).

Wozu: das Gerät stellt sein TLS-Zertifikat selbst aus, mit einer CA, die beim
ersten Start entsteht und deren privater Schlüssel das Gerät nie verlässt
(`scripts/security/geraete-zertifikat.sh`). Solange niemand diese CA kennt,
warnt jeder Browser im Haus. Der Admin lädt die Datei einmal herunter und
verteilt sie an die Rechner der Firma; danach ist jeder Name dieses Geräts
vertraut, auch nach einer Erneuerung des Zertifikats. Die Anleitung für
Windows, macOS, iOS und Android steht in
[`docs/ops/NETZNAME_UND_ZERTIFIKAT.md`](../ops/NETZNAME_UND_ZERTIFIKAT.md).

`404`, wenn es noch keine CA gibt. Am Gerät nachholen: `./arasul zertifikat`.

Stand: 2026-08-27 (Phase C10). Quelle: `routes/system/system.js`.

**GET /api/system/heartbeat:**

Auth: keine. Der einzige Weg, ein Gerät von außen auf Leben zu prüfen, ohne
Anmeldung. Antwortet mit `status`, `uptime` (Sekunden seit dem Start des
Betriebssystems, nicht des Dienstes) und `timestamp`.

```json
{ "status": "ok", "uptime": 864000, "timestamp": "2026-08-23T10:00:00.000Z" }
```

**GET /api/system/diagnostics/quick:**

Auth: erforderlich. Vier Quellen in einer Antwort, jede einzeln abgesichert:
`system` (Hostname, Plattform, Last, Speicher), `services` (Docker-Zustand,
bei Fehler `{}`), `database` (Verbindungen, Datenbankgröße,
Selbstheilungs-Ereignisse und Dienstausfälle der letzten 24 Stunden, bei
Fehler `{}`) und `disk` (aus `df -h /`). Kein Archiv, keine Datei.

**POST /api/system/diagnostics:**

Auth: erforderlich. Ruft `scripts/system/diagnostics.sh` auf (Zeitlimit 120 s)
und liefert das erzeugte Archiv als Download aus
(`Content-Type: application/gzip`). Der Aufruf wird im Sicherheitsprotokoll
vermerkt.

Request Body (beides optional):

```json
{ "days": 3, "includeLogs": true }
```

**POST /api/system/reload-config:**

Auth: erforderlich. Liest neu ein, was ohne Neustart geht:
`{"reloaded": ["rate_limits", "logging_config"]}`. Datenbankzugang, Ports und
alles andere brauchen weiterhin einen Neustart, das sagt die Antwort in `note`
auch selbst.

**GET /api/system/thresholds:**

Returns device-specific thresholds for metrics based on auto-detected hardware.

```json
{
  "device": {
    "type": "jetson_agx_orin",
    "name": "NVIDIA Jetson AGX Orin",
    "cpu_cores": 12,
    "total_memory_gb": 64
  },
  "thresholds": {
    "cpu": { "warning": 75, "critical": 90 },
    "ram": { "warning": 75, "critical": 90 },
    "gpu": { "warning": 80, "critical": 95 },
    "storage": { "warning": 70, "critical": 85 },
    "temperature": { "warning": 65, "critical": 80 }
  },
  "source": "device_auto_detected",
  "timestamp": "2026-01-05T12:00:00.000Z"
}
```

Supported devices: Jetson AGX Orin, Orin Nano, Orin NX, Xavier, Nano, Generic Linux

### System Setup

| Method | Endpoint                     | Auth     | Description                            |
| ------ | ---------------------------- | -------- | -------------------------------------- |
| GET    | `/api/system/setup-status`   | None     | Check if initial setup is complete     |
| POST   | `/api/system/setup-complete` | Required | Mark setup as complete with settings   |
| PUT    | `/api/system/setup-step`     | Required | Update current setup step and settings |
| POST   | `/api/system/setup-skip`     | Required | Mark setup as skipped                  |

**GET /api/system/setup-status:**

No authentication required. Used by the frontend to determine whether to show the Setup Wizard on first boot.

```json
{
  "setupComplete": false,
  "setupStep": 1,
  "companyName": null
}
```

**POST /api/system/setup-complete:**

Marks the setup wizard as completed and persists the provided settings.

```json
{
  "companyName": "Muster GmbH",
  "hostname": "arasul-device",
  "selectedModel": "gemma4:26b-q4"
}
```

**PUT /api/system/setup-step:**

Saves progress at a specific step without completing the wizard. Allows resuming the wizard at the last saved step.

```json
{
  "step": 3,
  "companyName": "Muster GmbH",
  "hostname": "arasul-device",
  "selectedModel": "qwen3:7b-q8"
}
```

**POST /api/system/setup-skip:**

Marks the setup wizard as skipped. The wizard will not be shown again, but settings can still be configured later via the Settings page.

```json
{}
```

### Metrics

| Method | Endpoint                   | Description                       | Rate Limit |
| ------ | -------------------------- | --------------------------------- | ---------- |
| GET    | `/api/metrics/live`        | Current CPU, RAM, GPU, temp, disk | 20/s       |
| GET    | `/api/metrics/history`     | Historical metrics                | 20/s       |
| WS     | `/api/metrics/live-stream` | WebSocket stream (5s interval)    | -          |

**Query Parameters (history):**

- `range`: Time range (default: `24h`, options: `1h`, `6h`, `24h`, `7d`)

### Services

| Method | Endpoint                             | Description                                        |
| ------ | ------------------------------------ | -------------------------------------------------- |
| GET    | `/api/services`                      | Status of all services                             |
| GET    | `/api/services/ai`                   | AI services with GPU load                          |
| GET    | `/api/services/all`                  | Alle Dienste als Liste, mit `canRestart` je Dienst |
| GET    | `/api/services/llm/models`           | Modelle, die auf dem Gerät liegen                  |
| GET    | `/api/services/llm/models/:name`     | Ein Modell im Einzelnen (Modelfile, Parameter)     |
| POST   | `/api/services/llm/models/pull`      | Ein Modell nachladen, im Hintergrund               |
| DELETE | `/api/services/llm/models/:name`     | Ein Modell vom Gerät löschen                       |
| GET    | `/api/services/embedding/info`       | Auskunft des Embedding-Dienstes                    |
| POST   | `/api/services/restart/:serviceName` | Einen Dienst neu starten (nur Admin)               |

**GET /api/services/all:**

Auth: erforderlich. Liste statt Objekt, mit `id`, `name`, `status`, `health`,
`state` und `canRestart`. `canRestart` ist keine Vermutung, sondern die
Zugehörigkeit zur Liste unten.

**POST /api/services/llm/models/pull:**

Auth: erforderlich. Body: `{ "model_name": "gemma3:1b" }`. Antwortet sofort mit
`status: "started"` und lädt danach im Hintergrund (Zeitlimit eine Stunde). Der
Fortschritt steht nicht in dieser Antwort; nachsehen über
`GET /api/services/llm/models`.

**DELETE /api/services/llm/models/:name:**

Auth: erforderlich. Löscht das Modell im LLM-Dienst. `404`, wenn es das Modell
nicht gibt, `503`, wenn der Dienst nicht erreichbar ist.

**GET /api/services/embedding/info:**

Auth: erforderlich. Reicht die Auskunft des Embedding-Dienstes durch. Der
Dienst läuft seit dem 24.08.2026 wieder ohne Compose-Profil; ist er nicht
erreichbar, antwortet der Endpunkt mit `503`.

**POST /api/services/restart/:serviceName:**

Auth: erforderlich, **Admin**. Drei Sperren übereinander: der Name muss in der
Positivliste stehen (sonst `403`), je Dienst ist höchstens ein Neustart in
60 Sekunden erlaubt (sonst `429`), und nach 30 Sekunden ohne Antwort gilt der
Neustart als gescheitert (`503`). Jeder Versuch, auch der gescheiterte, landet
als `manual_restart` in `self_healing_events`.

Erlaubte Dienste (Stand: 2026-08-26, Quelle:
`apps/dashboard-backend/src/routes/system/services.js`, `ALLOWED_SERVICES`):
`postgres-db`, `metrics-collector`, `llm-service`,
`embedding-service`, `document-indexer`, `reverse-proxy`, `dashboard-backend`,
`dashboard-frontend`, `self-healing-agent`, `backup-service`.

### Einstellungen für die Generierung

Die Spalten `llm_num_ctx_default`, `llm_keep_alive_seconds`,
`llm_num_predict_default` und `llm_base_system_prompt` in `system_settings`
liest das Backend (`services/system-settings/systemSettingsService.js`,
`services/llm/llmOllamaStream.js`); eine Route oder Oberfläche dafür gibt es
bis zu den D-Phasen des Überordner-Plans nicht.

---

### Embeddings

| Method | Endpoint          | Description              |
| ------ | ----------------- | ------------------------ |
| POST   | `/api/embeddings` | Generate text embeddings |

**POST /api/embeddings:**

```json
{
  "text": "Text to embed"
}
```

### Self-Healing

| Method | Endpoint                             | Description                                |
| ------ | ------------------------------------ | ------------------------------------------ |
| GET    | `/api/self-healing/events`           | Event history                              |
| GET    | `/api/self-healing/status`           | Current status                             |
| GET    | `/api/self-healing/recovery-actions` | Was der Wächter unternommen hat            |
| GET    | `/api/self-healing/service-failures` | Ausfälle je Dienst, filterbar              |
| GET    | `/api/self-healing/reboot-history`   | Neustarts des Geräts                       |
| GET    | `/api/self-healing/metrics`          | Verfügbarkeit, Erfolgsquote, Verlauf (7 d) |

Die vier unteren verlangen **Admin**, nicht nur eine Anmeldung.

**GET /api/self-healing/recovery-actions, /service-failures, /reboot-history:**

Alle drei blättern gleich: Query `limit` und `offset`, Antwort mit `count` (was
diese Seite enthält), `total` (was es insgesamt gibt), `limit` und `offset`.
Standard-`limit`: 20 für Aktionen, 50 für Ausfälle, 10 für Neustarts.
`/service-failures` nimmt zusätzlich `service_name`.

**GET /api/self-healing/metrics:**

Drei Auswertungen über die letzten sieben Tage: `failures_by_service`
(`failure_count`, `recovered`, `not_recovered`, `last_failure`),
`recovery_success_rates` je Art der Maßnahme und `event_trends` je Tag,
getrennt nach `CRITICAL` und `WARNING`.

Eine Verfügbarkeit in Prozent steht hier bewusst **nicht**.
`service_failures` kennt den Zeitpunkt der Störung, nicht den der Behebung —
eine Ausfalldauer ist daraus nicht zu rechnen. Bis zum 23.08.2026 stand hier
eine Rechnung auf einer Spalte `resolved_at`, die es nie gab; der Endpunkt
antwortete auf jedem Gerät mit `500`. Stand: 2026-08-23, Quelle:
`services/postgres/init/003_self_healing_schema.sql`.

**Query Parameters (events):**

- `limit`: Max results (default: 100)
- `severity`: Filter by severity (INFO, WARNING, CRITICAL)

### Alerts

| Method | Endpoint                              | Description                                    |
| ------ | ------------------------------------- | ---------------------------------------------- |
| GET    | `/api/alerts/settings`                | Get global alert settings                      |
| PUT    | `/api/alerts/settings`                | Update global alert settings                   |
| GET    | `/api/alerts/thresholds`              | Get all threshold configurations               |
| PUT    | `/api/alerts/thresholds/:metricType`  | Update threshold (cpu, ram, disk, temperature) |
| GET    | `/api/alerts/quiet-hours`             | Get quiet hours for all days                   |
| PUT    | `/api/alerts/quiet-hours/:dayOfWeek`  | Update quiet hours for single day (0-6)        |
| PUT    | `/api/alerts/quiet-hours`             | Bulk update quiet hours                        |
| GET    | `/api/alerts/history`                 | Get alert history                              |
| POST   | `/api/alerts/history/:id/acknowledge` | Acknowledge single alert                       |
| POST   | `/api/alerts/history/acknowledge-all` | Acknowledge all alerts                         |
| GET    | `/api/alerts/statistics`              | Get alert statistics                           |
| POST   | `/api/alerts/test-webhook`            | Test webhook configuration                     |
| POST   | `/api/alerts/trigger-check`           | Manually trigger alert check                   |
| GET    | `/api/alerts/status`                  | Get alert engine status                        |

**PUT /api/alerts/settings:**

```json
{
  "alerts_enabled": true,
  "webhook_enabled": false,
  "webhook_url": "https://...",
  "in_app_notifications": true
}
```

**PUT /api/alerts/thresholds/:metricType:**

```json
{
  "warning_threshold": 75,
  "critical_threshold": 90,
  "enabled": true
}
```

**PUT /api/alerts/quiet-hours/:dayOfWeek:**

```json
{
  "enabled": true,
  "start_time": "22:00",
  "end_time": "07:00"
}
```

**GET /api/alerts/history Query Parameters:**

- `limit`: Max results (default: 100, max: 500)
- `offset`: Pagination offset
- `metric_type`: Filter by type (cpu, ram, disk, temperature)
- `severity`: Filter by severity (warning, critical)
- `unacknowledged`: Boolean, show only unacknowledged

**GET /api/alerts/status Response:**

```json
{
  "enabled": true,
  "in_quiet_hours": false,
  "webhook_enabled": false,
  "in_app_notifications": true,
  "statistics": {
    "total_24h": 5,
    "unacknowledged": 2
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

### Events (Notifications)

| Method | Endpoint                           | Auth | Description                       |
| ------ | ---------------------------------- | ---- | --------------------------------- |
| GET    | `/api/events`                      | Yes  | Get recent notification events    |
| GET    | `/api/events/stats`                | Yes  | Event and notification statistics |
| GET    | `/api/events/settings`             | Yes  | User notification settings        |
| PUT    | `/api/events/settings`             | Yes  | Update notification settings      |
| POST   | `/api/events/test`                 | Yes  | Send test notification            |
| POST   | `/api/events/webhook/self-healing` | IP   | Self-healing agent webhook        |
| POST   | `/api/events/manual`               | Yes  | Create manual notification        |
| GET    | `/api/events/service-status`       | Yes  | Service status cache              |
| GET    | `/api/events/boot-history`         | Yes  | System boot history               |
| DELETE | `/api/events/:id`                  | Yes  | Delete specific event             |
| POST   | `/api/events/cleanup`              | Yes  | Cleanup old events                |

**GET /api/events Query Parameters:**

- `limit`: Max results (default: 50)
- `event_type`: Filter by event type
- `severity`: Filter by severity

**PUT /api/events/settings:**

```json
{
  "channel": "webhook",
  "enabled": true,
  "event_types": ["service_status", "alert"],
  "min_severity": "warning",
  "rate_limit_per_minute": 10,
  "quiet_hours_start": "22:00",
  "quiet_hours_end": "07:00"
}
```

**POST /api/events/webhook/self-healing:**

Only accepts requests from localhost or Docker network IPs.

```json
{
  "action_type": "container_restart",
  "service_name": "llm-service",
  "reason": "Memory threshold exceeded",
  "success": true,
  "duration_ms": 3000,
  "error_message": null
}
```

### Benutzer (Phasen C1 und C2)

Der Administrator verwaltet die Benutzer des Geräts. Alle Wege hier sind
Admin-Wege; ein Mitarbeiter bekommt 403.

Das eigene Konto löscht jeder über `DELETE /api/gdpr/me`;
`DELETE /api/benutzer/:id` ist für andere und läuft durch dieselbe Löschung
(`services/auth/benutzerService.js`): Flow-Läufe, API-Schlüssel, Freigaben und
Sitzungen weg, Protokolle anonymisiert. Der letzte aktive Administrator behält
seine Zugangs-Zeile (`zugangBleibt: true`).

Sein eigenes Passwort wechselt jeder über `POST /api/auth/change-password` —
dort wird das alte geprüft und das neue muss den Komplexitätsregeln genügen.
`PUT /api/benutzer/:id/passwort` ist der andere Fall: der Administrator kennt
das alte nicht, setzt ein Startpasswort (mindestens acht Zeichen) und beendet
damit alle Sitzungen des Betroffenen. Für das **eigene** Konto ist dieser Weg
gesperrt (400): er prüft das alte Passwort nicht und setzt die
Komplexitätsregeln nicht durch, wäre also sonst eine Abkürzung an den eigenen
Regeln vorbei.

Stilllegen ist nicht Löschen. Ein stillgelegter Benutzer kommt nicht mehr
herein (`POST /api/auth/login` antwortet 403 `Account is disabled`), seine
Läufe und Protokolle bleiben stehen. Der letzte aktive Administrator kann nicht
stillgelegt werden, und niemand kann sich selbst stilllegen.

| Method | Endpoint                     | Description                                                                                                    |
| ------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/benutzer`              | Alle Benutzer: `id, username, email, role, is_active, created_at, last_login`                                  |
| POST   | `/api/benutzer`              | Benutzer anlegen: `{ username, password, email?, rolle: "admin" \| "mitarbeiter" }`; 409 bei Name              |
| PUT    | `/api/benutzer/:id/passwort` | Passwort setzen: `{ password }` (≥ 8 Zeichen); beendet alle Sitzungen; 400 für das eigene Konto, 404 unbekannt |
| PUT    | `/api/benutzer/:id/aktiv`    | Stilllegen oder zulassen: `{ aktiv: true \| false }`; 400 für sich selbst und den letzten Admin                |
| DELETE | `/api/benutzer/:id`          | Benutzer samt Daten löschen; 400 für das eigene Konto, 404 unbekannt                                           |

```json
// POST /api/benutzer → 201
{
  "data": {
    "id": 7,
    "username": "mia",
    "email": "mia@firma.de",
    "role": "mitarbeiter",
    "is_active": true
  },
  "timestamp": "2026-08-27T09:00:00.000Z"
}
```

### Freigaben (Phase C2, Tester-Kreis aus C3)

Eine Freigabe ist ein Paar: diese App, dieser Mensch (`app_members`, Migration
168). Sie ersetzt `space_members` aus der Zeit der Wissensräume. Wer innerhalb
einer App was darf, entscheidet die App; die Plattform kennt nur „freigegeben
oder nicht".

Dazu ein Wort, wie weit: `stand` ist `live` (der Normalfall — er sieht
`/apps/<id>/`) oder `test` (ein Tester — er sieht zusätzlich
`/apps/<id>/test/`). Ein Tester ist kein anderer Nutzer, sondern ein Nutzer mit
einer Tür mehr; deshalb keine zweite Zeile je Mensch und App.

`app_id` zeigt seit Migration 169 als **Fremdschlüssel auf `apps.id`**. Eine
Freigabe für eine App, die es am Gerät nicht gibt, ist damit ein `400` und
keine Zusage ins Leere. Die Form der Kennung: Kleinbuchstaben, Ziffern und
Bindestrich, höchstens 64 Zeichen, beginnend mit Buchstabe oder Ziffer.

Freigegeben wird an jeden Benutzer, auch an einen Administrator: die Rolle sagt,
wer verwaltet, nicht wer arbeitet. Alle drei Wege sind Admin-Wege. Was der
Mitarbeiter selbst davon sieht, steht unter `GET /api/apps/meine`.

| Method | Endpoint                            | Description                                                                                        |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/api/freigaben`                    | Alle Freigaben; Filter `?app_id=` und `?benutzer_id=`; mit `app_name`, `username`, `email`, `role` |
| POST   | `/api/freigaben`                    | Freigeben: `{ app_id, benutzer_id, stand? }`; 201 neu, 200 wenn sie schon stand (`neu: false`)     |
| DELETE | `/api/freigaben/:appId/:benutzerId` | Freigabe zurücknehmen; 404, wenn es sie nicht gibt                                                 |

```json
// POST /api/freigaben → 201
{
  "data": {
    "app_id": "urlaub",
    "user_id": 7,
    "stand": "live",
    "freigegeben_von": 1,
    "freigegeben_am": "2026-08-27T09:00:00.000Z"
  },
  "neu": true,
  "timestamp": "2026-08-27T09:00:00.000Z"
}
```

Zweimal dieselbe Freigabe ist kein Fehler, sondern derselbe Zustand: der zweite
Aufruf lässt Zeitstempel und Administrator der ersten stehen und meldet
`neu: false`. Der `stand` ist die Ausnahme — er wird überschrieben. Wer jemanden
vom Tester zum normalen Nutzer macht (oder umgekehrt), schickt dieselbe Freigabe
noch einmal mit dem anderen Wort. `data` trägt in beiden Fällen dieselben fünf
Felder; `app_name`, `username`, `email` und `role` gibt es nur bei
`GET /api/freigaben`. Löscht man den Benutzer, fallen seine
Freigaben mit (`ON DELETE CASCADE`) und stehen in der Zusammenfassung der
Löschung unter `app_members`.

Gegen das Gerät misst das `scripts/test/mitarbeiter-abnahme.sh`.

### Settings / Passwords

| Method | Endpoint                              | Description               | Rate Limit |
| ------ | ------------------------------------- | ------------------------- | ---------- |
| POST   | `/api/settings/password/dashboard`    | Change Dashboard password | 3/15min    |
| GET    | `/api/settings/password-requirements` | Get password rules        | -          |

**POST /api/settings/password/\*:**

```json
{
  "current_password": "current",
  "new_password": "new password"
}
```

**Password Requirements:**

- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character

### Updates

| Method | Endpoint                       | Description                       |
| ------ | ------------------------------ | --------------------------------- |
| POST   | `/api/update/upload`           | Upload .araupdate file            |
| GET    | `/api/update/status`           | Current update status             |
| GET    | `/api/update/history`          | Update history                    |
| GET    | `/api/update/usb-devices`      | Scan for USB devices with updates |
| POST   | `/api/update/install-from-usb` | Install update from USB device    |
| GET    | `/api/update/check`            | Nach Aktualisierungen sehen       |
| POST   | `/api/update/download`         | Aktualisierung herunterladen      |
| POST   | `/api/update/apply`            | Ein Paket einspielen              |

**GET /api/update/check** und **POST /api/update/download** verlangen
**Admin**, nicht nur eine Anmeldung.

**Zwei Dinge, die dieser Weg seit Phase C9 (27.08.2026) ehrlich sagt.**

_Erstens: kennt das Gerät seine eigene Fassung?_ `SYSTEM_VERSION` setzt der Bau,
und der versioniert erst ab Phase C10. Bis dahin lautet die Antwort
`fassung.bekannt: false`, und `check` fragt den Aktualisierungsserver gar nicht
erst — er bekäme `current_version=0.0.0` und böte jede Fassung an, die es je
gab. Ein Paket wird dann mit genau dieser Begründung abgelehnt: das Gerät kennt
seine eigene Fassung nicht. Vorher stand dort „Current version 0.0.0 is below
minimum required version 1.0.0", und wer das liest, sucht den Fehler im Paket.

_Zweitens: kann dieses Gerät ein Paket überhaupt einspielen?_
`einspielenMoeglich` beantwortet das **vor** dem ersten Handgriff. Der Ablauf
ruft `docker` und `docker-compose` als Programme auf; im Backend-Container gibt
es beide nicht. Bis C9 antwortete `apply` trotzdem `started` und starb danach
still. Was am Gerät wirklich aktualisiert, ist der Deploy
(`scripts/deploy/deploy-local.sh`) beziehungsweise `./arasul update`.

**GET /api/update/status Response (Auszug):**

```json
{
  "status": "idle",
  "fassung": { "version": null, "anzeige": "Vorserie", "bekannt": false },
  "einspielenMoeglich": false,
  "einspielenGrund": "Ein Paket lässt sich an diesem Gerät nicht über die Schnittstelle einspielen: …",
  "timestamp": "2026-08-27T10:00:00.000Z"
}
```

**POST /api/update/download:**

Body: `downloadUrl`, `version`. Nur `https://` ist erlaubt, alles andere ist ein
`VALIDATION_ERROR`. Antwortet sofort mit `status: "downloading"` und lädt im
Hintergrund; danach prüft der Dienst die Signatur selbst und trägt den Stand
`downloaded` in `update_events` ein. Der Fortschritt steht in
`GET /api/update/status`.

**POST /api/update/apply:**

Auth: erforderlich, **Admin**. Body: `file_path`. Der Pfad muss unterhalb von
`/arasul/updates` oder `/tmp/updates` liegen, sonst `VALIDATION_ERROR`; das ist
die Sperre gegen Pfadausbruch. Läuft bereits eine Aktualisierung, antwortet der
Endpunkt mit `409 CONFLICT`; fehlt die Datei, mit `404`.

Kann das Gerät gar nicht einspielen (siehe `einspielenMoeglich` oben), antwortet
er mit `503 SERVICE_UNAVAILABLE` und der Begründung — **bevor** irgendetwas
gesichert oder ersetzt wird.

**POST /api/update/upload:**

- Content-Type: `multipart/form-data`
- Field: `file` (.araupdate package)

**GET /api/update/usb-devices:**

Auth: Required

Scans `/media/` and `/mnt/` directories for `.araupdate` files with accompanying `.sig` signature files.

Response:

```json
{
  "devices": [
    {
      "path": "/media/usb/update.araupdate",
      "name": "update.araupdate",
      "size": 1073741824,
      "mountPoint": "/media/usb",
      "device": "/dev/sda1",
      "modified": "2026-01-15T10:00:00.000Z"
    }
  ],
  "count": 1,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/update/install-from-usb:**

Auth: Required

Installs an update package from a USB device. Security restriction: only paths under `/media/` or `/mnt/` are allowed. Requires corresponding `.sig` signature file alongside the `.araupdate` file.

Request Body:

```json
{
  "file_path": "/media/usb/update.araupdate"
}
```

Response (same as POST /upload):

```json
{
  "file_path": "/media/usb/update.araupdate",
  "version": "2.1.0",
  "components": [
    {
      "name": "frontend",
      "version": "2.1.0"
    },
    {
      "name": "backend",
      "version": "2.1.0"
    }
  ],
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**Notes:**

- USB device paths must be under `/media/` or `/mnt/` (security restriction)
- Each `.araupdate` file must have a matching `.sig` signature file
- Signature verification is performed before installation

### Logs

| Method | Endpoint              | Description                                   |
| ------ | --------------------- | --------------------------------------------- |
| GET    | `/api/logs`           | List available log files                      |
| GET    | `/api/logs/:filename` | Get log file content                          |
| GET    | `/api/logs/list`      | Protokolldateien mit Größe und Änderungsdatum |
| GET    | `/api/logs/search`    | In einem Protokoll suchen                     |
| GET    | `/api/logs/stream`    | Ein Protokoll mitlesen (SSE)                  |

Alle verlangen eine angemeldete Sitzung.

**GET /api/logs/list:**

Je bekanntem Dienst eine Zeile mit `service`, `path`, `size`, `size_mb`,
`modified` und `accessible`. Eine nicht vorhandene Datei fehlt nicht, sie steht
mit `accessible: false` da — der Unterschied zwischen „kein Protokoll" und
„Dienst unbekannt" bleibt so sichtbar.

**GET /api/logs/search:**

Query: `service` (Standard `system`), `query` (Pflicht), `lines` (Standard 100,
höchstens 10 000), `case_sensitive` (`true`/`false`, Standard `false`). Sucht
als Teilzeichenkette, nicht als regulärer Ausdruck.

**GET /api/logs/stream:**

Server-Sent Events. Query: `service`, `lines` (Standard 50, höchstens 1000).
Schickt zuerst die letzten Zeilen, danach jede neue. Ein Keepalive alle
15 Sekunden hält den Traefik-Leerlauf offen.

Bekannte Dienstnamen (Stand: 2026-08-26, Quelle:
`apps/dashboard-backend/src/routes/system/logs.js`, `LOG_FILES`): `system`,
`self_healing`, `update`, `traefik`, `traefik-access`, `metrics-collector`,
`dashboard-backend`, `dashboard-frontend`, `llm-service`, `embedding-service`,
`self-healing-agent`, `postgres-db`. Ein anderer Name ist ein
`VALIDATION_ERROR`, ein fehlendes Protokoll ein `404`.

### Database

| Method | Endpoint                    | Description                                 |
| ------ | --------------------------- | ------------------------------------------- |
| GET    | `/api/database/status`      | Database connection status                  |
| GET    | `/api/database/metrics`     | Database size & stats                       |
| GET    | `/api/database/health`      | Erreichbarkeit mit Latenz, `503` wenn krank |
| GET    | `/api/database/pool`        | Kennzahlen des Verbindungspools             |
| GET    | `/api/database/connections` | Verbindungen aus Sicht von PostgreSQL       |
| GET    | `/api/database/queries`     | Langsame Abfragen                           |

Alle verlangen eine angemeldete Sitzung.

**GET /api/database/health:**

Der einzige hier, der den Zustand auch im HTTP-Code sagt: `200` mit
`status: "healthy"` oder **`503`** mit `status: "unhealthy"` und `error`. Dazu
`latency_ms` und `pool_stats`. Wer den Zustand überwacht, wertet den Code aus,
nicht den Text.

**GET /api/database/connections:**

Zählt in `pg_stat_activity` nach: `total`, `active`, `idle`,
`idle_in_transaction` und `arasul_apps` (Anwendungsname beginnt mit
`arasul-`), dazu `limits.max_connections` aus `SHOW max_connections` und die
Auslastung in Prozent.

**GET /api/database/queries:**

Braucht die Erweiterung `pg_stat_statements`. Fehlt sie, ist
`pg_stat_statements_enabled` falsch und `slow_queries` leer — das ist kein
Fehler, sondern eine Auskunft. Sonst die zehn langsamsten Abfragen über
100 ms Mittelwert, auf 200 Zeichen gekürzt.

### Apps

Eine App ist das, was ein Partner mit dem Ara-Kit baut und auf das Gerät rollt:
ein statisches Frontend, das Arasul unter `/apps/<id>/` ausliefert, und ein
Backend-Container, den Traefik unter `/apps/<id>/api/` erreicht. Was sie ist,
steht in ihrem Manifest `app.json` — die Felder erklärt
[docs/features/APPS.md](../features/APPS.md).

Je App gibt es zwei Stände: `live` für alle Freigegebenen, `test` für die
benannten Tester. Sie haben getrennte Pfade und getrennte Container.

| Method | Endpoint                           | Description                                                        |
| ------ | ---------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/apps`                        | Alle Apps mit beiden Ständen und dem Zustand ihrer Container       |
| GET    | `/api/apps/meine`                  | Die Apps, die dem Aufrufer freigegeben sind (auch für Mitarbeiter) |
| GET    | `/api/apps/:id`                    | Eine App im Einzelnen: Manifest, Versionen, Modelle, Flows         |
| POST   | `/api/apps/:id/einspielen`         | Eine Version in einen Stand bringen                                |
| DELETE | `/api/apps/:id`                    | App entfernen: beide Container, beide Stände, Freigaben            |
| GET    | `/api/apps/:id/logs`               | Die letzten Zeilen des App-Backends                                |
| GET    | `/api/apps/:id/zugang`             | Forward-Auth vor dem Backend einer App (auch für Mitarbeiter)      |
| GET    | `/api/apps/:id/flows`              | Die Flows beider Stände, mit dem Modell, das sie treibt            |
| PUT    | `/api/apps/:id/flows/:name/modell` | Das Modell eines Flows setzen oder zurücknehmen                    |

Alle bis auf `/meine` und `/:id/zugang` sind Admin-Wege.

**POST /api/apps/:id/einspielen:** Body `{ "version": "1.0.0", "stand": "test" }`.
Ohne `stand` geht es in den **Teststand** — gerollt wird nach `test`, live
schaltet ein Mensch. Die Version muss schon unter
`/arasul/apps/<id>/<version>/` liegen. Der Weg, auf dem ein **Paket** dorthin
kommt, ist seit Phase C5 `POST /api/v1/external/apps`
([Deploy für das Ara-Kit](#deploy-für-das-ara-kit-phase-c5)); beide rufen
denselben Dienst.

Die Reihenfolge ist die vorsichtige: erst Manifest lesen und prüfen, dann den
Container starten, erst danach schreiben. Ein Stand, der in der Antwort steht,
ist einer, der wirklich hochgekommen ist. Antworten: `201` mit dem Stand,
`404` wenn die Version nicht auf der Platte liegt, `400` wenn das Manifest
nicht durchgeht, `409` wenn die Lizenz keine weitere App erlaubt (die Grenze
greift nur bei einer neuen App, nicht bei einer neuen Version).

**GET /api/apps/:id/logs:** Query `?stand=live|test&zeilen=1..2000`.

**GET /api/apps/:id Response (gekürzt):**

```json
{
  "data": {
    "id": "urlaub",
    "name": "Urlaubsantrag",
    "versionen": ["1.0.0", "1.1.0"],
    "staende": {
      "live": {
        "version": "1.0.0",
        "pfad": "/apps/urlaub/",
        "api": "/apps/urlaub/api/",
        "backend": { "laeuft": true, "status": "running", "gesundheit": "healthy" },
        "modelle": [{ "name": "qwen3:14b-q8", "vorhanden": true }],
        "flows": [{ "name": "urlaub-pruefen", "modell": "qwen3:14b-q8", "version": "1.0.0" }]
      },
      "test": null
    }
  },
  "timestamp": "2026-08-27T12:00:00Z"
}
```

`modelle` sagt, was das Manifest **verlangt** und was davon am Gerät ist.
Nachinstalliert wird nichts: ein Deploy, der nebenbei sieben Gigabyte lädt,
ist keine Installation mehr, sondern ein Abend.

`flows` ist seit Phase C6 das Gegenstück dazu — keine Forderung, sondern eine
**Lieferung**: das Paket bringt die Dateien mit (`flows/*.md`), und das Gerät
registriert sie beim Einspielen je App und Stand. Bis C5 stand hier
`{"name": …, "vorhanden": false}`, also die Antwort auf eine Frage, die sich
nicht mehr stellt.

Jeder Stand trägt seit Phase C5 zusätzlich `vorige_version`: die Version, die
in diesem Stand vor der jetzigen lief, oder `null`. Darauf schaltet
`POST /api/v1/external/apps/:id/schalten` mit `{"ziel":"zurueck"}` zurück.

**GET /api/apps/meine Response:**

```json
{
  "data": [
    {
      "id": "urlaub",
      "name": "Urlaubsantrag",
      "live": { "version": "1.0.0", "pfad": "/apps/urlaub/" },
      "test": null
    }
  ],
  "timestamp": "2026-08-27T12:00:00Z"
}
```

`test` ist nur gefüllt, wenn die Freigabe dieses Menschen den Stand `test`
trägt — er ist dann Tester (siehe `POST /api/freigaben`).

#### Die Flows einer App (Phase C6)

Ein Flow gehört seit C6 zu einer App: er kommt in ihrem Paket mit
(`flows/<name>.md`, Markdown mit YAML-Kopf) und wird beim Einspielen je App
**und Stand** registriert. Der Namensraum ist die App — zwei Apps dürfen beide
einen Flow `bericht` haben, ohne voneinander zu wissen. Die Felder des Kopfes
erklärt [docs/features/FLOWS.md](../features/FLOWS.md), das Paket
[docs/features/APP-PAKET.md](../features/APP-PAKET.md).

**GET /api/apps/:id/flows Response:**

```json
{
  "data": {
    "app_id": "urlaub",
    "live": [
      {
        "name": "urlaub-pruefen",
        "beschreibung": "Prüft einen Antrag gegen die Regeln.",
        "argumente": [{ "name": "antrag", "typ": "freitext", "pflicht": true }],
        "modell": "qwen3:14b-q8",
        "modell_ueberschrieben": false,
        "version": "1.0.0",
        "registriert_am": "2026-08-27T12:00:00Z"
      }
    ],
    "test": []
  },
  "timestamp": "2026-08-27T12:00:00Z"
}
```

`modell` ist das Modell, das den Flow **wirklich** treibt.
`modell_ueberschrieben` sagt, ob es aus dem Paket kommt (`false`) oder vom
Administrator (`true`). Der Prompt steht nicht darin: er ist der Auftrag des
Partners an das Modell, und wer ihn braucht, hat das Paket.

**PUT /api/apps/:id/flows/:name/modell:** Body `{ "modell": "qwen3:14b-q8" }`
setzt das Modell, `{ "modell": null }` nimmt die Überschreibung zurück (dann
gilt wieder der Kopf der Flow-Datei). Antworten: `200`, `404` wenn die App den
Flow in keinem Stand hat, `400` bei einem ungültigen Namen.

Zwei Eigenschaften sind Absicht und keine Nachlässigkeit:

- **Die Überschreibung liegt in der Datenbank, nicht in der Flow-Datei.** Die
  Datei kommt mit jedem Paket neu; eine Änderung darin wäre beim nächsten
  App-Update weg. So überlebt die Entscheidung des Kunden ein Update, ohne
  dass der Deploy eine Datei aussparen müsste.
- **Sie gilt ohne `stand`.** „Welches Modell treibt diesen Flow" ist eine
  Entscheidung über den Flow, nicht über die Fassung, mit der jemand gerade
  testet. Wer im Teststand einstellte und im Livestand nicht, merkte es erst
  beim Schalten.

### Die App-Anmeldung

> Phase C4 des Umbaus vom 26.08.2026. Die Durchsetzung steht in
> `apps/dashboard-backend/src/services/app/appZugang.js`.

**Eine App bekommt keine eigene Anmeldung.** Wer an Arasul angemeldet ist und
die App freigegeben hat, ist in der App angemeldet; wer nicht, kommt nicht
hinein. Es gibt keine Sonderregel für Administratoren — auch sie brauchen die
App freigegeben (Entscheidung aus C2).

Geprüft wird an zwei Stellen, aber nach **einer** Regel:

| Weg                 | Wer prüft                                                 |
| ------------------- | --------------------------------------------------------- |
| `/apps/<id>/…`      | Arasul selbst, beim Ausliefern der Seite                  |
| `/apps/<id>/api/…`  | Traefik per Forward-Auth auf `GET /api/apps/:id/zugang`   |
| `/apps/<id>/api/me` | Arasul selbst (der eine Weg unter `api/`, der ihm gehört) |

Die Antworten:

| Zustand                                   | Seite         | Schnittstelle |
| ----------------------------------------- | ------------- | ------------- |
| keine Sitzung                             | `302` auf `/` | `401`         |
| Sitzung, App nicht freigegeben            | `403`         | `403`         |
| Freigabe nur `live`, Teststand aufgerufen | `403`         | `403`         |
| Freigabe, aber diesen Stand gibt es nicht | `404`         | `404`         |

Warum die Seite umzieht und die Schnittstelle nicht: ein `fetch` der App
bekäme auf einen Umzug die Anmeldeseite als HTML zurück und meldete einen
Fehler, der nach einem Fehler der App aussieht.

**Erst die Freigabe, dann die Existenz.** Wer eine App nicht freigegeben hat,
erfährt auch nicht, ob es sie am Gerät gibt — die Antwort ist `403`, nicht
`404`. Sonst wäre die Liste der Apps eines Unternehmens für jeden angemeldeten
Menschen abzählbar.

**GET /api/apps/:id/zugang:** Query `?stand=live|test` (ohne Angabe `live`).
Ruft Traefik auf, nicht der Browser; die Adresse steht im Etikett des
App-Containers. Bei Erfolg `200` und zwei Kopfzeilen, die Traefik in die
Anfrage an die App überträgt:

| Kopfzeile       | Inhalt                      |
| --------------- | --------------------------- |
| `X-Arasul-User` | Der Benutzername, als UTF-8 |
| `X-Arasul-Role` | `admin` oder `mitarbeiter`  |

Beide sind **nicht fälschbar**: Traefik löscht sie aus der eingehenden Anfrage,
bevor es sie aus der Antwort dieses Endpunkts neu setzt
(`forwardauth.authResponseHeaders`).

Der Name steht als UTF-8 in der Kopfzeile. In Node liest man ihn mit
`Buffer.from(kopf, 'latin1').toString('utf8')`; bequemer ist der nächste
Abschnitt.

**GET /apps/&lt;id&gt;/api/me** — nicht unter `/api`, sondern unter dem Pfad der
App. Der eine Weg unter `api/`, den nicht der Container der App beantwortet,
sondern Arasul: eine App darf nach ihrem Manifest ganz ohne Backend auskommen,
und dann gäbe es niemanden, der die Frage beantworten könnte. Der Teststand hat
seinen eigenen: `/apps/<id>/test/api/me`.

```json
{
  "data": {
    "app_id": "urlaub",
    "stand": "live",
    "benutzer": "anna",
    "rolle": "mitarbeiter"
  },
  "timestamp": "2026-08-27T12:00:00Z"
}
```

Vergeben ist genau dieser Weg. `/apps/urlaub/api/meine-antraege` gehört weiter
der App.

### Store

| Method | Endpoint                     | Description                          |
| ------ | ---------------------------- | ------------------------------------ |
| GET    | `/api/store/recommendations` | Empfohlene Modelle nach dem KI-RAM   |
| GET    | `/api/store/search`          | Suche im Modellkatalog               |
| GET    | `/api/store/info`            | RAM und Plattenplatz für die Anzeige |

Bis Phase C3 (27.08.2026) standen hier Modelle **und** Apps nebeneinander: der
Laden bot beides zum Aussuchen an. Einen App-Katalog gibt es nicht mehr — eine
App kommt vom Partner auf das Gerät, sie wird nicht ausgesucht.

### Model Management

| Method | Endpoint                       | Description                                                                    |
| ------ | ------------------------------ | ------------------------------------------------------------------------------ |
| GET    | `/api/models/catalog`          | List curated model catalog                                                     |
| GET    | `/api/models/installed`        | List installed models                                                          |
| GET    | `/api/models/status`           | Current loaded model + queue stats                                             |
| GET    | `/api/models/memory-budget`    | KI-RAM-Lage, geladene Modelle, letzter Wechsel                                 |
| GET    | `/api/models/loaded`           | Get currently loaded model                                                     |
| GET    | `/api/models/default`          | Get default model                                                              |
| POST   | `/api/models/default`          | Set default model                                                              |
| POST   | `/api/models/download`         | Download model (SSE progress)                                                  |
| DELETE | `/api/models/:id`              | Delete installed model                                                         |
| POST   | `/api/models/:id/activate`     | Load model into RAM                                                            |
| POST   | `/api/models/:id/deactivate`   | Unload model from RAM (identisch mit `/unload`)                                |
| GET    | `/api/models/:id`              | Ein Modell im Einzelnen (Katalogeintrag plus Installationsstand)               |
| GET    | `/api/models/:id/capabilities` | Was das Modell kann: Werkzeugaufrufe, Denkschritte, Kontextlänge               |
| POST   | `/api/models/:id/load`         | Modell in den Speicher holen (gleichbedeutend mit `/activate`)                 |
| POST   | `/api/models/:id/unload`       | Modell aus dem Speicher werfen                                                 |
| GET    | `/api/models/recommended`      | Empfehlung für diese Hardware, aus RAM und Rechenwerk abgeleitet               |
| GET    | `/api/models/lifecycle`        | Lade- und Entladeverlauf, für die Ursachensuche bei RAM-Engpässen              |
| POST   | `/api/models/sync`             | Katalog und Installationsstand abgleichen, wenn jemand am CLI nachgeholfen hat |

**Der Katalog ist die Kurzliste (Phase C8, Entscheidung 27.08.2026):**

`GET /api/models/catalog` zeigt genau vier Modelle, und mehr gibt es nicht:

| Kennung                                 | Aufgabe   | RAM   | Wofür                             |
| --------------------------------------- | --------- | ----- | --------------------------------- |
| `hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS` | text      | 22 GB | Standard, die Flows laufen darauf |
| `gemma4:e4b`                            | text      | 10 GB | das kleine schnelle               |
| `nomic-embed-text`                      | embedding | 2 GB  | Einbettungen (`/v1/embeddings`)   |
| `llava-phi3`                            | vision    | 4 GB  | Bilder und eingescannter Text     |

Die Liste steht in `config/modelle/kurzliste.json` und kommt über Migration 175
in den Katalog. Sie ist eine **Zusage** über vier auf diesem Gerät gemessene
Modelle, kein Vorschlag: `POST /api/models/download` nimmt nur, was im Katalog
steht, und der Katalog wird nur noch von Migrationen geschrieben.

Bis zum 27.08.2026 gab es zwei Wege daran vorbei, und beide sind weg:

- `POST /api/models/quelle/pruefen`, `POST /api/models/katalog` und
  `DELETE /api/models/katalog/*` holten ein beliebiges Modell von HuggingFace
  in den Katalog. Sie antworten jetzt mit `404`.
- Der Abgleich mit Ollama trug jedes Modell nach, das nur dort lag
  (`importUnknownModels`). Er tut es nicht mehr; ein Modell, das jemand am CLI
  zieht, bleibt für die Plattform unsichtbar.

Was am Gerät liegt, bleibt liegen — die Migration räumt die Datenbank, nicht
die Platte. Die gestrichenen Gewichte nimmt
`scripts/util/modelle-aufraeumen.sh` von Hand, mit Liste und Rückfrage.

**Hinweis zu `/api/models/installed`:** Die Antwort enthaelt seit Plan 023 D9
auch die externen Cloud-Modelle, sofern ein Anbieter eingeschaltet ist. Sie
tragen `"extern": true`, eine Id mit dem Praefix `extern:<anbieter>/<modell>`
und `ram_required_gb: 0`, weil sie auf diesem Geraet keinen Speicher belegen.
Ist kein Anbieter eingeschaltet, kommt nichts dazu.

### Store (Unified)

The Store API provides a unified interface for browsing models and apps.

| Method | Endpoint                     | Description                   |
| ------ | ---------------------------- | ----------------------------- |
| GET    | `/api/store/recommendations` | Get recommended models + apps |
| GET    | `/api/store/search`          | Search across models and apps |
| GET    | `/api/store/info`            | Get system info (RAM, disk)   |

**GET /api/store/recommendations:**
Returns models recommended for the system's RAM capacity and featured apps.

```json
{
  "models": [
    { "id": "gemma4:26b-q4", "name": "Qwen 3 14B", ... }
  ],
  "apps": [
    { "id": "beispiel-app", "name": "Beispiel-App", "featured": true, ... }
  ],
  "systemInfo": { "availableRamGB": 64 }
}
```

**GET /api/store/search?q=query:**

```json
{
  "models": [...],
  "apps": [...],
  "query": "qwen"
}
```

**GET /api/store/info:**

```json
{
  "availableRamGB": 64,
  "availableDiskGB": 120,
  "totalDiskGB": 500
}
```

### Audit Logging

| Method | Endpoint                     | Description                                  |
| ------ | ---------------------------- | -------------------------------------------- |
| GET    | `/api/audit/logs`            | Get audit logs with pagination and filtering |
| GET    | `/api/audit/stats/daily`     | Get daily aggregated statistics              |
| GET    | `/api/audit/stats/endpoints` | Get endpoint usage statistics                |

**GET /api/audit/logs:**

Query Parameters:

- `limit`: Number of records (default: 50, max: 500)
- `offset`: Number of records to skip (default: 0)
- `date_from`: Start date (ISO 8601)
- `date_to`: End date (ISO 8601)
- `action_type`: HTTP method filter (GET, POST, PUT, DELETE, PATCH)
- `user_id`: Filter by user ID
- `endpoint`: Filter by endpoint (partial match)
- `status_min`: Minimum response status code
- `status_max`: Maximum response status code

Response:

```json
{
  "logs": [
    {
      "id": 1,
      "timestamp": "2026-01-15T10:30:00.000Z",
      "user_id": 1,
      "username": "admin",
      "action_type": "POST",
      "target_endpoint": "/api/flows",
      "request_method": "POST",
      "request_payload": { "title": "New Chat" },
      "response_status": 201,
      "duration_ms": 45,
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "error_message": null
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "has_more": true
  },
  "filters": {
    "date_from": null,
    "date_to": null,
    "action_type": null,
    "user_id": null,
    "endpoint": null,
    "status_min": null,
    "status_max": null
  },
  "timestamp": "2026-01-15T10:35:00.000Z"
}
```

**GET /api/audit/stats/daily:**

Query Parameters:

- `days`: Number of days to include (default: 30, max: 90)

Response:

```json
{
  "stats": [
    {
      "date": "2026-01-15",
      "total_requests": 1250,
      "unique_users": 5,
      "success_count": 1180,
      "client_error_count": 50,
      "server_error_count": 20,
      "avg_duration_ms": 45.23,
      "max_duration_ms": 2500
    }
  ],
  "days_included": 30,
  "timestamp": "2026-01-15T10:35:00.000Z"
}
```

**GET /api/audit/stats/endpoints:**

Query Parameters:

- `days`: Number of days to include (default: 7, max: 30)
- `limit`: Number of endpoints to return (default: 20, max: 100)

Response:

```json
{
  "endpoints": [
    {
      "target_endpoint": "/api/flows",
      "action_type": "GET",
      "request_count": 500,
      "unique_users": 3,
      "error_count": 5,
      "avg_duration_ms": 35.5,
      "last_called": "2026-01-15T10:30:00.000Z"
    }
  ],
  "days_included": 7,
  "timestamp": "2026-01-15T10:35:00.000Z"
}
```

**Notes:**

- All `/api/*` requests are automatically logged (except `/api/health` and `/api/metrics/*`)
- Sensitive data (passwords, tokens, API keys) is automatically masked as `***REDACTED***`
- Audit logs are stored for 90 days by default
- Only authenticated users can access audit logs

### Tailscale

| Method | Endpoint                    | Auth     | Description                                               |
| ------ | --------------------------- | -------- | --------------------------------------------------------- |
| GET    | `/api/tailscale/status`     | Required | Get current Tailscale connection status                   |
| GET    | `/api/tailscale/peers`      | Required | List connected Tailscale peers                            |
| POST   | `/api/tailscale/install`    | Required | Install Tailscale on the host system                      |
| POST   | `/api/tailscale/connect`    | Required | Connect with auth key (auto-enables `serve`)              |
| POST   | `/api/tailscale/disconnect` | Required | Disconnect from Tailscale                                 |
| GET    | `/api/tailscale/serve`      | Required | Report `tailscale serve` state + HTTPS-cert readiness     |
| POST   | `/api/tailscale/serve`      | Required | Enable browser-trusted remote HTTPS (serve → Traefik:443) |
| DELETE | `/api/tailscale/serve`      | Required | Disable serve (remote falls back to raw Tailscale IP)     |

All endpoints require authentication. The route group uses a dedicated `tailscaleLimiter`.

**GET /api/tailscale/serve Response:**

```json
{
  "installed": true,
  "enabled": true,
  "httpsAvailable": true,
  "dnsName": "arasul.tail1234.ts.net"
}
```

`httpsAvailable` is `false` until MagicDNS + HTTPS certs are enabled once in the
Tailscale admin console; until then remote access uses the raw Tailscale IP.

**GET /api/tailscale/status Response:**

```json
{
  "installed": true,
  "running": true,
  "connected": true,
  "ip": "100.x.x.x",
  "hostname": "arasul-device",
  "dnsName": "arasul-device.tailnet.ts.net",
  "tailnet": "tailnet.ts.net",
  "version": "1.x.x",
  "peers": [],
  "certDomains": []
}
```

> **`detectionError`:** If the backend cannot run the host probe (helper image
> `alpine:latest` not pullable, docker-proxy unreachable, exec error/timeout),
> the response is `{ ...empty, installed: false, detectionError: true }`. This is
> a transient/retryable condition and must **not** be treated as "Tailscale not
> installed" — clients keep the last-known status and offer a retry.

**GET /api/tailscale/peers Response:**

```json
{
  "peers": [
    {
      "id": "nodekey:abc123",
      "hostname": "laptop",
      "ip": "100.x.x.y",
      "online": true
    }
  ]
}
```

**POST /api/tailscale/connect:**

```json
{
  "authKey": "tskey-auth-...",
  "hostname": "arasul-device" // optional
}
```

---

### License

All endpoints require admin authentication (`requireAuth` + `requireRole('admin')`).

| Method | Endpoint                      | Description                                 |
| ------ | ----------------------------- | ------------------------------------------- |
| GET    | `/api/license/info`           | Get current license status + HW fingerprint |
| GET    | `/api/license/fingerprint`    | Get device hardware fingerprint             |
| POST   | `/api/license/activate`       | Activate a license key                      |
| GET    | `/api/license/check/:feature` | Check if a feature gate is allowed          |

**GET /api/license/info Response:**

```json
{
  "valid": true,
  "tier": "professional",
  "customer": "Muster GmbH",
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "features": { "maxUsers": 5, "maxApps": -1, "externalApi": true, "customModels": false },
  "hardwareFingerprint": "sha256:abc...",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/license/fingerprint Response:**

```json
{
  "hardwareFingerprint": "sha256:abc123...",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/license/activate:**

```json
// Request
{
  "licenseKey": "ARAS-XXXX-XXXX-XXXX"
}

// Response
{
  "success": true,
  "license": {
    "tier": "professional",
    "customer": "Muster GmbH",
    "expiresAt": "2027-01-01T00:00:00.000Z"
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/license/check/:feature Response:**

```json
{
  "feature": "externalApi",
  "allowed": true,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

---

### GDPR / Data Privacy

`export` und `me` gelten für beide Rollen (die eigenen Daten); `ziele` und `categories` sind Admin.

| Method | Endpoint               | Auth  | Description                                                                                                                                                          |
| ------ | ---------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/gdpr/export`     | Beide | Full GDPR data export (Art. 20) as JSON file                                                                                                                         |
| GET    | `/api/gdpr/categories` | Admin | List data categories with record counts                                                                                                                              |
| GET    | `/api/gdpr/ziele`      | Admin | Angesteckte Datenträger als Export-Ziel (Plan 023 J3). Die Antwort trägt einen `hinweis`, der „keine Platte angesteckt" von „Ordner nicht eingebunden" unterscheidet |
| DELETE | `/api/gdpr/me`         | Beide | Delete own account (Art. 17 — right to erasure)                                                                                                                      |

**GET /api/gdpr/export:**

Returns a JSON file download (`Content-Disposition: attachment`) containing all personal data: profile, flow runs (arguments and result), login history, active sessions, activity log, security events. Limited to the 1,000 most recent audit entries. Aufträge an das Sprachmodell (`llm_jobs`) leben eine Stunde und sind keine Auskunftskategorie.

Scheitert eine Kategorie, steht der Grund in ihrem Block als `unvollstaendig`
(Zeichenkette) und zusätzlich in `_meta.unvollstaendig` (Liste aus
`{ kategorie, grund }`). Eine leere Liste heißt also wirklich
"dazu gibt es nichts" und nicht "die Abfrage ist kaputt" (Stand 19.08.2026:
vorher verschluckte ein `.catch` jeden Fehler).

```json
{
  "_meta": {
    "exportDate": "2026-01-15T10:00:00.000Z",
    "exportVersion": "1.0",
    "system": "Arasul Platform",
    "userId": 1,
    "username": "admin",
    "unvollstaendig": []
  },
  "profile": { "id": 1, "username": "admin", "email": "...", "created_at": "..." },
  "conversations": { "count": 42, "data": [...] },
  "messages": { "count": 1500, "data": [...] },
  "attachments": { "count": 5, "note": "Dieser Export enthaelt nur die Metadaten der Anhaenge.", "data": [...] },
  "loginHistory": { "count": 100, "data": [...] },
  "activeSessions": { "count": 2, "data": [...] },
  "activityLog": { "count": 1000, "data": [...] },
  "securityEvents": { "count": 15, "data": [...] }
}
```

**GET /api/gdpr/categories:**

```json
{
  "categories": [
    { "name": "Profil", "description": "Benutzername, E-Mail, Erstelldatum", "count": 1 },
    { "name": "Chat-Konversationen", "description": "Alle Gespräche mit der KI", "count": 42 },
    { "name": "Aktivitätsprotokoll", "description": "API-Zugriffe und Aktionen", "count": 1000 },
    { "name": "Anmeldehistorie", "description": "Login-Versuche und Sessions" },
    {
      "name": "Sicherheitsereignisse",
      "description": "Passwortänderungen, Konfigurationsänderungen"
    }
  ],
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**DELETE /api/gdpr/me:**

DSGVO Art. 17 right to erasure. Löscht Chats samt Anhängen, die aktiven Sessions und die Zugangs-Zeile. Compliance-Trails (audit logs, login history) werden anonymisiert (user_id auf NULL) statt gelöscht, wie Art. 17(3)(b) es erlaubt.

**Der letzte Admin (Plan 023 J4):** seine Daten werden gelöscht, seine Zugangs-Zeile bleibt stehen. Sonst wäre das Gerät unbedienbar, und mit einem Zugang je Gerät (Entscheidung E1) wäre Art. 17 grundsätzlich unerreichbar. Die Antwort trägt dann `zugangBleibt: true` und sagt es im `message`-Feld.

```json
// Request — confirmation token is mandatory
{
  "confirm": "LOESCHEN-BESTAETIGT"
}

// Response
{
  "ok": true,
  "message": "Account und alle persönlichen Daten wurden gelöscht.",
  "summary": {
    "flow_runs": 12,
    "active_sessions": 2,
    "anon_audit_logs": 100,
    "anon_api_audit_logs": 900,
    "anon_login_attempts": 50,
    "admin_users": 1
  },
  "zugangBleibt": false,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**Notes:**

- Session cookie (`arasul_session`) is cleared on successful account deletion
- The confirmation token must be the exact string `LOESCHEN-BESTAETIGT`

---

### Sichern und Wiederherstellen

Alle Endpunkte verlangen eine Anmeldung als `admin` (`requireAuth` +
`requireRole('admin')`).

**Zwei verschiedene Dinge, und sie waren bis zum 23.08.2026 eines.**
`backupEnabled` stand auf „hängt eine externe Platte dran". Auf dem Orin
gemessen: keine Platte angesteckt, Antwort `false` — und gleichzeitig 38
Postgres-Sicherungen, 328 WAL-Segmente, letzte Sicherung drei Stunden alt. Wer
eine eigene Anwendung dagegen baute, schloss daraus, die Sicherung sei aus.
Seit Phase C9 heißt die Antwort auf die erste Frage `sichertWirklich`, und die
zweite hat eine eigene: `ausserhalb`.

| Method | Endpoint                        | Beschreibung                                               |
| ------ | ------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/backup/status`            | Sichert das Gerät? Wann lag zuletzt eine Kopie außer Haus? |
| GET    | `/api/backup/sicherungen`       | Was liegt da — Name, Art, Größe, Datum                     |
| POST   | `/api/backup/sicherung`         | Jetzt sichern (dauert Minuten, antwortet erst danach)      |
| POST   | `/api/backup/wiederherstellung` | Zurück auf eine Sicherung, danach laufen die Apps wieder   |
| POST   | `/api/backup/test`              | Wiederherstellungstest gegen eine Wegwerf-Datenbank        |

Gesichert werden vier Dinge, und die Frage dahinter ist jedes Mal dieselbe: was
bekommt der Kunde nach einem Geräteverlust nicht zurück, wenn es fehlt?

| Art        | Was                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` | Nutzer und Rollen, Apps und Stände, Freigaben, Schlüssel je App, Flow-Läufe mit Schritten, Freigabe-Anfragen, Modell-Überschreibungen, das Migrationsbuch                       |
| `apps`     | Die **Pakete** der Apps (`/arasul/apps/<id>/<version>/`) — Manifest, fertiges Frontend, Dockerfile mit Kontext. Die Images werden nicht gesichert, sie werden daraus neu gebaut |
| `flows`    | Die Flow-Dateien, die ein Mensch am Gerät geschrieben hat (`/arasul/flows`)                                                                                                     |
| `config`   | `.env`, Zertifikate, Traefik, Geheimnisse — **ohne** den Sicherungsschlüssel selbst                                                                                             |

App-**Volumes** stehen nicht in dieser Liste, weil es keine gibt: eine App
bekommt weder Bind-Mount noch benanntes Volume
(`services/app/appContainer.js`); ein abgeschirmter Datenordner je App kommt
mit den D-Phasen.

**GET /api/backup/status Response:**

```json
{
  "data": {
    "sichertWirklich": true,
    "letzteSicherung": {
      "status": "completed",
      "zeitpunkt": "2026-08-27T02:00:54+00:00",
      "alterStunden": 3,
      "veraltet": false,
      "verschluesselt": true,
      "groesse": "4.9G",
      "apps": "true",
      "flows": "true",
      "konfiguration": "true"
    },
    "ausserhalb": {
      "vorhanden": true,
      "zeitpunkt": "2026-08-27T02:03:11+02:00",
      "bytes": 5211334,
      "dateien": 4,
      "ziel": "/arasul/extern",
      "letzterVersuch": "kopiert"
    },
    "wiederherstellungstest": { "status": "ok", "zeitpunkt": "...", "tabellen": 14 },
    "letzteWiederherstellung": null,
    "laeuftGerade": null
  },
  "timestamp": "2026-08-27T10:00:00.000Z"
}
```

`ausserhalb` beantwortet die Frage „wann lag zuletzt eine Kopie **außerhalb**
des Geräts" — auf einem USB-Datenträger oder einer SMB-Freigabe im Kundennetz.
Kein Cloud-Ziel. Hat es noch nie eine gegeben, ist die Antwort leer und sagt
das; `letzterVersuch` nennt dann den Grund (`kein_ziel`, `nicht_eingehaengt`,
`nicht_beschreibbar`, `abgeschaltet`, `fehler`):

```json
{
  "vorhanden": false,
  "zeitpunkt": null,
  "bytes": null,
  "dateien": null,
  "ziel": null,
  "letzterVersuch": "kein_ziel"
}
```

**GET /api/backup/sicherungen Response:**

```json
{
  "data": [
    {
      "art": "postgres",
      "zweck": "Datenbank",
      "name": "arasul_db_20260827_020054.sql.gz",
      "bytes": 4211334,
      "zeitpunkt": "2026-08-27T02:00:54.000Z"
    },
    {
      "art": "apps",
      "zweck": "Die Pakete der Apps",
      "name": "apps_20260827_020054.tar.gz",
      "bytes": 812334,
      "zeitpunkt": "2026-08-27T02:00:58.000Z"
    }
  ],
  "anzahl": 42,
  "bytes": 5211334000,
  "ordner": "/arasul/backups",
  "timestamp": "2026-08-27T10:00:00.000Z"
}
```

Gelesen wird die Platte, nicht der Bericht der letzten Nacht: der Bericht sagt,
was getan wurde, die Platte sagt, was heute noch zurückspielbar ist.

**POST /api/backup/wiederherstellung:**

```json
{ "datei": "arasul_db_20260827_020054.sql.gz", "bestaetigung": "wiederherstellen" }
```

`datei` ist ein **Name**, kein Pfad, und liegt im Sicherungsordner; ohne Angabe
gilt die neueste. `bestaetigung` muss das Wort `wiederherstellen` sein — kein
`true`: dieser Aufruf ersetzt die ganze Datenbank, und ein `{"bestaetigung":
true}` schreibt sich in einem Skript versehentlich hin.

Zwei Schritte in einem Aufruf, und der zweite ist der, den man vergisst:
`wiederherstellen.sh` im Sicherungs-Container holt Datenbank, App-Pakete und
Flow-Dateien zurück; danach spielt das Backend **jeden App-Stand aus seinem
Paket neu ein** — Image bauen (auf einem leeren Gerät gibt es keines mehr),
frischer API-Schlüssel, Container starten. Ohne den zweiten Schritt wäre eine
Wiederherstellung eine Datenbank voller Apps, von denen keine antwortet.

```json
{
  "data": {
    "erfolg": true,
    "bericht": {
      "status": "fertig",
      "tabellen": 96,
      "apps": "ok",
      "flows": "ok",
      "vorher_gesichert": "vorher_20260827_101500.sql.gz"
    },
    "apps": [
      {
        "app_id": "beispielapp",
        "stand": "live",
        "version": "1.0.0",
        "erfolg": true,
        "grund": null
      }
    ],
    "ausgabe": "…"
  },
  "timestamp": "2026-08-27T10:20:00.000Z"
}
```

Eine App, die nicht hochkommt, hält die anderen nicht auf; sie steht mit ihrem
Grund in `apps` und `erfolg` ist dann `false`.

**Fehler:** `409 CONFLICT`, wenn schon ein Sicherungs- oder
Wiederherstellungslauf läuft. `503 SERVICE_UNAVAILABLE`, wenn der
Sicherungsdienst nicht läuft — ohne ihn lässt sich weder sichern noch
zurückspielen.

---

### Ops Overview

Single consolidated endpoint that aggregates backup status, restore-drill status, service health, active alerts, undelivered notifications, current metrics, and retention counts for the System-Gesundheit dashboard widget.

| Method | Endpoint            | Auth  | Description                         |
| ------ | ------------------- | ----- | ----------------------------------- |
| GET    | `/api/ops/overview` | Admin | Aggregated platform health snapshot |

**GET /api/ops/overview Response:**

```json
{
  "status": "OK",
  "warnings": [],
  "criticals": [],
  "backup": {
    "status": "ok",
    "timestamp": "2026-01-15T08:00:00.000Z",
    "ageHours": 2,
    "stale": false,
    "postgresBackups": 3,
    "walSegments": 12,
    "totalSize": "4.2 GB"
  },
  "restore_drill": {
    "status": "ok",
    "timestamp": "2026-01-10T12:00:00.000Z",
    "ageDays": 5,
    "stale": false,
    "verifiedTables": 42,
    "duration": 120
  },
  "services": {
    "total": 12,
    "healthy": 12,
    "degraded": 0,
    "down": 0,
    "down_services": []
  },
  "alerts": {
    "active": 0,
    "items": []
  },
  "notifications": {
    "unsent_24h": 0,
    "unsent_critical_24h": 0
  },
  "metrics": {
    "cpu_percent": 15,
    "ram_percent": 42,
    "gpu_percent": 5,
    "temperature_c": 45,
    "disk_percent": 35
  },
  "retention_counts": {
    "self_healing_events": 120
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

`status` is `OK`, `WARNING`, or `CRITICAL`. `warnings` and `criticals` are human-readable string arrays. The backup section returns `{ "status": "missing" }` if the backup report file cannot be read.

---

### Werksreset (Plan 023 B5)

Setzt das Gerät zurück. Zwei Stufen: `inhalte` löscht alles, was der Nutzer
erzeugt hat, und lässt die Einrichtung stehen; `auslieferung` löscht zusätzlich
die Einrichtung selbst (Zugangsdaten, Flows,
hinterlegte Fremdzugänge, Protokolle, Messwerte), danach läuft wieder die
Ersteinrichtung. `modelleLoeschen` entfernt zusätzlich alle Modelle aus Ollama.

Welche Tabelle in welche Stufe fällt, steht ausschließlich in
`src/services/werksreset/tabellen.js`. Diese Klassifikation wird zur Laufzeit
gegen `information_schema` geprüft: findet sich eine Tabelle, die in keinem der
vier Töpfe steht, liefert die Vorschau `durchfuehrbar: false` und die Ausführung
antwortet mit `409 CONFLICT`. Ein Werksreset, der etwas stehen lässt, behauptet
sonst eine Vollständigkeit, die er nicht hat.

| Method | Endpoint                   | Auth  | Description                                     |
| ------ | -------------------------- | ----- | ----------------------------------------------- |
| GET    | `/api/werksreset/vorschau` | Admin | Zählt vorher ab, was eine Stufe entfernen würde |
| POST   | `/api/werksreset`          | Admin | Führt den Werksreset aus                        |

**GET /api/werksreset/vorschau?stufe=auslieferung&modelle=false**

```json
{
  "stufe": "auslieferung",
  "modelleLoeschen": false,
  "geraetename": "arasul",
  "tabellen": [{ "name": "arasul.flow_runs", "zweck": "Flow-Läufe", "zeilen": 412 }],
  "zeilenGesamt": 412,
  "ordner": [{ "pfad": "/arasul/flows", "zweck": "Flow-Definitionen", "eintraege": 8 }],
  "unbekannteTabellen": [],
  "durchfuehrbar": true
}
```

**POST /api/werksreset**

```json
{ "stufe": "auslieferung", "bestaetigung": "arasul", "modelleLoeschen": false }
```

Beide Endpunkte sind gebremst: die Ausführung fünf Mal je Stunde und Nutzer, die
Vorschau zwanzig Mal in fünf Minuten. Gezählt werden alle Aufrufe, auch die mit
falsch getipptem Gerätenamen. Der Gerätename als Bestätigung schützt gegen den
Fehlgriff, nicht gegen eine übernommene Sitzung in einer Schleife.

Vor jedem Löschen entwertet die Stufe `auslieferung` das Erstpasswort in der
`.env` (`ADMIN_PASSWORD=REDACTED_AFTER_BOOTSTRAP`). Scheitert das, bricht der
Reset ab, bevor irgendetwas gelöscht ist. Zusätzlich setzt er den Merker
`arasul.geraet.werksreset_am`: dasselbe Passwort kommt auch als Docker-Secret
herein (`ADMIN_PASSWORD_FILE`), und die Datei liegt read-only im Container.
Solange der Merker steht, legt `bootstrap.js` keinen Administrator an; die
Ersteinrichtung löscht ihn. Die Reihenfolge ist Absicht:
`bootstrap.js` legt beim Start wieder einen Administrator an, sobald keiner
existiert und `ADMIN_PASSWORD` noch gültig ist. Ein Stromausfall zwischen
Löschen und Entwerten würde das Gerät also mit leerer Tabelle und gültigem alten
Passwort hochfahren.

Nach der Stufe `auslieferung` wird zusätzlich der Identitäts-Zwischenspeicher
von `requireAuth` geleert und die Oberfläche meldet sich ab. Ohne das käme die
auslösende Sitzung noch bis zu 60 Sekunden durch, gegen eine Datenbank ohne
einen einzigen Administrator.

`bestaetigung` muss dem Gerätenamen entsprechen (`system_settings.hostname`,
ersatzweise `MDNS_NAME` oder der Hostname des Containers). Ein festes Wort wie
„LÖSCHEN" tippt man im Zweifel auch auf dem falschen Gerät; ein Gerätename nicht.
Bei Abweichung: `400 VALIDATION_ERROR`.

Die Antwort ist der Bericht: geleerte Tabellen mit Zeilenzahl, geleerte Ordner,
Ergebnis für die Modelle (falls `modelleLoeschen`), dazu die Dauer.

---

### Flows

Flows are Markdown files with YAML front matter under `data/flows/` (container path `FLOWS_DIR`, default `/arasul/flows`) — **there is no database table**. The file is the source of truth; these routes are a thin layer over the on-disk registry. Every write is validated against the schema _before_ it is persisted (serialize → re-parse → atomic rename), so a broken flow can never reach the disk. Ein Mitarbeiter darf Flows lesen (`GET /api/flows`, `GET /api/flows/:name`) und seine eigenen Läufe (`/laeufe/*`); anlegen, ändern, löschen, Vorlagen, Werkzeuge und die rohe Datei sind Admin.

| Method | Endpoint                            | Description                                                                                                                             |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/flows`                        | List all flows; broken files reported separately                                                                                        |
| GET    | `/api/flows/werkzeuge`              | Tool names a flow may declare, each with `verfuegbar`                                                                                   |
| GET    | `/api/flows/:name`                  | Get a single flow                                                                                                                       |
| GET    | `/api/flows/:name/datei`            | Get the raw Markdown file (`text/markdown`)                                                                                             |
| GET    | `/api/flows/vorlagen`               | List uploaded style templates (`{ name, groesse, hochgeladen }`)                                                                        |
| POST   | `/api/flows/vorlagen`               | Upload a style template (multipart field `datei`; .docx/.pdf/.md/.txt/.html, 20 MB)                                                     |
| DELETE | `/api/flows/vorlagen/:name`         | Delete a style template                                                                                                                 |
| POST   | `/api/flows`                        | Create a flow (409 if the name exists)                                                                                                  |
| PUT    | `/api/flows/:name`                  | Update an existing flow (404 if it does not exist)                                                                                      |
| DELETE | `/api/flows/:name`                  | Delete a flow                                                                                                                           |
| GET    | `/api/flows/laeufe`                 | List the caller's runs (`?limit`, `?conversation_id`, `?status`, `?flow` = Flow-Name-Filter); rows include the run's `arguments` (JSON) |
| POST   | `/api/flows/laeufe`                 | Start a run detached; returns `202 { runId }` immediately                                                                               |
| GET    | `/api/flows/laeufe/:id`             | One run with its steps (`?raw=1` includes raw step data)                                                                                |
| GET    | `/api/flows/laeufe/:id/stream`      | SSE event stream: replay stored history, then live steps                                                                                |
| POST   | `/api/flows/laeufe/:id/abbrechen`   | Cancel a running run (404 if not running/owned)                                                                                         |
| GET    | `/api/flows/laeufe/:id/frage`       | Die offene Rückfrage eines Laufs, oder `null` (Plan 023 I3). Für den Fall, dass die Seite neu geladen wird, während der Flow wartet     |
| POST   | `/api/flows/laeufe/:id/antwort`     | Eine Rückfrage beantworten (`{antwort}`). 404, wenn nichts offen ist                                                                    |
| POST   | `/api/flows/laeufe/:id/wiederholen` | Retry a **failed** run of a flow with a declared step chain (body `{}`); `202 { runId, uebernommeneSchritte }`                          |

**Starting flows.** A flow runs from the chat (slash command `/name`) or via the
external HTTP trigger `POST /api/v1/external/flows/:name/run` (API key, scope
`flow:run` — see the External API section). The former cron/event scheduling
(`flow_schedules`, `/flows/zeitplaene`, external `events/:name`) was removed on
2026-07-28; there is no schedule mechanism anymore.

**Prüfschritt & Annahmen-Protokoll (Plan 014, Phase 2).** Bei Dokument-Flows
(`ausgabe.format ≠ keins`) steht zwischen Entwurf und Ausgabe ein fester
Prüfschritt: deterministische Checks (Platzhalter-Reste, offene `[Stellen]`,
Gliederung, Ziel-Länge), eine LLM-Prüfrunde gegen Auftrag und Vorgaben,
höchstens **eine** Korrekturrunde. Das Laufprotokoll zeigt die Einzelprüfungen
als Schritt `pruefung` (plus ggf. `korrektur`). Statt Rückfragen gilt das
Annahmen-Protokoll: getroffene Annahmen landen als `flow_runs.annahmen`
(JSON-Array) am Lauf, kommen im SSE-Strom als Frame `{type:'annahmen'}` und in
den Lauf-Antworten der externen API (`annahmen`-Feld) mit. Der Prüfschritt
wirft nie — scheitert die Prüfrunde selbst, läuft der Entwurf unverändert
weiter und das Protokoll benennt das.

**Runs stream live and survive the tab (Plan 011, Schritt 12).** `POST /laeufe`
(`{ flow, args, conversation_id? }`) starts the run **server-side**
and returns its `runId` at once — the run keeps going regardless of the client.
Das Arbeitsverzeichnis ist der erste im Flow deklarierte `ordner`; unbekannte
Felder im Body ergeben `400`. The client
then opens `GET /laeufe/:id/stream` (SSE, consumed via `fetch`+`getReader`, not
`EventSource`, so the Bearer token is sent). The stream sends a `verlauf` frame
with the stored run+steps first (so a **reconnecting** client sees everything up
to now), then live frames (`step_start`/`step_end`/`text`/`done`/`error`/`aenderungen`/`annahmen`),
and closes on `ende`. `step_start` fires when a step is **created** (for a
subagent: before it executes), `step_end` when it finishes; both carry the full
step row (including `parent_step_id` and `modell`) but never `raw_output` — the
view loads raw data on demand via `?raw=1`. The former `tool_start`/`tool_result`
frames are replaced by these step frames. Disconnecting does **not** stop the run. `abbrechen` sets
the run's abort signal, so a running flow actually stops rather than only being
marked cancelled in the DB. A backend restart marks any still-`laeuft` run as
`fehler` (a detached run cannot survive the process).

**Retry from failure (2026-07-29).** `POST /laeufe/:id/wiederholen` retries a
run with `status: 'fehler'` of a flow that declares a `schritte` chain (the
deterministic step editor is the default way to build flows). It starts a **new**
run of the same flow with the same arguments; the outputs of the old run's
successful top-level steps are reused (`vorabErgebnisse` in the step executor) —
they appear in the new run's log as steps with input
`(übernommen aus Lauf <id>)` and status `fertig` — and execution resumes at the
first failed step. `400` if the run is not failed or the flow has no step chain;
`404` if the run is unknown/foreign. Response: `202 { runId, uebernommeneSchritte }`.

### Freigabe-Anfragen (Phase C7)

Ein Flow kann anhalten und um Freigabe bitten (Werkzeug `freigabe_anfordern`).
Der Lauf steht dann auf `wartend`, und ein **Mensch** entscheidet — über die
Sitzung, nicht über einen Schlüssel.

| Method | Endpoint                                 | Description                                                              |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/freigabe-anfragen`                 | Die offenen Freigaben der Apps, die dem Aufrufer freigegeben sind        |
| POST   | `/api/freigabe-anfragen/:id/bestaetigen` | Ja. Der Lauf läuft ab dem angehaltenen Schritt weiter (Body `{}`)        |
| POST   | `/api/freigabe-anfragen/:id/ablehnen`    | Nein, Body `{ begruendung }` (Pflicht). Der Lauf endet als `abgebrochen` |

**Wer darf entscheiden.** Jeder, dem die App freigegeben ist (`app_members`,
Phase C2) — Administrator **und** Mitarbeiter. Der Flow nennt keine Person und
kein Rollenmodell (Entscheidung vom 27.08.2026): er beschreibt die Sache, nicht
die Zuständigkeit. Wer die App nicht freigegeben hat, bekommt `403`; eine
Anfrage, die es nicht gibt, `404`; eine, die nicht mehr offen oder deren Frist
abgelaufen ist, `409` — vier Gründe, vier Meldungen, weil der Mensch am anderen
Ende gerade auf „Bestätigen" gedrückt hat.

**Die Frist** steht als `frist_minuten` in den `parameter` des Schritts; ohne
Angabe gilt `FLOW_FREIGABE_FRIST_MINUTEN` (Vorgabe 1440 = ein Tag). Läuft sie
ab, endet der Lauf als `abgelaufen`.

**Nicht zu verwechseln mit `/api/freigaben`** (Admin): das ist die Freigabe
einer _App_ für einen Menschen. Das eine ist die Voraussetzung für das andere.

**Antwort von `POST …/bestaetigen`:** `{ data: { id, run_id, app_id, stand,
flow_name, titel, status, entschieden_am, benutzer, fortgesetzt } }`.
`fortgesetzt: false` heißt: die Entscheidung steht, aber niemand führt den Lauf
mehr weiter (das Backend ist zwischendurch neu gestartet). Das wird gesagt und
nicht verschwiegen.

Die App selbst liest den Stand über `GET /api/v1/external/freigaben` (siehe
External API) — lesen darf sie, entscheiden nicht.

### Notizen (Phase D1)

Der Zettel in der rechten Spalte der Shell. **Einer je Mensch**, kein Notizbuch
mit vielen Blättern; wer mehrere Blätter braucht, braucht eine App dafür.

| Method | Endpoint       | Description                                |
| ------ | -------------- | ------------------------------------------ |
| GET    | `/api/notizen` | Meinen Zettel lesen                        |
| PUT    | `/api/notizen` | Meinen Zettel schreiben, Body `{ inhalt }` |

Antwort in beiden Fällen `{ data: { inhalt, geaendert_am } }`. Wer noch nichts
geschrieben hat, bekommt `{ inhalt: '', geaendert_am: null }` und **keine
`404`** — „ich habe noch nichts geschrieben" ist kein Fehler.

**Keine Kennung in der Adresse.** Der Zettel gehört dem Angemeldeten; wer das
ist, sagt die Sitzung. Ein `/api/notizen/:id` wäre eine Einladung, die Nummer
eines anderen zu probieren. **Kein `DELETE`:** `PUT { "inhalt": "" }` ist der
leere Zettel, und zwei Wege in denselben Zustand sind einer zu viel.
`inhalt` fasst höchstens 20 000 Zeichen (`schemas/notizen.js`), darüber `400`.

Administrator **und** Mitarbeiter — ein Zettel ist Arbeit, keine Verwaltung.

> The `/laeufe` routes are registered before `/:name`, so `laeufe` (like
> `werkzeuge`, `vorlagen`) is a reserved segment: a flow named
> exactly `laeufe` could not be fetched via `GET /:name`.
>
> The former preview endpoints `POST /api/flows/vorschau` and
> `POST /api/flows/vorschau-laufzeit` were removed with the 2026-08-02 flows
> rework (the editor no longer shows a file/runtime preview).

**Runs (Plan 011, Schritt 9).** A run persists in the database (`flow_runs` +
`flow_run_steps`) so it survives closing the browser tab; the live stream
(Schritt 12) reloads the stored history on reconnect. Runs are scoped by owner:
a run belonging to another user returns `404`, never `403` — its existence is
not revealed. Each step stores a condensed `output` (what reaches the
orchestrator) separately from `raw_output` (page/file content, log-only, loaded
only with `?raw=1`). Statuses: `laeuft | wartend | fertig | fehler | abgebrochen | abgelaufen`.
`wartend` und `abgelaufen` kamen mit Phase C7 (Freigaben) dazu: `wartend` hält
an einer Freigabe an und ist **kein** Endzustand — derselbe Lauf läuft nach der
Bestätigung ab dem angehaltenen Schritt weiter. `abgelaufen` heißt: niemand hat
innerhalb der Frist entschieden. Eine Ablehnung ist `abgebrochen`, mit der
Begründung in `error` — ein Mensch hat den Lauf beendet, und das ist kein
Fehler.

**Agenten-Baum (Migration 124).** Steps form a real tree: a subagent step is
created **before** the role executes, and the role's inner tool calls become
child steps via `flow_run_steps.parent_step_id`; `modell` records which model
drove a subagent/model step. The run views that rendered each agent as a
collapsible tree (chat run card, Flow-Zentrale run detail) left the frontend
with phases B2 and B3 on 2026-08-26; the data stays: live via the
`step_start`/`step_end` frames, afterwards from the stored steps. D4 decides
how runs are read in the target picture.

**File changes overview (Plan 011, Schritt 16).** A flow writes and deletes
files without confirmation, so every run that _can_ change files (declares
a writing `dateien_*` tool or a document-producing `ausgabe`) is
snapshotted before and after; the diff is
stored on `flow_runs.changes` and returned inside the run object
(`[{ pfad, art: neu|geaendert|geloescht, vorher, nachher, gekuerzt, hinweis }]`).
A finishing run also emits it live as an `aenderungen` frame so the open run card
shows it without a refetch; on reconnect it arrives inside the `verlauf` run.
Bounded in count and per-file preview length; `null` (column) means not tracked
(a read-only run). Never fails a run — a failed snapshot just omits the overview.

`:name` and the `name` field are restricted to lowercase letters, digits and hyphens (1–50 chars), and must start and end with a letter or digit — the name becomes both the filename and the `/name` slash command in chat.

**File format** (`data/flows/zusammenfassung.md`) — the YAML head declares what the flow needs and may do, the Markdown body is the prompt and carries `{{argument}}` placeholders. Every placeholder must have a matching entry in `argumente`, otherwise the file is rejected.

```yaml
---
name: zusammenfassung
beschreibung: Liest die Dateien im Arbeitsordner und fasst sie zu einem Thema zusammen.
modell: gemma4:26b-q4 # optional, sonst das Standardmodell
argumente:
  - name: thema
    typ: freitext # freitext | auswahl
    beschreibung: Das Thema, unter dem zusammengefasst wird
    pflicht: true
    # optionen: [...]   # nur bei typ=auswahl (pflicht dort)
    # standard: "..."   # schließt pflicht=true aus
ordner: [/arasul/flows/arbeit/demo] # absolute Pfade im Backend-Container; der ERSTE ist das Arbeitsverzeichnis
werkzeuge: [dateien_lesen, dateien_suchen, subagent]
rollen:
  - name: leser
    beschreibung: Liest eine Datei und extrahiert Fakten
    werkzeuge: [dateien_lesen] # nie mehr als der Flow selbst darf
    ergebnis: { felder: [fakten], max_zeichen: 2000 }
    prompt: Lies die Datei und gib nur die belegten Fakten zurück.
schritte: # optional (B7): deterministische, fest geordnete Kette
  - name: lesen # Schrittname = {{platzhalter}} für spätere Schritte
    typ: subagent # subagent (Rolle) | werkzeug (direkter Werkzeug-Aufruf)
    rolle: leser
    auftrag: Lies die gefundenen Dateien. # Vorlage: {{argument}}, {{schritt}}, {{vorher}}
    iterationen: 1 # Schritt bis zu N-mal wiederholen (1–10, default 1)
    # wiederhole_ueber: gliederung  # optional: Schleife über eine LISTE (s. u.)
    # modell: qwen3:32b            # optional: Modell nur für diesen Schritt
grenzen:
  max_aufrufe: 20 # Subagent-Aufrufe über ALLE Ebenen
  zeitlimit_s: 900
  werkzeug_runden: 10
  max_tiefe: 2 # nesting depth of subagent roles (1–5, default 2)
ausgabe: # optional (Flows-Umbau 2026-08-02): was am Ende herauskommt
  format: pdf # keins | markdown | pdf | docx (default: keins = nur Text-Antwort)
  dateiname: 'angebot-{{kunde}}-{{datum}}' # Muster ohne Endung; default <flowname>-<datum>
  vorlage: angebot-muster.docx # Stilvorlage aus data/flows/vorlagen/
  laenge: { stufe: mittel, wortzahl: 900 } # kurz|mittel|ausfuehrlich; wortzahl überstimmt
  sprache: Deutsch
  tonalitaet: formell # formell | neutral | locker
  gliederung: [Zusammenfassung, Details, Nächste Schritte]
---
Recherchiere gründlich zum Thema {{thema}}.
```

**Output (`ausgabe`, 2026-08-02).** Declares what a run produces. Before the run, the runner appends plain-language writing instructions to the system prompt (language, tonality, length band — `kurz` ≈ 300–600 words, `mittel` ≈ 800–2000, `ausfuehrlich` ≥ 2500, a concrete `wortzahl` wins —, the `gliederung` section list, and the extracted text of the `vorlage` as a style/structure reference). With a document format (`markdown|pdf|docx`) the model is additionally required to return the **complete document content as Markdown** as its final answer; after a successful run the runner renders that Markdown (pdfkit for PDF, the pure-JS `docx` package for Word) and writes it collision-free into the working directory (`fix.pdf`, `fix-2.pdf`, …). The write is recorded as a `dokument_ausgabe` step and shows up in the run's file-changes overview; a failed document render marks the run `fehler`. Filename pattern placeholders: `{{argument}}` and `{{datum}}` (YYYY-MM-DD).

**Style templates (`/api/flows/vorlagen`).** Uploaded files live in `FLOWS_DIR/vorlagen/` (same volume as the flows, included in backups). For `.pdf`/`.docx` the text is extracted **at upload time** via the Document Indexer (`POST /extract-text`, multipart) and stored as a `<name>.extrahiert.txt` sidecar — a template whose text cannot be read is rejected with `400`, and runs never depend on the indexer. At run time the template text (capped at 8 000 chars) is injected into the prompt as a clearly delimited style/structure block; a missing template is silently skipped (the run must not fail because a template was deleted).

Valid `werkzeuge`: `dateien_lesen`, `dateien_schreiben`, `dateien_bearbeiten`, `dateien_anhaengen`, `dateien_suchen`, `symbol_suche`, `subagent`, `frage_nutzer` (nur in `betriebsart: rueckfragen`). Declaring `rollen` requires `subagent` and vice versa; `dateien_*` and `symbol_suche` require at least one entry in `ordner`.08.2026) together with the knowledge base, the sandbox container and the invoice flow; a flow declaring them is rejected. `dateien_suchen` finds files by glob (`muster`) and/or content (`text`, a case-insensitive substring — not a regex — reported with line numbers). `dateien_bearbeiten` (Harness v2, 2026-07-30) replaces one exact text block via search/replace (whitespace-tolerant fallback, `alle: true` for all occurrences); `dateien_anhaengen` appends a section to the end of a file (creates it if missing, file cap 16 MB) — the building block for generating long documents section by section instead of one giant write.

The optional `schritte` array (B7) makes orchestration deterministic: each step is either `typ: subagent` (delegates to a declared `rolle` with an `auftrag` template) or `typ: werkzeug` (calls one tool directly with `parameter`). Steps run in fixed order; a step's output is threaded into later steps as `{{stepname}}` (and `{{vorher}}` across `iterationen`), then the body prompt synthesizes the final answer. A `subagent` step requires the `subagent` tool and a matching role; a `werkzeug` step may only use a tool the flow itself declares. Empty `schritte` → the flow stays model-driven.

**Map over a list (`wiederhole_ueber`, Harness v2 2026-07-30).** A step may declare `wiederhole_ueber: <name>` referencing a flow argument or an EARLIER step. Its value is parsed as a list (JSON array — also when embedded in prose/code fences — else one entry per line, bullets/numbering stripped) and the step runs once per element (max 50) with `{{element}}`, `{{index}}`, `{{anzahl}}` and `{{vorher}}` in scope; the step's output is the concatenation of all element outputs. Mutually exclusive with `iterationen > 1`; the reference is schema-validated. "Ab Fehler wiederholen" adopts completed steps only UP TO the first `wiederhole_ueber` step (its entry count is dynamic). A step-level `modell` overrides the flow model for that step's delegation (a role's own `modell` still wins). Typical long-document pipeline: step 1 (`gliederung`) produces the outline as a JSON array, step 2 loops over it (`wiederhole_ueber: gliederung`) and appends each section via `dateien_anhaengen`.

`GET /api/flows/werkzeuge` returns each tool with a `verfuegbar` flag:

```json
{
  "data": [
    { "name": "dateien_lesen", "verfuegbar": true },
    { "name": "dateien_suchen", "verfuegbar": true }
  ],
  "timestamp": "2026-07-21T10:00:00.000Z"
}
```

A flow may declare a tool that is not built yet — the definition stays valid and saveable, and the tool reports why it did nothing when the flow runs. Every tool in the list above is built, so each entry currently reports `verfuegbar: true`.

**Folders and paths.** A flow may declare several folders in `ordner`; the **first one is the working directory**. Relative paths in the file tools resolve against it, deliberately not against whichever folder happens to contain a matching file — otherwise the same path would write to different places depending on what exists. Another declared folder is addressed by its full path. Every access is symlink-checked, so a symlink pointing out of the allowed folders is rejected even though the link itself sits inside one.

**GET /api/flows Response** — a single unparsable file must not break the list, so it is skipped and reported in `fehlerhaft` instead of failing the request. In the API the Markdown body is called `prompt`.

```json
{
  "data": [
    {
      "name": "zusammenfassung",
      "beschreibung": "Liest die Dateien im Arbeitsordner und fasst sie zu einem Thema zusammen.",
      "argumente": [{ "name": "thema", "typ": "freitext", "beschreibung": "", "pflicht": true }],
      "ordner": ["/arasul/flows/arbeit/demo"],
      "werkzeuge": ["dateien_lesen", "dateien_suchen", "subagent"],
      "rollen": [
        {
          "name": "leser",
          "beschreibung": "",
          "werkzeuge": ["dateien_lesen"],
          "ergebnis": { "felder": ["fakten"], "max_zeichen": 2000 },
          "prompt": "Lies die Datei und gib nur die belegten Fakten zurück."
        }
      ],
      "grenzen": { "max_aufrufe": 20, "zeitlimit_s": 900, "werkzeug_runden": 10, "max_tiefe": 2 },
      "prompt": "Fasse die Dateien zum Thema {{thema}} zusammen."
    }
  ],
  "fehlerhaft": [{ "name": "kaputt", "fehler": "Flow ist ungültig (werkzeuge.0): ..." }],
  "timestamp": "2026-07-21T10:00:00.000Z"
}
```

**POST /api/flows** — body is the API shape above with `prompt` instead of the Markdown body; everything except `name` and `prompt` is optional. Returns `201` with the normalized, saved definition in `data`.

```json
{
  "name": "zusammenfassung",
  "beschreibung": "Liest die Dateien im Arbeitsordner und fasst sie zu einem Thema zusammen.",
  "argumente": [{ "name": "thema", "typ": "freitext", "pflicht": true }],
  "ordner": ["/arasul/flows/arbeit/demo"],
  "werkzeuge": ["dateien_lesen", "dateien_suchen"],
  "prompt": "Fasse die Dateien zum Thema {{thema}} zusammen."
}
```

`PUT /api/flows/:name` takes the same body without `name` (it comes from the URL) and **merges**: fields omitted from the body keep their stored value. This is deliberate — sending only `{ "prompt": "…" }` to fix a typo must not silently wipe `werkzeuge`, `rollen`, `argumente`, `ordner` or `grenzen`. To actually clear a field, send it explicitly as an empty list.

`DELETE /api/flows/:name` responds with `{ "deleted": true, "timestamp": "..." }`.

**Errors:** `VALIDATION_ERROR` (400) for an invalid name, an unknown placeholder or any schema violation (with a `details.issues` list of `{ pfad, meldung }`), `NOT_FOUND` (404) for an unknown flow, `CONFLICT` (409) when creating a flow that already exists.

---

## External API (for external automations)

**Base Path:** `/api/v1/external`

Uses API key authentication instead of JWT. Create API keys via the web UI or POST to `/api/v1/external/api-keys`.

### LLM Chat

| Method | Endpoint                          | Auth    | Description                 |
| ------ | --------------------------------- | ------- | --------------------------- |
| POST   | `/api/v1/external/llm/chat`       | API Key | LLM chat with queue support |
| GET    | `/api/v1/external/llm/job/:jobId` | API Key | Get job status              |
| GET    | `/api/v1/external/llm/queue`      | API Key | Get queue status            |
| GET    | `/api/v1/external/models`         | API Key | Get available models        |

`/llm/chat` ist zustandslos: jeder Aufruf ist ein eigener Auftrag mit genau
der Vorgeschichte, die im `prompt` steht. Es gibt keine Konversation, an die
sich ein zweiter Aufruf anschließen könnte; wer einen Verlauf will, führt ihn
selbst und schickt ihn mit. Der Auftrag gehört dem Ersteller des
API-Schlüssels; ein Schlüssel, dessen Ersteller gelöscht wurde, bekommt
`403 FORBIDDEN` und muss neu erstellt werden. `GET /llm/job/:jobId` liefert
nur eigene Aufträge, eine Stunde nach ihrem Ende sind sie weg.

### Flows (Plan 013, B8)

Trigger flows from your own automations with an API key. The endpoint
scope is `flow:run` (included in the default endpoint set for new keys).

| Method | Endpoint                           | Auth    | Description                                                  |
| ------ | ---------------------------------- | ------- | ------------------------------------------------------------ |
| GET    | `/api/v1/external/flows`           | API Key | List available flows                                         |
| POST   | `/api/v1/external/flows/:name/run` | API Key | Run a flow; waits for the result by default                  |
| GET    | `/api/v1/external/flows/runs/:id`  | API Key | Poll a run's status/result (incl. `annahmen`)                |
| GET    | `/api/v1/external/freigaben`       | API Key | Die Freigaben dieser App nachlesen (`?lauf=<id>`); nur lesen |

**POST /api/v1/external/flows/:name/run** — body `{ "args"?: {…}, "wait_for_result"?: true, "timeout_seconds"?: 300 }`.
With `wait_for_result: true` (default) it blocks until the run reaches a terminal
state and returns `{ success, run_id, status, result, error, steps_used, annahmen }`; with
`false` it returns `202 { success, run_id, status: "laeuft" }` immediately. Runs
are owned by the API key's creator; an orphaned key (creator deleted) gets
`403 FORBIDDEN`.

> **Ein Flow mit Freigabe-Schritt gehört mit `wait_for_result: false` gestartet**
> (Phase C7). Er hält an, bis ein Mensch entscheidet — das kann Stunden dauern,
> und der wartende Aufruf läuft vorher in sein Zeitlimit (höchstens 30 Minuten).
> Die Lauf-Nummer kommt sofort; den Rest fragt man über
> `GET /flows/runs/:id` und `GET /freigaben?lauf=<id>` nach. This is the per-flow HTTP trigger; there is no scheduler on
> the device, recurring starts come from outside through this endpoint.

#### Zwei Namensräume, ein Schlüssel entscheidet (Phase C6)

Seit C6 gibt es zwei Arten von Schlüssel, und der Schlüssel selbst bestimmt,
welche Flows diese drei Endpunkte sehen:

| Schlüssel          | `api_keys`         | Sichtbare Flows                            |
| ------------------ | ------------------ | ------------------------------------------ |
| eines **Menschen** | `app_id IS NULL`   | die Flows der Plattform (`/arasul/flows/`) |
| einer **App** (C4) | `app_id` + `stand` | **nur** die dieser App in **diesem** Stand |

Das ist die Regel »nur eigene Flows«, und sie steht bewusst **nicht** als
Prüfung in den Routen, sondern in der Auswahl der Quelle: eine App sucht in
`app_flows` mit ihrer Kennung und ihrem Stand im `WHERE`. Sie kann den Flow
einer anderen App nicht einmal benennen. Eine Prüfung kann man an einer von
drei Routen vergessen; ein `WHERE` nicht.

`GET /api/v1/external/flows` gibt einem App-Schlüssel deshalb zusätzlich
`app` und `stand` zurück und die Flows in derselben Form wie
`GET /api/apps/:id/flows` (mit `modell`, `version`, `registriert_am`).

`GET /api/v1/external/flows/runs/:id` engt aus demselben Grund auch den Abruf
eines Laufs ein: der Schlüssel einer App gehört dem Administrator, der sie
eingespielt hat, und über `user_id` allein sähe die App dessen eigene Läufe
und die jeder anderen App desselben Geräts. Ein Lauf trägt seit Migration 173
`app_id` und `stand` mit.

`GET /api/v1/external/freigaben` (Phase C7) beantwortet die eine Frage, die
eine App zu einem wartenden Lauf hat: **worauf** wartet er? Der Namensraum
kommt wieder aus dem Schlüssel — ein Schlüssel eines Menschen (`app_id IS
NULL`) bekommt `403` mit dem Hinweis auf `/api/freigabe-anfragen`. Antwort:
`{ success, app, stand, freigaben: [{ id, run_id, flow_name, titel, status,
frist, angefragt_am, entschieden_am, entschieden_von, begruendung }] }`.
**Nur lesen.** Entschieden wird über die Sitzung eines Menschen; eine App, die
ihre eigene Freigabe erteilen könnte, wäre keine.

**POST /api/v1/external/llm/chat:**

```json
{
  "prompt": "Your question here",
  "model": "gemma4:26b-q4", // Optional
  "temperature": 0.7, // Optional
  "max_tokens": 2048, // Optional
  "thinking": false, // Optional
  "wait_for_result": true, // Optional (default: true)
  "timeout_seconds": 300 // Optional (default: 300)
}
```

**Response (wait_for_result=true):**

```json
{
  "success": true,
  "response": "AI generated text...",
  "model": "gemma4:26b-q4",
  "job_id": "uuid",
  "processing_time_ms": 1234
}
```

### Document Processing

| Method | Endpoint                                       | Auth    | Permission         | Description                          |
| ------ | ---------------------------------------------- | ------- | ------------------ | ------------------------------------ |
| POST   | `/api/v1/external/document/extract`            | API Key | `document:extract` | Pure text extraction (OCR if needed) |
| POST   | `/api/v1/external/document/analyze`            | API Key | `document:analyze` | Extract text + LLM analysis          |
| POST   | `/api/v1/external/document/extract-structured` | API Key | `document:extract` | Extract + structured JSON output     |

All endpoints accept `multipart/form-data` with a `file` field.

Supported file types: PDF, DOCX, TXT, MD, YAML, PNG, JPG, TIFF, BMP (max 50 MB).

**POST /api/v1/external/document/extract:**

Request: `multipart/form-data` with `file` field only.

```json
// Response:
{
  "success": true,
  "text": "Extracted document text...",
  "filename": "invoice.pdf",
  "char_count": 4521,
  "metadata": { "ocr_used": true, "language": "deu" },
  "processing_time_ms": 1234
}
```

**POST /api/v1/external/document/analyze:**

| Field             | Type   | Required | Description                            |
| ----------------- | ------ | -------- | -------------------------------------- |
| `file`            | File   | Yes      | Document to analyze                    |
| `prompt`          | string | No       | Analysis prompt (default: summarize)   |
| `model`           | string | No       | Model to use (default: system default) |
| `temperature`     | string | No       | Sampling temperature (default: "0.7")  |
| `max_tokens`      | string | No       | Max tokens (default: "4096")           |
| `timeout_seconds` | string | No       | Max wait time (default: "300")         |

```json
// Response:
{
  "success": true,
  "response": "AI analysis of the document...",
  "extracted_text": "Raw extracted text...",
  "filename": "invoice.pdf",
  "model": "gemma4:26b-q4",
  "processing_time_ms": 5678
}
```

**POST /api/v1/external/document/extract-structured:**

| Field             | Type   | Required | Description                           |
| ----------------- | ------ | -------- | ------------------------------------- |
| `file`            | File   | Yes      | Document to extract from              |
| `schema`          | string | Yes      | JSON schema describing desired output |
| `instructions`    | string | No       | Additional extraction instructions    |
| `model`           | string | No       | Model to use                          |
| `timeout_seconds` | string | No       | Max wait time (default: "300")        |

```json
// Response:
{
  "success": true,
  "data": {
    "invoice_number": "RE-2026-0412",
    "date": "2026-04-01",
    "vendor": "Muster GmbH",
    "total_gross": 1190.0
  },
  "raw_response": "{ ... LLM raw text ... }",
  "extracted_text": "Raw extracted text...",
  "filename": "invoice.pdf",
  "model": "gemma4:26b-q4",
  "processing_time_ms": 8901
}
```

### Deploy für das Ara-Kit (Phase C5)

Der Weg, auf dem ein Partner eine App auf das Gerät bringt — mit einem
Schlüssel und ohne Sitzung. Was ein Paket enthalten muss und wie der Schlüssel
entsteht, steht auf einer eigenen Seite:
[docs/features/APP-PAKET.md](../features/APP-PAKET.md).

| Method | Endpoint                             | Auth    | Scope        | Description                                            |
| ------ | ------------------------------------ | ------- | ------------ | ------------------------------------------------------ |
| GET    | `/api/v1/external/contract`          | API Key | —            | Der Vertrag zwischen Gerät und Kit                     |
| POST   | `/api/v1/external/apps`              | API Key | `app:deploy` | Ein Paket einspielen; rollt **immer** in `test`        |
| GET    | `/api/v1/external/apps/:id`          | API Key | `app:deploy` | Dieselbe Antwort wie `GET /api/apps/:id`               |
| POST   | `/api/v1/external/apps/:id/schalten` | API Key | `app:deploy` | Livestand setzen: `live` oder `zurueck`                |
| DELETE | `/api/v1/external/apps/:id`          | API Key | `app:deploy` | App weg — beide Container samt Volumes, nach Rückfrage |

`app:deploy` steht **nicht** in den Vorgabe-Bereichen
(`src/config/apiBereiche.js`). Der Schlüssel, den das Gerät jeder App beim
Einspielen mitgibt (C4), trägt ihn also nicht: keine App ersetzt eine andere.

**GET /api/v1/external/contract** — die einzige Quelle, gegen die das Kit seine
Vorlage prüft, und der Weg, auf dem es merkt, dass es zu einem Gerät nicht
passt. Antwort (gekürzt):

```json
{
  "data": {
    "kontrakt": 2,
    "arasul": "Vorserie",
    "app_json": { "schema": { "type": "object", "…": "JSON-Schema" }, "regeln": ["…"] },
    "flow_frontmatter": { "schema": { "…": "JSON-Schema" }, "rumpf": "…", "regeln": ["…"] },
    "koepfe": {
      "benutzer": "X-Arasul-User",
      "rolle": "X-Arasul-Role",
      "rollen": ["admin", "mitarbeiter"]
    },
    "paket": { "format": "tar.gz", "packen": "tar czf paket.tgz -C <ordner> .", "…": "Grenzen" },
    "schluessel": { "kopf": "X-API-Key", "bereiche": ["…"], "vorgabe": ["…"] },
    "endpunkte": [{ "verb": "POST", "pfad": "/api/v1/external/apps", "bereich": "app:deploy" }]
  }
}
```

`kontrakt` ist die **Kontraktversion**. Sie zählt hoch, wenn sich etwas ändert,
worauf ein Kit sich verlassen hat, und nicht, wenn eine Beschreibung präziser
wird. `regeln` nennt die Manifest-Regeln, die kein JSON-Schema trägt — Zod
übergeht seine `.refine`-Regeln beim Erzeugen des Schemas still, und gerade sie
sind die interessanten (»mindestens eines von Frontend und Backend«).

**Fassung 2 (Phase C6):** `flows` im Manifest ist keine Liste von Namen mehr,
sondern ein Verzeichnis — aus einer Forderung ist eine Lieferung geworden. Ein
Kit, das noch `"flows": ["a","b"]` schreibt, bekommt vom Gerät ein `400`.
`flow_frontmatter.regeln` sagt zusätzlich, was für einen Flow **aus einem
Paket** gilt (Dateiname ist der Name, kein `ordner`, Namensraum je App).

**POST /api/v1/external/apps** — Multipart mit dem Feld `paket`, einem
`.tar.gz` mit `app.json` im Wurzelverzeichnis. Das Gerät packt aus, prüft,
legt unter `/arasul/apps/<id>/<version>/` ab, **baut das Image aus dem
Dockerfile im Paket**, registriert die Flows aus `flows/*.md` (C6) und spielt
in den Teststand ein. Antworten: `201` mit dem Stand und den registrierten
Flows, `400` bei einem Paket, das nicht durchgeht (Symlink, fehlendes
`app.json`, fehlender Bauplan, fehlgeschlagener Bau, unlesbarer Flow), `409`
wenn diese Version gerade **live** ist (neue Fassung, neue Nummer), `413` wenn
das Archiv über 200 MB liegt.

Die Flows werden **vor** dem Bau geprüft: eine kaputte YAML-Kopfzeile findet
sich in Millisekunden, ein Image zu bauen dauert am Jetson Minuten.

Einen Parameter für den Stand gibt es nicht. Live schaltet ein Mensch.

**POST /api/v1/external/apps/:id/schalten** — Body `{ "ziel": "live" }` nimmt
die Version aus dem Teststand, `{ "ziel": "zurueck" }` die aus
`vorige_version`. Beides geht durch denselben Dienst wie das Einspielen: der
Container wird ersetzt und der API-Schlüssel des Standes erneuert. `zurueck`
ist ein **Tausch** — wer ihn zweimal ruft, ist wieder da, wo er angefangen hat.
Antworten: `200`, `409` ohne Teststand beziehungsweise ohne vorige Version.

**DELETE /api/v1/external/apps/:id** — Query
`?bestaetigung=<id>&dateien=true|false`. Ohne die passende `bestaetigung` ist
es `400`; die Rückfrage einer Schnittstelle ist ein Wort, das der Aufrufer
abtippen muss. Es fallen beide Container mitsamt ihren Volumes, beide Stände,
alle Freigaben, die Schlüssel der App, ihre registrierten Flows samt der
Einstellungen dazu — und seit C6 die am Gerät **gebauten Images** aller
Versionen (je Version schnell 200 MB). Mit `dateien=true` zusätzlich die
Ordner unter `/arasul/apps/<id>/`; ohne bleiben sie liegen (wie bei
`DELETE /api/apps/:id`). Die Antwort nennt unter `images_entfernt`, was
wirklich weg ist.

Gemessen wird der ganze Weg von `scripts/test/deploy-abnahme.sh`.

### API Key Management

| Method | Endpoint                           | Auth | Description        |
| ------ | ---------------------------------- | ---- | ------------------ |
| POST   | `/api/v1/external/api-keys`        | JWT  | Create new API key |
| GET    | `/api/v1/external/api-keys`        | JWT  | List API keys      |
| DELETE | `/api/v1/external/api-keys/:keyId` | JWT  | Revoke API key     |

**POST /api/v1/external/api-keys:**

```json
{
  "name": "erp-integration",
  "description": "API key for the ERP automation",
  "rate_limit_per_minute": 60,
  "allowed_endpoints": ["llm:chat", "llm:status", "document:extract", "document:analyze"],
  "expires_at": "2025-12-31T23:59:59Z"
}
```

`allowed_endpoints` nimmt seit Phase C5 nur noch bekannte Bereiche:
`llm:chat`, `llm:status`, `document:extract`, `document:analyze`, `flow:run`
und `app:deploy` (`src/config/apiBereiche.js`). Ein Tippfehler ergab vorher
einen Schlüssel, der still nichts durfte. Ohne Angabe gilt die Vorgabe — die
fünf ersten, **ohne** `app:deploy`.

**Response:**

```json
{
  "success": true,
  "api_key": "aras_xxxx...", // Only shown once!
  "key_prefix": "aras_xxx",
  "key_id": 1,
  "message": "Store this API key securely - it will not be shown again!"
}
```

Ein Schlüssel für das Ara-Kit entsteht am Gerät auch ohne Sitzung:
`bash scripts/util/kit-schluessel.sh anlegen "Kit von Firma Meier"`.

---

## Documentation API

**Base Path:** `/api/docs`

| Method | Endpoint                 | Description              |
| ------ | ------------------------ | ------------------------ |
| GET    | `/api/docs/`             | OpenAPI documentation UI |
| GET    | `/api/docs/openapi.json` | OpenAPI spec (JSON)      |
| GET    | `/api/docs/openapi.yaml` | OpenAPI spec (YAML)      |

---

## Response Format

All responses include:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z"
  // ... endpoint-specific data
}
```

## Error Responses

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

| Status | Description                             |
| ------ | --------------------------------------- |
| 400    | Bad Request - Invalid input             |
| 401    | Unauthorized - Invalid/expired token    |
| 403    | Forbidden - Insufficient permissions    |
| 404    | Not Found - Resource doesn't exist      |
| 429    | Too Many Requests - Rate limit exceeded |
| 500    | Internal Server Error                   |
| 503    | Service Unavailable                     |

## Rate Limits

| Category         | Limit   | Window |
| ---------------- | ------- | ------ |
| General API      | 100 req | 1 min  |
| LLM API          | 10 req  | 1 sec  |
| Metrics API      | 20 req  | 1 sec  |
| Password Changes | 3 req   | 15 min |

---

## Related Documentation

- [Development Guide](../development/DEVELOPMENT.md) - API usage examples & patterns
- [API Errors](API_ERRORS.md) - Complete error code reference
- [Dashboard Backend](../../apps/dashboard-backend/README.md) - Backend implementation details
