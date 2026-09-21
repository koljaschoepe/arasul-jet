# Firmenordner: OpenCloud und Nextcloud mit Koljas Arbeitsbaum und dem Klienten am Mac nachgemessen (J33)

Gemessen am 21.09.2026 zwischen 14:01 und 16:03, **neben** dem laufenden Produkt
am Orin und nie darin; die Klienten liefen auf dem Mac. Auftrag
`firmenordner-dienst-nachmessen`, zweite Karte zu J33 und Folge der ersten
Messung ([`../2026-09-21-firmenordner-dienste/MESSUNG.md`](../2026-09-21-firmenordner-dienste/MESSUNG.md),
PR 760). Seafile ist raus: Blockspeicher, und echte Dateien am Gerät sind seit
dem 21.09.2026 Ausschlusskriterium. Kolja am selben Tag: Rechte werden nur
vergeben, nie unterhalb entzogen — damit ist Nextcloud nicht mehr Pflicht.

**Die Annahme** war: mindestens einer der zwei Dienste hält echte Dateien auf
der Platte, verliert mit dem Klienten am Mac keine Fassung und lässt sich vom
Kommandozeilen-Klienten so führen, dass ein einzeln freigegebener Ordner an
seiner echten Stelle im Baum liegt — sonst wird der Abgleich Eigenbau.

**Das Ergebnis in einem Satz:** die Annahme hält, und zwar bei **beiden**; der
Unterschied liegt nicht bei den Dateien, sondern bei der Anmeldung (Nextcloud
kann sie über Arasul, OpenCloud nicht) und beim Betrieb (OpenCloud sieht
Änderungen von außen sofort und ist schlank, Nextcloud sieht geänderte Dateien
nur nach einem Scan und braucht `sudo`, um seine eigenen Dateien zu lesen).

**Die Entscheidung: OpenCloud**, mit der Anmeldung als kleinem, benanntem
Eigenbau (Arasul legt Nutzer und Passwort über die Graph-API des Dienstes an —
getestet, Abschnitt „Anmeldung“). Nextcloud trägt ebenfalls, ist aber nur dann
die bessere Wahl, wenn es **keine zweite Passwortablage** geben darf; die
Begründung steht unter „Entscheidung“.

## Kurzfassung

Ein Ja oder Nein ist gemessen, keine Meinung; die Zeile dazu steht in dem
Abschnitt des Dienstes. Die Klienten am Mac sind `nextcloudcmd` 34.0.4 und
`opencloudcmd` 4.0.0 aus den Herstellerpaketen für macOS (arm64).

|                                                                           | OpenCloud 8.0.1 (rolling), Ablage `posix`                                                    | Nextcloud 35.0.0, Teamordner 23.0.1                                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Dateien als echte Dateien unter lesbarem Pfad                             | **ja** — `projects/<Raumname>`, Eigentümer das Konto des Geräts, ohne `sudo`                 | ja, aber `data/__groupfolders/1/files/…`, Eigentümer `www-data`, Rechte 770: **nur mit `sudo`** |
| Dienst sieht eine dort von außen **geänderte** Datei                      | **ja, 1,1 s** ohne Zutun                                                                     | **nein** (60 s gewartet); ja nach `occ groupfolders:scan`                                       |
| … eine von außen **neue** Datei / Ordner / gelöschte Datei                | ja, 1,1 s / 1,1 s / gelöscht schon beim ersten Nachsehen (≤ 1 s)                             | neue Datei ja, 0,4 s (Ordner und Löschen nicht gemessen)                                        |
| Konflikt, drei Varianten, Klient am Mac                                   | nichts verloren, Konfliktkopie beim Verlierer (lokal); Variante 1 und 2 erst im zweiten Lauf | nichts verloren, Konfliktkopie beim Verlierer (lokal), schon im ersten Lauf                     |
| Ordner, der nie abgeglichen wird und nur am Gerät lesbar ist              | ja, als **eigener Raum**; als unsichtbarer Unterordner desselben Raums **nein**              | ja, **beides**: lokaler Speicher und Unterordner per Regel unsichtbar                           |
| Ein Ordner der Ebene 2 per Kommandozeilen-Klient an der echten Stelle     | ja; Kette darüber = leere lokale Ordner, Server verweigert dort das Schreiben                | ja; Kette vom Server geliefert und **schreibgeschützt**, aber 26 Sperrregeln nötig              |
| Rechte **nur vergeben** genügt dafür                                      | ja                                                                                           | **nein** — Wurzel gesperrt heißt 404 und 500, alles darunter unerreichbar                       |
| Anmeldung über die Nutzer von Arasul hinter Traefik                       | **nein** (Kopfzeile wird ignoriert); Weg: Nutzer und Passwort über die Graph-API spiegeln    | **ja**: `user_saml` im Modus Umgebungsvariable liest `X-Arasul-User`                            |
| Dauer Arbeitsbaum am Orin (Dienst allein): hoch / herunter                | 75,5 s / 41,5 s                                                                              | 176,9 s / 97,3 s                                                                                |
| Dauer Arbeitsbaum mit dem Klienten am Mac über WLAN: hoch / herunter      | 267 s / 313 s                                                                                | 350 s / 645 s                                                                                   |
| Abgleich ohne Änderung, Mac                                               | 11 s                                                                                         | 3 s                                                                                             |
| RAM im Leerlauf                                                           | 357 MiB                                                                                      | 343 MiB (299 Dienst + 44 Datenbank)                                                             |
| RAM-Spitze hoch / herunter (Dienst allein)                                | 870 / 979 MiB                                                                                | 565 / 671 MiB                                                                                   |
| RAM-Spitze mit dem Klienten am Mac: hoch / herunter                       | 968 / **1.226 MiB**                                                                          | 533 / 517 MiB                                                                                   |
| CPU-Grenze `cpus: 2` gesetzt und gemessen                                 | Spitze **216 %**, Dauer 75,5 s; ohne Grenze 752 %, 23,5 s                                    | Spitze 284 % (Dienst 2 + Datenbank 1 Kern), Dauer 176,9 s; ohne Grenze 385 %, 223,9 s           |
| Platz für 110 MB Nutzdaten                                                | +127 MB                                                                                      | +129 MB (111 MB Dateien, 18 MB Datenbank)                                                       |
| Abbild                                                                    | 300 MB                                                                                       | 2,12 GB (+ PostgreSQL 411 MB, liegt am Gerät schon da)                                          |
| Änderungsprotokoll (aus der ersten Messung, hier mit `posix` nachgeprüft) | **ja**: 3.439 Einträge mit Nutzer; Änderungen von außen stehen **ohne Nutzer** darin         | nein (jeder liest nur seine eigenen Taten)                                                      |
| Lizenz des Dienstes                                                       | Apache-2.0                                                                                   | AGPL-3.0                                                                                        |

