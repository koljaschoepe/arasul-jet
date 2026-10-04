# Flows

> Diese Seite beschreibt, was die Flow-Engine tut. Bedient wird sie über die
> API; eine Oberfläche dafür gibt es seit dem Umbau vom 26.08.2026 nicht. Wie
> Läufe im Zielbild gelesen werden, legt Phase D4 des Überordner-Plans fest.

Ein **Flow** ist eine vorkonfigurierte Aufgabe, die das lokale Modell mit
Werkzeugen ausführt. Technisch ist ein Flow eine Markdown-Datei mit
YAML-Kopf. Seit Phase C6 gibt es davon **zwei Herkünfte**, und der Rest dieser
Seite gilt für beide:

| Herkunft                 | Wo die Datei liegt                           | Wem sie gehört                               |
| ------------------------ | -------------------------------------------- | -------------------------------------------- |
| **Plattform** (Plan 011) | `data/flows/` (im Container `/arasul/flows`) | dem Betreiber; die Routen unter `/api/flows` |
| **App** (Phase C6)       | im App-Paket unter `flows/*.md`              | dem Partner, der die App gebaut hat          |

Für die Flows der Plattform ist die **Datei** die Wahrheit; die Routen unter
`/api/flows` lesen und schreiben sie und prüfen jede Änderung gegen das
Schema, bevor sie auf die Platte kommt.

