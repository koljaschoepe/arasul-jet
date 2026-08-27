# Backup Service

Scheduled backup, restore and restore-drill orchestrator for Arasul. Runs out
of an Alpine container, dumps PostgreSQL, archives the app packages, the flow
definitions, the configuration and the WAL segments, and stores the bundle on a
mounted volume — plus one copy on a device **outside** the box (USB or SMB, no
cloud target) when one is mounted.

## Overview

| Property        | Value                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base image      | `alpine:3.19`                                                                                                                                                                              |
| Tools installed | `postgresql16-client`, `docker-cli`, `gzip`, `tar`, `curl`, `bash`, `openssl`                                                                                                              |
| Compose entry   | [`compose/compose.monitoring.yaml`](../../compose/compose.monitoring.yaml) (build) + [`compose/compose.secrets.yaml`](../../compose/compose.secrets.yaml) (postgres-password secret mount) |
| Schedule        | Cron-driven inside the container (see `entrypoint.sh`)                                                                                                                                     |
| Backup target   | Mounted host volume — see `BACKUP_DIR` env var (defaults to `/home/arasul/arasul/arasul-jet/data/backups`)                                                                                 |

## Components

```
backup-service/
├── Dockerfile           Alpine + postgres-client + docker-cli + gzip/tar/openssl
├── entrypoint.sh        Container entry — installs cron jobs, tails the log
├── backup.sh            Die naechtliche Sicherung: postgres, apps, flows, config, WAL,
│                        dazu die Kopie ausserhalb des Geraets
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

Edit `backup.sh` and add one call to `sichere_ordner <name> <quelle> [--exclude=…]`.
Das reicht: Verschluesselung, Gegenlesen, `*_latest`-Zeiger, Wochen- und
Monatskopie und die Aufbewahrung haengen daran. Danach zwei Stellen nachziehen:
den Bericht am Ende von `backup.sh` und `wiederherstellen.sh` (`entpacke_nach`),
sonst wird gesichert, was nie zurueckkommt.
