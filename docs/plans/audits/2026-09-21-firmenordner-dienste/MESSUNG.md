# Firmenordner: drei Dateidienste am Orin gemessen (J33)

Gemessen am 21.09.2026 zwischen 11:36 und 12:40 am Orin (`aarch64`, 62,8 GB
RAM, 1,8 TB NVMe), **neben** dem laufenden Produkt und nie darin. Auftrag
`firmenordner-dienst-messen`, erste Karte zu J33; die Herleitung steht in
Experiment 010 des Steuer-Repos.

**Die Annahme** war: ein fertiger Dateidienst läuft auf ARM64 im RAM-Rest des
Orin neben Ollama und Belege und kann stillen Abgleich, Rechte je Ordner auf
zwei Ebenen und eine Übersicht, wer was geändert hat — sonst wird es Eigenbau.

**Das Ergebnis in einem Satz:** RAM, Platte und ARM64 sind bei keinem der drei
die Frage (der teuerste nahm 1,2 GB von 31 GB freien), aber **keiner erfüllt
alle drei Anforderungen so, wie er aus der Schachtel kommt** — jeder lässt genau
eine liegen, und es ist bei jedem eine andere.

## Kurzfassung

|                                                     | Nextcloud 35                                   | OpenCloud 8.0.1 (rolling)                          | Seafile 13 CE                                      |
| --------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| ARM64-Abbild                                        | ja                                             | ja                                                 | ja                                                 |
| Container                                           | 2 (Dienst, PostgreSQL)                         | **1**, keine Datenbank                             | 3 (Dienst, MariaDB, Redis)                         |
| Abbilder auf der Platte                             | 2,12 GB (+ postgres 411 MB, liegt schon da)    | **300 MB**                                         | 2,39 GB + 449 MB + 59 MB                           |
| RAM im Leerlauf                                     | **234 MiB**                                    | 208–259 MiB                                        | 510 MiB                                            |
| RAM-Spitze beim Abgleich                            | **458 MiB**                                    | 1.107 MiB                                          | 1.179 MiB                                          |
| RAM nach dem Abgleich                               | 426 MiB                                        | 1.000 MiB                                          | 1.065–1.259 MiB                                    |
| CPU-Spitze (12 Kerne = 1.200 %)                     | 534 %                                          | **1.018 %**                                        | 185 %                                              |
| Platte leer → mit 172 MB Nutzdaten                  | 971 → 1.305 MB                                 | **2 → 215 MB**                                     | 232 → 423 MB                                       |
| 2.000 Dateien hoch                                  | 255 s                                          | 59 s                                               | **4 s**                                            |
| 2.000 Dateien herunter                              | 65 s                                           | **34 s**                                           | 121 s                                              |
| Abgleich ohne Änderung                              | 9,6 s                                          | 5,6 s                                              | entfällt, der Klient ist ein Dienst                |
| Rechte auf zwei Ebenen über eine API                | **ja, auch einschränkend**                     | ja, **nur erweiternd**                             | ja, **nur erweiternd** (einschränken ist Pro: 403) |
| Änderungsprotokoll je Nutzer über eine API          | **nein** — jeder liest nur seine eigenen Taten | **ja** — 2.241 Einträge mit Nutzer, Zeit, Datei    | teils — mit Nutzer, aber Massenabgleich gekappt    |
| Zwei Rechner schreiben gleichzeitig                 | Konfliktkopie, nur lokal                       | **eine Fassung verschwindet still** (Server-Version bleibt) | **Konfliktkopie mit Namen, bei allen**    |
| Ausschluss `.git`, `node_modules`                   | ja, über `.sync-exclude.lst` im Ordner         | ja, über `--exclude` am Rechner                    | ja, über `seafile-ignore.txt` im Ordner            |
| `.claude/` kommt mit                                | nur mit `-h` (versteckte Dateien)              | nur mit `--sync-hidden-files`                      | ja, ohne Zutun                                     |
| Lizenz des Dienstes                                 | AGPL-3.0                                       | **Apache-2.0**                                     | AGPL-3.0 (Pro: proprietär, bis 3 Nutzer frei)      |

