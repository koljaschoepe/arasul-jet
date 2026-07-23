# Skills

Ein **Skill** ist eine vorkonfigurierte Aufgabe, die im Chat per `/name`
aufgerufen wird — modelliert nach Claude Code. Technisch ist ein Skill eine
Markdown-Datei mit YAML-Kopf unter `data/skills/` (im Container
`/arasul/skills`, siehe `SKILLS_DIR`). Die Datei ist die Wahrheit; der
Editor erzeugt sie nur.

Skills ersetzen den früheren Agenten- und Fluss-Layer (Plan 011). Statt
Kästchen zu verbinden, baut man eine spezialisierte Aufgabe einmal und ruft sie
im Chat mit `/` ab.

## Im Chat benutzen

- `/` öffnet ein Menü aller Skills. Tippen filtert; das Stift-Symbol bearbeitet,
  `/neuer-skill` legt einen an. Bearbeiten und Anlegen öffnen den **zentralen
  Skill-Editor** als eigenen Mitte-Tab (kein Popup mehr, Plan 012 Phase D);
  `/skills` öffnet die **Skill-Übersicht** in der linken Sidebar (Activity-Bar-
  Ansicht »Skills«), aus der ein Klick denselben Editor-Tab öffnet.
- Der Editor zeigt links das Formular, rechts eine Live-Vorschau mit zwei
  Ansichten: die **erzeugte Datei** und den **aufgelösten Laufzeit-Prompt** —
  also genau das, was der Runner dem Modell gibt (Prompt mit eingesetzten
  Beispiel-Argumenten; Werkzeuge/Ordner/Rollen werden strukturell daneben
  übergeben, nicht in den Prompt-Text gefaltet).
- Nach der Auswahl stehen die erwarteten Argumente grau hinter dem Befehl —
  Pflicht in `<spitzen>`, optional in `[eckigen]` Klammern. Tippen überschreibt
  das aktive Argument, Tab springt zum nächsten.
- Nicht-Freitext-Argumente öffnen eine Auswahl: **Datei** (Dokumente aus der
  Wissensbasis), **feste Liste** (die `optionen` des Skills), **Wissensbasis**
  (die vorhandenen Sammlungen).
- Ein Lauf erscheint als Karte im Verlauf: jeder Werkzeug- und Subagent-Schritt
  mit Dauer und Status, am Ende die Antwort und — bei Schreibzugriffen — eine
  Übersicht geänderter Dateien (neu / geändert / gelöscht, mit Vorher/Nachher).
- Läufe leben serverseitig: Tab schließen und später öffnen zeigt den aktuellen
  Stand bzw. das fertige Ergebnis. Der Abbrechen-Knopf stoppt einen Lauf
  innerhalb weniger Sekunden.

## Aufbau einer Skill-Datei

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
    werkzeuge: [web_lesen] # nie mehr als der Skill selbst darf
    ergebnis: { felder: [fakten], max_zeichen: 2000 }
    prompt: Lies die Seite und gib nur die belegten Fakten zurück.
grenzen:
  max_aufrufe: 20 # Subagent-Aufrufe über ALLE Ebenen
  zeitlimit_s: 900
  werkzeug_runden: 10
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
ein Skill wie `dokument-zusammenfassen` das Dokument tatsächlich zusammenfassen,
ganz ohne Datei-Werkzeug. Ist das Dokument unbekannt oder noch nicht indexiert,
vermerkt der Runner das ehrlich, statt das Modell raten zu lassen.

### Werkzeuge

`dateien_lesen`, `dateien_schreiben`, `rag_suche`, `web_suche`, `web_lesen`,
`terminal`, `subagent`. Ein Skill bekommt **genau** die deklarierten Werkzeuge.

- Datei- und Terminal-Werkzeuge verlangen mindestens einen erlaubten `ordner`;
  der erste ist das Arbeitsverzeichnis. Jeder Zugriff ist symlink-geprüft und
  auf die erlaubten Ordner beschränkt — `../` und Ausbrüche werden abgewiesen.
- `terminal` läuft in einem eigenen Sandbox-Container (`arasul-skills-sandbox`),
  nicht im Backend.