Für die Flows einer App ist die **registrierte Zeile** die Wahrheit
(`app_flows`, je App und Stand beim Einspielen angelegt) — sonst änderte sich
der Flow eines laufenden Livestandes, sobald jemand unter dem Versionsordner
etwas editiert. Sie werden über `/api/flows` weder gelesen noch geschrieben;
was ein Administrator daran ändern darf, ist das **Modell** — eines vom Gerät
oder, seit Phase D4, eines bei einem Anbieter draußen —, und das steht in
`flow_settings`. Alles Weitere dazu:
[`APPS.md`](APPS.md#die-flows-einer-app-phase-c6) und
[`APP-PAKET.md`](APP-PAKET.md).

## Aufbau einer Flow-Datei

```yaml
---
name: zusammenfassung
beschreibung: Liest die Dateien im Arbeitsordner und fasst sie zu einem Thema zusammen.
modell: gemma4:26b-q4 # optional, sonst das Standardmodell
argumente:
  - name: thema
    typ: freitext # freitext | auswahl
    beschreibung: Das Thema, unter dem zusammengefasst wird
    pflicht: true
ordner: [/arasul/flows/arbeit/demo] # absolute Pfade im Backend-Container; der ERSTE ist das Arbeitsverzeichnis
werkzeuge: [dateien_lesen, dateien_suchen, subagent]
rollen:
  - name: leser
    werkzeuge: [dateien_lesen] # nie mehr als der Flow selbst darf
    ergebnis: { felder: [fakten], max_zeichen: 2000 }
    prompt: Lies die Datei und gib nur die belegten Fakten zurück.
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
`dateien_anhaengen`, `dateien_suchen`, `symbol_suche`, `subagent`,
`frage_nutzer`, `freigabe_anfordern`. Ein Flow bekommt **genau** die
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
- `subagent` verlangt `rollen` und umgekehrt: eine Rolle darf nie mehr
  Werkzeuge haben als der Flow selbst.
- `frage_nutzer` gibt es nur in der Betriebsart `rueckfragen` (unten).
- `freigabe_anfordern` hält den Lauf an, bis ein Mensch entscheidet (unten).
  Es gibt das Werkzeug in **jeder** Betriebsart — anders als die Rückfrage.

### Subagenten und Kontext-Sparsamkeit

Eine Rolle liefert ihr Ergebnis **ausschließlich** in den unter `ergebnis.felder`
deklarierten Feldern, hart auf `max_zeichen` gekappt. Die Rohdaten (ganze
Dateitexte) stehen nur im Lauf-Protokoll, erreichen aber nie den
Orchestrator-Kontext. Das ist der Hebel, mit dem ein kleines lokales Modell wie
ein großes wirkt: gezielt wenig Kontext statt „alles ins Modell".

Im Lauf-Protokoll ist jeder Subagent ein **echter Baum** (Migration 124): sein
Schritt entsteht schon **vor** der Ausführung, und die inneren Werkzeug-Aufrufe
der Rolle werden Kind-Schritte (`flow_run_steps.parent_step_id`); `modell` hält
fest, welches Modell den Schritt getrieben hat. Live meldet der SSE-Strom jeden
Schritt als `step_start`/`step_end` (die volle Schritt-Zeile, ohne Rohdaten;
die lädt `?raw=1` nach).

### Der Gedankengang (Phase D4)

Ruft das Modell ein Werkzeug auf, sagt es fast immer auch, **warum** („Ich hole
zuerst den Bericht der Woche, dann …"). Bis D4 fiel dieser Text weg: die
Werkzeug-Schleife meldete nur die letzte Runde, die ohne Werkzeug-Aufruf. Im
Protokoll stand damit eine Kette von Handgriffen ohne einen Satz dazu, und die
Frage „warum hat der Flow das getan" ließ sich nicht beantworten.

Seit D4 wird er als Schritt der Art `modell` mitgeschrieben (die Spalte kennt
Migration 112 seit jeher) und im Ereignisstrom als `gedanke` gemeldet — ein
eigenes Ereignis und nicht `text`: `text` ist die **Antwort** des Laufs, der
Gedankengang ist sein Weg dorthin. Gelesen wird er in der App-Ansicht
(Einstellungen → Apps → Läufe).

Er entsteht nur, wo das Modell überhaupt frei entscheidet. Ein Flow mit einer
festen `schritte`-Kette hat keinen; dort steht die Reihenfolge in der Datei.

### Jeder Modellschritt im Protokoll der Modellaufrufe (J35, 26.09.2026)

Der Lauf zeigt, **was** ein Flow getan hat. Nachweisen muss eine Kanzlei aber
jeden Vorschlag eines Modells an **einer** Stelle, auch den Satz, den ein Flow
nach einer Freigabe schreibt — und das ist `ki_aufrufe`, wo seit Migration 187
schon jede Auslesung steht. Seit Migration 189 geht jede Runde der
Werkzeug-Schleife (Orchestrator, Rolle, Prüfschritt, Synthese) über
`kiProtokoll.flowSchritt` (`toolLoop.modellFragen`): eine Zeile mit App,
Stand, dem **Einreicher** aus dem Start des Laufs, Modell (extern als
`anbieter/modell`), Dauer, Ausgang, `lauf_id` und dem sha256 dessen, was das
Modell sagte (mit einem Werkzeugaufruf: Text und Aufrufe zusammen). `endpunkt`
ist `flows/<name>`. Ein Flow der Plattform steht mit dem Menschen da, dem der
Lauf gehört. Scheitert die Zeile, läuft der Flow weiter — anders als bei den
Wegen der Schnittstelle, wo ohne Zeile kein Aufruf stattfindet: ein halber
Lauf wäre der größere Schaden. Gelesen wird es unter Einstellungen → Apps →
Modellaufrufe, mit „Lauf N".

**`runden` je Rolle.** Eine Rolle erbt ohne eigene Angabe die
`werkzeug_runden` des Flows, und zwar bei **jeder** Delegation. Mit
`runden: <1..20>` bekommt sie ein eigenes, kleineres Budget; größer als das
des Flows wird es nie. Am 22.08.2026 auf dem Orin gemessen: eine Such-Rolle
erbte zwölf Runden und rief ihr Suchwerkzeug 26-mal auf, obwohl ihr Prompt
drei bis fünf Treffer verlangte. Eine Rolle, die genau eine Suche machen
soll, bekommt `runden: 1`.

### Schritt-Kette (deterministische Orchestrierung)

Standardmäßig ist ein Flow **modellgetrieben**: der Rumpf-Prompt sagt dem
Orchestrator-Modell, wann es an welche Rolle delegiert. Wer die Reihenfolge
**fest** vorgeben will, deklariert eine optionale `schritte`-Liste:

```yaml
schritte:
  - name: suchen # eindeutiger Schrittname (dient zugleich als {{platzhalter}})
    typ: subagent # an eine deklarierte Rolle delegieren
    rolle: sucher
    auftrag: Finde die Dateien zum Thema {{thema}}.
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: |
      Lies die genannten Dateien und gib die Fakten samt Fundstelle zurück:
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
fehler | abgebrochen`. Ein Neustart des Backends setzt jeden noch **laufenden**
Lauf auf `fehler`; ein Lauf, der auf eine Freigabe **wartet**, bleibt stehen
(Abschnitt Freigaben).

Seit Phase C6 trägt ein Lauf zusätzlich `app_id` und `stand` — beide `NULL`
bei einem Flow der Plattform. Sie sind **kein** Fremdschlüssel, mit derselben
Begründung, mit der `flow_name` seit jeher keiner ist: ein Lauf ist Geschichte
und soll lesbar bleiben, wenn die App längst weg ist. Ein Schlüssel, der einer
App gehört, sieht auch nur die Läufe **dieser** App in **diesem** Stand.

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
  `wait_for_result: false`). So triggert ein Fremdsystem einen Flow und liest
  die Antwort.
- **Zeitpläne.** Wiederkehrende Starts (Cron) kommen von außen über dieselbe
  Trigger-URL; das Gerät hat keinen eigenen Zeitplaner.
- **Eine App startet ihren eigenen Flow** (Phase C6). Sie benutzt denselben
  Endpunkt mit dem Schlüssel, den das Gerät ihr beim Einspielen in den
  Container gelegt hat. Was sie dabei sieht, entscheidet der Schlüssel: er
  trägt App und Stand, und gesucht wird mit beiden. **Nur eigene Flows** ist
  deshalb keine Prüfung in der Route, sondern die Auswahl der Quelle — eine
  App kann den Flow einer anderen nicht einmal benennen.

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

## Freigaben (Phase C7)

Ein Flow kann anhalten und um Freigabe bitten. Das ist etwas anderes als eine
Rückfrage, und der Unterschied ist nicht technisch, sondern die Sache:

|              | `frage_nutzer`                          | `freigabe_anfordern`                                 |
| ------------ | --------------------------------------- | ---------------------------------------------------- |
| Adressat     | wer gerade zusieht                      | die Standardperson der Stufe, sonst jeder mit Zugang |
| liegt        | im Speicher des Prozesses               | in der Tabelle `approvals`                           |
| ohne Antwort | der Flow läuft mit einer Annahme weiter | **nichts** läuft weiter, der Lauf endet              |
| Betriebsart  | nur `rueckfragen`                       | jede — eine Freigabe **ist** der Halt                |

```yaml
schritte:
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Wochenbericht für KW {{woche}} freigeben
      zusammenhang: '{{entwurf}}'
      frist_minuten: 60
```

Der Lauf steht dann auf **`wartend`**. Seit M5 (04.10.2026) sieht **jeder** auf
der Startseite unter **„Für Sie"** die Anfragen, die bei ihm liegen (Abschnitt
„Stufen und Standardperson" unten), gebaut aus dem Muster `Freigabe` aus
`packages/marken` (Liste, Einzelansicht, Bestätigen, Ablehnen mit Pflichtgrund,
wer entschied, Frist) — dasselbe Muster, mit dem eine App ihre Freigaben zeigt.
An der Kachel der App steht höchstens eine Zahl. Eine Karte je Anfrage mit Titel, Zusammenhang und Restzeit, darunter **Bestätigen**
und **Ablehnen**. Ablehnen klappt ein Feld für die Begründung auf; ohne sie
geht der Knopf nicht. Nach der Entscheidung verschwindet die Karte ohne
Neuladen. Die Zahl am Haus der Aktivitätsleiste zählt dieselbe Liste; für den
Administrator steht sie zusätzlich rechts in der Statusleiste (Phase D1).

Über die Schnittstelle sind es dieselben Wege:
`GET /api/freigabe-anfragen`, dann
`POST /api/freigabe-anfragen/:id/bestaetigen` oder `…/ablehnen`
(Begründung Pflicht). Danach:

| Entscheidung  | Lauf                                                    |
| ------------- | ------------------------------------------------------- |
| bestätigt     | läuft **ab dem angehaltenen Schritt** weiter            |
| abgelehnt     | endet als `abgebrochen`, die Begründung wird sein Grund |
| nichts, Frist | endet als `abgelaufen`                                  |

**Der Flow nennt keine Person und keine Rolle** (Entscheidung vom 27.08.2026).
Er beschreibt die Sache; wer entscheiden darf, steht in `app_members` — dieselbe
Freigabe, mit der jemand die App überhaupt benutzen darf. Eine Freigabe gehört
deshalb immer einer App: ein Flow der Plattform kann keine anfordern und
bekommt einen Satz, der das sagt.

### Vier Augen (J35, 25.09.2026)

Den Kreis enger ziehen kann die **App**, beim Start des Laufs — nicht die
Flow-Datei und nicht das Modell (ein Werkzeug-Parameter, den das Modell setzt,
wäre eine Regel, die es auch weglassen kann):

```json
POST /api/v1/external/flows/beleg-buchen/run
{
  "args": { "beleg": "4711" },
  "wait_for_result": false,
  "einreicher": "anna",
  "freigabe": { "ohne_einreicher": true, "entscheider": { "rolle": "admin" } }
}
```

| Feld                                      | Wirkung                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `einreicher`                              | Wer den Lauf ausgelöst hat — der Benutzername aus `X-Arasul-User`. Muss die App freigegeben haben.      |
| `freigabe.ohne_einreicher: true`          | Seit M5 ohne eigene Wirkung: der Einreicher entscheidet **nie** (403), auch ohne. Braucht `einreicher`. |
| `freigabe.entscheider: {"rolle":"admin"}` | Nur Administratoren, denen die App freigegeben ist.                                                     |
| `freigabe.entscheider: {"konten":[…]}`    | Nur diese Konten; jedes muss die App freigegeben haben.                                                 |

Die Regel engt `app_members` ein, sie erweitert nie. Bleibt danach niemand,
der entscheiden könnte, weist der Start mit `400` ab — statt eine Freigabe
anzulegen, die einen Tag lang in ihre Frist läuft. Sie gilt für jede Freigabe
des Laufs und steht an Lauf und Anfrage (Migration 185); `GET
/api/v1/external/freigaben` nennt je Anfrage `einreicher`, `ohne_einreicher`
und `entscheider`. Die Übersicht zeigt »eingereicht von …« und ein Zeichen
»Vier Augen« oder »Benannt«. Der Kontrakt nennt beides unter `freigaben`.

Die Frist wählt der Lauf in dieser Reihenfolge: `frist_minuten` am Schritt,
sonst die `frist_minuten` der benannten **Stufe** (`parameter.stufe`, Stufen
im Flow-Kopf, Kontrakt 8), sonst `FLOW_FREIGABE_FRIST_MINUTEN` (Vorgabe 10080 =
sieben Tage). Höchstens ein Jahr. Eine Stufe, die der Flow nicht führt, weist
der Schritt mit einem Satz ab. Das Warten kostet keine GPU — dieselbe Begründung
wie bei der Rückfrage.

### Stufen und Standardperson (M5, 04.10.2026)

Ein Flow kann seine Freigaben in **benannten Stufen** anfordern; zwischen den
Stufen arbeitet er autonom weiter. Die Stufen stehen im Kopf (`stufen`,
Kontrakt 8), der Freigabe-Schritt nennt seine mit `parameter.stufe`:

```yaml
stufen:
  - name: pruefung
    bezeichnung: Prüfung
  - name: leitung
    bezeichnung: Leitung
    frist_minuten: 2880
schritte:
  - name: pruefen
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter: { titel: 'Beleg {{beleg}} prüfen', stufe: pruefung }
  - name: zeichnen
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter: { titel: 'Beleg {{beleg}} zeichnen', stufe: leitung }
```

**Der Flow nennt weiter keine Person** (Beschluss 27.08.2026). Wer in einer
Stufe zuerst gefragt wird, setzt der **Administrator** je App und Stufe, an
genau einer Stelle: auf der Seite der App in der Verwaltung, Abschnitt
„Freigabestufen" (`GET`/`PUT /api/apps/:id/stufen`, Tabelle
`app_stufen_personen`, Migration 195). Zwei Flows derselben App mit derselben
Stufe teilen die Person. Daraus folgt:

| Fall                                     | die Freigabe liegt …                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| neu, Stufe mit Standardperson            | bei der Standardperson (wenn sie aktiv ist, Zugang hat, nicht eingereicht hat) |
| neu, ohne Standardperson oder ohne Stufe | bei allen mit Zugang; der Admin sieht einen Hinweis                            |
| jemand mit Zugang übernimmt              | bei ihm                                                                        |
| jemand mit Zugang gibt weiter            | bei dem, an den er gibt (nur an jemanden mit Zugang, nie an den Einreicher)    |
| die Person verliert den Zugang           | wieder bei allen mit Zugang                                                    |

**Entscheiden kann nur, bei dem sie liegt** (sonst `409` mit dem Namen, und wer
im Kreis steht, übernimmt sie zuerst). **Wer eingereicht hat, entscheidet nie**
(`403`), seit M5 unabhängig von `ohne_einreicher`; er kann sie auch weder
übernehmen noch bekommen. Beides prüft das Backend in derselben Anweisung, die
schreibt (`freigabeAnfragen.kreis`, `beiIhm`), nicht nur die Oberfläche.

Die Startseite zeigt unter „Für Sie" nur, was bei mir liegt
(`GET /api/freigabe-anfragen`), mit „Weitergeben an …" je Karte; was bei anderen
liegt, steht zugeklappt darunter mit „Übernehmen"
(`GET /api/freigabe-anfragen/bei-anderen`). Die Zahl am Haus zählt nur die
erste Liste. Eine App liest `liegt_bei` unter `GET /api/v1/external/freigaben`
und in `freigabe` am Lauf; setzen kann sie es nicht.

Gemessen am Orin: `scripts/test/stufen-standardperson-abnahme.sh`.

### Arten: autonom und Ergebnis bestätigen (M5, 04.10.2026)

Der Flow-Kopf nennt, welche Arten er kann (`arten`, Kontrakt 8); **welche gilt,
schaltet der Admin je Flow** auf der Seite der App in der Verwaltung
(`PUT /api/apps/:id/flows/:name/art`). Gewählt werden kann nur, was der Kopf
nennt, alles andere weist das Backend mit `400` ab. Die Wahl liegt in
`flow_settings.art` (Migration 196), überlebt ein Update, gilt **ab dem nächsten
Lauf** und steht im Sicherheitsprotokoll (`flow_art_gesetzt`). Ohne Wahl gilt die
erste Art im Kopf, ohne `arten` `autonom`.

| Art                    | am Ende des Laufs                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `autonom`              | nichts: der Lauf wird `fertig`, die Ausgabe geht weiter                                                                                                                                                                                                                                                                   |
| `ergebnis_bestaetigen` | der Lauf hält an (`wartend`), eine Freigabe „Ergebnis bestätigen: <Flow>" liegt in der letzten Stufe des Flows (ohne `stufen`: ohne Stufe), das Ergebnis steht als Zusammenhang dabei. Erst nach der Bestätigung entsteht ein Ausgabedokument und wird der Lauf `fertig`; eine Ablehnung oder der Fristablauf beendet ihn |

Das Ergebnis steht im Prüfpunkt (`flow_runs.fortsetzung`, `ende`): nach einem
Neustart geht der Lauf mit **genau dem Ergebnis** weiter, das der Mensch sah,
ohne dass die Schritte noch einmal laufen. Endet die Kette ohnehin mit einem
`freigabe_anfordern`-Schritt, kommt keine zweite Freigabe hinzu.

**Erkennend oder erzeugend** — die Regel ist eine einzige und steht hier und im
Kontrakt (`flow_frontmatter.regeln`):

- Ein Flow **erkennt**, wenn mindestens ein `subagent`-Schritt
  `faehigkeiten.bild: true` nennt (er liest ein Bild oder einen Scan). Dieser
  Schritt legt bei **fehlender oder unsicherer Erkennung** eine Freigabe mit dem
  Grund „Erkennung unsicher: Feld X" an, **auch in `autonom`**, bevor der nächste
  Schritt läuft. Fehlend ist ein deklariertes Feld der Rolle ohne Wert, unsicher
  eines, das die Rolle im JSON unter `unsicher` (Liste von Feldnamen) nennt, und
  kam gar kein JSON zurück, gelten alle Felder als unsicher. Das Gerät hängt der
  Rolle dazu einen Satz an den Prompt. Die Freigabe liegt in der ersten Stufe des
  Flows, sonst ohne Stufe; sie steht als Schritt mit `automatisch` im Protokoll
  und zählt nicht zur Kette (die Wiederaufnahme überspringt sie).
- Ein Flow **erzeugt** (Texte, Dokumente), wenn kein Schritt ein Bild liest. Er
  läuft autonom oder mit Freigabe von Anfang an, **nie mit stillem Rückfall**: das
  Gerät schaltet nie von sich aus um, die Art bleibt, was der Admin gewählt hat.

Gemessen am Orin: `scripts/test/arten-abnahme.sh`. Seit dem 04.10.2026 rechnen
`texte` und `beleg` dort mit einer festen Antwort der Probe-App statt mit dem
echten Modell (siehe unten, „Abnahmen ohne Modell").

### Korrekturfelder: Vorschlag und Änderung (M5, 04.10.2026)

Wer eine Erkennung freigibt, korrigiert lieber ein Feld, als abzulehnen und neu
zu starten. Welche Felder ein Mensch in der Freigabe ändern darf, **erklärt die
App**, in der Rolle, die erkennt (Kontrakt 10):

```yaml
rollen:
  - name: leser
    ergebnis: { felder: [betrag, datum], aenderbar: [datum] }
    prompt: Lies den Beleg.
schritte:
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: Lies den Beleg {{beleg}}.
    faehigkeiten: { bild: true }
    original: 'api/belege/{{beleg}}.png' # relativ zur Adresse der App
```

Die Freigabe aus der Erkennung (Abschnitt „Arten" oben) trägt dann die Felder,
wie die KI sie vorschlug, je Feld `unsicher`, `fehlend` und `aenderbar`, zu
Prüfendes zuerst (`approvals.felder`, Migration 197), und das Original als
Adresse der App (`/apps/<id>/api/belege/4711.png`, im Teststand
`/apps/<id>/test/…`). Die **Ansicht der Freigabe** ist das Muster `Freigabe`
aus `packages/marken` (ab 5.4.0), in Arasul unter „Für Sie" und in jeder App,
die die Bibliothek von `/marken/5/` lädt:

- in der Liste statt „Bestätigen" der Knopf **„Prüfen"**: wer bestätigt, soll
  die Felder gesehen haben;
- einzeln das **Original links**, zoombar (`Dokumentanzeige`, Bild oder PDF),
  die **Felder rechts**; was zu prüfen ist, steht oben mit **„prüfen"**, nie
  mit einer Prozentzahl; änderbar ist nur, was die App erklärt;
- oben ein **Satz, was bisher geschah** (frühere Stufen desselben Laufs, wer
  bestätigte, wie viele Felder er änderte), die früheren Stufen klappen auf;
- nach der Entscheidung steht wieder die **Liste** da.

Bestätigt wird mit `POST /api/freigabe-anfragen/:id/bestaetigen` und
`{ "felder": { "datum": "01.10.2026" } }`. Ein Feld, das die App nicht als
änderbar erklärt, weist das Backend mit `400` ab, die Freigabe bleibt offen.
**Gespeichert** wird je geändertem Feld der Vorschlag der KI, der neue Wert,
wer und wann (`approvals.korrekturen`), in derselben Anweisung wie die
Entscheidung. **Der weitere Lauf arbeitet mit dem neuen Wert:** die Ausgabe des
erkennenden Schritts wird nach der Bestätigung aus den Feldern der Anfrage neu
gebildet (dieselbe Form `feld: wert`, die die Rolle geliefert hätte), im
laufenden Prozess, nach einem Neustart und beim „Ab Fehler wiederholen" (dort
aus den Freigaben des alten Laufs), für jeden übernommenen erkennenden Schritt.
Im Protokoll des Laufs bleibt der
Vorschlag am Schritt der Rolle stehen; der Freigabe-Schritt nennt darunter
„Geändert: datum: „" (Vorschlag) → „01.10.2026" (bernd)". Die Läufe-Ansicht der
Verwaltung zeigt beides als Tabelle (Feld, Vorschlag der KI, Geändert, wer,
wann), die App liest es unter `GET /api/v1/external/freigaben`.

**Grenzen, ehrlich benannt:** Felder trägt nur die Freigabe **aus der
Erkennung**. Ist alles sicher erkannt, gibt es keine, und eine spätere Stufe
(`freigabe_anfordern`) oder „Ergebnis bestätigen" zeigt den Text, keine
Felder. Ein Original, das nach dem Einsetzen kein Pfad relativ zur App ist
(`..`, Schema, Leerzeichen, `%`, `?`, `#`), fällt weg; die Freigabe entsteht ohne Bild.

Gemessen am Orin: `scripts/test/korrektur-abnahme.sh`.

### Abschluss: Übergabe an die App (M5, 04.10.2026, Kontrakt 11)

Nach der letzten Stufe übergibt der Flow sein Ergebnis an eine **Route der
eigenen App**. Abgeschlossen ist der Lauf erst, wenn die App den Empfang
bestätigt; sonst steht er auf **nicht übergeben**, mit dem Knopf „erneut".

```yaml
abschluss:
  route: /abschluss/beleg
```

Die Route ist ein Pfad des **Backends der App**, so wie die App ihn sieht (ohne
`/apps/<id>/api`): führender `/`, Buchstaben, Ziffern und `. _ ~ - /`, ohne Host,
Schema, Abfrage, `..` und `//`. Eine App ohne `backend` kann sie nicht
anbieten; ein Paket, dessen Flow `abschluss` nennt, wird dann abgewiesen.
Ohne `abschluss` ändert sich nichts: der Lauf wird `fertig` wie vorher.

**Der Weg.** Das Gerät ruft den Container der App im Netz `arasul-apps`
(`arasul-app-<id>-<stand>`, Port aus dem Manifest), ohne Traefik und ohne
Browser, `POST` mit JSON, Zeitlimit 30 Sekunden (fest, keine Einstellung).
Weiterleitungen folgt es nicht. Woran die App den Aufruf als den des Geräts
erkennt, steht im Kopf `Authorization: Bearer <ARASUL_ABSCHLUSS_TOKEN>`: ein
Geheimnis je App und Stand, aus dem Schlüssel des Geräts abgeleitet (HMAC), der
App beim Einspielen als Umgebungsvariable mitgegeben und nirgends gespeichert.
Eine schon laufende App bekommt es erst mit dem nächsten Einspielen.

**Der Inhalt.** `lauf` (Nummer), `flow`, `app`, `stand`, `argumente`, `ergebnis`
(Text), `felder` (je Feld der **geltende** Wert, also mit der Korrektur eines
Menschen; `null` ohne Erkennung), `korrekturen` (je Feld `feld`, `vorschlag`,
`wert`, `von`, `am`; `null` ohne) und `angenommen`. Dazu die Köpfe
`Idempotency-Key: arasul-lauf-<nummer>` und `X-Arasul-Lauf`. Die Lauf-Nummer ist
die Kennung: die App legt ein Ergebnis zu einer Nummer **nur einmal** an, derselbe
Aufruf kommt bei „erneut" noch einmal.

**Der Zustand.**

| Moment                              | Lauf                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Letzte Stufe fertig, Aufruf läuft   | `laeuft`; Ergebnis und `abschluss.route` stehen schon in `flow_runs`                       |
| Die App antwortet mit 2xx           | `fertig`, `abschluss.uebergeben_am` gesetzt                                                |
| 3xx, 4xx, 5xx, Zeitlimit, nicht da  | `nicht_uebergeben`, `error` nennt den Grund, `abschluss` zählt Versuche                    |
| „erneut" (Admin), die App antwortet | `fertig`, ohne dass die Schritte neu laufen; sie bekommt dieselben Daten, dieselbe Kennung |
| „erneut", die App stört noch        | bleibt `nicht_uebergeben`, ein Versuch mehr                                                |
| Backend startet neu, Aufruf lief    | `nicht_uebergeben` (nicht `fehler`): das Ergebnis steht in der Datenbank                   |
| Abbruch                             | `abgebrochen`, auch aus `nicht_uebergeben`                                                 |

Bei der Art **Ergebnis bestätigen** kommt der Aufruf nach der Bestätigung, nie
davor. Ein Lauf, der scheiterte oder abgebrochen wurde, übergibt nichts.

**„Erneut"** ist `POST /api/apps/:id/laeufe/:runId/erneut` (Admin, nur bei
`nicht_uebergeben`, sonst `409`) und ein Knopf in der Läufe-Ansicht der App und
im Lauf in der Verwaltung. Die App sieht den Zustand über
`GET /api/v1/external/flows/runs/:id` (`status`, `abschluss`).