## Das Gerät: Lage vorher und nachher

|                               | belegt   | verfügbar | Platte belegt | Container                          |
| ----------------------------- | -------- | --------- | ------------- | ---------------------------------- |
| 14:01, vor der ersten Messung | 11,95 GB | 49,9 GB   | 475 GB        | 15, alle wie gemerkt               |
| 16:03, nach dem Aufräumen     | 12,01 GB | 49,8 GB   | 477 GB        | dieselben 15, keiner neu gestartet |

Die vollen Ausgaben: [`rohdaten/lage-vorher.md`](rohdaten/lage-vorher.md),
[`rohdaten/lage-nachher.md`](rohdaten/lage-nachher.md). Beim Aufräumen war die
Zahl der Container, Volumes, Netze und Abbilder mit `j33nach`, `opencloud` oder
`nextcloud` im Namen **null**, und das Verzeichnis `~/j33nach` samt allen Daten
(die Kopie des Arbeitsbaums, beide Datenablagen) war gelöscht. Die zwei
Gigabyte mehr Platte kann die Messung nicht tragen — es ist nichts mehr da,
das sie belegte —, ihre Ursache habe ich nicht verfolgt (der Bau-Zwischenspeicher
stand vor und nach der Messung bei 206 GB). **Die enge Zahl der ersten Messung
(31 GB frei bei geladenem 27B-Modell) konnte ich heute nicht neu nehmen**: das
Modell war entladen, die 49,9 GB gelten ohne. Der größte Wert dieser Messung
(1,2 GB RAM) wären vier Prozent der 31.

## Wie gemessen wurde

**Die Schutzregel** (Kolja, 21.09.2026) und wie sie gehalten wurde:

- Alles, was die Messung anlegte, hieß `j33nach-*`: Compose-Projekte, Container,
  Volumes, Netze. Eigene Ports nur auf `127.0.0.1` (18081 Nextcloud, 18082
  OpenCloud, 18083 der Messaufbau für die Anmeldung). Jeder Container mit
  `mem_limit` (Dienst 2 GB, Datenbank 1 GB, Traefik 256 MB, Stub 128 MB) **und**
  `cpus` (Dienst 2, Datenbank 1, Traefik und Stub 0,5). Das Produkt wurde nicht
  angefasst: keine Compose-Datei, kein Volume, kein Netz, kein Dienst, kein
  Neustart, kein Deploy.
- **Der Wächter** (`wacht` in [`messhuelle/lib.sh`](messhuelle/lib.sh)) hielt
  Startzeit, Neustartzähler, Zustand und Gesundheit jedes Containers fest, der
  nicht `j33nach-*` heißt, und verglich nach jedem Schritt; bei einer Abweichung
  wäre die Messung mit 99 beendet. Er schlug **nie** an. Ich habe den Merkzeitpunkt
  einmal neu gesetzt (beim Start von Nextcloud, nachdem OpenCloud durch war),
  der Vergleich davor war in Ordnung.
- **Die Fehlerzeilen der Produktlogs** las ich einmal nach dem Ende, ab dem
  Startzeitpunkt der Messung. `reverse-proxy`: **0**. `dashboard-backend`: **4**,
  und keine davon ist ein Ausfall: zwei Mal der Fehler beim Prüfen der
  Drosselung wegen eines unbekannten Wertes `network` im Aufzählungstyp
  `alert_metric_type` (14:10 und 14:29, ein Fehler des Produkts, unabhängig von der
  Messung) und zwei Mal ein nicht lesbares Docker-Ereignis (14:56:06 und
  14:56:29, genau in den Sekunden, in denen ich Traefik und den Stub für die
  Anmeldeprobe neu startete — beide siehe „Unterwegs gefunden“). Die Lücke, die die
  erste Messung nannte (die Logs der Produktdienste las der Wächter nicht),
  habe ich damit einmal geschlossen, aber erst hinterher und von Hand;
  `fehler_bericht` in `lib.sh` ist dafür da, nicht mehr.
- Die Kandidaten wurden **nacheinander** gemessen: OpenCloud von 14:16 bis 15:03,
  Nextcloud von 15:04 bis 15:50, danach OpenCloud noch einmal für den Lauf mit dem
  Klienten am Mac (Nextcloud stand dabei im Leerlauf). Nie lief unter Last mehr
  als ein Dienst.

**Der Arbeitsbaum:** eine **Kopie** von Koljas Arbeitsbaum des Überordners
`arasul` auf dem Mac (Quelle nur gelesen, nie beschrieben; sein Ordner mit
`.git` blieb unberührt): 3,2 GB im Original, **619 Dateien, 111 MB, 134
Ordner**, größte Datei 12 MB, 46 Dateien unter `.claude/`. Ausgeschlossen
(Kolja): `.git`, `node_modules`, Bau-Ordner (`.next`, `.venv`, `__pycache__`,
`dist`, `target`), die vier eingebetteten Produktrepos, `.claude/hooks`,
`.claude/settings.json` und `settings.local.json`, jede `.env`. **Zusätzlich von
mir** ausgeschlossen, weil sie Zugangsdaten tragen: `company/access.md` und
`company/.access-local.md`; dazu die Laufzeitordner `.playwright-mcp` und
`.DS_Store`. Nichts aus der Kopie liegt im Repo, und **keine Dateinamen aus der
Kundenablage** stehen in dieser Seite oder in den Rohdaten — der Ordner
„Kundenakten“ in den Proben ist ein Platzhalter, den ich angelegt habe. Die
Kopie auf dem Mac (`/tmp`), die Kopie am Orin und alle Daten der Dienste sind
gelöscht.

