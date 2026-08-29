# Backup System

Der Sicherungsdienst sichert vier Dinge, und die Frage dahinter ist jedes Mal
dieselbe: **was bekommt der Kunde nach einem Geräteverlust nicht zurück, wenn
es hier fehlt?**

| Teil       | Was                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `postgres` | Nutzer und Rollen, Apps und Stände, Freigaben, Schlüssel je App, Flow-Läufe mit Schritten, Freigabe-Anfragen, Modell-Überschreibungen, das Migrationsbuch — **und jede App-Datenbank** (seit H7) |
| `apps`     | Die **Pakete** der Apps (`/arasul/apps/<id>/<version>/`) — Manifest, fertiges Frontend, Dockerfile mit Kontext                                                                                   |
| `flows`    | Die Flow-Dateien, die ein Mensch am Gerät geschrieben hat (`/arasul/flows`)                                                                                                                      |
| `config`   | `.env`, Zertifikate, Traefik, Geheimnisse — **ohne** den Sicherungsschlüssel selbst                                                                                                              |

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

| Property  | Value                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| Image     | alpine:3.19                                                                              |
| Container | backup-service                                                                           |
| Schedule  | 02:00 UTC daily (configurable)                                                           |
| Retention | 7 days (configurable)                                                                    |
| Storage   | `/data/backups/`                                                                         |
| Zurück    | `services/backup-service/wiederherstellen.sh`, oder `POST /api/backup/wiederherstellung` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BACKUP SERVICE                             │
│                    (Alpine + crond)                             │
└─────────────────────────────────────────────────────────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
   │PostgreSQL│ │  Apps   │  │  Flows  │  │ Config  │
   │ pg_dump │  │ tar.gz  │  │ tar.gz  │  │ tar.gz  │
   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                    /data/backups/                           │
   │   postgres/ │ apps/ │ flows/ │ config/ │ wal-archive/       │
   └─────────────────────────────┬───────────────────────────────┘
                                 │  die neueste je Art
                                 ▼
   ┌─────────────────────────────────────────────────────────────┐
   │   /arasul/extern  — USB oder SMB im Kundennetz, kein Cloud- │
   │   Ziel. Nur wenn dort wirklich etwas eingehängt ist.        │
   └─────────────────────────────────────────────────────────────┘
```

## Backup Components

### 1. PostgreSQL Database

**Method:** `pg_dump` with gzip compression.

```bash
pg_dump -h postgres-db -U arasul -d arasul_db \
  --no-owner --no-acl --clean --if-exists \
  | gzip > /backups/postgres/arasul_db_$(date +%Y%m%d_%H%M%S).sql.gz
```

**Output:**

- File: `/backups/postgres/arasul_db_YYYYMMDD_HHMMSS.sql.gz`
- Latest: `/backups/postgres/arasul_db_latest.sql.gz` (symlink)
- Weekly: `/backups/postgres/weekly/` (Sundays), Monthly:
  `/backups/postgres/monthly/` (1st of month)

**Verification:**

```bash
gzip -t /backups/postgres/arasul_db_latest.sql.gz
```

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
  | gzip > /backups/postgres/apps/${APP_DB}_$(date +%Y%m%d_%H%M%S).sql.gz
```

Ein Fehlschlag hier legt `BACKUP_OK` um — anders als ein fehlender Ordner: eine
Datenbank, die der Cluster gerade genannt hat, muss sich auch abziehen lassen.
Ein Gerät ohne Apps hat null davon und läuft still durch.

Der Weg zurück (`wiederherstellen.sh`) legt Rolle und Datenbank wieder an und
spielt die Abzüge ein. Das **Passwort** setzt er dabei zufällig — ein
Shell-Skript kann das verschlüsselte aus `app_datenbanken` nicht lesen. Das
richtige setzt das Backend beim nächsten Start (`appDatenbank.heileAlle`); die
App im Container trägt noch die alte Adresse, und die soll wieder stimmen.

### 2. Flows

Flow definitions (Plan 011) are Markdown files under `data/flows/` — they are
**not** stored in Postgres. They are user-authored and
reproducible from nowhere else, so a device loss without this archive would
silently take every self-built flow with it. The directory is mounted
read-only into the backup service at `FLOWS_BACKUP_DIR` (default
`/arasul/flows`).

**Method:** tar.gz of the flows directory, verified by reading the archive back

```bash
tar -czf /backups/flows/flows_$(date +%Y%m%d_%H%M%S).tar.gz \
  -C "${FLOWS_BACKUP_DIR:-/arasul/flows}" .
tar -tzf /backups/flows/flows_$(date +%Y%m%d_%H%M%S).tar.gz   # verify
```

