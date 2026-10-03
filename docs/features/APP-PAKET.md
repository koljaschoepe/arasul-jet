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
  flows/
    bericht.md          Ein Flow der App (C6): YAML-Kopf, darunter der Auftrag.
    …
```

`frontend`, `backend` und `flows` heißen so, weil das Manifest es sagt
(`frontend.verzeichnis`, `backend.bauen.verzeichnis`, `flows.verzeichnis`); wer
andere Namen will, schreibt sie dort hinein. Eine App braucht mindestens eines
von `frontend` und `backend`; `flows` ist immer freiwillig.

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
| **Ein `ordner:` in einer Flow-Datei**  | `ordner` sind absolute Pfade am Gerät. Ein Paket könnte `/arasul/config` deklarieren und die Umgebungsdatei mit `dateien_lesen` ausliefern lassen. Der Speicher einer App ist ihre Datenbank (seit H7) und kein Ordner am Gerät; ein solcher Flow wird abgewiesen.                                  |

## Die Flows im Paket (seit Kontrakt 2, Phase C6)

Bis C5 war `flows` im Manifest eine Liste von Namen und damit eine
**Forderung** — das Paket brachte keine Flow-Datei mit. Seit C6 ist es ein
Verzeichnis und damit eine **Lieferung**:

```json
"flows": { "verzeichnis": "flows" }
```

```markdown
---
name: bericht
beschreibung: Fasst die Woche zusammen.
modell: qwen3:14b-q8
argumente:
  - name: woche
    typ: freitext
    pflicht: true
---

Fasse die Woche {{woche}} in fünf Sätzen zusammen.
```

Das Gerät registriert sie beim Einspielen **je App und Stand**; der Namensraum
ist die App. Geprüft wird **vor** dem Bau des Images: eine kaputte YAML-Zeile
findet sich in Millisekunden, ein Image zu bauen dauert am Jetson Minuten.

| Regel                                 | Antwort bei Verstoß                                 |
| ------------------------------------- | --------------------------------------------------- |
| Der **Dateiname ist der Name**        | `400`, wenn `name:` im Kopf etwas anderes sagt      |
| Mit `flows` muss der Ordner da sein … | `400` „verspricht Flows … gibt es den Ordner nicht" |
| … und wenigstens eine `.md` enthalten | `400` „keine einzige .md-Datei"                     |
| Kein `ordner:` (siehe oben)           | `400` mit Begründung                                |
| Höchstens 50 Flows je Paket           | `400`                                               |

**Das Modell steht im Kopf** (`modell:`) und ist der Vorschlag des Partners.
Der Administrator am Gerät darf es je Flow überschreiben; seine Entscheidung
liegt in der Datenbank und **nicht in der Datei** und überlebt deshalb jedes
App-Update. Ein Partner muss dafür nichts tun und darf nichts dagegen tun.

Gestartet wird ein Flow über die externe Schnittstelle mit dem Schlüssel, den
das Gerät der App beim Einspielen mitgibt (`ARASUL_API_SCHLUESSEL`, C4):

```bash
curl -k -X POST https://arasul.local/api/v1/external/flows/bericht/run \
  -H "x-api-key: $ARASUL_API_SCHLUESSEL" \
  -H 'content-type: application/json' \
  -d '{"args":{"woche":"34"}}'
