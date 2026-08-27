# Apps: das Manifest `app.json`, die zwei Stände und die Anmeldung

> Phasen C3 und C4 des Umbaus vom 26.08.2026. Die Durchsetzung steht in
> `apps/dashboard-backend/src/schemas/apps.js` (Manifest) und
> `apps/dashboard-backend/src/services/app/appZugang.js` (Anmeldung); wer
> eines davon ändert, ändert beides.

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
(`compose/compose.app.yaml`). Der Weg, auf dem ein Paket dorthin kommt
(`POST /api/v1/apps`, gebaut und versioniert am Gerät), ist Phase C5; bis dahin
legt es das Kit über SSH ab.

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
    "gesundheit": "/gesund",
    "umgebung": { "ABTEILUNG_STANDARD": "Werkstatt" }
  },
  "ports": { "backend": 8080 },
  "ressourcen": { "speicher": "512m", "cpus": 1 },
  "modelle": ["qwen3:14b-q8"],
  "flows": ["urlaub-pruefen"]
}
```

| Feld           | Pflicht     | Bedeutung                                                                           |
| -------------- | ----------- | ----------------------------------------------------------------------------------- |
| `schema`       | ja          | Muss `1` sein. Eine andere Zahl wird abgewiesen, nicht ignoriert.                   |
| `id`           | ja          | Kleinbuchstaben, Ziffern, Bindestrich. Steht im Pfad, im Containernamen, im Router. |
| `name`         | ja          | Der Anzeigename, wie ein Mensch ihn liest.                                          |
| `version`      | ja          | Drei Zahlen mit Punkten, optional ein Zusatz: `1.2.0`, `1.2.0-rc1`.                 |
| `beschreibung` | nein        | Ein Satz, höchstens 500 Zeichen.                                                    |
| `frontend`     | nein\*      | `{ "verzeichnis": "frontend" }` — wo im Paket die fertigen Dateien liegen.          |
| `backend`      | nein\*      | `{ "image", "gesundheit"?, "umgebung"? }`                                           |
| `ports`        | mit Backend | `{ "backend": 8080 }` — der Port IM Container.                                      |
| `ressourcen`   | nein        | `{ "speicher": "512m", "cpus": 1 }`, das ist auch die Vorgabe.                      |
| `modelle`      | nein        | Welche Sprachmodelle die App braucht.                                               |
| `flows`        | nein        | Welche Flows sie mitbringt.                                                         |

\* Mindestens eines von `frontend` und `backend`.

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
- **Kein Nachinstallieren.** `modelle` und `flows` sagen, was die App verlangt;
  das Gerät sagt beim Einspielen, was davon fehlt. Ein Deploy, der nebenbei
  sieben Gigabyte lädt, ist keine Installation mehr, sondern ein Abend.

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
über `GET /api/apps/meine`.

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

1. Der Partner baut die App mit dem Ara-Kit und legt sie unter
   `/arasul/apps/<id>/<version>/` ab.
2. `POST /api/apps/<id>/einspielen` bringt die Version in den **Teststand**.
   Ohne Angabe geht es dorthin; live schaltet ein Mensch.
3. Benannte Tester probieren unter `/apps/<id>/test/`.
4. Der Administrator schaltet auf live (Endpunkt in Phase C5).
5. `DELETE /api/apps/<id>` entfernt beide Container, beide Stände und alle
   Freigaben. Die Dateien bleiben liegen — wer eine App entfernt, will sie
   üblicherweise gleich wieder einspielen. Aufgeräumt wird beim Werksreset.

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
```
