# Einheitlicher Zugriff: LAN-Standard (arasul.local) + Remote via Tailscale-Name

> Ein Gerät, ein Denkmodell: **im LAN über `https://<hostname>.local`**, **unterwegs
> über `https://<gerät>.<tailnet>.ts.net`** — immer derselbe Name statt roher IPs,
> mit echtem, browser-vertrautem Zertifikat remote. Behebt gleichzeitig den akuten
> „CORS policy"-Login-Fehler und macht das Aussperren durch Passwort/Lock reparierbar.

## Hintergrund (warum dieser Plan)

Der Nutzer greift unterwegs über die Tailscale-IP `https://100.121.244.80` zu und
bekommt beim Login einen „CORS policy"-Fehler. **Root-Cause (verifiziert):** Das
Backend erlaubt CORS nur für LAN (`192.168.x` / RFC-1918) und `*.local`. Die
Tailscale-CGNAT-Adresse (`100.64.0.0/10`) fällt durch → der Server liefert keine
lesbare Antwort → der Browser meldet pauschal „CORS", **egal ob das Passwort stimmt**.
Das gemeldete „Passwort geht nicht" ist größtenteils ein Folge-Trugschluss; zusätzlich
kann ein Account-Lock nach mehreren Fehlversuchen greifen, den das vorhandene
Reset-Script **nicht** zurücksetzt.

Architektur-Erkenntnisse aus der Recherche, die den einfachen Weg möglich machen:

- **Traefik routet rein pfadbasiert** (`PathPrefix`), host-agnostisch, `sniStrict:false`
  → LAN und Tailscale funktionieren beide sofort über denselben 443-Eingang, **ohne
  Router-Änderung**. Nur Zertifikat + CORS sind die Stellschrauben.