```

**Nur eigene Flows.** Der Schlüssel trägt App und Stand; gesucht wird mit
beiden. Eine App kann den Flow einer anderen nicht einmal benennen.

### Ein Schritt, der auf einen Menschen wartet (seit Kontrakt 3, Phase C7)

Ein Flow aus einem Paket darf `freigabe_anfordern` deklarieren. Der Lauf hält
dann an (`status: wartend`), bis jemand entscheidet, dem die App freigegeben
ist:

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

Bestätigt: der Lauf läuft ab dem angehaltenen Schritt weiter. Abgelehnt: er
endet als `abgebrochen` mit der Begründung. Niemand entscheidet bis zur Frist:
`abgelaufen`. Die App **liest** den Stand mit ihrem Schlüssel
(`GET /api/v1/external/freigaben?lauf=<id>`) und entscheidet nicht selbst — eine
App, die ihre eigene Freigabe erteilen könnte, wäre keine.

Der Flow nennt dabei **keine Person und keine Rolle**. Wer entscheiden darf,
ist eine Sache des Kunden (`app_members`), nicht des Partners.

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

Den Schlüssel der **Erstinstallation** legt der Bootstrap selbst an, damit ein
Partner ihn im einen Moment bekommt, in dem er am Gerät steht. Er steht dann an
zwei Orten: auf der Konsole am Ende des Bootstraps und in
**`config/secrets/erstausgabe.txt`** (Rechte `600`) — zusammen mit dem
Startpasswort des Administrators. Die Datei ist nach dem Lesen zu löschen
(`shred -u config/secrets/erstausgabe.txt`); sie sagt das in ihrer ersten Zeile.
Siehe [../ops/AUSLIEFERUNG.md](../ops/AUSLIEFERUNG.md#die-erstausgabe-was-der-bootstrap-einmal-sagt).

`app:deploy` steht **nicht** in den Vorgabe-Bereichen
(`apps/dashboard-backend/src/config/apiBereiche.js`). Der Schlüssel, den das
Gerät jeder App beim Einspielen selbst mitgibt (`ARASUL_API_SCHLUESSEL`, Phase
C4), trägt ihn also nicht: keine App ersetzt eine andere — und sich selbst auch
nicht durch etwas anderes.

**`system:update`** (J39) ist der zweite Bereich dieser Art und steckt **nicht**
in `app:deploy`: er erlaubt, das Gerät selbst auf eine neue Fassung zu bringen
und wieder zurück (`GET/POST /api/v1/external/update`, `POST …/update/zurueck`;
Ablauf in [../ops/AUSLIEFERUNG.md](../ops/AUSLIEFERUNG.md#das-geraet-aktualisiert-sich-selbst-j39)).
Der Kontrakt nennt die Wege unter `endpunkte` und den Bereich unter
`schluessel.bereiche`; die Kontraktversion blieb dabei bei 7, weil nichts, was ein Kit
oder eine App bisher tat, sich ändert. Den Schlüssel dafür legt ein Administrator
für den Anlass an (`scripts/util/kit-schluessel.sh anlegen <Name> system:update`)
und widerruft ihn danach.

## Die Bibliothek zur Laufzeit: Kontrakt 9 (M5, 03.10.2026)

Eine App **kann** die Bibliothek vom Gerät laden, statt sie als Kopie ins
Paket zu legen. Dann nennt ihr Manifest nur die Hauptzahl:

```json
{ "marken": "5" }
```

und ihr Frontend lädt `/marken/5/marken.css` und `/marken/5/marken.js`. Das
Paket trägt keine Datei der Bibliothek. Der Kontrakt sagt es im Abschnitt
`marken` (Adresse, Verzeichnis `/marken/marken.json`, Eingänge, Import-Weg,
Versionsregel); den Weg für App-Entwickler mit Beispielen beschreibt
[APPS.md](APPS.md#die-bibliothek-zur-laufzeit-m5).

**Freiwillig.** Ein Paket mit Kopie (`"marken": "5.2.1"`) rollt unverändert
aus und bekommt in der Verwaltung weiter die Warnung, sobald es veraltet. Die
Kontraktversion geht trotzdem auf **9**: ein Kit, das gegen 8 prüft, wiese
`"marken": "5"` als ungültige Fassung ab. Das Kit hebt `KIT_CONTRACT_VERSIONS`
auf 9, bevor es auf ein solches Gerät einspielt.

## Neue Felder: Kontrakt 8 (M5, 02.10.2026)

Fünf Felder, die ein Entwickler im Kit nennt und die das Gerät bis Kontrakt 7
als unbekannt abwies (Manifest und Flow-Kopf sind `.strict()`). Die Quelle ist
der Abschnitt „Flows und Freigaben“ in `company/frontend.md` des Überordners; der
Schnitt unten ist die Entscheidung des Geräts dazu, wer abweichen muss, ändert
zuerst diesen Abschnitt.

**Alle Felder sind freiwillig.** Ein Paket von Kontrakt 7 rollt unverändert aus,
ohne dass jemand etwas nachträgt; es wird nichts eingesetzt, wenn ein Feld
fehlt. Die Kontraktversion geht trotzdem auf **8**: ein Kit, das gegen 7 prüft,
wiese die Felder als unbekannt ab, obwohl das Gerät sie nimmt (der Grund von 3,
4 und 7). Das Kit hebt `KIT_CONTRACT_VERSIONS` auf 8, bevor es auf ein solches
Gerät einspielt.

**Nur Schema und Annahme.** Das Gerät nimmt die Felder an, prüft sie und weist
Falsches mit lesbarem Grund ab. Die **Stufen** wirken seit M5: Frist je Stufe
(03.10.2026) und Standardperson je App und Stufe (04.10.2026, siehe
[FLOWS.md](FLOWS.md#stufen-und-standardperson-m5-04102026)). Der Zeitplaner und
die Umschaltung der Arten kommen mit späteren Karten, die Anzeige des
Änderungstextes und des Symbols ebenso.

| Wo                  | Feld             | Form                                                                                          |
| ------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `app.json`          | `symbol`         | Lucide-Name (`file-text`) oder Kürzel (`BE`), siehe [APPS.md](APPS.md#das-manifest-fassung-1) |
| Flow-Kopf           | `arten`          | Liste aus `autonom`, `ergebnis_bestaetigen`; mindestens eine, keine doppelt                   |
| Flow-Kopf           | `ausloeser`      | Liste von Objekten mit `typ`: `hand`, `zeitplan`, `ereignis`; höchstens 5                     |
| Flow-Kopf           | `stufen`         | Liste benannter Freigabestufen; höchstens 5                                                   |
| Schritt             | `faehigkeiten`   | Objekt: `text`, `bild`, `werkzeuge` (je Wahrheitswert), `mindestkontext` (Tokens)             |
| Deploy, neben Paket | `aenderungstext` | Text, 1 bis 1000 Zeichen                                                                      |

```yaml
---
name: beleg-lesen
arten: [autonom, ergebnis_bestaetigen]
ausloeser:
  - typ: hand
  - typ: zeitplan
    zeitplan: '0 6 * * 1-5'
  - typ: ereignis
    ereignis: beleg.hochgeladen