**Output:**

- File: `/backups/flows/flows_YYYYMMDD_HHMMSS.tar.gz`
- Latest: `/backups/flows/flows_latest.tar.gz` (symlink)
- Weekly: `/backups/flows/weekly/` (Sundays), Monthly: `/backups/flows/monthly/` (1st of month)

Retention follows the same daily / weekly / monthly rules as PostgreSQL.
If backup encryption is enabled, the archive is encrypted in place after
verification (same `encrypt_file` step as the other components).

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

Quelle: `APPS_BACKUP_DIR` (Vorgabe `/arasul/apps`), Ausgabe
`/backups/apps/apps_YYYYMMDD_HHMMSS.tar.gz`, Bericht `apps_status`.

### 4. Konfiguration

`.env`, Zertifikate, Traefik, Geheimnisse. Ohne sie fährt auf einem leeren Gerät
kein einziger Container hoch.

**Der Sicherungsschlüssel ist nicht im Archiv.**
`config/secrets/backup_encryption_key` wird ausgenommen, und nicht aus Vorsicht,
sondern weil es sonst sinnlos wäre: wer das Archiv öffnen will, braucht den
Schlüssel **vorher**. Er gehört außerhalb des Geräts aufbewahrt — sonst ist jede
Sicherung Papier.

Quelle: `CONFIG_BACKUP_DIR` (Vorgabe `/arasul/konfiguration`, nur lesend
eingehängt), Ausgabe `/backups/config/config_YYYYMMDD_HHMMSS.tar.gz`, Bericht
`config_status`.

### 5. Die Kopie außerhalb des Geräts

Eine Sicherung, die auf derselben Platte liegt wie das Original, überlebt genau
die Fälle nicht, für die es sie gibt: Diebstahl, Feuer, Platte tot. Deshalb ein
Ziel **außerhalb** — ein USB-Datenträger oder eine SMB-Freigabe im Kundennetz,
eingehängt vom Betriebssystem und im Container nur als Ordner sichtbar
(`BACKUP_EXTERN_ZIEL`, Vorgabe `/arasul/extern`).

**Kein Cloud-Ziel.** Nicht aus Bequemlichkeit weggelassen: das Gerät steht beim
Kunden, die Daten bleiben dort, und ein Ziel, das eine Zugangskennung zu einem
fremden Rechenzentrum braucht, wäre genau der Bruch, den die Datenschutzzusage
dieses Produkts nicht macht.

**Erkannt wird an der Gerätenummer des Dateisystems.** Ein Bind-Mount auf einen
Host-Pfad, den niemand eingehängt hat, legt Docker als leeren Ordner an — er ist
da, er nimmt Dateien an, und die Kopie läge auf derselben Platte wie das
Original. `stat -c %d` gegen den Sicherungsordner unterscheidet beides.

**Ein Misslingen färbt nichts rot.** Ein abgezogener Stick ist der Normalfall im
Alltag und darf die nächtliche Sicherung nicht als fehlgeschlagen melden —
sonst steht der Healthcheck auf Rot, während lokal alles vollständig gesichert
ist. Sichtbar bleibt es trotzdem: `extern_status` im Tagesbericht nennt den
Grund (`kein_ziel`, `nicht_eingehaengt`, `nicht_beschreibbar`, `abgeschaltet`,
`fehler`, `kopiert`).

**Das Datum überlebt die Nacht ohne Stick.** Wann zuletzt wirklich eine Kopie
außer Haus entstanden ist, steht in einer eigenen Datei
(`/backups/extern_bericht.json`), die nur bei Erfolg geschrieben wird — der
Tagesbericht wird jede Nacht überschrieben. Über die API liest man beides unter
`GET /api/backup/status` → `ausserhalb`.

### 6. WAL Archive

If WAL segments are being shipped into `/backups/wal` (Postgres
`archive_mode`), `backup.sh` bundles them into a dated tar.gz under
`/backups/wal-archive/` for point-in-time recovery, and prunes both the
archive and the raw segments once they age past the daily retention window.

## Directory Structure

