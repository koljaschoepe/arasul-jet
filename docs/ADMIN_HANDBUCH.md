# Arasul Platform - Administrationshandbuch

> Ausfuehrliche Dokumentation aller Funktionen der Arasul Platform.
> Fuer die Ersteinrichtung siehe: [Quick-Start-Guide](QUICK_START.md)

---

## Inhaltsverzeichnis

1. [Systemuebersicht](#1-systemuebersicht)
2. [Dashboard](#2-dashboard)
3. [Chat / KI-Assistent](#3-chat--ki-assistent)
4. [Dokumente & RAG](#4-dokumente--rag)
5. [Datentabellen](#5-datentabellen)
6. [Telegram-Bot](#6-telegram-bot)
7. [Einstellungen](#7-einstellungen)
8. [Services-Verwaltung](#8-services-verwaltung)
9. [Datensicherung](#9-datensicherung)
10. [System-Updates](#10-system-updates)
11. [Benutzerverwaltung](#11-benutzerverwaltung)
12. [Netzwerk & Fernzugriff](#12-netzwerk--fernzugriff)

---

## 1. Systemuebersicht

Die Arasul Platform laeuft auf einem NVIDIA Jetson AGX Orin und bietet:

- **Lokale KI:** Alle Daten bleiben auf dem Geraet - keine Cloud erforderlich
- **Chat-Assistent:** Fragen stellen, Texte analysieren, Aufgaben loesen
- **Dokumenten-Analyse (RAG):** Eigene Dokumente hochladen und intelligent durchsuchen
- **Datentabellen:** Strukturierte Daten verwalten und mit KI verknuepfen
- **Telegram-Integration:** KI-Bot fuer Ihr Team ueber Telegram
- **Automatische Sicherung:** Taegliche Backups aller Daten
- **Offline-faehig:** Funktioniert ohne Internetverbindung

### Zugriff

| Dienst          | Adresse                   |
| --------------- | ------------------------- |
| Web-Oberflaeche | `http://<jetson-ip>`      |
| SSH-Zugang      | `ssh -p 2222 arasul@<ip>` |

---

## 2. Dashboard

Das Dashboard zeigt auf einen Blick:

- **System-Status:** CPU, RAM, GPU, Temperatur, Speicherplatz
- **Service-Status:** Alle Dienste mit Ampel-Anzeige (gruen/gelb/rot)
- **Letzte Aktivitaeten:** Chats, Dokumente, Events
- **Warnungen:** Automatische Hinweise bei Problemen

### Status-Farben

| Farbe | Bedeutung                          |
| ----- | ---------------------------------- |
| Gruen | Alles in Ordnung                   |
| Gelb  | Warnung - System funktioniert noch |
| Rot   | Kritisch - Aktion erforderlich     |

---

## 3. Chat / KI-Assistent

### Chat starten

1. Klicken Sie auf **"Chat"** in der Navigation
2. Ein neuer Chat wird automatisch erstellt
3. Geben Sie Ihre Frage oder Aufgabe ein
4. Die KI antwortet in Echtzeit (Streaming)

### Funktionen

- **Neuer Chat:** Erstellt eine neue Konversation
- **Chat-Tabs:** Mehrere Chats parallel oeffnen
- **Modell-Auswahl:** Verschiedene KI-Modelle fuer verschiedene Aufgaben
- **RAG-Modus:** Aktivieren, um Antworten auf Basis Ihrer Dokumente zu erhalten
- **Chat-Verlauf:** Alle Chats werden gespeichert und sind durchsuchbar

### Tipps

- Formulieren Sie Fragen moeglichst konkret
- Nutzen Sie den RAG-Modus, wenn Sie Fragen zu Ihren eigenen Dokumenten haben
- Groessere Modelle liefern bessere Ergebnisse, sind aber langsamer

---

## 4. Dokumente & RAG

### Dokumente hochladen

1. Navigieren Sie zu **"Dokumente"**
2. Klicken Sie auf **"Hochladen"**
3. Waehlen Sie eine oder mehrere Dateien aus
4. Die Dateien werden automatisch indexiert

### Unterstuetzte Formate

| Format | Beschreibung     |
| ------ | ---------------- |
| PDF    | PDF-Dokumente    |
| TXT    | Textdateien      |
| DOCX   | Word-Dokumente   |
| MD     | Markdown-Dateien |
| CSV    | Tabellen         |

### RAG-Suche (Retrieval Augmented Generation)

RAG ermoeglicht es der KI, Ihre Dokumente als Wissensquelle zu nutzen:

1. Laden Sie relevante Dokumente hoch
2. Aktivieren Sie **RAG** im Chat
3. Stellen Sie Fragen zu Ihren Dokumenten
4. Die KI zitiert die relevanten Stellen

### Spaces (Dokumenten-Raeume)

Organisieren Sie Dokumente in thematischen Raeumen:

- Erstellen Sie Spaces fuer verschiedene Projekte oder Themen
- Weisen Sie Dokumente einem Space zu
- Im Chat koennen Sie gezielt in einem Space suchen

---

## 5. Datentabellen

### Tabelle erstellen

1. Navigieren Sie zu **"Datentabellen"**
2. Klicken Sie auf **"Neue Tabelle"**
3. Definieren Sie Spalten (Name, Typ)
4. Fuellen Sie Daten ein

### Spaltentypen

| Typ     | Beschreibung           |
| ------- | ---------------------- |
| Text    | Freitext               |
| Zahl    | Numerische Werte       |
| Datum   | Datumswerte            |
| Boolean | Ja/Nein                |
| Auswahl | Vordefinierte Optionen |

### KI-Integration

- Tabellen-Daten koennen im Chat referenziert werden
- Die KI kann Daten analysieren und zusammenfassen
- Zitate aus Tabellen werden im Chat angezeigt

---

## 6. Telegram-Bot

### Bot erstellen

1. Navigieren Sie zu **"Telegram"**
2. Klicken Sie auf **"Neuen Bot erstellen"**
3. Folgen Sie dem Assistenten:
   - Bot-Token vom BotFather eingeben
   - Name und Beschreibung festlegen
   - KI-Modell auswaehlen
4. Der Bot ist sofort einsatzbereit

### Bot-Token erhalten

1. Oeffnen Sie Telegram und suchen Sie **@BotFather**
2. Senden Sie `/newbot`
3. Folgen Sie den Anweisungen
4. Kopieren Sie den Token

### Bot-Einstellungen

- **Modell:** Welches KI-Modell der Bot verwendet
- **System-Prompt:** Wie der Bot sich verhalten soll
- **RAG aktivieren:** Bot kann auf Ihre Dokumente zugreifen
- **Berechtigungen:** Wer den Bot nutzen darf

---

## 7. Einstellungen

### Allgemein

- **System-Name:** Name Ihrer Arasul-Installation
- **Sprache:** Standardmaessig Deutsch
- **Theme:** Dunkles Design (Standard)

### KI-Einstellungen

- **Standard-Modell:** Voreingestelltes KI-Modell
- **Temperatur:** Kreativitaet der Antworten (0.0-1.0)
- **Max Tokens:** Maximale Antwortlaenge

### Sicherheit

- **Passwort aendern:** Unter Einstellungen > Sicherheit
- **Session-Dauer:** Automatisches Abmelden nach Inaktivitaet

---

## 8. Services-Verwaltung

### Dienste anzeigen

1. Navigieren Sie zu **"Services"**
2. Alle 15 Dienste werden mit Status angezeigt

### Dienst-Aktionen

| Aktion   | Beschreibung                       |
| -------- | ---------------------------------- |
| Neustart | Dienst stoppen und neu starten     |
| Logs     | Protokolle des Dienstes anzeigen   |
| Details  | Speicherverbrauch, Uptime, Version |

### Automatische Selbstheilung

Das System ueberwacht alle Dienste automatisch:

- Abgestuerzte Dienste werden automatisch neu gestartet
- Bei Ressourcen-Engpaessen werden Massnahmen ergriffen
- Alle Ereignisse werden im Event-Log protokolliert

---

## 9. Datensicherung

### Automatische Backups

Das System erstellt automatisch taegliche Backups um 02:00 Uhr:

- **PostgreSQL-Datenbank:** Alle Einstellungen, Chats, Benutzer
- **Dokumente (MinIO):** Alle hochgeladenen Dateien
- **Vektordaten (Qdrant):** Indexierte Dokumenten-Vektoren

### Manuelles Backup

```bash
ssh -p 2222 arasul@<jetson-ip>
./scripts/backup.sh
```

### Backup wiederherstellen

```bash
# Letztes Backup wiederherstellen:
./scripts/restore.sh --latest --all

# Bestimmtes Datum:
./scripts/restore.sh --all --date 20260217

# Nur Datenbank:
./scripts/restore.sh --postgres --latest
```

### Aufbewahrung

| Typ          | Aufbewahrung |
| ------------ | ------------ |
| Taeglich     | 30 Tage      |
| Woechentlich | 12 Wochen    |

---

## 10. System-Updates

### USB-Update einspielen

1. Stecken Sie den USB-Stick mit dem Update ein
2. Oeffnen Sie **Einstellungen > Updates**
3. Das System erkennt den USB-Stick automatisch
4. Klicken Sie auf **"Update installieren"**
5. Warten Sie, bis das Update abgeschlossen ist
6. Das System startet bei Bedarf automatisch neu

### Update-Verlauf

Unter **Einstellungen > Updates > Verlauf** sehen Sie:

- Installierte Updates mit Datum
- Versionsnummern
- Aenderungsprotokoll

### Hinweise

- Updates werden digital signiert und vor der Installation verifiziert
- Bei Problemen wird automatisch ein Rollback durchgefuehrt
- Erstellen Sie vor dem Update ein manuelles Backup

---

## 11. Benutzerverwaltung

### Passwort aendern

1. Oeffnen Sie **Einstellungen > Sicherheit**
2. Geben Sie das aktuelle Passwort ein
3. Geben Sie das neue Passwort ein (mindestens 12 Zeichen)
4. Bestaetigen Sie das neue Passwort

### Passwort-Anforderungen

- Mindestens 12 Zeichen
- Grossbuchstaben und Kleinbuchstaben
- Mindestens eine Zahl
- Mindestens ein Sonderzeichen

---

## 12. Netzwerk & Fernzugriff

### Lokaler Zugriff

Das System ist ueber das lokale Netzwerk erreichbar:

- **Web:** `http://<jetson-ip>`
- **SSH:** `ssh -p 2222 arasul@<jetson-ip>`

### Externer Zugriff (optional)

Fuer Fernwartung kann ein SSH-Tunnel eingerichtet werden:

```bash
# Auf dem Jetson:
ssh -R 0:localhost:2222 serveo.net

# Oder mit Cloudflare Tunnel:
# Siehe docs/REMOTE_MAINTENANCE.md
```

### Netzwerk-Anforderungen

| Port | Dienst | Richtung  |
| ---- | ------ | --------- |
| 80   | HTTP   | Eingehend |
| 443  | HTTPS  | Eingehend |
| 2222 | SSH    | Eingehend |

Alle anderen Ports sind durch die Firewall gesperrt.
