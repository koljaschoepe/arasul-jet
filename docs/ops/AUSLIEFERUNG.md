# Auslieferung

> Wie ein Stand dieses Repos auf ein Gerät beim Kunden kommt — und wie der
> nächste auf dasselbe Gerät.
> Stand: 29.08.2026 (Phase C10 des Umbaus vom 26.08.2026; Tag-Prüfung 28.08.,
> Aktualisierung 29.08.).

Ein Satz vorweg: **das Artefakt ist der Bauplan, nicht das Gebäude.** Es
enthält den Quellstand, keine Docker-Images. Die Images tragen CUDA, laufen auf
ARM64 mit der NVIDIA-Laufzeit des Jetson, und ein GitHub-Läufer ist x86 ohne
GPU. Das Gerät baut deshalb selbst, beim ersten Start.

## Der Weg in drei Schritten

```
Tag `v1.2.0` im Jet-Repo
   └─ .github/workflows/release.yml
        └─ scripts/deploy/artefakt-bauen.sh
             └─ arasul-1.2.0.tar.gz  (+ .sha256)
                  └─ GitHub-Release am öffentlichen Jet-Repo
                       └─ ARA_INSTALLER_URL der Website zeigt darauf
                            └─ curl arasul.de/api/install | bash
                                 └─ install.sh im Artefakt
                                      └─ ./arasul bootstrap
```

## Was ein Tag durchlaufen muss, bevor er ein Release wird

`release.yml` prüft den Tag, **bevor** es baut
(`scripts/deploy/tag-pruefen.sh`). Drei Regeln:

| Regel                                         | Warum                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Der Tag-Commit ist Vorfahre von `origin/main` | Ein Tag auf einem nie gemergten Zweig liefert ungeprüften Code aus.         |
| Er ist Nachfahre des vorigen Tags             | Sonst nimmt die höhere Nummer zurück, was die niedrigere schon hatte.       |
| Er ist die **Spitze** von `origin/main`       | Sonst fährt der Kunde mit einem Stand los, der im Repo längst überholt ist. |

Die dritte Regel hat es gebraucht. Am 28.08.2026 installierte das Ara-Kit
v0.3.0 auf den Orin, und was ankam, war der Stand vom Vormittag: Phase D4, wo
das Produkt bei D7 plus den G1-Reparaturen stand. **Kein Tag war falsch
gesetzt** — v0.1.0, v0.2.0 und v0.3.0 laufen sauber vorwärts, jeder ist
Vorfahre von `main`, jeder liegt hinter seinem Vorgänger. Der Fehler war eine
Unterlassung: zwischen v0.3.0 (11:45) und `main` (22:25) lagen zehn Merges und
223 geänderte Dateien, und getaggt hat sie niemand. Das Kit holte das Neueste,
was es gab. Am Gerät fehlten dann `features/modelle/` (D5), `packages/marken/`
(D7), `optionalAuth` am `/logout` (D6) und `is_task_default` im
`modelService` — die Oberflächen-Reihe kam auf 42 von 70.

Dass niemand es merkte, lag auch an der Betreffzeile: `cb087fce` heißt „Phase
C10", ist aber ein C10-Nachzügler, der erst **nach** D3 und D4 gemergt wurde.
Wer die Tag-Liste las, sah eine Nummer, die rückwärts zu laufen schien, und
suchte den Fehler an der falschen Stelle. Deshalb misst die Sperre an der
Vorgeschichte und nie am Text.

**Ein Nachtrag auf einen älteren Punkt bleibt erlaubt**, aber nicht aus
Versehen. Dafür braucht es einen _annotierten_ Tag mit einer Zeile
`Nachtrag: <Grund>`:

```bash
git tag -a v0.3.1 cb087fce -m "Nachtrag: Sicherheitsfix fuer Geraete auf 0.3.x"
git push origin v0.3.1
```

Der Grund hängt damit für immer am Tag-Objekt und nicht in einem
Lauf-Protokoll, das nach dreißig Tagen weg ist.

### Die Sperre prüft den Tag. Sie kann nicht prüfen, was danach kommt.

Am 28.08.2026 um 21:25 ging v0.4.0 auf die damalige Spitze von `main`, und
alle drei Regeln standen grün. Eine Stunde später wurde PR #737 (Phase G2)
gemergt, und darin lag eine Reparatur, die einen Kunden trifft: in Traefik
begrenzte `rate-limit-auth` das **ganze** Präfix `/api/auth` auf 30 Anfragen
je Minute und je IP. Eine Seitenladung kostet zwei davon (`session` und
`needs-setup`), hinter einer NAT-Adresse teilt sich ein Büro eine IP — nach
etwa fünf Seiten kam 429, ohne eine einzige `RateLimit-*`-Kopfzeile, die es
erklärt hätte.

