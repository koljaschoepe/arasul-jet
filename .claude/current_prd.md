# PRD â€“ Arasul Store App: Telegram System Monitor

## 1) Kurzbeschreibung

**Telegram System Monitor** ist eine Store-App fÃ¼r das Arasul Edge-System, die einen **bidirektionalen Telegram Bot** bereitstellt. Der Bot ermÃ¶glicht die **FernÃ¼berwachung und -steuerung** des Arasul-Systems Ã¼ber Telegram â€“ mit **KI-gestÃ¼tzter Analyse** durch ein dediziertes Claude Code Terminal.

KernfunktionalitÃ¤t:
- **Proaktive Benachrichtigungen**: Systemstatus, Warnungen, Workflow-Events
- **Interaktive Abfragen**: Nutzer kann per Chat Systeminformationen anfragen
- **KI-gestÃ¼tzte Diagnose**: Claude Code analysiert Logs, erkennt Muster, gibt Empfehlungen
- **Workflow-Integration**: Status von n8n-Workflows, RAG-Jobs, LLM-Inferenzen

---

## 2) Problem & Motivation

### Problem
- Arasul-Systeme laufen oft **unbeaufsichtigt** beim Kunden (Kanzlei, Beratung, Agentur)
- Aktuelle Ãœberwachung erfordert **aktiven Zugriff** auf die lokale Web-UI
- Kritische Events (Speicher voll, Service down, Thermal Throttling) bleiben **unbemerkt**
- Keine MÃ¶glichkeit zur **schnellen Remote-Diagnose** ohne VPN/SSH-Zugang

### Warum Telegram?
- **Ãœberall verfÃ¼gbar**: Mobile + Desktop, keine zusÃ¤tzliche App nÃ¶tig
- **Push-fÃ¤hig**: Echte Benachrichtigungen auf dem Smartphone
- **NAT/Firewall-freundlich**: Ausgehende Verbindungen genÃ¼gen (kein Port-Forwarding)
- **Vertraut**: Viele Nutzer kennen Telegram bereits

### Warum Claude Code Integration?
- **Intelligente Analyse** statt roher Metriken
- **NatÃ¼rlichsprachliche Interaktion**: "Was ist gerade los?" statt CLI-Befehle
- **Kontextbewusst**: Claude kennt das System, die Konfiguration, die Historie
- **Proaktive Empfehlungen**: "Speicher wird knapp â€“ soll ich alte Logs bereinigen?"

---

## 3) Ziele (PrioritÃ¤t: hoch â†’ niedrig)

### G1 â€“ Einfache Bot-Einrichtung (High)
- Nutzer kann in < 5 Minuten einen funktionierenden Telegram Bot einrichten
- Guided Setup mit klaren Schritten (Token eingeben, Chat-ID verknÃ¼pfen)
- Keine Telegram-API-Kenntnisse erforderlich

### G2 â€“ Proaktive SystemÃ¼berwachung (High)
- Automatische Benachrichtigungen bei:
  - Service-AusfÃ¤llen oder -Neustarts
  - Ressourcen-Grenzwerten (CPU, RAM, Disk, Temperatur)
  - Workflow-AbschlÃ¼ssen oder -Fehlern
  - Sicherheitsrelevanten Events

### G3 â€“ Bidirektionale Kommunikation (High)
- Nutzer kann per Telegram:
  - Systemstatus abfragen
  - Services neu starten
  - Logs anfordern
  - Freie Fragen stellen (via Claude)

### G4 â€“ KI-gestÃ¼tzte Diagnose (Medium)
- Dediziertes Claude Code Terminal fÃ¼r diese App
- Claude analysiert Systemzustand und gibt verstÃ¤ndliche Antworten
- Erkennt Muster und warnt proaktiv

### G5 â€“ Sicherheit & Zugriffskontrolle (High)
- Nur autorisierte Telegram-Nutzer kÃ¶nnen interagieren
- Kritische Aktionen erfordern BestÃ¤tigung
- Audit-Log aller Bot-Interaktionen

---

## 4) Nicht-Ziele (Explizite Abgrenzung)

