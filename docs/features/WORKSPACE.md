# Workspace

> **Stand 26.08.2026, Phase B4 des Umbaus:** Der Workspace, wie ihn diese
> Seite bis B3 beschrieb (Sandbox-Container mit Netzwerkmodi, Terminal,
> Projekte mit Projektablage und Ein-Ordner-Modell, Wissensräume, Git-Sync,
> Erweiterungs-Werkstatt, KI-Zugang für Claude Code und Codex), ist
> vollständig gestrichen: die Oberfläche mit B2 und B3, Routen, Dienste und
> Tabellen mit B4 (Migration 163 entfernt `sandbox_projects`, `projects`,
> `knowledge_spaces`, `user_external_credentials` und die Tabellen dazu).
> Was ein Arbeitsbereich im Zielbild ist, legen die D-Phasen des
> Überordner-Plans fest.

## Was heute unter dem Namen bleibt

- **Workspace-Apps** (`GET /api/workspace-apps`, `PUT /api/workspace-apps/:id`,
  Tabelle `platform_apps`): die kuratierten Kern-Apps (n8n, Telegram, Datenbank)
  je App an- oder abschalten. Der Schalter hat bis D1 keine Oberfläche; die
  Apps selbst gehören zu Phase B5.
- **Chat** (`/api/chats`, `/api/llm/chat`): bleibt bis B6, ohne Agent-Modus,
  ohne Datei-Ablage, ohne Wissensraum-Bindung. Die Spalten
  `chat_messages.datei` und `.schritte` (Migrationen 127/128) stehen noch,
  neue Zeilen entstehen nicht mehr.
- **Flows** (`/api/flows`, `data/flows/`): siehe [`FLOWS.md`](FLOWS.md).
  Ordner sind die im Flow deklarierten Pfade im Backend-Container; das
  Schema `projekt://` gibt es nicht mehr.

## Verwandte Dokumentation

- [`FLOWS.md`](FLOWS.md)
- [`../api/API_REFERENCE.md`](../api/API_REFERENCE.md), Abschnitte
  **Workspace-Apps**, **Chat Conversations**, **Flows**
- Die Geschichte des Workspace bis zum Rückbau steht in den abgeschlossenen
  Plänen 012 bis 019 (Übersicht in [`../plans/HISTORIE.md`](../plans/HISTORIE.md)).