## Das Gerät: was frei ist

Der Rest hängt daran, ob Ollama gerade ein Modell hält — deshalb zwei Zahlen.

| Zeitpunkt                                   | belegt  | verfügbar (`available`) | Platte frei    |
| ------------------------------------------- | ------- | ----------------------- | -------------- |
| 11:30, Standardmodell geladen               | 30,4 GB | **31,4 GB**             | 1,3 TB (28 % belegt) |
| 11:36, vor der ersten Messung (Modell entladen) | 11,8 GB | 50,0 GB             | 1,3 TB, 474 GB belegt |
| 12:40, nach der letzten Messung             | 11,9 GB | 50,0 GB                 | 1,3 TB, 475 GB belegt |

Die enge Zahl ist die erste: **31 GB frei, wenn das 27B-Modell im Speicher
liegt**. Der größte Kandidat brauchte davon 1,2 GB, also unter vier Prozent.
Swap blieb über die ganze Messung bei 285 MB. Das eine Gigabyte Platte
Unterschied ist der Bau-Zwischenspeicher der zwei Klienten-Abbilder; er ist
nicht geräumt, weil `docker builder prune` den Zwischenspeicher des Produkts
mitnähme (siehe „Unterwegs gefunden").

Die vollen Ausgaben von `free`, `df` und `docker ps` vor und nach der Messung:
[`rohdaten/lage-vorher.md`](rohdaten/lage-vorher.md),
[`rohdaten/lage-nachher.md`](rohdaten/lage-nachher.md). Dieselben fünfzehn
Container, alle `healthy`, keiner neu gestartet.

## Wie gemessen wurde

**Die Schutzregel** (Kolja, 21.09.2026) und wie sie gehalten wurde:

- Alles, was die Messung anlegte, hieß `j33mess-*`: Compose-Projekte, Container,
  Volumes, Netze, die zwei Klienten-Abbilder. Eigene Ports nur auf
  `127.0.0.1` (18081, 18082, 18083). Jeder Container mit `mem_limit`
  (Dienst 2 GB, Datenbank 1 GB, Redis 256 MB, Klient 1 GB), `restart: "no"`.
- Keine Datei, kein Volume, kein Netz und kein Dienst des Produkts wurde
  angefasst; kein Neustart, kein Deploy.
- **Ein Wächter** (`wacht` in [`messhuelle/lib.sh`](messhuelle/lib.sh)) hielt vor
  der ersten Messung Startzeit, Neustartzähler, Zustand und Gesundheit jedes
  Containers fest, der **nicht** `j33mess-*` heißt, und verglich nach jedem
  Schritt. Eine Abweichung hätte die Messung mit Rückgabewert 99 beendet. Er
  schlug **nie** an. Was er nicht liest: die Logs der Produktdienste — ein
  Fehler, der weder Gesundheit noch Neustart berührt, wäre ihm entgangen.
- Die Kandidaten liefen **nacheinander**, nie zwei zugleich. Nach jedem:
  `down -v`, Abbild weg. Am Ende gegen die vorher notierte Liste verglichen:
  kein Container, kein Volume, kein Netz, kein Abbild übrig; der Ordner
  `~/j33mess` am Gerät ist gelöscht.

**Der Testordner** ([`messhuelle/testordner.py`](messhuelle/testordner.py),
festes Saatkorn): 2.000 Dateien, 171,6 MB, 200 Ordner in drei Ebenen unter
`Projekte/` und `Prozesse/` — 1.700 kleine (2–16 KB), 250 mittlere
(64–256 KB), 50 große (1–4 MB), nach dem Bestand aus Experiment 010 (UNIT IX:
1.951 Dateien, fast nur Text). Dazu, **nicht mitgezählt**: `.git/` (51 Dateien)
und `node_modules/` (300 Dateien), die draußen bleiben sollen, und `.claude/`
(2 Dateien), das mit **muss**, obwohl es mit einem Punkt anfängt — ohne diesen
Ordner wäre eine Firmenwurzel nach dem Arasul-Muster keine.

**Die zwei Rechner** sind zwei Container am selben Gerät mit den
Kommandozeilen-Klienten aus Debian (`nextcloudcmd` 3.7.3, `owncloudcmd` 5.3.2,
`seaf-cli` 8.0.10). Das hat zwei Folgen, die man beim Lesen der Zeiten wissen
muss: es liegt **kein Netz** dazwischen (die Zeiten messen Dienst und Klient,
nicht das WLAN eines Büros), und es sind **nicht die Klienten, die ein Mensch
am Mac benutzt**. Besonders `nextcloudcmd` 3.7.3 ist alt und lädt Datei für
Datei; die 255 s sind eine Aussage über diesen Klienten, nicht über Nextcloud.

**RAM** kommt aus `docker stats`, alle rund vier Sekunden mitgeschrieben
([`rohdaten/*.ram`](rohdaten/)), die Spitze ist die Summe der Dienst-Container
**ohne** die Klienten. Die CPU-Spitze ist die Summe **mit** Klienten, weil sie
am selben Gerät liefen und dieselben Kerne nahmen. **Platte** ist `du` über die
Volumes.

**Rechte** wurden über die API gesetzt und danach **als der Nutzer**
gegengeprüft (lesen und schreiben, HTTP-Status) — eine API, die 200 sagt und
nichts bewirkt, wäre sonst ein Ja. Drei Nutzer: `admin`, `anna` (darf alles),
`ben` (der Eingeschränkte). Die zwei Ebenen: `Vertraulich/` und `Projekte/`
(Ebene 1), darunter `Projekte/proj-geheim/` und `Projekte/proj-offen/` (Ebene 2).

Die Schritte liegen, wie sie liefen, unter
[`messhuelle/schritte/`](messhuelle/schritte/) — samt der Fehlversuche, die
unten als Befund stehen.

## Nextcloud 35.0.0

`nextcloud:latest` (Apache, PHP) mit `postgres:16-alpine` und der App
`groupfolders` 23.0.1 (Teamordner). Abbild holen und starten 313 s, danach
bereit in 29 s.

**Rechte: ja, und als einziger auch nach unten.** Teamordner anlegen, Gruppe
zuweisen, ACL einschalten geht über OCS (`/apps/groupfolders/folders…`), die
Regel je Ordner über WebDAV (`PROPPATCH` mit `nc:acl-list`). Gegenprobe:

| Nutzer | `Vertraulich/` (E1: ben nichts) | `Projekte/proj-geheim/` (E2: ben nichts) | `Projekte/proj-offen/` (E2: ben nur lesen) |
| ------ | ------------------------------- | ---------------------------------------- | ------------------------------------------ |
| anna   | lesen 200, schreiben 204        | 200, 204                                 | 200, 204                                   |
| ben    | **404, 404**                    | **404, 404**                             | **200, 403**                               |

**Protokoll: nein.** `GET /ocs/v2.php/apps/activity/api/v2/activity/all` nennt
je Eintrag den Nutzer — aber jeder bekommt **nur seine eigenen** Taten: `admin`
sah 23 Einträge, alle von `admin`; `anna` sah 40, alle von `anna`. Annas 2.000
hochgeladene Dateien im gemeinsamen Teamordner sind für den Administrator über
die API **unsichtbar**, einen Filter nach Nutzer gibt es nicht. (Gut daran:
`ben` sah nichts über `Vertraulich` oder `proj-geheim`.) Die App `admin_audit`
schreibt eine Logdatei, keine API — das wäre Eigenbau am Rand.

**Gleichzeitig schreiben:** beide ändern dieselbe Datei, beide gleichen im
selben Augenblick ab. B gewann am Server; A behielt seine Fassung als
`konflikt (conflicted copy 2026-09-21 095829).md` — **nur lokal**, der Klient
lädt sie nicht hoch. Kein Datenverlust, aber B erfährt nie, dass es einen
Konflikt gab.

**Ausschluss:** `nextcloudcmd --exclude <datei>` war **wirkungslos** — `.git`
(51) und `node_modules` (300) kamen beim zweiten Rechner an. Was wirkt, ist
eine `.sync-exclude.lst` in der Wurzel des abgeglichenen Ordners; sie wird
selbst mit abgeglichen und gilt damit für jeden Rechner. Versteckte Dateien
gleicht der Klient nur mit `-h` ab — ohne den Schalter fehlte `.claude/`.

## OpenCloud 8.0.1 (rolling)

Die Abspaltung von ownCloud Infinite Scale (Heinlein-Gruppe, Go): **ein
Prozess, keine Datenbank**, 300 MB. Holen und starten 18 s, bereit in 4 s.
Ohne `https` startet sein Anmeldedienst nicht (`invalid iss value, URL must
start with https://`) — gemessen wurde deshalb mit seinem selbst erzeugten
Zertifikat.

**Rechte: ja, aber nur erweiternd.** Nutzer, Raum und Einladungen gehen über
die Graph-API (`POST /graph/v1beta1/drives/{raum}/items/{ordner}/invite`).
`anna` ist Mitglied des Raums; `ben` bekam `Projekte/` lesend (Ebene 1) und
`Projekte/proj-offen/` schreibend (Ebene 2):

| Nutzer | `Vertraulich/` | `Projekte/proj-geheim/`        | `Projekte/proj-offen/` |
| ------ | -------------- | ------------------------------ | ---------------------- |
| anna   | 200, 204       | 200, 204                       | 200, 204               |
| ben    | 404, 404       | **200**, 403 — erbt das Lesen  | 200, **204**           |

Ein Ordner kann **mehr** dürfen als sein Elternordner, nie **weniger**: die
Rolle „Denied" aus oCIS lehnt die API ab (`Field validation for 'Roles' failed
on the 'available_role' tag`). Wer `proj-geheim` verbergen will, darf `Projekte`
nicht freigeben, sondern nur die einzelnen Ordner darunter. Und `ben` sieht
keinen Baum, sondern **zwei getrennte Einhängepunkte** („Projekte",
„proj-offen").

**Protokoll: ja, vollständig.**
`GET /graph/v1beta1/extensions/org.libregraph/activities?kql=itemid:<raum> AND depth:-1`
lieferte dem Administrator **2.241 Einträge** — `anna` 2.230, `Admin` 10, `ben`
1 —, je Eintrag Nutzer, Zeit, Vorgang und Datei. `ben` bekam auf `Vertraulich`
ein 403. Einen Filter nach Nutzer hat die Abfrage nicht, das Feld ist aber da;
für eine **einzelne Datei** kam eine leere Liste, für ihren Ordner mit `depth`
die richtige.

**Gleichzeitig schreiben: der schwächste Punkt dieser Messung.** Drei
Varianten:

1. Beide ändern in derselben Sekunde, gleichen gleichzeitig ab: am Server steht
   A, **B behält lokal seine eigene Fassung und hält sich für abgeglichen**
   (gleiche Änderungszeit, gleicher ETag im Journal). Zwei Rechner, zwei
   Inhalte, keine Meldung.
2. Änderungen drei Sekunden auseinander, Abgleich gleichzeitig: Bs Fassung wird
   von A **überschrieben, ohne Konfliktkopie**.
3. Nacheinander (A gleicht ab, B hatte den Stand nicht geholt): Konfliktkopie
   bei B, nur lokal — wie bei Nextcloud.

In 1 und 2 liegt Bs Fassung als **Version am Server** und ist damit
wiederherstellbar; nur sagt es niemandem jemand. **Vorbehalt:** gemessen mit
`owncloudcmd` 5.3.2 aus Debian, nicht mit dem OpenCloud-Desktop-Klienten. Der
Klient aus Debian bookworm (2.11) konnte Räume gar nicht ansprechen und stürzte
mit `Error connecting to server` ab.

**Ausschluss:** `--exclude` wirkt (`.git` 0, `node_modules` 0 beim zweiten
Rechner), `.claude/` kam mit `--sync-hidden-files`. Die Liste liegt am Rechner,
nicht im Ordner — jeder Rechner braucht sie für sich.

**Last:** der Dienst nahm beim Abgleich kurz **zehn von zwölf Kernen** und gab
sein Gigabyte RAM danach nicht gleich zurück. Neben Ollama und Belege braucht
er im Produkt eine CPU-Grenze, nicht nur eine RAM-Grenze.

## Seafile 13.0.28 Community

`seafileltd/seafile-mc:13.0-latest` mit `mariadb:10.11` und `redis:7-alpine`
nach der amtlichen `seafile-server.yml`, ohne Caddy und SeaDoc. Holen und
starten 182 s; der erste Start lief fünf Minuten ins Leere, weil die
Einrichtung einen Hostnamen **mit Punkt** verlangt
(`j33mess-seafile-server is not a valid ip or domain`). Danach bereit in 18 s.

**Rechte: ja, aber nur erweiternd.** Einen Unterordner freigeben geht über
`PUT /api2/repos/{id}/dir/shared_items/?p=/Projekte`. Das Einschränken
(`user-folder-perm`) ist der Pro-Ausgabe vorbehalten: **403 „Permission
denied"**. Das Bild ist dasselbe wie bei OpenCloud — `ben` liest
`Projekte/proj-geheim` (200), weil er `Projekte` lesen darf, schreibt in
`proj-offen` (201), kommt an die Bibliothek selbst nicht heran (403) und sieht
zwei getrennte Freigaben statt eines Baums.

**Protokoll: teils.** `GET /api/v2.1/activities/` nennt dem Administrator je
Eintrag den Nutzer (`anna` 69, `admin` 12, `ben` 1) und verzeichnet einzelne
Änderungen genau („anna edit file /Projekte/proj-01/konflikt3.md"). Aber ein
**Massenabgleich wird gekappt**: drei Bibliotheken mit je 2.000 Dateien ergaben
zusammen 82 Einträge, fast nur Ordner. `ben` sah 0 Einträge. Das Datei-Audit
des Administrators ist Pro (403).

**Gleichzeitig schreiben: der beste der drei.** In beiden Varianten
(gleiche Sekunde; B getrennt und später wieder da) legte Seafile
`konflikt.md (SFConflict admin 2026-Sep-21-12-37-36).md` an — **mit dem Namen
dessen, der verlor, am Server und bei beiden Rechnern**. Nichts geht verloren,
und jeder sieht es.

**Ausschluss:** `seafile-ignore.txt` in der Wurzel der Bibliothek. Mit `.git/`
und `node_modules/` allein kamen beide **trotzdem mit** — das Muster gilt dann
nur in der Wurzel. Mit `*/.git/` und `*/node_modules/` blieb beides draußen.
Die Datei reist mit dem Ordner, `.claude/` kam ohne Zutun mit.

**Zeiten:** hochgeladen war in 4,1 s (gemessen, bis der Server 2.003 Dateien
nennt; `seaf-cli status` meldet zu früh „synchronized", der erste Versuch ist
deshalb verworfen), heruntergeladen in 121 s. Der Klient ist ein Dienst, der
von selbst abgleicht — das ist der „stille Abgleich" aus dem Auftrag am
wörtlichsten.

## Was nicht gemessen wurde

- **Die Klienten am Mac und unter Windows.** Das ist die größte Lücke: das
  Konfliktverhalten von OpenCloud und die Hochladezeit von Nextcloud hängen am
  Klienten, und gemessen sind die aus Debian.
- **Syncthing** fiel auf dem Papier: kein Nutzerbegriff, keine Rechte je Ordner,
  kein Protokoll am Server. **Pydio Cells** (ARM64-Abbild vorhanden) blieb
  draußen, weil der Auftrag zwei bis drei nennt.
- Ein Abgleich **über das Netz**, mehr als zwei Rechner, mehr als 2.000 Dateien,
  Dateien über 4 MB.
- Die **Anmeldung über Arasul** (OIDC oder Forward-Auth) und der Weg durch
  Traefik mit der Geräte-CA. OpenCloud verlangt `https` und einen festen
  Aussteller; das ist für die nächste Karte eine Frage, keine Messung von heute.
- **Sicherung und Weg zurück** der Daten des Dienstes (C9).
- Die **Lizenzfrage** — ob ein AGPL-Dienst als eigener Container in einem
  verkauften Gerät für Arasul in Ordnung ist — gehört zu G5 und bleibt bei
  Kolja. OpenCloud ist Apache-2.0 und wirft sie nicht auf.

## Empfehlung

**Die Annahme hält, mit einer Einschränkung — J33 platzt nicht.** Ein fertiger
Dienst läuft auf ARM64 mit weniger als vier Prozent des freien RAM. Was nicht
hält, ist „alle drei Anforderungen aus einer Hand": wer Rechte **einschränkend**
braucht, bekommt kein Protokoll (Nextcloud), und wer das Protokoll will, bekommt
Rechte nur **erweiternd** (OpenCloud, Seafile CE).

**Empfohlen: OpenCloud**, mit zwei Bedingungen, die die nächste Karte zuerst
prüft.

Warum: es ist der einzige, der die **Übersicht, wer was geändert hat**,
vollständig und über eine API liefert — und das ist die Anforderung, die sich
am schlechtesten nachbauen lässt. Es ist ein Container ohne Datenbank und mit
300 MB ein Siebtel der anderen (weniger Betrieb, weniger Sicherung, weniger,
was in fünf Jahren unbeaufsichtigt kaputtgeht), in vier Sekunden da, und
Apache-2.0. Rechte **nur erweiternd** passen zu dem, was am 21.09.2026 ohnehin
entschieden wurde: beliebige Tiefe fällt zuerst, die Wurzel sehen alle,
Vertrauliches liegt nie dort. Das Modell dazu: **Ebene 1 ist ein Raum**
(Mitgliedschaft), **Ebene 2 ist eine Freigabe** eines Ordners darin — wer einen
Ordner nicht sehen soll, ist nicht Mitglied des Raums darüber.

Die zwei Bedingungen:

1. **Das Konfliktverhalten mit dem echten OpenCloud-Desktop-Klienten am Mac
   nachmessen** (die drei Varianten von oben). Bleibt es bei „eine Fassung
   verschwindet still", ist das für einen Ordner, in dem Agenten auf zwei
   Rechnern schreiben, ein Ausschlussgrund — dann **Seafile**, das hier
   fehlerlos war, und das Protokoll wird dort gekappt in Kauf genommen.
2. **Im Produkt mit CPU-Grenze** (`cpus`), nicht nur mit RAM-Grenze: zehn von
   zwölf Kernen für eine halbe Minute sind neben Ollama und der Belege-App zu
   viel.

**Nextcloud nur dann**, wenn sich herausstellt, dass ein Ordner wirklich
**weniger** dürfen muss als sein Elternordner. Dann ist es der einzige, der das
kann — und die Übersicht der Änderungen wird Eigenbau über die Logdatei von
`admin_audit`.

## Unterwegs gefunden, nicht Auftrag

- **Auch ein reiner Doku-Merge startet einen Produktdienst neu.**
  `scripts/deploy/deploy-local.sh` ruft in `fassung_anwenden`
  `up -d --no-build dashboard-backend`, sobald die Fassung wechselt — und die
  wechselt mit jedem Merge, weil sie den SHA trägt. Das widerspricht der
  Schutzregel vom 21.09.2026 („kein Neustart eines Produktdienstes"); der PR zu
  dieser Seite ist deshalb **nicht von selbst gemergt**.
- Der Bau-Zwischenspeicher am Orin steht bei **206 GB, alles davon räumbar**
  (`docker buildx du`). Platz ist genug, aber das wächst mit jedem Deploy.