- **Frontend spricht same-origin** (`API_BASE = '/api'`, relativ). Die „Endpoint-URL"
  ergibt sich automatisch aus dem Namen im Browser → **kein editierbares IP-Feld nötig
  oder sinnvoll** (bestätigt die Interview-Entscheidung „Name statt IP").
- Der **MagicDNS-Name** (`Self.DNSName`, z. B. `arasul.<tailnet>.ts.net`) wird vom
  Backend bereits erfasst und im Frontend als „DNS"-Zeile angezeigt — nur nirgends als
  primärer Zugriffsweg genutzt.

## Goal & Success Criteria

Nach diesem Plan gilt:

1. **Login funktioniert wieder** — remote über Tailscale **und** im LAN, ohne dass der
   Nutzer je eine Adresse in `ALLOWED_ORIGINS` einträgt. Ein falsches Passwort erscheint
   als klare Fehlermeldung, nicht mehr als „CORS".
2. **Nie wieder ausgesperrt** — `./arasul reset-password` setzt Passwort **und** entsperrt
   den Account, offline, ohne Cloud.
3. **Ein Name statt IP** — im LAN `https://<hostname>.local`, unterwegs
   `https://<gerät>.<tailnet>.ts.net` mit **grünem Schloss** (via `tailscale serve`,
   kein Cloudflare, keine manuelle Zertifikatsinstallation).
4. **Selbsterklärend im Frontend** — eine „So erreichst du Arasul"-Karte zeigt beide
   Namen kopierbar/anklickbar; die rohe IP nur noch als kleiner Fallback.
5. **Produktweit einheitlich** — Doku, Setup-Wizard und Skripte sagen alle dasselbe:
   LAN-only ist Auslieferungs-Standard, Remote ist bewusstes Opt-in via Tailscale.

## Scope

**In scope:**

- CORS-Allow-Liste um Tailscale-Bereich (`100.64.0.0/10` + `*.ts.net`) erweitern.
- `./arasul reset-password` (Passwort + Account-Lock) inkl. Doku.
- `tailscale serve` für vertrautes Remote-HTTPS + Backend-Endpoint + Setup-Integration.
- Echter LAN-Name im Backend (`MDNS_NAME` durchreichen, `/system/network` korrigieren).
- „So erreichst du Arasul"-Karte im Fernzugriff-Tab.
- Hostname-Hardcodes (`arasul.local`) an Zertifikat-/Setup-Aufrufstellen entschärfen.
- Doku-Vereinheitlichung + „LAN-only als Standard"-Framing.

**Out of scope (per Interview bestätigt):**

- Multi-Kunden-Flottenverwaltung / zentrale Verwaltung mehrerer Tailnets.
- Eigene Wunsch-Domain (`arasul.meinefirma.de`) / Let's-Encrypt-ACME über Traefik.
- Headscale (self-hosted Tailscale-Koordinationsserver) — bleibt für später.
- Andere Service-Ports (Qdrant/MinIO/n8n) härten — sind bereits nur intern/localhost.
- Editierbares Endpoint-/IP-Feld im Frontend (technisch unnötig, same-origin).

## Acceptance Criteria

- [ ] Von einem Gerät im Tailnet lädt `https://<gerät>.<tailnet>.ts.net` das Dashboard
      **ohne Zertifikatswarnung**; Login gelingt.
- [ ] Login über die rohe Tailscale-IP liefert bei falschem Passwort ein lesbares
      401/„falsches Passwort", nicht „CORS".
- [ ] Im LAN lädt `https://<hostname>.local` weiterhin (self-signed, dokumentierte
      Vertrauens-Einrichtung).
- [ ] `./arasul reset-password admin` setzt neues Passwort, löscht Sessions **und**
      entsperrt den Account; danach Login sofort möglich.
- [ ] Fernzugriff-Tab zeigt die „So erreichst du Arasul"-Karte mit LAN- + Remote-Name,
      Kopier-Button und anklickbarem Link; die IP nur klein als Fallback.
- [ ] Backend-Unit-Test für die CORS-Origin-Prüfung ist grün (Grenzfälle 100.63/100.64/
      100.127/100.128, `*.ts.net`, RFC-1918 unverändert).
- [ ] `docs/` beschreiben durchgängig denselben Zugriffsweg; kein `http://<ip>` mehr als
      empfohlener Primärweg; `MDNS_NAME` ist dokumentiert.
- [ ] `./scripts/test/run-tests.sh --backend` grün; Live-Browser-Check auf dem Jetson ok.

## Phases

### ✅ P0 — Hotfix: Login entsperren (CORS + Passwort/Lock)

**Ziel:** Der Nutzer kommt sofort wieder rein — remote wie im LAN. In sich abgeschlossen
und unabhängig deploybar.

**Files:**

- `apps/dashboard-backend/src/index.js` (~124–163) — CORS-Origin-Logik.
- `apps/dashboard-backend/src/utils/corsOrigin.js` (neu) — `isAllowedOrigin(origin, allowedOrigins)`
  als pure, testbare Funktion extrahieren; `index.js` importiert sie in `corsOptions.origin`.
- `apps/dashboard-backend/__tests__/unit/corsOrigin.test.js` (neu) — Grenzfall-Tests.
- `scripts/security/reset-password.sh` — zusätzlich Account-Lock löschen
  (`admin_users.login_attempts = 0`, `locked_until = NULL`).
- `arasul` — neuer Subcommand `reset-password [username]` (Shape wie `cmd_mdns()`
  ~1527-1536; Dispatch wie `validate-config`), plus Help-Eintrag (~1645-1683).
- `docs/ops/TROUBLESHOOTING.md` (~100-112) — veralteten `UPDATE users …`-Snippet
  (falsche Tabelle) durch `./arasul reset-password [username]` ersetzen.

**Umsetzung CORS (additiv, minimal):**

```js
// Tailscale CGNAT range (100.64.0.0/10 = zweites Oktett 64–127, RFC 6598)
const _tailscaleCGNATRegex = new RegExp(
  `^https?:\\/\\/100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.${_octet}\\.${_octet}(:\\d+)?$`
);
// … in isLocalNetwork zwei Klauseln ergänzen:
//   _tailscaleCGNATRegex.test(origin) ||
//   /^https?:\/\/[a-zA-Z0-9-]+\.ts\.net(:\d+)?$/.test(origin)
```

Kein Eingriff in den Error-Handler: Für **erlaubte** Origins liefert `cors()` die
ACAO-Header bereits vor den Routen — die 401 ist damit lesbar. Origin-Reflection für
**geblockte** Origins wird bewusst **nicht** hinzugefügt (würde SEC-007 aushebeln).

**Risk:** medium — kritischer Pfad (Auth/CORS), aber rein additiv; RFC-1918-Verhalten
unverändert. Der Unit-Test sichert die Regex-Grenzen ab (verhindert versehentliches
Erlauben von `100.0.0.0/8`-Public-IPs — Sicherheitsgrund, daher trotz „weniger Tests"
dieser eine Test).

**Tests:** `security.test.js` bleibt grün; neuer `corsOrigin.test.js`. Reset-Script +
CLI manuell auf dem Jetson (Live-Konvention).

### ✅ P1 — Backend: echter LAN-Name + `tailscale serve` (vertrautes Remote-HTTPS)

**Ziel:** Die Grundlage für stabile Namen — Backend kennt den echten LAN-Namen und kann
`tailscale serve` schalten. Kein UI-Zwang; alles opt-in/harmlos, wenn ungenutzt.

**Files:**

- `compose/compose.app.yaml` (dashboard-backend `environment:` ~33-63) — `MDNS_NAME`
  in den Backend-Container durchreichen.
- `apps/dashboard-backend/src/routes/system/system.js` (~218-224) — `/system/network`
  gibt statt hartkodiert `arasul.local` den echten `${MDNS_NAME || 'arasul'}.local` aus.
- `apps/dashboard-backend/src/services/network/tailscaleService.js` — `serveStatus()`,
  `enableServe()`, `disableServe()` via vorhandenem `runOnHost()` (~47-87); Cache-Invalidierung
  wie bei `connect()`/`disconnect()`.
- `apps/dashboard-backend/src/routes/system/tailscale.js` — `GET/POST/DELETE /api/tailscale/serve`
  (Shape wie `POST /connect` ~56-70, `requireAuth`, `asyncHandler`).
- `apps/dashboard-backend/src/schemas/tailscale.js` — ggf. Body-Schema (voraussichtlich leer).
- `scripts/setup/setup-tailscale.sh` — nach erfolgreichem `tailscale up` serve aktivieren;
  `--accept-routes`-Inkonsistenz zum Backend angleichen.
- Auto-Enable: nach erfolgreichem `connect()` serve mit aktivieren (Best-Effort, non-fatal).

**Umsetzung serve (TLS-Doppelterminierung vermeiden):**

```
tailscale serve --bg --https=443 https+insecure://127.0.0.1:443
```

Auf Traefik-**443** zeigen (nicht 80 → sonst 301-Redirect-Loop); `https+insecure`, weil
Traefik ein self-signed Backend-Cert hat. MagicDNS+HTTPS-Certs ist eine **einmalige**
Aktivierung in der Tailscale-Admin-Konsole — Erkennung defensiv über `tailscale cert
<dnsname>`-Ausgabe; Zustand wird ans Frontend gemeldet (siehe P2).

**Risk:** medium — Host-Kommando + TLS-Verkettung. Fallback: schlägt serve fehl, bleibt
der Zugriff über die rohe Tailscale-IP (nach P0) funktionsfähig.

**Tests:** Backend-Suite grün (neue Route bricht Route-Registrierung nicht). `serve` live
auf dem Jetson verifizieren (browservertrautes Schloss auf `*.ts.net`).

### ✅ P2 — Frontend: „So erreichst du Arasul"-Karte

**Ziel:** Ein selbsterklärender Ort für beide stabilen Namen.

**Files:**

- `apps/dashboard-frontend/src/features/settings/RemoteAccessSettings.tsx` (~469-586) —
  neue Karte im „Verbunden"-Block: LAN-Name (aus `/system/network`), Remote-Name (aus
  `/tailscale/status` `dnsName`), je Kopier-Button (Muster `copyIp` ~212-221) +
  anklickbarer `https://`-Link; rohe IP klein als Fallback. Divide-y-Row-Layout wie im
  bestehenden Block. Hinweis-Badge, falls MagicDNS/HTTPS im Tailnet noch nicht aktiv ist.

