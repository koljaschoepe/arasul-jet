# Apps: das Manifest `app.json`, die zwei Stände und die Anmeldung

> Phasen C3 bis C5 des Umbaus vom 26.08.2026. Die Durchsetzung steht in
> `apps/dashboard-backend/src/schemas/apps.js` (Manifest) und
> `apps/dashboard-backend/src/services/app/appZugang.js` (Anmeldung); wer
> eines davon ändert, ändert beides.
>
> **Wie ein Paket auf das Gerät kommt**, steht auf einer eigenen Seite:
> [APP-PAKET.md](APP-PAKET.md). Diese hier sagt, was eine App IST.

**Eine App ist das, was ein Partner mit dem Ara-Kit baut und auf das Gerät
rollt.** Sie besteht aus höchstens zwei Teilen: einem statischen Frontend, das
Arasul unter `/apps/<id>/` ausliefert, und einem Backend-Container, den Traefik
unter `/apps/<id>/api/` erreicht. Eines von beiden muss sie haben, beides darf
sie haben.

Es gibt keinen App-Katalog mehr, aus dem ein Administrator etwas aussucht. Bis
Phase B7 war eine App ein Container aus einem Laden; seit C3 ist sie etwas, das
jemand geschrieben und hierher gebracht hat.

## Wo eine App am Gerät liegt

```
/arasul/apps/<id>/<version>/app.json
/arasul/apps/<id>/<version>/frontend/index.html
/arasul/apps/<id>/<version>/frontend/…
```

Die Version steht im Pfad, weil zwei Versionen gleichzeitig dort liegen: der
Livestand für alle Freigegebenen und der Teststand für die Tester. Ein Ordner,
den der nächste Deploy überschreibt, könnte das nicht.

Das Verzeichnis ist in `dashboard-backend` als `APPS_DIR` eingehängt
(`compose/compose.app.yaml`), schreibbar. Der Weg, auf dem ein Paket dorthin
kommt, ist seit Phase C5 `POST /api/v1/external/apps`: das Gerät packt aus,
prüft, baut und versioniert selbst ([APP-PAKET.md](APP-PAKET.md)). Der ältere
Weg — das Kit legt die Dateien über SSH ab und ruft
`POST /api/apps/<id>/einspielen` — funktioniert weiter und ruft denselben
Dienst.

## Das Manifest, Fassung 1

```json
{
  "schema": 1,
  "id": "urlaubsantrag",
  "name": "Urlaubsantrag",
  "version": "1.2.0",
  "beschreibung": "Urlaub beantragen, Vertretung eintragen, Freigabe holen.",
  "frontend": { "verzeichnis": "frontend" },
  "backend": {
    "image": "urlaubsantrag:1.2.0",
    "bauen": { "verzeichnis": "backend" },
    "gesundheit": "/gesund",
    "umgebung": { "ABTEILUNG_STANDARD": "Werkstatt" }
  },
  "ports": { "backend": 8080 },
  "ressourcen": { "speicher": "512m", "cpus": 1 },
  "modelle": ["qwen3:14b-q8"],
  "flows": { "verzeichnis": "flows" }
}
```

| Feld           | Pflicht     | Bedeutung                                                                                 |
| -------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `schema`       | ja          | Muss `1` sein. Eine andere Zahl wird abgewiesen, nicht ignoriert.                         |
| `id`           | ja          | Kleinbuchstaben, Ziffern, Bindestrich. Steht im Pfad, im Containernamen, im Router.       |
| `name`         | ja          | Der Anzeigename, wie ein Mensch ihn liest.                                                |
| `version`      | ja          | Drei Zahlen mit Punkten, optional ein Zusatz: `1.2.0`, `1.2.0-rc1`.                       |
| `beschreibung` | nein        | Ein Satz, höchstens 500 Zeichen.                                                          |
| `frontend`     | nein\*      | `{ "verzeichnis": "frontend" }` — wo im Paket die fertigen Dateien liegen.                |
| `backend`      | nein\*      | `{ "image", "bauen"?, "gesundheit"?, "umgebung"? }`                                       |
| `ports`        | mit Backend | `{ "backend": 8080 }` — der Port IM Container.                                            |
| `ressourcen`   | nein        | `{ "speicher": "512m", "cpus": 1 }`, das ist auch die Vorgabe.                            |
| `modelle`      | nein        | Welche Sprachmodelle die App braucht (eine **Forderung**).                                |
| `flows`        | nein        | `{ "verzeichnis": "flows" }` — wo im Paket ihre Flow-Dateien liegen (eine **Lieferung**). |

