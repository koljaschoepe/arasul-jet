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

## Wissensraum (Sandbox)

Jeder Workspace (Sandbox) besitzt genau **einen unsichtbaren Wissensraum**, auf
den seine RAG-Suche beschränkt bleibt (`is_workspace = TRUE`, ohne
Projekt-Zuordnung — vom Ein-Ordner-Modell unberührt).

> Flows (Chat-Slash-Befehle) ersetzen die früheren Agenten — siehe
> [`FLOWS.md`](FLOWS.md).

## Der Projektordner — das Ein-Ordner-Modell (2026-07-29)

Jedes Projekt (`projects`) besitzt einen **echten Geräte-Ordner**
`data/projects/<uuid>` (Container: `/arasul/projects/<uuid>`). Er ist seit dem
Ein-Ordner-Modell die **einzige Wahrheit** — die frühere Zweiteilung
(Wissensraum-Ordnerbaum + separate „Projektablage") ist abgeschafft:

- **Ein Baum.** Der Explorer zeigt genau den Plattenbaum des aktiven
  Projekts. Jeder Unterordner wird automatisch als Wissensraum
  (`knowledge_spaces.rel_pfad`) gespiegelt, jede indexierbare Datei (`.pdf
.docx .md .txt .html .csv …`, ≤ 50 MB) automatisch als Dokument in die
  Index-Pipeline gegeben (`documents.rel_pfad`, MinIO → Indexer → Qdrant).
  „In den Wissensraum übernehmen" gibt es nicht mehr. Der Abgleich läuft in
  `services/projects/ordnerSyncService.js` (Takt `ORDNER_SYNC_INTERVAL_MS`
  = 20 s, plus Sofort-Trigger nach Datei-Operationen, Chat-Agent- und
  Flow-Läufen); Umbenennen wird per Inhalts-Hash erkannt (kein Re-Index),
  Löschen räumt Dokument, MinIO-Objekt und Vektoren ab. Beim ersten Start
  wurde der Altbestand aus MinIO in die Ordner **materialisiert**.
- **Index-Status im Baum:** Dateien tragen ihren Wissens-Status als dezenten
  Text („wird indexiert", „Index fehlgeschlagen") — bewusst ohne Punkte oder
  Icons; Ordner tragen ihre `space_id` (für „Mit Ordner chatten").
- **Explorer-Aktionen:** öffnen (Editor-Tab `projektdatei`, PDFs/Binäres im
  Dokument-Viewer), anlegen, umbenennen, löschen, hoch-/herunterladen. API:
  `/api/projects/:id/dateien/*` ([`API_REFERENCE.md`](../api/API_REFERENCE.md)).
- **Flows** — der `ordner`-Wert `projekt://aktiv` wird zur Laufzeit in den
  Projektordner des aktiven Projekts aufgelöst; `projekt://aktiv/unterordner`
  zielt auf einen Unterordner, und pro Lauf kann `ordner_ziel` (z. B. der
  Kundenordner) das Arbeitsverzeichnis umlenken ([`FLOWS.md`](FLOWS.md)).
- **Chat (Orchestrator, 2026-07-29)** — der Workspace-Chat ist ein
  Coding-Agent mit erzwungenem Protokoll: die **Ordnerstruktur des Projekts
  steht immer im Kontext**; komplexe Aufträge beginnen mit einem stillen
  **Plan-Schritt**, dann arbeitet das Modell mit **Wissensraum-Suche**
  (`rag_suche`), **Datei-Werkzeugen**, **Web**, **Terminal**
  (projektbeschränkt im Sandbox-Container) und **Subagenten** der
  Rollen-Riege `rechercheur` / `autor` / `pruefer` / `entwickler`; bevor eine
  Antwort mit erstellten Dateien fertig ist, kontrolliert der `pruefer`
  automatisch (eine Korrektur-Schleife bei Mängeln). Es gibt **kein
  Zeitlimit** — der Stop-Knopf bricht jederzeit ab, Teiltext und Schritte
  bleiben erhalten. Einfache Fragen beantwortet das Modell weiter direkt.
  Während der Arbeit zeigen kompakte **Schritt-Zeilen** was passiert; nach
  Abschluss falten sie sich zu einer „N Schritte"-Zeile. Erstellt der Agent Dokumente (Newsletter, Webseite,
  Bericht …), schreibt er sie mit passender Endung (`.html`, `.md`, `.csv` …)
  in den Projektordner und der Verlauf zeigt klickbare **Datei-Karten** (öffnen
  den Editor-Tab; HTML öffnet gerendert). Der **Datei-Modus** im Composer
  (Datei-Symbol) oder eine erkannte Speicher-Absicht („speicher das als
  Datei …") erzwingt eine Datei; ein aus dem Baum gezogener **Ordner**
  wird zum Ziel („Speichern in: …"-Chip). Jede fertige Antwort hat zusätzlich
  die Aktion **„Als Datei speichern"** (erkennt HTML/Code-Inhalte und wählt
  die Endung). Persistiert werden Datei-Verweise und Schritte an der
  Nachricht (`chat_messages.datei`/`.schritte`, Migrationen 127/128).
- **Sandboxes** — eine Sandbox kann an ein Projekt angeschlossen werden
  (`sandbox_projects.project_id`, beim Anlegen/Bearbeiten: „Projektordner
  anschließen"): dessen Ordner wird beim Container-Start **rw als
  `/workspace/projekt`** gemountet. Was Claude Code dort baut, liegt sofort im
  Explorer (und wandert per Ordner-Sync automatisch ins Wissen). „Kein
  Projekt" trennt den Anschluss; ein gelöschtes Projekt kappt nur die
  Verbindung, die Sandbox bleibt.

Der **Git-Sync-Checkout** (Plan 013, `PROJECT_GIT_DIR`) liegt im **selben**
Ordner — ein Git-gekoppeltes Projekt sieht im Explorer schlicht sein Repo.
`.git` wird ausgeblendet und ist vor Löschen/Umbenennen geschützt.

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