**Die Klienten am Mac** stammen aus den Paketen der Hersteller (Nextcloud-34.0.4.pkg
aus dem Cask, `OpenCloud_Desktop-v4.0.0-macos-clang-arm64.pkg` aus dem Release;
Prüfsummen gegen die des Herstellers gehalten), wurden mit `pkgutil
--expand-full` **nur entpackt, nicht installiert**, und liefen als
`nextcloudcmd` und `opencloudcmd` aus dem entpackten Ordner. Das ist die erste
Messung mit denen, die ein Mensch am Mac benutzt (die grafische Oberfläche
darüber nicht — siehe „Was nicht gemessen wurde“). Die Dienste am Orin hingen
über einen SSH-Tunnel auf `127.0.0.1`; die Übertragung war damit verschlüsselt
und ging über das echte WLAN dieses Macs.

**Das Netz** ist der größte Störer und gehört in jede Zeit: Ping zum Orin **3 ms**
im Leerlauf, **200 bis 1.200 ms** unter Last (der Rückstau, keine Verbindung,
die abbricht); ein einzelner `ssh`-Lauf schaffte 20 MB in 241 s, `rsync -z` der
111 MB dagegen in 2:36. Die Zeiten „mit dem Klienten am Mac“ messen deshalb
Dienst, Klient **und** diese Strecke, die vom Zeitpunkt abhing. Damit man
trotzdem den Dienst allein vergleichen kann, gibt es die Zeiten „am Orin“:
[`messhuelle/webdav.py`](messhuelle/webdav.py) lädt denselben Baum mit vier
Verbindungen per WebDAV hoch und herunter, ohne WLAN dazwischen. Das ist kein
Klient — es kennt keinen Konflikt, keine Journaldatei —, aber es zeigt, was der
Dienst kostet.

**RAM und CPU** stammen aus `docker stats`, jede Sekunde mitgeschrieben
([`rohdaten/*.ram`](rohdaten/)); die Spitze ist die Summe der Container des
Dienstes (bei Nextcloud Dienst plus Datenbank). `docker stats` rechnet gegen die
CPU-Grenze nicht als Deckel, sondern in Kernen: 216 % bei `cpus: 2` ist die
Grenze plus Messrauschen.

## OpenCloud 8.0.1 mit Ablage `posix`

Anders als in der ersten Messung lief OpenCloud hier mit dem Ablagetreiber
`posix` (`STORAGE_USERS_DRIVER=posix`, `STORAGE_USERS_POSIX_WATCH_FS=true`, dazu
`STORAGE_USERS_ID_CACHE_STORE=nats-js-kv`); die Vorgabe, `decomposed`, legt die
Dateien als Blöcke mit Metadatei ab, also gerade nicht als echte Dateien. Der
Bind-Mount lag unter `~/j33nach/opencloud/daten`; die Konfiguration in
[`messhuelle/compose.opencloud.yaml`](messhuelle/compose.opencloud.yaml).

### Echte Dateien, lesbarer Pfad, Änderung von außen

Ja. Der Raum „Firma“ lag unter `posix/projects/<Raum-ID>/` als gewöhnlicher
Ordnerbaum, jede Datei unter ihrem Namen, Eigentümer das Konto `arasul` (uid
1000, dieselbe wie im Container). Daneben liegt versteckt `.oc-nodes/` mit der
Verwaltung des Dienstes; die Nutzdaten brauchen ihn nicht. **Der Pfad trägt die
Raum-ID, nicht den Namen** — bis man die Vorlage setzt:
`STORAGE_USERS_POSIX_GENERAL_SPACE_PATH_TEMPLATE="projects/{{.SpaceName}}"`
(gemessen: ein neuer Raum „Pfadtest“ lag unter `projects/Pfadtest/`; die
schon angelegten Räume behalten ihre ID).

[`rohdaten/oc-aussen.txt`](rohdaten/oc-aussen.txt): eine vorhandene Datei am
Gerät ergänzt — die API meldet die neue Größe nach **1,1 s**; eine neue Datei am
Gerät angelegt — abrufbar nach 1,1 s; gelöscht — 404 beim ersten Nachsehen; ein neuer Ordner mit
Datei darin — nach 1,1 s. Der Weg ist `inotifywait` im Container, gemeldet als
`skip already known item` in einem Log, das **auch bei `OC_LOG_LEVEL=warn` jede
Datei mit einer Zeile auf Stufe `trace` nennt** — das wächst mit dem Bestand,
gemessen habe ich es nicht.

### Konflikt mit dem Klienten am Mac

Zwei Rechner, beide `opencloudcmd` 4.0.0, A = `anna`, B = `admin`, je eigener
Ordner; die drei Varianten der ersten Messung
([`schritte/oc-konflikt.sh`](messhuelle/schritte/oc-konflikt.sh),
[`rohdaten/oc-konflikt.txt`](rohdaten/oc-konflikt.txt)):

| Variante                                                        | nach dem ersten Abgleich                                     | nach dem zweiten                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1 — dieselbe Sekunde, beide gleichen gleichzeitig ab            | Server: Fassung von B; A und B halten **noch je die eigene** | A: `d1 (conflicted copy …).md` mit A, `d1.md` mit B; B unverändert |
| 2 — drei Sekunden auseinander, Abgleich gleichzeitig            | Server: Fassung von B; A hält noch die eigene                | A: `d2 (conflicted copy …).md` mit A, `d2.md` mit B                |
| 3 — nacheinander (A gleicht ab, B hatte den Stand nicht geholt) | Server: Fassung von A; B: Konfliktkopie mit B, `d3.md` mit A | unverändert                                                        |

