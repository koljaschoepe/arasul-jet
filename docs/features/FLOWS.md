# Flows

Ein **Flow** ist eine vorkonfigurierte Aufgabe, die im Chat per `/name`
aufgerufen wird — modelliert nach Claude Code. Technisch ist ein Flow eine
Markdown-Datei mit YAML-Kopf unter `data/flows/` (im Container
`/arasul/flows`, siehe `FLOWS_DIR`). Die Datei ist die Wahrheit; der
Editor erzeugt sie nur.

Flows ersetzen den früheren Agenten- und Fluss-Layer (Plan 011). Statt
Kästchen zu verbinden, baut man eine spezialisierte Aufgabe einmal und ruft sie
im Chat mit `/` ab.

## Im Chat benutzen

- `/` öffnet ein Menü aller Flows. Tippen filtert; das Stift-Symbol bearbeitet,
  `/neuer-flow` legt einen an. Bearbeiten und Anlegen öffnen den **zentralen
  Flow-Editor** als eigenen Mitte-Tab (kein Popup mehr, Plan 012 Phase D);
  `/flows` öffnet die **Flow-Übersicht** in der linken Sidebar (Activity-Bar-
  Ansicht »Flows«), aus der ein Klick denselben Editor-Tab öffnet.
- Der Editor zeigt links das Formular, rechts eine Live-Vorschau mit zwei
  Ansichten: die **erzeugte Datei** und den **aufgelösten Laufzeit-Prompt** —
  also genau das, was der Runner dem Modell gibt (Prompt mit eingesetzten
  Beispiel-Argumenten; Werkzeuge/Ordner/Rollen werden strukturell daneben
  übergeben, nicht in den Prompt-Text gefaltet).
- Nach der Auswahl stehen die erwarteten Argumente grau hinter dem Befehl —
  Pflicht in `<spitzen>`, optional in `[eckigen]` Klammern. Tippen überschreibt
  das aktive Argument, Tab springt zum nächsten.
- Nicht-Freitext-Argumente öffnen eine Auswahl: **Datei** (Dokumente aus der
  Wissensbasis), **feste Liste** (die `optionen` des Flows), **Wissensbasis**
  (die vorhandenen Sammlungen).
- Ein Lauf erscheint als Karte im Verlauf: jeder Werkzeug- und Subagent-Schritt
  mit Dauer und Status, am Ende die Antwort und — bei Schreibzugriffen — eine
  Übersicht geänderter Dateien (neu / geändert / gelöscht, mit Vorher/Nachher).
  Subagenten sind dabei **aufklappbare Bäume** (Agenten-Baum, s. u.); in der
  Flow-Zentrale ist „Letzte Läufe" klickbar und öffnet die Lauf-Detailansicht
  mit demselben Protokoll.
- Läufe leben serverseitig: Tab schließen und später öffnen zeigt den aktuellen
  Stand bzw. das fertige Ergebnis. Der Abbrechen-Knopf stoppt einen Lauf
  innerhalb weniger Sekunden.
- **Jetzt ausführen (Flow-Zentrale):** Die Zentrale eines Flows hat als oberste
  Karte ein Argument-Formular aus der Deklaration (Freitext/Datei → Eingabefeld,
  `auswahl` → Dropdown der `optionen`, `wissensbasis` → Dropdown der Sammlungen;
  Pflichtfelder sperren den Knopf, `standard` belegt vor). „Ausführen" startet
  den Lauf über `POST /api/flows/laeufe` und springt direkt in die
  Live-Detailansicht — ganz ohne Chat-Befehl oder curl.

## Aufbau einer Flow-Datei