Das war kein Fehler am Tag. Ein Tag ist eine Momentaufnahme, und `main` läuft
danach weiter; die Sperre misst gegen `origin/main` **zum Zeitpunkt des
Baus**, und zu diesem Zeitpunkt war v0.4.0 richtig. Es gibt keine dritte Regel,
die das auffangen könnte, ohne jeden Merge zu einem Release zu machen.

Was bleibt, ist eine Frage nach dem Merge und keine Prüfung davor: **trägt die
Nummer, die gerade im Netz steht, diese Reparatur schon?** Lautet die Antwort
nein und spürt ein Kunde den Fehler, ist die Antwort eine neue Nummer auf die
neue Spitze — so ist v0.5.0 entstanden (Auftrag `release-v050`, Nachweis am
ausgepackten Artefakt in
[`docs/plans/audits/2026-08-29-messung-release-v050.md`](../plans/audits/2026-08-29-messung-release-v050.md)).

## Das Artefakt

| Was            | Wert                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| Dateiname      | `arasul-<Fassung>.tar.gz`                                                                |
| Verzeichnis    | ein einziges, `arasul-<Fassung>/`                                                        |
| Einstiegspunkt | `install.sh` im Wurzelverzeichnis                                                        |
| Beschreibung   | `arasul-release.json` im Wurzelverzeichnis                                               |
| Prüfsumme      | `arasul-<Fassung>.tar.gz.sha256` als zweite Datei am Release                             |
| Gebaut von     | `scripts/deploy/artefakt-bauen.sh` (aus `git archive`, nicht aus dem Arbeitsverzeichnis) |

`arasul-release.json`:

```json
{
  "fassung": "1.2.0",
  "commit": "a1b2c3d",
  "gebaut": "2026-08-27T20:15:00Z",
  "einstiegspunkt": "install.sh",
  "repo": "Arasul-GmbH/arasul-jet"
}
```

**Der Einstiegspunkt nennt sich selbst.** Das Ara-Kit (`lib/install.mjs`) und
`/api/install` der Website lesen `einstiegspunkt` aus dieser Datei und rufen
genau diese Datei im ausgepackten Verzeichnis auf. Sie raten nicht, und der
Name lässt sich ändern, ohne dass zwei fremde Repos gleichzeitig angefasst
werden müssen.

Was nicht im Artefakt liegt: `.git`, `.github`, `.claude`, `.husky`, `tests/`,
`docs/plans`, `docs/archive`, alles Unversionierte. `docs/` selbst liegt drin,
weil `install.sh` und der Bootstrap am Ende auf
[NETZNAME_UND_ZERTIFIKAT.md](NETZNAME_UND_ZERTIFIKAT.md) verweisen und das
Admin-Handbuch auf das Gerät gehört, auf dem es gebraucht wird. Ein Verweis ins
Leere wäre schlimmer als kein Verweis.

### Das Artefakt trägt das Designsystem (Phase H6)

Es ist der **Träger** der Bibliothek an alle, die Apps für dieses Gerät bauen.
Das Ara-Kit packt das Artefakt nach `.ara/mirror/` aus und spiegelt
`packages/marken/src/` in seine App-Vorlage; jede App, die daraus entsteht,
trägt dieselbe Kopie. Der Ordner liegt ohnehin im Artefakt — die Shell wird am
Gerät daraus gebaut. Was fehlte, war die Auskunft, **was davon das Paket ist**:

```
packages/marken/
  marken.json        Fassung, Abhängigkeiten, jede Datei mit ihrem sha256
  src/               die Quelle: Tokens, Primitive, Muster, Bausteine
  browser/marken.js  das Bündel für eine App ohne Bau
  EINBAU.md          wie man es in ein Projekt einbaut
```

`marken.json` schreibt `scripts/deploy/marken-paket.py` beim Bau des Artefakts.
Es **kopiert die Bibliothek nicht** — zwei Kopien derselben Quelle in einem
Artefakt wären genau die zweite Wahrheit, gegen die diese Bibliothek gebaut
ist. **Das Paket ist, was `marken.json` nennt**; was er nicht nennt
(`__tests__/`, `browser.ts`, `vite.config.mjs`), gehört nicht dazu.