- **Kein Ersatz fÃ¼r die Web-UI**: Der Bot ergÃ¤nzt, ersetzt nicht
- **Keine komplexe Workflow-Erstellung** via Telegram (nur Status/Trigger)
- **Kein Multi-User-Management** im MVP (ein Admin-Bot pro System)
- **Keine Datei-Ãœbertragung** groÃŸer Dokumente (nur Logs, Screenshots, kurze Reports)
- **Keine WhatsApp/Signal/andere Messenger** im MVP (Telegram-first)

---

## 5) Annahmen & Leitprinzipien

### Annahmen
- Nutzer hat Telegram installiert und kann einen Bot erstellen (via @BotFather)
- System hat **ausgehenden Internetzugang** (HTTPS zu api.telegram.org)
- Claude Code App ist bereits installiert oder wird mit-installiert
- Nutzer ist technisch versiert genug fÃ¼r Basic-Setup (IT-Leitung, nicht Endanwender)

### Leitprinzipien
- **Privacy-first**: Keine Systemdaten an Dritte auÃŸer Telegram-API
- **Fail-safe**: Bot-Ausfall darf Hauptsystem nicht beeintrÃ¤chtigen
- **Sparsam**: Minimaler Ressourcenverbrauch, keine permanente Claude-Session
- **Klar vor clever**: Einfache, vorhersagbare Befehle

---

## 6) Zielgruppen & Personas

### P1 â€“ IT-Verantwortlicher beim Kunden
- **Will**: Wissen, dass das System lÃ¤uft, ohne stÃ¤ndig reinzuschauen
- **Schmerz**: Erst von Problemen erfahren, wenn Nutzer sich beschweren
- **Erfolg**: Push-Nachricht "Disk 90% voll" bevor es kritisch wird

### P2 â€“ Field Engineer / Support
- **Will**: Schnelle Remote-Diagnose ohne VPN-Setup
- **Schmerz**: "KÃ¶nnen Sie mal kurz schauen?" erfordert Vor-Ort-Termin
- **Erfolg**: "Zeig mir die letzten Fehler" â†’ sofortige Antwort

### P3 â€“ Power User (z. B. Kanzlei-IT)
- **Will**: Benachrichtigung wenn RAG-Index fertig ist
- **Schmerz**: Muss immer wieder UI checken
- **Erfolg**: "Index-Update abgeschlossen, 247 neue Dokumente"

---

## 7) Kern-Use-Cases (MVP)

### UC-01: Bot-Ersteinrichtung
1. Nutzer Ã¶ffnet "Telegram System Monitor" im Arasul Store
2. App zeigt Anleitung: "Erstelle Bot via @BotFather, kopiere Token"
3. Nutzer fÃ¼gt Token ein
4. App sendet Test-Nachricht an Bot
5. Nutzer bestÃ¤tigt Empfang â†’ Bot ist aktiv

### UC-02: Proaktive Warnung
1. System erkennt: RAM > 90%
2. Bot sendet: "âš ï¸� Speicherwarnung: RAM bei 92%. LLM-Service verbraucht 8.2 GB."
3. Nutzer tippt: "Details"
4. Claude analysiert und antwortet: "Der RAG-Indexer lÃ¤uft gerade. Nach Abschluss (~5 Min) sinkt die Last."

### UC-03: Status-Abfrage
1. Nutzer sendet: "Status"
2. Bot antwortet mit kompakter Ãœbersicht:
   ```
   ğŸ–¥ Arasul System Status
   â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�
   CPU: 45% | GPU: 62% | RAM: 71%
   Disk: 234 GB frei (67%)
   Temp: 52Â°C âœ“
   
   Services: 5/5 running
   n8n: 3 Workflows aktiv
   RAG: Index aktuell (1.247 Docs)
   ```

### UC-04: Freie Frage an Claude
1. Nutzer sendet: "Warum ist die GPU-Last so hoch?"
2. Bot leitet an Claude Code Terminal weiter
3. Claude prÃ¼ft Prozesse, antwortet:
   "Der LLM-Service verarbeitet gerade 3 parallele Anfragen. Das ist normal bei hoher Nutzung. Soll ich die Queue-LÃ¤nge anzeigen?"

### UC-05: Service-Neustart
1. Nutzer sendet: "/restart llm"
2. Bot fragt: "LLM-Service neu starten? (ja/nein)"
3. Nutzer bestÃ¤tigt: "ja"
4. Bot fÃ¼hrt aus, meldet: "âœ… LLM-Service neugestartet. Healthcheck OK."