**Risk:** low — rein präsentativ, keine neue Datenquelle außer dem P1-Feld.

**Tests:** Frontend-Checks sind advisory (Memory); Live-Browser-Check auf dem Jetson.

### ✅ P3 — Vereinheitlichung: Hostname-Hardcodes + Doku + Setup-Wizard

**Ziel:** Produktweit dieselbe Aussage; Hostname-Hardcodes raus, damit Kunden mit
eigenem Hostnamen kein Zertifikat-Mismatch bekommen.

**Files (Skripte):**

- `arasul` (~772) — Cert-Aufruf: statt Literal `"arasul.local"` den aus `MDNS_NAME`
  aufgelösten Hostnamen übergeben (Lookup-Muster ~1119). `~1133` Remote-Zeile:
  `https://<dnsName>` statt `http://${ts_ip}` bevorzugen.
- `scripts/setup/preconfigure.sh` (~379-380 Cert-CN/SAN, ~700-720 mDNS-Check, ~1009
  Abschlusstext) — auf konfigurierten Hostnamen + `https://` umstellen.
- `scripts/interactive_setup.sh` — Abschlussmeldung um
  „Dashboard erreichbar unter https://<hostname>.local" ergänzen.

**Files (Doku):**

- `docs/ops/QUICK_START.md`, `docs/ops/ADMIN_HANDBUCH.md`, `docs/ops/REMOTE_MAINTENANCE.md`,
  `docs/ops/DEPLOYMENT.md`, `docs/ARCHITECTURE.md` — einheitlicher Zugriffsweg
  (`https://<hostname>.local` LAN, `https://<gerät>.<tailnet>.ts.net` remote), kein
  `http://<ip>` als Primärweg; „LAN-only Standard, Remote Opt-in via Tailscale" verankern.