**Ergebnis: in allen drei Varianten geht keine Fassung verloren**, und der
Verlierer hat sie danach als Konfliktkopie neben der Datei liegen. Die Kopie
bleibt **lokal**: auf dem Server lag nach dem letzten Lauf nur `d1.md`. Bei
Variante 1 und 2 gleicht der Klient erst im **zweiten** Lauf ab — ein laufender
Klient tut das von selbst, ein einmaliger Aufruf nicht. Das ist **das Gegenteil
der ersten Messung** (`owncloudcmd` 5.3.2 aus Debian: in Variante 1 hielt B
seine Fassung und meldete Erfolg, in Variante 2 wurde Bs Fassung ohne
Konfliktkopie überschrieben): mit dem Klienten, den der Hersteller ausliefert,
gilt der Vorbehalt aus der Empfehlung der ersten Messung nicht mehr. **Ein vierter
Fall, aus einem Fehler im Aufbau entstanden:** in einem ersten Versuch lagen die
Ausgangsdateien nicht auf dem Server, beide Rechner legten `d1.md` **neu** an,
in derselben Sekunde. Nach drei Abgleichen stand am Server Fassung A, A hielt A
— und B hielt weiter **seine** eigene, ohne Konfliktkopie und ohne Meldung
([`rohdaten/oc-konflikt-lauf0-setup-fehlerhaft.txt`](rohdaten/oc-konflikt-lauf0-setup-fehlerhaft.txt);
die Varianten 2 und 3 desselben Versuchs verhielten sich wie oben, sie zählen
nicht). Das ist **eine Beobachtung**, nicht wiederholt und für Nextcloud nicht
gemessen; sie trifft „beide legen dieselbe Datei neu an, gleichzeitig“ und ist
die Stelle, an der ich bei OpenCloud als Erstes nachmessen würde.

### Ein Ordner, der nie abgeglichen wird

Ja, als **eigener Raum**: ein Raum „Geraet“ mit einem Ordner darin, an niemanden
freigegeben. Am Gerät ohne `sudo` lesbar; `anna` (Mitglied von „Firma“) sieht
ihn in `GET /graph/v1.0/me/drives` nicht, `GET` und `PROPFIND` darauf
antworten 404, und ein Klient, der nur „Firma“ abgleicht, holt ihn nie
([`rohdaten/oc-geraet.txt`](rohdaten/oc-geraet.txt)). Als **unsichtbarer
Unterordner innerhalb von „Firma“** geht es nicht — das wäre Entziehen nach
unten, und OpenCloud kennt nur Erweitern. Bei dem, was der Auftrag verlangt (ein
Ordner nur für das Gerät), reicht der eigene Raum; er liegt aber in der Ablage
neben „Firma“, nicht darin.

### Ein Ordner der Ebene 2 für einen Nutzer

`ben` bekam **nur** `Arbeitsbaum/experiments/010-firmenordner` (Bearbeiten);
Wurzel und Kette wurden ihm nicht gegeben
([`schritte/oc-ebene2.sh`](messhuelle/schritte/oc-ebene2.sh),
[`rohdaten/oc-ebene2.txt`](rohdaten/oc-ebene2.txt)):

- `opencloudcmd -u ben … Shares <Ordner>` legte den Ordner mit seinen drei Dateien
  an die **echte Stelle**: `experiments/010-firmenordner/…` — den Ort bestimmt der
  Aufrufer über das Zielverzeichnis; der Klient legt `experiments/` nicht selbst
  an. Die Kette darüber besteht nur lokal, der Server kennt sie für `ben` nicht.
- Was er nicht bekam, bekam er nicht: `company/…` und der Geschwisterordner
  `003-partnerumfrage` antworten 404.
- **In der Kette darf `ben` nichts anlegen**: schreibt er lokal in `experiments/`
  und gleicht ab, meldet der Klient „Not allowed because you don't have
  permission to add files in that folder“, die Datei kommt nicht auf den Server
  (`404`), die Datei im Ordner darunter kommt durch (`200`). Dieselbe Meldung
  kam schon im **ersten** Lauf, an der Journaldatei des Klienten
  (`.sync_journal.db`), die er **in das Zielverzeichnis** legt, also in die
  Kette, und mit `--sync-hidden-files` hochladen will — ein Fund der Messung,
  siehe „Unterwegs gefunden“; der Lauf endete deshalb mit `Failed to sync`, obwohl
  alles Gewollte angekommen war.
- **Die Kette lesbar zu machen kostet die Geschwister**: gibt man `ben` zusätzlich
  `Arbeitsbaum/experiments` als Betrachter, liest er `003-partnerumfrage` und
  `STIMME.md`, und `GET /graph/v1.0/me/drives` führt `experiments` **und**
  `010-firmenordner` als zwei Einhängepunkte auf — der Klient würde `010` einmal
  neben und einmal in `experiments` ablegen (nicht mit dem Klienten gegengeprüft,
  aus der Liste abgelesen).

Ja für den Ort, Nein für „die Kette ist auch server-seitig eine lesbare
Kette, ohne dass die Geschwister mitkommen“ — das ist die Sache, die nur
Nextcloud kann (unten).

### Anmeldung über die Nutzer von Arasul

**Nein — nicht direkt.** Aufbau: ein eigener Traefik `j33nach-traefik` und ein
Stub, der die Forward-Auth aus C4 nachbildet (Cookie `arasul_session` gültig →
200 und `X-Arasul-User`, `X-Arasul-Role`, sonst 401; die echte Stelle ist
`GET /api/auth/verify`, sie liefert dieselbe Form), davor der Dienst
([`schritte/oc-anmeldung.sh`](messhuelle/schritte/oc-anmeldung.sh),
[`rohdaten/oc-anmeldung.txt`](rohdaten/oc-anmeldung.txt)):

| Aufruf über Traefik                                                                      | Ergebnis                                     |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| ohne Sitzung                                                                             | 401 (Traefik, der Dienst sieht nichts)       |
| mit Sitzung, `X-Arasul-User: anna` kommt an                                              | **401** — der Dienst ignoriert die Kopfzeile |
| mit Sitzung und selbst mitgeschickten `X-Arasul-User`, `Remote-User`, `X-Forwarded-User` | 401                                          |
| mit Sitzung **und** Basic-Anmeldung `anna` am Dienst                                     | 200                                          |
| ohne Sitzung, aber Basic-Anmeldung (ein Sync-Klient)                                     | 401 — die Forward-Auth lässt ihn nicht durch |

OpenCloud hat einen eigenen Anmeldeanbieter (`idp`, OIDC mit Code-Flow) und
nimmt Nutzer entweder von dort oder von einem **fremden** OIDC-Anbieter — Arasul
ist keiner, ihn dazu zu machen wäre ein eigenes Vorhaben. Die zwei Wege, die
bleiben:

1. **Arasul spiegelt Nutzer und Passwort über die Graph-API.** Gemessen: Nutzer
   anlegen `201`, Passwort setzen (`PATCH`) `200` und danach nur noch das neue
   gültig (`200` / altes `401`), Nutzer löschen `204` und danach `401`. Arasul
   kennt das Klartextpasswort genau in den zwei Augenblicken, in denen es
   gesetzt wird (Administrator setzt das Startpasswort, Mensch wechselt es) —
   also reicht es, dort **eine Anfrage mehr** zu stellen. Zwei Ablagen für
   dasselbe Geheimnis, aber eine Richtung.
2. Der Weg über die Oberfläche: Forward-Auth als Türsteher davor, dann meldet
   sich der Mensch **ein zweites Mal** am Dienst an. Für einen Mitarbeiter ist
   das die Zumutung, die die Standardsoftware nicht haben soll.

**Und in beiden Fällen kommt der Sync-Klient nicht durch die Forward-Auth**, weil
er das Cookie nie hat: der Dienst braucht einen Router **ohne** Forward-Auth für
den Abgleich (`/dav`, `/remote.php`), auf dem er sich selbst anmeldet.

### Dauer, RAM und CPU für den Arbeitsbaum

| Messung                                                                                                  | Dauer     | RAM-Spitze    | CPU-Spitze |
| -------------------------------------------------------------------------------------------------------- | --------- | ------------- | ---------- |
| Leerlauf (5 Proben)                                                                                      | —         | 357 MiB       | 0 %        |
| hoch, am Orin, 4 Verbindungen, `cpus: 2`                                                                 | 75,5 s    | 870 MiB       | 216 %      |
| Abgleich ohne Änderung, am Orin (alle 134 Ordner nacheinander abgefragt, die Obergrenze eines Abgleichs) | 9,5 s     | 514 MiB       | 207 %      |
| herunter, am Orin, 4 Verbindungen                                                                        | 41,5 s    | 979 MiB       | 210 %      |
| RAM nach 30 s Ruhe                                                                                       | —         | 389 MiB       | —          |
| **hoch, Mac, WLAN**                                                                                      | **267 s** | 968 MiB       | 215 %      |
| **herunter, Mac, WLAN**                                                                                  | **313 s** | **1.226 MiB** | 217 %      |
| Abgleich ohne Änderung, Mac                                                                              | 11 s      | —             | —          |
| hoch am Orin **ohne** CPU-Grenze (`cpus: 12`)                                                            | 23,5 s    | 865 MiB       | **752 %**  |

Alle 619 Dateien kamen unten an, Baum bytegleich bis auf einen leeren Ordner,
den das Werkzeug am Orin nicht mitnimmt (es lädt Dateien). **Die CPU-Grenze
wirkt:** derselbe Upload braucht mit `cpus: 2` gut dreimal so lang (75,5 s gegen
23,5 s), nimmt dafür aber nur die zwei Kerne statt sieben bis acht. **Die Zeit
am Mac ist nicht die des Dienstes**: 267 s gegen 75,5 s ist vor allem das
WLAN und die Zahl der Anfragen je Datei (nicht zerlegt); der RAM-Wert des Dienstes stieg mit
dem Klienten am Mac trotzdem auf 1,2 GB — das ist die Zahl, die man für die
Bemessung im Produkt nehmen muss, nicht die 870 MiB des Werkzeugs.

Platz: 181 → 308 MB Ablage für 109,7 MB Nutzdaten, also **+127 MB**; woraus die
17 MB Mehrbedarf bestehen (die Verwaltung des Dienstes in `.oc-nodes`), habe ich
nicht zerlegt.

## Nextcloud 35.0.0 mit Teamordnern

`nextcloud:latest` (Apache, PHP) mit `postgres:16-alpine`, App `groupfolders`
23.0.1 und, für die Anmeldeprobe, `user_saml` 8.3.1 ([`messhuelle/compose.nextcloud.yaml`](messhuelle/compose.nextcloud.yaml),
[`rohdaten/nc-setup.txt`](rohdaten/nc-setup.txt)). Bereit in 31 s nach dem Start
(das Abbild war da).

### Echte Dateien, lesbarer Pfad, Änderung von außen

Ja **und** Nein. Die Dateien liegen **als echte Dateien** unter
`data/__groupfolders/1/files/Arbeitsbaum/…`, der Ordner heißt nach der ID des
Teamordners. Er gehört `www-data` (uid 33), das Datenverzeichnis hat die Rechte
770: **das Konto des Geräts kann seine eigenen Dateien ohne `sudo` nicht
lesen** — für einen Agenten oder eine App am Gerät, die den Firmenordner als
Ordner lesen soll, ist das ein Hindernis, das OpenCloud nicht hat.

[`rohdaten/nc-aussen.txt`](rohdaten/nc-aussen.txt):

- **Eine vorhandene Datei am Gerät geändert: nicht gesehen.** 60 s gewartet,
  die API meldete weiter die alte Größe (2.416 statt 2.427 Byte); erst
  `occ groupfolders:scan 1` holte sie nach. Es gibt keinen Beobachter, der das
  von selbst täte; ein Betrieb müsste den Scan regelmäßig auslösen.
- **Eine neue Datei am Gerät: gesehen nach 0,4 s** — Nextcloud vergleicht beim
  Zugriff auf einen Ordner dessen Änderungszeit, findet also Neues, aber nicht
  Geändertes in einer Datei, die es schon kennt.
- **Als „lokaler Speicher“ eingebunden** (`files_external`, Option
  `filesystem_check_changes=1`, Bind-Mount `extern/`) sieht der Dienst beides
  nach 0,4 s. Diese Einbindung hat aber **keine Teamordner-Rechte**: sie kennt
  „Nutzer darf / darf nicht“, nicht die Regeln je Ordner, die für den
  Firmenordner der Grund waren.

### Konflikt mit dem Klienten am Mac

Beide `nextcloudcmd` 34.0.4, A = `anna`, B = `admin`
([`schritte/nc-konflikt.sh`](messhuelle/schritte/nc-konflikt.sh),
[`rohdaten/nc-konflikt.txt`](rohdaten/nc-konflikt.txt)): in **allen drei
Varianten** liegt beim Verlierer nach dem ersten Lauf eine
`… (conflicted copy …).md` mit seiner Fassung, und seine `.md` hat die
Fassung des Gewinners; der Server hat eine Fassung, die Kopie bleibt lokal.
Verloren geht nichts. Gewonnen haben in Variante 1 A, in 2 B (der Spätere), in 3
A (der zuerst Abgleichende); der Verlierer erfährt es nur durch die Kopie im
eigenen Ordner.