Gemessen am Orin: `scripts/test/abschluss-abnahme.sh`, Probe-App
`tests/probe-abschluss` (Route mit Schalter für 503, langsam, Schweigen).

### Abnahmen ohne Modell

Eine Abnahme misst das Gerät, nicht ein Modell. Wo ein Flow nur ein vorgegebenes
JSON wiedergeben soll, stellt die Abnahme ihn über den Weg des Administrators
auf ein **externes Modell** um, das die Probe-App selbst ist
(`PUT /api/apps/:id/flows/:name/modell`, `extern.basis_url` =
`http://arasul-app-<id>-live:8080/v1`). Ihre Route `/v1/chat/completions`
antwortet, was im Auftrag zwischen `<<<` und `>>>` steht. Rolle,
Ergebnis-Vertrag, Erkennung, Freigabe und Fortsetzung laufen wie immer durch
das Gerät; nur die Antwort ist fest. So in `tests/probe-arten` und
`tests/probe-korrektur`, `tests/probe-abschluss`.

### Ein wartender Lauf überlebt Neustart und Update (M5, 03.10.2026)

Wartet ein Lauf der **deklarierten Schritt-Kette** (`schritte`) auf eine
Freigabe, steht sein Halt in der Datenbank und nicht mehr nur im Speicher:
`flow_runs.fortsetzung` nennt den Schritt der Kette (Index und Name), die
Ausgaben der Schritte davor stehen in `flow_run_steps`, die Anfrage mit ihrer
Frist in `approvals`. Daraus folgt:

| Ereignis                                        | Lauf                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Backend startet neu, Frist läuft noch           | bleibt `wartend`, die Frist wird neu gestellt                        |
| Bestätigung danach                              | läuft in **derselben** Lauf-Zeile ab dem angehaltenen Schritt weiter |
| Ablehnung danach                                | endet als `abgebrochen`                                              |
| Frist verstrich, während das Backend stillstand | endet beim Hochfahren als `abgelaufen`                               |
| Bestätigt, Prozess starb vor dem Fortsetzen     | wird beim Hochfahren fortgesetzt                                     |
| Abbruch durch einen Menschen nach dem Neustart  | endet als `abgebrochen`, die Anfrage schließt als `verfallen`        |

Die Wiederaufnahme führt die Schritte vor dem Halt **nicht noch einmal** aus:
ihre Ausgaben kommen aus dem Protokoll des Laufs (`berechneVorabErgebnisse`,
dieselbe Zuordnung wie bei „Ab Fehler wiederholen"), der Freigabe-Schritt wird
mit demselben Text geschlossen, den das Werkzeug im Prozess geliefert hätte.
Lässt sich etwas nicht eindeutig zuordnen (die Flow-Datei wurde während des
Wartens geändert, eine Ausgabe fehlt), endet der Lauf als `fehler` mit einem
Satz, der das sagt — nie mit einem geratenen Schritt.

**Grenzen, ehrlich benannt:**

- Ein Lauf, der **läuft**, überlebt keinen Neustart. Das gilt auch für den
  Augenblick nach der Bestätigung, bis er wieder wartet oder fertig ist.
- **Nicht fortsetzbar** ist eine Freigabe, die aus der modellgetriebenen
  Werkzeug-Schleife (kein `schritte`), aus einer Rolle (Unteragent) oder aus
  einem Schritt mit `iterationen` > 1 oder `wiederhole_ueber` kommt. Dort steht
  `flow_runs.fortsetzung` auf `NULL`, der Lauf endet beim Neustart wie bisher
  als `fehler`, seine Anfrage als `verfallen`, und `POST …/bestaetigen` meldet
  `fortgesetzt: false`. Der Grund: die Nachrichten der Werkzeug-Schleife sind
  zwar reines JSON, aber ihr Halt liegt MITTEN in einer Runde (andere Aufrufe
  derselben Runde sind schon ausgeführt, der haltende steht offen), und ein
  Unteragent trägt dazu den Zustand seiner eigenen Schleife und seiner Eltern.
  Beides müsste nach jedem Werkzeugaufruf abgelegt und mitten in der Runde
  wieder aufgenommen werden; das ist nicht gebaut.
- Die Änderungsübersicht eines fortgesetzten Laufs beginnt beim Fortsetzen; was
  vor dem Halt geändert wurde, bleibt aus dem ersten Teil erhalten.
- Das Zeitlimit des Flows (`grenzen.zeitlimit_s`) beginnt nach dem Halt neu;
  das Modell kann ein anderes sein, wenn das Standardmodell inzwischen wechselte.

## Verwandte Dokumentation

- API: [`API_REFERENCE.md`](../api/API_REFERENCE.md), Abschnitt **Flows**
  (Routen, Datei-Format, `verfuegbar`-Flag).
- Umgebungsvariablen: [`ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md),
  Abschnitte **Werkzeug-Schleife** und **Flows**.
- Datenbank: [`DATABASE_SCHEMA.md`](../api/DATABASE_SCHEMA.md), Tabellen
  `flow_runs`, `flow_run_steps` und `approvals`.
