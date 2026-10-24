# Das Terminal für Entwickler

> Stand 21.10.2026, Karte `terminal-im-frontend` (M5). Risiko R52, der
> stärkste Einwand ist R35: eine Shell im Browser auf dem Gerät der Belege.
> Deshalb steht die Trennung hier ganz oben, und sie ist Abnahmebedingung.

Ein Entwickler öffnet in der Oberfläche ein Terminal und landet als **sein
eigener Linux-Nutzer** am Gerät, in **seinem eigenen Ordner**. Dort startet
er Claude Code und meldet sich mit **seinem eigenen Claude-Konto** an; Arasul
reicht keine Zugänge weiter. Apps erreicht er über `arasul.mjs call` wie von
seinem Rechner aus. Das Internet geht. Docker, sudo und andere Ordner gehen
nicht.

Rahmen aus dem Beschluss vom 20.10.2026: nur die Rolle **Entwickler**,
**Standard aus**, der Administrator schaltet **je Person** frei.

---

## Der Weg, von außen nach innen

```
Browser ─ /terminal/ ─▶ Traefik ─ Forward-Auth ─▶ GET /intern/terminal/tor
                          │                       (Sitzung? Rolle Entwickler? eigene Origin?)
                          │  X-Arasul-Terminal-Nutzer: ara-<id>:<siegel>
                          ▼
                   Container `terminal` (ttyd 1.7.7, Netz arasul-terminal)
                          │  verbinde.sh prüft das Siegel
                          │  ssh ara-<id>@host.docker.internal, ein Schlüssel des Containers
                          ▼
                   sshd am Gerät ─▶ Login-Shell von ara-<id> in /home/ara-<id>
```

| Stück                    | Wo                                                    | Was es entscheidet                                                      |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Rolle Entwickler         | `admin_users.entwickler` (Migration 213)              | ob die Tür aufgeht                                                      |
| Tür                      | `apps/dashboard-backend/src/routes/terminal.js`       | wer hereinkommt und als welcher Linux-Nutzer                            |
| Container                | `services/terminal/`, `compose/compose.terminal.yaml` | nichts Eigenes: Siegel prüfen, ssh öffnen                               |
| Linux-Nutzer, sshd, Netz | `scripts/terminal/einrichten.sh`, `nutzer.sh`         | **was** der Mensch danach darf                                          |
| Probe                    | `scripts/terminal/trennung-pruefen.sh`                | ob das stimmt, am Gerät und im CI (`scripts/test/terminal-trennung.sh`) |

**Die Trennung macht Linux, nicht Arasul.** Die Tür sagt nur Ja oder Nein und
nennt den Namen. Hinter ihr ist der Mensch ein gewöhnlicher Linux-Nutzer ohne
Rechte, und was ein solcher Nutzer nicht darf, darf er auch über das Terminal
nicht. Das ist der Grund für ssh statt einer Shell im Container: ein Container
hätte entweder keinen Zugang zum Ordner des Menschen oder einen, den man ihm
mit Rechten erst geben müsste.

### Der Name am Gerät

`ara-<id>`, aus der Kennung der Person, **nie aus dem Benutzernamen**: eindeutig,
unveränderlich bei einer Umbenennung, und ohne Umschreiben ein gültiger
Linux-Name. Die Verwaltung zeigt ihn unter Personen neben dem Schalter
„Entwickler“.

### Das Siegel

Traefik setzt `X-Arasul-Terminal-Nutzer` aus der Antwort der Tür und **löscht**
eine gleichnamige Kopfzeile der Anfrage vorher. Das reicht nicht: **jeder
Prozess am Gerät** erreicht die Adresse des Containers im Docker-Netz, auch
die Shell eines Entwicklers, und könnte ttyd direkt mit
`X-Arasul-Terminal-Nutzer: ara-1` ansprechen. Deshalb trägt der Wert ein
Siegel: die ersten 16 Hex-Zeichen von HMAC-SHA256 über `ara-<id>` mit dem
Geheimnis aus `config/secrets/terminal/tor_geheimnis`. `verbinde.sh` prüft es,
bevor es verbindet. Das Geheimnis liegt in `config/secrets/` (0700), wohin kein
Terminal-Nutzer kommt. Die Firewall sperrt den Weg zum Container außerdem; zwei
Riegel, weil der eine Linux und der andere eine Datei ist.

