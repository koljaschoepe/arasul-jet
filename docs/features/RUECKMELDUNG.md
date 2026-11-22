# Die Rückmeldung im Rahmen

> Stand 20.11.2026, Karte `rueckmeldung-im-rahmen` (J42, M7). Quelle ist der
> Vertrag der Verbesserungsschleife, `company/schleife.md` im Überordner
> (Teil „Rückmeldung“, Regeln 1 bis 3). Seit demselben Tag die Schnittstelle
> für das Kit mit dem Schalter je App für Bilder (Karte
> `rueckmeldung-schnittstelle`, J43, Abschnitt
> [Schnittstelle für das Kit](#schnittstelle-für-das-kit)). Seit demselben Tag
> das Entwickler-Cockpit (Karte `entwickler-cockpit`, J44); es ersetzt die Liste
> Verwaltung › Rückmeldungen. Seit 22.11.2026 heißt es **Werkstatt** und steht
> allen offen (Karte `werkstatt-und-rechte`, J52, Abschnitt
> [Die Werkstatt](#die-werkstatt)): jeder sieht seine eigenen Meldungen mit
> Stand, wer das Recht in der Werkstatt hat, alle (`company/schleife.md`,
> Regel 2, neu).

Über jeder App zeigt der Rahmen von Arasul oben rechts ein kleines Icon. Ein
Mitarbeiter tippt darauf, schreibt in freien Worten, was fehlt oder nicht
stimmt, und markiert auf einem Bildschirmfoto der Seite die Stelle. App, Stand,
Seite, Person und Zeit hängen Rahmen und Gerät selbst an. Gespeichert wird am
Gerät. Seine eigenen Meldungen liest jeder in der Werkstatt, mit Stand und
Grund; alle Meldungen liest nur, wer das **Recht in der Werkstatt** hat
(technisch das Kennzeichen `admin_users.entwickler`).

Keine App bekommt dafür eine Zeile Code, und keine App kann es abschalten:
Icon, Formular und Bildschirmfoto gehören dem Rahmen, nicht der App.

---

## Was der Mitarbeiter sieht

1. Oben rechts über der App ein rundes Icon (Sprechblase mit Plus), 28 px,
   mit dem Hinweis „Rückmeldung zu dieser Seite“. Es steht seit der Karte
   glas-rahmen-und-leiste (20.11.2026) in der **Kapsel** aus Glas, 32 px hoch,
   8 px vom Rand, neben dem Umschalter Live und Test. Es ist die eine Ausnahme
   vom Beschluss „keine Kopfleiste“ (02.10.2026): es schwebt über der App,
   statt eine Leiste über sie zu legen. Am Handy steht es ebenso oben rechts,
   weit weg von der Leiste unten.
2. Ein Klick nimmt zuerst das Bildschirmfoto auf und öffnet dann das Formular:
   - **Was fehlt oder stimmt nicht?** Freier Text, Pflicht, bis 5000 Zeichen.
   - **Bildschirmfoto mitschicken**, vorausgewählt und abwählbar. Darunter das
     Foto: Ziehen zeichnet einen Rahmen um die Stelle, Tippen setzt ein
     kleines Quadrat; jede neue Geste ersetzt die vorige.
   - Ein Satz, was mitgeht: App, Seite, Name, Uhrzeit, gespeichert am Gerät.
3. Nach dem Absenden steht „Ihre Rückmeldung ist angekommen.“ Seit dem
   22.11.2026 steht die Meldung danach in der Werkstatt unter „Meine
   Meldungen“, mit Stand (neu, angenommen, umgesetzt, abgelehnt) und bei einer
   Ablehnung dem Grund (Regel 2 der Schleife, neu; bis dahin gab es keinen Weg,
   die eigene Meldung wieder zu lesen).

Ließ sich kein Foto aufnehmen, sagt das Formular es in einem Satz, und die
Meldung geht nur mit Text.

## Wie das Bildschirmfoto entsteht

**Im Rahmen gerendert, nicht über eine Browser-Schnittstelle.** Die App läuft
als iframe gleicher Herkunft (`docs/features/APPS.md`, kein `sandbox`), also
darf der Rahmen ihr Dokument lesen. `modern-screenshot` (MIT, ohne weitere
Abhängigkeiten) klont das Dokument, legt es in ein SVG mit `foreignObject` und
lässt den Browser es auf eine Leinwand malen: das Bild ist, was der Browser
selbst rendert, mit allen Stilen der App. Gezeichnet wird der sichtbare Teil
des iframes, verschoben um den Scrollstand des Dokuments; bis zur doppelten
Auflösung. Die Bibliothek wird erst beim ersten Foto geladen.
(`apps/dashboard-frontend/src/features/apps/rueckmeldung/bildschirmfoto.ts`)

Verworfen: `getDisplayMedia`. Es fragt bei **jedem** Foto nach einer Freigabe
des Bildschirms, und auf dem iPhone gibt es es nicht.

Gemessen am 20.11.2026 am Orin, App Belege, Probe mit Playwright:

| Browser  | Breite  | Dauer  | Ergebnis                        |
| -------- | ------- | ------ | ------------------------------- |
| Chromium | 1440 px | 548 ms | deckungsgleich mit dem Schirm   |
| Chromium | 390 px  | 61 ms  | deckungsgleich, doppelte Dichte |
| WebKit   | 1440 px | 220 ms | deckungsgleich                  |
| WebKit   | 390 px  | 100 ms | deckungsgleich, doppelte Dichte |

Grenzen: Inhalt in einem eigenen Rollbereich der App kommt so, wie er dort
gerade steht. Ein Bild der App, das der Browser nicht hergibt, oder mehr als
acht Sekunden ergeben „ohne Bild“. Die Markierung wird vor dem Absenden in das
PNG gezeichnet (Farbe aus dem Token `--primary`) und zusätzlich als
`{ x, y, breite, hoehe }` in Anteilen gespeichert.

## Was gespeichert wird, und wo

| Was                       | Wo                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Text, App, Stand, Seite   | `public.rueckmeldungen` (Migration 214)                                             |
| Person, Zeit, Stand `neu` | dieselbe Zeile; Person aus der Sitzung, Zeit vom Gerät                              |
| Markierung                | `markierung` (JSONB, Anteile 0 bis 1)                                               |
| Bildschirmfoto            | Datei `<APPS_DIR>/.rueckmeldungen/<uuid>.png`, am Orin `data/apps/.rueckmeldungen/` |

- **Bilder als Dateien, im Baum der Apps.** Damit gehen sie jede Nacht ohne
  Umbau der Sicherung in den Stand (`services/backup-service/staende.sh`
  sichert `/arasul/apps` ganz) und kommen mit „Apps zurückholen“ wieder. Das
  Vorbild ist `.eingang`: ein Ordner mit Punkt wird nie als App gelesen.
- **Mit der Meldung geht das Bild.** `DELETE /api/rueckmeldungen/:id` löscht
  Zeile und Datei; scheitert beim Melden die Zeile, wird die Datei gleich
  wieder entfernt. In älteren Ständen der Sicherung bleibt beides, bis diese
  ablaufen.
- **In der DSGVO-Auskunft** (`GET /api/gdpr/export`, seit 21.11.2026)
  stehen alle Meldungen der Person mit Text, Seite, Markierung, Stand und dem
  Bildschirmfoto selbst als `data:image/png;base64,…`. Die Auskunft ist damit
  ohne das Gerät lesbar; den Dateinamen am Gerät nennt sie nicht.
- **Gedrosselt:** höchstens 20 Meldungen je Person und Viertelstunde, mit
  eigenem Zähler (Zweck `rueckmeldung`). Er teilt sich nichts mehr mit dem
  Passwortwechsel; vor dem 21.11.2026 zählten alle Drosseln je Person in
  einen Topf (`__tests__/unit/drosselJeZweck.test.js`).
- **Eine gelöschte Person** lässt ihre Meldungen ohne Namen zurück
  (`ON DELETE SET NULL`, in der Zusammenfassung der Löschung als
  `anon_rueckmeldungen`).
- **Werksreset:** die Tabelle steht bei den Inhalten, der Ordner der Bilder
  geht mit derselben Stufe.
- Nur PNG, höchstens 6 MB; die Seite muss unter `/apps/<app_id>/` liegen.

## Wer was darf

| Weg                                | Wer                                                                   |
| ---------------------------------- | --------------------------------------------------------------------- |
| `POST /api/rueckmeldungen`         | jeder, der die App in diesem Stand benutzen darf (`appZugang.pruefe`) |
| `GET /api/rueckmeldungen`          | jeder: die eigenen; mit dem Recht in der Werkstatt alle (J52)         |
| `GET /api/rueckmeldungen/:id/bild` | jeder: das Bild zur eigenen Meldung; mit dem Recht jedes (J52)        |
| `PATCH /api/rueckmeldungen/:id`    | nur mit dem Recht in der Werkstatt (Stand setzen, J44)                |
| `DELETE /api/rueckmeldungen/:id`   | nur mit dem Recht in der Werkstatt                                    |
| `GET /api/werkstatt/ich`           | jeder: ob er das Recht hat                                            |
| `GET /api/werkstatt/apps`          | nur mit dem Recht in der Werkstatt                                    |

Das Recht wird bei **jedem** Aufruf frisch aus der Datenbank gelesen, nicht
aus dem Zwischenspeicher der Anmeldung: ein entzogenes Recht gilt beim nächsten
Aufruf. Die Rolle Administrator allein reicht nicht. **Die eigene Sicht grenzt
die Abfrage selbst ein** (`WHERE person_id = …`), nicht der Browser; eine
fremde Meldung oder ihr Bild antwortet ohne das Recht 404, wie eine, die es
nicht gibt. Die Antwort auf `GET` sagt in `sicht`, ob `"eigene"` oder `"alle"`
galt. Belegt in `apps/dashboard-backend/__tests__/unit/rueckmeldungen.test.js`
(eigene Sicht für Mitarbeiter und Administrator ohne das Recht, fremdes Bild
404, Stand setzen und Entfernen 403) und gegen echtes Postgres in
`__tests__/pg/rueckmeldungen.test.js` (eigene Sicht, fremdes Bild, Migration
218).

**Das Recht heißt Recht, nicht Rolle.** Technisch bleibt es das Kennzeichen
`admin_users.entwickler` (Migration 213), an dem auch das Terminal hängt; so
brechen weder Terminal noch Kit-Schnittstelle noch der App-Standard. Sichtbar
steht es unter Verwaltung › Personen als Schalter in der Spalte „Werkstatt“
(„Recht in der Werkstatt für …“). Mitarbeiter und wer die Apps betreut sind
dieselbe Art Konto; umgeschaltet wird nirgends.

Einzelheiten der Wege: [`docs/api/API_REFERENCE.md`](../api/API_REFERENCE.md#rückmeldungen-j42-m7-20112026).

## Die Werkstatt

> Karte `entwickler-cockpit` (J44, M7, 20.11.2026), seit der Karte
> `werkstatt-und-rechte` (J52, M7, 22.11.2026) unter diesem Namen und für alle.
> Quelle: `company/schleife.md`, Teile „Eingang" und „Test nach Live", Regel 2;
> `company/plattform.md`: „Einzige mitgelieferte App".

Eine App im Rahmen wie jede andere, nur dass sie mit Arasul kommt: Adresse
`/apps/werkstatt/`, Symbol Hammer in der Aktivitätsleiste, gebaut aus der
Bibliothek zur Laufzeit (`/marken/5/`), am Handy mit der Leiste als Blatt.
**Sie steht jeder aktiven Person offen**, ohne Freigabe und ohne Kennzeichen.
Die alte Adresse `/apps/entwickler-cockpit/…` zieht mit 301 hierher um, samt
Rest und Abfrage und vor der Anmeldung (`routes/appAusliefern.js`).

**Was dort steht, entscheidet das Recht in der Werkstatt** (`GET
/api/werkstatt/ich`), nicht eine Rolle; umgeschaltet wird nichts:

| Wer            | Ansichten                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ohne das Recht | **Meine Meldungen**: was die Person selbst gemeldet hat, neueste zuerst, mit App, Zeit und Stand. Ein Klick öffnet die Meldung nur zum Lesen: Text, Seite, das eigene Bildschirmfoto, Stand mit Satz, bei „abgelehnt“ der Grund |
| mit dem Recht  | **Eingang**, **Apps**, **Test nach Live** (Tabelle unten). „Meine Meldungen“ gibt es dort nicht eigens: der Eingang zeigt alle, die eigenen mit                                                                                 |

Steht im Fragment der Adresse eine Seite, die es ohne das Recht nicht gibt
(`#live`), zeigt die Werkstatt trotzdem „Meine Meldungen“; die Apps fragt sie
ohne das Recht gar nicht erst. Mit dem Recht drei Ansichten:

| Ansicht            | Was dort steht                                                                                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Eingang**        | Die Meldungen aller Apps, neueste zuerst, Filter je App und Stand (Vorgabe „offen“ = neu und angenommen). Ein Klick öffnet eine Meldung: Text, Seite, Person, Zeit, Bildschirmfoto mit der Stelle, Stand setzen, bei „abgelehnt“ mit Pflichtgrund; Entfernen mit Rückfrage |
| **Apps**           | Je App die Fassung in Test und Live, zuletzt geändert, die Zahl offener Meldungen; ein Klick zeigt ihre Meldungen im Eingang                                                                                                                                               |
| **Test nach Live** | Was im Test neuer ist als live, mit dem Änderungstext der Fassung. „Live schalten“ nach einer Rückfrage; darunter „Zurück“ auf die Fassung davor, in den 24 Stunden nach einer Schaltung                                                                                   |

**Der Grund einer Ablehnung ist ein Satz an die Person, die gemeldet hat**:
sie liest ihn in ihrer Werkstatt. Das sagt der Dialog beim Setzen und der
Kontrakt dem Kit.

**Wie es an die Meldungen kommt, ohne die Regel der Apps zu brechen.** Die
Regel vom 01.10.2026 sagt: eine App erreicht nur ihre eigene Datenbank und die
Plattform-API. Die Werkstatt hat **kein Backend**, also weder Datenbank noch
Schlüssel. Es läuft wie jede App als iframe gleicher Herkunft und ruft die
Plattform-API **mit der Sitzung des Menschen davor** (Cookie, CSRF-Kopf):
`GET/PATCH/DELETE /api/rueckmeldungen`, `GET /api/rueckmeldungen/:id/bild`,
`GET /api/werkstatt/ich`, `GET /api/werkstatt/apps`, `POST
/api/apps/:id/schalten`. Jede dieser Routen prüft das Recht frisch aus der
Datenbank. Damit kann die Werkstatt genau das, was dieser Mensch darf, und
nichts darüber hinaus; eine fremde Datenbank liest sie nie. Darum konnte sie
mit J52 für alle aufgehen, ohne dass sich an ihr eine Zeile Sicherheit
änderte: die Grenze steht an den Routen. Verworfen: ein Backend mit einem eigenen Schlüssel im Bereich
`feedback:agent`. Es hätte allen dasselbe gezeigt, auch nach einem entzogenen
Kennzeichen, und einen dauerhaft gültigen Schlüssel im Container gebraucht.

**Was es von einer ausgerollten App unterscheidet**
(`apps/dashboard-backend/src/services/app/mitgeliefert.js`):

- Die Dateien liegen im Abbild des Backends (`mitgeliefert/werkstatt/`, gebaut
  im Dockerfile, Stufe `werkstatt`, aus `apps/werkstatt/`), nicht in
  `APPS_DIR`. Sie kommt mit jedem Update des Geräts, hat keine Zeile in `apps` oder
  `app_staende`, keinen Teststand, keinen Container.
- Die Kennung `werkstatt` ist für Pakete vergeben, die alte
  `entwickler-cockpit` ebenso (`ALTE_KENNUNGEN` in `schemas/apps.js`): ein
  Manifest, das eine nennt, wird abgewiesen.
- Über der Werkstatt steht das Icon der Rückmeldung wie über jeder App; eine
  Meldung dazu landet im Eingang unter „Werkstatt“. Weil jeder die Werkstatt
  hat, kann auch jemand ohne eine einzige App-Freigabe melden, nämlich zu ihr.
  Migration 218 hat Meldungen zur alten Kennung umgezogen.

**Test nach Live ist kein zweiter Mechanismus.** Der Knopf ruft denselben Weg
wie Verwaltung › Apps (`POST /api/apps/:id/schalten` → `liveSchalten.js`):
alten Livestand anhalten, Daten sichern (restic, `vorher`), schalten,
zusehen, bei Bedarf selbst zurück, ein Eintrag in `app_schaltungen`. Seit J44
darf diesen Weg auch gehen, wer das Recht in der Werkstatt hat, ohne
Admin-Rolle (`company/schleife.md`: „der Entwickler … schaltet es live“).

**Am Gerät ändert der Schalter „Bildschirmfotos an den Agenten“ nichts**: in
der Werkstatt sieht jedes Foto, wer das Recht hat, und jeder sein eigenes.

**Der Nachweis des Kit-Ablaufs** (Ara-Kit, `.ara/knowledge/nachweis.de.md`,
J45) kann die Werkstatt nicht tragen und muss als mitgelieferte App
ausgenommen sein: sie wird nicht mit dem Kit gebaut und nicht ausgerollt,
sondern mit dem Gerät gebaut und mit dem Update geliefert. Den App-Standard
erfüllt sie sonst:
Bausteine der Bibliothek (Seitenleiste, Datenliste, Kopf, Karte, Dialogform,
Bestätigung, Meldung, Leerzustand), Typen, Tests
(`apps/werkstatt/src/__tests__/`, mitgefahren von den Tests des
Frontends) und die Regeln der Gestalt (Tokens, drei Größen).

## Abnahme am Orin

Die Werkstatt: `scripts/test/werkstatt-abnahme.mjs` (J52), am 22.11.2026 nach
dem Deploy 90 von 90 grün (beide Sichten in Chromium und WebKit bei 1440 und
390 px, alte Adresse, fremde Bilder 404, Stand setzen, Live schalten, Spalte
unter Personen). Bericht und Bilder: [`docs/plans/audits/2026-11-22-werkstatt/`](../plans/audits/2026-11-22-werkstatt/README.md).

Das Entwickler-Cockpit (J44; das Skript hieß bis 22.11.2026
`entwickler-cockpit-abnahme.mjs` und ist in der Werkstatt-Abnahme aufgegangen),
am 20.11.2026 nach dem Deploy 70 von 70 grün (Abweisung ohne Kennzeichen, alle
drei Ansichten in Chromium und WebKit bei 1440 und 390 px, Stand setzen, Live
schalten mit Sicherung und Zurück). Bericht und Bilder:
[`docs/plans/audits/2026-11-20-entwickler-cockpit/`](../plans/audits/2026-11-20-entwickler-cockpit/README.md).

Die Rückmeldung im Rahmen:

`scripts/test/rueckmeldung-im-rahmen-abnahme.mjs`, am 20.11.2026 nach dem
Deploy 49 von 49 grün (Chromium und WebKit, 1440 und 390 px, Belege, Abschluss,
Probe-App). Bericht und Bilder:
[`docs/plans/audits/2026-11-20-rueckmeldung/`](../plans/audits/2026-11-20-rueckmeldung/README.md).

## Schnittstelle für das Kit

> Karte `rueckmeldung-schnittstelle` (J43, M7, 20.11.2026). Für die Kit-Karte
> `kit-befehl-anfragen` (K29): ein Befehl holt die offenen Meldungen einer App
> in die Sitzung, der Agent ordnet sie, setzt nach Freigabe um und trägt den
> Stand am Gerät nach. Quelle der Regeln: `company/schleife.md`, Regeln 2 bis 4.

Drei Wege unter `/api/v1/external`, alle mit dem Kopf `X-API-Key`:

| Weg                                                       | Wozu                                  |
| --------------------------------------------------------- | ------------------------------------- |
| `GET /api/v1/external/apps/<id>/rueckmeldungen`           | die Meldungen einer App lesen         |
| `GET /api/v1/external/apps/<id>/rueckmeldungen/<nr>/bild` | ein Bildschirmfoto, nur mit Erlaubnis |
| `PATCH /api/v1/external/apps/<id>/rueckmeldungen/<nr>`    | den Stand einer Meldung setzen        |

Dieselben Wege stehen im Kontrakt des Geräts (`GET /api/v1/external/contract`)
unter `endpunkte` mit dem Bereich `feedback:agent` und im Abschnitt
`rueckmeldungen` (Wege, Stände, Felder, Regeln). Die Kontraktversion bleibt
bei 14: neu ist nur, was ein Kit vorher nicht kannte.

### Der Schlüssel

Ein eigener Schlüssel im Bereich **`feedback:agent`**, angelegt am Gerät:

```bash
bash scripts/util/kit-schluessel.sh anlegen "Rückmeldungen" feedback:agent
```

Der Klartext erscheint genau einmal. Ein Schlüssel mit nur `app:deploy` (der
zum Ausrollen) oder `system:update` liest **keine** Meldungen: in ihnen stehen
Namen von Mitarbeitern. Widerrufen wie jeder Schlüssel
(`kit-schluessel.sh widerrufen <präfix>`).

### Der Schalter je App: „Bildschirmfotos an den Agenten“

**Verwaltung › Apps › (App) › Rückmeldungen**, nur für Administratoren,
**Vorgabe aus** (`apps.bilder_an_agenten`, Migration 215;
`PUT /api/apps/<id>/bilder-an-agenten`, Body `{"erlaubt": true}`).

| Schalter | Was das Kit bekommt                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **aus**  | Text, Seite, App, Stand, Person, Zeit, Stand der Meldung. Das Feld `bild` **fehlt** an jeder Meldung: kein Bild, keine Markierung, kein Weg dorthin, kein Hinweis, ob es eins gibt. Der Abholweg antwortet 403 |
| **an**   | dazu je Meldung `bild`: `null` ohne Foto, sonst `{ "weg", "format", "markierung" }`. Das Bild selbst über `weg`                                                                                                |

Am Gerät ändert der Schalter nichts: in der Werkstatt sieht die Fotos immer,
wer das Recht hat. Den Dateinamen am Gerät nennt die Antwort nie.

### Lesen

```bash
curl -s -H "X-API-Key: $ARASUL_RUECKMELDUNG_SCHLUESSEL" \
  "https://<gerät>/api/v1/external/apps/belege/rueckmeldungen?stand_meldung=neu,angenommen"
```

| Abfrage         | Bedeutung                                                     | Vorgabe |
| --------------- | ------------------------------------------------------------- | ------- |
| `stand_meldung` | Komma-Liste aus `neu`, `angenommen`, `umgesetzt`, `abgelehnt` | alle    |
| `stand`         | `test` oder `live`: in welchem Stand der App gemeldet wurde   | beide   |
| `grenze`        | 1 bis 500                                                     | 200     |

Älteste zuerst, in der Reihenfolge, in der sie kamen. **Antwort mit Schalter
aus** (Vorgabe):

```json
{
  "data": {
    "app_id": "belege",
    "app_name": "Belege",
    "bilder_an_agenten": false,
    "anzahl": 2,
    "meldungen": [
      {
        "id": 7,
        "app_id": "belege",
        "stand": "live",
        "seite": "/apps/belege/?ansicht=offen",
        "text": "Hier fehlt ein Filter nach Monat.",
        "person": { "id": 2, "anzeigeName": "Mia Muster" },
        "erstellt_am": "2026-11-20T10:00:00.000Z",
        "stand_meldung": "neu",
        "grund": null,
        "stand_geaendert_am": null
      },
      {
        "id": 8,
        "app_id": "belege",
        "stand": "test",
        "seite": "/apps/belege/test/",
        "text": "Der Knopf Speichern reagiert nicht.",
        "person": null,
        "erstellt_am": "2026-11-20T10:30:00.000Z",
        "stand_meldung": "angenommen",
        "grund": null,
        "stand_geaendert_am": "2026-11-20T11:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-11-20T12:00:00.000Z"
}
```

**Dieselbe Abfrage mit Schalter an**: `bilder_an_agenten` ist `true`, und
jede Meldung trägt zusätzlich `bild`:

```json
{
  "id": 7,
  "…": "wie oben",
  "bild": {
    "weg": "/api/v1/external/apps/belege/rueckmeldungen/7/bild",
    "format": "png",
    "markierung": { "x": 0.1, "y": 0.2, "breite": 0.3, "hoehe": 0.1 }
  }
}
```

Meldung 8 trägt dann `"bild": null` (abgeschickt ohne Foto). `person` ist
`null`, wenn die Person inzwischen gelöscht ist. `markierung` sind Anteile von
Breite und Höhe des Bildes (0 bis 1) oder `null`, wenn keine Stelle markiert
wurde; die Stelle ist zusätzlich ins PNG gezeichnet. `weg` ist relativ zur
Adresse des Geräts.

**Ein Kit prüft `bilder_an_agenten`, nicht das Fehlen von `bild`**: ist es
`false`, gibt es für den Agenten kein Bild, auch keines zum Nachfragen.

### Ein Bild holen

```bash
curl -s -H "X-API-Key: $ARASUL_RUECKMELDUNG_SCHLUESSEL" -o meldung-7.png \
  "https://<gerät>/api/v1/external/apps/belege/rueckmeldungen/7/bild"
```

`200` mit `Content-Type: image/png` und `Cache-Control: private, no-store`.

### Den Stand setzen

```bash
curl -s -X PATCH -H "X-API-Key: $ARASUL_RUECKMELDUNG_SCHLUESSEL" \
  -H "Content-Type: application/json" \
  -d '{"stand_meldung":"abgelehnt","grund":"Gibt es schon: Filter oben rechts."}' \
  "https://<gerät>/api/v1/external/apps/belege/rueckmeldungen/7"
```

`stand_meldung` ist `neu`, `angenommen`, `umgesetzt` oder `abgelehnt`.
`grund` (1 bis 2000 Zeichen) ist **Pflicht bei `abgelehnt`**, sonst frei; ein
neuer Stand ohne Grund löscht den alten. Kein CSRF-Kopf nötig, der Schlüssel
genügt. Antwort: die Meldung in derselben Form wie beim Lesen (mit `bild` nur
bei Schalter an), dazu `vorher`:

```json
{
  "data": {
    "id": 7,
    "app_id": "belege",
    "stand": "live",
    "seite": "/apps/belege/?ansicht=offen",
    "text": "Hier fehlt ein Filter nach Monat.",
    "person": { "id": 2, "anzeigeName": "Mia Muster" },
    "erstellt_am": "2026-11-20T10:00:00.000Z",
    "stand_meldung": "abgelehnt",
    "grund": "Gibt es schon: Filter oben rechts.",
    "stand_geaendert_am": "2026-11-20T12:05:00.000Z",
    "vorher": "neu"
  },
  "timestamp": "2026-11-20T12:05:00.000Z"
}
```

Am Gerät steht dazu `stand_geaendert_durch = "schluessel:<präfix>"`. Der
Mitarbeiter, der gemeldet hat, sieht Stand und Grund in seiner Werkstatt
(Regel 2 seit 22.11.2026); schreiben Sie den Grund für ihn.

### Fehlerfälle

Jeder Fehler kommt in der Hülle des Geräts:
`{ "error": { "code": "…", "message": "…" }, "timestamp": "…" }`.

| Status | `code`             | Wann                                                                                                                                                |
| ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `UNAUTHORIZED`     | kein `X-API-Key`, Schlüssel unbekannt, widerrufen oder abgelaufen                                                                                   |
| 403    | `FORBIDDEN`        | Schlüssel ohne Bereich `feedback:agent` (etwa nur `app:deploy`); Schlüssel einer anderen App                                                        |
| 403    | `FORBIDDEN`        | Bild holen, obwohl der Schalter der App aus ist: „Für die App belege gehen keine Bildschirmfotos an den Agenten. …“                                 |
| 400    | `VALIDATION_ERROR` | `stand_meldung` unbekannt, `grenze` außerhalb 1 bis 500, `abgelehnt` ohne `grund`, unbekanntes Feld                                                 |
| 404    | `NOT_FOUND`        | die App gibt es am Gerät nicht; die Meldung gibt es nicht oder sie gehört zu einer anderen App; die Meldung hat kein Bild; die Datei fehlt am Gerät |
| 429    | `RATE_LIMITED`     | mehr Aufrufe je Minute, als der Schlüssel darf (Vorgabe 60); `details.retryAfter` in Sekunden                                                       |

### Im Protokoll

Jede Abfrage durch das Kit steht im Sicherheitsprotokoll des Geräts
(`audit_logs`), geschrieben, bevor die Antwort geht:

| `action`                            | Was in `details` steht                                                   |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `rueckmeldungen_abgefragt`          | Schlüssel (Präfix und Name), App, `mit_bildern`, `anzahl`, Filter        |
| `rueckmeldung_bild_abgeholt`        | Schlüssel, App, Nummer der Meldung, `mit_bildern: true`                  |
| `rueckmeldung_stand_gesetzt`        | Schlüssel, App, Nummer, `vorher`, `nachher`, ob mit Grund, `mit_bildern` |
| `app_bilder_an_agenten_an` / `_aus` | wer (Person), App, `vorher`, `nachher` (der Schalter selbst)             |

`user_id` ist der Besitzer des Schlüssels, `timestamp` die Zeit. Eine
Abweisung (falscher Bereich, Schalter aus beim Bild) schreibt keine Zeile
dieser Art. Lesen:

```sql
SELECT timestamp, action, details FROM audit_logs
 WHERE action LIKE 'rueckmeldung%' OR action LIKE 'app_bilder%'
 ORDER BY timestamp DESC LIMIT 20;
```

Belegt in `apps/dashboard-backend/__tests__/unit/rueckmeldungenKit.test.js`
(Bereich, Schalter aus ohne jede Spur des Bildes im ganzen Text der Antwort,
Schalter an, Stand, Protokoll) und gegen echtes Postgres in
`__tests__/pg/rueckmeldungen.test.js`.

## Was nicht gebaut ist

Der Kit-Befehl, der diese Schnittstelle nutzt (K29). Kein Chat, kein Agent im Browser,
keine Abstimmung, ohne das Recht in der Werkstatt keine Sicht auf die Meldungen
anderer.
