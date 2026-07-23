# Erweiterungs-Baukasten

Arasul ist offen: eigene **Apps**, **n8n-Flows** und **Werkzeug-Konnektoren**
lassen sich lokal bauen, paketieren, herunterladen, weitergeben und wieder
installieren — ohne Cloud, ohne fremden Marktplatz (Plan 012 Phase E).

## Das mentale Modell

```
Erweiterungs-Werkstatt (Sandbox)  →  Paket  →  Register  →  Erweiterungen-Ansicht
   ANLEITUNG.md + Beispiele          .tar.gz    Tabelle       Karte mit An/Aus
   /erweiterung · /execute                      extensions
```

1. **Werkstatt anlegen** — beim Anlegen einer Sandbox den Typ
   _Erweiterungs-Werkstatt_ wählen. Der Ordner ist dann schon mit `ANLEITUNG.md`
   und drei Beispiel-Erweiterungen bestückt.
2. **Bauen** — im Chat `/erweiterung` aufrufen (legt das Gerüst an bzw. baut es
   weiter) und `/execute` (führt die Erweiterung aus und prüft sie).
   Alternativ von Hand oder mit einem externen Agenten im Terminal.
3. **Paketieren** — Erweiterungen-Ansicht → „Eigene Erweiterung bauen" → Sandbox
   und Unterordner wählen → _Aus Werkstatt paketieren_.
4. **Verteilen** — _Herunterladen_ liefert ein `.tar.gz`; auf einem anderen Gerät
   im selben Dialog _Paket importieren_.
5. **Weiterbauen** — _Forken_ legt eine neue Werkstatt-Sandbox mit einer Kopie an.

## Das Paketformat

Ein Paket ist ein Ordner mit einer `manifest.json` im Wurzelverzeichnis:

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

| Feld                     | Pflicht | Werte                                                   |
| ------------------------ | ------- | ------------------------------------------------------- |
| `id`                     | ja      | Kleinbuchstaben/Ziffern/Bindestriche, 2–50 Zeichen      |
| `name`                   | ja      | max. 100 Zeichen                                        |
| `type`                   | ja      | `app` · `flow` · `tool`                                 |
| `accessTier`             | nein    | `internet` (Standard) · `internal` · `full`             |
| `version`                | nein    | Standard `0.1.0`                                        |
| `entry`                  | ja      | relative Startdatei im Paket (kein `..`, nicht absolut) |
| `arasulExtensionVersion` | nein    | aktuell `1`                                             |

Die Startdatei je Typ: `app` → HTML-Seite, `flow` → `workflow.json`,
`tool` → ausführbares Skript (liest stdin, schreibt JSON auf stdout).

## Zugriffs-Stufen

Dieselben drei Stufen wie bei einer Sandbox — wähle immer die niedrigste, die
reicht:

| Stufe      | UI-Bezeichnung               | Bedeutung                                       |
| ---------- | ---------------------------- | ----------------------------------------------- |
| `internet` | Nur Internet                 | Kein Zugriff auf Datenbank, Speicher oder RAG   |
| `internal` | Interne Dienste              | Zusätzlich LLM, Qdrant, Datenbank, Speicher     |
| `full`     | Voller Systemzugriff (Admin) | Plattform-Repo (rw) + Docker-Socket — nur Admin |

## Sicherheit beim Import

Einem hochgeladenen Archiv wird **nichts** geglaubt. Abgewiesen werden:
Symlinks, Hardlinks, Gerätedateien, absolute Pfade und jeder `..`-Ausbruch.
Obergrenzen: 2000 Einträge, 64 MB entpackt, 64 KB Manifest. Was die Prüfung
nicht besteht, wird verworfen — nicht „bereinigt"; ein bereits teilweise
entpacktes Verzeichnis wird gelöscht.

Auch beim Paketieren gilt: der gewählte Unterordner muss **innerhalb** der
Sandbox liegen. Eine frisch installierte Erweiterung ist zunächst
**deaktiviert** und muss bewusst eingeschaltet werden.

## Ablageorte

| Was                | Pfad (Container)                      | Bind-Mount               |
| ------------------ | ------------------------------------- | ------------------------ |
| Pakete (Register)  | `/arasul/extensions`                  | `data/extensions`        |
| Werkstatt-Vorlagen | `/arasul/sandbox-build/dev-templates` | `services/sandbox/` (ro) |
| Sandbox-Ordner     | `/arasul/sandbox/projects/<slug>`     | `data/sandbox/projects`  |

## Grenzen (Stand Plan 012 Phase E)

- Eine installierte Erweiterung erscheint als Karte in der Erweiterungen-Ansicht
  und lässt sich aktivieren. Einen **eigenen Activity-Bar-Eintrag** bringt sie
  noch nicht mit — dafür braucht es einen generischen Erweiterungs-Tab-Typ; das
  ist bewusst ein Folgeschritt.
- Die Zugriffs-Stufe ist im Manifest deklariert und wird angezeigt; sie steuert
  heute die Sandbox, in der gebaut wird, noch nicht eine eigene Laufzeit pro
  Erweiterung.

## Verwandte Dokumentation

- API: [`API_REFERENCE.md`](../api/API_REFERENCE.md) → Abschnitt **Extensions**
- Datenbank: [`DATABASE_SCHEMA.md`](../api/DATABASE_SCHEMA.md) → `extensions`
- Umgebungsvariablen: [`ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md)
  → `EXTENSIONS_DIR`, `SANDBOX_DEV_TEMPLATES_DIR`
- Skills: [`SKILLS.md`](SKILLS.md) — `/erweiterung` und `/execute`