- `docs/ENVIRONMENT_VARIABLES.md` — `MDNS_NAME` neu dokumentieren; `ALLOWED_ORIGINS`-Text
  (LAN/`.local`/Tailscale automatisch erlaubt); Tailscale-Block um `serve`/`.ts.net`.
- `docs/api/API_REFERENCE.md` — neuer `/api/tailscale/serve`-Endpoint; ggf. `/system/network`.
- `docs/plans/active/FIELD_1.0.0_MASTER_PLAN.md` (P7-4) — als erledigt referenzieren.

**Risk:** low — Doku + String-Fixes in Skripten (kein Verhaltensbruch; auf dem Jetson
via `./arasul bootstrap` mit custom `HOSTNAME=` verifizierbar).

## Rollback

- Alles additiv, keine DB-Migration → Revert des Merge-Commits genügt.
- `tailscale serve` per `tailscale serve reset` abschaltbar; Remote-Zugriff fällt dann auf
  die rohe Tailscale-IP zurück (weiterhin funktionsfähig dank P0).
- CORS-Änderung isoliert in `corsOrigin.js` — bei Problem einzeln revertierbar.

## Open Questions

Keine offen — alle Kern-Entscheidungen sind im Interview geklärt (Name statt IP,
`tailscale serve` für vertrautes HTTPS, CORS-Bereich generell erlauben, `./arasul
reset-password`, „So erreichst du Arasul"-Karte). MagicDNS+HTTPS-Certs muss der Nutzer
einmalig in der Tailscale-Konsole aktivieren — wird in P2/P3 klar kommuniziert, ist kein
Code-Blocker.