Die Abhängigkeiten sind nicht abgeschrieben, sondern **gelesen**: jeder Import
aus `src/`, der kein relativer Pfad ist, muss in der `package.json` der Shell
stehen, und von dort kommt die Versionsangabe. Eine neue Abhängigkeit der
Bibliothek steht damit ohne Zutun im Paket; eine, die niemand installieren
kann, bringt den Bau zum Stehen.

Zwei Messungen halten das:

| Wo                    | Was                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI-Job `Installation` | `marken-paket.py --pruefen` am **ausgepackten** Artefakt, jede Datei an ihrem Hash                                                                                                  |
| CI-Job `Guards`       | `scripts/test/marken-paket-abnahme.sh`: ein frisches Vite-Projekt außerhalb des Repos nimmt das Paket, holt die genannten Abhängigkeiten und baut (`tsc --noEmit` und `vite build`) |

Das zweite ist die eigentliche Frage. In diesem Repo baut die Bibliothek immer
— hier steht die Shell daneben, mit ihrem Alias, ihrer `package.json`, ihrem
`index.css` und ihrem `node_modules`. Ein Paket, das nur in seinem eigenen Repo
baut, ist keins.

Eine App am Gerät **sagt selbst**, auf welcher Fassung sie steht
(`app.json`, Feld `marken`), und die App-Verwaltung meldet eine, die älter ist
als die Shell — siehe [APPS.md](../features/APPS.md).

## Die Fassung kommt aus dem Bau

Bis zum 27.08.2026 stand sie in einer Datei `VERSION`, und dort stand
`1.0.0` — seit Monaten unverändert, unabhängig davon, was gerade lief. Phase B7
hat den Rückfall deshalb auf `0.0.0` gesetzt; damit lehnte `validateManifest`
jedes Paket mit einer `min_version` ab, mit der Begründung „Current version
0.0.0 is below minimum required version 1.0.0". Beides sind Sätze über eine
Datei, nicht über ein Gerät.

Jetzt (`scripts/lib/fassung.sh`), in dieser Reihenfolge:

1. `arasul-release.json` im Wurzelverzeichnis — der Weg des Artefakts.
2. Git: ein Tag genau auf `HEAD` ergibt die Tag-Nummer ohne `v`, sonst
   `JJJJMMTT-<sieben Stellen SHA>` — der Weg des Deploys auf den Orin.
3. Nichts. Dann sagt das Gerät „Vorserie" und nimmt keine Aktualisierung an.

Wo die Zahl landet:

| Weg                       | Wer setzt sie                                 | Wohin                                            |
| ------------------------- | --------------------------------------------- | ------------------------------------------------ |
| Installation aus Artefakt | `install.sh`                                  | `SYSTEM_VERSION` in `.env`                       |
| Deploy nach `main`        | `scripts/deploy/deploy-local.sh` (Schritt 1a) | `SYSTEM_VERSION` in `.env`                       |
| Anzeige                   | `utils/version.js`                            | `/api/health`, `/api/system/info`, Einstellungen |

Der Deploy startet danach `dashboard-backend` neu, und nur den. Die Fassung
wechselt bei jedem Deploy (sie trägt den SHA); den ganzen Stapel deswegen
durchzusehen, hätte dieses Repo schon einmal elf Deploys in 66 Minuten
gekostet.

## Das Artefakt aktualisiert

> Gebaut am 29.08.2026 (Auftrag `artefakt-aktualisiert-nicht`, Bezug M2),
> gemessen in der CI bei jedem Zug (`scripts/test/aktualisierung-abnahme.sh`).
> Der Lauf am Orin steht noch aus — er folgt, wenn der Dauerlauf A7 durch ist.

Ein Gerät mit Daten nimmt ein neueres Artefakt an und läuft danach mit
denselben Geheimnissen, derselben Datenbank, denselben Apps und Sicherungen
weiter:

```bash
curl -sSLO https://github.com/…/releases/download/v0.6.0/arasul-0.6.0.tar.gz
sha256sum -c arasul-0.6.0.tar.gz.sha256
tar xzf arasul-0.6.0.tar.gz -C /home/arasul
cd /home/arasul/arasul-0.6.0 && ./install.sh
```

Dieselben vier Zeilen wie bei einer Erstinstallation. Was `install.sh` daraus
macht, entscheidet **das Gerät**, nicht die Hand des Menschen davor.