```yaml
---
name: recherche
beschreibung: Recherchiert ein Thema im Web und fasst es zusammen.
modell: gemma4:26b-q4 # optional, sonst das Standardmodell
argumente:
  - name: thema
    typ: freitext # freitext | datei | auswahl | wissensbasis
    beschreibung: Das zu recherchierende Thema
    pflicht: true
ordner: [/arasul/sandbox/projects/demo] # der ERSTE ist das Arbeitsverzeichnis
werkzeuge: [web_suche, web_lesen, subagent]
rollen:
  - name: leser
    werkzeuge: [web_lesen] # nie mehr als der Flow selbst darf
    ergebnis: { felder: [fakten], max_zeichen: 2000 }
    prompt: Lies die Seite und gib nur die belegten Fakten zurück.
grenzen:
  max_aufrufe: 20 # Subagent-Aufrufe über ALLE Ebenen
  zeitlimit_s: 900
  werkzeug_runden: 10
  max_tiefe: 2 # wie tief Rollen sich verschachteln dürfen (1–5)
---
Recherchiere gründlich zum Thema {{thema}}.
```

Der Markdown-Rumpf ist der Prompt; `{{argument}}`-Platzhalter werden durch die
Werte ersetzt. Jeder Platzhalter braucht ein passendes `argumente`-Feld, sonst
wird die Datei abgewiesen.

### Argument-Typen

| Typ            | Eingabehilfe             | Wirkung                                                   |
| -------------- | ------------------------ | --------------------------------------------------------- |
| `freitext`     | freie Eingabe            | Der Wert wird als Text in den Prompt eingesetzt.          |
| `datei`        | Datei-Picker             | Lädt den **Inhalt** des Dokuments in den Kontext (s. u.). |
| `auswahl`      | feste Liste (`optionen`) | Nur einer der erlaubten Werte ist gültig.                 |
| `wissensbasis` | Sammlungs-Picker         | Grenzt `rag_suche` auf genau diese Sammlung ein.          |

**`datei` lädt den Inhalt.** Ein `datei`-Argument liefert den Dateinamen; der
Runner lädt zusätzlich den indexierten Text des Dokuments (aus der Wissensbasis)
und hängt ihn — auf 16 000 Zeichen gedeckelt — an die Nutzer-Eingabe an. So kann
ein Flow wie `dokument-zusammenfassen` das Dokument tatsächlich zusammenfassen,
ganz ohne Datei-Werkzeug. Ist das Dokument unbekannt oder noch nicht indexiert,
vermerkt der Runner das ehrlich, statt das Modell raten zu lassen.

### Werkzeuge

`dateien_lesen`, `dateien_schreiben`, `dateien_suchen`, `rag_suche`, `web_suche`,
`web_lesen`, `terminal`, `subagent`. Ein Flow bekommt **genau** die deklarierten
Werkzeuge.

- Datei- und Terminal-Werkzeuge (`dateien_lesen`, `dateien_schreiben`,
  `dateien_suchen`, `terminal`) verlangen mindestens einen erlaubten `ordner`;
  der erste ist das Arbeitsverzeichnis. Jeder Zugriff ist symlink-geprüft und
  auf die erlaubten Ordner beschränkt — `../` und Ausbrüche werden abgewiesen.
- Der besondere `ordner`-Wert **`projekt://aktiv`** wird zur Laufzeit in die
  **Projektablage** des aktiven Projekts aufgelöst (`data/projects/<uuid>`,
  siehe [`WORKSPACE.md`](WORKSPACE.md)) — der Flow arbeitet damit im selben
  Ordner wie Explorer und Sandboxes, ohne dass eine UUID in der Flow-Datei
  stünde. Erweiterte Formen: `projekt://aktiv/unter/ordner` (Unterordner, wird
  angelegt) und `projekt://<projekt-uuid>[/unter/ordner]` (bestimmtes Projekt).