### UC-06: Workflow-Benachrichtigung
1. n8n-Workflow "TÃ¤glicher Report" lÃ¤uft durch
2. Bot sendet: "ğŸ“Š Workflow 'TÃ¤glicher Report' abgeschlossen (2m 34s)"
3. Bei Fehler: "â�Œ Workflow 'Datenimport' fehlgeschlagen. /logs workflow_datenimport"

---

## 8) Funktionsumfang & Anforderungen

### 8.1 Funktionale Anforderungen (FR)

**FR-01 â€“ Bot-Konfiguration**
- Token-Eingabe mit Validierung
- Chat-ID Ermittlung (automatisch beim ersten /start)
- Test-Nachricht senden
- Bot aktivieren/deaktivieren
- Token Ã¤ndern/lÃ¶schen

**FR-02 â€“ Benachrichtigungs-Engine**
- Konfigurierbare Alert-Schwellen:
  - CPU/GPU/RAM (Default: 80%, 90%, 95%)
  - Disk (Default: 80%, 90%, 95%)
  - Temperatur (Default: 70Â°C, 80Â°C)
- Event-basierte Trigger:
  - Service-Status-Ã„nderung
  - Workflow-Abschluss/-Fehler
  - System-Boot
  - Update verfÃ¼gbar
- Ruhezeiten konfigurierbar (z. B. keine Alerts 22:00-07:00)
- Rate-Limiting (max. X Nachrichten pro Minute)

**FR-03 â€“ Befehlsverarbeitung**
- Vordefinierte Befehle:
  - `/status` â€“ SystemÃ¼bersicht
  - `/services` â€“ Service-Liste mit Status
  - `/logs <service>` â€“ Letzte Log-Zeilen
  - `/workflows` â€“ n8n Workflow-Status
  - `/restart <service>` â€“ Service neu starten
  - `/disk` â€“ SpeicherÃ¼bersicht
  - `/help` â€“ Befehlsliste
- Freie Texteingabe â†’ Weiterleitung an Claude

**FR-04 â€“ Claude Code Integration**
- Dediziertes Terminal fÃ¼r diese App (isoliert von anderen Claude Code Sessions)
- Kontext-Injection: Systeminfo, aktuelle Metriken, letzte Logs
- Timeout fÃ¼r Claude-Anfragen (Default: 60s)
- Fallback bei Claude-NichtverfÃ¼gbarkeit: "Claude ist gerade nicht erreichbar. Hier die Rohmetriken: ..."

**FR-05 â€“ Interaktive Dialoge**
- Inline-Keyboards fÃ¼r hÃ¤ufige Aktionen
- BestÃ¤tigungs-Dialoge fÃ¼r kritische Aktionen
- Kontext-Tracking (Nutzer kann Follow-up-Fragen stellen)

**FR-06 â€“ Audit & Logging**
- Alle Bot-Interaktionen werden geloggt
- Kritische Aktionen (Restarts, Config-Ã„nderungen) mit Timestamp
- Logs in Local UI einsehbar

**FR-07 â€“ Multi-Admin (Optional, Post-MVP)**
- Mehrere Telegram-Nutzer autorisieren
- Rollen: Admin (voller Zugriff) vs. Viewer (nur lesen)

---

### 8.2 Nicht-funktionale Anforderungen (NFR)

**NFR-01 â€“ VerfÃ¼gbarkeit**
- Bot-Service startet automatisch mit System
- Reconnect bei Verbindungsabbruch (exponential backoff)
- Heartbeat-Check alle 60s

**NFR-02 â€“ Latenz**
- Einfache Befehle: < 2s Antwortzeit
- Claude-Anfragen: < 30s (mit "Typing"-Indikator)
- Alerts: < 10s nach Event-Erkennung

**NFR-03 â€“ Ressourcenverbrauch**
- Idle: < 50 MB RAM, < 1% CPU
- Aktiv: < 200 MB RAM (ohne Claude)
- Claude-Session: On-demand, nicht permanent

**NFR-04 â€“ Sicherheit**
- Token verschlÃ¼sselt gespeichert
- Chat-ID Whitelist (nur autorisierte Nutzer)
- Keine PasswÃ¶rter/Secrets Ã¼ber Telegram senden
- HTTPS fÃ¼r alle API-Calls

