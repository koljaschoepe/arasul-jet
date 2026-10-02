# egress-proxy

Der Ausgangs-Proxy der Apps (J38). Die Apps laufen im Netz `arasul-apps` ohne
Internet; dieser Container ist der einzige Weg hinaus und lässt je App nur die
Hostnamen aus `verbindungen` im Manifest durch. Er bricht kein TLS auf, zählt
jede Entscheidung und weist Namen ab, die auf Adressen im Haus zeigen.

Warum ein eigener Prozess statt Squid und wie die Zuordnung funktioniert:
Kopf von [`proxy.js`](proxy.js) und
[`docs/features/APPS.md`](../../docs/features/APPS.md#der-ausgangs-proxy-j38-02102026).

|             |                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Port        | `3128` (nur in den Docker-Netzen, nie am Host)                                                                                   |
| Healthcheck | `GET /health` (`200`, sobald Regeln geladen sind, vorher `503`)                                                                  |
| Env         | `JWT_SECRET_FILE` (Docker-Secret `jwt_secret`), `BACKEND_URL`, `REGEL_INTERVALL_MS` (10000), `SENDE_INTERVALL_MS` (5000), `PORT` |
| Tests       | `node --test services/egress-proxy/test/`                                                                                        |

Regeln holt er von `GET /api/ausgang/regeln`, Zahlen schickt er an
`POST /api/ausgang/ereignisse` (Backend, Tabelle `ausgang_zaehler`). Er selbst
speichert nichts.
