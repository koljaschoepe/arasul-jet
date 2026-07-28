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
„Ordner"), auf den seine RAG-Suche beschränkt bleibt. Dateien werden **nicht**
automatisch indiziert (der frühere Workspace-Indexer ist entfernt): In den
Wissensraum kommt eine Datei nur **manuell per Klick** — über „In den
Wissensraum übernehmen" in der Projektablage (s. u.) oder den normalen
Dokument-Upload.

> Flows (Chat-Slash-Befehle) ersetzen die früheren Agenten — siehe
> [`FLOWS.md`](FLOWS.md).

## Projektablage

Jedes Wissensraum-Projekt (`projects`) besitzt einen **echten Geräte-Ordner**
`data/projects/<uuid>` (Container: `/arasul/projects/<uuid>`) — die
**Projektablage**. Sie ist die gemeinsame Wahrheit für drei Welten:

- **Explorer** — der Bereich „Projektablage" unter dem Wissensraum-Baum zeigt
  die Ablage des aktiven Projekts: Dateien öffnen (eigener Editor-Tab mit
  CodeMirror, Tab-Typ `projektdatei`), anlegen, umbenennen, löschen, hoch- und
  herunterladen — und einzelne Dateien per Klick **in den Wissensraum
  übernehmen** (erst dann kennt das RAG sie). API:
  `/api/projects/:id/dateien/*` ([`API_REFERENCE.md`](../api/API_REFERENCE.md)).
- **Flows** — der `ordner`-Wert `projekt://aktiv` wird zur Laufzeit in die
  Ablage des aktiven Projekts aufgelöst; `projekt://aktiv/unterordner` zielt
  auf einen Unterordner, und pro Lauf kann `ordner_ziel` (z. B. der
  Kundenordner) das Arbeitsverzeichnis umlenken ([`FLOWS.md`](FLOWS.md)).
- **Chat (Agent-Modus, 2026-07-28)** — der Workspace-Chat ist ein Agent mit
  Werkzeugschleife: das Modell ruft selbst **Wissensraum-Suche** (`rag_suche`),
  **Ablage-Werkzeuge** (lesen/schreiben/durchsuchen — die Projektablage des
  aktiven Projekts), **Web-Suche/-Lesen** und **Subagenten** (Rolle
  „rechercheur") auf, wenn die Aufgabe es braucht; einfache Fragen beantwortet
  es direkt. Der frühere fest verdrahtete RAG-Zitier-Modus (der
  Erstell-Aufgaben verweigerte) entfällt im Workspace-Chat — Quellen holt sich
  der Agent als Material. Während der Arbeit zeigen kompakte
  **Schritt-Zeilen** was passiert; nach Abschluss falten sie sich zu einer
  „N Schritte"-Zeile. Erstellt der Agent Dokumente (Newsletter, Webseite,
  Bericht …), schreibt er sie mit passender Endung (`.html`, `.md`, `.csv` …)
  in die Ablage und der Verlauf zeigt klickbare **Datei-Karten** (öffnen den
  Editor-Tab; HTML öffnet gerendert). Der **Datei-Modus** im Composer
  (Datei-Symbol) oder eine erkannte Speicher-Absicht („speicher das als
  Datei …") erzwingt eine Datei; ein aus dem Ablage-Baum gezogener **Ordner**
  wird zum Ziel („Speichern in: …"-Chip). Jede fertige Antwort hat zusätzlich
  die Aktion **„Als Datei speichern"** (erkennt HTML/Code-Inhalte und wählt
  die Endung). Persistiert werden Datei-Verweise und Schritte an der
  Nachricht (`chat_messages.datei`/`.schritte`, Migrationen 127/128).
- **Sandboxes** — eine Sandbox kann an ein Projekt angeschlossen werden
  (`sandbox_projects.project_id`, beim Anlegen/Bearbeiten: „Projektablage
  anschließen"): dessen Ablage wird beim Container-Start **rw als
  `/workspace/projekt`** gemountet. Was Claude Code dort baut, liegt sofort im
  Explorer. „Kein Projekt" trennt den Anschluss; ein gelöschtes Projekt kappt
  nur die Verbindung, die Sandbox bleibt.

Der **Git-Sync-Checkout** (Plan 013, `PROJECT_GIT_DIR`) liegt im **selben**
Ordner — ein Git-gekoppeltes Projekt sieht in der Ablage schlicht sein Repo.
`.git` wird im Explorer ausgeblendet und ist vor Löschen/Umbenennen geschützt.

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