**NFR-05 â€“ Offline-Verhalten**
- Bei fehlendem Internet: Alerts werden gepuffert (max. 100)
- Nach Reconnect: Gepufferte Alerts senden (mit Zeitstempel)
- Lokale Befehle funktionieren weiterhin (Ã¼ber Local UI)

---

## 9) Systemarchitektur

### 9.1 Komponenten

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�
â”‚                    Arasul System                            â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�  â”‚
â”‚  â”‚              Telegram System Monitor App              â”‚  â”‚
â”‚  â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�  â”‚  â”‚
â”‚  â”‚  â”‚   Bot       â”‚  â”‚  Alert      â”‚  â”‚  Command     â”‚  â”‚  â”‚
â”‚  â”‚  â”‚   Service   â”‚  â”‚  Engine     â”‚  â”‚  Processor   â”‚  â”‚  â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚  â”‚
â”‚  â”‚         â”‚                â”‚                â”‚          â”‚  â”‚
â”‚  â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”�  â”‚  â”‚
â”‚  â”‚  â”‚              Message Router                     â”‚  â”‚  â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚                            â”‚                                â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�  â”‚
â”‚  â”‚                         â–¼                             â”‚  â”‚
â”‚  â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�  â”‚  â”‚
â”‚  â”‚  â”‚  Claude     â”‚  â”‚  System     â”‚  â”‚  Arasul      â”‚  â”‚  â”‚
â”‚  â”‚  â”‚  Code       â”‚  â”‚  Metrics    â”‚  â”‚  Core        â”‚  â”‚  â”‚
â”‚  â”‚  â”‚  Terminal   â”‚  â”‚  Collector  â”‚  â”‚  Services    â”‚  â”‚  â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚  â”‚
â”‚  â”‚              Shared Arasul Infrastructure             â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚
                            â”‚ HTTPS (Outbound)
                            â–¼
                   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�
                   â”‚  Telegram API   â”‚
                   â”‚  (api.telegram  â”‚
                   â”‚      .org)      â”‚
                   â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚
                            â–¼
                   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�
                   â”‚  Telegram App   â”‚
                   â”‚  (User Device)  â”‚
                   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 9.2 Komponenten-Beschreibung

**Bot Service**
- Long-Polling oder Webhook fÃ¼r Telegram Updates
- Verbindungsmanagement, Reconnect-Logik
- Message Serialization/Deserialization

**Alert Engine**
- Subscribes zu System-Events (via Arasul Event Bus)
- Evaluiert Alert-Regeln
- Deduplizierung (kein Spam bei flapping)
- Queue fÃ¼r ausgehende Alerts

**Command Processor**
- Parsed eingehende Nachrichten
- Unterscheidet: Befehl vs. freie Frage
- Dispatched an entsprechende Handler
- Formatiert Antworten (Markdown, Inline-Keyboards)

**Message Router**
- Zentrale Routing-Logik
- Entscheidet: Direkte Antwort vs. Claude vs. Systemabfrage
- Rate Limiting
- Audit Logging

**Claude Code Terminal (Dedicated)**
- Isolierte Claude Code Session nur fÃ¼r Bot-Anfragen
- Kontext: Systeminfo, Metriken, Logs
- Keine Ãœberschneidung mit anderen Claude Code Nutzungen

---

## 10) UI-Integration (Arasul Store & Settings)

### 10.1 Store-Eintrag
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�
â”‚  ğŸ“± Telegram System Monitor             â”‚
â”‚  â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�  â”‚
â”‚  Ãœberwache dein Arasul-System via       â”‚
â”‚  Telegram. Erhalte Alerts, frage        â”‚
â”‚  Status ab, lass Claude analysieren.    â”‚
â”‚                                         â”‚
â”‚  Voraussetzung: Claude Code App         â”‚
â”‚                                         â”‚
â”‚  [Installieren]                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 10.2 Setup-Wizard (nach Installation)
1. **Willkommen** â€“ Kurze ErklÃ¤rung, was der Bot kann
2. **Bot erstellen** â€“ Anleitung mit Screenshots fÃ¼r @BotFather
3. **Token eingeben** â€“ Textfeld + Validierung
4. **VerknÃ¼pfen** â€“ "Sende /start an deinen Bot" + Warten auf Chat-ID
5. **Testen** â€“ Test-Nachricht senden
6. **Fertig** â€“ Ãœbersicht der Befehle, Link zu Einstellungen