\* Mindestens eines von `frontend` und `backend`.

`backend.bauen` (Phase C5) sagt, WORAUS das Gerät das Image baut:
`{ "verzeichnis": "backend", "dockerfile": "Dockerfile" }`, beides relativ zum
Paket beziehungsweise zum Bau-Kontext. Mit `bauen` ist `image` der Name, unter
dem das Ergebnis abgelegt wird; ohne `bauen` der Name eines Images, das schon
am Gerät liegt. **Der Deploy-Endpunkt verlangt `bauen`** — er nimmt keine
fertigen Images entgegen. Ein Image-Tar ist ein Dateisystem, das niemand mehr
liest, bevor es läuft, und es ist für eine Architektur gebaut; ein Partner mit
einem x86-Laptop hätte für einen ARM64-Jetson etwas Unbrauchbares geschickt,
ohne es zu merken.

**Unbekannte Felder werden abgewiesen.** Ein Tippfehler oder eine Erwartung an
eine Fassung, die es noch nicht gibt, still zu schlucken hieße, dem Partner zu
bestätigen, dass etwas wirkt, das nichts tut.

**`id` und `version` müssen zum Ordner passen.** Sonst hätte eine App zwei
Namen, je nachdem wen man fragt.

### Was das Manifest NICHT kann

- **Keine Bind-Mounts vom Host.** Eine App bekommt ein Netz, eine Grenze und
  sonst nichts. Braucht sie einen Ordner, ist das ein eigener Beschluss und
  keine Zeile in ihrem eigenen Manifest.
- **Keinen Port am Host.** Erreichbar ist sie unter `/apps/<id>/api/`, sonst
  nirgends. Ein zweiter Weg neben Traefik wäre in Phase C4 nicht mehr zu
  schließen.