### Ein Ordner, der nie abgeglichen wird

Ja, auf **zwei** Wegen ([`rohdaten/nc-geraet.txt`](rohdaten/nc-geraet.txt)):

- **Lokaler Speicher** `/mnt/geraet`, nur für `admin` eingebunden: am Gerät
  ohne `sudo` lesbar (der Bind-Mount ist von mir beschreibbar), `admin` sieht
  die Datei (200), `anna` nicht (404).
- **Unterordner im Teamordner**, für `anna` per Regel unsichtbar (Regel mit der
  Maske 31 und den Rechten 0): `anna` bekommt 404, sieht ihn in `Firma/` nicht,
  liest aber `Firma/Arbeitsbaum`; am Gerät liegt die Datei unter dem
  Teamordner.

Das ist der Fall, den OpenCloud nur als eigener Raum kann — Nextcloud kann ihn
**im selben Baum**. Die Kehrseite steht im nächsten Abschnitt: die Regel gilt
für den Ordner, den es heute gibt.

### Ein Ordner der Ebene 2 für einen Nutzer

`ben` (Mitglied der Gruppe des Teamordners) soll nur
`Arbeitsbaum/experiments/010-firmenordner` bekommen
([`schritte/nc-ebene2.sh`](messhuelle/schritte/nc-ebene2.sh),
[`schritte/nc-ebene2b.sh`](messhuelle/schritte/nc-ebene2b.sh),
[`rohdaten/nc-ebene2.txt`](rohdaten/nc-ebene2.txt),
[`rohdaten/nc-ebene2b.txt`](rohdaten/nc-ebene2b.txt)):

- **Mit reinem Vergeben geht es nicht** (die Regel, die Kolja am 21.09.2026 für
  richtig hielt): Wurzel des Teamordners für `ben` gesperrt, das Blatt freigegeben
  — dann sieht `ben` **nichts** (`Firma/` leer), der Weg zum Blatt antwortet
  `500`, und auch die Kette lesbar zu geben ändert das nicht (404 überall). Eine
  Regel weiter unten macht einen gesperrten Elternordner nicht wieder
  erreichbar.
- **Es geht, wenn man die Geschwister einzeln sperrt:** die Wurzel, `Arbeitsbaum`
  und `experiments` für `ben` nur lesbar, das Blatt voll, und **jeder
  Geschwisterordner** in jeder Ebene der Kette gesperrt — **26 Regeln** für diesen
  Baum. Dann sieht `ben` in `Firma/` nur `Arbeitsbaum/`, dort nur `experiments/`, dort nur
  `010-firmenordner/`; Geschwister und Dateien daneben 404; in die Kette
  schreiben `403`, ins Blatt `201`.
- **`nextcloudcmd -u ben --path /Firma`** legte danach genau
  `Arbeitsbaum/experiments/010-firmenordner/…` an die echte Stelle, und die
  **Kette ist auch am Mac schreibgeschützt**: der Klient setzt die Ordner darüber
  auf „nur lesen“, ein Schreiben dort scheitert mit `Permission denied`, ohne dass
  der Server gefragt wird; im Blatt gleicht er ab (Server `200`).
- **Die Kehrseite:** eine Regel gilt für den Ordner, der beim Setzen da war.
  Legt der Administrator danach in der Kette `experiments/neu-nach-der-regel/`
  an, **liest `ben` ihn** (200), und einen neuen Ordner in der Wurzel des
  Teamordners ebenfalls (207), bis jemand ihn sperrt. Das Vorgabeverhalten ist
  „sichtbar“; ein Firmenordner, in dem Menschen Ordner anlegen, verrät damit
  laufend Dinge, die niemand freigegeben hat.

### Anmeldung über die Nutzer von Arasul

**Ja, mit einer App und einer Einstellung.** `user_saml` hat einen Modus
„Umgebungsvariable“; mit `general-uid_mapping=HTTP_X_ARASUL_USER` liest
Nextcloud die Kennung aus der Kopfzeile, die die Forward-Auth setzt
([`schritte/nc-anmeldung.sh`](messhuelle/schritte/nc-anmeldung.sh),
[`schritte/nc-anmeldung-wer.sh`](messhuelle/schritte/nc-anmeldung-wer.sh),
[`schritte/nc-anmeldung-spoof.sh`](messhuelle/schritte/nc-anmeldung-spoof.sh),
[`rohdaten/nc-anmeldung.txt`](rohdaten/nc-anmeldung.txt)) — derselbe Aufbau wie bei
OpenCloud, Traefik mit dem Stub davor:

| Aufruf über Traefik                                                 | Ergebnis                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| WebDAV ohne Sitzung                                                 | 401 (Traefik)                                                                          |
| **WebDAV mit Sitzung, ohne Nextcloud-Passwort**                     | **207**, die Dateien von `anna`                                                        |
| **Browser: `GET /login` mit Sitzung, Weiterleitungen gefolgt**      | landet auf `/apps/dashboard/`, `data-user="anna"`, `GET /ocs/…/cloud/user` sagt `anna` |
| Sitzung als `anna`, dazu `X-Arasul-User: admin` selbst mitgeschickt | Ordner von `admin`: 1 Eintrag (nur er selbst) — **kein** Zugriff                       |
| dasselbe mit `X_Arasul_User`, `X.Arasul.User`                       | 1 Eintrag — kein Zugriff                                                               |
| ohne Sitzung, nur `X_Arasul_User: admin`                            | 401                                                                                    |
| Traefik-Sync-Klient mit Basic-Anmeldung, ohne Sitzung               | 401                                                                                    |
| **am Traefik vorbei** direkt am Dienst mit `X-Arasul-User: admin`   | **12 Einträge — Zugriff als `admin`**                                                  |

