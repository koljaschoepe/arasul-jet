# Die Rückmeldung im Rahmen

> Stand 20.11.2026, Karte `rueckmeldung-im-rahmen` (J42, M7). Quelle ist der
> Vertrag der Verbesserungsschleife, `company/schleife.md` im Überordner
> (Teil „Rückmeldung“, Regeln 1 bis 3). Seit demselben Tag die Schnittstelle
> für das Kit mit dem Schalter je App für Bilder (Karte
> `rueckmeldung-schnittstelle`, J43, Abschnitt
> [Schnittstelle für das Kit](#schnittstelle-für-das-kit)). Seit demselben Tag
> das Entwickler-Cockpit (Karte `entwickler-cockpit`, J44, Abschnitt
> [Das Entwickler-Cockpit](#das-entwickler-cockpit)); es ersetzt die Liste
> Verwaltung › Rückmeldungen.

Über jeder App zeigt der Rahmen von Arasul oben rechts ein kleines Icon. Ein
Mitarbeiter tippt darauf, schreibt in freien Worten, was fehlt oder nicht
stimmt, und markiert auf einem Bildschirmfoto der Seite die Stelle. App, Stand,
Seite, Person und Zeit hängen Rahmen und Gerät selbst an. Gespeichert wird am
Gerät. Lesen kann eine Meldung nur, wer das Kennzeichen **Entwickler** trägt.

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
3. Nach dem Absenden steht nur „Ihre Rückmeldung ist angekommen.“ Einen Weg,
   die eigene Meldung wieder zu lesen, gibt es nicht (Regel 2 der Schleife,
   von Kolja am 20.11.2026 so entschieden).

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
| `GET /api/rueckmeldungen`          | nur Kennzeichen Entwickler                                            |
| `GET /api/rueckmeldungen/:id/bild` | nur Kennzeichen Entwickler                                            |
| `PATCH /api/rueckmeldungen/:id`    | nur Kennzeichen Entwickler (Stand setzen im Cockpit, J44)             |
| `DELETE /api/rueckmeldungen/:id`   | nur Kennzeichen Entwickler                                            |

Das Kennzeichen wird bei **jedem** lesenden Aufruf frisch aus der Datenbank
gelesen, nicht aus dem Zwischenspeicher der Anmeldung: ein entzogenes
Kennzeichen gilt beim nächsten Aufruf. Die Rolle Administrator allein reicht
nicht. Belegt in `apps/dashboard-backend/__tests__/unit/rueckmeldungen.test.js`
(Abweisung für Mitarbeiter und für Administrator ohne Kennzeichen) und gegen
echtes Postgres in `__tests__/pg/rueckmeldungen.test.js`.

Einzelheiten der Wege: [`docs/api/API_REFERENCE.md`](../api/API_REFERENCE.md#rückmeldungen-j42-m7-20112026).

## Das Entwickler-Cockpit

> Karte `entwickler-cockpit` (J44, M7, 20.11.2026). Quelle: `company/schleife.md`,
> Teile „Eingang" und „Test nach Live"; `company/plattform.md`: „Einzige
> mitgelieferte App".

Eine App im Rahmen wie jede andere, nur dass sie mit Arasul kommt: Adresse
`/apps/entwickler-cockpit/`, ein Symbol in der Aktivitätsleiste, gebaut aus
der Bibliothek zur Laufzeit (`/marken/5/`), am Handy mit der Leiste als Blatt.
**Sichtbar nur mit dem Kennzeichen Entwickler**, auch ohne Admin-Rolle; ohne
Kennzeichen steht es weder in der Leiste noch öffnet die Adresse etwas (403,
auch für den Administrator). Drei Ansichten:

| Ansicht            | Was dort steht                                                                                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Eingang**        | Die Meldungen aller Apps, neueste zuerst, Filter je App und Stand (Vorgabe „offen“ = neu und angenommen). Ein Klick öffnet eine Meldung: Text, Seite, Person, Zeit, Bildschirmfoto mit der Stelle, Stand setzen, bei „abgelehnt“ mit Pflichtgrund; Entfernen mit Rückfrage |
| **Apps**           | Je App die Fassung in Test und Live, zuletzt geändert, die Zahl offener Meldungen; ein Klick zeigt ihre Meldungen im Eingang                                                                                                                                               |
| **Test nach Live** | Was im Test neuer ist als live, mit dem Änderungstext der Fassung. „Live schalten“ nach einer Rückfrage; darunter „Zurück“ auf die Fassung davor, in den 24 Stunden nach einer Schaltung                                                                                   |

**Wie es an die Meldungen kommt, ohne die Regel der Apps zu brechen.** Die
Regel vom 01.10.2026 sagt: eine App erreicht nur ihre eigene Datenbank und die
Plattform-API. Das Cockpit hat **kein Backend**, also weder Datenbank noch
Schlüssel. Es läuft wie jede App als iframe gleicher Herkunft und ruft die
Plattform-API **mit der Sitzung des Menschen davor** (Cookie, CSRF-Kopf):
`GET/PATCH/DELETE /api/rueckmeldungen`, `GET /api/rueckmeldungen/:id/bild`,
`GET /api/entwickler/apps`, `POST /api/apps/:id/schalten`. Jede dieser Routen
prüft das Kennzeichen frisch aus der Datenbank. Damit kann das Cockpit genau
das, was dieser Mensch darf, und nichts darüber hinaus; eine fremde Datenbank
liest es nie. Verworfen: ein Backend mit einem eigenen Schlüssel im Bereich
`feedback:agent`. Es hätte allen dasselbe gezeigt, auch nach einem entzogenen
Kennzeichen, und einen dauerhaft gültigen Schlüssel im Container gebraucht.

**Was es von einer ausgerollten App unterscheidet**
(`apps/dashboard-backend/src/services/app/mitgeliefert.js`):

- Die Dateien liegen im Abbild des Backends (`mitgeliefert/entwickler-cockpit/`,
  gebaut im Dockerfile aus `apps/entwickler-cockpit/`), nicht in `APPS_DIR`. Es
  kommt mit jedem Update des Geräts, hat keine Zeile in `apps` oder
  `app_staende`, keinen Teststand, keinen Container.
- Die Kennung `entwickler-cockpit` ist für Pakete vergeben: ein Manifest, das
  sie nennt, wird abgewiesen.
- Über dem Cockpit steht das Icon der Rückmeldung wie über jeder App; eine
  Meldung dazu landet im Eingang unter „Entwickler-Cockpit“.

**Test nach Live ist kein zweiter Mechanismus.** Der Knopf ruft denselben Weg
wie Verwaltung › Apps (`POST /api/apps/:id/schalten` → `liveSchalten.js`):
alten Livestand anhalten, Daten sichern (restic, `vorher`), schalten,
zusehen, bei Bedarf selbst zurück, ein Eintrag in `app_schaltungen`. Seit J44
darf diesen Weg auch ein Entwickler ohne Admin-Rolle gehen
(`company/schleife.md`: „der Entwickler … schaltet es live“).

**Am Gerät ändert der Schalter „Bildschirmfotos an den Agenten“ nichts**: im
Cockpit sieht ein Entwickler jedes Foto.

**Der Nachweis des Kit-Ablaufs** (Ara-Kit, `.ara/knowledge/nachweis.de.md`,
J45) kann das Cockpit nicht tragen und muss als mitgelieferte App ausgenommen
sein: es wird nicht mit dem Kit gebaut und nicht ausgerollt, sondern mit dem
Gerät gebaut und mit dem Update geliefert. Den App-Standard erfüllt es sonst:
Bausteine der Bibliothek (Seitenleiste, Datenliste, Kopf, Karte, Dialogform,
Bestätigung, Meldung, Leerzustand), Typen, Tests
(`apps/entwickler-cockpit/src/__tests__/`, mitgefahren von den Tests des
Frontends) und die Regeln der Gestalt (Tokens, drei Größen).

## Abnahme am Orin

Das Entwickler-Cockpit: `scripts/test/entwickler-cockpit-abnahme.mjs`, am
20.11.2026 nach dem Deploy 70 von 70 grün (Abweisung ohne Kennzeichen, alle
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

Am Gerät ändert der Schalter nichts: Entwickler sehen die Fotos in der Liste
(und später im Cockpit) immer. Den Dateinamen am Gerät nennt die Antwort nie.

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
Mitarbeiter, der gemeldet hat, erfährt davon nichts (Regel 2).

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

Der Kit-Befehl, der diese Schnittstelle nutzt (K29); DSGVO-Auskunft mit Rückmeldungen und eine
gemeinsame Drossel je Person (eigene Karte). Kein Chat, kein Agent im Browser,
keine Abstimmung, keine Sicht für andere Mitarbeiter.
