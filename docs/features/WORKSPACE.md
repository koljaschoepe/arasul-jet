# Workspace

> **Stand 26.08.2026, Phase B5 des Umbaus:** Der Workspace, wie ihn diese
> Seite bis B3 beschrieb (Sandbox-Container mit Netzwerkmodi, Terminal,
> Projekte mit Projektablage und Ein-Ordner-Modell, Wissensräume, Git-Sync,
> Erweiterungs-Werkstatt, KI-Zugang für Claude Code und Codex), ist
> vollständig gestrichen: die Oberfläche mit B2 und B3, Routen, Dienste und
> Tabellen mit B4 (Migration 163 entfernt `sandbox_projects`, `projects`,
> `knowledge_spaces`, `user_external_credentials` und die Tabellen dazu).
> Was ein Arbeitsbereich im Zielbild ist, legen die D-Phasen des
> Überordner-Plans fest.

## Was heute unter dem Namen bleibt

- **Workspace-Apps** gibt es seit B5 nicht mehr: `/api/workspace-apps`, die
  Tabelle `platform_apps` (Migration 164) und n8n als letzte Kern-App sind
  weg. Das App-Modell aus C3 ersetzt sie.
- **Chat** (`/api/chats`, `/api/llm/chat`): mit B6 gefallen, samt den
  Tabellen `chat_conversations`, `chat_messages`, `chat_attachments`
  (Migration 165). Sprachmodell-Aufträge laufen nur noch zustandslos über die
  externe API.
- **Flows** (`/api/flows`, `data/flows/`): siehe [`FLOWS.md`](FLOWS.md).
  Ordner sind die im Flow deklarierten Pfade im Backend-Container; das
  Schema `projekt://` gibt es nicht mehr.

## Verwandte Dokumentation

- [`FLOWS.md`](FLOWS.md)
- [`../api/API_REFERENCE.md`](../api/API_REFERENCE.md), Abschnitte
  **Flows**, **External API**
- Die Geschichte des Workspace bis zum Rückbau steht in den abgeschlossenen
  Plänen 012 bis 019 (Übersicht in [`../plans/HISTORIE.md`](../plans/HISTORIE.md)).