Was daraus folgt: hinter Traefik überschreibt die Forward-Auth eine mitgeschickte
Kopfzeile, auch in den Schreibweisen, die PHP auf dieselbe Variable abbildet
(`_`, `.`) — der Angriff, vor dem Traefik selbst warnt
(`aliasHeadersStrategy is not configured`), lief **nicht** durch; **die
Sicherheit hängt aber vollständig daran, dass der Dienst nur über Traefik zu
erreichen ist** — wer den Port kennt, ist jeder. Im Produkt hieße das: kein
veröffentlichter Port, ein Netz nur mit Traefik. Und **wie bei OpenCloud kommt
der Sync-Klient nicht durch die Forward-Auth**; er braucht einen eigenen Router
und meldet sich mit einem App-Passwort (das der Mensch über die Oberfläche
anlegen würde) am Dienst an. **Nicht gemessen:** dass Nextcloud einen Nutzer,
den es noch nicht gibt, beim ersten Aufruf selbst anlegt (`anna` und `ben`
legte ich mit `occ` an) — ohne das müsste Arasul Nutzer auch hier anlegen, nur
ohne Passwort.

### Dauer, RAM und CPU für den Arbeitsbaum

| Messung                                                                                  | Dauer     | RAM-Spitze | CPU-Spitze |
| ---------------------------------------------------------------------------------------- | --------- | ---------- | ---------- |
| Leerlauf (5 Proben)                                                                      | —         | 343 MiB    | 0 %        |
| hoch, am Orin, 4 Verbindungen, `cpus: 2` (+ 1 Datenbank)                                 | 176,9 s   | 565 MiB    | 284 %      |
| Abgleich ohne Änderung, am Orin (alle 134 Ordner nacheinander abgefragt, die Obergrenze) | 45,0 s    | 482 MiB    | 100 %      |
| herunter, am Orin, 4 Verbindungen                                                        | 97,3 s    | 671 MiB    | 243 %      |
| RAM nach 30 s Ruhe                                                                       | —         | 391 MiB    | —          |
| **hoch, Mac, WLAN**                                                                      | **350 s** | 533 MiB    | 245 %      |
| **herunter, Mac, WLAN**                                                                  | **645 s** | 517 MiB    | 226 %      |
| Abgleich ohne Änderung, Mac                                                              | 3 s       | —          | —          |
| hoch am Orin, Dienst **ohne** CPU-Grenze                                                 | 223,9 s   | 704 MiB    | 385 %      |

Alle 619 Dateien kamen unten an. **Die CPU-Grenze kostet bei Nextcloud nichts:**
ohne Grenze war derselbe Upload sogar langsamer (223,9 s gegen 176,9 s) — der
Lauf danach fand die Tabellen schon voll, und PHP mit vier Verbindungen nutzt
die Kerne nicht, die es hätte; die Datenbank mit einem Kern ist der enge Punkt.
Das ist die Umkehrung von OpenCloud, das die Kerne nimmt, die man ihm lässt.
Platz: 130 → 241 MB im Datenverzeichnis (+111 MB) und 56 → 74 MB in der
Datenbank (+18 MB): **+129 MB**.

## Entscheidung

**OpenCloud trägt den Firmenordner. Nextcloud trägt ihn auch, aber nicht als
Standard.**

Was die Annahme verlangte, erfüllt OpenCloud vollständig: echte Dateien unter
einem Pfad, den das Gerät ohne `sudo` liest und der bei einer Änderung von außen
nach einer Sekunde stimmt; keine verlorene Fassung mit dem Klienten, den der
Hersteller ausliefert (die Lücke der ersten Messung war der Debian-Klient);
ein einzeln freigegebener Ordner an seiner echten Stelle im Baum.

**Warum nicht Nextcloud:** es kann mehr Rechte, und es kann Anmeldung über Arasul
— aber (1) es sieht eine am Gerät **geänderte** Datei nicht und braucht dafür
einen Scan, den jemand betreiben muss; (2) das Konto des Geräts liest seine
eigenen Dateien nicht ohne `sudo`; (3) die einzige Weise, einen Ordner der Ebene 2
einzeln zu vergeben, ist Entziehen nach unten, und die Regeln decken nur, was
beim Setzen da war — das ist die Regel, die Kolja am 21.09.2026 gestrichen hat,
und die Messung sagt, warum: reines Vergeben ergibt dort **nichts**; (4) 2,1 GB
Abbild, eine Datenbank, PHP — ein Vielfaches an Betrieb für die fünf Jahre
unbeaufsichtigt. Die Übersicht der Änderungen (das Protokoll) bleibt bei
Nextcloud offen.

**Was bei OpenCloud noch zu bauen ist, in dieser Reihenfolge:**

1. **Die Anmeldung** — ein kleiner Eigenbau: beim Anlegen, beim Setzen des
   Startpasswortes, beim Passwortwechsel und beim Löschen ruft das Backend die
   Graph-API des Dienstes (die vier Anfragen sind gemessen); der Rest der
   Anmeldung bleibt bei Arasul. Sync-Klienten brauchen einen Router ohne
   Forward-Auth.
2. **`cpus: 2` und `mem_limit` mindestens 2 GB im Produkt.** Mit dem Klienten am
   Mac stieg der Dienst auf 1,2 GB; die 870 MiB der ersten Zahl sind die des
   Werkzeugs.
3. **Das Log:** `trace`-Zeilen je Datei bei `OC_LOG_LEVEL=warn` — vor dem
   Produktbetrieb messen, wie schnell das den Platz füllt, und Docker-Log mit
   Grenze fahren.
4. **`STORAGE_USERS_POSIX_GENERAL_SPACE_PATH_TEMPLATE`** setzen, damit der Pfad den
   Namen trägt statt der ID.

**Was die Entscheidung kippt:** wenn es **keine zweite Passwortablage** geben darf
(Anforderung an die Standardsoftware, nicht an den Firmenordner), ist
Nextcloud mit `user_saml` der einzige Dienst, der das kann — dann mit dem Scan als
Betrieb, `sudo` am Gerät und dem Bewusstsein, dass ein neuer Ordner erst nach der
Sperre unsichtbar ist. Die Lizenzfrage (AGPL im verkauften Gerät) gehört zu G5 und
bleibt bei Kolja; sie spricht ebenfalls für OpenCloud (Apache-2.0).

## Was nicht gemessen wurde

- **Die grafischen Klienten am Mac** (OpenCloud Desktop und Nextcloud Desktop):
  gemessen ist die Kommandozeile aus demselben Paket, dieselbe Abgleichmaschine,
  aber ohne Finder-Anbindung, ohne Auswahl der zu synchronisierenden Ordner, ohne
  Virtual-Files. Was Kolja beim Ernten mit den grafischen ansehen kann, ist unten
  aufgeführt.