- **Ziel-Ordner pro Lauf:** Beim Start (`POST /flows/laeufe` wie auch am
  externen Trigger `POST /api/v1/external/flows/:name/run`) kann `ordner_ziel`
  mitgegeben werden — z. B. der Kundenordner `projekt://aktiv/kunden/mueller`.
  Er wird zum Arbeitsverzeichnis des Laufs (Enddateien landen dort); die im
  Flow deklarierten `ordner` bleiben zusätzlich erlaubt. Nur `projekt://…`-
  Formen sind zulässig, rohe Gerätepfade werden abgewiesen.
- `dateien_suchen` findet Dateien nach Namensmuster (Glob, z. B. `*.md`,
  `**/*.js`) und/oder nach Textinhalt (`text` = Teilzeichenkette, Groß-/
  Kleinschreibung egal, mit Zeilennummer — kein Regulärer Ausdruck, das schützt
  vor ReDoS). Erst damit lohnt sich in großen Ordnern eine höhere `max_tiefe`,
  weil ein Subagent gezielt die relevanten Dateien findet, statt blind zu listen.
  Treffer, Dateizahl und gelesene Bytes pro Datei sind gedeckelt (Kontext-Schutz).
- `terminal` läuft in einem eigenen Sandbox-Container (`arasul-flows-sandbox`),
  nicht im Backend.
- `web_suche` nutzt den lokalen SearXNG-Container (kein externer Schlüssel),
  `web_lesen` liefert bereinigten Text (keinen Browser, keine Screenshots).
- `subagent` verlangt `rollen` und umgekehrt: eine Rolle darf nie mehr Werkzeuge
  haben als der Flow selbst.

### Subagenten und Kontext-Sparsamkeit

Eine Rolle liefert ihr Ergebnis **ausschließlich** in den unter `ergebnis.felder`
deklarierten Feldern, hart auf `max_zeichen` gekappt. Die Rohdaten (ganze
Seiteninhalte, Dateitexte) stehen nur im Lauf-Protokoll, erreichen aber nie den
Orchestrator-Kontext. Das ist der Hebel, mit dem ein kleines lokales Modell wie
ein großes wirkt: gezielt wenig Kontext statt „alles ins Modell".

Im Lauf-Protokoll ist jeder Subagent ein **echter Baum** (Migration 124): sein
Schritt entsteht schon **vor** der Ausführung, und die inneren Werkzeug-Aufrufe
der Rolle werden Kind-Schritte (`flow_run_steps.parent_step_id`) statt eines
Text-Blobs im Rohprotokoll; `modell` hält fest, welches Modell den Schritt
getrieben hat. Live meldet der SSE-Strom jeden Schritt als
`step_start`/`step_end` (die volle Schritt-Zeile, ohne Rohdaten — die lädt die
Ansicht bei Bedarf nach); die früheren `tool_start`/`tool_result`-Ereignisse
sind damit abgelöst. Chat-Lauf-Karte und die Lauf-Detailansicht der
Flow-Zentrale zeigen denselben aufklappbaren Agenten-Baum, live wie nachher.

### Schritt-Kette (deterministische Orchestrierung)

Standardmäßig ist ein Flow **modellgetrieben**: der Rumpf-Prompt sagt dem
Orchestrator-Modell, wann es an welche Rolle delegiert — die Reihenfolge
entscheidet das Modell. Wer die Reihenfolge **fest** vorgeben will (wie ein
n8n-Graph aus geordneten Knoten), deklariert eine optionale `schritte`-Liste:

```yaml
schritte:
  - name: suchen # eindeutiger Schrittname (dient zugleich als {{platzhalter}})
    typ: subagent # an eine deklarierte Rolle delegieren
    rolle: sucher
    auftrag: Finde relevante Seiten zum Thema {{thema}}.
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: |
      Lies die genannten Seiten und gib die Fakten samt Quelle zurück:
      {{suchen}} # die Ausgabe des Schritts „suchen"
    iterationen: 1 # Schritt bis zu N-mal wiederholen (Standard 1)
  - name: aufraeumen
    typ: werkzeug # EIN Werkzeug direkt aufrufen (kein Modell)
    werkzeug: dateien_suchen
    parameter: { muster: '*.tmp' }
```

