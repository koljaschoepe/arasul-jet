# Arasul Platform - Fehlerbehebung

> Haeufige Probleme und deren Loesungen.
> Bei weiteren Fragen wenden Sie sich an den Support.

---

## Inhaltsverzeichnis

1. [System startet nicht](#1-system-startet-nicht)
2. [Web-Oberflaeche nicht erreichbar](#2-web-oberflaeche-nicht-erreichbar)
3. [Login funktioniert nicht](#3-login-funktioniert-nicht)
4. [KI antwortet nicht](#4-ki-antwortet-nicht)
5. [Text-Extraktion schlaegt fehl](#5-text-extraktion-schlaegt-fehl)
6. [Speicherplatz voll](#6-speicherplatz-voll)
7. [System ist langsam](#7-system-ist-langsam)
8. [Backup/Restore Probleme](#8-backuprestore-probleme)
9. [USB-Update schlaegt fehl](#9-usb-update-schlaegt-fehl)
10. [Support kontaktieren](#10-support-kontaktieren)

---

## 1. System startet nicht

### Symptom

Nach dem Einschalten startet das Geraet nicht oder die LED blinkt ungewoehnlich.

### Loesung

1. **Netzteil pruefen:** Verwenden Sie das mitgelieferte Original-Netzteil
2. **Strom-Zyklus:** Netzteil 10 Sekunden abziehen, dann wieder anschliessen
3. **Ethernet-Kabel pruefen:** Feste Verbindung zum Router/Switch

### Per SSH pruefen (falls erreichbar)

```bash
ssh -p 2222 arasul@<jetson-ip>

# Dienste pruefen
docker compose ps

# Alle Dienste starten
docker compose up -d

# Logs pruefen
docker compose logs --tail=50
```

---

## 2. Web-Oberflaeche nicht erreichbar

### Symptom

Browser zeigt "Seite nicht erreichbar" oder Timeout.

### Loesung

**Schritt 1: IP-Adresse pruefen**

```bash
# Am Jetson:
ip addr show eth0
```

**Schritt 2: Dienste pruefen**

```bash
# Frontend und Reverse-Proxy pruefen:
docker compose ps reverse-proxy dashboard-frontend

# Neustart wenn noetig:
docker compose restart reverse-proxy dashboard-frontend
```

**Schritt 3: Browser-Cache leeren**

- Strg+Shift+Entf -> Cache leeren
- Oder Inkognito-Fenster verwenden

**Schritt 4: Firewall pruefen**

```bash
sudo ufw status
# Port 80 muss ALLOW sein
```

---

## 3. Login funktioniert nicht

### Symptom

"Falsches Passwort" oder Login-Seite laedt nicht.

### Loesung

**Passwort vergessen oder Account gesperrt:**

```bash
# Am Jetson per SSH:
ssh -p 2222 arasul@<jetson-ip>

# Passwort neu setzen UND Account-Sperre aufheben (interaktiv, offline):
./arasul reset-password admin
```

Das Skript setzt ein neues Passwort, entsperrt den Account
(`login_attempts`/`locked_until`) und invalidiert alle Sessions — danach ist
der Login sofort wieder möglich. Bei „Falsches Passwort" trotz korrektem
Passwort ist meist die Account-Sperre nach mehreren Fehlversuchen die Ursache;
`reset-password` behebt beides.

> Hinweis: Die Tabelle heißt `admin_users` (nicht `users`); manuelle
> `UPDATE`-Snippets auf `users` liefen früher ins Leere.

**Backend nicht erreichbar:**

```bash
docker compose restart dashboard-backend
docker compose logs --tail=20 dashboard-backend
```

---

## 4. KI antwortet nicht

### Symptom

Chat zeigt Ladekreis aber keine Antwort, oder Fehlermeldung.

### Loesung

**Schritt 1: LLM-Service pruefen**

```bash
docker compose ps llm-service

# Logs pruefen:
docker compose logs --tail=20 llm-service

# Neustart:
docker compose restart llm-service
```

**Schritt 2: Modell pruefen**

```bash
# Verfuegbare Modelle anzeigen:
docker exec llm-service ollama list

# Modell neu laden:
docker exec llm-service ollama pull llama3.1:8b
```

**Schritt 3: GPU-Speicher pruefen**

```bash
# Auf dem Jetson:
tegrastats
# RAM und GPU-Auslastung pruefen
```

**Hinweis:** Grosse Modelle benoetigen mehr GPU-Speicher. Versuchen Sie ein kleineres Modell.

---

## 5. Text-Extraktion schlaegt fehl

### Symptom

`POST /api/v1/external/document/extract` (oder `document/analyze`) antwortet mit
503 oder liefert leeren Text.

### Loesung

**Schritt 1: Document-Indexer pruefen**

```bash
docker compose ps document-indexer
docker compose logs --tail=20 document-indexer
curl -s http://localhost:9102/health
```

**Schritt 2: Neu starten**

```bash
docker compose restart document-indexer
```

Bildbasierte PDFs laufen durch Tesseract-OCR (`OCR_LANGS`, Standard `deu+eng`);
eine leere Antwort bei einem Scan heisst meist: Sprache nicht installiert.

---

## 6. Speicherplatz voll

### Symptom

Fehlermeldungen wegen vollem Speicher, Dienste starten nicht.

### Loesung

**Schritt 1: Speicher pruefen**

```bash
df -h
du -sh data/*
```

**Schritt 2: Alte Backups aufraeumen**

```bash
# Backups aelter als 30 Tage loeschen:
find data/backups -name "*.gz" -mtime +30 -delete
```

**Schritt 3: Docker aufraeumen**

```bash
# Ungenutzte Docker-Images entfernen:
docker system prune -f

# Ungenutzte Volumes (VORSICHT!):
docker volume prune -f
```

**Schritt 4: Logs aufraeumen**

```bash
# Alte Logs komprimieren:
find logs/ -name "*.log" -size +100M -exec gzip {} \;
```

---

## 7. System ist langsam

### Symptom

Lange Ladezeiten, verzoegerte Antworten.

### Loesung

**Schritt 1: Ressourcen pruefen**

- Im Dashboard die System-Metriken beobachten
- CPU, RAM, GPU-Auslastung und Temperatur pruefen

**Schritt 2: Temperatur**

```bash
# Jetson-Temperatur pruefen:
cat /sys/devices/virtual/thermal/thermal_zone*/temp
# Werte in Milligrad Celsius (z.B. 45000 = 45°C)
```

Bei Ueberhitzung (>80°C):

- Lueftung pruefen
- Geraet an kuehlerem Ort aufstellen

**Schritt 3: Speicher freigeben**

- Siehe Abschnitt "Speicherplatz voll"
- Nicht benoetigte KI-Modelle entfernen

**Schritt 4: Dienste neustarten**

```bash
docker compose restart
```

---

## 8. Backup/Restore Probleme

### Backup schlaegt fehl

```bash
# Manuell ausfuehren und Fehler sehen:
docker exec backup-service /usr/local/bin/backup.sh

# Log und Bericht pruefen:
cat data/backups/backup.log
cat data/backups/backup_report.json | jq .
```

`status: partial_failure` heisst: mindestens ein Teil ist nicht durchgekommen.
Welcher, sagen `apps_status`, `flows_status` und `config_status` — `skipped`
heisst dabei "der Ordner ist nicht eingehaengt", und auf einem Geraet mit Apps
ist das ein Fehler und keine Nebensache.

### Restore schlaegt fehl

```bash
# Erst pruefen, ob sich die Sicherung ueberhaupt lesen laesst:
docker exec backup-service /usr/local/bin/wiederherstellen.sh --probe

# Zurueckspielen:
docker exec backup-service /usr/local/bin/wiederherstellen.sh

# Was dabei passiert ist:
cat data/backups/wiederherstellung.log
cat data/backups/wiederherstellung_bericht.json | jq .
```

`sicherung_unlesbar` heisst fast immer: die Sicherung ist verschluesselt und
der Schluessel passt nicht. Ein Wechsel von
`config/secrets/backup_encryption_key` macht **jede** aeltere Sicherung
unlesbar; es gibt keinen Weg daran vorbei.

### Backup-Verzeichnis pruefen

```bash
ls -la data/backups/
# postgres/  apps/  flows/  config/  wal-archive/  vor_wiederherstellung/
```

### Keine Kopie ausserhalb des Geraets

```bash
cat data/backups/backup_report.json | jq .extern_status
```

| Wert                 | Was zu tun ist                                                                      |
| -------------------- | ----------------------------------------------------------------------------------- |
| `kein_ziel`          | Kein Datentraeger unter `BACKUP_EXTERN_PFAD` eingehaengt                            |
| `nicht_eingehaengt`  | Der Ordner liegt auf derselben Platte wie das Geraet — das ist kein Ziel ausserhalb |
| `nicht_beschreibbar` | Der Datentraeger ist da, nimmt aber nichts an (abgezogen? schreibgeschuetzt?)       |
| `abgeschaltet`       | `BACKUP_EXTERN_AN=false` — so eingerichtet                                          |
| `kopiert`            | Alles in Ordnung; Datum und Groesse in `extern_bericht.json`                        |

---

## 9. USB-Update schlaegt fehl

### Symptom

Update wird nicht erkannt oder bricht ab.

### Loesung

**Schritt 1: USB-Stick pruefen**

```bash
lsblk
# USB-Geraet sollte als /dev/sda1 o.ae. erscheinen

# Manuell mounten:
sudo mount /dev/sda1 /mnt/usb
ls /mnt/usb/
```

**Schritt 2: Update-Paket pruefen**

- Das Update-Paket muss eine `.tar.gz`-Datei mit gueltigter Signatur sein
- Dateiname: `arasul-update-*.tar.gz`

**Schritt 3: Signatur pruefen**

```bash
# Ist der oeffentliche Schluessel vorhanden?
ls config/update-keys/public_key.pem
```

**Schritt 4: Manuelles Update**

```bash
# Update manuell anwenden:
cp /mnt/usb/arasul-update-*.tar.gz updates/
# Dann ueber die Web-Oberflaeche installieren
```

---

## 10. Support kontaktieren

Bei Problemen, die Sie nicht selbst loesen koennen:

### Vor der Kontaktaufnahme

Bitte halten Sie folgende Informationen bereit:

1. **Seriennummer** des Jetson
2. **Fehlerbeschreibung:** Was genau passiert?
3. **Zeitpunkt:** Wann trat das Problem auf?
4. **Support-Logs exportieren:**
   ```bash
   ./scripts/util/export-support-logs.sh
   # Erzeugt: data/support-logs-<datum>.tar.gz
   ```

### Kontakt

| Kanal   | Adresse               |
| ------- | --------------------- |
| E-Mail  | support@arasul.de     |
| Telefon | +49 (0) XXX XXXXXXX   |
| Zeiten  | Mo-Fr 09:00-17:00 Uhr |

### Fernwartung

In Absprache mit dem Support kann eine Fernwartung eingerichtet werden.
Siehe: [Remote-Wartung Dokumentation](REMOTE_MAINTENANCE.md)
