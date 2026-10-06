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

| Method | Endpoint                    | Description                                                          | Rate Limit    |
| ------ | --------------------------- | -------------------------------------------------------------------- | ------------- |
| GET    | `/api/auth/needs-setup`     | Public: is the box still without an admin? Plus `firmenname`, `logo` | 120/min       |
| POST   | `/api/auth/setup`           | Public, self-closing: create the FIRST admin                         | 10/15min      |
| POST   | `/api/auth/login`           | Login with username/password (sets cookie)                           | 10/15min      |
| GET    | `/api/auth/session`         | Public probe: 200 in both cases, `authenticated`                     | 120/min       |
| POST   | `/api/auth/logout`          | Logout (blacklists token, clears cookie) — auch ohne Sitzung 200     | 30/min        |
| POST   | `/api/auth/logout-all`      | Invalidate all sessions for current user (auch Mitarbeiter)          | -             |
| POST   | `/api/auth/change-password` | Change own password (invalidates all sessions) (auch Mitarbeiter)    | 3/15min, user |
| GET    | `/api/auth/verify`          | Verify token (for Traefik forward-auth)                              | -             |
| GET    | `/api/auth/me`              | Get current user info (auch Mitarbeiter)                             | -             |
| GET    | `/api/auth/csrf`            | Re-mint the CSRF token cookie for this session (auch Mitarbeiter)    | -             |

> Stand: 2026-08-28 · Quelle: `src/routes/auth.js`, `src/middleware/rateLimit.js`
>
> Beim Eintragen von `/api/auth/session` (Plan 023 C3) gegengeprüft: drei
> Angaben in dieser Tabelle waren falsch. `logout` steht auf 30 **pro Minute**,
> nicht 30 pro 15 Minuten, und `logout-all` hat überhaupt keinen Limiter. `change-password` zählt je Nutzer, nicht je IP.
> Alle Werte oben stammen jetzt aus dem Code, nicht aus dem vorigen Stand
> dieser Datei.
>
> Am 28.08.2026 ist `needs-setup` von 30/min auf 120/min gegangen: es ist die
> zweite Probe, die **jede** Seitenladung macht (App.tsx, beim Einhängen), und
> stand trotzdem auf der Drossel, die das Abmelden trägt. Am Orin gemessen:
> ein Lauf der Oberflächen-Abnahme steht in seiner vollsten Minute bei 22 von
> 30 auf dieser Drossel — 73 % der Decke, ohne Luft für einen zweiten Menschen
> hinter derselben IP. Beide Proben tragen jetzt `probeLimiter`; eine
> Seitenladung kostet zwei von 120, also 60 Seitenladungen je Minute und IP.

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

**POST /api/auth/logout:**

Meldet die aktuelle Sitzung ab: der Token wandert auf die Sperrliste, und die
beiden Cookies (`arasul_session`, `arasul_csrf`) werden gelöscht.

**Der Weg verlangt keine gültige Sitzung** (Phase D6, 28.08.2026). Er trug bis
dahin `requireAuth`, und genau das ging nach einem Passwortwechsel schief:
`POST /api/auth/change-password` entwertet **alle** Sitzungen des Betroffenen,
die Oberfläche ruft danach das Abmelden mit eben diesem entwerteten Token, und
die Antwort war 401. Der Rumpf lief nie, also blieb das httpOnly-Cookie
`arasul_session` mit totem Token im Browser stehen — eine Sitzung, die eine
Seite selbst nicht löschen kann, weil sie httpOnly-Cookies nicht sieht.

Ohne gültigen Token gibt es nichts zu sperren; die Cookies fallen trotzdem, und
die Antwort ist 200. Die CSRF-Pflicht bleibt: ein fremder Absender soll
niemanden abmelden können.