### Die Wurzel: wo ein Gerät steht, wurde geraten

Ein Gerät hat sein **Programm** und seinen **Zustand** im selben Verzeichnis,
und jedes Artefakt bringt ein neues Verzeichnis mit. Wer nicht weiß, wo der
Zustand liegt, rät — und bis zum 29.08.2026 haben **beide** Wege auf ein Gerät
geraten:

- **Der Kundenweg.** `install.sh` kannte nur sein eigenes Verzeichnis. Fand es
  dort keine `.env`, erzeugte `interactive_setup.sh` bedingungslos neue
  Geheimnisse, während der feste Projektname (`name: arasul-platform`)
  dieselben Volumes übernahm. Am Orin am 28.08.2026 nachgerechnet (sha256,
  gekürzt): `POSTGRES_PASSWORD` alt `4b5ff99ff49e` gegen frisch `7a8ecc928624`,
  `JWT_SECRET` alt `abf318256610` gegen frisch `6f3b8c582d82`. Postgres beachtet
  `POSTGRES_PASSWORD` nur beim ersten Anlegen: **alte Datenbank, neues
  Passwort**, und das Backend kommt an seine eigene Datenbank nicht mehr heran.
  Dazu blieben Geräte-CA, `data/apps`, Flows und Sicherungen im alten Ordner
  liegen — eine halbe Migration, schlimmer als beides Ganze.
- **Der Entwicklungsweg.** `deploy.yml` trug `/home/arasul/arasul/arasul-jet`
  fest im Workflow, der Live-Stapel lief aber aus `/home/arasul/arasul-0.4.0`.
  Seit der Installation durch das Kit fehlten dem Checkout die Geheimnisse,
  `docker compose up` brach ab (Lauf 33221221851), und es kam nichts mehr
  automatisch auf das Gerät — ohne dass sich eine Zeile geändert hätte.

### Die Antwort: das Gerät wird gefragt

`scripts/lib/installation.sh` beantwortet die Frage an **einer** Stelle, und
zwar mit einer Messung statt einer Annahme:

| Quelle                                                   | Was sie sagt                       |
| -------------------------------------------------------- | ---------------------------------- |
| `ARASUL_INSTALLATION`                                    | was ein Mensch von Hand gesagt hat |
| Docker, Etikett `com.docker.compose.project.working_dir` | woraus der Stapel **läuft**        |
| `$HOME/.arasul/installation`                             | was zuletzt installiert wurde      |

Docker vor dem Zeiger: eine Datei sagt, was zuletzt installiert wurde, ein
laufender Container sagt, was läuft. `docker compose ps` ist die Wahrheit, auch
für diese Frage.

### Was `install.sh` dann tut

1. **Es findet die vorhandene Installation** und zieht ihren Zustand hierher
   um. Der Umzug ist ein `rename` und kostet nichts, auch bei Modellen von
   zweistelligen Gigabytes; die Bind-Mounts der laufenden Container hängen am
   Inode, der alte Stapel läuft unbeirrt weiter.
2. **Kopiert wird nicht.** Zwei Kopien desselben Geräts wären genau die
   Zweideutigkeit, gegen die der Weg gebaut ist — danach könnte niemand mehr
   sagen, welche die echte ist. Das alte Verzeichnis bekommt `ABGEGEBEN.txt`,
   und `./arasul` weigert sich dort zu starten.
3. **Die `.env` bleibt, wie sie ist** — bis auf `SYSTEM_VERSION`, `BUILD_HASH`
   und `MDNS_NAME`. Die Geheimnisse werden nicht angefasst.
4. **Die systemd-Unit hängt mit um.** `arasul-platform.service` trägt
   `WorkingDirectory=<Fassungsordner>`; überschrieben wird dieselbe Datei, also
   gibt es die alte danach nicht mehr.
5. **`./arasul bootstrap --aktualisierung`** baut die Images, **während der
   alte Stapel noch läuft** — ein Baufehler nach dem Abschalten ließe das Gerät
   unten. Erst danach `docker compose down --remove-orphans` (ohne `-v`, die
   Volumes bleiben) und der geordnete Start aus dem neuen Verzeichnis.
   Administrator und Kit-Schlüssel bleiben, wie sie sind.

Warum `down` und nicht `up --force-recreate`: `docker compose up` legt nur neu
an, was sich geändert hat. Beim Wechsel von 0.3.0 auf 0.4.0 lief `docker-proxy`
danach als einziger Container mit dem `working_dir` des **alten** Verzeichnisses
weiter — seine Mounts hatten sich nicht geändert, also sah compose keinen Grund.
Genau dieses Etikett ist inzwischen die Auskunft darüber, wo das Gerät steht.