### 10.3 Settings-Seite
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”�
â”‚  Telegram System Monitor â€“ Settings     â”‚
â”‚  â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�  â”‚
â”‚                                         â”‚
â”‚  Status: ğŸŸ¢ Verbunden                   â”‚
â”‚  Bot: @ArasulMonitorBot                 â”‚
â”‚  Chat-ID: 123456789                     â”‚
â”‚                                         â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚  Alert-Schwellen                        â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚  CPU Warning:    [80] %                 â”‚
â”‚  CPU Critical:   [95] %                 â”‚
â”‚  RAM Warning:    [80] %                 â”‚
â”‚  RAM Critical:   [95] %                 â”‚
â”‚  Disk Warning:   [80] %                 â”‚
â”‚  Temp Warning:   [70] Â°C                â”‚
â”‚                                         â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚  Benachrichtigungen                     â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚  [âœ“] Service-StatusÃ¤nderungen          â”‚
â”‚  [âœ“] Workflow-AbschlÃ¼sse               â”‚
â”‚  [âœ“] Ressourcen-Warnungen              â”‚
â”‚  [âœ“] System-Boot                       â”‚
â”‚  [ ] Alle n8n Workflow-Starts          â”‚
â”‚                                         â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚  Ruhezeiten                             â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚  [ ] Ruhezeit aktivieren               â”‚
â”‚      Von: [22:00] Bis: [07:00]         â”‚
â”‚      (Kritische Alerts werden trotzdem â”‚
â”‚       gesendet)                         â”‚
â”‚                                         â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚  Aktionen                               â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚  [Test-Nachricht senden]               â”‚
â”‚  [Token Ã¤ndern]                        â”‚
â”‚  [Bot deaktivieren]                    â”‚
â”‚                                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 11) Telegram-Interaktionsdesign

### 11.1 Nachrichtenformate

**System-Status (kompakt)**
```
ğŸ–¥ Arasul Status
â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�
CPU: â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘ 62%
GPU: â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘ 78%
RAM: â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘ 71%
Disk: â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘ 48%

ğŸŒ¡ 52Â°C | â�± Uptime: 14d 3h

Services: 5/5 âœ“
```

**Alert (Warning)**
```
âš ï¸� Speicherwarnung

RAM-Auslastung: 92%
Schwellwert: 90%

Top-Verbraucher:
â€¢ llm-service: 8.2 GB
â€¢ rag-indexer: 2.1 GB
â€¢ n8n: 1.4 GB

[Details] [Ignorieren]
```

**Alert (Critical)**
```
ğŸš¨ KRITISCH: Service ausgefallen

Service: llm-service
Status: Stopped (Exit Code 137)
Seit: vor 2 Minuten

Letzte Log-Zeile:
"OOM killed by kernel"

[Logs anzeigen] [Neu starten]
```

**Claude-Antwort**
```
ğŸ¤– Claude

Die hohe GPU-Last (78%) kommt vom LLM-Service, 
der gerade 3 parallele Inferenz-Anfragen 
verarbeitet.

Das ist normales Verhalten bei aktiver Nutzung. 
Die Last sollte in wenigen Sekunden sinken, 
sobald die Anfragen abgeschlossen sind.

Soll ich die Request-Queue anzeigen?

[Ja, Queue zeigen] [Nein, danke]
```

### 11.2 BefehlsÃ¼bersicht

| Befehl | Beschreibung |
|--------|--------------|
| `/start` | Bot aktivieren, Chat-ID registrieren |
| `/status` | SystemÃ¼bersicht |
| `/services` | Alle Services mit Status |
| `/logs <service>` | Letzte 20 Log-Zeilen |
| `/restart <service>` | Service neu starten |
| `/workflows` | n8n Workflow-Status |
| `/disk` | SpeicherÃ¼bersicht |
| `/alerts` | Alert-Einstellungen anzeigen |
| `/mute <minuten>` | Alerts temporÃ¤r pausieren |
| `/help` | Befehlsliste |

Freier Text â†’ Wird an Claude weitergeleitet

---

## 12) Claude Code Integration â€“ Details

### 12.1 Dediziertes Terminal

Die App nutzt ein **eigenes Claude Code Terminal**, das:
- **Isoliert** von anderen Claude Code Sessions lÃ¤uft
- **Spezialisiert** auf SystemÃ¼berwachung ist
- **Kontext** Ã¼ber das Arasul-System vorgeladen hat