- **Keine Geheimnisse in `umgebung`.** Das Manifest liegt im Paket und im
  Kit-Repository des Partners. Den API-Schlüssel je App setzt das Gerät beim
  Einspielen (siehe „Was das Gerät der App mitgibt").
- **Kein Nachinstallieren von Modellen.** `modelle` sagt, welche die App
  verlangt; das Gerät sagt beim Einspielen, was davon fehlt. Ein Deploy, der
  nebenbei sieben Gigabyte lädt, ist keine Installation mehr, sondern ein
  Abend.

## Das Erscheinungsbild einer App (Phase D7)

Eine App bringt ihr Aussehen **nicht mehr selbst mit**. Sie ist React-Code auf
dem Designsystem des Geräts (`packages/marken/`): Schrift, Farben, Abstände und
sechs Bausteine — Kopf, Liste, Karte, Formular, Meldung, Menü.

Der Grund steht auf dem Bildschirm: die App läuft im Rahmen der Shell
(`/apps/<id>/` im iframe), und der Mensch sieht beides als **ein** Ding. Zwei
Erscheinungsbilder übereinander sind kein Geschmack, sondern ein Fehler.

Zwei Wege, eine Quelle:

| Die App hat…      | …und nimmt                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| einen Bauschritt  | die Quelle `packages/marken/src/` (das Ara-Kit spiegelt sie in die Vorlage aus E5) und schreibt JSX |
| keinen Bauschritt | `marken.js` und `marken.css` neben `index.html`, und schreibt `h(Karte, {...})` statt JSX           |

Ohne Bauschritt geht **kein JSX**: JSX braucht einen Übersetzer, und im Browser
übersetzt einer nur mit `eval` — das verbietet die Content-Security-Policy
dieses Geräts. `scripts/util/marken-beilegen.sh` legt die zwei Dateien beim
Einspielen daneben; `tests/beispielapp/` zeigt beides an einem Beispiel, das
läuft.

### Die App folgt dem Theme des Menschen (Phase H2)

Das Theme gehört seit H1 dem angemeldeten Menschen (`admin_users.theme`, Hell
oder Dunkel). Eine App läuft im `iframe` als eigenes Dokument, und
CSS-Variablen reichen nicht über eine Dokumentgrenze — bis H2 stand jede App
deshalb auf den Rückfallwerten von `marken.css`, unabhängig davon, was der
Mensch eingestellt hatte.

Seit H2 reicht die Shell es hinein. Der Rahmen hat dieselbe Herkunft wie die
Shell (deshalb steht an ihm kein `sandbox`, siehe C4), also gibt es zwei Wege,
und beide gehen von der Shell aus:

| Weg                                  | Was dort steht                                        |
| ------------------------------------ | ----------------------------------------------------- |
| `data-theme` am `<html>` der App     | `dark`, oder **gar nichts** — Hell ist der Grund (H1) |
| `postMessage` an das Fenster der App | `{ typ: 'arasul:theme', theme: 'light' \| 'dark' }`   |

**Eine App muss dafür nichts tun.** `marken.css` trägt seit H2 einen Block
`[data-theme='dark']`, also färbt sich alles, was aus der Bibliothek gebaut
ist, von selbst um — die Beispielapp geht diesen Weg und hat keine Zeile
dafür. Die Nachricht ist für eine App, die mehr tut als Farben tauschen (ein
Bild, ein Diagramm): sie nennt den Wert ausdrücklich, während „kein Attribut"
für fremden Code keine Auskunft ist.

Ein dritter Weg braucht von der Shell nichts und steht der App frei: das
`<html>` des **Elternfensters** lesen und mit einem `MutationObserver` darauf
hören. So macht es die Vorlage des Ara-Kits.

Der Wechsel **lädt den Rahmen nicht neu**: das Theme steht weder im `key` noch
in der Adresse des `iframe`, und der App-Tab bleibt stehen, während der Mensch
in den Einstellungen ist. Eine App verliert dabei also nichts — auch kein halb
ausgefülltes Formular.

**Eine App, die schon am Gerät liegt, bekommt die neue `marken.css` erst beim
nächsten Einspielen.** Die Datei liegt neben ihr und nicht in der Shell.

## Die Flows einer App (Phase C6)

Bis C5 war `flows` eine Liste von Namen und damit eine **Forderung**: „diese
Flows müssen am Gerät liegen". Das Paket brachte keine mit, und wer eine App
ausrollte, baute ihre Flows getrennt davon von Hand nach; ob beides
zusammenpasste, zeigte sich beim ersten Lauf.

Seit C6 ist `flows` ein Verzeichnis und damit eine **Lieferung**, genau wie
`frontend`:

```
app.json          "flows": { "verzeichnis": "flows" }
flows/bericht.md  ein Flow: YAML-Kopf, darunter der Auftrag als Markdown
flows/pruefen.md  noch einer
```

Beim Einspielen registriert das Gerät sie **je App und Stand** (`app_flows`).
Der Namensraum ist damit die App: zwei Apps dürfen beide einen `bericht` haben,
ohne voneinander zu wissen, und der `bericht` des Teststandes ist ein anderer
Gegenstand als der des Livestandes — der Teststand ist eine andere Version.

Was für einen Flow **aus einem Paket** zusätzlich gilt:

| Regel                                              | Warum                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Eine `.md` je Flow, der **Dateiname ist der Name** | Ein Flow mit zwei Namen ist einer, den man beim nächsten Mal nicht wiederfindet.                                   |
| Steht `name:` im Kopf, muss er derselbe sein       | Dieselbe Regel wie `id`/`version` gegen den Ordner des Manifests.                                                  |
| **Kein `ordner`**                                  | `ordner` sind absolute Pfade am Gerät; ein Paket könnte `/arasul/config` deklarieren und die Umgebungsdatei lesen. |
| Höchstens 50 Flows je Paket                        | Dieselbe Vorsicht wie bei der Größe des Archivs.                                                                   |

Weil `ordner` nicht geht, hat ein App-Flow heute **keine Datei-Werkzeuge**
(`schemas/flows.js` verlangt für die ohnehin einen Ordner). Ein abgeschirmter
Datenordner je App braucht ein Volume, einen Platz in der Sicherung und einen
im Werksreset — ein eigener Beschluss, kein Nebeneffekt. Bis dahin ist die
ehrliche Antwort eine Abweisung mit Begründung und kein halb gesperrter Pfad.

### Wer entscheidet, mit welchem Modell ein Flow läuft

Zwei Menschen, und sie entscheiden über Verschiedenes:

| Wer             | Was                                        | Wo                                     |
| --------------- | ------------------------------------------ | -------------------------------------- |
| der **Partner** | was der Flow tut, und womit er gemeint war | `modell:` im Kopf der Flow-Datei       |
| der **Kunde**   | womit er auf **diesem** Gerät läuft        | `flow_settings` (Tabelle, keine Datei) |

Der Administrator setzt es mit
`PUT /api/apps/<id>/flows/<name>/modell` und nimmt es mit `{"modell": null}`
zurück. **Seine Entscheidung überlebt ein App-Update**, und genau deshalb steht
sie in der Datenbank: schriebe er sie in die Flow-Datei, wäre sie beim nächsten
Paket weg — die Datei gehört dem Partner. So bleibt beides ganz, und ein Deploy
muss keine Datei aussparen.

Sie gilt **ohne Stand**: „welches Modell treibt diesen Flow" meint den Flow,
nicht die Fassung, mit der jemand gerade testet.

Seit Phase D4 trifft er sie **im Browser**, in der App-Ansicht unter
Einstellungen → Apps, und er hat dort eine dritte Wahl: ein Modell bei einem
Anbieter **draußen** (`{"extern": {anbieter, modell, basis_url, schluessel}}`
am selben Weg). `basis_url` ist eine OpenAI-kompatible Adresse ohne
`/chat/completions` — dasselbe Feld passt auf OpenAI, auf Azure, auf ein
gemietetes vLLM und auf ein Gateway im eigenen Netz. Der Schlüssel wird
verschlüsselt abgelegt und nie wieder angezeigt (`flow_settings`,
AES-256-GCM); lokal und extern schließen einander aus, denn ein Flow läuft auf
einem Modell. Rechnet ein Flow draußen, tun es auch seine Delegationen und sein
Prüfschritt — ein Lauf, der halb draußen und halb hier rechnet, wäre das
Gegenteil einer Entscheidung.

**Kein eigener Einstellungsbereich für externe Modelle** (Entscheidung vom
26.08.2026). Ein solcher Bereich wäre eine Liste von Zugängen, von denen
niemand mehr sagen könnte, welcher Flow sie benutzt.

### Starten

Eine App startet ihren eigenen Flow über die externe Schnittstelle, mit dem
Schlüssel, den das Gerät ihr beim Einspielen mitgegeben hat (C4):

```
POST /api/v1/external/flows/bericht/run
X-API-Key: <ARASUL_API_SCHLUESSEL>
{ "args": { "woche": "34" } }
```

**Nur eigene Flows.** Das steht nicht als Prüfung in der Route, sondern in der
Auswahl der Quelle: der Schlüssel trägt `app_id` und `stand`, und damit sucht
das Gerät in `app_flows` mit beiden im `WHERE`. Eine App kann den Flow einer
anderen nicht einmal benennen. Eine Prüfung kann man an einer von drei Routen
vergessen; ein `WHERE` nicht.

Der Lauf landet mit allen Schritten in `flow_runs`/`flow_run_steps` und trägt
`app_id` und `stand` mit.

### Nachlesen, was ein Lauf getan hat (Phase D4)

`GET /api/apps/<id>/laeufe` nennt die Läufe **dieser App** (nicht die des
angemeldeten Menschen — ein App-Lauf trägt als Nutzer den, dem der Schlüssel
gehört), `GET /api/apps/<id>/laeufe/<nr>` einen davon samt Schritten. Vier
Arten von Schritt:

| `kind`     | was er ist                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| `werkzeug` | ein Werkzeug-Aufruf, mit `input` und `output`                                |
| `subagent` | eine Delegation an eine Rolle; ihre inneren Schritte tragen `parent_step_id` |
| `modell`   | der **Gedankengang**: was das Modell sagte, bevor es ein Werkzeug rief       |
| `hinweis`  | ein Vermerk des Runners                                                      |

Der Gedankengang ist seit D4 dabei. Bis dahin meldete die Werkzeug-Schleife nur
die letzte Runde; der Satz, mit dem das Modell seinen nächsten Handgriff
begründet, fiel lautlos weg, und im Protokoll stand eine Kette von Werkzeugen
ohne ein Wort dazu.

## Die zwei Stände

Je App höchstens zwei: `live` und `test`, jeder mit eigener Version, eigenem
Manifest und eigenem Container.

| Stand  | Pfad des Frontends | Pfad des Backends      | Container              |
| ------ | ------------------ | ---------------------- | ---------------------- |
| `live` | `/apps/<id>/`      | `/apps/<id>/api/`      | `arasul-app-<id>-live` |
| `test` | `/apps/<id>/test/` | `/apps/<id>/test/api/` | `arasul-app-<id>-test` |

**Warum getrennte Pfade und nicht ein Pfad je Nutzer:** Traefik entscheidet
über die Route, bevor irgendeine Prüfung gelaufen ist. Welchen Stand ein
bestimmter Mensch sehen darf, weiß erst die Anmeldung — das lässt sich nicht in
eine Routing-Regel schreiben. Zwei Pfade lösen dasselbe ohne diesen Widerspruch.

Ein Frontend merkt davon nichts, **wenn es seine Schnittstelle relativ
aufruft**: `fetch('api/hallo')` löst sich gegen das Verzeichnis der Seite auf
und trifft in beiden Ständen das richtige Backend. Dieselbe Datei, beide Stände.
Ein absoluter Pfad (`/apps/urlaub/api/hallo`) zeigt im Teststand auf den
Livestand — das ist die eine Regel, die eine App einhalten muss.

Zwei Namen sind damit vergeben, und beide aus demselben Grund:

- **`test` als App-Kennung.** `/apps/test/` wäre ein Pfad, der zweimal etwas
  anderes bedeutet; das Schema weist die Kennung ab.
- **`test` als erstes Stück einer Route der App.** `/apps/urlaub/test` ist der
  Teststand von `urlaub`, nicht die Seite `test` der App `urlaub`. Wer eine
  solche Route braucht, nennt sie anders — `/apps/urlaub/tests` oder
  `/apps/urlaub/pruefung` gehen beide.

Ebenso vergeben ist `api`: alles unter `/apps/<id>/api/` gehört dem Container
der App und wird nie als Datei ausgeliefert.

## Der Tester-Kreis

Wer eine App sieht, steht in `app_members` (Migration 168). Seit 169 trägt jede
Freigabe ein Wort dazu, wie weit sie reicht:

- `live` — der Normalfall: der Mensch sieht `/apps/<id>/`.
- `test` — ein Tester: er sieht zusätzlich `/apps/<id>/test/`.

Ein Tester ist kein anderer Nutzer, sondern ein Nutzer mit einer Tür mehr.
Gesetzt wird das über `POST /api/freigaben` mit `{ "stand": "test" }`; gelesen
über `GET /api/apps/meine`. Im Browser steht es an zwei Stellen, und beide
schreiben denselben Weg: in der Freigabe-Matrix (Einstellungen → Mitarbeiter,
D3) für das ganze Gerät, und in der App-Ansicht (Einstellungen → Apps, D4) für
diese eine App.

Auch ein Administrator, der eine App benutzen will, braucht sie freigegeben.
Eine Sonderregel „Admins sehen alles" wäre eine zweite Wahrheit neben der
Tabelle (Entscheidung aus C2).

## Wer liefert was aus

```
Browser → Traefik ─┬─ /apps/<id>/api/me   (Zahl 50) → dashboard-backend
                   ├─ /apps/<id>/test/api (Zahl 45) → Container des Teststandes
                   ├─ /apps/<id>/api      (Zahl 40) → Container der App
                   ├─ /apps               (Zahl 30) → dashboard-backend, statisch
                   └─ /                   (Zahl  1) → dashboard-frontend
```

Arasul liefert die statischen Dateien selbst aus und nicht der
Frontend-Container: nur das Backend kennt die Anmeldung und damit die Frage,
welche App wem freigegeben ist. Die Prüfung steht seit C4 darin, siehe „Die
Anmeldung".

Eine Anfrage an `/apps/<id>/api/…`, die trotzdem beim Backend ankommt, ist ein
`404` mit Grund und **nicht** die Startseite der App. Ein Frontend, das auf
seine Schnittstelle HTML zurückbekommt, meldet einen Fehler, der nach einem
Fehler der App aussieht.

## Was ein Stand „lieferbar" nennt

> Auftrag app-leiche, 28.08.2026.

Ein Stand besteht aus drei Dingen, und keines weiß vom anderen: der Zeile in
`app_staende`, dem Container und den Dateien unter `/arasul/apps/<id>/<version>/`.
Am Orin stand `urlaubsantrag` als `test` **und** `live`, beide Container
liefen und meldeten `healthy`, und den Ordner gab es nicht — `GET
/apps/urlaubsantrag/` endete in `INTERNAL_ERROR`, und keine Ansicht zeigte
etwas Rotes.

**Der Healthcheck des Containers prüft das Backend, sonst nichts.** Er ruft
`backend.gesundheit` am Port der App auf (`appContainer.containerBeschreibung`).
Das Frontend liegt nicht im Container, sondern am Host, und ausliefern tut es
Arasul; dass es fehlt, kann der Container nicht wissen. Deshalb rechnet das
Gerät die Gesundheit eines **Standes** selbst, aus beiden Quellen
(`appStore.standZustand`):

| Feld        | Woher                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| `backend`   | Docker: läuft er, was sagt seine eigene Prüfung (`healthy`, `unhealthy`) |
| `dateien`   | die Platte: `app.json` da, `index.html` des Frontends da (`null` ohne)   |
| `lieferbar` | bekommt ein Mensch, der auf die Kachel klickt, diese App?                |
| `mangel`    | wenn nicht: warum, als ein Satz                                          |

`GET /api/apps` und `GET /api/apps/:id` tragen alle vier je Stand. Die
Verwaltung (Einstellungen → Apps) zeigt einen Stand ohne `lieferbar` rot,
schon in der Liste; `GET /api/apps/meine` lässt einen Stand ohne Frontend
weg, damit kein Mitarbeiter eine Kachel bekommt, hinter der nichts ist; und
`GET /apps/<id>/` antwortet mit **`503 APP_DATEIEN_FEHLEN`** und dem Satz,
was zu tun ist, statt mit `INTERNAL_ERROR`.

**Aufgeräumt wird nicht von selbst.** Beim Start sieht das Backend einmal
nach und schreibt je Stand ohne Dateien eine Warnung ins Protokoll
(`appStore.pruefeStaende`) — mehr nicht. Docker legt eine fehlende Bind-Quelle
beim Start als leeren Ordner an (Falle aus dem Werksreset vom 28.08.2026); ein
Backend, das bei leerem `/arasul/apps` jeden Stand löschte, hätte nach einem
verrutschten Mount das Gerät leergeräumt. Entfernen tut ein Mensch, und die
Ansicht sagt ihm, welche.

## Die Anmeldung

> Phase C4.

**Eine App bekommt keine eigene Anmeldung.** Wer an Arasul angemeldet ist und
die App freigegeben hat, ist in der App angemeldet; wer nicht, kommt nicht
hinein. Ein Partner baut keine Anmeldemaske, verwaltet keine Passwörter und
speichert keine Sitzungen — das ist eines der drei Dinge, die die Lizenz kauft.

Geprüft wird an zwei Stellen, aber nach **einer** Regel
(`services/app/appZugang.js`):

| Weg                 | Wer prüft                                               |
| ------------------- | ------------------------------------------------------- |
| `/apps/<id>/…`      | Arasul selbst, beim Ausliefern der Seite                |
| `/apps/<id>/api/…`  | Traefik per Forward-Auth auf `GET /api/apps/:id/zugang` |
| `/apps/<id>/api/me` | Arasul selbst                                           |

Die Forward-Auth hängt als Etikett am Container der App
(`services/app/appContainer.js`), nicht in `middlewares.yml`: sie trägt Kennung
und Stand, und beides weiß nur, wer den Container anlegt.

### Was die App über den Aufrufer erfährt

| Kopfzeile       | Inhalt                      |
| --------------- | --------------------------- |
| `X-Arasul-User` | Der Benutzername, als UTF-8 |
| `X-Arasul-Role` | `admin` oder `mitarbeiter`  |

**Beide sind nicht fälschbar.** Traefik löscht sie aus der eingehenden Anfrage,
bevor es sie aus der Antwort der Anmeldung neu setzt
(`forwardauth.authResponseHeaders`). Ein Browser, der `X-Arasul-User: chef`
mitschickt, kommt damit nicht durch.

Der Name steht als UTF-8 in der Kopfzeile, nicht als Latin-1. In Node liest man
ihn mit `Buffer.from(kopf, 'latin1').toString('utf8')`. Wer das nicht möchte,
fragt `api/me`:

```js
const ich = await (await fetch('api/me')).json();
ich.data.benutzer; // "anna"
ich.data.rolle; // "mitarbeiter"
```

`api/me` ist der **dritte vergebene Name** unter `/apps/<id>/` — nach `test`
und `api` — und der einzige, der einer App etwas wegnimmt. Der Grund: eine App
darf ganz ohne Backend auskommen, und dann gäbe es niemanden, der die Frage
beantworten könnte. Vergeben ist genau dieser eine Weg;
`/apps/<id>/api/meine-antraege` gehört weiter der App.

### Was zurückkommt, wenn jemand nicht darf

| Zustand                                   | Seite         | Schnittstelle |
| ----------------------------------------- | ------------- | ------------- |
| keine Sitzung                             | `302` auf `/` | `401`         |
| Sitzung, App nicht freigegeben            | `403`         | `403`         |
| Freigabe nur `live`, Teststand aufgerufen | `403`         | `403`         |
| Freigabe, aber diesen Stand gibt es nicht | `404`         | `404`         |

Die Seite zieht zur Anmeldung um, die Schnittstelle nicht: ein `fetch` der App
bekäme auf einen Umzug die Anmeldeseite als HTML zurück und meldete einen
Fehler, der nach einem Fehler der App aussieht — genau der Fall aus „Wer
liefert was".

**Erst die Freigabe, dann die Existenz.** Eine App, die es am Gerät nicht gibt,
ist `403` und nicht `404`. Sonst wäre die Liste der Apps eines Unternehmens für
jeden angemeldeten Menschen abzählbar.

## Was das Gerät der App mitgibt

Beim Einspielen setzt das Gerät zwei Umgebungsvariablen in den Container, über
das hinaus, was `backend.umgebung` im Manifest nennt:

| Variable                | Inhalt                                          |
| ----------------------- | ----------------------------------------------- |
| `ARASUL_API_URL`        | `http://dashboard-backend:3001/api/v1/external` |
| `ARASUL_API_SCHLUESSEL` | Der API-Schlüssel dieser App und dieses Standes |

Damit kann eine App ein Sprachmodell fragen, Text aus einer Datei holen und
einen Flow anstoßen — dieselben Wege, die eine Automatisierung von außen geht,
nur ohne Umweg über Traefik: die App hängt im selben Docker-Netz.

```js
await fetch(`${process.env.ARASUL_API_URL}/models`, {
  headers: { 'x-api-key': process.env.ARASUL_API_SCHLUESSEL },
});
```

**Je Stand einer**, nicht je App einer: der Teststand ist eine andere Version,
die jemand gerade ausprobiert, und was dort in einem Protokoll landet, soll den
Livestand nichts kosten.

**Bei jedem Einspielen ein neuer.** In der Datenbank steht nur der
bcrypt-Abdruck; den Klartext gibt es genau einmal, im Augenblick des Anlegens.
Ihn daneben verschlüsselt abzulegen, um ihn später noch einmal in einen
Container schreiben zu können, wäre ein zweiter Ort, an dem ein gültiger
Schlüssel liegt — und gebraucht würde er nie, weil das Einspielen den Container
ohnehin **ersetzt** statt ihn neu zu starten. Ein Neustart durch Docker
(Gerätestart, `unless-stopped`) behält die Umgebung und damit den Schlüssel.

Was der Schlüssel darf, steht in `VORGABE_ENDPUNKTE`
(`middleware/apiKeyAuth.js`): `llm:chat`, `llm:status`, `document:extract`,
`document:analyze`, `flow:run`. Dieselbe Liste bekommt ein Schlüssel, den ein
Administrator von Hand anlegt.

## Der Lebenslauf

1. Der Partner baut die App mit dem Ara-Kit und schickt das Paket an
   `POST /api/v1/external/apps` ([APP-PAKET.md](APP-PAKET.md)). Das Gerät packt
   aus, legt unter `/arasul/apps/<id>/<version>/` ab und **baut das Image**.
2. Es rollt in den **Teststand**. Einen Parameter dafür gibt es nicht.
3. Benannte Tester probieren unter `/apps/<id>/test/`.
4. Ein Mensch schaltet live: in der Oberfläche unter Einstellungen → Apps
   (seit Phase D4, `POST /api/apps/<id>/schalten`) oder aus dem Kit heraus
   (`POST /api/v1/external/apps/<id>/schalten`, C5), beide mit
   `{"ziel":"live"}`. Zurück auf die Version davor geht es mit
   `{"ziel":"zurueck"}` — das ist ein Tausch, wer ihn zweimal ruft, ist wieder
   da, wo er angefangen hat. Zwei Wege und ein Dienst dahinter: das Kit
   schaltet, wenn der Partner ausgeliefert hat, der Administrator, wenn **er**
   den Teststand gesehen hat.
5. `DELETE /api/apps/<id>` (Sitzung) oder
   `DELETE /api/v1/external/apps/<id>?bestaetigung=<id>` (Schlüssel) entfernt
   beide Container **mitsamt ihren Volumes**, beide Stände, alle Freigaben und
   die Schlüssel der App. Die Dateien bleiben liegen — wer eine App aus dem
   Kit heraus entfernt, will sie üblicherweise gleich wieder einspielen; mit
   `?dateien=true` gehen sie mit. Ein Mensch nimmt den Weg in der Oberfläche
   (Einstellungen → Apps → **App entfernen**, seit dem Auftrag app-leiche vom
   28.08.2026): die Rückfrage ist dieselbe wie die des Kits — die Kennung
   abtippen —, und die Dateien gehen mit, denn ein Kunde, der eine App
   loswerden will, will sie ganz los sein. Aufgeräumt wird sonst beim
   Werksreset.

Schritt 1 und 2 gehen auch anders herum, wenn jemand ohnehin am Gerät sitzt:
Dateien nach `/arasul/apps/<id>/<version>/` legen und
`POST /api/apps/<id>/einspielen` rufen. Das ist derselbe Dienst, nur mit einer
Sitzung statt eines Schlüssels — zwei Wege in das Gerät, eine Logik dahinter.

## Grenzen

`maxApps` aus `FEATURE_TIERS` (`services/app/licenseService.js`) greift beim
Einspielen einer **neuen** App. Eine neue Version einer App, die schon am Gerät
ist, fällt nicht darunter: ein abgelaufener Schlüssel darf kein Update
blockieren, das vielleicht genau den Fehler behebt, wegen dem jemand anruft.

## Die Beispielapp

`tests/beispielapp/` ist die kleinste App, die beide Wege ausübt. Sie gehört
**nicht zum Auslieferungsumfang**: keine Compose-Datei erwähnt sie, kein Setup
installiert sie, `.dockerignore` schließt `**/tests/` aus jedem Image aus.

```bash
# auf dem Gerät
bash scripts/test/beispielapp.sh einspielen
bash scripts/test/beispielapp.sh entfernen

# vom Arbeitsrechner, durch den Tunnel
bash scripts/test/apps-abnahme.sh           # misst beide Pfade (C3)
bash scripts/test/app-anmeldung-abnahme.sh  # misst die Anmeldung (C4)
bash scripts/test/deploy-abnahme.sh         # misst den Deploy-Endpunkt (C5)
```

`deploy-abnahme.sh` spielt den Inhalt der Beispielapp unter einer **eigenen
Kennung** (`beispielapp-deploy`) ein und räumt am Ende alles weg, was es
angelegt hat. Unter derselben Kennung wäre das das Ende der App, die die
C3/C4-Abnahmen brauchen.