Der Executor führt die Schritte in **fester Reihenfolge** aus und reicht die
Ausgabe jedes Schritts als `{{schrittname}}` in die nächsten weiter; innerhalb
einer Wiederholung steht die vorige Ausgabe als `{{vorher}}`. Danach
synthetisiert der Rumpf-Prompt die Antwort aus den gesammelten
Schritt-Ausgaben (ein letzter Modell-Aufruf, ohne Werkzeuge). Ein
`subagent`-Schritt braucht das Werkzeug `subagent` und eine passende Rolle; ein
`werkzeug`-Schritt darf nur ein vom Flow freigegebenes Werkzeug nutzen. Leer
gelassen bleibt alles beim modellgetriebenen Verhalten — die Kette ist ein
Angebot, kein Zwang.

**Der Schritt-Editor ist der Standard-Weg, Flows zu bauen** (Interview-Entscheid
2026-07-29: „besser kontrollieren, besser bearbeiten, Ablauf deterministischer").
Im Flow-Editor heißt der Block „Ablauf": Der Umschalter „Feste Reihenfolge"
zeigt die Kette als geordnete Schritt-Karten — je Schritt Name, Art
(Rolle/Werkzeug), bei Rollen-Schritten Auftrag plus die Rolle **inline**
(Prompt, Werkzeuge, Ergebnis-Vertrag), bei Werkzeug-Schritten Werkzeug-Auswahl
und Parameter als `schluessel: wert`-Zeilen, dazu die Durchläufe (1–10).
Schritte lassen sich hinzufügen, entfernen und per Hoch/Runter-Knöpfen
umsortieren; die Datei-Vorschau zeigt die entstehende `schritte`-Liste im
Frontmatter. Eine niedergeschriebene Kette macht Läufe nachvollziehbar und —
siehe unten — ab einem Fehler wiederholbar.

**Fehlgeschlagene Läufe ab dem Fehler wiederholen.** Scheitert ein Lauf eines
Flows **mit** Schritt-Kette, bietet die Flow-Zentrale am Lauf den Knopf
„Ab Fehler wiederholen" (`POST /api/flows/laeufe/:id/wiederholen`). Es startet
ein **neuer** Lauf mit denselben Argumenten; die Ausgaben der erfolgreichen
Schritte des alten Laufs werden übernommen (im Protokoll als Schritte mit dem
Vermerk „übernommen aus Lauf N") und erst ab dem ersten gescheiterten Schritt
wird wieder echt ausgeführt — teure, gelungene Vorarbeit (Recherche, gelesene
Seiten) geht nicht verloren. Wurde die Flow-Definition zwischenzeitlich
geändert, übernimmt die Wiederholung nur die noch passenden Schritte und führt
den Rest neu aus.

### Grenzen (Notbremsen)

`max_aufrufe` (Subagent-Aufrufe über alle Ebenen), `zeitlimit_s`,
`werkzeug_runden` und `max_tiefe` bremsen einen Lauf. `max_tiefe` (1–5, Standard 2) bestimmt, wie tief sich Subagent-Rollen gegenseitig aufrufen dürfen
(Orchestrator = Ebene 0) — höher setzen, wenn ein komplexer Flow mehrstufig
verschachteln soll; die GPU arbeitet sequenziell, jede Ebene kostet Laufzeit.
Wird eine Grenze erreicht, endet der Lauf sauber und nennt Grund und bisheriges
Ergebnis.

## Auslöser — Flows von außen starten

Ein Flow muss nicht von Hand im Chat gestartet werden:

- **HTTP direkt.** `POST /api/v1/external/flows/:name/run` (API-Key mit Scope
  `flow:run`) startet einen Flow sofort und gibt das Ergebnis zurück (oder
  `202` mit der Lauf-ID bei `wait_for_result: false`). So triggert n8n einen
  Flow und liest die Antwort. Die Flow-Zentrale zeigt die Trigger-URL samt
  kopierbarem curl-Beispiel und verwaltet die API-Schlüssel.
- **Zeitpläne über n8n.** Wiederkehrende Starts (Cron) baut man als
  n8n-Workflow (Schedule-Trigger → HTTP-Request auf die Trigger-URL). Der
  frühere eingebaute Zeitplan-/Ereignis-Mechanismus (`flow_schedules`) wurde
  am 2026-07-28 ersatzlos entfernt (Migration 123) — n8n deckt das ab.

## Sicherheit — bewusst ohne Rückfrage

Es gibt **kein Rechtekonzept**: Der (einzige) Admin darf jeden Flow anlegen und
ihm jedes Werkzeug geben, inklusive Terminal und Web-Zugriff. Flows laufen
**autonom ohne Bestätigungsdialoge** — gebremst wird nur durch die Grenzen und
den Abbrechen-Knopf. Die Gegenleistung ist die lückenlose Änderungs-Übersicht am
Ende jedes Laufs mit Schreibzugriff: Du siehst hinterher, was passiert ist.

## Beispiele als Startpunkt

Ab Werk liegt **kein** Flow auf dem Gerät (Plan 023, Entscheidung E6). Die
Flow-Liste eines neuen Geräts ist leer und zeigt einen Einstieg.

Fünf Vorlagen liefert das Backend trotzdem mit, aber als Angebot statt als
Lieferumfang: Der Anlege-Dialog zeigt sie als Startpunkte, ein Klick füllt das
Formular. Angelegt wird der Flow erst beim Speichern, und dann als deiner.

| Vorlage                   | Führt vor          | Kern                                                                           |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `dokument-zusammenfassen` | Datei-Argument     | Ein `datei`-Argument liefert den Dokument-Inhalt; kein Werkzeug nötig.         |
| `wissen`                  | RAG mit Quellen    | `rag_suche` auf eine gewählte Wissensbasis, Antwort mit Quellen.               |
| `recherche`               | Subagenten + Web   | `sucher` / `leser` / `pruefer` / `synthese` über `web_suche` und `web_lesen`.  |
| `erweiterung`             | Terminal + Dateien | Legt in der Erweiterungs-Werkstatt ein Erweiterungs-Gerüst an (App/Flow/Tool). |
| `execute`                 | Terminal-Testlauf  | Prüft Manifest und Syntax der gebauten Erweiterung und meldet ehrlich zurück.  |

`erweiterung` und `execute` gehören zum **Erweiterungs-Baukasten**
([`EXTENSIONS.md`](EXTENSIONS.md)); sie arbeiten im Werkstatt-Ordner
`/arasul/sandbox/projects/werkstatt`.

Die Dateien liegen tracked im Backend-Image
(`services/flows/beispiele/*.md`) und werden über
`GET /api/flows/beispiele` beziehungsweise `GET /api/flows/beispiele/:name`
gelesen. Bis zum 19.08.2026 kopierte der Start sie in den Flow-Ordner; das ist
mit Plan 023 B4 entfallen. Der Grund: ein Werksreset stellt den
Auslieferungszustand her, und der nächste Start hätte ihn wieder kaputt gemacht.

## Verwandte Dokumentation

- API: [`API_REFERENCE.md`](../api/API_REFERENCE.md) → Abschnitt **Flows**
  (Routen, Datei-Format, `verfuegbar`-Flag, `datei`-Inhaltseinspeisung).
- Umgebungsvariablen: [`ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md)
  → `FLOWS_DIR`, `FLOWS_BACKUP_DIR`, `FLOW_LLM_TIMEOUT_MS`.
- Datenbank: [`DATABASE_SCHEMA.md`](../api/DATABASE_SCHEMA.md) → `flow_runs`,
  `flow_run_steps`.