### 12.2 System-Prompt fÃ¼r Claude

```
Du bist der KI-Assistent fÃ¼r ein Arasul Edge-System. 
Du kommunizierst via Telegram mit dem Administrator.

SYSTEMKONTEXT:
- Hardware: {jetson_model}
- Hostname: {hostname}
- Uptime: {uptime}
- Aktuelle Metriken: {metrics_json}
- Installierte Services: {services_list}
- Letzte Alerts: {recent_alerts}

DEINE AUFGABEN:
1. Beantworte Fragen zum Systemzustand verstÃ¤ndlich
2. Analysiere Logs und erkenne Muster
3. Gib konkrete Handlungsempfehlungen
4. Warne proaktiv bei erkannten Problemen

REGELN:
- Antworte kurz und prÃ¤gnant (Telegram-Format)
- Nutze Emojis sparsam aber sinnvoll
- Bei kritischen Problemen: Klare Handlungsanweisung
- Bei Unsicherheit: Sage es ehrlich
- Schlage relevante Befehle vor (z.B. "/logs llm")
```

### 12.3 Kontext-Injection

Bei jeder Anfrage erhÃ¤lt Claude:
```json
{
  "system_metrics": {
    "cpu_percent": 62,
    "gpu_percent": 78,
    "ram_used_gb": 11.2,
    "ram_total_gb": 15.8,
    "disk_free_gb": 234,
    "temperature_c": 52
  },
  "services": [
    {"name": "llm-service", "status": "running", "uptime": "14d"},
    {"name": "rag-service", "status": "running", "uptime": "14d"},
    ...
  ],
  "recent_logs": {
    "llm-service": ["[2024-01-15 10:23:45] INFO: Request completed..."],
    ...
  },
  "recent_alerts": [
    {"time": "2024-01-15 09:15:00", "type": "warning", "message": "RAM 85%"}
  ],
  "n8n_workflows": [
    {"name": "TÃ¤glicher Report", "status": "success", "last_run": "..."}
  ]
}
```

---

## 13) Sicherheitskonzept

### 13.1 Authentifizierung
- **Chat-ID Whitelist**: Nur registrierte Telegram-Nutzer kÃ¶nnen interagieren
- **Erstregistrierung**: Muss Ã¼ber Local UI bestÃ¤tigt werden
- **Unbekannte Absender**: Werden ignoriert, optional Alert an Admin

### 13.2 Autorisierung
- **Read-Only Befehle**: /status, /services, /logs, /workflows
- **Write Befehle**: /restart, /mute (erfordern BestÃ¤tigung)
- **Admin-Only**: Token Ã¤ndern, Bot deaktivieren (nur via Local UI)

### 13.3 Datenminimierung
- Keine PasswÃ¶rter/Secrets Ã¼ber Telegram
- Log-AuszÃ¼ge: Nur letzte N Zeilen, keine sensitiven Daten
- Metriken: Aggregiert, keine personenbezogenen Daten

### 13.4 Token-Sicherheit
- Bot-Token verschlÃ¼sselt gespeichert (nicht im Klartext in Config)
- Token-Rotation Ã¼ber UI mÃ¶glich
- Bei Kompromittierung: Token in @BotFather widerrufen + neu setzen

---

## 14) QualitÃ¤tssicherung

### 14.1 Testszenarien

| Test | Beschreibung | Erwartetes Ergebnis |
|------|--------------|---------------------|
| T01 | Bot-Setup mit gÃ¼ltigem Token | Test-Nachricht wird empfangen |
| T02 | Bot-Setup mit ungÃ¼ltigem Token | Fehlermeldung, kein Absturz |
| T03 | /status Befehl | Korrekte Metriken in < 2s |
| T04 | RAM > 90% | Alert wird gesendet in < 10s |
| T05 | Service-Crash | Alert + Log-Auszug |
| T06 | Freie Frage an Claude | Sinnvolle Antwort in < 30s |
| T07 | /restart mit BestÃ¤tigung | Service wird neu gestartet |
| T08 | Unbekannter Absender | Wird ignoriert |
| T09 | Internet-Ausfall | Alerts werden gepuffert |
| T10 | Internet-Wiederherstellung | Gepufferte Alerts werden gesendet |

