# Disaster Recovery & Runbooks

> **RTO**: 30 Minuten | **RPO**: 4 Stunden (mit WAL) / 24 Stunden (ohne WAL)

---

## 1. Recovery-Szenarien

### 1.1 Stromausfall

**Symptom**: Alle Container gestoppt, System bootet neu.

**Automatische Recovery**:

1. Systemd startet `arasul-platform.service` automatisch (installiert von `install.sh`)
2. `ordered-startup.sh` startet Services in 4 Phasen
3. PostgreSQL replayed WAL-Logs automatisch
4. Self-Healing-Agent validiert alle Services nach Start

**Manuelle Prüfung** (falls nötig):

```bash
# Status prüfen
docker compose ps

# Falls nicht alle Services laufen:
./scripts/system/ordered-startup.sh --skip-pull

# Datenbank-Integrität prüfen
docker exec postgres-db pg_isready -U arasul
docker exec postgres-db psql -U arasul -d arasul_db -c "SELECT count(*) FROM admin_users;"
```

**Erwartete Recovery-Zeit**: < 5 Minuten (automatisch)

---

### 1.2 Disk-Corruption / Datenbank-Fehler

**Symptom**: PostgreSQL startet nicht, Backend meldet DB-Fehler.

**Recovery mit Backup**:

```bash
# Die Stände anzeigen (seit M5 entsteht jede Nacht einer)
docker exec backup-service staende.sh liste
#   oder über die Schnittstelle: Zeilen mit "art": "stand"
curl -sk -H "authorization: Bearer $TOKEN" \
  https://arasul.local/api/backup/sicherungen | jq '.data[] | select(.art=="stand")'

# Erst prüfen, ob sich der neueste überhaupt lesen lässt — ohne etwas anzufassen
docker exec backup-service /usr/local/bin/wiederherstellen.sh --probe

# Zurückspielen: Datenbank, App-Pakete, Flow-Dateien, Firmenordner
docker exec backup-service /usr/local/bin/wiederherstellen.sh

# Oder ein bestimmter Stand (die ersten acht Zeichen reichen)
docker exec backup-service /usr/local/bin/wiederherstellen.sh --stand 637755c9

# Oder eine Datei aus den Tagesordnern von vor M5
docker exec backup-service /usr/local/bin/wiederherstellen.sh \
  --datei arasul_db_20260827_020054.sql.gz

# Nur ansehen, nicht zurückspielen: einen Stand in einen eigenen Ordner holen
docker exec backup-service staende.sh zurueckholen 637755c9 /backups/pruef-1003
```

**Danach müssen die App-Container neu gebaut werden** — die Images sind bei
einem Plattenschaden mit weg, und das Skript baut sie nicht. Über die
Schnittstelle macht das Backend beides in einem Aufruf:

```bash
curl -k -X POST https://arasul.local/api/backup/wiederherstellung \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"bestaetigung":"wiederherstellen","quelle":"extern","wiederherstellungscode":"ABCD-EFGH-…"}'
```

**Recovery mit WAL (Point-in-Time Recovery)**:

```bash
# 1. PostgreSQL stoppen
docker compose stop postgres-db

# 2. WAL-Archive einspielen
docker exec postgres-db pg_ctl stop -D /var/lib/postgresql/data

# 3. recovery.conf erstellen
docker exec postgres-db bash -c 'cat > /var/lib/postgresql/data/recovery.conf << EOF
restore_command = '\''cp /backups/wal/%f %p'\''
recovery_target_time = '\''2026-03-14 10:00:00'\''
EOF'

# 4. PostgreSQL neu starten
docker compose up -d postgres-db
```

**Erwartete Recovery-Zeit**: 10-30 Minuten

---

### 1.3 Hardware-Ausfall (Jetson defekt)

**Symptom**: Gerät bootet nicht mehr.

**Recovery auf neuem Gerät**:

