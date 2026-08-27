# Das App-Paket: was hineingehört und wie der Schlüssel entsteht

> Phase C5 des Umbaus vom 26.08.2026. Diese Seite ist für den, der eine App
> baut — mit dem Ara-Kit oder von Hand. Was eine App **ist**, steht in
> [APPS.md](APPS.md); die Endpunkte im Einzelnen in
> [API_REFERENCE.md](../api/API_REFERENCE.md#deploy-für-das-ara-kit-phase-c5).

Ein Partner bringt eine App auf ein Gerät, indem er ein **Paket** an eine
Schnittstelle schickt. Er braucht dafür keinen SSH-Zugang, kein Passwort und
keine Sitzung — nur einen API-Schlüssel, den der Betreiber ihm gibt und
jederzeit wieder nehmen kann.

```bash
tar czf paket.tgz -C meineapp .

curl -k -X POST https://arasul.local/api/v1/external/apps \
  -H "x-api-key: $ARASUL_SCHLUESSEL" \
  -F "paket=@paket.tgz"
```

Das Gerät packt aus, prüft, legt unter `/arasul/apps/<id>/<version>/` ab, **baut
das Backend-Image aus dem Dockerfile im Paket**, startet den Container und
trägt die Version als **Teststand** ein. Antwort `201`.

## Was hineingehört

```
meineapp/
  app.json              das Manifest, Fassung 1 — siehe APPS.md
  frontend/
    index.html          FERTIG gebaut. Das Gerät liefert aus, es baut keine Seite.
    …
  backend/
    Dockerfile          Der Bauplan. Gebaut wird AM GERÄT.
    …                   sein Kontext
```

`frontend` und `backend` heißen so, weil das Manifest es sagt
(`frontend.verzeichnis`, `backend.bauen.verzeichnis`); wer andere Namen will,
schreibt sie dort hinein. Eine App braucht mindestens eines von beiden.

**`app.json` liegt im Wurzelverzeichnis des Archivs.** Gepackt wird der
_Inhalt_ des Ordners (`tar czf paket.tgz -C meineapp .`), nicht der Ordner
selbst (`tar czf paket.tgz meineapp/`). Sonst weiß das Gerät nicht, welcher der
Ordner der richtige ist, und weist das Paket mit genau diesem Hinweis ab.

## Was nicht hineingehört

| Was                                    | Warum nicht                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ein fertiges Image** (`docker save`) | Ein Image-Tar ist ein Dateisystem, das niemand mehr liest, bevor es läuft — und es ist für **eine** Architektur gebaut. Ein x86-Laptop kann für einen ARM64-Jetson kein brauchbares Tar bauen, ohne dass es jemand merkt.                                                                           |
| **Symlinks und Hardlinks**             | Sie können aus dem Zielordner herauszeigen. `frontend/geheim -> /arasul/config/.env` wäre eine Datei, die Arasul anschließend jedem Freigegebenen ausliefert. Das Paket wird abgewiesen, nicht bereinigt: eine App, der still etwas fehlt, lässt den Partner den Fehler in seinem Quelltext suchen. |
| **Gerätedateien, Sockets, FIFOs**      | Haben in einem App-Paket keinen denkbaren Zweck.                                                                                                                                                                                                                                                    |
| **`node_modules/`**                    | Kein Verbot, aber die Grenzen greifen: 200 MB Archiv, 500 MB ausgepackt, 20 000 Einträge. Ein `.dockerignore` im Bau-Kontext hilft ohnehin mehr als ein großes Paket.                                                                                                                               |
| **Geheimnisse in `backend.umgebung`**  | Das Manifest liegt im Paket **und** im Repository des Partners. Den API-Schlüssel setzt das Gerät (unten).                                                                                                                                                                                          |
| **Flow-Dateien**                       | `flows` im Manifest ist eine _Forderung_, keine Lieferung. Das Gerät sagt beim Einspielen, welcher Flow fehlt; einen zu überschreiben, den ein Mensch am Gerät bearbeitet hat, wäre ein Deploy, der mehr tut, als er ankündigt.                                                                     |

## Der Weg einer Version

```
POST   /api/v1/external/apps                       →  Teststand
                                                       /apps/<id>/test/
POST   /api/v1/external/apps/<id>/schalten
       {"ziel":"live"}                             →  Livestand
                                                       /apps/<id>/
       {"ziel":"zurueck"}                          →  die Version davor
DELETE /api/v1/external/apps/<id>?bestaetigung=<id>
```

**Ein Deploy rollt immer in den Teststand.** Einen Parameter dafür gibt es
nicht. Live schaltet ein Mensch, und das ist keine Bequemlichkeitsfrage: der
Livestand ist das, womit die Belegschaft arbeitet.

**Eine Version, die gerade live ist, wird nicht überschrieben** (`409`). Die
Dateien liegen je Version und nicht je Stand; dieselbe Nummer noch einmal zu
schicken hieße, die Seite zu tauschen, mit der gerade jemand arbeitet, ohne dass
jemand geschaltet hätte. Eine neue Fassung bekommt eine neue Nummer — dafür sind
Versionsnummern da.

**`zurueck` ist ein Tausch**, keine Einbahnstraße: was live war, wird die vorige
Version. Wer ein zweites Mal `zurueck` ruft, ist wieder da, wo er angefangen
hat. Die Erinnerung nach dem Zurückschalten zu löschen hätte den Fall „ich habe
zu früh zurückgeschaltet" unumkehrbar gemacht, und genau in diesem Fall drückt
jemand hastig Knöpfe.

**`DELETE` fragt zurück.** Die Rückfrage einer Schnittstelle ist kein Dialog,
sondern ein Wort, das der Aufrufer abtippen muss: `?bestaetigung=<id>`. Es
fallen beide Container **mitsamt ihren Volumes**, beide Stände, alle Freigaben
und die Schlüssel der App. Mit `&dateien=true` auch die Ordner unter
`/arasul/apps/<id>/`.

## Der Schlüssel

Der Deploy hängt an einem API-Schlüssel mit dem Bereich **`app:deploy`**. Er
steht in derselben Tabelle wie jeder andere Schlüssel (`api_keys`), gehört dem
Administrator des Geräts und ist von ihm jederzeit widerrufbar.

**Am Gerät**, auch direkt nach der Installation und ohne Anmeldung:

```bash
cd ~/arasul/arasul-jet
bash scripts/util/kit-schluessel.sh anlegen "Kit von Firma Meier"
bash scripts/util/kit-schluessel.sh liste
bash scripts/util/kit-schluessel.sh widerrufen aras_ab12cd3
```

**Über die Schnittstelle**, wenn der Administrator ohnehin angemeldet ist:

```bash
curl -X POST https://arasul.local/api/v1/external/api-keys \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Kit von Firma Meier","allowed_endpoints":["app:deploy"]}'
```

**Der Klartext erscheint genau einmal.** In der Datenbank steht nur der
bcrypt-Abdruck. Wer ihn verliert, legt einen neuen an und widerruft den alten;
nachschlagen geht nicht, und das ist der Sinn der Sache.

`app:deploy` steht **nicht** in den Vorgabe-Bereichen
(`apps/dashboard-backend/src/config/apiBereiche.js`). Der Schlüssel, den das
Gerät jeder App beim Einspielen selbst mitgibt (`ARASUL_API_SCHLUESSEL`, Phase
C4), trägt ihn also nicht: keine App ersetzt eine andere — und sich selbst auch
nicht durch etwas anderes.

## Der Kontrakt: woran ein Kit merkt, dass es nicht passt

```bash
curl -H "x-api-key: $ARASUL_SCHLUESSEL" https://arasul.local/api/v1/external/contract
```

`GET /api/v1/external/contract` ist die **einzige** Quelle, gegen die ein Kit
seine Vorlage prüft. Er gibt aus:

| Feld               | Was darin steht                                                           |
| ------------------ | ------------------------------------------------------------------------- |
| `kontrakt`         | Die Kontraktversion — die Zahl, an der ein Kit merkt, dass es nicht passt |
| `arasul`           | Die Systemversion des Geräts (sagt nichts über den Vertrag)               |
| `app_json`         | `app.json` als JSON-Schema, plus die Regeln, die kein Schema trägt        |
| `flow_frontmatter` | Der YAML-Kopf einer Flow-Datei als JSON-Schema                            |
| `koepfe`           | `X-Arasul-User`, `X-Arasul-Role` und die möglichen Rollen                 |
| `umgebung`         | Was das Gerät dem Container einer App mitgibt                             |
| `paket`            | Format, Packbefehl, Grenzen, Regeln                                       |
| `apps`             | Die Pfade unter `/apps/<id>/` und die Namen, die der Plattform gehören    |
| `schluessel`       | Kopfzeile, Präfix, alle Bereiche und die Vorgabe                          |
| `endpunkte`        | Verb, Pfad und der Bereich, den jeder verlangt                            |

**`app_json.regeln` ist kein Beiwerk.** Zod übergeht seine `.refine`-Regeln
beim Erzeugen des JSON-Schemas still, und im Manifest sind gerade das die
interessanten: „mindestens eines von Frontend und Backend", „mit Backend braucht
es einen Port", „die Kennung `test` ist vergeben". Ein Kit, das nur gegen das
Schema prüft, hielte ein Manifest für gültig, das das Gerät abweist.

Die Kontraktversion zählt hoch, wenn sich etwas ändert, worauf ein Kit sich
verlassen hat — nicht, wenn eine Beschreibung präziser wird. Ein Test hält
einen Fingerabdruck des Kontraktes fest
(`apps/dashboard-backend/__tests__/unit/appKontrakt.test.js`) und fällt um,
sobald sich etwas ändert, ohne dass die Zahl mitgeht.

## Was schiefgehen kann

| Antwort | Bedeutung                                                                                                                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`   | Kein oder kein gültiger Schlüssel                                                                                                                                                                                                       |
| `403`   | Der Schlüssel hat `app:deploy` nicht                                                                                                                                                                                                    |
| `400`   | Das Paket geht nicht durch: kein `app.json` im Wurzelverzeichnis, ein Symlink darin, ein Feld, das es nicht gibt, ein fehlender Bauplan — oder der Bau am Gerät ist gescheitert (die letzten Zeilen der Bauausgabe stehen in `details`) |
| `409`   | Diese Version ist gerade live; oder: es gibt keinen Teststand zum Schalten, keine vorige Version zum Zurückschalten, oder die Lizenz erlaubt keine weitere App                                                                          |
| `413`   | Das Archiv ist größer als 200 MB                                                                                                                                                                                                        |
| `429`   | Zu viele Uploads in kurzer Zeit                                                                                                                                                                                                         |

## Gemessen wird das mit

```bash
bash scripts/test/deploy-abnahme.sh
```

Es geht den ganzen Weg über die externe API — Kontrakt, Deploy, Schalten,
Zurückschalten, Rückfrage, Entfernen — und räumt am Ende alles weg, was es
angelegt hat. Ohne `ARASUL_KIT_SCHLUESSEL` meldet es sich einmal als
Administrator an, legt sich einen Wegwerf-Schlüssel an und widerruft ihn.