- `web_suche` nutzt den lokalen SearXNG-Container (kein externer Schlüssel),
  `web_lesen` liefert bereinigten Text (keinen Browser, keine Screenshots).
- `subagent` verlangt `rollen` und umgekehrt: eine Rolle darf nie mehr Werkzeuge
  haben als der Skill selbst.

### Subagenten und Kontext-Sparsamkeit

Eine Rolle liefert ihr Ergebnis **ausschließlich** in den unter `ergebnis.felder`
deklarierten Feldern, hart auf `max_zeichen` gekappt. Die Rohdaten (ganze
Seiteninhalte, Dateitexte) stehen nur im Lauf-Protokoll, erreichen aber nie den
Orchestrator-Kontext. Das ist der Hebel, mit dem ein kleines lokales Modell wie
ein großes wirkt: gezielt wenig Kontext statt „alles ins Modell".

### Grenzen (Notbremsen)

`max_aufrufe` (Subagent-Aufrufe über alle Ebenen), `zeitlimit_s` und
`werkzeug_runden` bremsen einen Lauf. Wird eine Grenze erreicht, endet der Lauf
sauber und nennt Grund und bisheriges Ergebnis.

## Sicherheit — bewusst ohne Rückfrage

Es gibt **kein Rechtekonzept**: Der (einzige) Admin darf jeden Skill anlegen und
ihm jedes Werkzeug geben, inklusive Terminal und Web-Zugriff. Skills laufen
**autonom ohne Bestätigungsdialoge** — gebremst wird nur durch die Grenzen und
den Abbrechen-Knopf. Die Gegenleistung ist die lückenlose Änderungs-Übersicht am
Ende jedes Laufs mit Schreibzugriff: Du siehst hinterher, was passiert ist.

## Mitgelieferte Beispiel-Skills

Bei der Einrichtung liegen fünf Skills bereit, die je eine Fähigkeit vorführen —
alle sind bearbeit- und löschbar:

| Skill                     | Führt vor          | Kern                                                                           |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `dokument-zusammenfassen` | Datei-Argument     | Ein `datei`-Argument liefert den Dokument-Inhalt; kein Werkzeug nötig.         |
| `wissen`                  | RAG mit Quellen    | `rag_suche` auf eine gewählte Wissensbasis, Antwort mit Quellen.               |
| `recherche`               | Subagenten + Web   | `sucher` / `leser` / `pruefer` / `synthese` über `web_suche` und `web_lesen`.  |
| `erweiterung`             | Terminal + Dateien | Legt in der Erweiterungs-Werkstatt ein Erweiterungs-Gerüst an (App/Flow/Tool). |
| `execute`                 | Terminal-Testlauf  | Prüft Manifest und Syntax der gebauten Erweiterung und meldet ehrlich zurück.  |

`erweiterung` und `execute` gehören zum **Erweiterungs-Baukasten**
([`EXTENSIONS.md`](EXTENSIONS.md)); sie arbeiten im Werkstatt-Ordner
`/arasul/sandbox/projects/werkstatt`.

Die Vorlagen liegen tracked im Backend-Image
(`services/skills/beispiele/*.md`) und werden beim Start in den Skill-Ordner
(`SKILLS_DIR`) kopiert — aber **nur, wenn dort noch keine gleichnamige Datei
liegt**. So überschreibt ein Update nie eine von dir bearbeitete oder bewusst
gelöschte Beispiel-Datei. Danach sind sie ganz normale Skills unter
`data/skills/` und dienen als Vorlage für eigene.

## Verwandte Dokumentation

- API: [`API_REFERENCE.md`](../api/API_REFERENCE.md) → Abschnitt **Skills**
  (Routen, Datei-Format, `verfuegbar`-Flag, `datei`-Inhaltseinspeisung).
- Umgebungsvariablen: [`ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md)
  → `SKILLS_DIR`, `SKILLS_BACKUP_DIR`, `SKILL_LLM_TIMEOUT_MS`.
- Datenbank: [`DATABASE_SCHEMA.md`](../api/DATABASE_SCHEMA.md) → `skill_runs`,
  `skill_run_steps`.
