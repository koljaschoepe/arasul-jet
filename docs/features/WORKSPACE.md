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
- **Markdown-Editor (Plan 016):** `.md`/`.markdown` öffnen als gerenderte,
  direkt bearbeitbare **TipTap-Vorschau** (Default) — dieselbe Engine wie der
  Dokument-Editor. Der Kopf-Umschalter **Vorschau ⇄ Quelltext** zeigt das rohe
  Markdown in CodeMirror. Gespeichert wird **dezent automatisch** (Auto-Save
  nach kurzer Tipp-Pause, „Gespeichert ✓"-Hinweis; kein großer Knopf). YAML-
  **Frontmatter** wird beim Öffnen wörtlich abgetrennt und beim Speichern
  unverändert wieder angehängt; bloßes Öffnen schreibt nie auf die Platte
  (Roundtrip-sicher fürs Ein-Ordner-Modell). Andere Textdateien (`.py`, `.json`
  …) bleiben im CodeMirror-Editor mit manuellem Speichern.
- **Flows** — der `ordner`-Wert `projekt://aktiv` wird zur Laufzeit in den
  Projektordner des aktiven Projekts aufgelöst; `projekt://aktiv/unterordner`
  zielt auf einen Unterordner, und pro Lauf kann `ordner_ziel` (z. B. der
  Kundenordner) das Arbeitsverzeichnis umlenken ([`FLOWS.md`](FLOWS.md)).
- **Chat (Orchestrator, 2026-07-29; Harness v2 2026-07-31)** — der
  Workspace-Chat ist ein Coding-Agent mit erzwungenem Protokoll: die
  **Ordnerstruktur des Projekts steht immer im Kontext**; komplexe Aufträge
  beginnen mit einem **Plan-Schritt** (auf dem Qualitätsmodell
  `AGENT_QUALITAETS_MODELL`, mit live gestreamtem **Gedankengang**), dann
  arbeitet das Modell mit **Wissensraum-Suche** (`rag_suche`),
  **Datei-Werkzeugen** (lesen/schreiben/**bearbeiten** per Suchen-Ersetzen/
  **anhängen** für Langdokumente/suchen), **Web**, **Terminal**
  (projektbeschränkt im Sandbox-Container) und **Subagenten** der
  Rollen-Riege `rechercheur` / `autor` / `pruefer` / `entwickler`. Bei
  mehrschrittigen Aufträgen pflegt es eine **Aufgabenliste** (`todo_liste`),
  die live als abhakbare Checkliste über den Schritt-Zeilen erscheint und
  jede Runde neu in den Kontext kommt (Anti-Drift). Der Kontext wird pro
  Runde **gehaushaltet** (num_ctx explizit, alte Werkzeug-Ausgaben werden
  eingedampft statt still abgeschnitten). Bevor eine Antwort mit erstellten
  Dateien fertig ist, kontrolliert der `pruefer` automatisch (bis zu zwei
  Korrektur-Schleifen). Es gibt **kein Zeitlimit** — der Stop-Knopf bricht
  jederzeit ab, Teiltext und Schritte bleiben erhalten. Einfache Fragen
  beantwortet das Modell weiter direkt. Während der Arbeit streamen
  **Gedankengang, Erzähl-Sätze und Schritt-Zeilen live**; nach Abschluss
  falten sich die Schritte zu einer „N Schritte"-Zeile. Erstellt der Agent Dokumente (Newsletter, Webseite,
  Bericht …), schreibt er sie mit passender Endung (`.html`, `.md`, `.csv` …)
  in den Projektordner und der Verlauf zeigt klickbare **Datei-Karten** (öffnen
  den Editor-Tab; HTML öffnet gerendert). Der **Datei-Modus** im Composer
  (Datei-Symbol) oder eine erkannte Speicher-Absicht („speicher das als
  Datei …") erzwingt eine Datei; ein aus dem Baum gezogener **Ordner**
  wird zum Ziel („Speichern in: …"-Chip). Jede fertige Antwort hat zusätzlich
  die Aktion **„Als Datei speichern"** (erkennt HTML/Code-Inhalte und wählt
  die Endung). Persistiert werden Datei-Verweise und Schritte an der
  Nachricht (`chat_messages.datei`/`.schritte`, Migrationen 127/128).
- **Strenge Ordner-Bindung (Plan 019)** — hängt man dem Chat einen Ordner an
  („Speichern in: …"-Chip), IST dieser Ordner die Wurzel des Agenten: Datei-
  **und** Terminal-Werkzeug arbeiten ausschließlich darin (Terminal-`cwd` +
  Mount = angehängter Ordner), die Struktur-Übersicht im Kontext zeigt nur
  diesen Teilbaum, und es gibt kein Ausweichen auf die restliche Projektablage
  oder nach „/". Ohne Anhang bleibt die ganze Projektablage die Wurzel. Ein
  ungültiges Ziel (`..`, absolut) fällt sicher auf die Projektwurzel zurück.
- **PDF-/Bild-Viewer (Plan 019)** — PDFs und Bilder öffnen im Datei-Tab nicht
  mehr als bloße Download-Karte, sondern in einem echten Viewer: PDFs
  seitenweise über pdf.js (Canvas, selbst gehosteter Worker — kein CDN/iframe,
  CSP-konform), Bilder mit Zoom. Beide streamen über
  `GET …/dateien/vorschau` (inline, Range-fähig, bis 50 MB) statt über den
  5-MB-Editor-Endpunkt; andere Binärformate behalten die Download-Karte.
- **Sandboxes** — eine Sandbox kann an ein Projekt angeschlossen werden
  (`sandbox_projects.project_id`, beim Anlegen/Bearbeiten: „Projektordner
  anschließen"): dessen Ordner wird beim Container-Start **rw als
  `/workspace/projekt`** gemountet. Was Claude Code dort baut, liegt sofort im
  Explorer (und wandert per Ordner-Sync automatisch ins Wissen). „Kein
  Projekt" trennt den Anschluss; ein gelöschtes Projekt kappt nur die
  Verbindung, die Sandbox bleibt. **Neue Terminal-Sitzungen starten direkt in
  `/workspace/projekt`**, sofern die Projektablage gemountet ist — ein blankes
  `ls` zeigt sofort die Projektdateien statt nur des `projekt/`-Ordners; ohne
  angeschlossenes Projekt bleibt der Start bei `/workspace`.

- **Chat-Anhänge (2026-07-30)** — eine in den Chat gezogene Datei landet
  ERST im Projektordner (Ziel-Ordner-Chip oder Wurzel) und läuft dann als
  normaler Agent-Auftrag; die Nutzer-Nachricht trägt den Anhang als
  klickbare Projektdatei-Karte. Kleine Text-Dateien (≤ 16 KB) gehen mit
  exaktem Inhalt in den Auftrag (kleine Modelle überspringen sonst das
  Lesen). Die frühere Dokument-Analyse-Pipeline bleibt nur als Fallback
  ohne aktives Projekt.

Der **Git-Sync-Checkout** (Plan 013, `PROJECT_GIT_DIR`) liegt im **selben**
Ordner — ein Git-gekoppeltes Projekt sieht im Explorer schlicht sein Repo.
`.git` wird ausgeblendet und ist vor Löschen/Umbenennen geschützt.
**Git-gekoppelte Projekte sind vom Auto-Index ausgenommen** (der Checkout
würde sonst hunderte Repo-Dateien durch die GPU-Analyse jagen); der
Coding-Agent arbeitet dort über Datei-Werkzeuge und Terminal statt RAG.

## Geräteweite Projekte (Plan 017 Schritt 1)

Sandbox-Projekte sind **geräteweit sichtbar und öffenbar** — jeder angemeldete
Nutzer sieht und öffnet alle Projekte (Einzel-Admin-Modell; „erstellt von" bleibt
zur Anzeige). WS-Tickets und die KI-Zugänge bleiben pro Nutzer.

> **Keine Mehrbenutzer-Anzeige in der Oberfläche.** Die früheren
> „Anwesenheits"-Punkte (wer ist gerade per Terminal-WebSocket verbunden) sind
> aus der Terminal-Kopfzeile entfernt — sie widersprachen dem Einzel-Admin-
> Modell und haben nur verwirrt. Das Backend kann Verbindungszahlen weiterhin
> ermitteln; die Oberfläche zeigt sie nicht mehr an.

## Ein aktives Projekt steuert alles (Plan 018)

Seit Plan 018 gibt es **eine einzige, oben getroffene Projektauswahl** (der
Projekt-Umschalter in der Menüleiste): ihr folgen **Dateien, Flows und
Terminal** gemeinsam. Zuvor liefen zwei getrennte „Projekt"-Begriffe
nebeneinander — der Explorer am Workspace-Projekt (`projects`), das Terminal an
einem separat gewählten Sandbox-Container (`sandbox_projects`) —, sodass links
„test" und rechts „Kunden" offen sein konnte.

- **Terminal folgt dem aktiven Projekt.** Es hat **keinen eigenen
  Projekt-Umschalter** mehr und man kann von dort **kein Projekt „öffnen"**. Der
  gekoppelte Container wird über `POST /api/sandbox/projects/ensure`
  (`{project_id}`) aus dem aktiven Projekt abgeleitet — 1:1 über
  `sandbox_projects.project_id` — und beim ersten Öffnen automatisch angelegt
  (Netz **„intern"**) und gestartet. Der partielle Unique-Index aus Migration
  139 erzwingt „höchstens ein aktiver Container je Projekt".
- **Sitzungen pro Projekt gemerkt.** Die Terminal-Session-Registry ist über die
  Container-Id partitioniert; ein Projektwechsel verwirft nichts, die Sitzungen
  des vorigen Projekts sind bei der Rückkehr wieder da.
- **Projekt-Startseite + Übersichtsseite.** Der Projekt-Umschalter öffnet über
  „Projekt-Übersicht" eine **Kachelliste aller Projekte** (Tab `projekte`); ein
  Klick aktiviert das Projekt und öffnet seine **Übersichtsseite** (Tab
  `projektuebersicht`, folgt dem aktiven Projekt) mit Info (Netzmodus/Ablage),
  Schnellzugriff (Terminal/Dateien/Flows) und der **Werkstatt** — Letztere nur,
  wenn Erweiterungen existieren. „← Projekte" führt zurück.
- **Werkstatt aus dem Terminal heraus.** Das Werkstatt-Panel erscheint nicht
  mehr über dem Terminal, sondern auf der Projekt-Übersichtsseite.
- **Flows-Sidebar gescopt.** Sie zeigt nur die Flows des aktiven Projekts plus
  die globalen (nicht mehr alle Projekte gleichzeitig).
- **Backfill beim Boot.** Ein einmaliger, idempotenter Boot-Schritt koppelt
  bestehende, ungekoppelte Container per Namensgleichheit an ein Workspace-
  Projekt (bzw. legt eines an) — nichts verschwindet.

## Projekt-Verbindungen & MCP (Plan 017 Schritt 5)

Pro Projekt lassen sich externe Zugänge (`env`, z. B. Supabase-Keys) und
MCP-Server (`mcp`) hinterlegen — verschlüsselt im Tresor (AES-256-GCM), nie im
Klartext zurückgegeben. Beim Sitzungs-Start injiziert das Backend die Werte als
Env-Variablen (per Name, nie als Kommandozeilen-Literal) plus eine generierte
`/workspace/.mcp.json` (Claude Code) und Codex-`config.toml` unter
`$CODEX_HOME`; MCP-Secrets stehen dort nur als `${ENV}`-Platzhalter. CRUD:
`/api/sandbox/projects/:id/verbindungen`.

## Terminal & Coding-Agent

**Ein Terminal-Stack.** Das Browser-Terminal läuft ausschließlich über den
Sandbox-Pfad: xterm.js ↔ binäre WebSocket ↔ `docker exec`-TTY im
`arasul-sandbox`-Container (tmux-persistent). Der alte, kaputte ttyd-Pfad ist
mit Plan 015 entfernt.

**Einzeilige Kopfzeile + benannte Sitzungen (Plan 017 Schritt 6).** Der
Terminal-Kopf ist eine kompakte Zeile: Projekt-Dropdown + Sitzungs-Tabs. Jede
Sitzung trägt einen **serverseitigen Titel** (Schlüssel Projekt + tmux-Name,
geräteweit gleich), automatisch nach dem gestarteten Werkzeug benannt (Claude
Code / Codex / Lokaler Coder / Shell N) und per Doppelklick bzw. F2 umbenennbar
(`PUT /api/sandbox/projects/:id/sitzungen/:tmux/titel`).

**Lokal-first als Standard.** Der empfohlene Coder ist der **lokale** Agent
(open-ara auf `qwen3-coder`, Quick-Launch „Lokaler Coder (empfohlen)") — kein
Login, kein externer Account, voll DSGVO. Braucht Netzmodus `internal`
(erreicht `llm-service`); im `isolated`-Modus meldet der Start eine klare
Meldung statt eines Hängers. Claude Code und Codex sind opt-in-Beschleuniger.

## KI-Zugang für die Sandboxes (Claude & Codex)

### So meldest du dich EINMAL an (Claude, empfohlener Weg)

Öffne im Terminal-Kopf **„KI-Zugang"** → **„Mit Claude anmelden"**:

1. Auf **„Anmeldung starten"** klicken → das Backend baut den OAuth-2.0-PKCE-
   Handshake **selbst** (eigener `code_challenge`) und zeigt eine **garantiert
   korrekte, kopierbare** Login-URL (bricht nie um, „öffnen"-Link + Copy-Knopf).
2. Die URL im Browser öffnen, mit deinem Claude-Abo anmelden, den angezeigten
   **Code** (`code#state`) kopieren.
3. Den Code ins Feld einfügen → **„Anmeldung abschließen"**. Fertig.

Das Backend tauscht den Code gegen Access-+Refresh-Token, legt sie verschlüsselt
ab (`user_external_credentials`, Provider `claude-central`, AES-256-GCM) und
injiziert `CLAUDE_CODE_OAUTH_TOKEN` in **jede** Terminal-Session. Danach ist
`claude` in jeder Sandbox, in neuen Terminals und nach Container-Neustart
angemeldet — **ohne erneuten Login**. Der Zugriff wird vor Ablauf lazy erneuert
(Refresh-Token); ein „Erneuern"-Knopf + Ablauf-Anzeige stehen bereit.
Dies ersetzt den kaputten interaktiven `claude /login` (Fehler „fehlender
`code_challenge`") komplett. Routen: `POST /api/sandbox/claude-auth/oauth/start|complete|refresh`.

**Alternativen** (gleicher Knopf): **Abo-Token** (`claude setup-token`,
1-Jahres-Token → `CLAUDE_CODE_OAUTH_TOKEN`) oder **API-Key**
(→ `ANTHROPIC_API_KEY`, Abrechnung pro Nutzung). `GET|PUT|DELETE /api/sandbox/claude-auth`.

> **Wichtig:** Ist ein Abo-/OAuth-Token aktiv, wird `ANTHROPIC_API_KEY` in der
> Sandbox-Env garantiert **entfernt** — ein API-Key würde den Abo-Token sonst
> still schlagen und auf metered Billing umleiten. `--bare` wird nie benutzt.

### Codex

**„Codex anmelden"** im Quick-Launch startet `codex login --device-auth`: die
Codex-CLI führt den Geräte-Code-Flow selbst (Code + Link im Browser),
**self-refreshed** und speichert in `~/.codex/auth.json` (überlebt Sessions) —
kein Backend nötig. (Team/Workspace-Accounts müssen Device-Code-Login ggf. erst
in den ChatGPT-Einstellungen freischalten.)

**Interaktiven Login einfangen (Alternative).** Ein direkter `claude`-Login im
Terminal lässt sich über „Aktuellen Login speichern" einfangen (Provider
`claude`), verschlüsselt ablegen und beim Container-Start zurückschreiben.
Routen: `.../claude-login/capture|status`, `DELETE .../claude-login`.
