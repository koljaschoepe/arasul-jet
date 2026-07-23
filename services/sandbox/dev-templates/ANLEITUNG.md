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

- **`id`** — Kleinbuchstaben, Ziffern, Bindestriche. Wird zum Paket-Ordnernamen.
- **`type`** — `app` | `flow` | `tool`.
- **`accessTier`** — Zugriffs-Stufe der Sandbox, in der die Erweiterung läuft:
  `internet` (nur Internet), `internal` (interne Dienste), `full` (voller
  Systemzugriff, Admin). Wähle die **niedrigste**, die reicht.
- **`entry`** — die Startdatei je Typ: bei `app` die HTML-Seite, bei `flow` die
  `workflow.json`, bei `tool` das ausführbare Skript.
- **`arasulExtensionVersion`** — Paketformat-Version, aktuell `1`.

## Bau-Skills

Statt alles von Hand zu tippen, nutze die zwei mitgelieferten Skills im Chat:

- **`/erweiterung`** — legt hier ein Gerüst an bzw. baut es geführt weiter
  (App/Flow/Tool). Schreibt `manifest.json` + Startdateien.
- **`/execute`** — führt die gebaute Erweiterung in dieser Sandbox aus und
  meldet das Ergebnis zurück (Syntax-Check, Testlauf, Manifest-Prüfung).

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
