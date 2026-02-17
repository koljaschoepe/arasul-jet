# Arasul Platform - Fehlerbehebung

> Haeufige Probleme und deren Loesungen.
> Bei weiteren Fragen wenden Sie sich an den Support.

---

## Inhaltsverzeichnis

1. [System startet nicht](#1-system-startet-nicht)
2. [Web-Oberflaeche nicht erreichbar](#2-web-oberflaeche-nicht-erreichbar)
3. [Login funktioniert nicht](#3-login-funktioniert-nicht)
4. [KI antwortet nicht](#4-ki-antwortet-nicht)
5. [Dokumente werden nicht indexiert](#5-dokumente-werden-nicht-indexiert)
6. [Telegram-Bot reagiert nicht](#6-telegram-bot-reagiert-nicht)
7. [Speicherplatz voll](#7-speicherplatz-voll)
8. [System ist langsam](#8-system-ist-langsam)
9. [Backup/Restore Probleme](#9-backuprestore-probleme)
10. [USB-Update schlaegt fehl](#10-usb-update-schlaegt-fehl)
11. [Support kontaktieren](#11-support-kontaktieren)

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

**Passwort vergessen:**

```bash
# Am Jetson per SSH:
ssh -p 2222 arasul@<jetson-ip>

# Passwort in .env nachschauen:
grep ADMIN_PASSWORD .env

# Oder neues Passwort setzen:
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "UPDATE users SET password_hash = crypt('NeuesPasswort123!', gen_salt('bf')) WHERE username = 'admin';"
```

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

## 5. Dokumente werden nicht indexiert

### Symptom

Hochgeladene Dokumente erscheinen nicht in der RAG-Suche.

### Loesung

**Schritt 1: Embedding-Service pruefen**

```bash
docker compose ps embedding-service
docker compose logs --tail=20 embedding-service
```

**Schritt 2: Document-Indexer pruefen**

```bash
docker compose ps document-indexer
docker compose logs --tail=20 document-indexer
```

**Schritt 3: Qdrant pruefen**

```bash
docker compose ps qdrant
docker compose logs --tail=20 qdrant
```

**Schritt 4: Alle indexieren**

```bash
docker compose restart document-indexer embedding-service
```

---

## 6. Telegram-Bot reagiert nicht

### Symptom

Bot empfaengt oder sendet keine Nachrichten.

### Loesung

**Schritt 1: Bot-Token pruefen**

- Im Dashboard unter "Telegram" den Bot-Token verifizieren
- Auf https://t.me/BotFather pruefen, ob der Bot aktiv ist

**Schritt 2: Webhook pruefen**

- Internetverbindung am Jetson pruefen
- Telegram benoetigt eine erreichbare URL (Cloudflare Tunnel oder ngrok)

**Schritt 3: Service pruefen**

```bash
docker compose ps telegram-bot
docker compose logs --tail=20 telegram-bot
docker compose restart telegram-bot
```

---

## 7. Speicherplatz voll

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

## 8. System ist langsam

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

## 9. Backup/Restore Probleme

### Backup schlaegt fehl

```bash
# Manuell ausfuehren und Fehler sehen:
./scripts/backup.sh

# Log pruefen:
cat data/backups/backup.log
```

### Restore schlaegt fehl

```bash
# Verfuegbare Backups anzeigen:
./scripts/restore.sh --list

# Mit spezifischem Datum wiederherstellen:
./scripts/restore.sh --all --date 20260217
```

### Backup-Verzeichnis pruefen

```bash
ls -la data/backups/
# Unterverzeichnisse: postgres/, minio/, qdrant/, weekly/
```

---

## 10. USB-Update schlaegt fehl

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

## 11. Support kontaktieren

Bei Problemen, die Sie nicht selbst loesen koennen:

### Vor der Kontaktaufnahme

Bitte halten Sie folgende Informationen bereit:

1. **Seriennummer** des Jetson
2. **Fehlerbeschreibung:** Was genau passiert?
3. **Zeitpunkt:** Wann trat das Problem auf?
4. **Support-Logs exportieren:**
   ```bash
   ./scripts/export-support-logs.sh
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