```
/data/backups/
├── postgres/
│   ├── arasul_db_20240124_020015.sql.gz
│   ├── arasul_db_20240125_020012.sql.gz
│   ├── arasul_db_latest.sql.gz → arasul_db_20240125_020012.sql.gz
│   ├── weekly/
│   └── monthly/
├── apps/
│   ├── apps_20240125_020102.tar.gz
│   ├── apps_latest.tar.gz → apps_20240125_020102.tar.gz
│   ├── weekly/
│   └── monthly/
├── flows/
│   ├── flows_20240124_020110.tar.gz
│   ├── flows_20240125_020108.tar.gz
│   ├── flows_latest.tar.gz → flows_20240125_020108.tar.gz
│   ├── weekly/
│   └── monthly/
├── config/
│   ├── config_20240125_020112.tar.gz
│   ├── config_latest.tar.gz → config_20240125_020112.tar.gz
│   ├── weekly/
│   └── monthly/
├── vor_wiederherstellung/          # der Stand VOR einem Zurückspielen
├── wal-archive/
├── backup_report.json              # der letzte Sicherungslauf
├── extern_bericht.json             # die letzte Kopie außerhalb (nur bei Erfolg)
├── restore_drill_report.json       # der letzte Wiederherstellungstest
├── wiederherstellung_bericht.json  # das letzte Zurückspielen
├── wiederherstellung.log
└── backup.log
```

## Configuration

### Environment Variables

| Variable                        | Default                            | Description                                                               |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| BACKUP_SCHEDULE                 | `0 2 * * *`                        | Cron schedule (02:00 UTC daily)                                           |
| BACKUP_RETENTION_DAYS           | 7                                  | Days to keep daily backups                                                |
| BACKUP_WEEKLY_RETENTION_WEEKS   | 12 (52 in the script default)      | Weeks to keep weekly snapshots                                            |
| BACKUP_MONTHLY_RETENTION_MONTHS | 60                                 | Months to keep monthly snapshots                                          |
| BACKUP_ENCRYPT                  | false                              | Encrypt backups with AES-256-CBC (openssl)                                |
| BACKUP_ENCRYPT_KEY_FILE         | /run/secrets/backup_encryption_key | Key file used when BACKUP_ENCRYPT=true                                    |
| POSTGRES_HOST                   | postgres-db                        | PostgreSQL host                                                           |
| POSTGRES_USER                   | arasul                             | PostgreSQL user                                                           |
| POSTGRES_PASSWORD               | (required, via Docker secret)      | PostgreSQL password                                                       |
| POSTGRES_DB                     | arasul_db                          | Database name                                                             |
| FLOWS_BACKUP_DIR                | /arasul/flows                      | Source dir of the flow files (read-only)                                  |
| APPS_BACKUP_DIR                 | /arasul/apps                       | Die Pakete der Apps (schreibbar: der Weg zurück legt sie hier wieder ab)  |
| CONFIG_BACKUP_DIR               | /arasul/konfiguration              | `.env` und `config/`, nur lesend                                          |
| BACKUP_EXTERN_AN                | auto                               | `auto` = kopieren, wenn dort wirklich etwas eingehängt ist; `false` = nie |
| BACKUP_EXTERN_ZIEL              | /arasul/extern                     | Der Ordner IM Container, der außerhalb liegt                              |
| BACKUP_EXTERN_PFAD              | /mnt/arasul-sicherung              | Wo der Host den Datenträger einhängt (Compose-Ebene)                      |
| TZ                              | Europe/Berlin                      | Timezone                                                                  |

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

### Daily Backups

- Kept for `BACKUP_RETENTION_DAYS` (default: 7)
- Oldest backups deleted automatically
- Latest symlinks always point to most recent

### Weekly and Monthly Snapshots

- Postgres and flows each get their own `weekly/` (Sundays) and `monthly/`
  (1st of month) subdirectory
- Kept for `BACKUP_WEEKLY_RETENTION_WEEKS` / `BACKUP_MONTHLY_RETENTION_MONTHS`

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