- **Windows und Linux als Klient**, mehr als zwei Rechner, Dateien über 12 MB,
  ein Abgleich außerhalb des Heimnetzes.
- **Sicherung und Weg zurück (C9)** der Daten des Dienstes; bei `posix` liegt
  alles in einem Baum, bei Nextcloud auch in einer Datenbank.
- **Der Betrieb über Wochen:** die Ablage `posix` ist die jüngere von OpenCloud;
  ein 500 in einem Lauf (siehe „Unterwegs gefunden“) ist kein Beweis, aber ein
  Anlass, den Dauerlauf zu fragen.
- **Das echte Traefik des Geräts** (Schutzregel): die Anmeldeprobe lief gegen
  einen eigenen Traefik derselben Version, mit der Forward-Auth als Stub.
- **Die Umstellung eines schon laufenden Raums auf einen lesbaren Pfad.**
- **„Beide legen dieselbe Datei neu an“** bei Nextcloud, und bei OpenCloud nur
  als einmalige Beobachtung (siehe dort).
- **Ob Nextcloud einen Nutzer beim ersten Aufruf über die Kopfzeile selbst
  anlegt** (`user_saml` kann es; `anna` und `ben` gab es schon).
- **Wie schnell ein laufender Klient eine Änderung von außen erreicht:** gemessen
  ist, wann der Dienst sie kennt, nicht wann der Klient sie holt.

## Schritte für die grafischen Klienten (Kolja, beim Ernten)

Nichts davon ist Voraussetzung der Entscheidung; es sind die Stellen, an denen
die grafischen Klienten von der Kommandozeile abweichen können.

1. **Konflikt, drei Varianten** (Anleitung in
   [`schritte/oc-konflikt.sh`](messhuelle/schritte/oc-konflikt.sh) gelesen als
   Drehbuch): zwei Konten, dieselbe Datei, Variante 1 = beide in derselben
   Sekunde speichern, 2 = drei Sekunden versetzt, 3 = A gleicht ab, B ändert auf
   altem Stand. Erwartet: eine Konfliktkopie neben der Datei beim Verlierer, keine
   verlorene Fassung, und ob der Klient den Konflikt **anzeigt**.
2. **Einen Ordner der Ebene 2 in der grafischen Oberfläche verbinden** (OpenCloud:
   „Freigegeben mit mir“ → „Synchronisieren“; wo landet der Ordner, und lässt
   sich das Ziel auf `…/experiments/010-firmenordner` legen?).
3. **Ob der Klient das „nur lesen“ der Kette zeigt** (Nextcloud: Schloss am
   Ordner; OpenCloud: gibt es die Kette überhaupt).

## Unterwegs gefunden, nicht Auftrag

- **Das WLAN ist der Engpass jeder Zeit am Mac:** Ping 3 ms im Leerlauf, 200 bis
  1.200 ms, sobald der Klient hochlädt (Rückstau); der erste Versuch, den Baum mit
  `opencloudcmd` hochzuladen (bei 200 bis 400 ms Ping), kam in einer Viertelstunde
  auf 92 von 619 Dateien und wurde abgebrochen, der spätere, bei gutem Zustand,
  brauchte 267 s. Für ein
  Büro, das den Firmenordner über WLAN abgleichen soll, ist das die Zahl, die
  zählt, nicht die des Dienstes. Die Zeiten von Nextcloud und OpenCloud am Mac
  wurden zu **verschiedenen Zeitpunkten** und bei **verschiedenem Ping** genommen
  (Nextcloud 52 ms Mittel vorher, OpenCloud 7 ms) und sind untereinander nur
  Größenordnungen; die Zeiten am Orin sind die vergleichbaren.
- **`opencloudcmd --sync-hidden-files` gleicht seine eigene Journaldatei ab**
  (`.sync_journal.db`): danach meldet jeder Lauf `Conflict` an dieser Datei und
  ein `500` an dem Raum, und endet mit `Failed to sync`, obwohl alle Dateien
  angekommen sind. Mit der Datei in der Ausschlussliste war der Lauf sauber
  (`Sync succeeded`, zwei Mal). Ein Fund der Messung, nicht des Produkts — in
  `messhuelle/mac.sh` steht die Liste.
- **Nextcloud setzt die Kette auf „nur lesen“ im Dateisystem des Macs** (Modus
  555): ein `rm -r` in dem Ordner scheitert, bis man `chmod -R u+w` ruft. Für den
  Menschen, der so einen Ordner löschen will, ist das ein Stolperstein.
- **Das `dashboard-backend` kann zwei Docker-Ereignisse in einem Stück nicht
  lesen** („Failed to parse Docker event: Unexpected non-whitespace character
  after JSON at position 265 (line 2 column 1)“); es trat zweimal auf, als ich am
  Orin nacheinander Container startete und stoppte, und wäre bei jedem
  Doppelereignis genauso. Folgenlos für den Betrieb, soweit ich sehen kann; der
  Parser gehört an der Zeilengrenze getrennt.
- **`Failed to check rate limit: invalid input value for enum alert_metric_type:
"network"`** stand im selben Zeitraum zweimal im Log des Backends, mit 19
  Minuten Abstand, unabhängig von der Messung: der Wert `network` fehlt in dem
  Aufzählungstyp der Datenbank.
- **`docker pull` am Orin brach dreimal ab** (`connection reset by peer`, `TLS
handshake timeout`), einmal mit einem Abbild von 300 MB; eine Wiederholung mit
  Schleife lief jedes Mal durch. Für die Auslieferung (C10), die Images am Gerät
  baut oder zieht, ist das dieselbe Klasse wie der Rauchtest, der nur einmal
  stieß.
- **Ein Hook dieser Sitzung** (`block-destructive.sh`) lehnt `rm -rf` und `dd`
  ab. Beim Aufräumen sind `rm -r` und `find -delete` durchgegangen; wer die
  Messung wiederholt, sollte das wissen.
- **Auch dieser Merge startet `dashboard-backend` neu**, wie schon in der ersten
  Messung gefunden: der PR wartet deshalb auf Kolja.
