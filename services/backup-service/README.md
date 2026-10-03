# Backup Service

Scheduled backup, restore and restore-drill orchestrator for Arasul. Runs out
of an Alpine container, dumps PostgreSQL, and puts the dumps, the app packages,
the flow definitions, the Firmenordner, the configuration and the WAL segments
into one **Stand** per night (restic: encrypted, only changed blocks are
written, kept 7 days / 12 weeks / 60 months) — on the box, and on a device
**outside** the box (USB or SMB, no cloud target) when one is mounted. The
dated tar folders from before M5 stay readable and untouched.

## Overview

| Property        | Value                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base image      | `alpine:3.19`                                                                                                                                                                              |
| Tools installed | `postgresql16-client`, `docker-cli`, `gzip`, `tar`, `curl`, `bash`, `openssl`, `findutils`, `jq`, `restic`, `util-linux-misc` (ionice)                                                     |
| Compose entry   | [`compose/compose.monitoring.yaml`](../../compose/compose.monitoring.yaml) (build) + [`compose/compose.secrets.yaml`](../../compose/compose.secrets.yaml) (postgres-password secret mount) |
| Schedule        | Cron-driven inside the container (see `entrypoint.sh`)                                                                                                                                     |
| Backup target   | Mounted host volume — see `BACKUP_DIR` env var (defaults to `/home/arasul/arasul/arasul-jet/data/backups`)                                                                                 |

## Components

```
backup-service/
├── Dockerfile           Alpine + postgres-client + docker-cli + gzip/tar/openssl
├── entrypoint.sh        Container entry — installs cron jobs, tails the log
├── staende.sh           Die Staende (M5): anlegen, aufbewahren, Platz schaffen,
│                        Klartext pruefen, einzeln zurueckholen. Bibliothek und Befehl
├── backup.sh            Die naechtliche Sicherung: ein Stand mit postgres, apps,
│                        flows, firmenordner, config, WAL -- hier und ausserhalb
├── wiederherstellen.sh  Der Weg zurueck: Datenbank, App-Pakete, Flow-Dateien
└── restore-drill.sh     Der woechentliche Test: die neueste Sicherung in eine
                         Wegwerf-Datenbank und nachzaehlen
```

## Restore path

**Der Weg zurueck laeuft HIER**, seit Phase C9 (27.08.2026), und nicht auf dem
Host. Der Grund ist keine Geschmacksfrage: hier liegen die Archive, der
Sicherungsschluessel als Docker-Secret, `psql` und `openssl`. Die drei
Fassungen, die vorher daneben standen, sind gefallen — zwei liefen nachweislich
nicht (falsche Dateimuster, falsche Containernamen), und die dritte
entschluesselte die Konfiguration, aber nicht den Datenbankabzug.

```bash
docker exec backup-service /usr/local/bin/wiederherstellen.sh --probe
docker exec backup-service /usr/local/bin/wiederherstellen.sh
docker exec backup-service /usr/local/bin/wiederherstellen.sh --datei <name>
```

**Es fehlt danach ein Schritt, und dieser Container kann ihn nicht:** die
App-Container aus den zurueckgeholten Paketen neu bauen. Das macht das Backend
(`services/betrieb/sicherungsdienst.js`), erreichbar ueber
`POST /api/backup/wiederherstellung` — dort sind beide Schritte ein Aufruf.

See [`docs/ops/BACKUP_SYSTEM.md`](../../docs/ops/BACKUP_SYSTEM.md) and [`docs/ops/DISASTER_RECOVERY.md`](../../docs/ops/DISASTER_RECOVERY.md) for the operator-side workflow.

## Adding a new store to back up

Edit `backup.sh` and add the folder to the loop that fills `QUELLEN` (and, if
something inside must stay out, to `STAND_AUSSCHLUESSE`). Das reicht:
Verschluesselung, nur Geaendertes, Aufbewahrung und der Datentraeger haengen
am Stand. Danach zwei Stellen nachziehen: den Bericht am Ende von `backup.sh`
und `wiederherstellen.sh` (`stelle_stand_bereit` und `entpacke_nach`), sonst
wird gesichert, was nie zurueckkommt.

## Staende am Geraet

```bash
docker exec backup-service staende.sh liste [--quelle extern] [--json]
docker exec backup-service staende.sh zurueckholen <stand> /backups/pruef-<stempel> [--pfad /arasul/firmenordner]
docker exec backup-service staende.sh pruefen [--daten 5%]
docker exec backup-service staende.sh klartext /arasul/extern/arasul-sicherung
```

Gemessen: `scripts/test/sicherung-staende.sh` (CI, ohne Geraet) und
`scripts/test/sicherung-staende-abnahme.sh` (am Orin, eigenes Testziel).