```bash
# 1. JetPack auf neuem Jetson flashen (NVIDIA SDK Manager)

# 2. Aus dem Auslieferungsartefakt installieren (docs/ops/AUSLIEFERUNG.md):
curl -fsSL https://arasul.de/api/install | bash
#    oder von Hand aus dem Release:
#    tar xzf arasul-<fassung>.tar.gz && cd arasul-<fassung> && ./install.sh

# 3. Die SICHERUNG vom alten Gerät: der Datenträger. SSD an das neue Gerät
#    stecken -- es erkennt sie von selbst (/mnt/arasul-sicherung, J37). Auf ihr
#    liegen die Stände verschlüsselt unter arasul-sicherung/staende-<abdruck>/
#    (seit M5; davor Tagesordner arasul-sicherung/<datum>/), mit MANIFEST.json.
#    Und den WIEDERHERSTELLUNGSCODE des alten Geräts bereithalten (er stand bei
#    der Einrichtung auf dem Bildschirm): er IST der Schlüssel und das Passwort
#    der Stände. Bei der Installation nennen, dann ist das neue Gerät sofort
#    der Fortsetzer der alten Reihe (gleicher Abdruck, gleiches Repo):
#      ./install.sh --wiederherstellungscode ABCD-EFGH-…

# 4. ZUERST die Konfiguration, VOR dem ersten Start.
#    Sie steht im Stand (/arasul/konfiguration) und wird NICHT vom
#    Wiederherstellungsweg eingespielt: einem laufenden Gerät die Zugangsdaten
#    zu tauschen hieße, dass das Passwort im Container nicht mehr zu dem in der
#    Datenbank passt. Auf ein leeres Gerät gehört sie von Hand, und dafür
#    reicht das Image des Sicherungsdienstes allein (kein laufender Stack):
mkdir -p /tmp/konfig-zurueck
docker run --rm --entrypoint staende.sh \
  -v /mnt/arasul-sicherung:/arasul/extern \
  -v "$PWD/config/secrets/backup_encryption_key:/run/secrets/backup_encryption_key:ro" \
  -v /tmp/konfig-zurueck:/zurueck \
  arasul-platform-backup-service \
  zurueckholen latest /zurueck/k --quelle extern --pfad /arasul/konfiguration
cp -a /tmp/konfig-zurueck/k/arasul/konfiguration/.env .
cp -a /tmp/konfig-zurueck/k/arasul/konfiguration/config/. config/
#    (Vor M5: openssl enc -d -aes-256-cbc -pbkdf2 -in config_latest.tar.gz
#     -pass file:config/secrets/backup_encryption_key | tar xz)

#    DER SCHLÜSSEL LIEGT NICHT IM STAND. Er ist ausdrücklich ausgenommen —
#    wer den Stand öffnen will, braucht ihn vorher. Das ist der
#    Wiederherstellungscode; wenn er nicht außerhalb des Geräts aufbewahrt
#    wurde (und `config/secrets/` weg ist), ist an dieser Stelle Schluss.
#    Wo er liegt und warum: docs/ops/BACKUP_SYSTEM.md, Abschnitt 5a.

# 5. Stack hochfahren und den Rest zurückspielen — VOM DATENTRÄGER, in der
#    Oberfläche (M5): Verwaltung → Daten → Sicherung → Zurückholen →
#    „Das ganze Gerät“, Woher: „Datenträger …“, den Stand nach Datum wählen,
#    „Das ganze Gerät zurückholen …“, im Dialog das Wort „wiederherstellen“,
#    das eigene Passwort und (unter „Wiederherstellungscode eingeben“) den Code.
#    Das sichert erst den jetzigen Stand (auf ein frisch installiertes Gerät
#    ist das fast nichts), holt dann Datenbank, Apps, Flows und Firmenordner
#    zurück und baut jede App aus ihrem Paket neu. Dasselbe über die
#    Schnittstelle:
docker compose up -d
curl -k -X POST https://arasul.local/api/backup/wiederherstellung \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"bestaetigung":"wiederherstellen","passwort":"…","quelle":"extern","wiederherstellungscode":"ABCD-EFGH-…"}'
#    Nur am Gerät, ohne Oberfläche (baut die Apps NICHT neu; das tut danach
#    der Aufruf oben oder scripts/test/dr-drill.sh):
#    docker exec -e ARASUL_WIEDERHERSTELLUNGSCODE='ABCD-EFGH-…' backup-service \
#      /usr/local/bin/wiederherstellen.sh --quelle extern

# 6. Nachsehen: die Liste der Apps in der Verwaltung, der Bericht unter
#    „Zurückholen“ nennt je App, ob sie wieder läuft.

# 7. Modelle erneut laden (die Kurzliste, C8)
docker exec llm-service ollama pull qwen3.8:27b-q4_K_M
```

