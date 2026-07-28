# Workspace

Ein **Workspace** ist die einzige „Projekt"-Entität (`sandbox_projects`): ein
Host-Ordner (`host_path`) plus ein Container, mit einem Besitzer, einem
Typ und einer Zugriffs-Stufe.

## Typ (`workspace_type`)

| Typ                      | Bedeutung                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `standard`               | Leerer Workspace-Ordner mit Terminal (Standard)                                                              |
| `erweiterungs-werkstatt` | Beim Anlegen mit `ANLEITUNG.md` und Beispiel-Erweiterungen bestückt — siehe [`EXTENSIONS.md`](EXTENSIONS.md) |

## Zugriffs-Stufe (`network_mode`)

Die drei Stufen („Zugriffs-Stufe — was darf dieser Workspace?") steuern, was der
Container erreichen darf (`VALID_NETWORK_MODES`):

| Modus            | UI-Bezeichnung               | Zugriff                                    |
| ---------------- | ---------------------------- | ------------------------------------------ |
| `isolated`       | Nur Internet                 | Internet ja, Plattform nein (Standard)     |
| `internal`       | Interne Dienste              | interne Dienste: DB / MinIO / Qdrant / RAG |
| `infrastructure` | Voller Systemzugriff (Admin) | Infrastruktur — **nur Admin**              |

> **Ordner-Umfang:** Jeder Workspace sieht genau **seinen eigenen** Ordner unter
> `/workspace` (plus `/opt/tools` read-only); `infrastructure` bekommt zusätzlich
> das Plattform-Repo und den Docker-Socket. Ein frei wählbarer Mount eines
> beliebigen internen Ordners je Stufe ist **bewusst nicht** umgesetzt — das wäre
> eine eigene Sicherheitsfläche und bleibt ein Folgeschritt.

## Wissensraum

Jeder Workspace besitzt genau **einen unsichtbaren Wissensraum** (in der UI
„Ordner"): Dateien, die im Workspace geschrieben werden, werden automatisch
indiziert (kein manueller Upload), und die RAG-Suche bleibt auf diesen Raum
beschränkt.

> Flows (Chat-Slash-Befehle) ersetzen die früheren Agenten — siehe
> [`FLOWS.md`](FLOWS.md).

## KI-Zugang für die Sandboxes (Claude)

**Zentraler Zugang (empfohlen, Plan 013).** Statt sich in jeder Sandbox einzeln
im Terminal anzumelden (der interaktive OAuth-Link ist im Web-Terminal kaum
kopierbar), hinterlegt der Admin über den Knopf **„KI-Zugang"** im Terminal-Kopf
EINMAL einen Zugang:

- **Abo-Token** — `claude setup-token` auf einem Rechner mit Browser ausführen und
  das 1 Jahr gültige Token einfügen (→ `CLAUDE_CODE_OAUTH_TOKEN`), oder
- **API-Key** — Anthropic-API-Key (→ `ANTHROPIC_API_KEY`, Abrechnung pro Nutzung).

Der Wert wird verschlüsselt gespeichert (`user_external_credentials`, Provider
`claude-central`, AES-256-GCM via `utils/tokenCrypto.js`) und in JEDE Sandbox als
Umgebungsvariable gebracht: neue Container bekommen ihn über die Container-Env,
laufende sofort über eine aus `.bashrc` gesourcte Profildatei. So ist `claude` im
Terminal ohne Login angemeldet. Routen: `GET|PUT|DELETE /api/sandbox/claude-auth`.

**Interaktiver Login einfangen (Alternative).** Wer sich lieber direkt im Terminal
per `claude` anmeldet, kann diesen Login über „Aktuellen Login speichern"
einfangen: er wird pro Nutzer verschlüsselt gespeichert (Provider `claude`) und
beim Container-Start zurückgeschrieben — überlebt damit ein
`docker compose up -d --build`. Routen: `.../claude-login/capture|status`,
`DELETE .../claude-login`.
