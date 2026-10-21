# terminal

ttyd unter `/terminal/` für die Rolle Entwickler (Karte
`terminal-im-frontend`, M5). Je Browserfenster prüft `verbinde.sh` das Siegel
der Tür und öffnet per ssh die Shell des eigenen Linux-Nutzers `ara-<id>` am
Gerät. Aufbau, Trennung und Einrichtung: [`docs/features/TERMINAL.md`](../../docs/features/TERMINAL.md).

| Was         | Wert                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------- |
| Port        | 7681, nur im Netz `arasul-terminal` (mit Traefik), kein veröffentlichter Port               |
| Profil      | `terminal` (`compose/compose.terminal.yaml`), also nicht von selbst                         |
| Kennung     | 1000:1000 (wie das Backend), Dateisystem nur lesbar, `/tmp` als tmpfs, keine Capabilities   |
| Einrichtung | `/run/terminal` ← `config/secrets/terminal/` (`schluessel`, `known_hosts`, `tor_geheimnis`) |
| Healthcheck | `healthcheck.sh`: ttyd nimmt auf 7681 Verbindungen an                                       |

| Variable                  | Vorgabe                | Bedeutung                                    |
| ------------------------- | ---------------------- | -------------------------------------------- |
| `TERMINAL_SSH_PORT`       | `22`                   | Port des sshd am Gerät                       |
| `TERMINAL_HOECHSTENS`     | `20`                   | Terminals zugleich                           |
| `TERMINAL_SCHRIFTGROESSE` | `14`                   | Schriftgröße im Browser                      |
| `TERMINAL_HOST`           | `host.docker.internal` | Ziel von ssh (nur für Tests anders)          |
| `TERMINAL_EINRICHTUNG`    | `/run/terminal`        | Ordner mit Schlüssel, known_hosts, Geheimnis |

Ohne Einrichtung endet der Container mit einem Satz, der `einrichten.sh` nennt.
