# Flows

> **Stand 26.08.2026, Phase B4 des Umbaus:** Die Oberfläche zu Flows ist mit
> B2 (Slash-Menü im Chat) und B3 (Flow-Editor, Flow-Übersicht, Flow-Zentrale,
> Lauf-Detailansicht) aus dem Frontend gefallen. Mit B4 sind die
> Argumenttypen `datei`, `wissensbasis` und `ordner`, die Werkzeuge
> `rag_suche`, `terminal` und `rechnung_erstellen`, projektgebundene Flows
> und die `projekt://`-Ordner gegangen, weil Wissensbasis, Projekte und
> Sandbox nicht mehr existieren. Diese Seite beschreibt, was die Engine heute
> tut; bedient wird sie über die API. Wie Läufe im Zielbild gelesen werden,
> legt D4 fest.

Ein **Flow** ist eine vorkonfigurierte Aufgabe, die das lokale Modell mit
Werkzeugen ausführt. Technisch ist ein Flow eine Markdown-Datei mit
YAML-Kopf unter `data/flows/` (im Container `/arasul/flows`, siehe
`FLOWS_DIR`). Die Datei ist die Wahrheit; die Routen unter `/api/flows`
lesen und schreiben sie und prüfen jede Änderung gegen das Schema, bevor sie
auf die Platte kommt.

## Aufbau einer Flow-Datei

```yaml
---
name: recherche
beschreibung: Recherchiert ein Thema im Web und fasst es zusammen.
modell: gemma4:26b-q4 # optional, sonst das Standardmodell
argumente:
  - name: thema
    typ: freitext # freitext | auswahl
    beschreibung: Das zu recherchierende Thema
    pflicht: true
ordner: [/arasul/flows/arbeit/demo] # absolute Pfade im Backend-Container; der ERSTE ist das Arbeitsverzeichnis
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
  max_tiefe: 2 # wie tief Rollen sich verschachteln dürfen (1 bis 5)
---
Recherchiere gründlich zum Thema {{thema}}.
```

Der Markdown-Rumpf ist der Prompt; `{{argument}}`-Platzhalter werden durch die
Werte ersetzt. Jeder Platzhalter braucht ein passendes `argumente`-Feld, sonst
wird die Datei abgewiesen. Flow- und Argumentnamen sind eng gefasst:
Kleinbuchstaben, Ziffern, Bindestrich (der Flow-Name ist zugleich der
Dateiname).

### Argument-Typen

| Typ        | Wirkung                                          |
| ---------- | ------------------------------------------------ |
| `freitext` | Der Wert wird als Text in den Prompt eingesetzt. |
| `auswahl`  | Nur einer der Werte aus `optionen` ist gültig.   |

`standard` belegt ein Argument vor und schließt `pflicht: true` aus.

### Werkzeuge

`dateien_lesen`, `dateien_schreiben`, `dateien_bearbeiten`,
`dateien_anhaengen`, `dateien_suchen`, `symbol_suche`, `web_suche`,
`web_lesen`, `subagent`, `frage_nutzer`. Ein Flow bekommt **genau** die
deklarierten Werkzeuge; ein unbekannter Name ist ein Schreibfehler und wird
beim Speichern abgewiesen.

- Die Datei-Werkzeuge und `symbol_suche` verlangen mindestens einen erlaubten
  `ordner`; der erste ist das Arbeitsverzeichnis, relative Pfade lösen sich
  dagegen auf. Jeder Zugriff ist symlink-geprüft und auf die erlaubten Ordner
  beschränkt, `../` und Ausbrüche werden abgewiesen.
- `dateien_suchen` findet Dateien nach Namensmuster (Glob, z. B. `*.md`,
  `**/*.js`) und/oder nach Textinhalt (`text` = Teilzeichenkette, Groß-/
  Kleinschreibung egal, mit Zeilennummer; kein Regulärer Ausdruck, das schützt
  vor ReDoS). Treffer, Dateizahl und gelesene Bytes je Datei sind gedeckelt.
