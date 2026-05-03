# Phase 2.2 — LUKS-Volume-Verschlüsselung für `/data/`

> Daten-Verschlüsselung at-rest auf Host-Ebene. Schützt gegen physischen
> Diebstahl der Box. Bei Reboot wird das Volume automatisch via TPM
> entsperrt — kein manueller Eingriff nötig.

---

## Bedrohungsmodell

Ohne LUKS: Wer die Jetson-Box stiehlt und die SSD ausbaut, kann alle
PostgreSQL-Daten, MinIO-Objekte und Backups direkt lesen. MinIO-SSE
(Phase 2.1) schützt nur die Object-Storage-Schicht, nicht PostgreSQL-Tablespaces
oder Snapshots.

Mit LUKS: Ohne TPM-Chip oder Recovery-Key ist die Disk unleserlich.

---

## Voraussetzungen

- Frisch ausgelieferte Box (LUKS lässt sich nicht nachträglich auf eine
  laufende Disk aufsetzen — Daten werden migriert)
- Root-Zugriff via SSH/Konsole
- 64 GB freier Speicher zur Migration (oder externe Disk)
- TPM-Chip vorhanden (Jetson AGX Orin: ja, integriertes TPM 2.0)

## Setup (Erst-Inbetriebnahme)

```bash
# 1. /data/ als Mount-Point erstellen falls nicht vorhanden
sudo mkdir -p /data

# 2. Volume mit cryptsetup formatieren
# WICHTIG: --key-slot 0 ist für den Master-Key, slot 1 wird via TPM enrolled
sudo cryptsetup luksFormat /dev/nvme0n1p2 \
    --type luks2 \
    --pbkdf argon2id \
    --iter-time 5000 \
    --key-slot 0

# 3. Volume entsperren und mounten
sudo cryptsetup luksOpen /dev/nvme0n1p2 arasul_data
sudo mkfs.ext4 -L arasul-data /dev/mapper/arasul_data
sudo mkdir -p /data
sudo mount /dev/mapper/arasul_data /data

# 4. TPM-Auto-Unlock einrichten (systemd-cryptenroll)
# Slot 1 = TPM2, slot 0 bleibt für manuellen Recovery-Key
sudo systemd-cryptenroll --tpm2-device=auto \
    --tpm2-pcrs=0+7 \
    /dev/nvme0n1p2

# 5. /etc/crypttab Eintrag für Boot-Auto-Unlock
echo 'arasul_data UUID='"$(sudo blkid -s UUID -o value /dev/nvme0n1p2)"' none luks,tpm2-device=auto' | sudo tee -a /etc/crypttab

# 6. /etc/fstab Eintrag
echo '/dev/mapper/arasul_data /data ext4 defaults,noatime 0 2' | sudo tee -a /etc/fstab

# 7. Reboot — Box sollte ohne Passphrase booten
sudo reboot
```

Nach dem Reboot:

```bash
# Verify
sudo cryptsetup status arasul_data
mount | grep /data
# Erwartet: arasul_data is active and is in use, /data ist gemounted
```

---

## Datenmigration auf bestehende Box (downtime ~30 Min)

```bash
# 1. Alle Services stoppen
docker compose down

# 2. Bestehende /data/ auf temporäres Volume kopieren
sudo rsync -aHAXv /data/ /mnt/temp-backup/

# 3. /data/ entleeren und LUKS-formatieren (siehe Setup oben)

# 4. Daten zurückkopieren
sudo rsync -aHAXv /mnt/temp-backup/ /data/

# 5. Services neu starten
docker compose up -d
```

---

## Recovery-Key

Beim `cryptsetup luksFormat` wird ein Recovery-Passphrase generiert. Slot 0
behält diesen Passphrase — bei TPM-Defekt (selten, aber möglich) ist das die
einzige Wiederherstellungsmöglichkeit.

**Recovery-Passphrase muss sicher aufbewahrt werden** — z. B. ausgedruckt im
Tresor des Kunden, NICHT digital auf derselben Box.

---

## Roll-Out im Kundenprozess

1. Bei Auslieferung der Box wird `/data/` ohne LUKS deployed (zeit für QA-Tests)
2. Beim Vor-Ort-Setup beim Kunden: LUKS aktivieren über das Setup-Wizard
   (zukünftiger Schritt — derzeit manuell)
3. Recovery-Passphrase wird ausgedruckt und dem Kunden ausgehändigt
4. Kunde unterschreibt Empfangs-Bestätigung im Compliance-Ordner

---

## Bekannte Einschränkungen (MVP-Stand)

- Setup ist noch nicht im automatischen `arasul setup`-Wizard integriert.
  Manueller Schritt durch Solo-Dev beim Vor-Ort-Termin.
- TPM-PCR-Bindung an PCRs 0+7 (BIOS+Secureboot). Bei Firmware-Update kann
  TPM-Unlock fehlschlagen → Recovery-Passphrase nötig.
- Performance-Overhead: ~5–8% bei NVMe-SSD (akzeptabel).

## Risk if skipped

Bei Box-Diebstahl ohne LUKS: alle Mandanten-/Patientendaten direkt lesbar.
DSGVO-Meldepflicht binnen 72h (Art. 33). Kein Sale an Anwalt/Arzt möglich.
