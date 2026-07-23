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

> Skills (Chat-Slash-Befehle) ersetzen die früheren Agenten — siehe
> [`SKILLS.md`](SKILLS.md).

## Externe Anmeldung (Claude-Login)

Ein einmaliger Claude-Login in einem Sandbox-Terminal wird pro Nutzer
verschlüsselt gespeichert (`user_external_credentials`, AES-256-GCM via
`utils/tokenCrypto.js`) und beim Container-Start zurückgeschrieben — er
überlebt damit ein `docker compose up -d --build`.