- `dateien_bearbeiten` ersetzt genau einen Textblock (Suchen/Ersetzen,
  `alle: true` für alle Vorkommen); `dateien_anhaengen` hängt einen Abschnitt
  ans Ende einer Datei (legt sie an, Deckel 16 MB). Damit entstehen lange
  Dokumente abschnittsweise statt in einem riesigen Schreibvorgang.
- `symbol_suche` findet Definitionen und Verwendungen in Quelltext innerhalb
  der erlaubten Ordner.
- `web_suche` nutzt den lokalen SearXNG-Container (kein externer Schlüssel),
  `web_lesen` liefert bereinigten Text (kein Browser, keine Screenshots).
- `subagent` verlangt `rollen` und umgekehrt: eine Rolle darf nie mehr
  Werkzeuge haben als der Flow selbst.
- `frage_nutzer` gibt es nur in der Betriebsart `rueckfragen` (unten).

### Subagenten und Kontext-Sparsamkeit

Eine Rolle liefert ihr Ergebnis **ausschließlich** in den unter `ergebnis.felder`
deklarierten Feldern, hart auf `max_zeichen` gekappt. Die Rohdaten (ganze
Seiteninhalte, Dateitexte) stehen nur im Lauf-Protokoll, erreichen aber nie den
Orchestrator-Kontext. Das ist der Hebel, mit dem ein kleines lokales Modell wie
ein großes wirkt: gezielt wenig Kontext statt „alles ins Modell".

Im Lauf-Protokoll ist jeder Subagent ein **echter Baum** (Migration 124): sein
Schritt entsteht schon **vor** der Ausführung, und die inneren Werkzeug-Aufrufe
der Rolle werden Kind-Schritte (`flow_run_steps.parent_step_id`); `modell` hält
fest, welches Modell den Schritt getrieben hat. Live meldet der SSE-Strom jeden
Schritt als `step_start`/`step_end` (die volle Schritt-Zeile, ohne Rohdaten;
die lädt `?raw=1` nach).

**`runden` je Rolle.** Eine Rolle erbt ohne eigene Angabe die
`werkzeug_runden` des Flows, und zwar bei **jeder** Delegation. Mit
`runden: <1..20>` bekommt sie ein eigenes, kleineres Budget; größer als das
des Flows wird es nie. Am 22.08.2026 auf dem Orin gemessen: die Rolle
`sucher` des `recherche`-Flows erbte zwölf Runden und rief `web_suche`
26-mal auf, obwohl ihr Prompt drei bis fünf URLs verlangt. Eine Rolle, die
genau eine Suche machen soll, bekommt `runden: 1`.

### Schritt-Kette (deterministische Orchestrierung)

Standardmäßig ist ein Flow **modellgetrieben**: der Rumpf-Prompt sagt dem
Orchestrator-Modell, wann es an welche Rolle delegiert. Wer die Reihenfolge
**fest** vorgeben will, deklariert eine optionale `schritte`-Liste:

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
Schritt-Ausgaben. Ein `subagent`-Schritt braucht das Werkzeug `subagent` und
eine passende Rolle; ein `werkzeug`-Schritt darf nur ein vom Flow freigegebenes
Werkzeug nutzen. Ein Schritt kann mit `wiederhole_ueber: <name>` über eine
Liste laufen (JSON-Array oder eine Zeile je Element, höchstens 50), mit
`{{element}}`, `{{index}}`, `{{anzahl}}` im Auftrag; `modell` je Schritt
überstimmt das Flow-Modell.