stufen:
  - name: pruefung
    bezeichnung: Prüfung
    frist_minuten: 4320
  - name: leitung
    bezeichnung: Leitung
werkzeuge: [freigabe_anfordern, subagent]
rollen:
  - name: leser
    ergebnis: { felder: [betrag] }
    prompt: Lies den Beleg.
schritte:
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: Lies {{beleg}}.
    faehigkeiten: { text: true, bild: true, mindestkontext: 8192 }
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter: { titel: Beleg prüfen, stufe: pruefung }
---
```

**`arten`** nennt, was der Flow _kann_; der Admin schaltet je Flow zwischen den
genannten. Ohne Angabe gilt, was bisher galt: `autonom`. Ein Flow, der erzeugt,
läuft autonom oder mit Freigabe von Anfang an, nie mit stillem Rückfall.

**`ausloeser`** nennt, wodurch der Flow startet. `hand` ist der Start in der
App (der Weg über `POST /flows/:name/run`, wie bisher). `zeitplan` trägt fünf
Felder wie in cron (`Minute Stunde Tag Monat Wochentag`, nur Ziffern und `* / , -`)
— geprüft wird die Form, ob `61` eine Minute sein kann, entscheidet der
Zeitplaner. `ereignis` trägt den Namen eines Ereignisses der App (klein, mit
Punkt, Unterstrich oder Bindestrich). Derselbe Auslöser darf nicht zweimal
stehen. Der Zeitplaner läuft einmal im Gerät; der Admin pausiert je Flow.

**`stufen`** sind die benannten Freigaben („Prüfung“, „Leitung“): je Stufe
`name` (Kennung, wie ein Schrittname), optional `bezeichnung` (was der Mensch
liest) und `frist_minuten` (Vorgabe des Geräts: 7 Tage). **Der Flow nennt keine
Person**: die Standardperson je App und Stufe setzt der Admin in der
Verwaltung, und jede neue Freigabe der Stufe liegt zuerst bei ihr (ohne sie bei
allen mit Zugang). Nennt ein
`freigabe_anfordern`-Schritt in `parameter.stufe` eine Stufe, muss der Flow sie
unter `stufen` führen, sonst läge die Freigabe später bei niemandem.

**`faehigkeiten`** sagt, was der Schritt vom Modell braucht; der Admin darf nur
auf installierte Modelle umstellen, die **alle** genannten Fähigkeiten erfüllen.
`false` und fehlen sind dasselbe. Nur bei `typ: subagent`: ein Werkzeug-Schritt
ruft kein Modell, und ein Paket mit `faehigkeiten` daran wird abgewiesen. Das
Modell selbst steht weiter in `modell:` (Schritt oder Flow), Prompts ändert der
Admin nicht.

**`aenderungstext`** reist als Textfeld neben dem Paket, nicht im Manifest: er
gehört zu einem Ausrollen, nicht zu einer Version, dieselbe Version kann zweimal
in den Test gehen. Ein leeres oder zu langes Feld ist `400`.

```bash
curl -H "x-api-key: $ARASUL_SCHLUESSEL" \
  -F "aenderungstext=Belege lassen sich jetzt drucken." \
  -F "paket=@paket.tgz" https://arasul.local/api/v1/external/apps