### 14.2 Akzeptanzkriterien (MVP)

- **A1**: Bot-Setup in < 5 Minuten abschlieÃŸbar
- **A2**: /status liefert korrekte, aktuelle Metriken
- **A3**: Ressourcen-Alerts werden zuverlÃ¤ssig gesendet
- **A4**: Claude beantwortet Systemfragen sinnvoll
- **A5**: Service-Restarts funktionieren mit BestÃ¤tigung
- **A6**: Nur autorisierte Nutzer kÃ¶nnen interagieren

---

## 15) Roadmap

### Phase 1 â€“ MVP Core
- Bot-Setup Wizard
- Basis-Befehle (/status, /services, /logs, /help)
- Ressourcen-Alerts (CPU, RAM, Disk, Temp)
- Service-Status-Alerts
- Claude-Integration fÃ¼r freie Fragen

### Phase 2 â€“ Enhanced Monitoring
- n8n Workflow-Integration
- Erweiterte Alert-Konfiguration
- Ruhezeiten
- Alert-Historie in UI
- Inline-Keyboards fÃ¼r hÃ¤ufige Aktionen

### Phase 3 â€“ Advanced Features
- Multi-Admin Support
- Rollen (Admin/Viewer)
- Scheduled Reports ("Sende tÃ¤glich um 9:00 Status")
- Integration mit RAG-Service ("Frag die Wissensdatenbank")
- Sprachnotizen â†’ Text â†’ Claude

---

## 16) Offene Fragen

1. **Webhook vs. Long-Polling?**
   - Long-Polling: Einfacher, keine eingehenden Ports nÃ¶tig
   - Webhook: Effizienter bei hohem Volumen, braucht HTTPS-Endpoint

2. **Claude Code Lizenz fÃ¼r Bot-Nutzung?**
   - Ist dediziertes Terminal in Claude Code Subscription enthalten?
   - Separate Abrechnung nÃ¶tig?

3. **Rate Limits Telegram API?**
   - Max 30 Messages/Second an gleichen Chat
   - Relevant bei vielen Alerts â†’ Batching/Zusammenfassung

4. **Offline-Puffer GrÃ¶ÃŸe?**
   - 100 Alerts? Mehr? Weniger?
   - Priorisierung (Critical > Warning)?

5. **Log-Sanitization?**
   - Welche Patterns mÃ¼ssen geschwÃ¤rzt werden?
   - IPs? Pfade? Custom Regex?

---

## 17) Definition of Done (MVP)

- [ ] Bot-Setup Wizard funktioniert Ende-zu-Ende
- [ ] Alle Basis-Befehle implementiert und getestet
- [ ] Alert-Engine sendet zuverlÃ¤ssig bei SchwellwertÃ¼berschreitung
- [ ] Claude beantwortet Systemfragen kontextbezogen
- [ ] Nur autorisierte Nutzer kÃ¶nnen interagieren
- [ ] Dokumentation: Setup, Befehle, Troubleshooting
- [ ] Integration in Arasul Store (Install/Uninstall)
- [ ] Settings-Seite in Local UI

---

## 18) AbhÃ¤ngigkeiten

| AbhÃ¤ngigkeit | Status | Notwendig fÃ¼r |
|--------------|--------|---------------|
| Arasul Core Services | âœ“ Vorhanden | Metriken, Logs, Service-Control |
| Claude Code App | âœ“ Im Store | KI-gestÃ¼tzte Analyse |
| Arasul Event Bus | âœ“ Vorhanden | Alert-Trigger |
| Ausgehender HTTPS | Vorausgesetzt | Telegram API |
| Telegram Account | Nutzer-Aufgabe | Bot-Erstellung |

---

## 19) Ressourcen-SchÃ¤tzung

### Entwicklungsaufwand
- Bot-Service + Telegram-Integration: ~3-4 Tage
- Alert-Engine: ~2-3 Tage
- Command-Processor: ~2-3 Tage
- Claude-Integration: ~2 Tage
- UI (Setup-Wizard + Settings): ~2-3 Tage
- Tests + Dokumentation: ~2-3 Tage

**Gesamt MVP: ~15-20 Entwicklertage**

### Laufende Kosten
- Telegram API: Kostenlos
- Claude Code: Teil der bestehenden Subscription
- Infrastruktur: LÃ¤uft lokal, keine Cloud-Kosten