**Erwartete Recovery-Zeit**: 1-2 Stunden (inkl. Model-Download)

---

### 1.3a Werksreset und Gerätetausch: wo der Schlüssel liegt

Die Stände (seit M5) sind mit dem Sicherungsschlüssel des Geräts
verschlüsselt; er ist das Passwort ihres Repos und **ist** der
Wiederherstellungscode. Einen zweiten Schlüssel gibt es nicht. Damit er weder
beim Werksreset noch mit dem Gerät verloren geht, liegt er so:

| Wo                                                                                                                            | Überlebt Werksreset                                                  | Überlebt Gerätetausch |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------- |
| `config/secrets/backup_encryption_key` am Gerät                                                                               | nein (wird gelöscht)                                                 | nein                  |
| im Stand selbst                                                                                                               | — ausdrücklich ausgenommen, sonst wäre er mit dem Stand verschlossen | —                     |
| **Wiederherstellungscode auf Papier / im Passwortspeicher der Firma** (Erstausgabe, `scripts/util/wiederherstellungscode.sh`) | **ja**                                                               | **ja**                |

Und die Stände selbst:

| Wo                                                        | Überlebt Werksreset                  | Überlebt Gerätetausch          |
| --------------------------------------------------------- | ------------------------------------ | ------------------------------ |
| `data/backups/staende-<abdruck>/` am Gerät                | nein (der Werksreset löscht `data/`) | nein                           |
| `arasul-sicherung/staende-<abdruck>/` auf dem Datenträger | ja                                   | ja (an das neue Gerät stecken) |

Der Werksreset (`scripts/setup/factory-reset.sh`) fragt **vor** dem Löschen
nach dem Code und bricht bei einem falschen ab; `ohne` geht nur nach einer
Warnung. Danach, und auf einem neuen Gerät:

```bash
./install.sh --wiederherstellungscode ABCD-EFGH-…
```

schreibt den alten Schlüssel wieder. Derselbe Schlüssel ergibt denselben
Abdruck und damit dasselbe Repo: die nächste Nacht setzt die Reihe der Stände
auf dem Datenträger fort, und jeder ältere Stand bleibt zurückholbar. Wird
**ohne** Code installiert, entsteht ein neuer Schlüssel und daneben ein neues
Repo; das alte bleibt unangetastet und öffnet sich weiter mit dem alten Code
(beim Zurückholen eingeben: Oberfläche oder `ARASUL_WIEDERHERSTELLUNGSCODE`).

### 1.4 GPU-Hang / CUDA-Fehler

**Symptom**: LLM-Service antwortet nicht, nvidia-smi hängt.

**Automatische Recovery** (wenn `SELF_HEALING_REBOOT_ENABLED=true`):

- Self-Healing-Agent erkennt GPU-Hang → Reboot

**Manuelle Recovery**:

```bash
# GPU-Status prüfen
nvidia-smi

# Falls nvidia-smi hängt (GPU-Hang):
# Option A: LLM-Service neustarten
docker compose restart llm-service

# Option B: NVIDIA Kernel-Module neuladen (kein Reboot nötig)
sudo systemctl stop arasul-platform
sudo rmmod nvidia_uvm nvidia_modeset nvidia
sudo modprobe nvidia
sudo systemctl start arasul-platform

# Option C: System-Reboot (letztes Mittel)
sudo reboot
```

---

### 1.5 Disk voll (> 95%)

**Symptom**: Services starten nicht, Schreibfehler in Logs.

**Sofort-Maßnahmen**:

```bash
# Plattenverbrauch analysieren
df -h /
du -sh /opt/arasul/data/* | sort -rh | head -10

# Docker Cleanup (gestoppte Container, ungenutzte Images)
docker system prune -f

# Alte Backups: NIE in data/backups/staende-* von Hand löschen (ein Repo mit
# fehlenden Dateien ist für alle Stände beschädigt). Die Stände räumen sich
# selbst auf. Platz geben die Tagesordner von vor M5 frei, sobald entschieden
# ist, dass sie nicht mehr gebraucht werden:
du -sh /opt/arasul/data/backups/{postgres,apps,flows,firmenordner,config,wal-archive}

# Ungenutzte Modelle löschen
docker exec llm-service ollama list
docker exec llm-service ollama rm <unused-model>

# Docker-Logs bereinigen
truncate -s 0 /var/lib/docker/containers/*/*-json.log

# WAL-Archive bereinigen
find /opt/arasul/data/wal -type f -mtime +3 -delete
```

