# Erweiterungs-Typen & Paketformat

Eine Erweiterung ist ein Ordner mit einer `manifest.json` im Wurzelverzeichnis
plus Assets. Drei Typen:

| Typ  | `type` | Was es ist                                   | Startdatei (`entry`) |
| ---- | ------ | -------------------------------------------- | -------------------- |
| App  | `app`  | Weboberfläche als eigener Tab                | `index.html`         |
| Flow | `flow` | n8n-Workflow (Automation)                    | `workflow.json`      |
| Tool | `tool` | Konnektor/Skript, stellt ein Werkzeug bereit | z. B. `tool.mjs`     |

## `manifest.json`

```json
{
  "id": "meine-erweiterung",
  "name": "Meine Erweiterung",
  "description": "Ein Satz, was sie tut.",
  "type": "app",
  "accessTier": "internet",
  "version": "0.1.0",
  "arasulExtensionVersion": 1,
  "entry": "index.html",
  "faehigkeiten": ["llm"]
}
```

- **`id`** — Kleinbuchstaben/Ziffern/Bindestriche, 2–50 Zeichen, kein
  Bindestrich am Anfang/Ende. Wird zum Paket-Ordnernamen.
- **`accessTier`** — niedrigste Stufe wählen, die reicht: `internet` /
  `internal` / `full`.
- **`faehigkeiten`** — optional; nur bei Bedarf, siehe `bruecke.md`.

## Lebenszyklus

`/plan` → `/execute` bauen die Erweiterung im Werkstatt-Ordner. Der
Werkstatt-Watcher übernimmt jede gültige `manifest.json` automatisch ins
Register. **Live schalten** (bei App auch als Tab öffnen), **Zurücknehmen**,
**Rollback** (ein Schritt zurück) und **Herunterladen** macht der Admin im
Werkstatt-Panel. Es gibt genau einen Live-Stand je Erweiterung plus einen
Rollback-Punkt.

Flow-Erweiterungen werden beim Live-Schalten per n8n-API importiert und
aktiviert; ihr Status (aktiv/letzter Lauf) erscheint im Panel.

Beispiele liegen in `beispiel-app/`, `beispiel-flow/`, `beispiel-tool/`.
Vollständige Bauer-Anleitung: `../ANLEITUNG.md`.
