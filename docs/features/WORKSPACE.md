# Workspace

Ein **Workspace** ist die einzige „Projekt"-Entität (`sandbox_projects`): ein
Host-Ordner (`host_path`) plus ein Container, mit einem Besitzer und einem
Netzwerkmodus.

## Netzwerkmodus

Der Netzwerkschalter („Was darf dieser Workspace?") steuert, was der Container
erreichen darf (`VALID_NETWORK_MODES`):

| Modus            | UI-Bezeichnung | Zugriff                                    |
| ---------------- | -------------- | ------------------------------------------ |
| `isolated`       | Abgeschottet   | Internet ja, Plattform nein (Standard)     |
| `internal`       | Am System      | interne Dienste: DB / MinIO / Qdrant / RAG |
| `infrastructure` | Voller Zugriff | Infrastruktur — **nur Admin**              |

## Wissensraum

Jeder Workspace besitzt genau **einen unsichtbaren Wissensraum** (in der UI
„Ordner"): Dateien, die im Workspace geschrieben werden, werden automatisch
indiziert (kein manueller Upload), und die RAG-Suche bleibt auf diesen Raum
beschränkt.

> Skills (Chat-Slash-Befehle) ersetzen die früheren Agenten — siehe
> [`SKILLS.md`](SKILLS.md).

## Externe Anmeldung (Claude-Login)

Ein einmaliger Claude-Login in einem Sandbox-Terminal wird pro Nutzer
verschlüsselt gespeichert (`user_external_credentials`, AES-256-GCM via
`utils/tokenCrypto.js`) und beim Container-Start zurückgeschrieben — er
überlebt damit ein `docker compose up -d --build`.
