# Arasul-Erweiterung bauen — Werkstatt-Anleitung

Willkommen in der **Erweiterungs-Werkstatt**. Dieser Ordner ist eine Sandbox mit
Terminal-Zugriff, in der du (oder ein Agent wie Claude Code) eine Arasul-
Erweiterung baust. Am Ende wird der Ordner zu einem **Paket**, das sich forken,
herunterladen und wieder installieren lässt.

## Was ist eine Erweiterung?

Ein Ordner mit einer `manifest.json` und den zugehörigen Assets. Drei Typen:

| Typ  | `type` | Was es ist                                          | Beispiel-Ordner |
| ---- | ------ | --------------------------------------------------- | --------------- |
| App  | `app`  | Eine kleine Weboberfläche als eigener Tab           | `beispiel-app`  |
| Flow | `flow` | Ein n8n-Workflow (Automation)                       | `beispiel-flow` |
| Tool | `tool` | Ein Konnektor/Skript, das ein Werkzeug bereitstellt | `beispiel-tool` |

## Das Manifest (`manifest.json`)

Jede Erweiterung **muss** eine `manifest.json` im Wurzelordner haben:

```json
{
  "id": "meine-erweiterung",
  "name": "Meine Erweiterung",
  "description": "Ein Satz, was sie tut.",
  "type": "app",
  "accessTier": "internet",
  "version": "0.1.0",
  "arasulExtensionVersion": 1,
  "entry": "index.html"
}
```

- **`id`** — Kleinbuchstaben, Ziffern, Bindestriche; **2–50 Zeichen, kein Bindestrich am Anfang oder Ende** (sonst wird der Ordner still abgelehnt). Wird zum Paket-Ordnernamen.
- **`type`** — `app` | `flow` | `tool`.
- **`accessTier`** — Zugriffs-Stufe der Sandbox, in der die Erweiterung läuft:
  `internet` (nur Internet), `internal` (interne Dienste), `full` (voller
  Systemzugriff, Admin). Wähle die **niedrigste**, die reicht.
- **`entry`** — die Startdatei je Typ: bei `app` die HTML-Seite, bei `flow` die
  `workflow.json`, bei `tool` das ausführbare Skript.
- **`arasulExtensionVersion`** — Paketformat-Version, aktuell `1`.

## Die zwei Bau-Flows

Statt alles von Hand zu tippen, nutze die zwei mitgelieferten Flows im Chat:

- **`/erweiterung`** — legt ein Gerüst an bzw. baut es geführt weiter
  (App/Flow/Tool). Schreibt `manifest.json` + Startdateien.
- **`/execute`** — führt die gebaute Erweiterung aus und meldet das Ergebnis
  zurück (Syntax-Check, Testlauf, Manifest-Prüfung).

Alternativ baust du direkt im **Terminal** (z. B. mit einem KI-Agenten wie
Claude Code oder dem lokalen Coder) in diesem Werkstatt-Ordner — der
Werkstatt-Watcher registriert jede gültige `manifest.json` automatisch.

## Das Agenten-Paket (Claude Code & Codex)

In dieser Werkstatt liegen fertige Agenten-Befehle bereit:

- **`/plan`** — stellt dir im Terminal ausführlich Rückfragen (App/Flow/Tool?
  Fähigkeiten? Verbindungen? Prüfschritte?) und schreibt eine anschaubare
  `PLAN.html` in den Workspace.
- **`/execute <PLAN.html>`** — arbeitet den Plan iterativ ab und baut die
  Erweiterung.
- **`/info`** — zeigt den Projekt-Kontext (Fähigkeiten, Verbindungen, Brücke).

Für Claude Code liegen sie unter `.claude/commands/`. **Codex** (und andere
Agenten) folgen demselben Ablauf — siehe `AGENTS.md`. Die kompakten
Kontext-Dateien unter `kontext/` (Brücke, Verbindungen, Paketformat) sind
geräteneutral formuliert (NVIDIA-Gerät oder Server).

## Die KI-Brücke — auf LLM, RAG, Dateien und Flows zugreifen

Eine live geschaltete App läuft in einem abgeriegelten iframe. Über die
**KI-Brücke** kann sie trotzdem kontrolliert die lokale Basis nutzen:

1. Deklariere im `manifest.json`, was die App braucht:

   ```json
   "faehigkeiten": ["llm", "rag", "dateien", "flows"]
   ```

   - `llm` — Fragen ans lokale Modell (gestreamte Antwort)
   - `rag` — Wissensbasis-Suche mit Quellen
   - `dateien` — Projektablage lesen/schreiben
   - `flows` — Flows auflisten, starten, Ergebnis abholen

2. Lege `arasul-bruecke.js` (liegt in diesem Werkstatt-Ordner) mit in dein
   Paket und binde es ein: `<script src="arasul-bruecke.js"></script>`.
   Danach steht `ArasulBruecke` bereit — Beispiele in `beispiel-app/index.html`
   und die vollständige API im Kopf von `arasul-bruecke.js`.

3. Beim **Live-Schalten** bestätigt der Admin die deklarierte Liste einmal
   („Diese Erweiterung darf: …"). Nicht freigegebene Fähigkeiten weist das
   Backend bei jedem Aufruf mit 403 ab. Deklariert ein Update NEUE
   Fähigkeiten, sind sie erst nach erneuter Freigabe nutzbar.

Der Token dafür kommt automatisch vom Dashboard (postMessage) — deine App
muss sich um Anmeldung oder Erneuerung nicht kümmern.

## Fertig? — Paketieren

Wenn die Erweiterung steht:

1. In der **Erweiterungen**-Ansicht (linke Activity-Bar) auf **„Eigene
   Erweiterung bauen"** → **Aus Werkstatt paketieren** und diese Sandbox wählen.
2. Arasul liest die `manifest.json`, schnürt den Ordner zu einem Paket und legt
   einen Register-Eintrag an. Danach kannst du das Paket **herunterladen**
   (`.tar.gz`), **forken** (Kopie als neue Werkstatt) oder **aktivieren**.

## Konventionen

- Ein Ordner = eine Erweiterung. Verschachtele keine Erweiterungen ineinander.
- Halte Assets relativ zum Wurzelordner (kein `../`-Ausbruch — wird abgewiesen).
- Keine Secrets ins Paket. Zugangsdaten kommen zur Laufzeit aus Arasul.