Der Wert passt mit Siegel in die 29 Zeichen, die ttyd 1.7.7 für den Nutzer der
Kopfzeile vorhält (`char user[30]`), solange die Kennung höchstens acht Ziffern
hat.

---

## Was ein Terminal-Nutzer darf

| Darf                                                                                                            | Darf nicht                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| lesen und schreiben in `/home/ara-<id>` (0700)                                                                  | einen anderen Ordner unter `/home` lesen oder schreiben                      |
| ins Internet (Claude, npm, git)                                                                                 | `sudo`, `su`; er ist in keiner Gruppe außer `arasul-terminal`                |
| am Gerät: DNS, 80, 443, 8443 (Apps, `arasul.mjs call`, Firmenordner), auf 127.0.0.1 und auf der Adresse im Netz | den Docker-Socket; Ollama, Postgres, sshd, Traefik-Dashboard am Gerät        |
|                                                                                                                 | einen Container direkt ansprechen (jede Docker-Brücke, `docker0` und `br-*`) |
|                                                                                                                 | sich selbst einen ssh-Zugang hinlegen (`AuthorizedKeysFile` gehört root)     |
|                                                                                                                 | ssh-Weiterleitungen, Tunnel, Agent, X11                                      |
|                                                                                                                 | `.env` und `config/secrets` der Installation lesen                           |

Dazu je Nutzer eine Grenze für Speicher und Rechenzeit (systemd,
`TERMINAL_SPEICHER` Vorgabe `8G`, `TERMINAL_CPU` Vorgabe `400%`), damit eine
Sitzung dem Gerät nicht die Apps wegnimmt.

**Offen gelassen, bewusst:** `/tmp` ist für alle beschreibbar (mit Sticky Bit,
wie auf jedem Linux); `nutzer.sh` setzt deshalb `umask 077` in `.profile` und
`.bashrc`, damit dort Abgelegtes nur dem Nutzer gehört. Ein Terminal-Nutzer
sieht die Prozessliste des Geräts (`ps`), samt Befehlszeilen. **Darum steht das
Geheimnis der Tür in keiner Befehlszeile:** `services/terminal/siegel.sh` rechnet
HMAC-SHA256 mit eingebauten Befehlen der Shell und reicht openssl nur Bytes
über die Standardeingabe; der CI-Test zeichnet jeden Programmstart von
`verbinde.sh` mit strace auf und sucht das Geheimnis darin (Review 21.10.2026:
mit `openssl -hmac <geheimnis>` hätte ein Entwickler es aus `/proc` lesen und
Siegel für andere rechnen können). Wer die Prozessliste ganz schließen will,
setzt `hidepid=2` auf `/proc`; das ist am Gerät nicht eingestellt, weil es
systemd-logind und polkit eine Ausnahmegruppe abverlangt.

---

## Einrichten am Gerät

Einmal je Gerät, aus der Wurzel der Installation:

```bash
sudo ./scripts/terminal/einrichten.sh
```

Legt an: Gruppe `arasul-terminal`, die sshd-Regel
`/etc/ssh/sshd_config.d/10-arasul-terminal.conf` (endet mit `Match all`, sonst
gälte der Rest der `sshd_config` nur noch für diese Gruppe), die Firewall
(Kette `ARASUL_TERMINAL`, Dienst `arasul-terminal-netz.service` setzt sie nach
jedem Start neu) und in `config/secrets/terminal/` Schlüssel, `known_hosts` und
das Geheimnis der Tür. Wiederholbar; Vorhandenes bleibt.

Dann das Profil einschalten und Container und Backend anlegen:

```bash
# .env
COMPOSE_PROFILES=firmenordner,terminal

docker compose up -d terminal dashboard-backend
```

Das Backend gehört in den Befehl, weil es `COMPOSE_PROFILES` liest und eine
Umgebungsvariable einen laufenden Container nicht erreicht (dieselbe Falle wie
beim Firmenordner).