**Fehlgeschlagene Läufe ab dem Fehler wiederholen.** Scheitert ein Lauf eines
Flows **mit** Schritt-Kette, startet `POST /api/flows/laeufe/:id/wiederholen`
einen **neuen** Lauf mit denselben Argumenten; die Ausgaben der erfolgreichen
Schritte des alten Laufs werden übernommen (im Protokoll als Schritte mit dem
Vermerk „übernommen aus Lauf N") und erst ab dem ersten gescheiterten Schritt
wird wieder echt ausgeführt.

### Grenzen (Notbremsen)

`max_aufrufe` (Subagent-Aufrufe über alle Ebenen), `zeitlimit_s`,
`werkzeug_runden` und `max_tiefe` bremsen einen Lauf. `max_tiefe` (1 bis 5,
Standard 2) bestimmt, wie tief sich Subagent-Rollen gegenseitig aufrufen
dürfen (Orchestrator = Ebene 0); die GPU arbeitet sequenziell, jede Ebene
kostet Laufzeit. Wird eine Grenze erreicht, endet der Lauf sauber und nennt
Grund und bisheriges Ergebnis.

## Läufe

Ein Lauf startet über `POST /api/flows/laeufe` (`{ flow, args,
conversation_id? }`) und antwortet sofort mit `202 { runId }`; er läuft
serverseitig weiter, egal ob ein Client zusieht. `GET /api/flows/laeufe/:id`
liefert Lauf und Schritte, `GET /api/flows/laeufe/:id/stream` den SSE-Strom
(erst der gespeicherte Verlauf, dann live), `POST …/abbrechen` stoppt ihn
wirklich. Läufe liegen in `flow_runs` und `flow_run_steps`, gehören ihrem
Besitzer (fremde Läufe sind ein `404`) und tragen Status `laeuft | fertig |
fehler | abgebrochen`. Ein Neustart des Backends setzt jeden noch laufenden
Lauf auf `fehler`.

Jeder Lauf, der Dateien ändern **kann** (schreibendes Datei-Werkzeug oder
Ausgabe-Dokument), wird vorher und nachher abgezogen; der Unterschied steht
als `flow_runs.changes` am Lauf (`[{ pfad, art: neu|geaendert|geloescht,
vorher, nachher, gekuerzt, hinweis }]`) und kommt live als Frame
`aenderungen`. Das ist die Gegenleistung dafür, dass Flows **ohne
Bestätigungsdialoge** laufen: Du siehst hinterher, was passiert ist.

## Ausgabe-Dokumente und Stilvorlagen

`ausgabe` erklärt, was am Ende herauskommt: `format` (`keins | markdown |
pdf | docx`), `dateiname` (Muster mit `{{argument}}` und `{{datum}}`),
`vorlage` (eine hochgeladene Stilvorlage), `laenge` (`kurz | mittel |
ausfuehrlich` oder `wortzahl`), `sprache`, `tonalitaet`, `gliederung`. Bei
einem Dokumentformat liefert das Modell den vollständigen Inhalt als Markdown,
der Runner rendert ihn (pdfkit, `docx`) und schreibt ihn kollisionsfrei ins
Arbeitsverzeichnis (Schritt `dokument_ausgabe`). Ein Dokument-Flow braucht
deshalb einen deklarierten `ordner`.

Zwischen Entwurf und Ausgabe steht ein fester **Prüfschritt**: deterministische
Checks (Platzhalter-Reste, offene `[Stellen]`, Gliederung, Ziel-Länge), eine
Prüfrunde des Modells gegen Auftrag und Vorgaben, höchstens eine Korrekturrunde.
Getroffene Annahmen landen als `flow_runs.annahmen` am Lauf und im SSE-Strom
als Frame `annahmen`.

**Stilvorlagen** (`/api/flows/vorlagen`) liegen in `FLOWS_DIR/vorlagen/`
(im Backup enthalten). Bei `.pdf`/`.docx` wird der Text **beim Hochladen**
über den Document-Indexer (`POST /extract-text`) gezogen und als
`<name>.extrahiert.txt` daneben abgelegt; eine Vorlage ohne lesbaren Text wird
mit `400` abgewiesen, ein Lauf hängt damit nie am Indexer. Zur Laufzeit geht
der Text (gedeckelt auf 8 000 Zeichen) als Stil- und Strukturblock in den
Prompt; eine gelöschte Vorlage wird still übersprungen.

## Auslöser: Flows von außen starten

- **HTTP direkt.** `POST /api/v1/external/flows/:name/run` (API-Key mit Scope
  `flow:run`, Body `{ args?, wait_for_result?, timeout_seconds? }`) startet
  einen Flow und gibt das Ergebnis zurück (oder `202` mit der Lauf-ID bei
  `wait_for_result: false`). So triggert n8n einen Flow und liest die Antwort.
- **Zeitpläne über n8n.** Wiederkehrende Starts (Cron) baut man als
  n8n-Workflow (Schedule-Trigger, dann HTTP-Request auf die Trigger-URL). Der
  frühere eingebaute Zeitplan-Mechanismus (`flow_schedules`) wurde am
  2026-07-28 ersatzlos entfernt (Migration 123).

## Zwei Betriebsarten (Plan 023 I2)

Ein Flow erklärt in seiner Datei, ob er zwischendurch fragen darf:

```yaml
betriebsart: rueckfragen # oder gar nichts, dann gilt "autonom"
```

|                            |                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `autonom` (Voreinstellung) | Er fragt **nie**. Fehlt eine Angabe, trifft er eine Annahme und schreibt sie mit (Annahmen-Protokoll oben) |
| `rueckfragen`              | Er hält an, wenn eine Entscheidung den weiteren Ablauf ändert                                              |

Gefragt wird über das Werkzeug `frage_nutzer`. Es liegt **nur** in der
Betriebsart `rueckfragen` im Werkzeugkasten, nicht als gesperrte Variante,
sondern gar nicht. Ein Flow, der `frage_nutzer` deklariert, ohne die
Betriebsart zu setzen, wird beim Speichern abgewiesen. Die offene Frage eines
Laufs liefert `GET /api/flows/laeufe/:id/frage` (bis zu vier Optionen, die
erste ist die Empfehlung, immer ein Freitext), beantwortet wird sie mit
`POST /api/flows/laeufe/:id/antwort`. Antwortet niemand, gilt nach
`FLOW_RUECKFRAGE_TIMEOUT_MS` die erste Empfehlung, und der Lauf schreibt das
mit. Das Warten kostet keine GPU: die Sperre umschließt einen einzelnen
Modellaufruf, nicht den ganzen Lauf.

## Beispiele als Startpunkt

Ab Werk liegt **kein** Flow auf dem Gerät (Plan 023, Entscheidung E6). Das
Backend liefert eine Vorlage als Angebot mit: `recherche` (Subagenten
`sucher` / `leser` / `pruefer` / `synthese` über `web_suche` und
`web_lesen`). Sie liegt tracked im Backend-Image
(`services/flows/beispiele/recherche.md`) und wird über
`GET /api/flows/beispiele` und `GET /api/flows/beispiele/:name` gelesen;
angelegt wird sie erst durch `POST /api/flows`. Die früheren Vorlagen
`dokument-zusammenfassen`, `wissen`, `angebot`, `erweiterung` und `execute`
brauchten Wissensbasis, Projekte oder Sandbox und sind mit B4 gefallen.

## Verwandte Dokumentation

- API: [`API_REFERENCE.md`](../api/API_REFERENCE.md), Abschnitt **Flows**
  (Routen, Datei-Format, `verfuegbar`-Flag).
- Umgebungsvariablen: [`ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md),
  Abschnitte **Werkzeug-Schleife** und **Flows**.
- Datenbank: [`DATABASE_SCHEMA.md`](../api/DATABASE_SCHEMA.md), Tabellen
  `flow_runs` und `flow_run_steps`.