```bash
# Am Gerät
docker exec backup-service /usr/local/bin/wiederherstellen.sh
docker exec backup-service /usr/local/bin/wiederherstellen.sh --datei arasul_db_20260827_020054.sql.gz
docker exec backup-service /usr/local/bin/wiederherstellen.sh --probe   # nur prüfen

# Über die Schnittstelle (macht zusätzlich die App-Container wieder scharf)
curl -k -X POST https://arasul.local/api/backup/wiederherstellung \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"bestaetigung":"wiederherstellen"}'
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
des jetzigen Standes unter `/backups/vor_wiederherstellung/`.

## Backup Report

After each backup, a report is generated at `/backups/backup_report.json`:

```json
{
  "timestamp": "2026-08-26T02:01:30+02:00",
  "status": "completed",
  "postgres_backups": 7,
  "postgres_weekly": 3,
  "postgres_monthly": 2,
  "apps_status": "true",
  "apps_backups": 7,
  "flows_status": "true",
  "flows_backups": 7,
  "config_status": "true",
  "config_backups": 7,
  "extern_status": "kopiert",
  "extern_dateien": 4,
  "extern_bytes": 5211334,
  "retention_days": 7,
  "weekly_retention_weeks": 52,
  "monthly_retention_months": 60,
  "encrypted": "false",
  "encryption_requested": "false",
  "postgres_size": "48M",
  "wal_size": "0",
  "wal_segments": 0,
  "total_size": "52M"
}
```

`status` is `partial_failure` (not `completed`) if any backed-up component
failed. `apps_status`, `flows_status` und `config_status` sind je `true`,
`false` oder `skipped` (siehe oben).

`extern_status` sagt, was der Kopierversuch nach außen ergeben hat — er färbt
den Gesamtstatus nie rot. **Wann zuletzt wirklich eine Kopie außer Haus
entstanden ist, steht nicht hier**, sondern in `extern_bericht.json`: der
Tagesbericht wird jede Nacht überschrieben, und ein Stick, der eine Nacht
abgezogen war, darf das Datum der letzten echten Kopie nicht löschen.

```json
{
  "zeitpunkt": "2026-08-27T02:03:11+02:00",
  "ziel": "/arasul/extern",
  "ordner": "/arasul/extern/arasul-sicherung/20260827",
  "dateien": 4,
  "bytes": 5211334
}
```

## Monitoring

### Check Backup Status

```bash
# View last backup report
cat /data/backups/backup_report.json | jq .

# Check backup log
tail -100 /data/backups/backup.log

# List recent backups
ls -la /data/backups/postgres/ | tail -5
```

### Verify Backup Integrity

```bash
# Verify PostgreSQL backup
gzip -t /data/backups/postgres/arasul_db_latest.sql.gz && echo "OK"

# Verify flows backup
tar -tzf /data/backups/flows/flows_latest.tar.gz > /dev/null && echo "OK"
```

### Restore Drill

`services/backup-service/restore-drill.sh` restores the latest PostgreSQL dump
into a scratch database and additionally inspects the `apps` and `flows`
archives. Seit Phase C9 prüft er in drei Stufen:

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

# Manual cleanup (older than 7 days)
find /data/backups/postgres -name "*.sql.gz" -mtime +7 -delete
```

### Restore Fails

1. Verify backup file integrity
2. Check target service is stopped
3. Ensure sufficient disk space
4. Check permissions on backup files

## Security Considerations

1. **Verschlüsselung** — `BACKUP_ENCRYPT=true` ist die Vorgabe (AES-256-CBC).
2. **Zugriff** — der Sicherungsordner gehört root; nur der Dienst schreibt hinein.
3. **Kopie außer Haus** — USB oder SMB im Kundennetz. **Kein Cloud-Ziel**: das
   Gerät steht beim Kunden, die Daten bleiben dort.
4. **Der Schlüssel gehört nicht auf das Gerät.** `backup_encryption_key` ist
   ausdrücklich aus dem `config`-Archiv ausgenommen; wer eine Sicherung öffnen
   will, braucht ihn vorher. Ein Wechsel macht jede ältere Sicherung unlesbar.
5. **Proben** — der Wiederherstellungstest läuft wöchentlich von selbst; der
   ganze Drill (löschen und zurückholen) steht in `scripts/test/dr-drill.sh`.
6. **Protokoll** — `sicherung_angestossen` und `wiederherstellung_angestossen`
   stehen im Prüfprotokoll (`audit_logs`).

### Encryption

`BACKUP_ENCRYPT=true` (die Vorgabe) lässt `backup.sh` jedes Archiv **an Ort und
Stelle** verschlüsseln: `openssl enc -aes-256-cbc -pbkdf2` gegen
`BACKUP_ENCRYPT_KEY_FILE`. Der Dateiname ändert sich dabei **nicht** — eine
Sicherung heißt weiter `.sql.gz` und ist keine mehr. Deshalb erkennen
`wiederherstellen.sh` und `restore-drill.sh` an den gzip-Magic-Bytes, nicht an
der Endung, ob sie entschlüsseln müssen. Wer das übersieht, baut einen
Wiederherstellungsweg, der bei eingeschalteter Verschlüsselung dauerhaft
versperrt ist — genau das war `scripts/backup/restore.sh`.

## Related Documentation

- [PostgreSQL Service](../../services/postgres/README.md)
- [Disaster Recovery](DISASTER_RECOVERY.md)
