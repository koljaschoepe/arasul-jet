# Messung: was v0.5.0 trägt und v0.4.0 nicht

> 29.08.2026, Auftrag `release-v050` (Bezug M2). Gemessen am ausgepackten
> Artefakt, nicht am Gerät: der Orin lief währenddessen den Dauerlauf A7 und
> ist unberührt geblieben.

## Die Frage

**Enthält das ausgelieferte Artefakt die zwei Reparaturen aus G2?** v0.4.0
enthält sie nicht, und das ist keine Vermutung: der Tag wurde am 28.08.2026 um
21:25 auf `cd351e85` gesetzt, PR #737 (Phase G2) wurde danach gemergt.
Zwischen Tag und Merge lag eine Stunde. Wer heute v0.4.0 installiert, bekommt
beide Fehler mitgeliefert, und der zweite trifft einen Kunden.

## Der Weg

v0.5.0 auf `aae9a6b7` getaggt — die Spitze von `origin/main` und der
Merge-Commit von #737. Die Sperre aus #735 hat alle drei Regeln bestätigt
(Vorfahre von `main`, Nachfahre von v0.4.0, Spitze von `main`), erst lokal und
dann im Lauf `33221717680`. Das Release trägt zwei Dateien:

```
arasul-0.5.0.tar.gz          2 481 221 Byte
arasul-0.5.0.tar.gz.sha256   2fbc5d20540470845c77de3e62133bbc1ae8642fed65dc957b99a5affb2e4b32
```

Heruntergeladen und gegengeprüft — `shasum -a 256 -c` sagt `OK`. Ausgepackt
meldet `arasul-release.json` die Fassung `0.5.0` und den Commit `aae9a6b7`,
also genau den Stand, der getaggt wurde.

## Der Nachweis, Zeile für Zeile

Alle Fundstellen aus dem **ausgepackten Artefakt**, nicht aus dem Repo.

### 1. Die Drossel vor dem Backend

`config/traefik/dynamic/middlewares.yml:59` — die zwei Proben, die jede
Seitenladung macht, haben ihre eigene Middleware:

```yaml
59:    rate-limit-auth-probe:
60:      rateLimit:
61:        average: 120
62:        period: 1m
63:        burst: 40
```

`config/traefik/dynamic/routes.yml:80` — und einen eigenen Router davor, mit
`Path` statt `PathPrefix` und höherer Priorität, damit nur diese zwei Pfade
daran vorbeikommen und nicht das ganze Präfix:

```yaml
80:    auth-probe-api:
81:      rule: 'Path(`/api/auth/session`) || Path(`/api/auth/needs-setup`)'
83:      priority: 25
86:        - rate-limit-auth-probe
```

`middlewares.yml:29` trägt weiter `rate-limit-auth` mit `average: 30` — die
gehören jetzt den Mutationen (Anmelden, Abmelden), und das ist der Zweck, den
die Zahl immer hatte.

### 2. Die rollenden Utilities

`apps/dashboard-frontend/src/index.css:3342` bis `:3344`:

```css
3342:.overflow-auto { overflow: auto; position: relative; }
3343:.overflow-x-auto { overflow-x: auto; position: relative; }
3344:.overflow-y-auto { overflow-y: auto; position: relative; }
```

Der Wächter liegt daneben: `scripts/test/check-design-system.js:200` prüft je
Selektor, dass ein rollender Kasten eine Position setzt (`SETZT_POSITION`).

## Die Gegenprobe an v0.4.0

Dasselbe Artefakt eine Nummer tiefer, ebenfalls heruntergeladen und
ausgepackt:

| Stelle                                       | v0.4.0                                       | v0.5.0                                 |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------- |
| `rate-limit-auth-probe` in `middlewares.yml` | gibt es nicht                                | Zeile 59, 120 je Minute                |
| Router auf `/api/auth`                       | nur `PathPrefix(/api/auth)`, `routes.yml:76` | dazu `auth-probe-api`, `routes.yml:80` |
| `.overflow-x-auto` in `index.css`            | `{ overflow-x: auto; }`, Zeile 3313          | `+ position: relative`, Zeile 3343     |

Das ist der Befund des Auftrags, gemessen: in v0.4.0 läuft **jede** Anfrage an
`/api/auth` gegen die 30 je Minute und je IP. Eine Seitenladung kostet zwei
davon. Hinter einer NAT-Adresse teilt sich ein ganzes Büro eine IP — nach etwa
fünf Seiten kommt 429, und weil Traefiks `rateLimit` keine
`RateLimit-*`-Kopfzeilen schickt, steht in der Antwort nichts, was es erklären
würde.

## Was diese Messung nicht sagt

Sie sagt **nicht**, dass ein Gerät mit v0.5.0 hochkommt. Sie sagt, dass die
zwei Zeilen im Paket liegen. Der Beleg am laufenden Gerät steht dagegen schon:
beide Reparaturen sind für G2 von Hand auf den Orin gespielt und dort dreimal
mit 88 von 88 gemessen worden. Was v0.5.0 hinzufügt, ist, dass ein **neu
installiertes** Gerät sie auch bekommt.

Und sie sagt nichts über den Weg von 0.4.0 nach 0.5.0. Dass das Artefakt
installiert und nicht aktualisiert, steht als offene Lücke in
[`AUSLIEFERUNG.md`](../../ops/AUSLIEFERUNG.md) und ist nicht Teil dieses
Auftrags.

## Das Gerät

Unberührt, und das ist nachgesehen und nicht behauptet — A7 läuft seit dem
28.08.2026 um 23:34 ununterbrochen und hängt an dieser Zahl:

```
$ docker inspect -f '{{.State.StartedAt}}' postgres-db
2026-08-28T21:34:22.828822227Z
```

Kein Deploy, kein Neustart, kein `docker compose`. Der einzige Zugriff auf den
Orin in diesem Auftrag war dieses `docker inspect`.