### Was der Zustand ist

Es ist die Liste des Werksresets, rückwärts gelesen: `factory-reset.sh` löscht
diese Pfade, um aus einem benutzten Gerät ein leeres zu machen, die Übernahme
trägt sie mit, um aus einem neuen Artefakt dasselbe Gerät zu machen.
`scripts/test/zustand.py` hält beide Listen aneinander — fällt ein Pfad aus
einer, ist es beim nächsten Mal Datenverlust auf der anderen Seite.

`.env` · `config/device` · `config/traefik/certs` · `config/ssh` ·
`config/secrets` · `config/.traefik-credentials` · `data` · `logs` · `cache` ·
`updates`

### Wenn es nicht eindeutig ist, hält der Installer an

- **Zustand ohne Zuhause.** Es gibt Volumes dieses Projekts, aber weder hier
  noch anderswo eine passende Installation. Früher lief der Installer hier
  weiter und erzeugte frische Geheimnisse für eine fremde Datenbank; jetzt
  bricht er ab, **bevor** er eine `.env` schreibt, und nennt den Weg:
  `./install.sh --uebernehmen /pfad/zur/alten` oder den Werksreset.
- **Zwei Zuhause.** Hier liegt eine `.env`, und anderswo läuft ein Gerät. Das
  entscheidet ein Mensch. (Ein zweiter Anlauf nach geglückter Übernahme ist
  davon ausgenommen — das alte Verzeichnis trägt dann `ABGEGEBEN.txt`, und das
  ist eine Antwort, keine Zweideutigkeit.)

### Zwei Wege, eine Wurzel — und derselbe Ort

Der Deploy nach `main` fragt seit dem 29.08.2026 dasselbe (`deploy-local.sh`,
Schritt 0) und arbeitet damit im selben Verzeichnis wie das Artefakt. Ein aus
dem Artefakt installiertes Gerät hat kein `.git`; der Deploy legt es an
(`git init`), und `git reset --hard` fasst den Zustand nicht an, weil er
unversioniert ist. Beim ersten Deploy in ein solches Verzeichnis werden **alle**
Dienste gebaut: `PREV..NEW` beantwortet die Frage „was hat sich seit dem letzten
Push geändert", während das Gerät auf dem Stand eines Tags steht, der zwanzig
Merges zurückliegen kann. Dabei fällt `arasul-release.json`, denn der Satz „dieser
Baum kommt aus Artefakt X" stimmt danach nicht mehr — sonst meldete `/api/health`
für immer die Fassung des Artefakts.

**Zusammengelegt sind die beiden Wege nicht, und das mit Absicht.** Ein Deploy je
Merge, der den ganzen Bootstrap führte — Hardwareprüfung, zwölf Images,
Rauchtest —, wäre am Orin ein Tagesgeschäft aus Vollbauten; dieses Repo hatte
schon einmal elf Deploys in 66 Minuten. Der Deploy baut, was sich geändert hat;
das Artefakt richtet ein Gerät ein. Verschiedene Aufgaben, ein Ort.

### `./arasul update` ist weiterhin kein Update

Es baut nur den lokalen Baum neu (`docker compose pull|build|up`) und holt
keinen neuen Stand. `updateService.wegPruefen()` sagt über den Weg in der
Oberfläche selbst, dass er an diesem Gerät nicht geht (kein `docker`-Programm
im Backend-Container). Der Weg auf eine neue Fassung ist das Artefakt.

## Die Adresse des Artefakts

Die Website bekommt **eine** Umgebungsvariable, `ARA_INSTALLER_URL`, und sie
zeigt auf die Release-Datei:

```
https://github.com/Arasul-GmbH/arasul-jet/releases/download/v<Fassung>/arasul-<Fassung>.tar.gz
```

`arasul.de/api/download` streamt diese Datei hinter dem Kunden-Token;
`arasul.de/api/install` liefert ein kleines Shell-Skript, das sie lädt,
auspackt und den Einstiegspunkt aufruft. Beide bleiben unverändert — hier steht
nur die Form der Adresse, das Website-Repo zieht eine eigene Phase nach.

Solange die Website die Adresse noch nicht hat, geht es direkt:

```bash
curl -fsSLO https://github.com/Arasul-GmbH/arasul-jet/releases/download/v1.2.0/arasul-1.2.0.tar.gz
curl -fsSLO https://github.com/Arasul-GmbH/arasul-jet/releases/download/v1.2.0/arasul-1.2.0.tar.gz.sha256
sha256sum -c arasul-1.2.0.tar.gz.sha256
tar xzf arasul-1.2.0.tar.gz
cd arasul-1.2.0
./install.sh
```

## Was `install.sh` tut

Es ist eine dünne Schicht über `./arasul bootstrap`. Es legt an, was der
Bootstrap voraussetzt und was ein unbeaufsichtigter Lauf nicht erfragen kann:

1. Fassung aus `arasul-release.json` lesen. Fehlt sie, bricht es ab — ein Gerät
   ohne Fassung nimmt später keine Aktualisierung an, und das fällt erst
   Monate später auf.
2. Voraussetzungen prüfen: `docker`, `docker compose`, `openssl`, `curl`, und
   ob der Docker-Dienst diesem Benutzer antwortet.
3. **Nachsehen, ob es dieses Gerät schon gibt** (`scripts/lib/installation.sh`).
   Läuft es in einem anderen Verzeichnis, zieht sein Zustand hierher um und aus
   der Installation wird eine Aktualisierung — siehe
   [Das Artefakt aktualisiert](#das-artefakt-aktualisiert). Gibt es Volumes
   dieses Projekts, aber keine dazu passende Installation, **hält es an**.
4. `.env` schreiben (`scripts/interactive_setup.sh --non-interactive`). Ohne
   `--passwort` erzeugt es ein Startpasswort. Eine vorhandene bleibt, wie sie
   ist — bis auf `SYSTEM_VERSION`, `BUILD_HASH` und `MDNS_NAME`.
5. Netzname setzen (`scripts/setup/setup-mdns.sh`): System-Hostname für DHCP
   plus Avahi für `.local`. Siehe
   [NETZNAME_UND_ZERTIFIKAT.md](NETZNAME_UND_ZERTIFIKAT.md).
6. `arasul-platform.service` installieren, damit das Gerät nach einem Neustart
   von selbst hochkommt (in der richtigen Reihenfolge, nicht dreizehn Container
   gleichzeitig auf einem gerade gestarteten Orin). **Vor** dem Bootstrap, weil
   der Bootstrap mit der Erstausgabe endet und nichts sie nach oben schieben
   soll. Bei einer Aktualisierung ist derselbe Schritt der, der die Unit vom
   alten auf das neue Verzeichnis umhängt.
7. `./arasul bootstrap` — Hardware, Zertifikate, Images bauen, Datenbank,
   Dienste, Admin, **Kit-Schlüssel**, Rauchtest, **Erstausgabe**. Der Bootstrap
   sagt das letzte Wort; `install.sh` gibt an ihn ab (`exec`). Bei einer
   Aktualisierung `--aktualisierung`: dann bleiben Administrator und
   Kit-Schlüssel, wie sie sind, und der alte Stapel wird erst abgeschaltet,
   wenn die neuen Images stehen.

Optionen:

```bash
./install.sh                          # Passwort wird erzeugt und einmal gezeigt
./install.sh --passwort 'Geheim123'   # Passwort vorgeben
./install.sh --name werkstatt         # anderer Netzname als `arasul`
./install.sh --uebernehmen /pfad/alt  # die vorhandene Installation von Hand nennen
./install.sh --nur-vorbereiten        # bis vor den Bootstrap, für die Prüfung
```

## Was der Werksreset tut, und was er ausdrücklich nicht tut

`scripts/setup/factory-reset.sh` macht aus einem benutzten Gerät ein leeres.
Zwei Regeln, beide aus der Messung vom 28.08.2026:

**Er installiert nichts.** Bis dahin rief er zum Schluss `preconfigure.sh`;
das schrieb eine eigene `.env` und zog daraus ein Modell — dreißig Minuten
gegen einen `llm-service`, der gerade erst startete, und danach gehörte die
`.env` root, sodass `./install.sh` als normaler Benutzer nicht mehr an ihr
vorbeikam. Ein Reset, der schon halb installiert, ist eine **zweite**
Installation, die von der ersten abweicht. Der Aufruf ist raus.

**Er räumt alles Eigene weg**, auch was `docker compose down -v` nicht kennt:
jeden Container, dessen **Name mit `arasul-` beginnt** oder der ein **Etikett
`arasul.*`** trägt, die am Gerät gebauten App-Images (Etikett `arasul.app`), und
jedes Volume dieses Geräts — auch die aus früheren Projektnamen. Genau die
blieben am Orin stehen: die Volumes trugen die Datenbank des vorigen Kunden in
die nächste Installation, und zehn `arasul-sandbox-*` samt einem
`arasul-skills-sandbox` liefen nach dem Reset weiter, weil der Filter bis zum
28.08.2026 nur `arasul-app-*` traf. Was weder das eine noch das andere Merkmal
hat, bleibt stehen: ein Werksreset räumt sein eigenes Gerät auf, nicht den
Rechner eines Fremden. Erhalten bleiben nur die KI-Modelle; sie werden gesichert
und zurückgelegt.

Lief der Reset mit `sudo`, gibt er das Verzeichnis am Ende an den aufrufenden
Benutzer zurück.

## Die Erstausgabe: was der Bootstrap einmal sagt

Am Ende stehen zwei Dinge auf dem Bildschirm, und von beiden speichert das
Gerät nur einen bcrypt-Abdruck:

- **Das Startpasswort des Administrators** (wenn `install.sh` es erzeugt hat).
  Beim ersten Anmelden wird es gewechselt (`passwort_vom_admin`, Phase D1).
- **Der Deploy-Schlüssel für das Ara-Kit**, Bereich `app:deploy`. Mit ihm rollt
  ein Partner Apps auf dieses Gerät, ohne SSH und ohne Passwort (Phase C5).

Beides schreibt `scripts/util/erstausgabe.sh`, und zwar an **zwei** Orte: auf
die Konsole und in **`config/secrets/erstausgabe.txt`** (Rechte `600`, nur für
den Besitzer lesbar). Die Datei sagt in ihrer ersten Zeile, dass sie nach dem
Lesen zu löschen ist:

```bash
cat config/secrets/erstausgabe.txt
shred -u config/secrets/erstausgabe.txt
```

**Beides erscheint immer**, auch wenn der Rauchtest rot war, und immer **vor**
dem Fehlerbericht. Das ist der Fund des zweiten Werksresets vom 28.08.2026: die
Installation war in Ordnung — zehn Container healthy, Admin und Kit-Schlüssel
angelegt —, aber der Rauchtest stieß jeden Dienst nur einmal an, statt wie der
Deploy auf ihn zu warten. Das `dashboard-frontend` war neun Sekunden später
healthy, der `self-healing-agent` noch in seiner Startphase, `install.sh` endete
mit `1`, und die Zusammenfassung stand im grünen Zweig. Der Kit-Schlüssel war
angelegt, und gesehen hat ihn niemand. Ein Fehlerbericht ist nachlesbar, ein
einmal gezeigtes Geheimnis nicht.

Verloren? Ein neuer Schlüssel, der alte wird entwertet:

```bash
bash scripts/util/kit-schluessel.sh liste
bash scripts/util/kit-schluessel.sh anlegen "Kit von Firma Meier"
bash scripts/util/kit-schluessel.sh widerrufen aras_ab12cd3
```

## Was gefallen ist, und warum

| Weg                                         | Stand               | Begründung                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/deploy/create-factory-image.sh`    | gestrichen          | Baute Images auf einem Quellgerät und packte sie mit. Das Artefakt aus der CI kann das nicht (x86, keine GPU) und braucht es nicht: das Gerät baut selbst. Zwei Auslieferungswege wären zwei Geräte-Zustände.                                                                            |
| `scripts/deploy/factory-install.sh`         | gestrichen          | Der Einstiegspunkt des Factory-Images. Fällt mit ihm; `install.sh` ist der eine Einstiegspunkt.                                                                                                                                                                                          |
| `scripts/deploy/create-deployment-image.sh` | gestrichen          | Dritter Packer derselben Art, und er lud `llama3.1:8b` vor — ein Modell, das seit Phase C8 nicht mehr im Katalog steht. Er lieferte also aktiv Falsches aus.                                                                                                                             |
| `packaging/build_deb.sh` + `DEBIAN/`        | gestrichen          | Ein `.deb` der Plattform. Niemand rief es auf, keine Zeile Dokumentation beschrieb den Weg, und die Auslieferung ist ein Tarball mit Einstiegspunkt. Die **systemd-Units** unter `packaging/arasul-platform/etc/` bleiben: `install.sh` und `./arasul bootstrap` installieren sie.       |
| `scripts/deploy/create-update-package.sh`   | bleibt, nachgezogen | Erzeugt die signierten `.araupdate`-Pakete für den Offline-Weg über USB, und der lebt (`updateService`, `scripts/util/arasul-usb-trigger.sh`). Nachgezogen: die Fassung kommt aus dem Bau statt aus `VERSION`, und `PROJECT_ROOT` zeigte auf `scripts/` statt auf das Wurzelverzeichnis. |
| Datei `VERSION`                             | gestrichen          | Siehe oben.                                                                                                                                                                                                                                                                              |

## Abnahme

```bash
# Am Gerät, der zerstörende Teil:
sudo bash scripts/setup/factory-reset.sh
curl -fsSL https://arasul.de/api/install | bash

# Am Gerät, direkt danach: lief der Bootstrap bis zum Ende durch?
bash scripts/test/bootstrap-abnahme.sh

# Vom Arbeitsrechner, alles über die Schnittstelle:
ssh -f -N -L 8443:localhost:443 jetson
ARASUL_PASSWORT=... bash scripts/test/auslieferung-abnahme.sh
```

Drei Stufen, und jede misst etwas, das die anderen nicht sehen:

| Wo                              | Was                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI, Job `Installation`          | Baut das Artefakt, packt es aus und startet `./install.sh --nur-vorbereiten` darin. Danach: `.env` da und mit 600, `SYSTEM_VERSION` aus dem Bau, `validate-dependencies.sh` findet seine Compose-Datei, `docker compose config` schweigt, `erstausgabe.sh` nennt beide Geheimnisse und legt `config/secrets/erstausgabe.txt` mit 600 an, `bootstrap-abnahme.sh --trocken` grün.                                                                                                                                                                                                |
| CI, `aktualisierung-abnahme.sh` | Derselbe Job, zweiter Zug: Artefakt A installieren, den Zustand eines benutzten Geräts anlegen (Geheimnisse, Geräte-CA, eine App, ein Flow, eine Sicherung, Protokolle), Artefakt B daneben auspacken und `./install.sh` darin — **ohne** ihm zu sagen, wo A steht. Gemessen wird: dieselben Geheimnisse, jedes Zustandsstück da, neue Fassung, Rechte unverändert, A leer und mit `ABGEGEBEN.txt`, `./arasul` weigert sich dort. Dazu die Gegenprobe (Volumes ohne auffindbare Installation → Abbruch, ohne eine `.env` zu schreiben) und der Weg von Hand (`--uebernehmen`). |
| `bootstrap-abnahme.sh`          | Am Gerät nach dem Reset: laufen alle Dienste bis `document-indexer` und `self-healing-agent`, gibt es einen gültigen Kit-Schlüssel, antwortet `/api/health`, sind die App-Container von vorher weg.                                                                                                                                                                                                                                                                                                                                                                            |
| `auslieferung-abnahme.sh`       | Über die Schnittstelle: Fassung, CA-Zertifikat, Namen im Zertifikat, TLS ohne SNI, Kit-Schlüssel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Warum es den CI-Job gibt: bis zum 28.08.2026 prüfte die Auslieferung nur, ob
die Dateien **im** Artefakt liegen. Ausgeführt wurde es nie. Von den fünf
Funden des ersten Versuchs am Orin wären vier hier aufgefallen — vier
Wegewechsel und eine Zuweisung, alle ohne Jetson-Hardware messbar.

Was auch der CI-Job nicht beweisen kann: dass die Installation aus dem Artefakt
kam **und** dass zwölf ARM64-Images sich am Gerät bauen lassen. Dafür bleibt
der Ablauf oben. Für die Aktualisierung heißt das dasselbe: der Umzug des
Zustands, der Abbruch bei Zweideutigkeit und die Rechte danach sind gemessen;
was am Gerät noch aussteht, ist der Neubau der Images und der Start aus dem
neuen Verzeichnis. Der Lauf folgt, wenn der Dauerlauf A7 durch ist.

```bash
# Am Gerät, wenn A7 durch ist (Kundenweg, von einer Fassung auf die nächste):
tar xzf arasul-<neu>.tar.gz -C /home/arasul
cd /home/arasul/arasul-<neu> && ./install.sh
docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' \
  $(docker ps -q --filter label=com.docker.compose.project=arasul-platform) | sort -u
```

Die letzte Zeile ist die Probe darauf, dass **kein** Container mehr aus dem
alten Verzeichnis läuft — genau das war am 28.08.2026 bei `docker-proxy` der
Fall.
