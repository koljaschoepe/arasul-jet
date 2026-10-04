# Backup System

Der Sicherungsdienst sichert fünf Dinge, und die Frage dahinter ist jedes Mal
dieselbe: **was bekommt der Kunde nach einem Geräteverlust nicht zurück, wenn
es hier fehlt?** Seit M5 (03.10.2026) entsteht daraus jede Nacht **ein Stand**,
der nur Geändertes neu schreibt — siehe [Stände](#stände-seit-m5).

| Teil           | Was                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `postgres`     | Nutzer und Rollen, Apps und Stände, Freigaben, Schlüssel je App, Flow-Läufe mit Schritten, Freigabe-Anfragen, Modell-Überschreibungen, das Migrationsbuch — **und jede App-Datenbank** (seit H7) |
| `apps`         | Die **Pakete** der Apps (`/arasul/apps/<id>/<version>/`) — Manifest, fertiges Frontend, Dockerfile mit Kontext                                                                                   |
| `flows`        | Die Flow-Dateien, die ein Mensch am Gerät geschrieben hat (`/arasul/flows`)                                                                                                                      |
| `firmenordner` | Die Dateien der Firma (J33), die Ablage des Dateidienstes samt `.oc-nodes`                                                                                                                       |
| `config`       | `.env`, Zertifikate, Traefik, Geheimnisse — **ohne** den Sicherungsschlüssel selbst                                                                                                              |

App-**Volumes** stehen nicht in dieser Liste, weil es keine gibt: eine App
bekommt weder Bind-Mount noch benanntes Volume
(`services/app/appContainer.js`). Ihren Speicher hat sie seit H7 trotzdem, und
zwar als **Datenbank** — genau ein Ort je App und Stand, damit es auf die Frage
„was wird gesichert" genau eine Antwort gibt. Wer einen zweiten Ort einführt,
ändert diese Seite mit.

App-**Images** werden ebenfalls nicht gesichert. Sie werden aus dem Paket **neu
gebaut** — am Gerät, für das Gerät, dieselbe Entscheidung wie beim Deploy
([APP-PAKET.md](../features/APP-PAKET.md)). Ein Image-Tar wäre ein Dateisystem
für eine Architektur, das niemand mehr liest, bevor es läuft.

## Overview

| Property     | Value                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| Image        | alpine:3.19 mit restic 0.16.4                                                            |
| Container    | backup-service                                                                           |
| Schedule     | 02:00 täglich (`BACKUP_SCHEDULE`), dazu einmal beim Start des Containers                 |
| Aufbewahrung | 7 tägliche, 12 wöchentliche, 60 monatliche Stände                                        |
| Ziel         | `data/backups/staende-<abdruck>/` und, wenn angesteckt, der Datenträger                  |
| Zurück       | `services/backup-service/wiederherstellen.sh`, oder `POST /api/backup/wiederherstellung` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BACKUP SERVICE                             │
│              (Alpine + crond + restic, nice/ionice)             │
└─────────────────────────────────────────────────────────────────┘
   pg_dump (je DB, unkomprimiert)   /arasul/apps  /arasul/flows
   /arasul/firmenordner  /arasul/konfiguration  /backups/wal
        │
        ▼   ein Stand je Nacht: nur Geändertes wird neu geschrieben
   ┌─────────────────────────────────────────────────────────────┐
   │  /data/backups/staende-<abdruck>/      restic, verschlüsselt │
   └─────────────────────────────────────────────────────────────┘
        │   derselbe Stand, eigenes Repo
        ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  /arasul/extern/arasul-sicherung/staende-<abdruck>/         │
   │  SSD/USB oder SMB im Kundennetz, kein Cloud-Ziel. Nur wenn  │
   │  dort wirklich etwas eingehängt ist.                        │
   └─────────────────────────────────────────────────────────────┘
```

## Stände (seit M5)

Bis M5 schrieb jede Nacht je Ziel ein ganzes `tar` in einen Tagesordner,
dazu Kopien für Woche und Monat und ein `tar` des ganzen WAL-Ordners — auch
wenn sich keine Datei bewegt hatte. Am Orin waren das 17,8 GB für 48 Nächte;
der Firmenordner allein schrieb jede Nacht 161 MB neu. Seit M5 entsteht je
Nacht **ein Stand**, und der schreibt nur, was sich seit dem letzten geändert
hat.

**Das Werkzeug ist [restic](https://restic.net)**, weil es als einziges der
drei Kandidaten alle Bedingungen zugleich erfüllt:

| Bedingung                                    | restic                                                              | borg                                                             | Hardlinks (rsync --link-dest)   |
| -------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------- |
| Auf dem Datenträger nur Verschlüsseltes      | immer (AES-256-CTR + Poly1305), kein Schalter für Klartext          | nur, wenn beim Anlegen gewählt (`--encryption none` gibt es)     | nein, Klartext                  |
| Nur Geändertes                               | Blöcke (inhaltsdefiniert), dedupliziert                             | Blöcke, dedupliziert                                             | nur ganze, unveränderte Dateien |
| ARM64 im Container, x86 später nicht verbaut | ein statisches Go-Programm, `apk add restic` für aarch64 und x86_64 | Python mit C-Erweiterungen, gleiche Hauptversion an beiden Enden | ja                              |
| 7 Tage / 12 Wochen / 60 Monate               | `forget --keep-daily/weekly/monthly`                                | `prune --keep-…`                                                 | selbst bauen                    |
| Einen Stand einzeln zurückholen              | `restore <stand> --target …`                                        | `extract`                                                        | Ordner kopieren                 |

**Gemessen am Orin** (03.10.2026, `scripts/test/sicherung-staende-abnahme.sh`,
echte Daten, eigenes Testziel, fünf Läufe der Abnahme; die Zahlen des letzten,
in Klammern die Spanne):

| Lauf                 | gelesen  | neu geschrieben (Gerät) | neu geschrieben (Datenträger) |
| -------------------- | -------- | ----------------------- | ----------------------------- |
| 1 — die erste Nacht  | 667,8 MB | 396,2 MB                | 396,2 MB                      |
| 2 — die zweite Nacht | 667,8 MB | 0,9 MB (0,9–2,1)        | 1,7 MB (1,1–3,9)              |

Zum Vergleich: der Tagesordner von vor M5 schrieb jede Nacht allein für den
Firmenordner 161 MB.

**Leise.** Jeder Aufruf läuft mit `nice -n 19` und `ionice -c 3`. Während des
ersten Laufs lieferte gemma4:e4b 29,84 bis 30,46 statt 30,11 bis 30,50 Token/s
(höchstens −2 %); bei 45 vollen Lesedurchgängen nacheinander waren es −0,9 %,
CPU im Mittel 17,5 % über zwölf Kerne.

**Was in einen Stand geht.** Die Datenbankabzüge (`pg_dump` je Datenbank,
**unkomprimiert** nach `/arasul/datenbank/` im Container, damit restic
unveränderte Blöcke wiedererkennt; ein gzip davor machte aus einer geänderten
Zeile eine ganz neue Datei), `/arasul/apps` ohne `.eingang`, `/arasul/flows`,
`/arasul/firmenordner`, `/arasul/konfiguration` ohne den Sicherungsschlüssel,
`/backups/wal`. Ein fehlender Ordner ist eine Warnung, kein Fehlschlag.

**Aufbewahrung.** Nach jedem Stand `restic forget --group-by '' --keep-daily 7
--keep-weekly 12 --keep-monthly 60`, danach `prune`. `--group-by ''` macht alle
Stände zu **einer** Reihe — sonst begänne eine Nacht, in der ein Ordner fehlte,
eine eigene Reihe mit eigener Aufbewahrung. Mehrere Läufe am Tag (Start,
Nacht, „Jetzt sichern“) behalten je Tag den letzten. In der CI an sechs Jahren
nachgestellter Nächte gegen eine eigene Nachrechnung der Regel geprüft
(`scripts/test/sicherung-staende.sh`), am Orin mit dem restic des Images.

**Ist das Ziel voll, fällt der älteste Stand — mit Hinweis.** Bevor geschrieben
wird: ist weniger frei, als die Quellen zusammen groß sind, rechnet `restic
backup --dry-run` aus, wie viel neu dazukäme (schreibt nichts). Solange
Reserve (`BACKUP_STAND_RESERVE_MB`, 2048) plus diese Menge nicht frei sind,
fällt der älteste Stand. **Nie der letzte.** Warum vorher und nicht erst beim
Schreiben: am Orin gemessen steht ein Lauf, der erst beim Schreiben merkt, dass
es nicht reicht, mit null freien Bytes da, und dann kann restic nicht einmal
mehr aufräumen. Der Hinweis steht im Bericht (`stand_hinweis`), in
`staende.json` (`hinweis`, `entfallen_wegen_platz`) und unter `GET
/api/backup/status` → `staende.hinweis`.

**Je Schlüssel ein Repo:** `staende-<abdruck>`, der Abdruck ist derselbe wie
im Manifest (sha256 über den Schlüssel, 16 Zeichen, verrät ihn nicht). Nach
einer Neuinstallation ohne Wiederherstellungscode hat das Gerät einen neuen
Schlüssel; das alte Repo bleibt dann unangetastet liegen — weder Aufbewahrung
noch Platzschaffen fassen es an — und das neue entsteht daneben.

**Die Tagesordner von vor M5 bleiben, wie sie sind.** `postgres/`, `apps/`,
`flows/`, `firmenordner/`, `config/` (je mit `weekly/` und `monthly/`) und
`wal-archive/` werden seit M5 weder beschrieben noch aufgeräumt. Sie bleiben
lesbar (`wiederherstellen.sh --datei <name>`), bis jemand entscheidet, sie
wegzuräumen; am Orin sind das 17,8 GB. Dasselbe gilt für die Tagesordner auf
einem Datenträger.

**Am Gerät:**

```bash
docker exec backup-service staende.sh liste                     # Staende hier
docker exec backup-service staende.sh liste --quelle extern     # auf dem Datentraeger
docker exec backup-service staende.sh zurueckholen <stand> /backups/pruef-<stempel>
docker exec backup-service staende.sh zurueckholen <stand> /backups/pruef-x --pfad /arasul/firmenordner
docker exec backup-service staende.sh pruefen --daten 5%        # restic check, liest 5 % wirklich
docker exec backup-service staende.sh klartext /arasul/extern/arasul-sicherung
```

`zurueckholen` schreibt **nur in einen neuen oder leeren Ordner** und weist
alles unter `/arasul/` ab — dort hängen die laufenden Daten. Den Weg zurück
**auf** das Gerät geht `wiederherstellen.sh` (unten), mit Abzug des jetzigen
Stands vorher.

## Backup Components

### 1. PostgreSQL Database

**Method:** `pg_dump` unkomprimiert in die Quelle des Stands; gilt nur, wenn
der Abzug mit `PostgreSQL database dump complete` endet.

```bash
pg_dump -h postgres-db -U arasul -d arasul_db \
  --no-owner --no-acl --clean --if-exists > /arasul/datenbank/arasul_db.sql
```

Im Stand: `/arasul/datenbank/arasul_db.sql`. Nach dem Lauf ist der Abzug aus
dem Container wieder weg. (Vor M5: `postgres/arasul_db_<zeit>.sql.gz` mit
`*_latest`-Zeiger, `weekly/`, `monthly/` — diese Dateien bleiben lesbar.)

#### Die Datenbanken der Apps (seit H7)

Jede App mit Backend hat je Stand eine eigene Datenbank im selben Cluster
(`arasul_app_<kennung>_<stand>`, siehe
[APPS.md](../features/APPS.md#die-datenbank-einer-app-phase-h7)). Der Abzug
oben sieht sie **nicht** — `pg_dump` nimmt eine Datenbank, und das ist
`arasul_db`. Was ein Partner in seiner App ablegt, wäre sonst das Einzige, was
ein Geräteverlust wirklich vernichtet.

Gefragt wird der **Cluster** und nicht die Tabelle `app_datenbanken`: eine
Sicherung, die eine Tabelle fragt, sichert nur, was dort steht — und eine
Datenbank, deren Zeile jemand verloren hat, wäre unsichtbar _und_
unwiederbringlich.

```bash
psql -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'arasul\_app\_%'"
# je Treffer:
pg_dump -d "$APP_DB" --no-owner --no-acl --clean --if-exists \
  > /arasul/datenbank/apps/${APP_DB}.sql
```

Ein Fehlschlag hier legt `BACKUP_OK` um — anders als ein fehlender Ordner: eine
Datenbank, die der Cluster gerade genannt hat, muss sich auch abziehen lassen.
Ein Gerät ohne Apps hat null davon und läuft still durch.

Der Weg zurück (`wiederherstellen.sh`) legt Rolle und Datenbank wieder an und
spielt die Abzüge ein. Das **Passwort** setzt er dabei zufällig — ein
Shell-Skript kann das verschlüsselte aus `app_datenbanken` nicht lesen. Das
richtige setzt das Backend beim nächsten Start (`appDatenbank.heileAlle`); die
App im Container trägt noch die alte Adresse, und die soll wieder stimmen.
Eingespielt wird **als Rolle der App** (`SET ROLE` vor dem Abzug): der Abzug
ist mit `--no-owner` gezogen, und spielte ihn `arasul` ein, gehörte danach jede
Tabelle `arasul` und die App bekäme auf ihre eigenen Daten „permission denied“.

**Nur eine App** (J35): `POST /api/backup/wiederherstellung/app/:id` ruft
`wiederherstellen.sh --app-datenbank arasul_app_<id>_<stand>` je gesichertem
Stand. Angefasst wird genau diese Datenbank — vorher abgezogen nach
`vor_wiederherstellung/<name>_vorher_<zeit>.sql.gz`, dann neu angelegt (ein
Abzug mit `--clean` räumt nur weg, was er kennt) und eingespielt. Keine
Plattform-Tabelle, kein Ordner, kein Bericht des ganzen Weges. Das geht auch,
wenn die App gerade entfernt ist; das nächste Einspielen findet die Daten vor.

### 2. Flows

Flow definitions (Plan 011) are Markdown files under `data/flows/` — they are
**not** stored in Postgres. They are user-authored and
reproducible from nowhere else, so a device loss without this archive would
silently take every self-built flow with it. The directory is mounted
read-only into the backup service at `FLOWS_BACKUP_DIR` (default
`/arasul/flows`).

**Method:** der Ordner geht als Baum in den Stand (`/arasul/flows`).

**Missing directory is a warning, not a failure:** older deployments have no
such mount, and failing there would make the healthcheck report a broken backup
on a perfectly healthy box. The report field `flows_status` is `true`,
`false` or `skipped` accordingly.

### 3. Apps

Die **Pakete** der Apps unter `/arasul/apps/<id>/<version>/`: Manifest, fertiges
Frontend, Dockerfile mit seinem Kontext. Bis Phase C9 standen sie in keinem
Archiv, und das war das größte Loch im Sicherungskonzept: die Datenbank kam
vollständig zurück und nannte in `app_staende` Versionen, deren Dateien es nicht
mehr gab.

`.eingang` bleibt draußen — dort liegt, was ein Deploy gerade auspackt oder als
Bruchstück hinterlassen hat, nie etwas, das eine Wiederherstellung braucht.

Quelle: `APPS_BACKUP_DIR` (Vorgabe `/arasul/apps`), im Stand als Baum, Bericht
`apps_status`.

### 4. Konfiguration

`.env`, Zertifikate, Traefik, Geheimnisse. Ohne sie fährt auf einem leeren Gerät
kein einziger Container hoch.

**Der Sicherungsschlüssel ist nicht im Stand.**
`config/secrets/backup_encryption_key` wird ausgenommen, und nicht aus Vorsicht,
sondern weil es sonst sinnlos wäre: wer den Stand öffnen will, braucht den
Schlüssel **vorher**. Er ist der Wiederherstellungscode und gehört außerhalb
des Geräts aufbewahrt (Abschnitt 5a) — sonst ist jede Sicherung Papier.

Quelle: `CONFIG_BACKUP_DIR` (Vorgabe `/arasul/konfiguration`, nur lesend
eingehängt), im Stand als Baum, Bericht `config_status`.

### 4a. Firmenordner

Die Dateien der Firma (J33), nur auf einem Gerät mit dem Profil
`firmenordner`. Quelle: `FIRMENORDNER_BACKUP_DIR` (Vorgabe
`/arasul/firmenordner`, die Ablage des Dateidienstes samt `.oc-nodes`), im
Stand als Baum, Bericht `firmenordner_status`.

**Wer während der Sicherung schreibt, lässt sie nicht scheitern** (J35,
27.09.2026). Im Alltag legt jemand genau dann eine Datei ab, wenn gesichert
wird. Bis J35 ließ das `tar` mit 1 enden, der Bericht stand auf
`partial_failure`, und am 27.09.2026 rollte deshalb ein Deploy zurück. restic
liest jede Datei, wie sie in dem Moment ist; eine, die verschwindet, während es
liest, ergibt Rückgabe 3 („Stand steht, einzelne Dateien nicht gelesen“), und
das ist kein Fehlschlag. Was sich während des Laufs bewegt hat, steht im
Bericht: `firmenordner_geaendert` (Zahl) und `firmenordner_geaendert_dateien`
(höchstens hundert Pfade). Gefragt wird die **ctime** gegen einen Stempel vor
dem ersten Lesen, nicht die mtime — der Abgleichsklient setzt die mtime auf die
seines Rechners.

Jede Datei, die vor dem Lauf da war und nicht angefasst wurde, ist vollständig
im Stand; eine Datei, die erst während des Laufs kam, vielleicht nicht — sie
kommt mit dem nächsten. Gemessen mit `scripts/test/sicherung-staende.sh` (CI,
Guards; 1800 Dateien vorher, 1500 neue während des Laufs).

**Die Sicherungen gehören dem, dem `data/backups` gehört.** Der Dienst läuft
als root; am Ende jedes Laufs gibt `backup.sh` alles unter `/backups` (außer
dem Postgres-Volume `/backups/wal`) dem Eigentümer des Ordners zurück. Bis
dahin gehörte die Sicherung, die der Dienst beim Start zieht — also mitten im
Bootstrap einer Aktualisierung —, root.

### 5. Die Kopie außerhalb des Geräts (J37)

Eine Sicherung, die auf derselben Platte liegt wie das Original, überlebt genau
die Fälle nicht, für die es sie gibt: Diebstahl, Feuer, Platte tot. Deshalb ein
Ziel **außerhalb** — ein USB-Datenträger (SSD oder Stick) am Gerät.

**Kein Handgriff.** Wer eine SSD ansteckt, muss nichts einrichten:

1. `config/udev/99-arasul-sicherung.rules` erkennt jeden **USB**-Datenträger mit
   Dateisystem (die Systemplatte nie) und startet
   `arasul-sicherung@<gerät>.service`.
2. `scripts/system/sicherung-datentraeger.sh einhaengen` hängt ihn unter
   **`/mnt/arasul-sicherung`** ein (`nosuid,nodev,noexec`) und schreibt Name,
   Dateisystem und Kennung nach `/run/arasul-sicherung/zustand.json`.
   Formatiert, partitioniert oder löscht wird **nie**. Ein zweiter Datenträger,
   solange einer drin ist, wird ignoriert. Hat der Desktop ihn schon
   eingehängt (`/media/…`), wird dieser Punkt zusätzlich unter dem Ziel
   sichtbar.
3. Der Sicherungsdienst und das Backend sehen den Ordner unter `/arasul/extern`
   (Compose, `propagation: rslave`): der Datenträger kommt **nach** dem Start
   der Container, und ohne `rslave` blieben sie bei dem leeren Ordner.
4. Wird er abgezogen, hängt `ExecStop` den Punkt aus und löscht `zustand.json`.

Unter **Verwaltung → Daten → Sicherung** steht danach der **Name** des
Datenträgers und sein **freier Platz**; ohne Datenträger steht dort „Kein
Datenträger angesteckt“. Der interne Pfad erscheint nirgends in der Oberfläche.

**Seit M5 ist auch das ein Stand**, kein Tagesordner mit Kopien: dasselbe
Format, dieselbe Aufbewahrung, ein eigenes Repo auf dem Datenträger, und je
Nacht wandert nur, was sich geändert hat, hinüber (am Orin: 3,9 MB in der
zweiten Nacht statt 396 MB).

**Nur Verschlüsseltes liegt auf dem Datenträger.** restic kennt keinen
Klartext. Nach jedem Lauf wird trotzdem jede Datei unter `arasul-sicherung/`
geprüft (`stand_klartext` in `staende.sh`, `extern_klartext`, soll 0 sein):
im Repo gilt als Klartext, was gzip auf unter 90 % bringt oder einen
Dateikopf trägt (gzip, das sich als gzip lesen lässt, tar, zip, PDF); die
Schlüsselhülle von restic (`keys/*`) darf nur ihre Felder haben (Ableitung,
Salz, verschlüsselter Hauptschlüssel); ein Tagesordner von vor M5 muss den
Kopf von `openssl enc` (`Salted__`) tragen. Jede Prüfung ist in der CI mit
einer Gegenprobe belegt, die rot werden muss. Am Orin zusätzlich: ein Satz,
der nur in der Quelle steht, findet sich auf keinem Ziel.

**Aufbau auf dem Datenträger:**

```
arasul-sicherung/
  staende-<abdruck>/       das Repo (restic): config, keys/, data/, index/, snapshots/
  MANIFEST.json            Klartext: Apps, Stände mit Zeit, Abdruck des Schlüssels, Größe
  <JJJJMMTT>/              Tagesordner von vor M5, unangetastet
```

**Passt der Schlüssel noch?** Vor jeder Sicherung prüft der Dienst lokal und
auf dem Datenträger, ob neben dem Repo dieses Schlüssels eines mit einem
anderen Schlüssel liegt, in das zuletzt geschrieben wurde (ohne Repo: wie vor
M5 der Anfang der neuesten Datenbank-Sicherung,
`/backups/schluessel_pruefung.json`). Nach einer
Neuinstallation ohne den alten Code ist das **nicht** der Fall — so fielen am
26.09.2026 sechs Nächte der Belege-App still aus. Jetzt steht es im
Admin-Bereich (Sicherung, ganz oben) und das Backend schickt dem Admin eine
Mitteilung (`notification_events`, `critical`).

**Kein Cloud-Ziel.** Nicht aus Bequemlichkeit weggelassen: das Gerät steht beim
Kunden, die Daten bleiben dort, und ein Ziel, das eine Zugangskennung zu einem
fremden Rechenzentrum braucht, wäre genau der Bruch, den die Datenschutzzusage
dieses Produkts nicht macht. (Eine SMB-Freigabe im Kundennetz, vom
Betriebssystem unter `BACKUP_EXTERN_PFAD` eingehängt, geht weiterhin.)

**Erkannt wird an der Gerätenummer des Dateisystems.** Ein Bind-Mount auf einen
Host-Pfad, den niemand eingehängt hat, legt Docker als leeren Ordner an — er ist
da, er nimmt Dateien an, und die Kopie läge auf derselben Platte wie das
Original. `stat -c %d` gegen den Sicherungsordner unterscheidet beides.

**Ein Misslingen färbt nichts rot.** Ein abgezogener Stick ist der Normalfall im
Alltag und darf die nächtliche Sicherung nicht als fehlgeschlagen melden —
sonst steht der Healthcheck auf Rot, während lokal alles vollständig gesichert
ist. Sichtbar bleibt es trotzdem: `extern_status` im Tagesbericht nennt den
Grund (`kein_ziel`, `nicht_eingehaengt`, `nicht_beschreibbar`,
`zu_wenig_platz`, `nur_verschluesselt`, `abgeschaltet`, `fehler`, `kopiert`).
Einzige Ausnahme: findet die Nachzählung Klartext auf dem Datenträger, ist die
Sicherung `partial_failure`. `zu_wenig_platz` heißt: nicht einmal der neue
Stand allein passt — die älteren sind dann schon gefallen.

**Das Datum überlebt die Nacht ohne Stick.** Wann zuletzt wirklich ein Stand
außer Haus entstanden ist, steht in einer eigenen Datei
(`/backups/extern_bericht.json`), die nur bei Erfolg geschrieben wird — der
Tagesbericht wird jede Nacht überschrieben. Über die API liest man beides unter
`GET /api/backup/status` → `ausserhalb`; was auf dem Datenträger liegt, unter
`GET /api/backup/extern/inhalt`.

### 5a. Der Wiederherstellungscode (J37)

Der Code **ist** der Sicherungsschluessel (`config/secrets/backup_encryption_key`)
in Gruppen zu vier Zeichen: `ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6723`. Kein
zweiter Schluessel, nichts Abgeleitetes. Neue Geraete bekommen 32 Zeichen
Base32 (160 Bit), aeltere haben 64 Hex-Zeichen; beides geht.

- **Bei der Einrichtung** steht er einmal in der Erstausgabe (Bildschirm und
  `config/secrets/erstausgabe.txt`). Aufschreiben, **ausserhalb des Geraets**
  aufbewahren.
- **Nachlesen am Geraet:** `bash scripts/util/wiederherstellungscode.sh`.
- **Neu aufsetzen und alte Sicherungen weiter lesen:**
  `./install.sh --wiederherstellungscode ABCD-EFGH-…` (oder
  `ARASUL_WIEDERHERSTELLUNGSCODE`). Dann wird der alte Schluessel geschrieben
  statt eines neuen.
- **Werksreset:** `scripts/setup/factory-reset.sh` fragt vor dem Loeschen nach
  dem Code; ein falscher bricht ab, `ohne` geht nur nach einer Warnung, dass
  alle Sicherungen danach unlesbar sind.
- **Beim Zurueckholen** (Oberflaeche oder `wiederherstellen.sh`) kann man den
  Code eingeben, wenn der Schluessel dieses Geraets nicht passt. Er geht als
  Umgebungsvariable in den Dienst (nie in die Befehlszeile), liegt nur fuer
  diesen Lauf in einer Datei mit 0600 und wird danach geloescht. Mit Code
  nimmt der Weg das Repo zum Abdruck des Codes (`staende-<abdruck>`), ohne
  Staende die neueste Sicherung auf dem Datentraeger, die sich damit oeffnen
  laesst. Am Orin belegt: vom Datentraeger, nur mit dem Code, ohne
  Schluesseldatei.

**Wo der Schluessel liegt, damit er Werksreset und Geraetetausch ueberlebt**
(M5). Die Staende sind mit genau diesem Schluessel verschluesselt (er ist das
Passwort des Repos), es gibt keinen zweiten. Er liegt an drei Stellen, und nur
eine davon ist auf dem Geraet:

1. `config/secrets/backup_encryption_key` am Geraet — geht beim Werksreset
   und mit dem Geraet verloren, und ist deshalb ausdruecklich NICHT im Stand.
2. **Auf Papier oder im Passwortspeicher der Firma**, als Wiederherstellungscode
   aus der Erstausgabe. Das ist die Stelle, auf die es ankommt.
3. **In der Abfrage des Werksresets**: `factory-reset.sh` verlangt den Code,
   bevor es loescht, und `install.sh --wiederherstellungscode` schreibt ihn
   wieder — dann setzt das neue Geraet die Reihe der Staende im selben Repo
   fort, auf dem Datentraeger wie lokal.

Ohne Code bekommt ein neu aufgesetztes Geraet einen neuen Schluessel und ein
neues Repo daneben; die alten Staende bleiben unangetastet und lassen sich mit
dem Code spaeter noch zurueckholen.

### 6. WAL Archive

If WAL segments are being shipped into `/backups/wal` (Postgres
`archive_mode`), they go into every Stand like any other folder — a segment
that was there last night costs nothing tonight. Segments older than
`BACKUP_RETENTION_DAYS` are deleted from `/backups/wal` after a successful
night. (Before M5 the whole folder was tarred into `/backups/wal-archive/`
every night; that folder stays as it is.)

## Directory Structure

```
/data/backups/
├── staende-<abdruck>/              # die Staende (restic), seit M5
├── staende.json                    # was es an Staenden gibt, fuer das Dashboard
├── .restic-cache/                  # Zwischenspeicher von restic (verschluesselt)
├── vor_wiederherstellung/          # der Stand VOR einem Zurückspielen
├── backup_report.json              # der letzte Sicherungslauf
├── extern_bericht.json             # der letzte Stand außerhalb (nur bei Erfolg)
├── schluessel_pruefung.json        # passt der Schlüssel? (J37)
├── restore_drill_report.json       # der letzte Wiederherstellungstest
├── wiederherstellung_bericht.json  # das letzte Zurückspielen
├── wiederherstellung.log
├── backup.log
│
│   von vor M5, weder beschrieben noch aufgeräumt:
├── postgres/  (arasul_db_*.sql.gz, apps/, weekly/, monthly/)
├── apps/  flows/  firmenordner/  config/  (je *_<zeit>.tar.gz, weekly/, monthly/)
└── wal-archive/
```

## Configuration

### Environment Variables

| Variable                 | Default                            | Description                                                                |
| ------------------------ | ---------------------------------- | -------------------------------------------------------------------------- |
| BACKUP_SCHEDULE          | `0 2 * * *`                        | Cron schedule (02:00 UTC daily)                                            |
| BACKUP_STAND_TAGE        | 7                                  | Tägliche Stände, die bleiben (M5)                                          |
| BACKUP_STAND_WOCHEN      | 12                                 | Wöchentliche Stände (M5)                                                   |
| BACKUP_STAND_MONATE      | 60                                 | Monatliche Stände (M5)                                                     |
| BACKUP_STAND_RESERVE_MB  | 2048                               | So viel bleibt auf dem Ziel frei; darunter fällt der älteste Stand         |
| BACKUP_STAND_CACHE       | /backups/.restic-cache             | Zwischenspeicher von restic, lokal, nie auf dem Datenträger                |
| BACKUP_STAND_DB_QUELLE   | /arasul/datenbank                  | Wohin die Abzüge vor dem Stand gehen (im Container, danach weg)            |
| BACKUP_DRILL_DATENANTEIL | 5%                                 | Wie viel `restic check` beim Wiederherstellungstest wirklich liest         |
| BACKUP_RETENTION_DAYS    | 7 (Compose: 30)                    | Seit M5 nur noch: wie alt WAL-Segmente in `/backups/wal` werden            |
| BACKUP_ENCRYPT           | false                              | Vor M5: Archive mit openssl verschlüsseln. Stände sind immer verschlüsselt |
| BACKUP_ENCRYPT_KEY_FILE  | /run/secrets/backup_encryption_key | Der Sicherungsschlüssel = Passwort der Stände = Wiederherstellungscode     |
| POSTGRES_HOST            | postgres-db                        | PostgreSQL host                                                            |
| POSTGRES_USER            | arasul                             | PostgreSQL user                                                            |
| POSTGRES_PASSWORD        | (required, via Docker secret)      | PostgreSQL password                                                        |
| POSTGRES_DB              | arasul_db                          | Database name                                                              |
| FLOWS_BACKUP_DIR         | /arasul/flows                      | Source dir of the flow files (read-only)                                   |
| APPS_BACKUP_DIR          | /arasul/apps                       | Die Pakete der Apps (schreibbar: der Weg zurück legt sie hier wieder ab)   |
| CONFIG_BACKUP_DIR        | /arasul/konfiguration              | `.env` und `config/`, nur lesend                                           |
| BACKUP_EXTERN_AN         | auto                               | `auto` = kopieren, wenn dort wirklich etwas eingehängt ist; `false` = nie  |
| BACKUP_EXTERN_ZIEL       | /arasul/extern                     | Der Ordner IM Container, der außerhalb liegt                               |
| BACKUP_EXTERN_PFAD       | /mnt/arasul-sicherung              | Wo der Host den Datenträger einhängt (Compose-Ebene)                       |
| TZ                       | Europe/Berlin                      | Timezone                                                                   |

Die Sicherung läuft ausschließlich im `backup-service`-Container über cron
(`/usr/local/bin/backup.sh`, also
[`services/backup-service/backup.sh`](../../services/backup-service/backup.sh)).
Bis Phase C9 lag daneben eine zweite Fassung auf dem Host
(`scripts/backup/backup.sh`) mit eigenen `--type`/`--component`-Flags — sie ist
gefallen: der Zeitplan rief sie nie auf, und was nur sie konnte (die
Konfiguration sichern), kann jetzt die nächtliche.

### Cron Schedule Examples

```bash
# Every day at 02:00 (default)
BACKUP_SCHEDULE="0 2 * * *"

# Every 6 hours
BACKUP_SCHEDULE="0 */6 * * *"

# Every Sunday at 03:00
BACKUP_SCHEDULE="0 3 * * 0"

# Every day at midnight and noon
BACKUP_SCHEDULE="0 0,12 * * *"
```

## Retention Strategy

Seit M5 eine Regel für alle Stände, lokal und auf dem Datenträger:
`--keep-daily 7 --keep-weekly 12 --keep-monthly 60` (Abschnitt
[Stände](#stände-seit-m5)). Je Regel bleibt der jüngste Stand eines Tages,
einer Woche (ISO), eines Monats, bis die Zahl erreicht ist; behalten wird,
was eine der drei Regeln behält. Bei sechs Jahren Nächten sind das 70 bis 79
Stände. Vorher, nur wenn das Ziel voll ist: der älteste Stand fällt, mit
Hinweis.

## Manual Execution

### Production Backup

```bash
# Run the scheduled backup immediately, inside the running container
docker exec backup-service /usr/local/bin/backup.sh
```

### Über die Schnittstelle

```bash
curl -k -X POST https://arasul.local/api/backup/sicherung \
  -H "authorization: Bearer $TOKEN"
```

Antwortet erst, wenn es durch ist — am Jetson sind das Minuten.

## Der Weg zurück

**Ein Weg, nicht drei.** Bis Phase C9 gab es `scripts/backup/restore.sh`,
`scripts/recovery/restore-from-backup.sh` und einen dritten Zweig im
Wiederherstellungstest. Zwei davon liefen nachweislich nicht: die eine suchte
`postgres_*.sql.gz` (die Dateien heißen `postgres/arasul_db_*.sql.gz`) und sprach
Container `arasul-platform-postgres-db-1` an (sie heißen `postgres-db`), die
andere entschlüsselte die Konfiguration, aber **nicht** den Datenbankabzug — und
bei `BACKUP_ENCRYPT=true`, der Vorgabe, ist jeder Abzug verschlüsselt.

**Woher, seit M5:** ohne Angabe der **neueste Stand**, mit `--stand <id>` ein
bestimmter (`staende.sh liste`, die ersten acht Zeichen reichen). Aus dem
Stand holt `wiederherstellen.sh` nur, was der Aufruf braucht, in einen
Bereitstellungsordner unter `/backups` und liest von dort weiter wie bisher.
`--datei` nimmt eine Datei aus den Tagesordnern von vor M5. Gibt es Stände,
aber keinen zu diesem Schlüssel, weicht der Weg **nicht** still auf einen
alten Tagesordner aus, sondern sagt, dass der Schlüssel nicht passt.

```bash
# Am Gerät
docker exec backup-service /usr/local/bin/wiederherstellen.sh               # neuester Stand
docker exec backup-service /usr/local/bin/wiederherstellen.sh --stand 637755c9
docker exec backup-service /usr/local/bin/wiederherstellen.sh --datei arasul_db_20260827_020054.sql.gz
docker exec backup-service /usr/local/bin/wiederherstellen.sh --probe   # nur prüfen

# Über die Schnittstelle (macht zusätzlich die App-Container wieder scharf und
# sichert vorher den jetzigen Stand; verlangt das Passwort, seit M5)
curl -k -X POST https://arasul.local/api/backup/wiederherstellung \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"bestaetigung":"wiederherstellen","passwort":"…","stand":"637755c9"}'
```

**Zwei Schritte, und der zweite ist der, den man vergisst.** Das Skript holt
Datenbank, App-Pakete und Flow-Dateien zurück. Danach muss **jeder App-Stand neu
eingespielt** werden: Image aus dem Paket bauen (auf einem leeren Gerät gibt es
keines mehr), frischer API-Schlüssel, Container starten. Über die API macht das
Backend das selbst; am Gerät stößt `scripts/test/dr-drill.sh` es an. Ohne diesen
Schritt ist die Wiederherstellung eine Datenbank voller Apps, von denen keine
antwortet.

**Der frische Schlüssel ist kein Nebeneffekt, sondern richtig so:** der alte
steckte in der Umgebung eines Containers, den es nicht mehr gibt. Sein
bcrypt-Abdruck kommt mit der Datenbank zurück und passt zu nichts.

**Was der Weg zurück NICHT anfasst: die Konfiguration.** Sie wird gesichert, aber
sie in ein laufendes Gerät zurückzuspielen hieße, ihm unter den Füßen die
Zugangsdaten zu tauschen — danach passt das Passwort im Container nicht mehr zu
dem in der Datenbank. Auf ein leeres Gerät gehört sie **vor** den ersten Start,
von Hand: siehe [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

**Was vorher da war, geht nicht verloren:** vor dem Einspielen entsteht ein Abzug
des jetzigen Standes unter `/backups/vor_wiederherstellung/`. Über die
Schnittstelle (und damit aus der Oberfläche) zusätzlich, und vor allem anderen,
ein ganzer **Stand davor** (siehe unten).

### Zurückholen in der Oberfläche (M5, Auftrag sicherung-zurueckholen)

Verwaltung → Daten → Sicherung → **Zurückholen**. Ein Weg für drei Dinge:

| Was                           | Was zurückkommt                                                                                                             | Was bleibt                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Eine App                      | ihre Datenbanken (Test, Live, soweit im Stand) und ihr Paket; danach wird jeder eingespielte Stand aus dem Paket neu gebaut | alle anderen Apps, Personen, Freigaben, der Firmenordner                                               |
| Ein Bereich des Firmenordners | seine Dateien: Dazugekommenes geht, Fehlendes kommt, Geändertes bekommt den Inhalt von damals                               | jeder andere Bereich, alle Rechte, die Verwaltung des Dateidienstes (`.oc-nodes`, `.oc-tmp`, `.Trash`) |
| Das ganze Gerät               | alles wie oben unter „Der Weg zurück"                                                                                       | die Konfiguration                                                                                      |

**Die fünf neuesten Stände bleiben immer** (`--keep-last`, `BACKUP_STAND_LETZTE`).
Am Orin gefunden (04.10.2026): die Regel 7/12/60 behält je Tag nur den
neuesten Stand. Wer „Jetzt sichern“ drückt, etwas ändert und noch einmal
sichert, verlor sofort den ersten Stand, und mit ihm den Stand vom Neustart
des Dienstes am selben Tag. Nächte (einer je Tag) betrifft das nicht.
`--keep-within 2d` behielt in restic 0.16.4 an einer nachgestellten Reihe jeden
Stand und ist deshalb nicht genommen.

**Der Stand wird nach Zeitpunkt gewählt**, in Worten („Gestern, 2:00 Uhr",
„Freitag, 2. Oktober, 2:00 Uhr"), und angeboten werden nur die Stände, in
denen die App oder der Bereich steht. Woher das Gerät das weiß: `backup.sh`
fragt je neuem Stand einmal `restic ls` nach den Ordnern unter `/arasul/apps`,
`/arasul/datenbank/apps` und `/arasul/firmenordner/posix/projects` (nicht
rekursiv, am Orin 0,5 s) und legt das als `inhalt` in `staende.json` und im
Manifest des Datenträgers ab.

**Bestätigt wird mit dem eigenen Passwort**, beim ganzen Gerät zusätzlich mit
dem Wort „wiederherstellen". Ein falsches Passwort ist ein Satz im Dialog
(`403 PASSWORT_FALSCH`), die Sitzung bleibt.

**Vorher sichert das Gerät den jetzigen Stand.** Das ist ein ganz normaler Lauf
von `backup.sh`, mit `ARASUL_STAND_ANLASS=vorher` und `ARASUL_STAND_FUER=app:<id>`,
`bereich:<kennung>` oder `geraet` — und vor dem Live-Schalten einer App mit
`live:<id>` (M5, 04.10.2026; der Stand heißt dann „vor dem Live-Schalten der
App …", und scheitert die neue Fassung, holt `wiederherstellen.sh
--app-datenbank arasul_app_<id>_live --stand <kennung>` genau ihre
Live-Datenbank daraus zurück, siehe [APPS.md](../features/APPS.md#live-schalten-mit-sicherung-m5-04102026)).
Seit diesem Auftrag gilt zweierlei: ein Stand davor wendet selbst **keine**
Aufbewahrung an (das tut nur der Lauf der Nacht), und die Aufbewahrung zählt
mit `--group-by tags` nur die normalen Stände für 7/12/60 und die fünf
neuesten — ein Stand davor verdrängt keine Nacht. Er bleibt, bis das Ziel voll
ist; wer oft live schaltet, sammelt solche Stände (dedupliziert kosten sie fast
nichts). Der Stand trägt die Tags `vorher` und
`fuer:…`; `stand_aufbewahren` behält ihn mit `--keep-tag vorher` (sonst fiele
von zwei Ständen eines Tages der frühere, und wer zweimal an einem Tag
zurückholt, verlöre den ersten Weg zurück). Er bleibt auf diesem Gerät und geht
nicht auf den Datenträger: dort wäre er sonst der neueste Stand. Er fällt erst,
wenn das Ziel voll ist, als ältester. In der Liste steht er als „Heute, 23:41
Uhr · vor dem Zurückholen der App …", und **wer ihn wählt, macht das
Zurückholen auf demselben Weg rückgängig.** Misslingt er, wird nichts
zurückgeholt. Welcher Stand zurückkommt, wird **vor** dem Stand davor
festgehalten; sonst wäre der neueste danach genau der eben gesicherte.

**Ein Bereich bei laufendem Dateidienst.** `wiederherstellen.sh
--firmenordner-bereich <kennung> --stand <id>` holt nur
`posix/projects/<kennung>` aus dem Stand in einen Bereitstellungsordner und
gleicht ihn mit `rsync -a --inplace --checksum --delete` ab, ohne `.oc-nodes`,
`.oc-tmp` und `/.Trash`. An Ort und Stelle, damit eine geänderte Datei ihre
Knotennummer behält und mit ihr die Kennung im Dienst (erweitertes Attribut);
nach Inhalt, weil der Abgleichsklient die mtime auf die seines Rechners setzt.
Der Dienst beobachtet die Ablage (`STORAGE_USERS_POSIX_WATCH_FS`) und nimmt die
Änderungen auf wie jede Datei, die jemand am Gerät ablegt. Den Bereich muss es
am Gerät geben: in einen weggeworfenen Raum käme nichts zurück, das der Dienst
sähe. Einen einzelnen Bereich gibt es nur aus einem Stand, nicht aus den
Tagesordnern von vor M5.

Gemessen: `scripts/test/sicherung-zurueckholen.sh` (CI, echtes restic und rsync)
und `scripts/test/sicherung-zurueckholen-abnahme.sh` (am Orin, mit eigener
Probe-App und eigenem Probe-Bereich; das ganze Gerät nur in einer
Wegwerf-Umgebung).

## Backup Report

After each backup, a report is generated at `/backups/backup_report.json`:

```json
{
  "timestamp": "2026-10-03T02:01:30+02:00",
  "status": "completed",
  "apps_status": "true",
  "flows_status": "true",
  "firmenordner_status": "true",
  "firmenordner_geaendert": 0,
  "firmenordner_geaendert_dateien": [],
  "config_status": "true",
  "stand_status": "ok",
  "stand_id": "637755c9…",
  "stand_geschrieben_bytes": 2202009,
  "stand_gelesen_bytes": 699924480,
  "stand_klartext": 0,
  "staende_anzahl": 2,
  "staende_bytes": 415236096,
  "staende_entfallen": 0,
  "stand_hinweis": null,
  "extern_status": "kopiert",
  "extern_dateien": 2,
  "extern_bytes": 415662080,
  "extern_geschrieben_bytes": 4089446,
  "extern_stand_id": "ca7147cc…",
  "extern_klartext": 0,
  "extern_frei_bytes": 3800000000,
  "schluessel_passt": true,
  "retention_days": 7,
  "weekly_retention_weeks": 12,
  "monthly_retention_months": 60,
  "encrypted": "true",
  "total_size": "18G"
}
```

`status` is `partial_failure` (not `completed`) if any component failed.
`*_status` sind je `true`, `false` oder `skipped`. `stand_status` ist `ok`,
`fehler` oder `voll`. `stand_geschrieben_bytes` ist, um wie viel das Repo in
dieser Nacht gewachsen ist — die Zahl, um die es bei „nur Geändertes“ geht.
Die Felder `postgres_backups`, `apps_backups` … zählen seit M5 die Stände;
`postgres_weekly`/`postgres_monthly` stehen auf 0.

`extern_status` sagt, was der Versuch nach außen ergeben hat — er färbt den
Gesamtstatus nie rot (außer bei Klartext). **Wann zuletzt wirklich ein Stand
außer Haus entstanden ist, steht nicht hier**, sondern in `extern_bericht.json`:
der Tagesbericht wird jede Nacht überschrieben, und ein Stick, der eine Nacht
abgezogen war, darf das Datum der letzten echten Sicherung nicht löschen.

```json
{
  "zeitpunkt": "2026-10-03T02:03:11+02:00",
  "ziel": "arasul-sicherung/staende-0123456789abcdef",
  "apps": ["belege"],
  "staende": 2,
  "bytes": 415662080,
  "geschrieben": 4089446,
  "stand": "ca7147cc…"
}
```

`staende.json` (für das Dashboard; das Backend hat weder restic noch den
Schlüssel) nennt jeden Stand mit Kennung, Zeit und — für die, die dieser Dienst
seit M5 angelegt hat — was er neu geschrieben hat, dazu die App-Datenbanken
des neuesten Stands, die Aufbewahrung und den Hinweis bei vollem Ziel.

## Monitoring

### Check Backup Status

```bash
# View last backup report
cat /data/backups/backup_report.json | jq .

# Check backup log
tail -100 /data/backups/backup.log

# List the Staende
docker exec backup-service staende.sh liste
```

### Verify Backup Integrity

```bash
# Struktur und Index, dazu 5 % der Daten wirklich gelesen und entschluesselt
docker exec backup-service staende.sh pruefen --daten 5%
```

### Restore Drill

`services/backup-service/restore-drill.sh` restores the latest PostgreSQL dump
into a scratch database and additionally inspects the `apps` and `flows`
archives. Seit M5 ist das der Abzug des **neuesten Stands**; dazu liest
`restic check --read-data-subset 5%` jede Woche ein anderes Zwanzigstel der
Daten im Repo wirklich (Bericht: `stand`, `stand_pruefung`; ein Schaden im Repo
lässt den Test scheitern). Seit Phase C9 prüft er in drei Stufen:

1. **Das Gerät.** Vier Tabellen, die jedes Gerät ab dem ersten Start füllt.
2. **Die Arbeit des Kunden.** `apps`, `app_staende`, `app_members`,
   `app_flows`, `api_keys`, `flow_settings`, `approvals`, `arasul.flow_runs`,
   `arasul.flow_run_steps`, `arasul.schema_migrations` — jede davon nur, wenn
   sie im Abzug überhaupt steht.
3. **Alles andere, ohne Liste.** Jede Tabelle, die im Abzug steht, muss nach dem
   Einspielen da sein. Das ist die Stufe, die nicht veraltet: eine gepflegte
   Liste hängt immer eine Phase hinterher — bis zum 27.08.2026 nannte sie
   `flow_runs` und keine einzige App-Tabelle, obwohl die seit vier Phasen im
   Gerät stehen.

Der Bericht trägt dazu:

| Field          | Meaning                                                                        |
| -------------- | ------------------------------------------------------------------------------ |
| `flows_files`  | Number of `.md` files found in the archive (`0` unless `flows_status` is `ok`) |
| `flows_status` | One of the four states below                                                   |
| `apps_dateien` | Zahl der `app.json` im Archiv, also der eingespielten App-Versionen            |
| `apps_status`  | Dieselben vier Zustände wie `flows_status`                                     |

> **Not the same field as in `backup_report.json`.** Both reports happen to
> carry a key called `flows_status`, but they answer different questions and
> use different vocabularies. In `backup_report.json` it reports whether the
> archive was _written_ (`true` / `false` / `skipped`); here it reports whether
> the archive is _readable_ (`ok` / `encrypted` / `absent` / `corrupt`).

- `ok` — archive present, readable and listed; the count field holds the number.
- `unreadable` — encrypted and the key is missing, or the key does not fit. Das
  ist ein Fehlschlag: eine Sicherung, die niemand lesen kann, ist keine.
- `absent` — kein Archiv unter `/backups/<art>/<art>_latest.tar.gz`. Der Test
  **fällt nicht durch** (frisches Gerät, oder ein Gerät ohne eigene Flows).
- `corrupt` — the archive exists as gzip but cannot be listed. The drill still
  reports `status: ok` and exits `0`, because its primary question is _"can the
  database be restored?"_ — a problem with a handful of text files must not
  raise a false DR alarm or devalue that signal. The problem stays visible in
  two places: the drill log, and the report's `detail` field, which then carries
  `WARNUNG: Flow-Archiv beschaedigt`. Act on it, but do not read it as a
  failed database drill.

## Troubleshooting

### Backup Fails

1. Check container status: `docker compose ps backup-service`
2. View logs: `docker compose logs backup-service`
3. Verify credentials in environment
4. Check disk space: `df -h /data/backups`

### PostgreSQL Backup Fails

```bash
# Test database connection
docker exec postgres-db pg_isready -U arasul

# Check credentials
docker exec backup-service env | grep POSTGRES
```

### Insufficient Disk Space

```bash
# Check usage
du -sh /data/backups/*
```

Die Stände räumen sich selbst auf (Aufbewahrung, und bei vollem Ziel der
älteste Stand). Platz gewinnen lässt sich darüber hinaus nur bei den
Tagesordnern von vor M5 (`postgres/`, `apps/`, `flows/`, `firmenordner/`,
`config/`, `wal-archive/`) — von Hand, wenn entschieden ist, dass sie nicht mehr
gebraucht werden. Nie in `staende-*` von Hand löschen: ein Repo ohne einzelne
Dateien ist für alle Stände beschädigt.

### Restore Fails

1. Verify backup file integrity
2. Check target service is stopped
3. Ensure sufficient disk space
4. Check permissions on backup files

## Security Considerations

1. **Verschlüsselung** — Stände sind immer verschlüsselt (restic, AES-256-CTR
   mit Poly1305); vor M5 `BACKUP_ENCRYPT=true` (AES-256-CBC).
2. **Zugriff** — der Sicherungsordner gehört root; nur der Dienst schreibt hinein.
3. **Kopie außer Haus** — USB oder SMB im Kundennetz. **Kein Cloud-Ziel**: das
   Gerät steht beim Kunden, die Daten bleiben dort.
4. **Der Schlüssel gehört nicht nur auf das Gerät.** `backup_encryption_key` ist
   ausdrücklich aus dem Stand ausgenommen; wer eine Sicherung öffnen will,
   braucht ihn vorher — als Wiederherstellungscode (Abschnitt 5a). Ein neuer
   Schlüssel beginnt ein neues Repo; das alte bleibt mit dem alten Code lesbar.
5. **Proben** — der Wiederherstellungstest läuft wöchentlich von selbst; der
   ganze Drill (löschen und zurückholen) steht in `scripts/test/dr-drill.sh`.
6. **Protokoll** — `sicherung_angestossen` und `wiederherstellung_angestossen`
   stehen im Prüfprotokoll (`audit_logs`).

### Encryption

Seit M5 verschlüsselt restic jeden Stand; der Schlüssel des Geräts ist das
Passwort des Repos (`--password-file`, nie in der Befehlszeile). Für die
Tagesordner von vor M5 gilt weiter: `BACKUP_ENCRYPT=true` ließ `backup.sh` jedes
Archiv **an Ort und Stelle** verschlüsseln: `openssl enc -aes-256-cbc -pbkdf2` gegen
`BACKUP_ENCRYPT_KEY_FILE`. Der Dateiname ändert sich dabei **nicht** — eine
Sicherung heißt weiter `.sql.gz` und ist keine mehr. Deshalb erkennen
`wiederherstellen.sh` und `restore-drill.sh` an den gzip-Magic-Bytes, nicht an
der Endung, ob sie entschlüsseln müssen. Wer das übersieht, baut einen
Wiederherstellungsweg, der bei eingeschalteter Verschlüsselung dauerhaft
versperrt ist — genau das war `scripts/backup/restore.sh`.

## Related Documentation

- [PostgreSQL Service](../../services/postgres/README.md)
- [Disaster Recovery](DISASTER_RECOVERY.md)