```json
// Response
{
  "success": true,
  "message": "Abgemeldet.",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/auth/logout-all:**

Invalidates every active session for the current user by blacklisting all their tokens. Use this when a device is lost or a security incident is suspected. Auth required.

```json
// Response
{
  "success": true,
  "message": "Auf allen Geräten abgemeldet.",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/auth/change-password:**

Der Mensch wechselt **sein eigenes** Passwort (Administrator und Mitarbeiter).
Die Oberfläche nimmt diesen Weg für den erzwungenen Startpasswort-Wechsel
(`features/system/PasswortWechseln.tsx`); Einstellungen → Sicherheit nimmt den
gleichwertigen `POST /api/settings/password/dashboard`. Anmeldung und CSRF
nötig, Drossel drei Versuche je Viertelstunde **je Benutzer** — jeder Versuch
zählt, auch ein gelungener.

Rumpf (JSON, `ChangePasswordBody` in `schemas/auth.js`, `.strict()` — ein
weiteres Feld ist ein 400):

| Feld              | Typ    | Regel                                                                                                                  |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `currentPassword` | string | Pflicht, 1 bis 256 Zeichen; das Passwort, mit dem der Mensch gerade angemeldet ist                                     |
| `newPassword`     | string | Pflicht, 8 bis 256 Zeichen, mindestens eine Ziffer (`GET /api/settings/password-requirements`), nicht gleich dem alten |

```json
// Request
{
  "currentPassword": "Start-123",
  "newPassword": "Eigenes-456"
}

// Response 200
{
  "success": true,
  "message": "Das Passwort wurde geändert. Bitte melden Sie sich mit dem neuen Passwort neu an.",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

Danach gilt: **alle Sitzungen des Menschen sind entwertet**, auch die, mit der
er gerade gewechselt hat — die Oberfläche meldet ab (`POST /api/auth/logout`
nimmt das tote Token an) und der Mensch meldet sich mit dem neuen Passwort an.
`passwort_vom_admin` steht auf `false`, und seit J35 (25.09.2026) sagt das
**schon die nächste Anfrage**: der Zwischenspeicher von `requireAuth` (60 s je
Benutzer) wird beim Schreiben verworfen. Vorher meldete `GET /api/auth/me` mit
dem frischen Token noch bis zu einer Minute `passwortWechselNoetig: true`.

| Status | `error.code`       | Wann                                                                                                                            |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR` | Feld fehlt, zu kurz/lang oder unbekannt (`details` je Feld); Regel verletzt (`details` als Liste der Sätze); neues gleich altem |
| 401    | `UNAUTHORIZED`     | `currentPassword` stimmt nicht — oder keine gültige Sitzung (`TOKEN_REVOKED`, `TOKEN_EXPIRED`, …)                               |
| 403    | `CSRF_INVALID`     | CSRF-Token fehlt oder veraltet (`useApi` holt einen frischen und wiederholt einmal)                                             |
| 404    | `NOT_FOUND`        | Den Benutzer gibt es nicht mehr                                                                                                 |
| 429    | `RATE_LIMITED`     | Mehr als drei Versuche in fünfzehn Minuten                                                                                      |

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

| Method | Endpoint                    | Description                         |
| ------ | --------------------------- | ----------------------------------- |
| GET    | `/api/system/status`        | System health (OK/WARNING/CRITICAL) |
| GET    | `/api/system/info`          | Version, build hash, uptime         |
| GET    | `/api/system/network`       | IP addresses, mDNS, connectivity    |
| GET    | `/api/system/heartbeat`     | Lebenszeichen, ohne Anmeldung       |
| GET    | `/api/system/ca-zertifikat` | CA-Zertifikat des Geräts, als Datei |

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

### System Setup — gestrichen (Phase D4)

Hier standen vier Wege des Einrichtungsassistenten: `GET /api/system/setup-status`,
`POST /api/system/setup-complete`, `PUT /api/system/setup-step`,
`POST /api/system/setup-skip`. Sie gibt es seit dem 28.08.2026 nicht mehr, und
mit ihnen sind die Spalten `setup_*` aus `system_settings` gefallen
(Migration 179).

Der Assistent fragte nach Firma, Branche, Teamgröße, Antwortstil und einem
Modell und stand nach jeder frischen Installation vor der Shell. Jede seiner
Fragen gehört inzwischen woandershin: das Profil war das des **Chats**, den es
seit Phase B2 nicht mehr gibt; die Modellwahl ist seit C8 eine **Kurzliste**
und wird in der Ansicht „Modelle" bedient; Netzname, Startpasswort und
Kit-Schlüssel nennt seit C10 der **Bootstrap**, einmal, auf der Konsole des
Geräts. Übrig geblieben wäre ein Bildschirm, der wiederholt, was der Bootstrap
gerade gezeigt hat.

Ob ein Gerät noch **gar keinen Administrator** hat, sagt weiterhin
`GET /api/auth/needs-setup` — das ist eine andere Frage und ein anderer Weg.

Seit dem 30.08.2026 (Auftrag anmeldung-ohne-slogan) fährt in derselben Antwort
`firmenname` mit (`string | null`): der Name des Unternehmens, den die
Anmeldeseite über dem Formular zeigt — Fallback ist der Produktname. Er kommt
aus dem Cache der Systemeinstellungen (`company_name`, Migration 038) und
kostet keine Abfrage; ein eigener Weg wäre eine dritte Anfrage auf jeder
Seitenladung. Gesetzt wird er über `PUT /api/settings/firmenname`.

```json
{ "needsSetup": false, "firmenname": "Muster GmbH", "timestamp": "…" }
```

### Services

| Method | Endpoint                             | Description                                        |
| ------ | ------------------------------------ | -------------------------------------------------- |
| GET    | `/api/services/all`                  | Alle Dienste als Liste, mit `canRestart` je Dienst |
| POST   | `/api/services/restart/:serviceName` | Einen Dienst neu starten (nur Admin)               |

**GET /api/services/all:**

Auth: erforderlich. Liste statt Objekt, mit `id`, `name`, `anzeige`, `status`,
`health`, `state` und `canRestart`. `canRestart` ist keine Vermutung, sondern die
Zugehörigkeit zur Liste unten. `anzeige` ist der deutsche Name des Dienstes
(„Datenbank" statt `postgres-db`, seit J35), aus der einen Tabelle
`utils/dienstNamen.js`; ein unbekannter Dienst behält seinen `name`.

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

### Self-Healing

| Method | Endpoint                   | Description   |
| ------ | -------------------------- | ------------- |
| GET    | `/api/self-healing/events` | Event history |

**GET /api/self-healing/events:** jedes Ereignis trägt seit J35 zusätzlich
`dienst_anzeige`, den deutschen Namen zu `service_name` (dieselbe Tabelle wie
`GET /api/services/all`).

**GET /api/ops/overview:** `criticals` und `warnings` sind seit J35 deutsche
Sätze für einen Menschen („Die letzte Sicherung ist 50 Stunden alt", „Ein Dienst
ist ausgefallen: Datenbank"), keine Logzeilen.

**Query Parameters (events):**

- `limit`: Max results (default: 100)
- `severity`: Filter by severity (INFO, WARNING, CRITICAL)

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

`passwort_vom_admin` steht seit Phase D3 in der Liste. Es sagt, ob das
**aktuelle** Passwort von einem Administrator gesetzt wurde und beim nächsten
Anmelden gewechselt werden muss (Migration 178, Phase D1). Die Mitarbeiterliste
der Oberfläche zeigt daran, wer sein Startpasswort noch trägt — ohne diese
Angabe sieht ein gesetztes Passwort aus wie ein selbst gewähltes. Ein Geheimnis
gibt das nicht preis: es sagt nur, dass ein Zweiter das Passwort kennt, und
genau deshalb muss es gewechselt werden.

Stilllegen ist nicht Löschen. Ein stillgelegter Benutzer kommt nicht mehr
herein (`POST /api/auth/login` antwortet 403 `ACCOUNT_DISABLED`), seine
Läufe und Protokolle bleiben stehen. Der letzte aktive Administrator kann nicht
stillgelegt werden, und niemand kann sich selbst stilllegen.

| Method | Endpoint                       | Description                                                                                                                                                                 |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/benutzer`                | Alle Benutzer: `id, username, email, role, is_active, passwort_vom_admin, created_at, last_login, vorname, nachname, funktion, kuerzel, hat_bild`                           |
| POST   | `/api/benutzer`                | Person anlegen: `{ vorname, nachname, email, verwaltung? }`; Benutzername = E-Mail; **`startpasswort` steht einmal in der Antwort**; 409 bei E-Mail oder Lizenz             |
| PUT    | `/api/benutzer/:id/passwort`   | Neues Startpasswort: `{ password? }` (ohne Angabe erzeugt das Gerät eins, `startpasswort` in der Antwort, einmalig); beendet alle Sitzungen; 400 für das eigene Konto       |
| PUT    | `/api/benutzer/:id/aktiv`      | Sperren oder zulassen: `{ aktiv: true \| false }`; 400 für sich selbst und den letzten Admin, 409 Lizenz                                                                    |
| PUT    | `/api/benutzer/:id/verwaltung` | Schalter „Verwaltung“: `{ verwaltung: true \| false }` setzt die Rolle `admin` oder `mitarbeiter`; 400, wenn es der letzte aktive Administrator wäre (auch für sich selbst) |
| GET    | `/api/benutzer/:id/bild`       | Das Bild einer Person (Bytes mit `Content-Type`), 404 ohne Bild                                                                                                             |
| DELETE | `/api/benutzer/:id`            | Benutzer samt Daten löschen; 400 für das eigene Konto, 404 unbekannt                                                                                                        |

Das **eigene Profil** (jede angemeldete Person, keine Kennung in der Adresse):

| Method | Endpoint           | Description                                                                             |
| ------ | ------------------ | --------------------------------------------------------------------------------------- |
| PUT    | `/api/profil`      | `{ vorname, nachname, funktion?, kuerzel? }` (Kürzel ≤ 8 Zeichen); leer = nicht gesetzt |
| PUT    | `/api/profil/bild` | `{ bild: "data:image/png\|jpeg\|webp;base64,…" }`, ≤ 512 KB                             |
| DELETE | `/api/profil/bild` | Bild entfernen                                                                          |
| GET    | `/api/profil/bild` | Das eigene Bild; 404 ohne Bild                                                          |

`/api/auth/login`, `/api/auth/me` und `/api/auth/session` tragen im `user`
zusätzlich `vorname, nachname, funktion, kuerzel, hatBild, anzeigeName`.

```json
// POST /api/benutzer → 201
{
  "data": {
    "id": 7,
    "username": "mia.muster@firma.de",
    "email": "mia.muster@firma.de",
    "vorname": "Mia",
    "nachname": "Muster",
    "role": "mitarbeiter",
    "is_active": true,
    "passwort_vom_admin": true
  },
  "startpasswort": "k4mt-x9ra-hw3e",
  "timestamp": "2026-10-03T09:00:00.000Z"
}
```

**Die Lizenz zählt die Konten** (J35, 25.09.2026). Anlegen und Wiederzulassen
gehen durch `pruefeKontenGrenze`: gezählt werden die **aktiven** Konten, der
Administrator zählt mit, ein stillgelegtes nicht. Ohne Lizenz (`community`)
sind es drei; `professional` und `enterprise` kennen keine Grenze, und eine
Lizenz darf `maxUsers` selbst nennen. Gezählt wird unter einer Sperre in
derselben Transaktion wie das Schreiben — zwei gleichzeitige Anfragen kommen
nicht beide am letzten Platz vorbei.

```json
// POST /api/benutzer → 409, wenn die Lizenz voll ist
{
  "error": {
    "code": "CONFLICT",
    "message": "Die Lizenz dieses Geräts (community) trägt 3 Konten, aktiv sind 3: admin, mia, tom. ute kommt nicht dazu. Der Administrator zählt mit, stillgelegte Konten nicht. Ein Konto stilllegen (Verwaltung → Personen) oder die Lizenz erweitern (Verwaltung → Gerät → Lizenz).",
    "details": {
      "grenze": 3,
      "belegt": 3,
      "stufe": "community",
      "konten": ["admin", "mia", "tom"],
      "abgewiesen": "ute"
    }
  }
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
Mitarbeiter selbst davon sieht, steht unter `GET /api/apps/meine`. Jede App dort trägt `symbol` (aus `app.json`, Kontrakt 8: Lucide-Name oder 1 bis 3 Großbuchstaben, sonst `null`).

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

| Method | Endpoint                              | Description                              | Rate Limit |
| ------ | ------------------------------------- | ---------------------------------------- | ---------- |
| POST   | `/api/settings/password/dashboard`    | Change Dashboard password                | 3/15min    |
| GET    | `/api/settings/password-requirements` | Get password rules                       | -          |
| PUT    | `/api/settings/firmenname`            | Firmenname setzen, leer = keiner (admin) | -          |
| PUT    | `/api/settings/logo`                  | Logo des Hauses setzen (admin)           | -          |
| DELETE | `/api/settings/logo`                  | Logo des Hauses entfernen (admin)        | -          |

**PUT /api/settings/firmenname** (Auftrag anmeldung-ohne-slogan, 30.08.2026):
`{ "firmenname": "Muster GmbH" }`, höchstens 120 Zeichen, wird getrimmt; ein
leerer Name speichert `NULL`, und die Anmeldeseite zeigt dann den Produktnamen.
Antwort `{ "firmenname": "Muster GmbH" | null }`. Die Spalte ist
`system_settings.company_name`; gelesen wird sie öffentlich über
`GET /api/auth/needs-setup`.

**PUT /api/settings/logo** (M5, 04.10.2026, Migration 207): das Logo des
Hauses, das die Aktivitätsleiste über dem Haus zeigt. Rumpf
`{ "bild": "data:image/png;base64,…" }`; angenommen werden PNG, JPEG und WebP,
geprüft an den ersten Bytes der Datei (kein SVG: es kann Skript tragen),
höchstens 256 KB. Sonst `400`. Antwort `{ "data": { "logo": "<Stand, ISO>" } }`.
**DELETE /api/settings/logo** setzt Datei, Art und Stand auf `NULL`, Antwort
`{ "data": { "logo": null } }`. Beide stehen im Prüfprotokoll
(`settings_change`, `target: logo`). Ob es ein Logo gibt, sagt
`GET /api/auth/needs-setup` (`logo`); die Datei liefert
`GET /api/darstellung/logo`.

**GET/PATCH /api/settings/sprachmodell** gibt es seit dem 04.10.2026 nicht
mehr (`404`): die Seite „KI" der Verwaltung ist gestrichen, der Administrator
ändert keine Prompts (`company/frontend.md`, Flows). Die vier Spalten in
`system_settings` bleiben und werden mit ihren Vorgaben weiter gelesen
(`llmOllamaStream.js`, `systemPromptBuilder.js`).

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

| Method | Endpoint                                 | Description                                                         |
| ------ | ---------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/api/update/status`                     | Die eigene Fassung (`fassung.version`, `anzeige`, `bekannt`)        |
| GET    | `/api/update/fassung`                    | Stand und Fortschritt der Plattform-Aktualisierung                  |
| GET    | `/api/update/fassung/neueste`            | Die neueste Fassung im Netz                                         |
| POST   | `/api/update/fassung/einspielen`         | Das Gerät auf eine neue Fassung bringen (202)                       |
| POST   | `/api/update/fassung/zurueck`            | Zurück auf die vorige Fassung (202)                                 |
| GET    | `/api/update/fassung/nachts`             | Schalter „nachts selbst einspielen“, Fenster, letzte Nacht, Hinweis |
| PUT    | `/api/update/fassung/nachts`             | Schalter setzen, Body `{ "aktiv": true\|false }`                    |
| POST   | `/api/update/fassung/nachts/trockenlauf` | Den Ablauf der Nacht prüfen, nichts einspielen, nichts sichern      |
| POST   | `/api/update/fassung/nachts/gesehen`     | Den Hinweis vom Morgen als gelesen markieren                        |

**Die Plattform selbst aktualisieren (J39)** — die vier `fassung`-Zeilen sind
der Weg des Dashboards, `/api/v1/external/update` (unten) der des Kits; beide
rufen `services/betrieb/fassungsdienst.js`. Ablauf, Rückweg und Grenzen:
[docs/ops/AUSLIEFERUNG.md](../ops/AUSLIEFERUNG.md#das-geraet-aktualisiert-sich-selbst-j39).

**Aktualisierung nachts (M5, update-nachts).** Alle vier `fassung/nachts`-Wege
verlangen **Admin**. `GET` antwortet
`{ data: { aktiv, fenster: { von: "02:00", bis: "04:00", zeitzone, beginn, ende, laeuftGerade, laufendBis }, letzter, hinweis } }`:
`beginn` und `ende` (ISO) sind das nächste Fenster, das noch nicht begonnen hat,
nie eine vergangene Zeit; mitten im Fenster ist `laeuftGerade` wahr, `laufendBis`
nennt dessen Ende und `beginn` ist der der folgenden Nacht (sonst `laufendBis: null`),
gerechnet in der Zeitzone des Geräts (`TZ`, Vorgabe `Europe/Berlin`). `letzter` ist die
jüngste Zeile des Protokolls (`update_nacht_laeufe`), `hinweis` das jüngste
Ergebnis einer echten Nacht, das noch nicht gelesen ist (`null`, wenn keins).
`ergebnis` ist einer von `laeuft`, `eingespielt`, `zurueckgefallen`,
`fehlgeschlagen`, `uebersprungen` (mit `grund`: kein Platz, keine Sicherung,
Netz weg, …), `nichts_zu_tun` oder `trockenlauf`. Der Trockenlauf macht
dieselbe Vorprüfung wie das Einspielen, fragt, ob gerade eine Sicherung läuft
(dann `uebersprungen`), nennt eine misslungene letzte Sicherung als Warnung im
`grund` (die Nacht sichert frisch), schreibt eine Zeile mit `trocken: true` und
verändert nichts. Gestartet wird im Fenster nur bis 03:30. Der Schalter ist aus als Vorgabe. Die Regeln des Fensters:
[ADMIN_HANDBUCH.md](../ops/ADMIN_HANDBUCH.md#6-system-updates).

**GET /api/update/status** nennt nur die eigene Fassung; das Ara-Kit liest
`fassung.version` vor und nach einem Update. `SYSTEM_VERSION` setzt der Bau
(seit Phase C10); fehlt sie, lautet die Antwort `fassung.bekannt: false` und
`version: null`. Den Offline-Weg über ein `.araupdate`-Paket (Hochladen,
USB-Stick) gibt es seit dem 06.10.2026 nicht mehr: er lief an keinem Gerät,
weil der Backend-Container kein `docker`-Programm hat. Ein Gerät ohne Netz
bekommt eine neue Fassung als Artefakt am Gerät
([AUSLIEFERUNG.md](../ops/AUSLIEFERUNG.md)).

```json
{
  "status": "idle",
  "fassung": { "version": null, "anzeige": "Vorserie", "bekannt": false },
  "timestamp": "2026-08-27T10:00:00.000Z"
}
```

### Apps

Eine App ist das, was ein Partner mit dem Ara-Kit baut und auf das Gerät rollt:
ein statisches Frontend, das Arasul unter `/apps/<id>/` ausliefert, und ein
Backend-Container, den Traefik unter `/apps/<id>/api/` erreicht. Was sie ist,
steht in ihrem Manifest `app.json` — die Felder erklärt
[docs/features/APPS.md](../features/APPS.md).

Je App gibt es zwei Stände: `live` für alle Freigegebenen, `test` für die
benannten Tester. Sie haben getrennte Pfade und getrennte Container.

| Method | Endpoint                                             | Description                                                                                                   |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/apps`                                          | Alle Apps mit beiden Ständen und dem Zustand ihrer Container                                                  |
| GET    | `/api/apps/meine`                                    | Die Apps, die dem Aufrufer freigegeben sind (auch für Mitarbeiter)                                            |
| GET    | `/api/apps/reihenfolge`                              | Meine Reihenfolge der Apps in der Aktivitätsleiste, Liste von `<kennung>:<stand>` (M5)                        |
| PUT    | `/api/apps/reihenfolge`                              | Reihenfolge setzen, Body `{ reihenfolge: ["<kennung>:<stand>", …] }`, höchstens 200, ohne Doppelte (M5)       |
| GET    | `/api/apps/:id`                                      | Eine App im Einzelnen: Manifest, Versionen, Modelle, Flows                                                    |
| POST   | `/api/apps/:id/einspielen`                           | Eine Version in einen Stand bringen                                                                           |
| DELETE | `/api/apps/:id`                                      | App entfernen: beide Container, beide Stände, Freigaben (Ordner gehen mit, `?dateien=false` lässt sie liegen) |
| GET    | `/api/apps/:id/logs`                                 | Die letzten Zeilen des App-Backends                                                                           |
| GET    | `/api/apps/:id/zugang`                               | Forward-Auth vor dem Backend einer App (auch für Mitarbeiter)                                                 |
| GET    | `/api/apps/:id/flows`                                | Die Flows beider Stände, mit dem Modell, das sie treibt                                                       |
| GET    | `/api/apps/:id/flows/:name`                          | Die Flow-Datei selbst, samt Prompt (Phase D4)                                                                 |
| PUT    | `/api/apps/:id/flows/:name/modell`                   | Das Modell eines Flows setzen: lokal, extern oder zurücknehmen                                                |
| PUT    | `/api/apps/:id/flows/:name/art`                      | Die Art eines Flows schalten `{ art }`, `null` = Vorgabe des Pakets (M5)                                      |
| PUT    | `/api/apps/:id/flows/:name/aktiv`                    | Einen Flow aus- und einschalten `{ aktiv }`; ein inaktiver startet nicht (M5)                                 |
| PUT    | `/api/apps/:id/flows/:name/zeitplan`                 | Den Zeitplan eines Flows pausieren `{ pausiert }`; nur der Zeitplan, nicht `aktiv` (M5)                       |
| GET    | `/api/apps/:id/schritt-modelle`                      | Je Flow die Schritte mit Modell: Original, was gilt, Fähigkeiten, wählbare Modelle (M5)                       |
| PUT    | `/api/apps/:id/flows/:name/schritte/:schritt/modell` | Einen Schritt auf ein installiertes Modell umstellen `{ modell }`, `null` = Original (M5)                     |
| GET    | `/api/apps/modell-hinweise`                          | Schritte, deren Modell fehlt oder deren Wahl nicht mehr passt, über alle Apps (M5)                            |
| GET    | `/api/apps/:id/stufen`                               | Die Freigabestufen der App mit Standardperson, wählbaren Personen und Hinweis (M5)                            |
| PUT    | `/api/apps/:id/stufen/:stufe`                        | Standardperson einer Stufe setzen `{ benutzer_id }`, `null` nimmt sie zurück (M5)                             |
| POST   | `/api/apps/:id/laeufe/:runId/erneut`                 | Die Übergabe eines Laufs auf `nicht_uebergeben` noch einmal an die App (M5, Kontrakt 11)                      |
| GET    | `/api/laeufe`                                        | Die Läufe aller Apps mit Filtern, Fehler zuerst (Admin, M5)                                                   |
| GET    | `/api/laeufe/:id`                                    | Ein Lauf samt Schritten, Freigaben und Person, aus jeder App (Admin, M5)                                      |
| POST   | `/api/laeufe/:id/abbrechen`                          | Einen laufenden oder wartenden Lauf abbrechen, auch ohne Person (Admin, M5)                                   |
| GET    | `/api/apps/:id/ki-aufrufe`                           | Jeder Modellaufruf dieser App, auch ohne Flow, ohne Inhalt (J35)                                              |
| POST   | `/api/apps/:id/schalten`                             | Den Teststand live schalten oder zurücknehmen (Phase D4)                                                      |

Alle bis auf `/meine` und `/:id/zugang` sind Admin-Wege.

**GET /api/apps/:id/stufen** (M5, 04.10.2026): `{ data: { stufen: [{ stufe,
bezeichnung, flows, person: { id, username } | null, gilt, gesetzt_am, hinweis
}], personen: [{ id, username }] } }`. Die Stufen kommen aus `stufen` im Kopf
der Flows beider Stände, je Stufenname eine Zeile (zwei Flows mit derselben
Stufe teilen die Person). `gilt` ist `false`, wenn keine Person gesetzt ist oder
sie den Zugang zur App verlor; dann steht in `hinweis` ein Satz für den Admin
(neue Freigaben liegen bei allen mit Zugang). `personen` sind alle aktiven
Konten mit Zugang zur App. **PUT `/api/apps/:id/stufen/:stufe`** mit
`{ "benutzer_id": 7 }` oder `{ "benutzer_id": null }`: `404`, wenn kein Flow der
App die Stufe nennt, `400`, wenn die Person keinen Zugang hat. Offene Freigaben
bleiben, wo sie liegen; die Person gilt für jede neue.

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
greift nur bei einer neuen App, nicht bei einer neuen Version; Test- und
Livestand zählen zusammen — siehe [APPS.md](../features/APPS.md#grenzen)).

**GET /api/apps/:id/logs:** Query `?stand=live|test&zeilen=1..2000`.

**DELETE /api/apps/:id:** Query `?dateien=true|false` (Vorgabe `true`, seit
04.10.2026). Ohne Angabe gehen die Ordner unter `/arasul/apps/<id>/` mit; mit
`dateien=false` bleiben sie liegen. Das gilt auch für
`DELETE /api/v1/external/apps/:id`, den Weg des Kits (`app.mjs --remove`): dort
blieb vorher sechsmal der Paketordner liegen. Laufende und wartende Läufe der App
enden als `abgebrochen` mit dem Grund „App entfernt", ihre offenen Freigaben als
`verfallen`. Derselbe Dienst wie `DELETE /api/v1/external/apps/:id`, dort mit der
Rückfrage `?bestaetigung=<id>`; hier fragt der Dialog. Antwort:
`{ "data": { "id", "dateien_entfernt": ["1.0.0"] | null, "images_entfernt": [], "datenbanken_entfernt": [], "laeufe_abgebrochen": 0, "freigaben_geschlossen": 0 } }`.

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
        "dateien": { "manifest": true, "frontend": true },
        "lieferbar": true,
        "mangel": null,
        "marken": "3.1.0",
        "modelle": [{ "name": "qwen3:14b-q8", "vorhanden": true }],
        "flows": [{ "name": "urlaub-pruefen", "modell": "qwen3:14b-q8", "version": "1.0.0" }]
      },
      "test": null
    }
  },
  "timestamp": "2026-08-27T12:00:00Z"
}
```

`backend` ist, was Docker über den Container sagt — sein Healthcheck prüft
`backend.gesundheit` am Port der App und sonst nichts. `dateien`, `lieferbar`
und `mangel` (Auftrag app-leiche, 28.08.2026) sind die Antwort des Geräts auf
die Frage, ob dieser Stand ausgeliefert werden **kann**: `app.json` und die
`index.html` des Frontends auf der Platte, der Container da und nicht
`unhealthy`. Ein Stand mit `lieferbar: false` nennt in `mangel` den Grund als
Satz; `GET /api/apps` trägt dieselben drei Felder je Stand. Ein
`GET /apps/<id>/` auf einen Stand ohne Dateien antwortet mit
`503 APP_DATEIEN_FEHLEN` statt `INTERNAL_ERROR`, und `GET /api/apps/meine`
lässt ihn weg (siehe [APPS.md](../features/APPS.md), „Was ein Stand
lieferbar nennt").

**Ein Browser bekommt an der Grenze eine Seite, kein JSON** (J35,
26.09.2026). Fragt eine Anfrage an die **Seite** einer App (nicht `api/…`,
keine Datei) mit `Accept: text/html` vor `application/json`, kommen 403
(nicht freigegeben, nur Tester), 404 (Stand fehlt, kein Frontend) und
`503 APP_DATEIEN_FEHLEN` als HTML-Seite im Stil des Geräts: ein Satz, ein Weg
„Zur Übersicht" (`/workspace`, `target="_top"`), im Theme des Menschen, mit
demselben Status. `fetch` und `curl` (`*/*`) bekommen weiter die JSON-Hülle
(`services/app/appSperrseite.js`).

`marken` ist seit Phase H6 die Fassung des Designsystems, auf der dieser Stand
steht — das, was sein `app.json` unter `marken` sagt, oder `null`. Das Gerät
**vergleicht hier nicht**: die Fassung der Bibliothek kennt die Shell, weil sie
sie mitübersetzt (`FASSUNG` aus `@marken`), und die Verwaltung meldet einen
Stand, der älter ist als sie oder keine nennt — seit dem Auftrag
geraet-zeigt-bibliotheksstand (08.09.2026) als Spalte **Bibliothek** schon in
der Liste, als Warnung und nicht als Verbot, und nur für Stände mit Frontend
(`dateien.frontend` ist `null` ohne). Kein Mangel — eine App mit einer alten
Bibliothek läuft, sie sieht nur nicht mehr aus wie das Gerät um sie herum.
`GET /api/apps` trägt `marken` und `dateien` je Stand ebenso.

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
      "live": {
        "version": "1.0.0",
        "pfad": "/apps/urlaub/",
        "api": "/apps/urlaub/api/"
      },
      "test": null
    }
  ],
  "timestamp": "2026-08-27T12:00:00Z"
}
```

`test` ist nur gefüllt, wenn die Freigabe dieses Menschen den Stand `test`
trägt — er ist dann Tester (siehe `POST /api/freigaben`).

**Zwei Adressen je Stand** (Brücke, 21.09.2026): `pfad` ist die Seite, die ein
Mensch im Browser aufmacht, `api` die Schnittstelle, die ein Agent anruft.
`api` ist `null`, wenn die App kein Backend hat — dann gibt es dort nichts
anzurufen, und eine Adresse, hinter der nichts lauscht, wäre eine Zusage, die
nicht hält. Bis hierher stand nur `pfad` da und das CLI der Brücke rechnete
sich die zweite aus; dieselbe Regel stand damit in zwei Repositorien.

Diese Route nimmt seit der Brücke auch einen **Ausweis** an (siehe
[Ausweise](#ausweise-brücke-21092026)).

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

**PUT /api/apps/:id/flows/:name/art** (nur Admin, M5): `{ "art": "autonom" }`,
`{ "art": "ergebnis_bestaetigen" }` oder `{ "art": null }` (zurück zum Paket).
`GET /api/apps/:id/flows` und `…/flows/:name` nennen dazu `arten` (was der Kopf
der Flow-Datei erlaubt, ohne Angabe `["autonom"]`), `art` (womit der nächste
Lauf startet) und `art_ueberschrieben`. Eine Art, die der Kopf nicht nennt,
weist das Backend mit `400` ab, ein unbekannter Flow ist `404`. Die Wahl gilt ab
dem **nächsten** Lauf (ein laufender oder wartender behält seine) und steht im
Sicherheitsprotokoll als `flow_art_gesetzt` (App, Flow, Art, vorher). Sie liegt
in `flow_settings`, nicht in der Datei, und überlebt ein Update.

**PUT /api/apps/:id/flows/:name/aktiv** (nur Admin, M5): `{ "aktiv": false }`
schaltet den Flow aus, `{ "aktiv": true }` wieder ein. Ein ausgeschalteter Flow
startet nicht: jeder Start (`POST /api/v1/external/flows/:name/run` mit dem
Schlüssel der App) bekommt `409` mit dem Code `FLOW_INAKTIV`; ein Lauf, der
schon läuft oder auf eine Freigabe wartet, geht zu Ende. Ein unbekannter Flow ist
`404`. Die Wahl liegt ohne Stand in `flow_settings.aktiv` (Migration 200),
überlebt ein Update und steht im Sicherheitsprotokoll als `flow_ausgeschaltet`
bzw. `flow_eingeschaltet`. `GET /api/apps/:id` und `GET /api/apps/:id/flows`
nennen je Flow dazu `aktiv`, `schritte` (`[{ name, typ, werkzeug?, rolle? }]`),
`ausloeser` (aus dem Kopf, ohne Angabe `[{ "typ": "hand" }]`) und `stufen`
(`[{ name, bezeichnung }]`).

**PUT /api/apps/:id/flows/:name/zeitplan** (nur Admin, M5, Migration 203):
`{ "pausiert": true }` pausiert den Zeitplan des Flows, `{ "pausiert": false }`
setzt ihn fort. Trifft **nur den Zeitplan**: `aktiv` und der Start von Hand
bleiben. Ein Flow ohne `ausloeser: zeitplan` im Kopf ist `400`, ein unbekannter
Flow `404`. Termine in der Pause werden nach dem Fortsetzen nicht nachgeholt. Die
Wahl liegt ohne Stand in `flow_settings.zeitplan_pausiert`, überlebt ein Update
und steht im Sicherheitsprotokoll als `flow_zeitplan_pausiert` bzw.
`flow_zeitplan_fortgesetzt`. Die Antwort nennt `data.zeitplan`. `GET
/api/apps/:id` und `GET /api/apps/:id/flows` nennen je Flow `zeitplan`
(`null` ohne Zeitplan im Kopf):
`{ ausdruecke, zeitzone, pausiert, laeuft_nicht, naechster_termin, letzter_termin }`.
`laeuft_nicht` ist `null`, `"teststand"`, `"pausiert"` oder `"ausgeschaltet"`
und sagt, warum `naechster_termin` (ISO, in der Zeit des Geräts zu lesen) fehlt;
`letzter_termin` ist `{ termin, ergebnis, grund, run_id }` mit `ergebnis`
`gestartet`, `nachgeholt` oder `uebersprungen`. Die Läufe
(`GET /api/laeufe`, `GET /api/laeufe/:id`) tragen `ausloeser`: `hand` oder
`zeitplan`. Regeln: [FLOWS.md](../features/FLOWS.md#zeitplaner-flows-nach-uhrzeit-m5-04102026).

**Modell je Schritt** (nur Admin, M5, Migration 205). Der Entwickler nennt je
Schritt (`typ: subagent`) im Kopf das Modell (`modell` am Schritt, sonst an der
Rolle) und was der Schritt braucht (`faehigkeiten`: `text`, `bild`, `werkzeuge`,
`mindestkontext`). **GET `/api/apps/:id/schritt-modelle`** liefert
`{ data: { standard, modelle: [{ id, name, ist_standard, faehigkeiten: { text,
bild, werkzeuge, kontext } }], flows: [{ name, schritte: [{ name, rolle,
faehigkeiten, original, original_vorhanden, gewaehlt, gilt, gilt_ist_standard,
herkunft, hinweis, moegliche }] }] } }`. `original` ist das Modell des
Entwicklers, `gewaehlt` die Wahl des Admins, `gilt` das Modell, mit dem der
Schritt läuft; `herkunft` ist `gewaehlt`, `paket`, `standard` (der Entwickler
nennt keines, es gilt das Modell des Flows), `standard_weil_fehlt` (das genannte
Modell liegt nicht am Gerät) oder `standard_wahl_ungueltig` (die Wahl passt nicht
mehr). `moegliche` sind die installierten Modelle, die **alle** Fähigkeiten des
Schritts erfüllen; `hinweis` ist ein Satz für den Admin oder `null`. Die
Fähigkeiten der Modelle kommen aus dem Modellkatalog: `text` aus Aufgabe und
Typ (kein Einbettungs- und kein reines Bildmodell), `bild` aus
`supports_vision_input`, `werkzeuge` aus `supports_tools` (Ollama meldet `tools`
unter `capabilities`), `kontext` aus `context_window`; was der Katalog nicht
weiß, schließt aus. **PUT
`/api/apps/:id/flows/:name/schritte/:schritt/modell`** mit `{ "modell": "<id>" }`
stellt um, `{ "modell": null }` nimmt die Wahl zurück. `400`, wenn das Modell
nicht am Gerät liegt oder dem Schritt eine Fähigkeit fehlt; `404` bei
unbekanntem Flow oder einem Schritt ohne Modell (Werkzeug-Schritt). Die Wahl
liegt ohne Stand in `flow_schritt_modelle`, überlebt ein App-Update und steht im
Sicherheitsprotokoll als `schritt_modell_gesetzt`. Den Prompt ändert nichts
davon. **GET `/api/apps/modell-hinweise`** liefert `{ data: [{ app_id,
app_name, flow, schritt, original, gewaehlt, gilt, text }] }`, leer, wenn alles
passt (Admin-Hinweise der Startseite). Im Lauf steht jede Abweichung als Schritt
der Art `hinweis` mit dem Namen `modell`.

**PUT /api/apps/:id/flows/:name/modell:** eine Entscheidung, drei Antworten:

| Body                                                                 | Bedeutung                              |
| -------------------------------------------------------------------- | -------------------------------------- |
| `{ "modell": "gemma4:e4b" }`                                         | ein Modell vom Gerät (Kurzliste, C8)   |
| `{ "modell": null }`                                                 | zurück zum Paket (Kopf der Flow-Datei) |
| `{ "extern": { "anbieter", "modell", "basis_url", "schluessel"? } }` | ein Modell bei einem Anbieter draußen  |

Antworten: `200`, `404` wenn die App den Flow in keinem Stand hat, `400` bei
einem ungültigen Namen oder einer halben externen Angabe.

Zwei Eigenschaften sind Absicht und keine Nachlässigkeit:

- **Die Überschreibung liegt in der Datenbank, nicht in der Flow-Datei.** Die
  Datei kommt mit jedem Paket neu; eine Änderung darin wäre beim nächsten
  App-Update weg. So überlebt die Entscheidung des Kunden ein Update, ohne
  dass der Deploy eine Datei aussparen müsste.
- **Sie gilt ohne `stand`.** „Welches Modell treibt diesen Flow" ist eine
  Entscheidung über den Flow, nicht über die Fassung, mit der jemand gerade
  testet. Wer im Teststand einstellte und im Livestand nicht, merkte es erst
  beim Schalten.

#### Ein Flow rechnet extern (Phase D4)

`basis_url` ist die **OpenAI-kompatible** Basis-Adresse ohne
`/chat/completions`, z. B. `https://api.openai.com/v1` — so passt derselbe Weg
auf OpenAI, Azure, ein gemietetes vLLM und ein Gateway im eigenen Netz. Eine
Anbieter-Liste im Code gibt es dafür bewusst nicht.

**Der Schlüssel geht nur hinein.** Er wird mit AES-256-GCM verschlüsselt
abgelegt (`flow_settings.extern_schluessel`, Schlüssel aus `JWT_SECRET`) und
steht in keiner Antwort, keinem Protokoll und keiner Fehlermeldung. Was die
Oberfläche zeigt, sind die letzten vier Zeichen (`extern_endet_auf`). Fehlt
`schluessel` in einem sonst vollständigen Body, bleibt ein hinterlegter stehen:
wer nur den Modellnamen ändert, soll ihn nicht erneut abtippen müssen — und
kann es auch nicht, er sieht ihn nirgends. Wer ihn loswerden will, schaltet mit
`{"modell": null}` auf das Paket zurück; das räumt die Zeile ganz.

**Lokal und extern schließen einander aus.** Ein Flow läuft auf einem Modell:
das Setzen des einen räumt das andere. Der Lauf geht dann vollständig nach
draußen — auch die Delegationen an Rollen und der Prüfschritt (eine Rolle mit
eigenem `modell` im Paket meint weiter ein Modell dieses Geräts).

**GET /api/apps/:id/flows/:name:** Query `?stand=live|test` (Vorgabe `live`).
Liefert die Flow-Datei so, wie sie registriert ist — mit `prompt` (dem Auftrag
an das Modell), `werkzeuge`, `rollen`, `schritte`, `grenzen` — dazu
`paket_modell` (was das Paket wollte) neben `modell` (was gilt) und `extern`.
`404`, wenn dieser Stand den Flow nicht hat.

#### Die Läufe aller Apps (M5, Verwaltung → Läufe)

**GET /api/laeufe** (Admin): Query `?app=<kennung>`, `?status=` (`laeuft`,
`wartend`, `fertig`, `fehler`, `abgebrochen`, `abgelaufen`, `nicht_uebergeben`),
`?person=<nr>` oder `?person=ohne` (Läufe ohne Mensch dahinter: Zeitplan,
Ereignis ohne Person), `?von=` und `?bis=` (Zeitpunkte mit Zone, `bis`
ausgeschlossen), `?limit=1..200` (Vorgabe 50) und `?offset=`. Antwort
`{ data, gesamt }`. Sortiert: `fehler` und `nicht_uebergeben` zuerst, darin und
danach die neueste Nummer zuerst. Jede Zeile trägt `app_id`, `stand`,
`ausloeser`, `ereignis`, `error` und die Person (`person_id`, `person_name`,
`person_konto`). Die Person ist der Mensch, für den eine App den Lauf auslöste
(`einreicher_id`), bei einem Lauf der Plattform ohne App der Nutzer selbst.

**GET /api/laeufe/:id** (Admin): ein Lauf samt Schritten, aus jeder App.
`404`, wenn es ihn nicht gibt. Query `?raw=1` liefert zusätzlich die Rohdaten
der Schritte (sie können je Subagent einige Dutzend Kilobyte sein). Seit M5
trägt der Lauf `freigaben`: je Freigabe `id`, `titel`, `stufe`, `status`,
`angefragt_am`, `entschieden_am`, `entschieden_von`, `begruendung`,
`felder_schritt`, `felder` (Vorschlag der KI) und `korrekturen` (was der Mensch
änderte, wer, wann); die Läufe-Ansicht zeigt beides nebeneinander. Die Schritte
tragen `kind`:

| `kind`     | was es ist                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| `werkzeug` | ein Werkzeug-Aufruf mit `input` und `output`                                 |
| `subagent` | eine Delegation an eine Rolle; ihre inneren Schritte tragen `parent_step_id` |
| `modell`   | der **Gedankengang**: was das Modell sagte, bevor es ein Werkzeug rief       |
| `hinweis`  | ein Vermerk des Runners (Prüfschritt, übernommener Schritt)                  |

**POST /api/laeufe/:id/abbrechen** (Admin): bricht einen Lauf ab, der läuft
oder wartet, gleich von wem er stammt (auch Zeitplan und Ereignis, deren
`user_id` nur der technische Besitzer ist). `404`, wenn er nicht (mehr) läuft.
Im Sicherheitsprotokoll als `lauf_abgebrochen`.

Die Läufe einer einzelnen App liest `GET /api/laeufe?app=<kennung>`; die
früheren Wege `GET /api/apps/:id/laeufe` und `…/laeufe/:runId` sind am
06.10.2026 gefallen.

#### Die Modellaufrufe einer App (J35, 26.09.2026)

**GET /api/apps/:id/ki-aufrufe:** Query `?stand=test|live`, `?limit=1..500`
(Vorgabe 100). Neueste zuerst. Je Aufruf über die externe Schnittstelle
(`llm/chat`, `document/analyze`, `document/extract-structured`,
`/v1/chat/completions`, `/v1/embeddings`) eine Zeile aus `ki_aufrufe`. Seit
Migration 189 steht dort auch **jeder Modellschritt eines Flows** der App, als
`endpunkt` `flows/<name>` mit `lauf_id` und dem Menschen, den die App beim
Start als `einreicher` nannte (ohne App: der Mensch, dem der Lauf gehört);
`job_id` ist dann `null`, `lauf_id` bei allen anderen Wegen:

```json
{
  "data": [
    {
      "id": 7,
      "begonnen_am": "2026-09-26T09:30:05.000Z",
      "beendet_am": "2026-09-26T09:30:17.400Z",
      "dauer_ms": 12400,
      "app_id": "belege",
      "stand": "live",
      "benutzer_id": 5,
      "benutzer_name": "anna",
      "endpunkt": "document/extract-structured",
      "modell": "qwen3.8:27b-q4_K_M",
      "job_id": "0b7c2c1e-…",
      "lauf_id": null,
      "status": "fertig",
      "fehler": null,
      "antwort_sha256": "9f86d0…",
      "datei_typ": "application/pdf",
      "datei_bytes": 120000
    }
  ]
}
```

**Ohne Inhalt**: kein Dateiname, kein Text, kein Prompt, keine Antwort — nur
deren sha256, mit dem ein aufbewahrter Vorschlag seinem Aufruf zugeordnet
werden kann. `status` ist `laeuft`, `fertig` oder `fehler`. Anders als die
Läufe prüft dieser Weg nicht, ob es die App noch gibt: das Protokoll überlebt
die App, und eine entfernte App liest sich weiter.

**POST /api/apps/:id/laeufe/:runId/erneut** (Admin, M5, Kontrakt 11): löst die
Übergabe des Ergebnisses an die Abschluss-Route der App noch einmal aus, ohne
die Schritte neu zu laufen; dieselbe Lauf-Kennung (`Idempotency-Key`), dieselben
Daten. Antwort `200` mit dem Lauf: `status` ist `fertig`, wenn die App mit 2xx
bestätigte, sonst bleibt er `nicht_uebergeben` (`error` nennt den neuen Grund,
`abschluss.versuche` zählt). `409`, wenn der Lauf nicht auf `nicht_uebergeben`
steht (auch nach einem Abbruch), `404` für einen Lauf einer anderen App. Der
Lauf trägt `abschluss` (`route`, `versuche`, `letzter_versuch`, `status_code`,
`fehler`, `uebergeben_am`; `null` bei einem Flow ohne Abschluss-Route); `?status=`
der Läufe-Liste kennt `nicht_uebergeben`. Dieselbe Angabe liefert
`GET /api/v1/external/flows/runs/:id` der App unter `abschluss`.

**POST /api/apps/:id/schalten:** Body `{ "ziel": "live" }` nimmt die Version
aus dem Teststand, `{ "ziel": "zurueck" }` die, die vorher live war. Derselbe
Dienst wie der Kit-Weg `POST /api/v1/external/apps/:id/schalten` (C5), aber für
einen Menschen mit einer Sitzung: das Kit schaltet, wenn der Partner
ausgeliefert hat, der Administrator, wenn **er** den Teststand gesehen hat.
Antworten: `200`, `409` ohne Teststand bzw. ohne vorige Version.

**Nach live geht es gesichert und mit Rückfall** (M5, 04.10.2026,
`services/app/liveSchalten.js`): hat die App einen Server-Teil und eine
Live-Datenbank, hält das Gerät den alten Livestand an, legt einen Stand der
Sicherung an (`fuer:live:<id>`), schaltet und wartet, bis die neue Fassung
gesund ist (höchstens 180 s; ohne Healthcheck 20 s ohne Neustart). Kommt sie
nicht hoch (beendet, neu gestartet, `unhealthy`, Frist), holt es die
Live-Datenbank aus diesem Stand zurück und spielt die Fassung von vorher wieder
ein. Die Antwort dauert dabei Minuten. Zusätzliche Antworten:

| Status | Code                     | Wann                                                                                                                   |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `200`  | —                        | `data` wie bisher, dazu `data.schaltung` (Zeile aus `app_schaltungen`, `ergebnis: "live"`)                             |
| `409`  | `LIVE_ZURUECKGESCHALTET` | die neue Fassung kam nicht hoch; `message` ist der Satz, `details.hilfe` der zweite, `details.schaltung` mit `technik` |
| `409`  | `LIVE_NICHT_GESICHERT`   | die Sicherung davor misslang; geschaltet wurde nichts, der alte Livestand läuft weiter                                 |
| `409`  | `CONFLICT`               | dieselbe App wird gerade geschaltet                                                                                    |

`GET /api/apps/:id` trägt dazu `letzte_schaltung` (der letzte Versuch, oder
`null`) und je Stand `aenderungstext` (was der Entwickler beim Ausrollen schrieb,
Kontrakt 8; wandert beim Schalten mit in den Livestand).

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

### Model Management

| Method | Endpoint                    | Description                                                                                |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/api/models/catalog`       | List curated model catalog                                                                 |
| GET    | `/api/models/installed`     | List installed models                                                                      |
| GET    | `/api/models/status`        | Current loaded model + queue stats                                                         |
| GET    | `/api/models/memory-budget` | KI-RAM-Lage, geladene Modelle, letzter Wechsel                                             |
| GET    | `/api/models/default`       | Standardmodell der Flows                                                                   |
| POST   | `/api/models/default`       | Standardmodell der Flows setzen (nur `task` text/coding, sonst 400)                        |
| GET    | `/api/models/verwaltung`    | Zeilen der Verwaltung: Fähigkeiten, warm, nutzende Flows, Sperre; die geprüfte Liste (M5)  |
| POST   | `/api/models/pruefen`       | `{ model_id }`: passt das Modell auf das Gerät (Speicher, Platte)? `{ passt, grund }` (M5) |
| POST   | `/api/models/download`      | Modell hinzufügen (SSE-Fortschritt); prüft vorher Speicher und Platte, 400 mit zwei Sätzen |
| DELETE | `/api/models/:id`           | Modell entfernen; 409, solange ein Flow es nutzt oder es der Standard ist (M5)             |

**Laden und Entladen von Hand gibt es nicht (M5, 04.10.2026).** `/:id/load`,
`/unload`, `/activate` und `/deactivate` sind entfernt (404): das Gerät hält
ein Modell nach Nutzung (`modelLifecycleService`) und lädt es bei Bedarf selbst.

**`GET /api/models/verwaltung`** liefert `{ standard, modelle[], liste[] }`.
Je Modell am Gerät: `id`, `name`, `groesse_bytes`, `faehigkeiten`
(`text`, `bild`, `werkzeuge`, `kontext`), `warm`, `ist_standard`, `ungemessen`,
`flows[]` (`app_id`, `app_name`, `flow`) und `sperre` (Satz oder `null`). Ein
Flow nutzt ein Modell, wenn er es im Kopf, in einer Rolle oder an einem Schritt
nennt oder der Admin es je Schritt gewählt hat; nennt er im Kopf keines, nutzt
er den Standard. `liste[]` sind die geprüften Modelle, die noch nicht am Gerät
liegen, je mit `passt` und `grund`. **`POST /api/models/pruefen`** und
`POST /api/models/download` prüfen vorher Speicher (`RAM_LIMIT_LLM` abzüglich
Reserve) und Platte (das 1,5-fache der Größe) und weisen mit 400 und
`details.grund` `ZU_GROSS` oder `PLATTE_VOLL` ab. `DELETE /api/models/:id`
antwortet 409 (`details.grund` `IN_NUTZUNG`, `details.flows`), solange ein Flow
das Modell nutzt oder es das Standardmodell ist.

**Das Standardmodell ist das der FLOWS (Phase D6, 28.08.2026).** `GET`
liefert es in dieser Reihenfolge: der gesetzte Standard (`is_default`), sonst
der Standard der Aufgabe `text` aus dem Katalog (`is_task_default`), sonst das
geladene Modell, sonst das zuletzt geladene — und jeder dieser Rückfälle
überspringt, was nicht `task IN ('text','coding')` (oder ohne Aufgabe) ist.
`POST` weist ein Bild- oder Einbettungsmodell mit `VALIDATION_ERROR` ab. Grund:
ein solches Modell beantwortet keinen Prompt mit Werkzeugen, und bis D6 konnte
es über den Rückfall trotzdem zum Standard werden (Fund der D5-Abnahme am Orin:
das Abzeichen „Standard" saß auf `llava-phi3`).

**Der Katalog ist die Kurzliste (Phase C8, Entscheidung 27.08.2026):**

`GET /api/models/catalog` zeigt genau vier Modelle, und mehr gibt es nicht:

| Kennung              | Aufgabe   | RAM   | Wofür                             |
| -------------------- | --------- | ----- | --------------------------------- |
| `qwen3.8:27b-q4_K_M` | text      | 24 GB | Standard, die Flows laufen darauf |
| `gemma4:e4b`         | text      | 10 GB | das kleine schnelle, Bildvorgabe  |
| `nomic-embed-text`   | embedding | 2 GB  | Einbettungen (`/v1/embeddings`)   |
| `llava-phi3`         | vision    | 4 GB  | Rückfall für Bilder               |

Die Liste steht in `config/modelle/kurzliste.json` und kommt über Migration 175
in den Katalog; den Standard hat Migration 186 (25.09.2026, J35) von
`hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS` auf `qwen3.8:27b-q4_K_M` aus der
Ollama-Bibliothek gezogen — die Hugging-Face-Kennung zeigte nicht verlässlich
auf dieselbe Datei, die neue trägt einen festen Digest (`digest` je Eintrag in
der Kurzliste). Sie ist eine **Zusage** über vier auf diesem Gerät gemessene
Modelle, kein Vorschlag — **seit J4 (30.09.2026) gilt sie für den Katalog nicht
mehr als Sperre, sondern als Kennzeichnung**: siehe „Jedes offene Modell laden"
unten. Der Standard der Flows bleibt ein gemessenes Modell.

Bis zum 27.08.2026 gab es zwei Wege daran vorbei, und beide sind weg:

- `POST /api/models/quelle/pruefen`, `POST /api/models/katalog` und
  `DELETE /api/models/katalog/*` holten ein beliebiges Modell von HuggingFace
  in den Katalog. Sie antworten jetzt mit `404`.
- Der Abgleich mit Ollama trug jedes Modell nach, das nur dort lag
  (`importUnknownModels`). Das nahm C8 weg; **seit M5 (05.10.2026) tut es der
  Abgleich wieder**, aber anders: er legt eine Zeile mit Größe und Fähigkeiten
  aus Ollama (`/api/tags`, `/api/show`: Bild, Werkzeuge, Denken, Kontext) an,
  beim Start des Backends und beim periodischen Abgleich. **Regel:** er legt
  nur neue Zeilen an. Eine bestehende Zeile, kuratiert oder von Hand gepflegt,
  überschreibt er nie. Eine nachgetragene Zeile ist `ungemessen` und
  `frei_geladen` (geht also mit dem Entfernen des Modells wieder weg).

### Jedes offene Modell laden (J4, 30.09.2026)

`POST /api/models/download` (Administrator, SSE) nimmt **jede Kennung** aus der
Ollama-Bibliothek (`name:tag`, `nutzer/name:tag`) und von Hugging Face
(`hf.co/nutzer/repo:quant`), nicht nur die vier der Kurzliste. Vor dem Strom,
also als gewöhnliche JSON-Antwort:

| Fall                                             | Antwort                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Kennung ohne gültige Form                        | `400 VALIDATION_ERROR`                                                                                                    |
| gibt es bei der Registry nicht                   | `404 NOT_FOUND` mit Satz                                                                                                  |
| Registry nicht erreichbar (Größe unbekannt)      | `503 SERVICE_UNAVAILABLE` — ohne Größe wird nicht geladen                                                                 |
| zu groß für das Speicherbudget (`RAM_LIMIT_LLM`) | `400 VALIDATION_ERROR`, `details`: `grund: "ZU_GROSS"`, `groesse_gb`, `benoetigt_gb`, `memory_budget_gb`, `verfuegbar_gb` |

Die Größe kommt aus dem Manifest der Registry (Konfiguration plus Schichten),
im Speicher zählen 15 % Aufschlag für Kontext und Rechenpuffer, abzüglich des
Sicherheitspuffers von `GET /api/models/memory-budget`. Passt es, legt das
Gerät eine Katalogzeile an (`llm_model_catalog.frei_geladen = true`,
`jetson_tested = false`) und lädt. Der erste Ereignisblock nennt
`gemessen` und `digest_vorab`. Scheitert das Laden, geht die Zeile wieder weg;
`DELETE /api/models/:id` nimmt sie mit dem Modell mit. Die vier der Kurzliste
bleiben im Katalog, auch ohne Gewicht.

**Gemessen** heißt: in `config/modelle/kurzliste.json`. `GET /api/models/catalog`
trägt `jetson_tested` (`false` = ungemessen) und `frei_geladen`, die Ansicht
Modelle zeigt „ungemessen". Ein geladenes Modell steht in `GET /api/models/installed`,
ist in der Flow-Modellwahl wählbar und für Apps über `llm/chat` mit `model`
(Katalog-Kennung oder Ollama-Name) nutzbar.

**Digest.** Die Kurzliste trägt je Modell einen Digest, den die Installation nach
dem Holen prüft. Für ein frei gewähltes Modell gibt es keinen Sollwert, den ein
Mensch vorab festgelegt hätte; die Prüfung wird nicht still abgeschaltet,
sondern ausgewiesen (`digest_vorab: false`). Der Digest des Manifests steht im
Protokoll des Geräts.

**Ohne Sitzung, für das Ara-Kit** (Schlüssel mit `app:deploy`, aber kein
Passwort): `scripts/util/modell-geraet.sh laden <kennung> | liste | entfernen
<kennung>` per SSH auf dem Gerät, derselbe Dienst im Backend-Container
(`src/cli/modell.js`), je Aufruf eine Zeile JSON auf STDOUT
(`{"ok":true,"modell":"…","gemessen":false,"digest_vorab":false}`, bei
Abweisung `{"ok":false,"fehler":"…","grund":"ZU_GROSS",…}` mit Rückgabe 1), der
Fortschritt auf STDERR.

Was am Gerät liegt, bleibt liegen — die Migration räumt die Datenbank, nicht
die Platte. Die gestrichenen Gewichte nimmt
`scripts/util/modelle-aufraeumen.sh` von Hand, mit Liste und Rückfrage.

### Tailscale

| Method | Endpoint                    | Auth     | Description                             |
| ------ | --------------------------- | -------- | --------------------------------------- |
| GET    | `/api/tailscale/status`     | Required | Get current Tailscale connection status |
| POST   | `/api/tailscale/install`    | Required | Install Tailscale on the host system    |
| POST   | `/api/tailscale/connect`    | Required | Connect with auth key                   |
| POST   | `/api/tailscale/disconnect` | Required | Disconnect from Tailscale               |

All endpoints require authentication. The route group uses a dedicated `tailscaleLimiter`.

> The three `/api/tailscale/serve` endpoints are gone (28.08.2026, Phase C10).
> `tailscale serve --https=443` makes tailscaled bind `100.x.y.z:443`, after
> which Traefik can no longer bind `0.0.0.0:443` — measured on the Orin: the
> reverse proxy did not start and the device was unreachable **on its own LAN**.
> Traefik answers on the Tailscale address too; the trusted lock comes from the
> device CA for both networks (`docs/ops/NETZNAME_UND_ZERTIFIKAT.md`).

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

**POST /api/tailscale/connect:**

```json
{
  "authKey": "tskey-auth-...",
  "hostname": "arasul-device" // optional
}
```

Fehler von `install`, `connect` und `disconnect` tragen zwei deutsche Sätze
und einen eigenen Code (400 abgelehnter Auth-Key, 503 `tailscaled` läuft
nicht, 502 sonstiger Fehlschlag); die Ausgabe des tailscale-Programms steht
nur im Log. Tabelle: [`API_ERRORS.md`](API_ERRORS.md#fernzugriff-apitailscale).

---

### Ausgang (J38)

Wohin Apps und Plattform ins Internet wollen. `GET /api/ausgang` nur Admin; die
zwei Wege des Ausgangs-Proxys tragen statt der Sitzung den Kopf
`X-Egress-Token` (HMAC aus dem Geheimnis des Geräts).

| Method | Endpoint                  | Wer   | Description                                                             |
| ------ | ------------------------- | ----- | ----------------------------------------------------------------------- |
| GET    | `/api/ausgang`            | Admin | Je App `eingetragen`, `genutzt`, `abgewiesen`; dazu `plattform.genutzt` |
| GET    | `/api/ausgang/regeln`     | Proxy | `{ regeln: { "<app>:<stand>": [hostnamen] } }` aus den Manifesten       |
| POST   | `/api/ausgang/ereignisse` | Proxy | `{ ereignisse: [{ app_id, stand, host, ergebnis, anzahl, zuletzt }] }`  |

**GET /api/ausgang Response:**

```json
{
  "data": {
    "apps": [
      {
        "id": "probe",
        "name": "Probe",
        "eingetragen": [{ "host": "example.org", "staende": ["live"] }],
        "genutzt": [
          {
            "host": "example.org",
            "anzahl": 4,
            "zuletzt": "2026-10-02T10:00:00Z",
            "staende": ["live"]
          }
        ],
        "abgewiesen": [
          {
            "host": "boese.example",
            "anzahl": 2,
            "zuletzt": "2026-10-02T11:00:00Z",
            "staende": ["live"],
            "stoerung": false
          }
        ]
      }
    ],
    "plattform": {
      "genutzt": [
        {
          "host": "api.anthropic.com",
          "anzahl": 7,
          "zuletzt": "2026-10-02T08:00:00Z",
          "staende": []
        }
      ]
    }
  },
  "timestamp": "2026-10-02T12:00:00.000Z"
}
```

`abgewiesen[].stoerung` (M5): `true`, wenn der Name in `verbindungen` desselben
Standes steht und trotzdem abgewiesen wurde (etwa weil er auf eine Adresse im
Haus zeigt). Dann kann die App nicht arbeiten, wie sie soll; die Seite der App
zeigt nur das rot. Ein nicht eingetragener Name, der abgewiesen wurde, ist die
Aufgabe des Proxys und kein Fehler.

---

### License

All endpoints require admin authentication (`requireAuth` + `requireRole('admin')`).

| Method | Endpoint                   | Description                                 |
| ------ | -------------------------- | ------------------------------------------- |
| GET    | `/api/license/info`        | Get current license status + HW fingerprint |
| GET    | `/api/license/fingerprint` | Get device hardware fingerprint             |
| POST   | `/api/license/activate`    | Activate a license key                      |
| DELETE | `/api/license`             | Lizenz entfernen, Geraet wieder community   |

**GET /api/license/info Response:**

```json
{
  "valid": true,
  "tier": "professional",
  "customer": "Muster GmbH",
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "features": { "maxUsers": -1, "maxApps": -1, "externalApi": true, "customModels": true },
  "hardwareFingerprint": "0123456789abcdef0123456789abcdef",
  "nutzung": {
    "stufe": "professional",
    "konten": { "belegt": 5, "grenze": -1 },
    "apps": { "belegt": 4, "grenze": -1 }
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**Die Stufen** (Beschluss vom 25.09.2026, J35): `community` — das Gerät ohne
Lizenz — trägt **drei Konten und drei Apps**, beides durchgesetzt
(`POST /api/benutzer` und das Einspielen einer App antworten 409 mit einem Satz,
der auf die Lizenz zeigt). `professional` ist die bezahlte Stufe, ohne Grenzen;
`enterprise` nimmt das Gerät weiter an, mit denselben Rechten. `nutzung` nennt
je Konten und Apps, was belegt ist und was die Lizenz trägt (`-1` unbegrenzt) —
dieselben Zählungen wie die Riegel und dieselbe Antwort wie
`scripts/util/lizenz-geraet.sh status`. Die Seite **Verwaltung → Gerät → Lizenz**
zeigt sie.

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

Eine Lizenz ist `base64(JSON-Nutzlast).base64(RSA-PSS-Signatur, sha256)` und
wird gegen den oeffentlichen Lizenzschluessel des Geraets geprueft
(`/arasul/config/public_license_key.pem`, kommt mit dem Artefakt). **Geprueft
wird, bevor geschrieben wird** (Auftrag J32, 17.09.2026): fehlt der
Schluessel am Geraet oder stimmt die Signatur nicht, antwortet der Weg mit
`400 VALIDATION_ERROR`, die Meldung nennt den Grund, es bleibt keine Datei
zurueck, und `GET /api/license/info` bleibt `community` mit `maxApps: 3`.
Einen Grace-Mode ohne Schluessel gibt es nicht mehr.

**Die Nutzlast** (J32, 23.09.2026): `customer`, `tier` (`professional` oder
`enterprise`, fehlt sie: `professional`; eine unbekannte Stufe wird mit 400
abgelehnt statt still auf `professional` zu fallen), `issued_at`,
`expires_at`, optional `hardware_id` (aus `GET /api/license/fingerprint`) und
optional **`maxApps`** und seit J35 **`maxUsers`** — je eine ganze Zahl ab 1
oder `-1` fuer unbegrenzt. Steht sie da, ersetzt sie die Zahl der Stufe in
`features`, und die Riegel (`appStore.pruefeAppGrenze`,
`benutzerService.pruefeKontenGrenze`) rechnen mit ihr. Eine andere Zahl (0, -2,
2.5, `"4"`) lehnt der Weg mit 400 ab. Signiert wird mit
`scripts/util/lizenz-signieren.js`; der private Schluessel liegt nur im
Schluesselbund.

Die Lizenzdatei liegt seit J32 unter `/arasul/lizenz/license.key`, einem Mount
auf `data/lizenz/` — sie ueberlebt ein neues Erzeugen des Containers und zieht
mit einer Aktualisierung um. Der Werksreset loescht sie mit `data/`.

**Ohne Sitzung, per SSH** (J35): `scripts/util/lizenz-geraet.sh fingerabdruck |
status | einspielen <lizenz> | entfernen` ruft denselben Dienst im
Backend-Container und gibt genau eine Zeile JSON aus — `{"fingerabdruck":"<hex>"}`,
die Form von `nutzung` oben, `{"ok":true,"stufe":"professional"}` oder
`{"ok":false,"fehler":"..."}` mit Rueckgabe 1. Der Cache des Dienstes haengt an
der Lizenzdatei, also gilt eine so eingespielte Lizenz im laufenden Backend
sofort. Protokolliert als `license_activate` mit `quelle: lizenz-geraet.sh`.
`entfernen` (seit 25.09.2026) ist dasselbe wie **DELETE /api/license** unten:
`{"ok":true,"entfernt":true,"stufe":"community"}`, `entfernt: false`, wenn keine
Datei lag; protokolliert als `license_remove` mit `quelle: lizenz-geraet.sh`.

**DELETE /api/license** nimmt die Lizenz vom Geraet: die Datei faellt, der
Fuenf-Minuten-Cache auch, und die Antwort traegt schon den neuen Stand. Ohne
Datei ist das kein Fehler (`entfernt: false`). Protokolliert als
`license_remove`.

```json
{
  "success": true,
  "entfernt": true,
  "license": { "valid": false, "tier": "community", "features": { "maxApps": 3, "...": "..." } },
  "timestamp": "2026-09-23T10:00:00.000Z"
}
```

```json
// 400 ohne oeffentlichen Schluessel am Geraet
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Der öffentliche Lizenzschlüssel fehlt am Gerät (/arasul/config/public_license_key.pem). Ohne ihn lässt sich keine Lizenz prüfen; das Gerät bleibt community."
  }
}

// 400 mit falscher Signatur (auch: eine erratene Zeichenkette mit Punkt)
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Die Signatur der Lizenz ist ungültig: sie stammt nicht vom Lizenzschlüssel dieses Produkts. Das Gerät bleibt community."
  }
}
```

---

### GDPR / Data Privacy

`export` und `me` gelten für beide Rollen (die eigenen Daten); `ziele` und `categories` sind Admin.

| Method | Endpoint               | Auth  | Description                                                                                                                                                                                        |
| ------ | ---------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/gdpr/export`     | Beide | Full GDPR data export (Art. 20) as JSON file. `?benutzer=<id>` (nur Admin): die Auskunft über eine andere Person (Verwaltung → Daten); `?ziel=<datentraeger>` legt sie auf eine angesteckte Platte |
| GET    | `/api/gdpr/categories` | Admin | List data categories with record counts; `?benutzer=<id>` zählt für diese Person, ohne Angabe für den Aufrufer                                                                                     |
| GET    | `/api/gdpr/ziele`      | Admin | Angesteckte Datenträger als Export-Ziel (Plan 023 J3). Die Antwort trägt einen `hinweis`, der „keine Platte angesteckt" von „Ordner nicht eingebunden" unterscheidet                               |
| DELETE | `/api/gdpr/me`         | Beide | Delete own account (Art. 17 — right to erasure)                                                                                                                                                    |

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

| Method | Endpoint                                         | Beschreibung                                               |
| ------ | ------------------------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/backup/status`                             | Sichert das Gerät? Wann lag zuletzt eine Kopie außer Haus? |
| GET    | `/api/backup/sicherungen`                        | Was liegt da — Name, Art, Größe, Datum                     |
| GET    | `/api/backup/extern/inhalt`                      | Was liegt auf dem angesteckten Datenträger (J37)           |
| GET    | `/api/backup/staende`                            | Die Stände zum Zurückholen: Zeitpunkt, Inhalt, Stand davor |
| POST   | `/api/backup/sicherung`                          | Jetzt sichern (dauert Minuten, antwortet erst danach)      |
| POST   | `/api/backup/wiederherstellung`                  | Zurück auf eine Sicherung, danach laufen die Apps wieder   |
| POST   | `/api/backup/wiederherstellung/app/:id`          | Nur die Daten **einer** App zurück (J35)                   |
| POST   | `/api/backup/wiederherstellung/bereich/:kennung` | Nur die Dateien **eines** Bereichs des Firmenordners (M5)  |
| POST   | `/api/backup/test`                               | Wiederherstellungstest gegen eine Wegwerf-Datenbank        |

Gesichert werden fünf Dinge, und die Frage dahinter ist jedes Mal dieselbe: was
bekommt der Kunde nach einem Geräteverlust nicht zurück, wenn es fehlt? Seit M5
(03.10.2026) entsteht daraus jede Nacht **ein Stand**, der nur Geändertes neu
schreibt (restic, verschlüsselt; aufbewahrt 7 Tage, 12 Wochen, 60 Monate —
[BACKUP_SYSTEM.md](../ops/BACKUP_SYSTEM.md#stände-seit-m5)).

| Art            | Was                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres`     | Nutzer und Rollen, Apps und Stände, Freigaben, Schlüssel je App, Flow-Läufe mit Schritten, Freigabe-Anfragen, Modell-Überschreibungen, das Migrationsbuch                       |
| `apps`         | Die **Pakete** der Apps (`/arasul/apps/<id>/<version>/`) — Manifest, fertiges Frontend, Dockerfile mit Kontext. Die Images werden nicht gesichert, sie werden daraus neu gebaut |
| `flows`        | Die Flow-Dateien, die ein Mensch am Gerät geschrieben hat (`/arasul/flows`)                                                                                                     |
| `config`       | `.env`, Zertifikate, Traefik, Geheimnisse — **ohne** den Sicherungsschlüssel selbst                                                                                             |
| `firmenordner` | Die Dateien des Firmenordners (`/arasul/firmenordner`, J33), nur auf einem Gerät mit dem Profil `firmenordner`; seit J35 auch in `GET /api/backup/sicherungen`                  |

App-**Volumes** stehen nicht in dieser Liste, weil es keine gibt: eine App
bekommt weder Bind-Mount noch benanntes Volume
(`services/app/appContainer.js`). Ihren Speicher hat sie seit H7 als
**Datenbank**, und die geht mit dem `postgres`-Teil mit.

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
      "konfiguration": "true",
      "firmenordner": "true",
      "firmenordnerGeaendert": { "anzahl": 2, "dateien": ["./Angebote/neu.pdf", "./Regeln.md"] },
      "stand": {
        "status": "ok",
        "id": "637755c9…",
        "geschrieben": 2202009,
        "gelesen": 699924480,
        "klartext": 0
      }
    },
    "staende": {
      "anzahl": 9,
      "bytes": 415236096,
      "neuester": {
        "id": "637755c9…",
        "zeitpunkt": "2026-10-03T02:00:12+02:00",
        "geschrieben": 2202009
      },
      "aeltester": "2026-09-25T02:00:10+02:00",
      "aufbewahrung": { "tage": 7, "wochen": 12, "monate": 60 },
      "hinweis": null,
      "entfallenWegenPlatz": []
    },
    "ausserhalb": {
      "vorhanden": true,
      "zeitpunkt": "2026-08-27T02:03:11+02:00",
      "bytes": 5211334,
      "dateien": 4,
      "ziel": "/arasul/extern",
      "letzterVersuch": "kopiert",
      "datentraeger": {
        "angesteckt": true,
        "name": "GOLDENBACKUP",
        "dateisystem": "ext4",
        "frei": 412000000000,
        "gesamt": 931000000000
      },
      "klartextDateien": 0,
      "inhalt": { "apps": ["belege"] }
    },
    "schluessel": {
      "passt": true,
      "geprueft": "2026-10-02T02:05:00Z",
      "grund": null,
      "aelterUnlesbar": 0,
      "lokal": { "neueste": "arasul_db_….sql.gz.enc", "passt": true, "lesbar": 7, "unlesbar": 0 },
      "extern": { "neueste": null, "passt": null, "lesbar": 0, "unlesbar": 0 }
    },
    "wiederherstellungstest": { "status": "ok", "zeitpunkt": "...", "tabellen": 14 },
    "letzteWiederherstellung": null,
    "laeuftGerade": null
  },
  "timestamp": "2026-08-27T10:00:00.000Z"
}
```

**Stände (M5).** `letzteSicherung.stand` ist der Stand dieser Nacht: `status`
(`ok`, `fehler`, `voll`), was gelesen und was davon **neu geschrieben** wurde
(Bytes; das ist die Zahl zu „nur Geändertes“), und `klartext` (soll `0` sein).
`staende` liest das Backend aus `staende.json`, das der Sicherungsdienst nach
jedem Lauf ablegt; `null`, solange es keinen Stand gibt. `hinweis` ist gesetzt,
wenn das Ziel voll war und dafür der älteste Stand gefallen ist,
`entfallenWegenPlatz` nennt deren Zeitpunkte. `ausserhalb.geschrieben` ist, was
der letzte Stand auf dem Datenträger neu geschrieben hat.

`firmenordnerGeaendert` nennt, was sich im Firmenordner **während** der
Sicherung bewegt hat (J35): die Zahl und höchstens hundert Pfade relativ zum
Firmenordner, `null` bei einem Bericht von vor J35. Das ist kein Fehlschlag —
jemand hat eine Datei abgelegt, während gesichert wurde, und `status` bleibt
`completed`. Eine Datei, die erst während des Laufs kam, steht aber vielleicht
nicht im Archiv; alles, was vorher da war und unberührt blieb, schon.

**Datenträger und Schlüssel (J37).** `ausserhalb.datentraeger` kommt aus dem,
was der Host über den eingehängten Datenträger hinterlegt hat (Name, Dateisystem)
und aus `statfs` (`frei`/`gesamt` in Bytes); ohne eingehängten Datenträger oder
ohne diese Auskunft ist `angesteckt` `false` und der Rest `null`. Der interne
Pfad steht nie in der Oberfläche. `klartextDateien` ist die Zahl unverschlüsselter
Dateien auf dem Datenträger (soll `0` sein, `null` = unbekannt), `inhalt.apps` die
Kennungen der zuletzt dort gesicherten Apps. `letzterVersuch` kann auch
`zu_wenig_platz` und `nur_verschluesselt` sein. `schluessel` ist das Ergebnis
der Schlüsselprüfung des Sicherungsdienstes: `passt: false` heißt, der Schlüssel
dieses Geräts öffnet die letzte Sicherung nicht (dann braucht das Zurückholen den
Wiederherstellungscode des früheren Schlüssels), `passt: null` heißt „nichts zu
prüfen“ (noch keine Sicherung, oder keine Prüfdatei). Bei `passt: false` legt das
Backend alle fünf Minuten höchstens **eine** kritische Meldung je Prüfung in
`notification_events` an (`event_type` `backup`).

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

**GET /api/backup/extern/inhalt** (J37, nur `admin`) — was auf dem
Datenträger liegt. Seit M5 aus `arasul-sicherung/MANIFEST.json` neben dem Repo
der Stände (`tage` sind dann die Tage der Stände, `neuesteSicherung.staende`
ihre Zahl); ein Datenträger von vor M5 wird weiter aus dem `MANIFEST.json` des
neuesten Tagesordners gelesen (`arasul-sicherung/<JJJJMMTT>/`; Namen, die nicht
aus acht Ziffern bestehen, zählen nicht):

```json
{
  "data": {
    "angesteckt": true,
    "name": "GOLDENBACKUP",
    "neuesteSicherung": {
      "datum": "20261002",
      "zeitpunkt": "2026-10-02T02:00:00Z",
      "bytes": 5211334,
      "apps": [{ "id": "belege", "staende": ["test", "live"] }],
      "dateien": 9,
      "staende": 9
    },
    "tage": ["20261002", "20261001"]
  }
}
```

Ohne Datenträger: `angesteckt: false`, `neuesteSicherung: null`, `tage: []` —
kein Fehler.

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

`art` ist eine von `stand` (seit M5, dazu `id`), `postgres`, `app-datenbanken`
(je App und Stand, dazu `datenbank`), `apps`, `flows`, `config` und
`firmenordner`. Eine Zeile `stand` ist ein ganzer Stand des Geräts; `bytes` ist,
was er **neu** geschrieben hat (`0`, wenn der Lauf, der ihn anlegte, es nicht
gemessen hat), `id` die Kennung für `POST /api/backup/wiederherstellung`. Die
übrigen Arten sind die Tagesordner von vor M5; sie bleiben, bis jemand sie
wegräumt.

```json
{
  "art": "stand",
  "zweck": "Stand des ganzen Geräts: Datenbank, Apps, Flows, Firmenordner, Konfiguration",
  "name": "637755c9",
  "id": "637755c9a1b2…",
  "bytes": 2202009,
  "zeitpunkt": "2026-10-03T00:00:12.000Z"
}
```

**Zurückholen, für alle drei Wege gleich (M5, Auftrag sicherung-zurueckholen,
04.10.2026):** jeder Aufruf verlangt `passwort`, das Passwort des angemeldeten
Administrators. Falsch oder leer: `403` mit dem Code `PASSWORT_FALSCH` (kein
`401`, die Sitzung bleibt), und je Mensch gehen zehn Versuche in 15 Minuten
(`429`). Das Passwort steht in keinem Protokoll. **Vorher sichert das Gerät den
jetzigen Stand** (`backup.sh` mit `ARASUL_STAND_ANLASS=vorher`): ein ganz
normaler Stand mit dem Tag `vorher`, den die Aufbewahrung 7/12/60 nicht nimmt
und der nur auf diesem Gerät liegt. Er steht danach in `GET
/api/backup/staende` mit `vorher: true` und `fuer`, und wer ihn wählt, macht das
Zurückholen auf demselben Weg rückgängig. Misslingt er, wird nichts angefasst
(`erfolg: false`, erster Satz im Bericht). Ohne `stand`/`stand_id` gilt der
neueste Stand **von vor** dem Stand davor. Jede Antwort trägt `vorher: {
erfolg, id, zeitpunkt }`.

**GET /api/backup/staende?quelle=lokal|extern** (M5, nur `admin`) — die Stände
zum Zurückholen, neueste zuerst. `quelle` wie unten; `extern` ohne Datenträger
ist ein `409`.

```json
{
  "data": [
    {
      "id": "534c356ba6ec4fee…",
      "zeitpunkt": "2026-10-03T21:11:54.838Z",
      "vorher": false,
      "fuer": null,
      "geschrieben": 9814016,
      "inhaltBekannt": true,
      "apps": [{ "id": "belege", "name": "Belege" }],
      "appDatenbanken": ["arasul_app_belege_live", "arasul_app_belege_test"],
      "bereiche": [{ "kennung": "projekte", "name": "Projekte", "vorhanden": true }]
    }
  ],
  "anzahl": 1,
  "quelle": "lokal"
}
```

`fuer` ist bei einem Stand davor `{ "art": "app"|"bereich"|"geraet", "id": … }`.
Was ein Stand enthält, liest `backup.sh` je Stand einmal aus dem Repo
(`restic ls`, nicht rekursiv) und legt es in `staende.json` bzw. im Manifest des
Datenträgers ab; `inhaltBekannt: false` heißt, das ließ sich nicht lesen.
`bereiche[].vorhanden` sagt, ob es den Bereich am Gerät noch gibt; nur dann
lässt er sich zurückholen. Die Oberfläche zeigt einen Stand nach Datum und
Uhrzeit in Worten, die Kennung nur unter „Technische Angaben".

**POST /api/backup/wiederherstellung:**

```json
{
  "stand": "637755c9",
  "bestaetigung": "wiederherstellen",
  "passwort": "…",
  "quelle": "extern",
  "wiederherstellungscode": "ABCD-1234-EFGH"
}
```

`stand` (M5) nennt einen Stand mit seiner Kennung (8 bis 64 Zeichen aus `0-9a-f`,
die ersten acht reichen); ohne `stand` und ohne `datei` gilt der **neueste
Stand**. `datei` nimmt stattdessen eine Datei aus den Tagesordnern von vor M5
(z. B. `arasul_db_20260827_020054.sql.gz`). Beides zusammen: `400`.

`quelle` (J37) ist `lokal` (Vorgabe) oder `extern` (vom angesteckten
Datenträger; ohne ihn `409` mit „Es ist kein Datenträger angesteckt.“).
`wiederherstellungscode` ist nur nötig, wenn der Schlüssel dieses Geräts nicht
zur Sicherung passt (höchstens 100 Zeichen, nur Buchstaben, Ziffern, Leerzeichen
und Striche). Er geht nie in die Befehlszeile, sondern als Umgebungsvariable in
den Aufruf im Sicherungs-Container, und steht nicht im Protokoll.

`datei` ist ein **Name**, kein Pfad, und liegt im Sicherungsordner. `bestaetigung` muss das Wort `wiederherstellen` sein — kein
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

**POST /api/backup/wiederherstellung/app/:id** (J35, 25.09.2026) — die Daten
**einer** App aus der letzten Sicherung, und sonst nichts:

```json
{
  "passwort": "…",
  "stand_id": "534c356b",
  "stand": "live",
  "quelle": "extern",
  "paket": true,
  "wiederherstellungscode": "ABCD-1234-EFGH"
}
```

Seit J37 zusätzlich: `quelle` (`lokal` Vorgabe, oder `extern` vom Datenträger,
dann gilt dessen Manifest), `paket` (Vorgabe `true`:
nach den Daten wird auch das **Paket** der App aus dem Archiv zurückgeholt,
`/arasul/apps/<id>/`, und jeder Stand, den es in `app_staende` gibt, daraus neu
gebaut; mit `false` bleibt es bei den Daten und dem Neuverbinden) und
`wiederherstellungscode` (wie oben).

Seit M5 bestätigt `passwort` (siehe oben); `bestaetigung` (die Kennung,
abgetippt) geht noch, muss dann aber stimmen. `stand_id` wählt den Zeitpunkt
(einen Stand aus `GET /api/backup/staende`); geholt wird nur, was darin steht
(`inhalt`): eine App, die dort nur ihr Paket hat, bekommt nur ihr Paket.
`stand` engt auf Test oder Live ein, ohne ihn kommen beide, soweit gesichert. Der ganze
Weg zurück darüber ersetzt die **ganze** Datenbank des Geräts und nähme jeder
anderen App und jedem Menschen, was seit der Sicherung geschah — dieser Weg
fasst je Stand genau die eine Datenbank `arasul_app_<id>_<stand>` an: vorher
abgezogen nach `vor_wiederherstellung/`, dann neu angelegt und **als Rolle der
App** eingespielt (sonst gehörten die Tabellen `arasul`, und die App bekäme auf
ihre eigenen Daten „permission denied").

Er geht auch, wenn die App **gerade entfernt** ist: die Namen kommen aus der
Kennung, nicht aus einer Tabelle. Die Daten liegen dann bereit, und das nächste
Einspielen findet Rolle und Datenbank vor. Ist die App eingespielt, setzt der
Aufruf ihr Passwort und startet ihren Container neu.

```json
{
  "data": {
    "erfolg": true,
    "app": "probe-daten",
    "quelle": "extern",
    "staende": [
      {
        "stand": "live",
        "datenbank": "arasul_app_probe_daten_live",
        "erfolg": true,
        "neu_gestartet": true,
        "ausgabe": "…"
      }
    ],
    "paket": { "erfolg": true, "ausgabe": "…" },
    "bericht": [
      {
        "schritt": "datenbank",
        "stand": "live",
        "erfolg": true,
        "text": "Die Daten der App (Livestand) sind zurückgeholt."
      },
      {
        "schritt": "paket",
        "erfolg": true,
        "text": "Das Paket der App (Oberfläche und Programm) ist zurückgeholt."
      },
      {
        "schritt": "neu_gestartet",
        "stand": "live",
        "erfolg": true,
        "text": "Die App läuft im Livestand wieder, aus dem zurückgeholten Paket."
      }
    ]
  }
}
```

`paket` ist `null`, wenn kein Paket verlangt wurde oder keine Daten
zurückkamen. `bericht` sind deutsche Sätze für die Oberfläche (`schritt`:
`datenbank`, `paket`, `neu_gestartet`), nie Stacktraces; `erfolg` ist `false`,
sobald ein Schritt scheiterte.

Seit M5 kommen die Daten aus dem **neuesten Stand**; ob die App darin steht,
liest das Backend aus `staende.json` (`neuester.app_datenbanken`).

**Fehler:** `400` ohne `passwort` oder wenn `bestaetigung` nicht die Kennung
ist. `403 PASSWORT_FALSCH`. `404`, wenn der Stand `stand_id` nicht (mehr) da ist
oder es darin von der App nichts gibt; `409`, wenn es auf diesem Gerät noch
keinen Stand gibt. `404`, wenn es
von keinem Stand der App eine Sicherung gibt (bei `quelle: extern`: wenn die App
im Verzeichnis des Datenträgers nicht steht). `409`, wenn `quelle: extern` ohne
angesteckten Datenträger. `409` und `503` wie oben.

**POST /api/backup/wiederherstellung/bereich/:kennung** (M5, Auftrag
sicherung-zurueckholen) — die Dateien **eines** Bereichs des Firmenordners
(eines Raums der Ebene 0 oder 1, `firmenordner_ordner.kennung`) auf einen
Stand, sonst nichts: kein anderer Bereich, keine Rechte, nicht der ganze
Firmenordner.

```json
{ "passwort": "…", "stand_id": "534c356b", "quelle": "lokal" }
```

Was seit dem Stand dazukam, geht; was fehlt, kommt wieder; Geänderte bekommen
ihren Inhalt von damals, an Ort und Stelle (die Kennung im Dateidienst bleibt).
Die Verwaltung des Dienstes im Bereich (`.oc-nodes`, `.oc-tmp`, `.Trash`) bleibt
unberührt, und der Dienst läuft dabei weiter; er nimmt die Dateien auf wie
jede, die am Gerät abgelegt wird (`wiederherstellen.sh --firmenordner-bereich`).

```json
{
  "data": {
    "erfolg": true,
    "bereich": { "kennung": "projekte", "name": "Projekte" },
    "stand": { "id": "534c356b…", "zeitpunkt": "2026-10-03T21:11:54.838Z" },
    "vorher": { "erfolg": true, "id": "9f0e…", "zeitpunkt": "2026-10-04T21:41:02+00:00" },
    "zahlen": { "geschrieben": 2, "entfernt": 1, "ordnerNeu": 0 },
    "bericht": [
      { "schritt": "vorher", "erfolg": true, "text": "Der jetzige Stand ist vorher gesichert. …" },
      {
        "schritt": "bereich",
        "erfolg": true,
        "text": "Die Dateien des Bereichs „Projekte“ sind zurückgeholt: 2 Dateien zurückgeschrieben, 1 entfernt, die seitdem dazukamen."
      }
    ]
  }
}
```

**Fehler:** `400` ohne `passwort` oder mit einer Kennung, die keine ist. `403
PASSWORT_FALSCH`. `404`, wenn es den Bereich am Gerät nicht gibt (erst anlegen,
dann zurückholen), wenn er im Stand nicht steht oder der Stand nicht (mehr) da
ist. `409` und `503` wie oben. Bei einem Fehlschlag `500` mit dem Ergebnis im
Rumpf und `ausgabe`.

`GET /api/backup/sicherungen` nennt seit J35 bei jeder Zeile der Art
`app-datenbanken` auch `datenbank` — welche es ist, aus dem Dateinamen, denn
nach dem Entfernen einer App gibt es keine Zeile mehr, die es sagte.

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

Flows der Plattform sind Markdown-Dateien mit YAML-Kopf unter `data/flows/`
(Pfad im Container `FLOWS_DIR`, Vorgabe `/arasul/flows`); **eine Tabelle gibt
es nicht**, die Datei ist die Quelle. Geblieben ist eine einzige Route: die
Liste, die das Ara-Kit vor und nach einem Update liest (`lib/upgrade.mjs`), um
zu sehen, dass kein Flow verloren ging.

| Method | Endpoint     | Description                                                                           |
| ------ | ------------ | ------------------------------------------------------------------------------------- |
| GET    | `/api/flows` | Alle Flows (auch Mitarbeiter); fehlerhafte Dateien stehen getrennt unter `fehlerhaft` |

**Flows starten.** Ein Plattform-Flow läuft über den externen Auslöser
`POST /api/v1/external/flows/:name/run` (API-Schlüssel, Bereich `flow:run`, siehe
Externe API), nach Uhrzeit über den **Zeitplaner** des Geräts (Auslöser `zeitplan`
im Kopf, [FLOWS.md](../features/FLOWS.md#zeitplaner-flows-nach-uhrzeit-m5-04102026))
oder durch ein **Ereignis der App** (`POST /api/v1/external/ereignisse/:name`,
Kontrakt 13). Gelesen und abgebrochen wird ein Lauf über `GET /api/laeufe/:id`
und `POST /api/laeufe/:id/abbrechen`. Anlegen, Ändern und Löschen über die
Schnittstelle, die Läufe unter `/api/flows/laeufe` samt SSE-Strom, Rückfrage
und Wiederholen sowie das Hochladen von Stilvorlagen sind am 06.10.2026
gefallen: keine Oberfläche und kein Werkzeug rief sie.

**Prüfschritt & Annahmen-Protokoll (Plan 014, Phase 2).** Bei Dokument-Flows
(`ausgabe.format ≠ keins`) steht zwischen Entwurf und Ausgabe ein fester
Prüfschritt: deterministische Checks (Platzhalter-Reste, offene `[Stellen]`,
Gliederung, Ziel-Länge), eine LLM-Prüfrunde gegen Auftrag und Vorgaben,
höchstens **eine** Korrekturrunde. Das Laufprotokoll zeigt die Einzelprüfungen
als Schritt `pruefung` (plus ggf. `korrektur`). Statt Rückfragen gilt das
Annahmen-Protokoll: getroffene Annahmen landen als `flow_runs.annahmen`
(JSON-Array) am Lauf und kommen in den Lauf-Antworten der externen API
(`annahmen`-Feld) mit. Der Prüfschritt wirft nie: scheitert die Prüfrunde
selbst, läuft der Entwurf unverändert weiter und das Protokoll benennt das.

Ein Lauf läuft **auf dem Server** und hängt an keinem Client. Ein Neustart des
Backends setzt jeden Lauf, der noch auf `laeuft` steht, auf `fehler` (ein
losgelöster Lauf überlebt den Prozess nicht).

### Freigabe-Anfragen (Phase C7)

Ein Flow kann anhalten und um Freigabe bitten (Werkzeug `freigabe_anfordern`).
Der Lauf steht dann auf `wartend`, und ein **Mensch** entscheidet — über die
Sitzung, nicht über einen Schlüssel.

| Method | Endpoint                                 | Description                                                              |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/freigabe-anfragen`                 | Die offenen Freigaben, die beim Aufrufer liegen (M5: „Für Sie")          |
| GET    | `/api/freigabe-anfragen/bei-anderen`     | Was der Aufrufer entscheiden dürfte, das aber bei einem anderen liegt    |
| GET    | `/api/freigabe-anfragen/eingereicht`     | Was der Aufrufer eingereicht hat und noch offen ist, mit dem Kreis       |
| POST   | `/api/freigabe-anfragen/:id/bestaetigen` | Ja. Body `{}` oder `{ felder }` (M5). Der Lauf läuft weiter              |
| POST   | `/api/freigabe-anfragen/:id/ablehnen`    | Nein, Body `{ begruendung }` (Pflicht). Der Lauf endet als `abgebrochen` |
| POST   | `/api/freigabe-anfragen/:id/uebernehmen` | Die Anfrage liegt danach beim Aufrufer (Body `{}`, M5)                   |
| POST   | `/api/freigabe-anfragen/:id/weitergeben` | Body `{ an }` (Benutzername): liegt danach bei ihm (M5)                  |

**Bei wem eine Freigabe liegt (M5, 04.10.2026).** Eine neue Anfrage liegt bei
der **Standardperson ihrer Stufe** (`app_stufen_personen`, gesetzt unter `PUT
/api/apps/:id/stufen/:stufe`), sofern die im Kreis steht; ohne Stufe oder ohne
Standardperson liegt sie **bei allen im Kreis** (`liegt_bei: null`).
Je Anfrage nennt die Liste `app_zeigt_freigaben` (Kontrakt 12): `true`, wenn die
App im Manifest `zeigt_freigaben` erklärt — dann öffnet die Startseite die App
beim Vorgang —, sonst `false` — dann öffnet sie die Freigabe in Arasul.
`GET /api/freigabe-anfragen` zeigt nur, was beim Aufrufer liegt — die
Startseite und die Zahl am Haus lesen diese Liste —, `…/bei-anderen` den Rest
seines Kreises. Jeder im Kreis kann **übernehmen** oder an einen anderen im
Kreis **weitergeben** (`400`, wenn der Empfänger keinen Zugang hat oder
eingereicht hat; `403`, wenn der Aufrufer selbst nicht im Kreis steht).
Entscheiden kann nur, bei dem sie liegt: sonst `409` mit dem Namen. Verliert
die Person, bei der eine Anfrage liegt, den Zugang oder wird stillgelegt, liegt
sie wieder bei allen. Beide Listen nennen je Anfrage zusätzlich `liegt_bei`,
`liegt_seit`, `stufe` und `stufe_bezeichnung`; `…/eingereicht`, `GET
/api/v1/external/freigaben` und `freigabe` am Lauf nennen `liegt_bei`.

**Wer darf entscheiden.** Jeder, dem die App freigegeben ist (`app_members`,
Phase C2) — Administrator **und** Mitarbeiter. Die Flow-Datei nennt keine
Person und kein Rollenmodell (Entscheidung vom 27.08.2026): sie beschreibt die
Sache, nicht die Zuständigkeit. **Wer eingereicht hat, entscheidet nie
selbst** (seit M5, unabhängig von `ohne_einreicher`): er steht nicht im Kreis
und bekommt beim Entscheiden `403`. **Seit J35 kann die App beim Start des Laufs
den Kreis enger ziehen** (`einreicher`, `freigabe` an
`POST /api/v1/external/flows/:name/run`): mit `ohne_einreicher` entscheidet
nicht, wer eingereicht hat, mit `entscheider` nur die Rolle `admin` oder die
genannten Konten. Wer danach nicht im Kreis steht, sieht die Anfrage in
`GET /api/freigabe-anfragen` nicht und bekommt beim Entscheiden `403` mit dem
Grund (»selbst eingereicht« oder »benannten Entscheidern vorbehalten«). Die
Liste nennt je Anfrage zusätzlich `app_name`, `einreicher`, `ohne_einreicher`,
`benannt`, `entscheider` (`{ rolle }`, `{ konten }` oder `null`) und `kreis` —
die Benutzernamen, die sie **jetzt** entscheiden können (seit 26.09.2026).
`GET /api/freigabe-anfragen/eingereicht` ist die Gegenseite: die offenen
Anfragen, deren Einreicher der Aufrufer ist, mit `app_name`, `titel`,
`angefragt_am`, `frist`, `ohne_einreicher`, `entscheider` und `kreis`, dazu
`wo` und `adresse` des Ortes, an dem entschieden wird. Bei vier Augen sieht der
Einreicher seine Anfrage oben nicht — hier sieht er, bei wem sie liegt. Wer die App nicht freigegeben hat, bekommt `403`; eine
Anfrage, die es nicht gibt, `404`; eine, die nicht mehr offen oder deren Frist
abgelaufen ist, `409` — vier Gründe, vier Meldungen, weil der Mensch am anderen
Ende gerade auf „Bestätigen" gedrückt hat.

**Die Frist** steht als `frist_minuten` in den `parameter` des Schritts. Fehlt
sie, gilt die Frist der Stufe (`parameter.stufe`, Frist je Stufe im Flow-Kopf
unter `stufen`), fehlt auch die, `FLOW_FREIGABE_FRIST_MINUTEN` (Vorgabe 10080 =
sieben Tage). Höchstens ein Jahr. Läuft sie ab, endet der Lauf als `abgelaufen`
— auch dann, wenn das Backend dazwischen neu gestartet wurde. `GET
/api/freigabe-anfragen` und `GET /api/v1/external/freigaben` nennen die `stufe`.

**Nicht zu verwechseln mit `/api/freigaben`** (Admin): das ist die Freigabe
einer _App_ für einen Menschen. Das eine ist die Voraussetzung für das andere.

**Korrekturfelder (M5, 04.10.2026, Kontrakt 10).** Eine Freigabe aus einer
Erkennung trägt in beiden Listen `felder` (je Feld `name`, `vorschlag` der KI,
`unsicher`, `fehlend`, `aenderbar`; zu Prüfendes zuerst; `null` ohne
Erkennung), `original` (Bild oder PDF als Adresse gleicher Herkunft,
`/apps/<id>/…` bzw. `/apps/<id>/test/…`, oder `null`) und `frueher` (die
früheren Freigaben desselben Laufs, älteste zuerst, mit `titel`, `stufe`,
`status`, `entschieden_von`, `entschieden_am`, `begruendung`, `korrekturen`).
Wer bestätigt, schickt geänderte Werte mit:

```json
POST /api/freigabe-anfragen/42/bestaetigen
{ "felder": { "datum": "01.10.2026" } }
```

Nur Felder, die die Rolle unter `ergebnis.aenderbar` nennt; jedes andere ist
`400` („… ist in dieser Freigabe nicht änderbar"), und die Freigabe bleibt
offen. Wer nicht entscheiden darf, bekommt vorher seinen Grund (`403`/`409`),
nicht die Liste der Felder. Ein Wert gleich dem Vorschlag ist keine Änderung.
Eine Ablehnung trägt keine `felder` (`400`). Gespeichert wird je Feld
`{feld, vorschlag, wert, von, von_id, am}` an der Anfrage (`korrekturen`), und
der weitere Lauf arbeitet mit dem neuen Wert. Das Sicherheitsprotokoll nennt
unter `freigabe_bestaetigt` die geänderten Feldnamen (`geaendert`), nicht ihren
Inhalt.

**Antwort von `POST …/bestaetigen`:** `{ data: { id, run_id, app_id, stand,
flow_name, titel, status, entschieden_am, benutzer, fortgesetzt, korrekturen } }`.
`fortgesetzt: true` heißt: der Lauf geht weiter — im laufenden Prozess oder, wenn
das Backend seit der Anfrage neu gestartet wurde, aus der Datenbank ab dem
angehaltenen Schritt. `fortgesetzt: false` bleibt für einen Lauf, der keinen
Prüfpunkt hat (Freigabe aus der Werkzeug-Schleife oder einer Rolle): dort steht
die Entscheidung, aber niemand führt den Lauf weiter. Das wird gesagt und nicht
verschwiegen.

Die App selbst liest den Stand über `GET /api/v1/external/freigaben` (siehe
External API) — lesen darf sie, entscheiden nicht.

### Ausweise (Brücke, 21.09.2026)

Der Ausweis eines Menschen **außerhalb des Browsers**: je Mensch und Rechner
einer, gesendet als `Authorization: Bearer ausweis_…`. Er sagt „ich bin dieser
Mensch" und nichts weiter; was er damit darf, entscheidet wie immer die
Freigabe (`app_members`).

| Method | Endpoint            | Description                                         |
| ------ | ------------------- | --------------------------------------------------- |
| GET    | `/api/ausweise`     | Meine Ausweise, ohne Werte                          |
| POST   | `/api/ausweise`     | Einen ausstellen, Body `{ name }` — Wert **einmal** |
| DELETE | `/api/ausweise/:id` | Widerrufen: meinen, als Administrator jeden         |

**Ein Ausweis widerruft sich selbst** (J34): `DELETE /api/ausweise/<eigene Nummer>`
mit dem Ausweis als Bearer antwortet `204` ohne Rumpf, derselbe Wert danach
`401`. Es ist die einzige Ausweis-Verwaltung, die er annimmt, und nur für sich —
jede andere Nummer, auch eine des eigenen Menschen und auch bei einem
Administrator, ist `404`. So kann `sync --uninstall` am Rechner den Ausweis am
Gerät ungültig machen.

Ein Ausweis in der Liste: `{ id, name, praefix, angelegt_am,
zuletzt_benutzt_am }`. `zuletzt_benutzt_am: null` heißt „noch nie benutzt" und
ist eine Auskunft, kein Fehlwert — ein Ausweis, der seit Wochen daliegt und nie
gebraucht wurde, gehört widerrufen. Nachgeführt wird der Zeitpunkt höchstens
einmal je Minute: die Forward-Auth steht vor **jedem** Aufruf an **jede** App.

`POST` antwortet `201` mit zusätzlich `ausweis` — dem Klartext. **Er steht
genau in dieser einen Antwort**, danach nirgends mehr: am Gerät liegt nur
sein sha256. Weder das Prüfprotokoll noch eine Logzeile nennt ihn; dort steht
`praefix`, an dem ein Mensch die Zeile wiedererkennt. Ein Name, den es schon
gibt, ist `409` (je Mensch eindeutig).

**Ausstellen kann jeder nur für sich**, auch der Administrator. Der Wert wird
einmal gezeigt, und zwar dem, der vor dem Bildschirm sitzt; ein Ausweis, den
ein Administrator weiterreicht, hat auf dem Weg dorthin in einer Mail
gestanden. Widerrufen darf er dagegen jeden — ein Rechner, der abhanden kommt,
gehört jemandem, der vielleicht gerade nicht am Gerät ist. Ein fremder Ausweis
und ein Ausweis, den es nicht gibt, sind für einen Mitarbeiter **dieselbe**
Antwort: `404`. Sonst wäre die Nummernfolge eine Auskunft darüber, wie viele
Ausweise am Gerät liegen. Widerrufen heißt **löschen**: „gilt nicht mehr" und
„gibt es nicht" sind dieselbe Auskunft, und zwei Zustände dafür wären zwei
Stellen, an denen die Antwort später auseinanderläuft.

**Was ein Ausweis öffnet, sind genau drei Wege**, und das ist keine Liste,
sondern die Bauweise: nur wer `middleware/ausweis.js` einbindet, nimmt ihn an.
Überall sonst ist er kein gültiger JWT und bekommt `401` — auch auf den
Routen oben (mit der einen Ausnahme: dem Widerruf seiner selbst), auch auf `/api/profil`.

| Weg                        | Wofür                                               |
| -------------------------- | --------------------------------------------------- |
| `GET /api/apps/:id/zugang` | die Forward-Auth vor dem Backend einer App          |
| `GET /apps/<id>/api/me`    | der eine Weg unter `api/`, der der Plattform gehört |
| `GET /api/apps/meine`      | welche Apps diesem Menschen freigegeben sind        |
| `GET /api/auth/session`    | ob dieser Ausweis gilt, und wem er gehört           |

Die letzte öffnet nichts: sie antwortet in beiden Fällen `200` und sagt, wer
da ist. Das CLI der Brücke fragt dort nach, bevor es ein Token ablegt
(`arasul.mjs login --token-stdin`) und bei jedem `status` — eine Auskunft über
den Ausweis selbst ist kein Zugang, den er gewährt.

**`/apps/<id>/api/me` steht dort, weil es ein Sonderfall ist**, gefunden bei
der Messung am Orin am 21.09.2026. Alles unter `/apps/<id>/api/` geht durch
Traefik an den Container der App und damit durch die Forward-Auth — dieser eine
Weg nicht: Traefik gibt ihn an Arasul (`apps-me`, Zahl 50), und dort stand nur
`optionalAuth`. Ein Agent kam also durch die Forward-Auth in die App hinein,
aber nicht an die Auskunft „wer bin ich" heran, und das ist die erste Frage,
die er stellt.

**Die statische Seite einer App bleibt zu**, auch mit einem Ausweis: sie
antwortet `302` auf die Anmeldung. Ein Ausweis öffnet App-**Schnittstellen**,
und eine Seite ist keine — sie ist für einen Menschen in einem Browser, und der
hat eine Sitzung.

An der Forward-Auth ändert ein Ausweis nichts: die Freigabe entscheidet. Eine
App, die diesem Menschen nicht freigegeben ist, antwortet `403`; ein
widerrufener Ausweis `401`. Die App dahinter bekommt dieselben zwei Kopfzeilen
wie bei einem Browser (`X-Arasul-User`, `X-Arasul-Role`) und merkt den
Unterschied nicht.

### Firmenordner (J33, 22.09.2026)

Der Dateidienst am Gerät (OpenCloud mit der Ablage `posix`) und die Ordner, die
darin liegen. Er läuft **nur mit dem Profil `firmenordner`**; ohne ihn
antwortet der erste Weg `503` mit dem Satz, dass es auf diesem Gerät keinen
gibt — und nicht mit einer leeren Liste. „Du hast keine Ordner" und „hier gibt
es keinen Dienst" sind zwei verschiedene Auskünfte, und ein CLI, das die erste
bekommt, räumt den Ordner auf dem Rechner des Menschen leer.

Die ganze Sache — warum es diesen Dienst gibt, wie ein Mensch hineinkommt,
warum es eine **zweite Passwortablage** ist und wie sie geschützt ist — steht
in [`docs/features/FIRMENORDNER.md`](../features/FIRMENORDNER.md).

| Method | Endpoint                                                            | Description                                                                                                                        |
| ------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/firmenordner`                                                 | Wo der Dienst liegt und welche Ordner **ich** habe                                                                                 |
| GET    | `/api/firmenordner/sicht`                                           | Meine `sicht.md`, als Text (Ausweis oder Sitzung)                                                                                  |
| GET    | `/api/firmenordner/passt?pfad=&bytes=`                              | Passt das noch hinein? (Ausweis oder Sitzung)                                                                                      |
| GET    | `/api/firmenordner/platz`                                           | Belegt, Grenze, frei und `revisionen` (Anzahl, Bytes früherer Fassungen auf der Platte, nicht in `belegt`) je Raum (Administrator) |
| PUT    | `/api/firmenordner/ordner/:id/grenze`                               | Die Größengrenze setzen oder wegnehmen (Admin.)                                                                                    |
| GET    | `/api/firmenordner/ordner`                                          | Alle Ordner am Gerät (Administrator)                                                                                               |
| POST   | `/api/firmenordner/ordner`                                          | Einen anlegen (Administrator)                                                                                                      |
| GET    | `/api/firmenordner/ordner/:id/aenderungen`                          | Wer zuletzt wann etwas geändert hat (Administrator)                                                                                |
| DELETE | `/api/firmenordner/ordner/:id`                                      | Wegwerfen, samt Inhalt (Administrator)                                                                                             |
| GET    | `/api/firmenordner/papierkorb`                                      | Wie viel in welchem Papierkorb liegt (Administrator)                                                                               |
| GET    | `/api/firmenordner/ordner/:id/papierkorb`                           | Was im Papierkorb liegt (Administrator)                                                                                            |
| DELETE | `/api/firmenordner/ordner/:id/papierkorb`                           | Den Papierkorb leeren, endgültig (Administrator)                                                                                   |
| POST   | `/api/firmenordner/ordner/:id/papierkorb/:eintrag/wiederherstellen` | Einen Eintrag zurückholen (Administrator)                                                                                          |
| DELETE | `/api/firmenordner/ordner/:id/papierkorb/:eintrag`                  | Einen Eintrag endgültig entfernen (Administrator)                                                                                  |
| GET    | `/api/firmenordner/rechte`                                          | Wer auf welchem Ordner was darf (Administrator)                                                                                    |
| POST   | `/api/firmenordner/rechte`                                          | Ein Recht vergeben (Administrator)                                                                                                 |
| DELETE | `/api/firmenordner/rechte/:ordnerId/:benutzerId`                    | Ein Recht zurücknehmen (Administrator)                                                                                             |
| POST   | `/api/firmenordner/abgleich`                                        | Nachholen, was der Dienst noch nicht weiß                                                                                          |

**Der erste Weg ist der einzige für einen Mitarbeiter**, und er ist der Grund
für die Karte. Er **nimmt einen Ausweis** (Brücke, J34) — die vierte Route, die
das tut: das CLI der Wurzel läuft am Rechner eines Menschen, hat keine Sitzung
und muss vor dem ersten Abgleich wissen, wohin es den Kommandozeilen-Klienten
schickt und welche Ordner es anlegen darf.

```json
{
  "data": {
    "adresse": "https://arasul:8443",
    "adressen": ["https://arasul:8443", "https://arasul.local:8443"],
    "erreichbar": true,
    "benutzer": "mia",
    "ordner": [
      {
        "kennung": "firma",
        "name": "Firma",
        "ebene": 0,
        "art": "wurzel",
        "eltern": null,
        "pfad": "",
        "recht": "lesen"
      },
      {
        "kennung": "projekte",
        "name": "Projekte",
        "ebene": 1,
        "art": "geteilt",
        "eltern": null,
        "pfad": "projekte",
        "recht": "lesen"
      },
      {
        "kennung": "vicona",
        "name": "Vicona",
        "ebene": 2,
        "art": "geteilt",
        "eltern": "projekte",
        "pfad": "projekte/vicona",
        "recht": "schreiben",
        "platz": {
          "belegt": null,
          "grenze": null,
          "frei": 40000000,
          "begrenzt_durch": "grenze",
          "stufe": "gut",
          "im_bereich": true
        }
      }
    ],
    "nicht_abgeglichen": [
      {
        "art": "symlink",
        "text": "Ein Symlink im Baum wird nicht uebertragen -- weder die Verknuepfung noch das, worauf sie zeigt. …"
      }
    ]
  }
}
```

**`nicht_abgeglichen` sagt, was am Abgleich lautlos vorbeigeht.** Gemessen am
22.09.2026 am Orin mit vier Sorten Symlink im Baum — auf eine Datei daneben,
auf einen Ordner daneben, ins Leere, nach draußen: **keiner** steht im
`PROPFIND`, **keiner** ist herunterzuladen (`404`), **keiner** steht in der
Suche, und es gibt keine Fehlermeldung, an der jemand es merken könnte. Das
Gerät kann das nicht heilen — was der Dateidienst nicht kennt, kennt auch das
Backend nicht —, also **sagt** es es: das CLI am Rechner eines Menschen läuft
ohnehin über den Baum und ist die einzige Stelle, die einen Symlink sehen
kann. Die Liste ist eine Liste, damit der nächste Fund dieser Sorte daneben
steht und nicht als zweites Feld irgendwo.

**`adresse` folgt dem Aufrufer, `adressen` nennt alle** (Auftrag
papierkorb-und-adresse-des-firmenordners, 27.09.2026, J34). Bis dahin stand
hier allein `FIRMENORDNER_ADRESSE` (`https://arasul:8443`), und `arasul` löste
in der Generalprobe am Mac nur über Tailscale auf — der DHCP-Name braucht
einen Router, der ihn in seinen DNS einträgt. Jetzt ist `adresse` die Adresse
mit dem Namen, unter dem der Aufrufer das Gerät **gerade** erreicht hat,
sofern er im Zertifikat des Geräts steht (Netzname, `<netzname>.local`, eine
private IPv4 oder eine aus 100.64.0.0/10); sonst die eingestellte. `adressen`
nennt dieselbe zuerst, danach die eingestellte und den mDNS-Namen, ohne
Doppelte. Am Orin gemessen: `arasul`, `arasul.local` und `192.168.0.197`
antworten auf 8443 alle mit `207` — es ist dieselbe Traefik-Instanz mit
demselben Zertifikat. `GET /ordner` trägt beides in `zustand`.

**`platz` sagt, wie viel noch hineinpasst** (Auftrag bereich-quote-sichtbar,
28.09.2026, J33). Jeder Hauptordner und Bereich ist im Dateidienst ein Raum
mit einer **Größengrenze**; bis dahin war sie still 1 GB, und ein Abgleich des
Kits scheiterte mitten im Lauf mit „exceeds the quota for the folder". Je
Ordner stehen `belegt` und `grenze` in Bytes (`grenze: null` heißt ohne Grenze,
also bis zum freien Platz des Geräts), `frei` ist, was noch hineinpasst — bis
zur Grenze, aber nie mehr, als die Platte hat —, `begrenzt_durch` sagt, welche
der beiden Zahlen die engere ist (`grenze` kann der Administrator anheben,
`platte` nicht), `stufe` ist `gut`, `knapp` (ab 90 % der Grenze oder unter
10 GB frei auf der Platte) oder `voll`. **Ein Projekt nennt nur `frei`**
(`im_bereich: true`): es teilt sich die Grenze seines Bereichs, und wer nur
das Projekt hat, sieht den Bereich nicht — auch nicht, wie voll er ist.
Antwortet der Dienst nicht, ist `platz` `null`; die Liste kommt trotzdem.

**`GET /passt?pfad=<pfad>&bytes=<n>` ist die Frage des Kits vor einem
Abgleich**, mit Ausweis wie der erste Weg. `pfad` wie in `ordner[].pfad` (die
Wurzel ist der leere Pfad), `bytes` die Summe dessen, was dazukommen soll.
Passt es, `200` mit `{ passt: true, …platz }`; passt es nicht,
`409 GRENZE_ERREICHT` mit einem Satz, den das Kit so zeigen kann, wie er kommt
(„„projekte“ ist zu voll: frei sind noch 40 MB, gebraucht werden 60 MB. Ihr
Administrator kann die Grenze unter Einstellungen → Firmenordner anheben."),
und `details: { pfad, bytes, frei, belegt, grenze }`. Ein Ordner, den der
Mensch nicht hat, ist `404` wie einer, den es nicht gibt.

`pfad` ist die **echte Stelle im Baum**, auch wenn der Mensch den Ordner
darüber gar nicht sieht: ein Ordner der Ebene 2 heißt immer
`<eltern>/<kennung>`. Das CLI legt die Kette darüber lokal an; der Dienst kennt
sie für diesen Menschen nicht, und schreiben darf er dort nicht (am 21.09.2026
am Gerät gemessen).

**Ein Ordner ohne Recht kommt in dieser Antwort nicht vor — auch sein Name
nicht.** Das wird nicht gefiltert, sondern nie gelesen: die Abfrage geht von
der Rechte-Tabelle dieses Menschen aus, es gibt also keine Liste, aus der
etwas herausfallen könnte. Und ein Ordner der Stufe **am Gerät** kommt nie
vor: er hat keine Rechte-Zeile, und die Abfrage schneidet zusätzlich auf
`art = 'geteilt'` zu.

**Zwei Ebenen, zwei Rechte.** Ebene 1 ist ein Bereich, Ebene 2 ein Projekt
darin; die Rechte heißen `lesen` und `schreiben`. Ein drittes namens „keine"
gibt es nicht — keine Rechte ist keine Zeile.

**Die Wurzel steht zuerst, mit leerem Pfad** (Auftrag
firmenordner-rechte-im-frontend, 22.09.2026). Sie ist die Ebene 0 des
Zielbildes — `firma/`, die Regeln, Skills und Agents der Firma —, und im
Dienst ein eigener Raum mit `art = 'wurzel'`, weil über einem Raum dort nichts
liegt; das CLI der Wurzel legt ihn **oben** in den lokalen Baum. Genau eine je
Gerät (`POST /ordner` mit `art: "wurzel"`, `ebene` darf dann fehlen; die
zweite ist `409`). **Wer sie liest, steht in keiner Rechte-Zeile:** jeder
aktive Mensch liest, jeder Administrator schreibt — `recht` folgt aus
`admin_users.role`, und `POST /rechte` auf die Wurzel ist `400`. Im Dienst
wird das zu einer Einladung je Mensch (Leser oder Schreiber), gesetzt beim
Spiegeln eines Menschen und bei jedem `POST /abgleich`. Sie **fällt zuletzt**:
`DELETE` antwortet `409`, solange ein anderer Ordner besteht. Ein Gerät ohne
Wurzel nennt keine.

**`GET /sicht` ist die `sicht.md`** (Regel 3 des Zielbildes): `text/markdown`,
je Mensch aus seinen Rechten und Freigaben erzeugt — seine Ordner mit Stufe
(die Wurzel als `/`), seine Apps mit dem Verweis auf `apps/<id>/APP.md`, die
Orte aus `.claude/places.json` der Wurzel (gelesen über den Dienst; Form wie im
CLI: `{ places: [{ name, description?, local?, write? }] }`). Höchstens eine
Bildschirmseite: jeder Abschnitt ist gekürzt, und der Rest steht als Zahl.
Sie nennt nichts, was der Mensch nicht hat — dieselben zwei Abfragen wie
`GET /` und `GET /api/apps/meine`. Nimmt einen **Ausweis** wie `GET /`; das
CLI legt sie beim Abgleich unter `.claude/sicht.md` ab. `503` ohne
Firmenordner.

**`GET /ordner/:id/aenderungen` liest das Protokoll des Dienstes**, nicht des
Geräts: auf der Platte gehört jede Datei dem Konto des Geräts, wer sie
hochgeladen hat, weiß allein der Dateidienst (`activitylog`, am 22.09.2026 am
Orin gemessen). Antwort `{ ordner, aenderungen: [{ wann, wer, text, datei }] }`,
neueste zuerst, höchstens zwanzig; leer, wenn der Dienst steht oder den Ordner
noch nicht kennt. `text` ist ein vollständiger deutscher Satz („Mia hat
angebot.md in projekte abgelegt“); ein bestehendes Konto heißt bei seinem Anmeldenamen (das Gerät ordnet die Kennung
im Dienst selbst zu; der Dienst sagt beim Lesen manchmal fälschlich `DeletedUser`),
ein Konto, das es nicht mehr gibt, „ein gelöschtes Konto“, eines mit unbekannter
Kennung „ein Konto vor der Neuinstallation“, ein Satz des Dienstes, den das Gerät nicht kennt, „… hat etwas
geändert“. Der Dienst liefert nur Satzvorlage und Werte, keine Art als Feld.

**Rechte werden nur vergeben, nie unterhalb wieder entzogen.** `POST
/rechte` antwortet deshalb `409`, wenn die Bitte einem Menschen auf einem
Ordner der Ebene 2 **weniger** gäbe, als er auf dem Ordner darüber schon hat.
Der Grund steht im Satz der Antwort samt dem Ausweg (das Recht auf dem
Elternordner zurücknehmen und die Ordner darunter einzeln vergeben). Es ist
keine Vorsicht, sondern eine Tatsache über den Dienst: er kennt kein Entziehen
nach unten, und eine Schnittstelle, die es annähme und nicht ausführte, wäre
schlimmer als eine, die es ablehnt.

`DELETE /rechte/…` ist **kein** Widerspruch dazu: es nimmt genau das Recht
zurück, das hier vergeben wurde.

**Einen Ordner wegwerfen** braucht seine Kennung als Abfrage
(`?kennung=projekte`) — derselbe Riegel wie beim Entfernen einer App (C5): wer
sie tippt, hat dabei gelesen, was er wegwirft. Es geht **samt allem, was darin
liegt**, und deshalb nicht, solange darin noch ein Ordner der Ebene 2 liegt
(`409`) oder darauf noch ein anderes Konto ein Recht hat (`409`, die Meldung nennt die Konten). Beides ist kein Schutz
vor Versehen, sondern vor einem Ordner, der unter den Füßen von jemandem
verschwindet, der gerade darin arbeitet — sein Klient löscht ihn am nächsten
Morgen auf seinem Rechner hinterher.

**Das eigene Recht fällt immer mit** (J33, 28.09.2026): wer den Ordner
wegwirft, hat darauf meist selbst `schreiben` (der Anlegende bekommt es
automatisch); dieses Recht zählt nicht als Hindernis und wird mit dem Ordner
zurückgenommen. Das Recht eines anderen Kontos bleibt ein `409`. Trägt die
Abfrage `rechte=entziehen`, nimmt das Gerät zuerst jedes Recht auf dem Ordner
zurück (J34); die Antwort nennt unter `rechte_entzogen`, wessen. Die
Oberfläche schickt den Wert nicht. Scheitert danach das
Wegwerfen im Dienst, sind die Rechte trotzdem zurückgenommen, und der Satz des
`409` sagt das.

**Wer anlegt, schreibt darin** (J34, 28.09.2026): `POST /ordner` gibt dem
anlegenden Administrator auf einem geteilten Ordner `schreiben` als
gewöhnliche Zeile (in `GET /rechte` und in der Matrix sichtbar,
zurücknehmbar). Nicht auf einem Ordner am Gerät und nicht auf einem Projekt,
dessen Bereich er schon schreibt. `sicht.md` trägt ihr Datum seit demselben
Auftrag in der Ortszeit des Geräts (`TZ`) statt in UTC.

**Dieser Weg darf als einziger lange dauern.** Er löscht jede Datei im Ordner,
und seine Dauer hängt an ihrer Zahl: gemessen **11,4 s für 6.000 Dateien**
(rund 1,9 ms je Datei). Das Gerät wartet bis zu 15 Minuten auf den Dienst
(`FIRMENORDNER_ZEITGRENZE_LOESCHEN_MS`) und hebt für diese eine Route auch die
60-Sekunden-Frist seiner eigenen Antwort an. Ein Aufrufer setzt seine
Zeitgrenze entsprechend — `curl --max-time 30` ist hier zu wenig.

**Und am Ende wird nachgesehen, nicht geglaubt:** meldet der Dienst einen
Fehler, fragt das Gerät die Liste seiner Räume; steht der Raum nicht mehr
darin, ist er weg, und die Antwort ist `200`. Der Grund steht in
[docs/features/FIRMENORDNER.md](../features/FIRMENORDNER.md#wegwerfen-was-dabei-wirklich-passiert)
— ein abgeschnittenes Wegwerfen hinterließ am 22.09.2026 einen Raum ohne
Dateien, eine Zeile, die ihn weiter führte, und ein `500 grpc error` auf jeden
zweiten Versuch.

**Der Papierkorb** (Auftrag papierkorb-und-adresse-des-firmenordners,
27.09.2026, J34). Was ein Mensch in einem Ordner löscht, liegt im Papierkorb
seines **Raums** — also des Hauptordners oder Bereichs; ein Projekt der
Ebene 2 hat keinen eigenen (`400` mit Satz), sein Gelöschtes liegt beim
Bereich mit `ort` = `<projekt>/…`. Im Dateidienst ist ein Administrator nur
Bearbeiter und darf den Papierkorb nicht leeren (Generalprobe 27.09.2026:
38-mal `403`); diese Wege lassen es das Konto des Geräts für ihn tun und
schreiben jeden verändernden Handgriff ins Audit-Protokoll
(`firmenordner_papierkorb_geleert`, `…_wiederhergestellt`,
`…_eintrag_entfernt`, mit Ordner und Eintrag).

- `GET /papierkorb` → `{ data: [{ ordner_id, kennung, anzahl, groesse }] }`
  je Hauptordner und Bereich, den der Dienst kennt. Antwortet ein Papierkorb
  nicht, steht dort `anzahl: null`, statt die Liste zu kippen.
- `GET /ordner/:id/papierkorb` → `{ data: { ordner, eintraege: [{ id, ort,
name, geloescht_am, ordner, groesse }] } }`, neueste zuerst. `groesse` in
  Bytes, bei einem Ordner `null` (der Dienst nennt dort 4096, die Größe des
  Eintrags und nicht seines Inhalts).
- `DELETE /ordner/:id/papierkorb` → `{ data: { ordner, vorher, nachher: 0 } }`.
  Ein `DELETE` auf den Papierkorb selbst; danach fragt das Gerät nach. Liegt
  dann noch etwas darin, ist die Antwort `503` mit der Zahl, kein Erfolg. Darf
  lange dauern wie das Wegwerfen (dieselbe Frist).
- `POST /ordner/:id/papierkorb/:eintrag/wiederherstellen` legt den Eintrag an
  seine alte Stelle (`MOVE`, `Overwrite: F`). Liegt dort inzwischen etwas,
  oder ist der Ordner darüber selbst gelöscht, ist es `409` mit dem Ausweg;
  überschrieben wird nie. `404`, wenn es den Eintrag nicht mehr gibt.
- `DELETE /ordner/:id/papierkorb/:eintrag` nimmt einen einzelnen Eintrag
  endgültig weg; `404` wie oben.

`503`, wenn auf dem Gerät kein Firmenordner läuft oder er gerade nicht
antwortet (der rohe Fehler steht im Log).

**Die Größengrenze** (Auftrag bereich-quote-sichtbar, 28.09.2026, J33). Je
Hauptordner und Bereich eine; ein Projekt teilt die seines Bereichs.

- `GET /platz` → `{ data: { platte: { frei }, vorgabe, erreichbar, ordner:
[{ ordner_id, kennung, belegt, grenze, frei, begrenzt_durch, stufe }] } }` je
  Hauptordner und Bereich, den der Dienst kennt; `vorgabe` ist die Grenze,
  die ein neuer Bereich bekommt (100 GB). Antwortet der Dienst nicht, ist
  `ordner` leer und `erreichbar: false`.
- `PUT /ordner/:id/grenze` mit `{ "grenze": <bytes> }` (mindestens 1 MB) oder
  `{ "grenze": null }` (ohne Grenze) → `{ data: { ordner_id, kennung, vorher,
belegt, grenze, frei, begrenzt_durch, stufe } }`, die Zahlen so, wie der
  Dienst sie danach meldet. `400` für ein Projekt, `409` für eine Grenze unter
  dem, was schon darin liegt, und für einen Bereich, den der Dienst noch nicht
  kennt. Audit: `firmenordner_grenze_gesetzt` mit vorher und nachher.

**`POST /abgleich` legt an, es räumt nicht weg.** Was der Dienst noch nicht
weiß, steht in der Datenbank (`abgleich_offen` an der Nutzer- und an der
Rechte-Zeile) — es geht also nichts verloren, wenn der Dienst gerade neu
startet. Dieser Weg holt es nach: fehlende Nutzer, fehlende Räume, fehlende
Einladungen. Die Antwort ist der Bericht darüber, was passiert ist.

**Ein Passwort kann er nicht nachholen.** Das Gerät hat es nur als Hash. Ein
Mensch, den es vor dem Firmenordner schon gab, bekommt dort ein Konto mit einem
zufälligen Passwort, das niemand kennt, und `passwort_gespiegelt = false`; er
kommt hinein, sobald jemand sein Passwort einmal setzt oder er es selbst
wechselt.

### Darstellung (Phase H1)

Die Darstellung der Oberfläche, **je Mensch**. Drei Werte: `light` (Vorgabe),
`dark` und `system` (das Betriebssystem entscheidet, Migration 194). »Schwarz« ist mit H1 gefallen.

| Method | Endpoint                | Description                                  |
| ------ | ----------------------- | -------------------------------------------- |
| PUT    | `/api/darstellung`      | Meine Darstellung setzen, Body `{ theme }`   |
| GET    | `/api/darstellung/logo` | Das Logo des Hauses als Bild, ohne Anmeldung |

Antwort `{ data: { theme } }`. `theme` ist `light`, `dark` oder `system`; alles andere
ist `400` (`schemas/darstellung.js`), nicht `500` aus dem CHECK der Spalte.

**GET /api/darstellung/logo** (M5, 04.10.2026): das Logo des Hauses mit dem
Medientyp, mit dem es hinterlegt wurde (`image/png`, `image/jpeg`,
`image/webp`), und `X-Content-Type-Options: nosniff`. Ohne Anmeldung, wie der
Firmenname in `needs-setup`: ein Logo ist kein Geheimnis. Mit `?stand=<Stand>`
(aus `needs-setup`) antwortet es mit `Cache-Control: public, max-age=31536000,
immutable`, ohne mit `no-cache`. Kein Logo hinterlegt: `404`. Gesetzt wird es
über `PUT /api/settings/logo`.

**Nur ein Weg, und zwar der schreibende.** Gelesen wird die Darstellung dort,
wo die Oberfläche ohnehin schon fragt, wer angemeldet ist: `theme` fährt in
`GET /api/auth/session`, `GET /api/auth/me` und in der Antwort auf
`POST /api/auth/login` mit. Ein eigener `GET` daneben wäre eine **dritte**
Anfrage auf jedem Seitenaufbau — und die zwei, die es gibt, sind seit G2 die
enge Stelle des Geräts. Er käme außerdem zu spät: die Shell braucht das Theme,
bevor sie das erste Mal malt.

**Keine Kennung in der Adresse**, dieselbe Linie wie `/api/profil`. Ein
Administrator stellt hier auch nichts für einen anderen ein: wie jemand seinen
Bildschirm sieht, ist keine Verwaltungsfrage.

### Flow-Dateien und Läufe

**Runs (Plan 011, Schritt 9).** A run persists in the database (`flow_runs` +
`flow_run_steps`) so it survives closing the browser tab; it is read through
`GET /api/laeufe/:id` (see [Die Läufe aller Apps](#die-läufe-aller-apps-m5-verwaltung--läufe)).
Each step stores a condensed `output` (what reaches the
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
with phases B2 and B3 on 2026-08-26; the data stays in the stored steps.

**File changes overview (Plan 011, Schritt 16).** A flow writes and deletes
files without confirmation, so every run that _can_ change files (declares
a writing `dateien_*` tool or a document-producing `ausgabe`) is
snapshotted before and after; the diff is
stored on `flow_runs.changes` and returned inside the run object
(`[{ pfad, art: neu|geaendert|geloescht, vorher, nachher, gekuerzt, hinweis }]`).
Bounded in count and per-file preview length; `null` (column) means not tracked
(a read-only run). Never fails a run — a failed snapshot just omits the overview.

The `name` field is restricted to lowercase letters, digits and hyphens (1–50 chars), and must start and end with a letter or digit; the name becomes the filename.

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

**Style templates.** Templates are read from `FLOWS_DIR/vorlagen/` (same volume as the flows, included in backups). For `.pdf`/`.docx` the run reads the text from a `<name>.extrahiert.txt` sidecar next to the file, so runs never depend on the indexer. There is no upload route any more: `/api/flows/vorlagen` fell on 2026-10-06; a template that already lies in the folder is still used. At run time the template text (capped at 8 000 chars) is injected into the prompt as a clearly delimited style/structure block; a missing template is silently skipped (the run must not fail because a template was deleted).

Valid `werkzeuge`: `dateien_lesen`, `dateien_schreiben`, `dateien_bearbeiten`, `dateien_anhaengen`, `dateien_suchen`, `symbol_suche`, `subagent`. Declaring `rollen` requires `subagent` and vice versa; `dateien_*` and `symbol_suche` require at least one entry in `ordner`.08.2026) together with the knowledge base, the sandbox container and the invoice flow; a flow declaring them is rejected. `dateien_suchen` finds files by glob (`muster`) and/or content (`text`, a case-insensitive substring — not a regex — reported with line numbers). `dateien_bearbeiten` (Harness v2, 2026-07-30) replaces one exact text block via search/replace (whitespace-tolerant fallback, `alle: true` for all occurrences); `dateien_anhaengen` appends a section to the end of a file (creates it if missing, file cap 16 MB) — the building block for generating long documents section by section instead of one giant write.

The optional `schritte` array (B7) makes orchestration deterministic: each step is either `typ: subagent` (delegates to a declared `rolle` with an `auftrag` template) or `typ: werkzeug` (calls one tool directly with `parameter`). Steps run in fixed order; a step's output is threaded into later steps as `{{stepname}}` (and `{{vorher}}` across `iterationen`), then the body prompt synthesizes the final answer. A `subagent` step requires the `subagent` tool and a matching role; a `werkzeug` step may only use a tool the flow itself declares. Empty `schritte` → the flow stays model-driven.

**Map over a list (`wiederhole_ueber`, Harness v2 2026-07-30).** A step may declare `wiederhole_ueber: <name>` referencing a flow argument or an EARLIER step. Its value is parsed as a list (JSON array — also when embedded in prose/code fences — else one entry per line, bullets/numbering stripped) and the step runs once per element (max 50) with `{{element}}`, `{{index}}`, `{{anzahl}}` and `{{vorher}}` in scope; the step's output is the concatenation of all element outputs. Mutually exclusive with `iterationen > 1`; the reference is schema-validated. A step-level `modell` overrides the flow model for that step's delegation (a role's own `modell` still wins). Typical long-document pipeline: step 1 (`gliederung`) produces the outline as a JSON array, step 2 loops over it (`wiederhole_ueber: gliederung`) and appends each section via `dateien_anhaengen`.

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

| Method | Endpoint                            | Auth              | Description                                                            |
| ------ | ----------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| GET    | `/api/v1/external/flows`            | API Key           | List available flows                                                   |
| POST   | `/api/v1/external/flows/:name/run`  | API Key           | Run a flow; waits for the result by default                            |
| GET    | `/api/v1/external/flows/runs/:id`   | API Key           | Poll a run's status/result (`schritte`, `freigabe`, …)                 |
| POST   | `/api/v1/external/ereignisse/:name` | API Key einer App | Ein Ereignis melden: startet die Flows, die darauf hören (Kontrakt 13) |
| GET    | `/api/v1/external/freigaben`        | API Key           | Die Freigaben dieser App nachlesen (`?lauf=<id>`); nur lesen           |

**POST /api/v1/external/flows/:name/run** — body `{ "args"?: {…}, "wait_for_result"?: true, "timeout_seconds"?: 300, "einreicher"?: "anna", "freigabe"?: {…}, "titel"?: "Beleg 7, Deutsche Post" }`.

`titel` (M5, Kontrakt 14, freiwillig, 1 bis 120 Zeichen) ist ein kurzer Titel
des Laufs. Er steht vorn an jeder Freigabe des Laufs (`Beleg 7, Deutsche Post –
Erkennung unsicher: Feld konto`), damit zwei Karten in „Für Sie" und in der App
zu unterscheiden sind, und `GET /flows/runs/:id` nennt ihn. Ohne `titel` bildet
ein erkennender Schritt einen aus den ersten drei erkannten Werten.

`einreicher` und `freigabe` (J35) gelten nur für den Schlüssel einer App und
regeln, wer die Freigaben dieses Laufs entscheidet:

```json
{
  "einreicher": "anna",
  "freigabe": { "ohne_einreicher": true, "entscheider": { "rolle": "admin" } }
}
```

`einreicher` ist der Benutzername aus `X-Arasul-User`; er muss ein aktives
Konto sein, dem die App freigegeben ist. `ohne_einreicher` schließt ihn vom
Entscheiden aus und braucht `einreicher`. `entscheider` nennt **entweder**
`{"rolle":"admin"}` **oder** `{"konten":["bernd","clara"]}` — jedes Konto muss
die App freigegeben haben. Bleibt nach der Regel niemand, der entscheiden
könnte, antwortet der Start mit `400` und legt keinen Lauf an. Die Regel steht
am Lauf (`flow_runs.einreicher_id`, `freigabe_regel`) und an jeder Freigabe
darin (Migration 185).
With `wait_for_result: true` (default) it blocks until the run reaches a terminal
state and returns `{ success, run_id, status, result, error, steps_used, schritte, freigabe, annahmen }`; with
`false` it returns `202 { success, run_id, status: "laeuft" }` immediately. Runs
are owned by the API key's creator; an orphaned key (creator deleted) gets
`403 FORBIDDEN`.

> **Ein Flow mit Freigabe-Schritt gehört mit `wait_for_result: false` gestartet**
> (Phase C7). Er hält an, bis ein Mensch entscheidet — das kann Stunden dauern,
> und der wartende Aufruf läuft vorher in sein Zeitlimit (höchstens 30 Minuten).
> Die Lauf-Nummer kommt sofort; den Rest fragt man über
> `GET /flows/runs/:id` und `GET /freigaben?lauf=<id>` nach. This is the per-flow HTTP trigger; there is no scheduler on
> the device, recurring starts come from outside through this endpoint.

**POST /api/v1/external/ereignisse/:name** (M5, Kontrakt 13) — body
`{ "daten"?: {…}, "einreicher"?: "anna", "titel"?: "…" }` (`titel` seit Kontrakt 14, für
jeden gestarteten Lauf wie oben). Nur mit dem Schlüssel einer App
(sonst `403`), Bereich `flow:run`. Das Gerät startet jeden Flow dieser App in
diesem Stand, dessen Kopf `ausloeser: [{typ: ereignis, ereignis: <name>}]`
nennt; `daten` werden seine Argumente gleichen Namens (Werte Zeichenkette, Zahl
oder Wahrheitswert, höchstens 50; Undeklariertes fällt weg). `einreicher` wie
oben (unbekannt: `400`). Gewartet wird nicht:

```json
{
  "success": true,
  "ereignis": "beleg.eingegangen",
  "app": "belege",
  "stand": "live",
  "laeufe": [{ "flow": "bei-eingang", "run_id": 812 }],
  "nicht_gestartet": [{ "flow": "pruefen", "grund": "Pflicht-Argument \"nummer\" fehlt" }]
}
```

`202`, wenn wenigstens ein Lauf startete, sonst `200`. Ein Name, den kein
Flow-Kopf tragen kann (Großbuchstaben, Leerzeichen), ist `400`. Der Lauf trägt
`ausloeser: "ereignis"` und den Namen in `ereignis`; `GET
/api/v1/external/flows/runs/:id` nennt beides (`ausloeser` auch bei `hand` und
`zeitplan`), seit Kontrakt 14 dazu `titel` (oder `null`). Regeln:
[FLOWS.md](../features/FLOWS.md#ereignisse-flows-auf-zuruf-der-app-m5-04102026-kontrakt-13).
Das Werkzeug `route_aufrufen`, mit dem ein Flow Routen von Apps ruft, hat keinen
eigenen Endpunkt; es steht in
[FLOWS.md](../features/FLOWS.md#routen-von-apps-als-werkzeug-m5-04102026-kontrakt-13).

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

**Seit H7 liefert er die Schritte** (`schritte`), und damit hält er, was der
Kontrakt seit C5 zusagt: »Der Lauf eines Flows, mit seinen Schritten«. Bis
dahin kamen `status`, `result`, `error`, `steps_used` und `annahmen` — kein
einziger Schritt, und `steps_used` ist eine **Zahl**, keine Kette. Eine App
konnte sagen, _dass_ es einen Lauf gab, und nicht, was darin geschah. Je
Schritt: `position`, `art`, `name`, `status`, `modell`, `eingabe`, `ausgabe`,
`begonnen_am`, `beendet_am`. Die inneren Kennungen der Datenbank bleiben
draußen — was eine App braucht, ist die Reihenfolge, und die steht in
`position`.

**Seit dem 26.09.2026 (J35) sagt er, wer entscheidet und wo** (`freigabe`,
`null` für einen Lauf ohne App):

```json
{
  "einreicher": "anna",
  "ohne_einreicher": true,
  "entscheider": { "rolle": "admin" },
  "kreis": ["admin", "bernd"],
  "wo": "In der App, in der die Freigabe entstanden ist",
  "adresse": "/workspace",
  "offen": { "id": 12, "titel": "Rechnung 4711 freigeben", "frist": "…", "angefragt_am": "…" },
  "satz": "Entscheidet: ein Administrator (admin oder bernd), in der App, in der die Freigabe entstanden ist. anna hat eingereicht und entscheidet nicht mit (Vier-Augen-Prinzip)."
}
```

`kreis` sind die Konten, die **jetzt** entscheiden können — die Regel des
Laufs, gezogen über die aktiven Menschen, denen die App freigegeben ist. Vor
der ersten Anfrage kommt sie aus der Regel am Lauf, während einer offenen
Anfrage aus deren Zeile; `offen` ist dann die Anfrage, sonst `null`. `satz`
ist zum Anzeigen gedacht: eine App muss die Regel nicht selbst in Worte fassen.

`GET /api/v1/external/freigaben` (Phase C7) beantwortet die eine Frage, die
eine App zu einem wartenden Lauf hat: **worauf** wartet er? Der Namensraum
kommt wieder aus dem Schlüssel — ein Schlüssel eines Menschen (`app_id IS
NULL`) bekommt `403` mit dem Hinweis auf `/api/freigabe-anfragen`. Antwort:
`{ success, app, stand, freigaben: [{ id, run_id, flow_name, titel,
zusammenhang, status, frist, angefragt_am, entschieden_am, entschieden_von,
begruendung, einreicher, ohne_einreicher, entscheider, kreis, felder,
felder_schritt, korrekturen, original }] }` — `felder`, `korrekturen` und
`original` seit M5 (Kontrakt 10): was die KI vorschlug, was der Mensch beim
Bestätigen änderte (je Feld `feld`, `vorschlag`, `wert`, `von`, `am`), und das
Original als Adresse gleicher Herkunft; `entscheider`
ist `{ rolle }`, `{ konten: [...] }` oder `null` (J35), `kreis` die Konten,
die eine **offene** Anfrage jetzt entscheiden können (sonst `null`). `zusammenhang` steht seit H7 dabei: er ist der Text, **an
dem** der Mensch entschieden hat, und er stammt aus dem eigenen Flow der App —
sie hat ihn selbst geschrieben. Ohne ihn konnte eine App nicht dokumentieren,
worauf eine Zusage beruht.
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
  "timeout_seconds": 300, // Optional (default: 300)
  "images": ["iVBORw0KGgo…"] // Optional (J35): PNG/JPEG als Base64
}
```

**Bilder (J35, 26.09.2026).** `images` gibt bis zu vier Bilder an ein
**Bildmodell** — Base64, PNG oder JPEG, je Bild höchstens 9 000 000 Zeichen
(der Körper insgesamt höchstens 10 MB); ein Vorsatz `data:image/png;base64,`
darf davorstehen. Ohne `model` nimmt das Gerät seine **Bildvorgabe**
(`bildvorgabe` im Katalog, Migration 188: `gemma4:e4b`), liegt die nicht am
Gerät, das Modell der Aufgabe `vision` (`llava-phi3`); ohne eines antwortet es
mit `503`. Ein `model`, das keine Bilder liest, weist es mit `400` ab und nennt die
Bildmodelle, die es hat — das Bild wird nie still weggelassen und nie gegen
eine Beschreibung eines anderen Modells getauscht (`services/llm/bildmodell.js`).
Welches Modell Bilder liest, sagt `GET /api/v1/external/models` je Eintrag in
`supports_vision_input`. Dasselbe steht im Kontrakt unter `bilder`.

Die Bildvorgabe ist **gemessen** (26.09.2026, J35): fünf erfundene Belegfotos
aus `tests/belege/` — Tankquittung, Rechnung, Kassenbon, Bewirtung und ein
schräges Handyfoto im Schatten —, je sechs Felder (Händler, Datum, Brutto,
Netto, Steuersatz, Steuerbetrag), über `llm/chat` am Orin, drei Läufe je Beleg
und Modell, Zeit ohne das erste Laden des Modells
(`scripts/test/bildmodelle-messen.sh`):

| Weg                                    | Felder richtig | Zeit je Beleg |
| -------------------------------------- | -------------- | ------------- |
| Bild an `gemma4:e4b`                   | 90 von 90      | rund 5 s      |
| Bild an `llava-phi3`                   | 1 von 90 ¹     | rund 28 s     |
| Texterkennung + `qwen3.8:27b-q4_K_M` ² | 16 von 30      | rund 14 s     |

¹ Fünf der fünfzehn Aufrufe endeten nach 60 s ohne Antwort, das Modell redete
sich fest; sie zählen mit null Feldern. ² `document/extract-structured`,
ein Lauf je Beleg: die Texterkennung verliert auf Kassenbon, Bewirtung und dem
schrägen Foto die Beträge. Wer sich auf die Vorgabe nicht verlassen will, nennt
`model` und misst mit demselben Skript am Gerät des Kunden.

**Eine Frage geht wörtlich an das Modell.** Bis zum 26.09.2026 schrieb die
Warteschlange `user: ` vor eine einzelne Frage; `llava-phi3` zählte daraufhin
bei einer Farbfrage Möglichkeiten auf („1. Red and Blue 2. Red and Orange …"),
direkt am Modelldienst antwortete es sauber. Ein Verlauf mit mehreren Zügen
behält seine Rollen (`promptAusNachrichten` in `services/llm/llmJobProcessor.js`).

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

| Method | Endpoint                                              | Auth    | Permission         | Description                          |
| ------ | ----------------------------------------------------- | ------- | ------------------ | ------------------------------------ |
| POST   | `/api/v1/external/document/extract`                   | API Key | `document:extract` | Pure text extraction (OCR if needed) |
| POST   | `/api/v1/external/document/analyze`                   | API Key | `document:analyze` | Extract text + LLM analysis          |
| POST   | `/api/v1/external/document/extract-structured`        | API Key | `document:extract` | Extract + structured JSON output     |
| GET    | `/api/v1/external/document/extract-structured/:jobId` | API Key | `document:extract` | Ein Auslesen abholen (J35)           |

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
| `einreicher`      | string | No       | Für wen die App fragt (J35)           |

Seit J35 (26.09.2026) steht jeder Aufruf dieses Weges — und jeder andere
Modellaufruf über die Schnittstelle — im Protokoll des Geräts
(`GET /api/apps/:id/ki-aufrufe`). Den Menschen nennt die App mit der
Kopfzeile `X-Arasul-User` (aus der Forward-Auth unverändert weitergereicht)
oder dem Feld `einreicher`; an `/v1` mit dem Feld `user`. Er muss ein aktives
Konto sein, dem die App freigegeben ist, sonst `400` und kein Aufruf.
`POST /llm/chat` nimmt `einreicher` im JSON-Körper.

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
  "char_count": 4521,
  "metadata": { "ocr_used": false },
  "model": "qwen3.8:27b-q4_K_M",
  "job_id": "0b7c2c1e-…",
  "processing_time_ms": 8901,
  "timestamp": "2026-09-26T09:30:17.400Z"
}
```

**Die Antwort steht seit J35 (26.09.2026) als JSON-Schema im Kontrakt**
(`GET /api/v1/external/contract` → `auslesen.antwort`, dazu `auslesen.anfrage`
und `auslesen.fehlschlag`), aus denselben Zod-Schemas
(`ExtractStructuredFelder`, `ExtractStructuredAntwort`,
`ExtractStructuredFehlschlag` in `schemas/externalApi.js`), gegen die der Test
die echte Antwort der Route prüft. `data` ist ein **Objekt oder `null`** und
wird **nicht** gegen `schema` geprüft — die App prüft die Felder selbst; `null`
heißt, das Modell hat kein JSON-Objekt geliefert, seine Antwort steht dann in
`raw_response`. Scheitert das Modell, kommt `500` mit
`{ success: false, error, job_id, processing_time_ms, timestamp }`. Das Modell
sieht den **Text** der Datei, bei Fotos aus der Texterkennung, nicht das Bild;
wer das Bild selbst an ein Modell geben will, nimmt `llm/chat` mit `images`.

#### Warten und Abholen (J35, 26.09.2026)

`llm/chat`, `document/analyze` und `document/extract-structured` warten
`timeout_seconds` auf das Modell (Vorgabe 300, höchstens 600). Bis zum
26.09.2026 schnitt das Sicherheitsnetz des Backends (TIMEOUT-001) jede Anfrage
unter `/api/v1/external/` nach **60 s** mit `408` ab, ganz gleich, was die
Route versprach; die App-Bau-Probe bekam so bei sechs gleichzeitigen
Auslesungen ein `408`, und das Gerät hatte das Ergebnis zehn Sekunden später
fertig. Das Netz gibt den äußeren Wegen jetzt ihr längstes Versprechen plus
eine Minute (`utils/anfrageFrist.js`: 31 min, weil `flows/:name/run` bis
1800 s wartet), und **die Route antwortet selbst**:

Rechnet der Auftrag nach `timeout_seconds` noch, kommt **`202`** statt `500`
„Job timed out", und der Auftrag läuft weiter:

```json
{
  "success": false,
  "status": "laeuft",
  "job_id": "0b7c2c1e-…",
  "abholen": "document/extract-structured/0b7c2c1e-…",
  "model": "qwen3.8:27b-q4_K_M",
  "processing_time_ms": 300004,
  "timestamp": "…",
  "extracted_text": "…",
  "filename": "beleg.jpg",
  "char_count": 812,
  "metadata": { "ocr_used": true }
}
```

`abholen` ist relativ zur Basis `ARASUL_API_URL`. Bei `llm/chat` und
`document/analyze` ist es `llm/job/<job_id>` (das 202 von `llm/chat` ohne die
Felder der Texterkennung). **`llm/job` antwortet immer mit `200`** und nennt
den Stand in `status` (`pending` … `completed`, `error`, `cancelled`); die
Antwort des Modells steht dann in `content`, nicht in `response`. Mit dem
Schlüssel einer App sieht `llm/job` seit J35 nur die Aufträge dieser App in
diesem Stand (gelesen aus `ki_aufrufe`), sonst `404` — `user_id` allein ist
bei zwei Apps desselben Administrators derselbe Mensch. Und `llm/job`
antwortet überhaupt erst seit dem 26.09.2026: `llm_jobs.user_id` (bigint)
kommt aus pg als Zeichenkette, `api_keys.created_by` (integer) als Zahl, und
der Vergleich mit `!==` gab seit Migration 165 jedem ein `404` — am Orin
gefunden, als das Abholen nach einem `202` den Weg zum ersten Mal ging. Bei
`document/extract-structured` ist `abholen` der neue Weg:

**GET /api/v1/external/document/extract-structured/:jobId** — `202` in derselben
Form (ohne die Felder der Texterkennung), solange es rechnet; `200` mit
`{ success: true, status: "fertig", data, raw_response, model, job_id,
processing_time_ms, timestamp }`, wenn es fertig ist (`data` wie oben: Objekt
oder `null`); `500` als Fehlschlag; `404` nach einer Stunde
(`cleanupOldJobs`) oder für einen Auftrag, der nicht dieser App in diesem
Stand gehört — gelesen aus `ki_aufrufe`, nicht aus dem Schlüssel, der je
Einspielen neu gewürfelt wird. `400` für eine Kennung, die keine UUID ist.
Im Kontrakt: `warten`, `auslesen.laeuft`, `auslesen.abholen`,
`auslesen.abgeholt`. Die Kontraktversion bleibt bei 6.

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
    "kontrakt": 12,
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
    "last": { "gleichzeitig_rechnend": 1, "warteschlange_max": 20, "regeln": ["…"] },
    "endpunkte": [{ "verb": "POST", "pfad": "/api/v1/external/apps", "bereich": "app:deploy" }]
  }
}
```

`last` (J40, 02.10.2026, additiv, die Kontraktversion bleibt) nennt, was das
Gerät an Last trägt: eine lokale KI-Anfrage rechnet zur Zeit, 20 warten, danach
503; dazu die am Orin gemessene Antwortdauer und die Wartezeiten für zwölf
Personen (`antwort_sekunden`, `zwoelf_personen`). Die Tabelle und der Weg der
Messung stehen in [`docs/features/LAST.md`](../features/LAST.md).

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

**Fassung 4 (Phase H6):** das Manifest kennt `marken`, die Fassung des
Designsystems, auf der die App steht. Sie ist **freiwillig** — jedes Manifest
von Fassung 3 bleibt gültig —, und die Zahl geht trotzdem mit: das Manifest ist
`.strict()`, ein Kit, das gegen Fassung 3 prüft, wiese `marken` als unbekanntes
Feld ab, obwohl das Gerät es nimmt und liest.

**Fassung 5 (Phase H7):** drei Änderungen, alle an dem, was das Gerät einer App
_mitgibt_.

- **`umgebung` nennt die Namen in ihrer Rolle.** Bis Fassung 4 stand der Name im
  Schlüssel einer Abbildung und die Erklärung im Wert
  (`{"ARASUL_API_URL": "Die externe Schnittstelle …"}`). Das Ara-Kit liest
  `umgebung.basis` und `umgebung.schluessel` und fand dort nichts; sein
  `--check` meldete am Orin »umgebung.basis fehlt im Kontrakt oder ist kein
  Name«, und die Vorlage ließ zwei Felder `null` und startete keinen Flow.
  Kontrakt und Wirklichkeit stimmten überein — es war allein die Form. Jetzt:
  `umgebung.basis`, `umgebung.schluessel`, `umgebung.datenbank`, die
  Erklärungen daneben unter `umgebung.was`.
- **Jeder Endpunkt trägt seinen Weg auch relativ zur Basis** (`relativ`).
  `ARASUL_API_URL` endet auf `/api/v1/external`, und `endpunkte[].pfad` fängt
  damit an; wer beides aneinanderhängt, ruft
  `/api/v1/external/api/v1/external/flows/…` und bekommt einen 404. Dazu
  `umgebung.praefix` und `umgebung.basis_enthaelt_praefix`. Ein Endpunkt
  außerhalb des Präfixes bekäme `relativ: null` — die OpenAI-kompatible
  Schnittstelle unter `/v1` ließe sich gegen `ARASUL_API_URL` gar nicht
  ausdrücken, und eine ausgerechnete Antwort wäre eine falsche.
- **`umgebung.datenbank`** kommt dazu: die Adresse der Datenbank dieser App und
  dieses Standes (siehe [APPS.md](../features/APPS.md#die-datenbank-einer-app-phase-h7)).

**Fassung 9 (M5, 03.10.2026):** das Gerät liefert seine Bibliothek zur
Laufzeit aus, unter `/marken/<haupt>/`, und `marken` im Manifest nimmt dafür
die Hauptzahl allein (`"marken": "5"`): die App lädt Bausteine, Muster, Tokens
und das fertige Stylesheet vom Gerät und trägt keine Kopie. Drei Zahlen bleiben
die Form einer Kopie. Der Abschnitt `marken` nennt Adresse, Verzeichnis
(`/marken/marken.json`), Eingänge, Import-Weg mit und ohne Bau und die
Versionsregel. Freiwillig; die Zahl geht mit, weil ein Kit auf Fassung 8
`"marken": "5"` als ungültig abwiese. Den Weg für App-Entwickler beschreibt
[APPS.md](../features/APPS.md#die-bibliothek-zur-laufzeit-m5).

**Die Auslieferung selbst** ist kein Endpunkt der API, sondern statisch
(nginx im Frontend-Container, ohne Anmeldung, wie die Dateien der Shell):

| Pfad                                                 | Inhalt                                     | Cache-Control                         |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| `/marken/marken.json`                                | `fassung`, `haupt`, `adresse`, `eingaenge` | `no-cache` (ETag)                     |
| `/marken/<haupt>/marken.json`                        | dazu jede Datei mit sha256                 | `no-cache` (ETag)                     |
| `/marken/<haupt>/marken.js` und die anderen Eingänge | ES-Module, `marken.css`                    | `no-cache` (ETag, 304 bis zum Update) |
| `/marken/<haupt>/teil-*.js`                          | gemeinsame Teile mit Hash im Namen         | `public, max-age=31536000, immutable` |

Eine Datei, die es nicht gibt, ist `404`, keine Seite der Shell.

**POST /api/v1/external/apps** — Multipart mit dem Feld `paket`, einem
`.tar.gz` mit `app.json` im Wurzelverzeichnis, und optional dem Textfeld
`aenderungstext` (M5, Kontrakt 8): ein paar Sätze, was in dieser Version neu
ist, 1 bis 1000 Zeichen; leer oder zu lang ist `400`. Er gehört zum Ausrollen,
nicht zur Version, steht also nicht im Manifest; das Gerät hält ihn im
Sicherheitsprotokoll fest (`app_paket_eingespielt`), die Anzeige in der
Verwaltung folgt. Das Gerät packt aus, prüft,
legt unter `/arasul/apps/<id>/<version>/` ab, **baut das Image aus dem
Dockerfile im Paket**, registriert die Flows aus `flows/*.md` (C6) und spielt
in den Teststand ein. Antworten: `201` mit dem Stand und den registrierten
Flows, `400` bei einem Paket, das nicht durchgeht (Symlink, fehlendes
`app.json`, fehlender Bauplan, fehlgeschlagener Bau, unlesbarer Flow), `409`
wenn diese Version gerade **live** ist (neue Fassung, neue Nummer) oder wenn
das **Lizenzkontingent voll** ist, `413` wenn das Archiv über 200 MB liegt.

Bei vollem Kontingent nennt die Meldung die Zahl, die die Lizenz trägt, und die
Apps, die die Plätze belegen; dieselben Zahlen stehen als `details`
(`grenze`, `belegt`, `apps`, `abgewiesen`). Test- und Livestand zählen
zusammen, eine neue Version einer App, die schon da ist, geht immer durch —
siehe [APPS.md](../features/APPS.md#grenzen).

Die Lizenzgrenze und die Flows werden **vor** dem Bau geprüft: eine kaputte
YAML-Kopfzeile findet sich in Millisekunden, ein Image zu bauen dauert am
Jetson Minuten — und eine App, die gar nicht auf das Gerät darf, soll den Bau
nicht erst abwarten müssen.

Einen Parameter für den Stand gibt es nicht. Live schaltet ein Mensch.

**POST /api/v1/external/apps/:id/schalten** — Body `{ "ziel": "live" }` nimmt
die Version aus dem Teststand, `{ "ziel": "zurueck" }` die aus
`vorige_version`. Beides geht durch denselben Dienst wie das Einspielen: der
Container wird ersetzt und der API-Schlüssel des Standes erneuert. `zurueck`
ist ein **Tausch** — wer ihn zweimal ruft, ist wieder da, wo er angefangen hat.
Antworten: `200`, `409` ohne Teststand beziehungsweise ohne vorige Version.
`live` sichert vorher und fällt bei einer gescheiterten Strukturänderung selbst
zurück — `409 LIVE_ZURUECKGESCHALTET` oder `409 LIVE_NICHT_GESICHERT`, wie unter
`POST /api/apps/:id/schalten` beschrieben.

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

### Die Plattform aktualisieren (J39)

Das Gerät spielt eine neue Fassung seiner selbst ein — mit Sicherung vorher,
lesbarem Fortschritt und einem Rückweg. Ein Kunde ohne SSH und ohne Fernzugriff
kommt so auf jede neue Fassung. Der Bereich `system:update` steht in **keinem**
Schlüssel automatisch und nicht in `app:deploy`; der Schlüssel dafür entsteht
für den Anlass und wird danach widerrufen
(`scripts/util/kit-schluessel.sh anlegen <Name> system:update`).

| Method | Endpoint                          | Auth    | Scope           | Description                                                        |
| ------ | --------------------------------- | ------- | --------------- | ------------------------------------------------------------------ |
| GET    | `/api/v1/external/update`         | API Key | `system:update` | Eigene Fassung, laufender oder letzter Lauf mit Protokoll          |
| GET    | `/api/v1/external/update/neueste` | API Key | `system:update` | Die neueste Fassung im Netz (`503`, wenn nicht erreichbar)         |
| POST   | `/api/v1/external/update`         | API Key | `system:update` | Einspielen: `{"fassung":"0.8.15"}`, ohne Angabe die neueste; `202` |
| POST   | `/api/v1/external/update/zurueck` | API Key | `system:update` | Zurück auf die vorige Fassung; `202`                               |

**POST /api/v1/external/update** antwortet `202` mit
`{ data: { lauf, von, nach } }`, sobald die Vorprüfungen stehen: das Gerät kennt
seine Fassung, `nach` ist neuer als `von` (sonst `409`), es läuft nicht schon
ein Lauf (`409`), der Platz reicht (`503`, 8 GB frei), der Weg ist gangbar
(`503`). Danach holt das Gerät das Paket von GitHub, prüft die Prüfsumme, sichert
(derselbe Weg wie `POST /api/backup`; scheitert die Sicherung, wird nichts
verändert) und übergibt an den Gerätedienst. Während des Umschaltens ist das
Gerät einige Minuten nicht erreichbar; das ist keine Störung.

**GET /api/v1/external/update** — `fassung` (`version`, `nummer`),
`einspielenMoeglich` / `einspielenGrund`, `laeuft`, `zurueckMoeglich`, `vorige`
und `lauf`: `status` (`laeuft`, `fertig`, `fehlgeschlagen`, `zurueckgerollt`,
`rueckweg_fehlgeschlagen`, `abgebrochen`), `schritt` (`herunterladen`, `sichern`,
`uebergabe`, `auspacken`, `installieren`, `pruefen`, `aufraeumen`, `rueckweg`,
`fertig`), `meldung`, `von`, `nach`, `sicherung`, `protokoll` (die letzten 40
Zeilen). Der Stand überlebt den Neustart des Backends.

**POST /api/v1/external/update/zurueck** — `404`, wenn keine vorige Fassung
bekannt ist. Der Rückweg holt das **Programm** der vorigen Fassung zurück, nicht
die Daten; die Sicherung vor dem Einspielen liegt bereit, falls auch die Daten
zurück sollen.

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

| Method | Endpoint     | Description              |
| ------ | ------------ | ------------------------ |
| GET    | `/api/docs/` | OpenAPI documentation UI |

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

| Category         | Limit  | Window |
| ---------------- | ------ | ------ |
| Password Changes | 3 req  | 15 min |
| Tailscale        | 5 req  | 1 min  |
| Deploy-Upload    | 20 req | 1 min  |

Die übrigen Drosseln stehen bei ihren Routen (Anmeldung, Proben).
Quelle: `src/middleware/rateLimit.js`.

---

## Related Documentation

- [Development Guide](../development/DEVELOPMENT.md) - API usage examples & patterns
- [API Errors](API_ERRORS.md) - Complete error code reference
- [Dashboard Backend](../../apps/dashboard-backend/README.md) - Backend implementation details
