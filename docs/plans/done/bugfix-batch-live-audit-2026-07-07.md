# Bugfix-Batch: Live-Audit-Befunde (2026-07-07)

> Acht vorbestehende Bugs, gefunden bei einem Live-Browser-/API-Audit des
> ausgelieferten Systems (nach PR #120) und bestätigt durch Reproduktion gegen
> das laufende Gerät. Keine Feature-Änderung — reine Korrektheits-Fixes.

## Kontext

Nach dem Merge von PR #120 (einheitlicher Zugriff) wurde die Anwendung live über
Tailscale (`https://100.121.244.80`) getestet: Login, Chat/LLM (echte Prompts,
korrekte Antworten), Settings, plus ein statischer Code-Audit per Subagent. Der
CORS-Fix und Login funktionieren live. Dabei fielen acht unabhängige Bugs auf,
die alle gegen das laufende System reproduziert wurden.

**Separater Live-Befund (kein Code-Bug, nicht in diesem Batch):**
`/api/tailscale/status` liefert auf dem Gerät `installed: false`, obwohl der
Zugriff _über_ Tailscale läuft → der Fernzugriff-Tab hängt auf „Schritt 1
installieren" und die neue „So erreichst du Arasul"-Karte (an `currentStep===3`
gebunden) erscheint nie. Ursache liegt in der Host-Erkennung via
`runOnHost()` (Docker-`chroot`/PATH oder docker-proxy) — ohne Shell-Zugriff auf
dem Gerät nicht abschließend zu diagnostizieren. Separat zu verfolgen
(On-Device-Check: `docker compose logs dashboard-backend | grep -i tailscale`).

**Weitere Follow-ups (aus dem Review, bewusst außerhalb dieses Batches):**

- `services/telegram/telegramIntegrationService.js:363,377` — dasselbe
  `throw new Error` (Bot nicht gefunden / Rate-Limit) wie in Fix #3, aber in
  einem Telegram-Verarbeitungspfad (nicht HTTP-Route). Sollte perspektivisch auf
  `NotFoundError`/`RateLimitError` umgestellt werden.
- `features/documents/DocumentManager.tsx` — veralteter Poll überschreibt beim
  Filterwechsel kurzzeitig die Liste (Race, kein Crash). Latent.

## Fixes

| #   | Datei                                                                             | Bug                                                                                                                                                                                                                     | Fix                                                                                                                          |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `routes/admin/update.js`                                                          | `UPDATE … ORDER BY timestamp DESC LIMIT 1` — PG verbietet ORDER BY/LIMIT auf UPDATE, Spalte heißt `started_at`. Bei Update-Fehler warf beide Failure-UPDATEs → Row blieb ewig `in_progress`, jeder weitere Apply → 409. | Subquery `WHERE id = (SELECT id … ORDER BY started_at DESC LIMIT 1)`.                                                        |
| 2   | `routes/ai/models.js`                                                             | `getModelInfo()` lief nach `initSSE()` außerhalb try/catch; Rejection → hängende EventSource (Error-Handler ist post-headers ein No-op).                                                                                | `getModelInfo()` vor `initSSE()` gezogen (wie im `/download`-Handler).                                                       |
| 3   | `services/telegram/telegramBotService.js`                                         | `activateBot`/`deactivateBot` warfen `new Error('Bot nicht gefunden')` → rohe 500 statt 404.                                                                                                                            | `NotFoundError` importiert + geworfen.                                                                                       |
| 4   | `routes/telegram/bots.js`                                                         | POST `/:id/activate`, `/deactivate` u. a. ohne `isNaN`-Guard → `parseInt('abc')=NaN` → PG 22P02 → rohe 500.                                                                                                             | `router.param('id', …)` weist nicht-numerische IDs zentral mit `ValidationError` ab (deckt alle `/:id`-Routen ab).           |
| 5   | `routes/documents.js`, `routes/chats.js`, `routes/datentabellen/{quotes,rows}.js` | Doppelter Query-Param (`?order_dir=a&order_dir=b`) → Express liefert Array → `.toUpperCase()/.trim()` wirft TypeError → rohe 500.                                                                                       | `String(...)`-Coercion bzw. `typeof x === 'string'`-Guard vor String-Methoden.                                               |
| 6   | `features/datentabellen/hooks/useTableData.ts`                                    | (a) `if (!value && value !== false)` verwarf numerische `0` in neuer Zeile → Wert verschwand. (b) Undo nach Seitenwechsel: `oldRow` undefined → PATCH mit `_expected_updated_at: undefined` umging die 409-Prüfung.     | (a) Guard auf `null/undefined/''` beschränkt (0/false erlaubt). (b) `if (!oldRow) return;` verhindert blindes Überschreiben. |

## Live-Reproduktion (vor Fix, gegen laufende `main`)

- `GET /api/documents?order_dir=a&order_dir=b` → **500** (Fix: 200/DESC)
- `GET /api/chats/search?q=a&q=b` → **500** (Fix: leeres Ergebnis)
- `POST /api/telegram-bots/abc/activate` → **500** (Fix: 400 ValidationError)
- Einzel-Param-Sanity → 200 (Normalfall unverändert)

## Verifikation

- Backend-Suite: 1579 passed / 2 skipped, `eslint` 0 errors.
- Frontend: `tsc --noEmit` = 0, `eslint` (geänderte Datei) = 0.
- Live-Reproduktion der Bugs auf dem Gerät bestätigt (siehe oben).

## Rollback

Alles additiv/lokal, keine DB-Migration → Revert des Merge-Commits genügt.