---

## 2. Runbooks

### 2.1 Service-Restart

```bash
# Einzelnen Service neustarten
docker compose restart <service-name>

# Service mit neuem Image
docker compose up -d --build <service-name>

# Alle Services neustarten (geordnet)
./scripts/system/ordered-startup.sh --skip-pull
```

### 2.2 Datenbank-Wartung

```bash
# VACUUM (Speicher freigeben)
docker exec postgres-db psql -U arasul -d arasul_db -c "VACUUM ANALYZE;"

# VACUUM FULL (komprimiert Tabellen, sperrt sie temporär)
docker exec postgres-db psql -U arasul -d arasul_db -c "VACUUM FULL;"

# Cleanup-Funktionen ausführen
docker exec postgres-db psql -U arasul -d arasul_db -c "SELECT run_all_cleanups();"

# Tabellen-Größen anzeigen
docker exec postgres-db psql -U arasul -d arasul_db -c "
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;"

# WAL-Status prüfen
docker exec postgres-db psql -U arasul -d arasul_db -c "SELECT * FROM pg_stat_archiver;"
```

### 2.3 GPU-Reset

```bash
# Status prüfen
nvidia-smi

# GPU-Prozesse auflisten
nvidia-smi pmon -c 1

# LLM-Service (Hauptnutzer der GPU) neustarten
docker compose restart llm-service embedding-service

# Warten bis Models geladen (5 Min)
sleep 300

# Prüfen ob Services gesund
curl -s http://localhost:11436/api/tags | python3 -m json.tool
curl -s http://localhost:11435/health | python3 -m json.tool
```

### 2.4 Manuelles Backup

```bash
# Manuelles Backup aller Komponenten (ein neuer Stand, nur Geändertes)
docker exec backup-service /usr/local/bin/backup.sh

# Nur Datenbank
docker exec postgres-db pg_dump -U arasul arasul_db | gzip > backup_manual.sql.gz

# Backup-Report anzeigen
docker exec backup-service cat /backups/backup_report.json | python3 -m json.tool

# Stände anzeigen
docker exec backup-service staende.sh liste
```

### 2.5 Netzwerk-Diagnose

```bash
# DNS prüfen
docker exec dashboard-backend nslookup dns.google

# Interne Service-Kommunikation prüfen
docker exec dashboard-backend curl -sf http://llm-service:11436/api/tags
docker exec dashboard-backend curl -sf http://embedding-service:11435/health
docker exec dashboard-backend curl -sf http://metrics-collector:9100/health

# Reverse-Proxy Status
docker exec reverse-proxy traefik healthcheck
```

---

## 3. Wartungsplan

| Intervall     | Aktion                                 | Automatisch? |
| ------------- | -------------------------------------- | ------------ |
| Alle 4h       | DB-Cleanup (`run_all_cleanups()`)      | Ja           |
| Täglich 02:00 | Full Backup (DB + Flows)               | Ja           |
| Alle 10s      | Self-Healing Check                     | Ja           |
| Alle 30s      | Docker-Watchdog                        | Ja (systemd) |
| Alle 30s      | Deadman-Switch für Self-Healing        | Ja (systemd) |
| Wöchentlich   | Sonntags-Backup (12 Wochen aufbewahrt) | Ja           |
| Monatlich     | VACUUM FULL (manuell, bei Bedarf)      | Nein         |
| Quartalsweise | DR-Drill (Restore testen)              | Nein         |

---

## 4. Kontakt & Eskalation

| Stufe | Trigger                         | Aktion                                |
| ----- | ------------------------------- | ------------------------------------- |
| L1    | Service unhealthy               | Automatischer Restart (Self-Healing)  |
| L2    | Mehrfach-Restart fehlgeschlagen | GPU-Reset oder Container-Neubau       |
| L3    | System nicht recoverable        | Restore aus Backup                    |
| L4    | Hardware-Defekt                 | Artefakt auf neuem Gerät installieren |
