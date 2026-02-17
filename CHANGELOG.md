# Changelog

Alle relevanten Aenderungen an der Arasul Platform werden hier dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)
und das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.0.0] - 2026-02-17

### Erstveroeffentlichung

Erste produktionsreife Version der Arasul Platform fuer NVIDIA Jetson AGX Orin.

#### Hinzugefuegt

- **Dashboard** - Echtzeit-Uebersicht ueber CPU, RAM, GPU, Temperatur, Speicher
- **AI Chat** - Multi-Tab KI-Chat mit Ollama-Integration (Qwen3, Llama3, etc.)
- **RAG-System** - Dokumentenbasierte KI-Antworten mit Qdrant-Vektordatenbank
- **Dokumentenverwaltung** - Upload, Indizierung und Verwaltung von PDF, DOCX, TXT und mehr
- **Datentabellen** - Strukturierte Daten mit NL-Query und RAG-Indexierung
- **Telegram-Bot** - Multi-Bot-Verwaltung mit Sprach- und Textnachrichten
- **App Store** - Installierbare Erweiterungen fuer die Plattform
- **Model Store** - Ollama-Modelle herunterladen, verwalten und wechseln
- **n8n Workflows** - Visuelle Automatisierung mit benutzerdefinierten KI-Nodes
- **Self-Healing** - Automatische Erkennung und Behebung von Serviceproblemen
- **Backup-Service** - Automatische Datensicherung mit Wiederherstellung
- **Setup-Wizard** - Gefuehrte Ersteinrichtung in 5 Schritten
- **Update-System** - Signierte Offline-Updates via USB oder Dashboard-Upload
- **Metriken-Collector** - GPU/CPU/RAM/Temperatur/Disk-Monitoring
- **Logging** - Zentrales Logging via Loki + Promtail
- **Cloudflare-Tunnel** - Optionaler sicherer Fernzugriff

#### Sicherheit

- RSA-SHA256 signierte Update-Pakete
- JWT-basierte Authentifizierung mit Token-Rotation
- Rate-Limiting auf allen API-Endpunkten
- DOMPurify fuer alle HTML-Ausgaben
- CORS-Konfiguration fuer Produktionsbetrieb
- Keine Shell-Injection-Risiken (execFile statt exec)

#### Unterstuetzte Hardware

- NVIDIA Jetson AGX Orin (primaer)
- NVIDIA Jetson Orin NX
- NVIDIA Jetson Orin Nano
- Generische Linux x86_64 (eingeschraenkt)