Je Person, nachdem die Verwaltung „Entwickler“ eingeschaltet hat:

```bash
sudo ./scripts/terminal/nutzer.sh anlegen ara-7
sudo ./scripts/terminal/trennung-pruefen.sh ara-7     # die Probe, für diesen Nutzer
```

Entfernen (beendet auch seine laufenden Prozesse):

```bash
sudo ./scripts/terminal/nutzer.sh entfernen ara-7
```

Das Kit soll diese Schritte später übernehmen (Karte `kit-claude-am-geraet`,
ara-kit), samt Claude Code und Werkzeugen im Nutzer.

### Was ein entzogenes Recht beendet

Die Tür fragt bei **jedem Aufbau** die Datenbank, nicht den Zwischenspeicher:
ein abgeschalteter Schalter oder ein gesperrtes Konto gilt beim nächsten
Öffnen. **Ein schon offenes Terminal läuft weiter**, bis es geschlossen wird.
Wer jemanden sofort heraushaben will, entfernt seinen Linux-Nutzer.

---

## Die Probe

`scripts/terminal/trennung-pruefen.sh <nutzer>` prüft **als dieser Nutzer**
(runuser) jede Zeile der Tabelle oben und nennt am Ende eine Summe. Rückgabe 0
nur, wenn alles wie erwartet war. Am Netz prüft sie jeden Dienst, der am Gerät
lauscht, und jeden Container, den root von dort erreicht; ein „abgewiesen“
zählt nur, wo es etwas abzuweisen gab.

Im CI fährt `scripts/test/terminal-trennung.sh` (Job „Terminal: Trennung“) das
Ganze auf einem frischen Ubuntu: einrichten, zwei Nutzer, Probe mit Netz,
`verbinde.sh` mit gültigem Siegel (landet als `ara-1`, nur in
`arasul-terminal`, in `/home/ara-1`), ein falsches Siegel und `root` werden
abgewiesen, `ssh -W` wird abgewiesen, ein selbst hingelegter Schlüssel kommt
nicht herein, Backend und Container rechnen dasselbe Siegel, entfernen nimmt
alles weg.

Am Orin am 21.10.2026 mit einem Wegwerf-Nutzer, ohne Firewall (`--ohne-netz`):
18 von 18 wie erwartet. Ohne `einrichten.sh` erreicht ein solcher Nutzer
`127.0.0.1:11434` (Ollama) und `127.0.0.1:8080`; das schließt erst die
Firewall.

---

## Grenzen

- **Eine App im Browser kann das Terminal des Entwicklers bedienen.** Apps
  laufen unter derselben Herkunft wie die Oberfläche (`/apps/<id>/`, ohne
  `sandbox`, `docs/features/APPS.md`), mit dem Sitzungscookie des Menschen. Eine
  App, die ein Entwickler offen hat, kann deshalb einen WebSocket auf
  `/terminal/ws` öffnen, und die Tür sieht eine gültige Sitzung mit passender
  Herkunft. Das ist dieselbe Vertrauensstufe, mit der eine App heute schon jede
  Schnittstelle im Namen des Menschen ruft. Das Terminal hebt aber das, was
  dabei zu holen ist, auf eine Shell als `ara-<id>`. Abhilfe wäre eine eigene
  Herkunft für das Terminal (eigener Port wie beim Firmenordner); bis dahin
  gilt: wer Entwickler ist, öffnet nur Apps, denen er traut (Review 21.10.2026).
- **Schließt der Browser, endet die Sitzung.** ttyd hängt die ssh-Sitzung an
  den WebSocket. Wer Claude Code länger laufen lassen will, startet es in
  `tmux` oder `screen`. Innerhalb der Oberfläche bleibt das Terminal am Leben,
  wenn man zu einer App und zurück wechselt.
- **Hell/Dunkel folgt nicht.** Das Terminal zeichnet in den Farben von ttyd;
  ein Thema, das der Oberfläche folgt, ist nicht gebaut.
- **Höchstens 20 Terminals zugleich** am Gerät (`TERMINAL_HOECHSTENS`).