```

Der Kontrakt trägt dazu `app_json.schema`, `flow_frontmatter.schema` (mit den
Feldern am Flow und am Schritt) und je einen Satz in `app_json.regeln`,
`flow_frontmatter.regeln` und `paket.regeln`. Die Flow-API (`/api/flows`) nimmt
`arten`, `ausloeser` und `stufen` ebenfalls an.

## Der Kontrakt: woran ein Kit merkt, dass es nicht passt

```bash
curl -H "x-api-key: $ARASUL_SCHLUESSEL" https://arasul.local/api/v1/external/contract
```

`GET /api/v1/external/contract` ist die **einzige** Quelle, gegen die ein Kit
seine Vorlage prüft. Er gibt aus:

| Feld               | Was darin steht                                                            |
| ------------------ | -------------------------------------------------------------------------- |
| `kontrakt`         | Die Kontraktversion — die Zahl, an der ein Kit merkt, dass es nicht passt  |
| `arasul`           | Die Systemversion des Geräts (sagt nichts über den Vertrag)                |
| `app_json`         | `app.json` als JSON-Schema, plus die Regeln, die kein Schema trägt         |
| `flow_frontmatter` | Der YAML-Kopf einer Flow-Datei als JSON-Schema                             |
| `koepfe`           | `X-Arasul-User`, `X-Arasul-Role` und die möglichen Rollen                  |
| `umgebung`         | Was das Gerät dem Container einer App mitgibt                              |
| `paket`            | Format, Packbefehl, Grenzen, Regeln                                        |
| `apps`             | Die Pfade unter `/apps/<id>/` und die Namen, die der Plattform gehören     |
| `schluessel`       | Kopfzeile, Präfix, alle Bereiche und die Vorgabe                           |
| `daten`            | Was eine App dauerhaft behält und was nicht (J35)                          |
| `freigaben`        | Einreicher und Entscheider am Start eines Laufs (J35)                      |
| `protokoll`        | Welche Modellaufrufe im Protokoll stehen und wie der Mensch genannt wird   |
| `auslesen`         | Anfrage, Antwort und Fehlschlag von `document/extract-structured` (J35)    |
| `bilder`           | Wie ein Bild über `llm/chat` an ein Bildmodell geht (J35)                  |
| `endpunkte`        | Verb, Pfad, Pfad **relativ zur Basis** und der Bereich, den jeder verlangt |

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

**Fassung 4 (Phase H6):** das Manifest kennt `marken`, die Fassung des
Designsystems, auf der die App steht (`"marken": "3.1.0"`). Freiwillig — jede
App, die vor H6 gebaut wurde, hat sie nicht —, aber `.strict()` hat das Feld
bis hierher abgewiesen, und ein Kit, das gegen Fassung 3 prüft, täte es auch.
Woher ein Partner die richtige Zahl bekommt: aus dem **Paket**, das das
Auslieferungsartefakt trägt (`packages/marken/marken.json`, siehe
[AUSLIEFERUNG.md](../ops/AUSLIEFERUNG.md)). Das Gerät meldet in der
App-Verwaltung einen Stand, der auf einer älteren Fassung steht als die Shell.

**Fassung 5 (Phase H7):** drei Änderungen, alle an dem, was das Gerät einer App
mitgibt.

`umgebung` **nennt die Namen in ihrer Rolle**:

```json
"umgebung": {
  "basis": "ARASUL_API_URL",
  "schluessel": "ARASUL_API_SCHLUESSEL",
  "datenbank": "ARASUL_DB_URL",
  "praefix": "/api/v1/external",
  "basis_enthaelt_praefix": true,
  "was": { "ARASUL_API_URL": "…", "ARASUL_API_SCHLUESSEL": "…", "ARASUL_DB_URL": "…" }
}
```

Bis Fassung 4 stand der Name im **Schlüssel** einer Abbildung und die Erklärung
im Wert. Das Ara-Kit liest `umgebung.basis` und `umgebung.schluessel`, fand dort
nichts, und seine Vorlage ließ Adresse und Schlüssel `null` — die App rief gar
nicht erst an, und das Ergebnis sah aus wie ein Gerät ohne Arasul. Kontrakt und
Wirklichkeit stimmten dabei überein (`docker inspect` zeigt genau diese zwei
Namen); es war allein die Form, über die sich Kit und Produkt nicht einig
waren.

**`endpunkte[].relativ`**: `ARASUL_API_URL` endet auf `/api/v1/external`, und
`endpunkte[].pfad` fängt damit an. Wer beides aneinanderhängt — und das ist das
Naheliegende —, ruft `/api/v1/external/api/v1/external/flows/freigabe/run` und
bekommt einen `404`. Beide Angaben stimmten, der Kontrakt sagte nur nicht, dass
es dasselbe Stück ist. **An die Adresse gehört `relativ`, nicht `pfad`.**

**`umgebung.datenbank`**: eine App mit `backend` bekommt je Stand eine eigene
Datenbank im PostgreSQL der Plattform. Sie steht im Manifest nicht — das Gerät
legt sie an, nennt ihre Adresse und wirft sie mit der App wieder weg. Siehe
[APPS.md](APPS.md#die-datenbank-einer-app-phase-h7).

**`daten` und `freigaben` (J35, 25.09.2026), Fassung bleibt 6:** `daten` sagt,
was eine App dauerhaft behält (die Datenbank, je Stand) und was nicht (das
Dateisystem des Containers, anonyme Volumes) und wie die Daten einer App aus
der Sicherung zurückkommen. `freigaben` nennt die zwei freiwilligen Felder am
Start eines Laufs — `einreicher` und `freigabe` — als Schema und als Sätze.
Beides ist additiv: ein Kit, das die Abschnitte nicht liest, startet Läufe wie
bisher. Eine 7 hätte jedes Kit bis 6 angehalten, ohne dass es etwas falsch
machte.

**`protokoll` (J35, 26.09.2026), Fassung bleibt 6:** jeder Modellaufruf über
die Schnittstelle — auch `document/extract-structured`, das kein Flow ist —
steht im Protokoll des Geräts, mit App, Stand, Mensch, Modell und Dauer, ohne
Inhalt. Der Abschnitt nennt die Wege und wie eine App den Menschen nennt: die
Kopfzeile `X-Arasul-User` aus der Forward-Auth unverändert weiterreichen (oder
`einreicher`, an `/v1` `user`). Nennt sie niemanden, steht der Aufruf ohne
Menschen da. Additiv, darum keine 7.

**`auslesen` und `bilder` (J35, 26.09.2026), Fassung bleibt 6:** das Kit hat
die Antwort von `document/extract-structured` bis hierher geraten und am
25.09.2026 als offene Stelle gemeldet. `auslesen.anfrage`, `auslesen.antwort`
und `auslesen.fehlschlag` sind JSON-Schemas aus denselben Zod-Schemas, gegen
die der Test die echte Antwort der Route prüft; die Sätze in
`auslesen.regeln` sagen, was ein Schema nicht sagt — vor allem, dass `data` ein
Objekt oder `null` ist und **nicht** gegen das mitgeschickte `schema` geprüft
wird. `bilder` sagt, wie eine App ein Foto **selbst** an ein Modell gibt:
`images` an `llm/chat`, Base64, PNG oder JPEG; ohne `model` nimmt das Gerät
seine Bildvorgabe, ein Textmodell weist es mit `400` ab. Das Auslesen bleibt
dabei der Weg über die Texterkennung. Die Bildvorgabe ist gemessen: an fünf
erfundenen Belegfotos las `gemma4:e4b` 90 von 90 Feldern, `llava-phi3` (bis
zum 26.09.2026 die Vorgabe) 1 von 90, die Texterkennung 16 von 30 (siehe
API-Referenz); wer sich nicht darauf verlassen will, nennt `model` und misst.
Additiv, darum keine 7.

**Fassung 6 (Brücke, 21.09.2026):** das Manifest kennt **`agent`** — die Liste
der Routen, die eine App einem Agenten anbietet. Freiwillig wie `marken`, und
die Zahl geht aus demselben Grund mit: `.strict()` hat das Feld bis hierher
abgewiesen, und genau das ist am 21.09.2026 am Orin passiert, als die Werkstatt
es in `apps/belege/app.json` schrieb.

```json
"agent": [
  {
    "method": "GET",
    "path": "lage",
    "purpose": "Sagt, in welchem Zustand die App ist.",
    "params": [],
    "writes": false
  },
  {
    "method": "POST",
    "path": "vorgaenge",
    "purpose": "Einen Vorgang einreichen und damit den Flow freigabe starten.",
    "params": [
      { "name": "titel", "type": "string", "required": true },
      { "name": "text", "type": "string", "required": false }
    ],
    "writes": true
  }
]
```

| Feld      | Bedeutung                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `method`  | `GET`, `POST`, `PUT`, `PATCH` oder `DELETE`                                                                                                                                    |
| `path`    | **relativ** zur Schnittstelle der App (`/apps/<id>/api/`): ohne Anfrage, ohne `..`, höchstens 200 Zeichen. Ein führender `/` wird abgeschnitten, nicht abgewiesen              |
| `purpose` | Ein Satz in **einer** Zeile, höchstens 200 Zeichen                                                                                                                             |
| `params`  | Eine Liste, **leer** wenn die Route keine nimmt (nicht weggelassen). Je Eintrag `name` (einfache Kennung), `type` aus `string`, `number`, `integer`, `boolean`, und `required` |
| `writes`  | Ändert die Route etwas? `PUT`, `PATCH` und `DELETE` **müssen** `true` tragen                                                                                                   |

Keine Route zweimal (`method` und `path` zusammen), kein Parametername zweimal
je Route, kein unbekanntes Feld. Die Regeln, die das JSON-Schema nicht trägt,
stehen als Satz in `app_json.regeln` — genau dafür gibt es diese Liste.

**Warum `writes` scharf ist:** was in `agent` nicht steht, ruft das CLI der
Brücke gar nicht erst auf, und für eine Route mit `writes: true` verlangt es
ein ausdrückliches `--write`. Daran hängt die Rückfrage an den Menschen. Eine
ändernde Route, die sich als lesend ausgibt, hebt genau diese Rückfrage auf.

**Ausgeliefert wird das Feld von der APP**, unter `GET agent` an ihrer eigenen
Schnittstelle, samt `id`, `name` und Version — durch dieselbe Forward-Auth wie
alles andere. Das Gerät hält **keine zweite Kopie** bereit: eine App, die ihre
Wege ändert und ihr Manifest nachzieht, sähe sonst zwei verschiedene
Beschreibungen ihrer selbst, je nachdem, wen man fragt.

**Folge für das Kit:** `KIT_CONTRACT_VERSIONS` in
`.ara/tools/lib/contract.mjs` endete am 21.09.2026 bei 5, und das Kit hält mit
Rückgabe 1 an, sobald ein Gerät höher steht — bei **jeder** App, nicht nur bei
einer mit `agent`. Das ist die eingebaute Ordnung („erst das Kit, dann dieses
Gerät") und kein Versehen; sie kostet aber einen Zug im Kit, bevor wieder etwas
auf ein Gerät mit dieser Fassung kommt.

**Fassung 7 (J38, 02.10.2026):** Apps laufen im Netz `arasul-apps` **ohne
Internet**, und das Manifest kennt **`verbindungen`**: die Hostnamen, zu denen
eine App von sich aus verbinden will (freiwillig, nur Namen, siehe
[APPS.md](APPS.md#das-netz-der-apps-j38-02102026)). Der Kontrakt trägt dazu den
Abschnitt `netz` (`GET /api/v1/external/contract`). Die Zahl geht mit, weil
sich hier ändert, was eine App **erlebt**: eine App, die beim Start eine Adresse
im Internet ruft (Schriftart, Webdienst, Paketmanager), läuft ab dem Update
nicht mehr. Abhängigkeiten gehören ins Image.

**Folge für das Kit:** `KIT_CONTRACT_VERSIONS` in
`.ara/tools/lib/contract.mjs` muss auf **7** gehoben werden (sie endete bei 5,
siehe oben), und das Kit sollte `verbindungen` im Manifest kennen und Aufrufe
ins Internet melden, bevor ein Gerät mit dieser Fassung dazukommt.

**Seit der zweiten Karte zu J38 ist `verbindungen` die Freigabe:** der
Ausgangs-Proxy des Geräts lässt für die App genau diese Namen durch
(`HTTPS_PROXY` steht in ihrer Umgebung, Details in
[APPS.md](APPS.md#der-ausgangs-proxy-j38-02102026)). Die Fassung bleibt 7.

## Was schiefgehen kann

| Antwort | Bedeutung                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`   | Kein oder kein gültiger Schlüssel                                                                                                                                                                                                                                                                                                                                                                                                  |
| `403`   | Der Schlüssel hat `app:deploy` nicht                                                                                                                                                                                                                                                                                                                                                                                               |
| `400`   | Das Paket geht nicht durch: kein `app.json` im Wurzelverzeichnis, ein Symlink darin, ein Feld, das es nicht gibt, ein fehlender Bauplan — oder der Bau am Gerät ist gescheitert (die letzten Zeilen der Bauausgabe stehen in `details`)                                                                                                                                                                                            |
| `409`   | Diese Version ist gerade live; oder: es gibt keinen Teststand zum Schalten, keine vorige Version zum Zurückschalten, oder das **Lizenzkontingent ist voll** (seit dem 30.08.2026 zählen Test- und Livestand zusammen: jede eingespielte App belegt einen Platz, eine neue Version einer bekannten App geht immer durch). Die Meldung nennt die Zahl und die Apps, `details` trägt sie als `grenze`, `belegt`, `apps`, `abgewiesen` |
| `413`   | Das Archiv ist größer als 200 MB                                                                                                                                                                                                                                                                                                                                                                                                   |
| `429`   | Zu viele Uploads in kurzer Zeit                                                                                                                                                                                                                                                                                                                                                                                                    |

## Gemessen wird das mit

```bash
bash scripts/test/deploy-abnahme.sh
```

Es geht den ganzen Weg über die externe API — Kontrakt, Deploy, Schalten,
Zurückschalten, Rückfrage, Entfernen — und räumt am Ende alles weg, was es
angelegt hat. Ohne `ARASUL_KIT_SCHLUESSEL` meldet es sich einmal als
Administrator an, legt sich einen Wegwerf-Schlüssel an und widerruft ihn.

Die **Lizenzgrenze** misst `scripts/test/lizenz-abnahme.sh` daneben: sie fragt
das Gerät, wie viele Apps seine Lizenz trägt (`GET /api/license/info`), zählt
die, die dastehen, und schickt danach Wegwerf-Pakete gegen die Grenze — von
unten (eines geht durch) und von oben (das nächste bekommt 409). Die Zahl steht
in keiner Zeile des Skripts; eine Abnahme, die „3" erwartet, misst ihre eigene
Erinnerung. Auch sie räumt hinter sich auf.
