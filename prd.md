# ARASUL PLATFORM – Product Requirements Document (PRD)
Version 2.0 — Full Technical Specification (MVP, Production-Ready)
Format: Markdown
Status: Final Draft
Audience: Engineering, DevOps, Agentic Code-Generation Systems (Claude Code Dangerous Mode)
# 1. Executive Summary

Die Arasul Platform ist eine autonome Edge-AI-Appliance, die auf einem NVIDIA Jetson AGX Orin Developer Kit (12-Core ARM, 64 GB DDR5) läuft und folgende Kerneigenschaften erfüllt:

Endkundentauglich (Non-Technical Users)

Self-Healing für mehrjährige Wartungsfreiheit

Single-Page Unified Dashboard (SPUD)

Lokale KI: LLM + Embedding-Modell

Automatisierungs-Engine: n8n (mit externen Integrationen)

Lokaler Objektspeicher: MinIO

Zentrale Telemetrie-Datenbank: PostgreSQL (7 Tage Retention)

Deterministisches Deployment und klare Update-Mechanik (Dashboard + USB)

Offline-First, Internet optional (für n8n-Integrationen)

Dieses Dokument spezifiziert jede einzelne technische Anforderung an das System, damit ein agentischer KI-Implementierer (Claude Code Dangerous Mode) die gesamte Plattform ohne Rückfragen vollständig bauen kann.

# 2. PRD Struktur

Dieses PRD besteht aus 5 Teilen:

Teil 1: Scope, Ziele, Requirements, Systemkontext, High-Level Architektur

Teil 2: Komponentenarchitektur, Container, Storage, Netzwerk, LLM, n8n, MinIO, Reverse Proxy

Teil 3: Dashboard UI (Single Page), Backend API, Data Models, PostgreSQL Schema, Metrics Collector

Teil 4: Self-Healing System, Healthchecks, Restart Logic, Workflows, Deployment-Bootstrap

Teil 5: Updatesystem (Dashboard + USB), Security, Logging, Abnahme, Tests, Risiken, Erweiterungspfade

# 3. Vision & Ziele

Die Plattform wird so gestaltet, dass:

Nicht-technische Endkunden sie ohne Schulung verwenden können.

Das Gerät jahrelang autonom läuft, ohne tägliche Wartung.

Alle Kernprozesse lokal laufen (LLM, Embeddings, RAG, Storage).

Internet optional ist (nur für n8n-Workflows notwendig).

Das Deployment reproduzierbar ist (identische Builds/Deployments).

Das System über ein einziges Dashboard steuerbar ist.

Das System deterministisch und predictable bleibt.

# 4. Zielgruppe
4.1 Endkunden (Primär)

Keine technischen Kenntnisse

möchten „Plug & Play“

benötigen ein Dashboard, das nur beantwortet:

Läuft das System?

Welche Dienste sind aktiv?

Wie ist die Performance?

Wie starte ich KI oder Workflows?

4.2 Administratoren (Sekundär)

Zugang zum Admin-Login

führen Updates aus

lesen Logs

können Service-Zustände sehen

# 5. Scope (Functional Scope)

✅ Lokales LLM
✅ Lokales Embedding-Modell
✅ MinIO Objektspeicher
✅ n8n Workflow Engine
✅ Reverse Proxy
✅ Dashboard (Single Page)
✅ Metrics Collector
✅ PostgreSQL (7 Tage Historie)
✅ Self-Healing Engine
✅ Deterministischer Bootstrap
✅ Updates: Dashboard Upload + USB
✅ Security (1 Admin, Passwort-Login, sichere Defaults)
✅ Offline-First Architektur

# 6. Nicht-Scope (Out of Scope)

❌ Multi-User
❌ Mobile Apps
❌ Flottenmanagement
❌ Automatische Online-Updates
❌ Vision-Modelle
❌ On-Device-Fine-Tuning
❌ Kubernetes
❌ Prometheus / Grafana
❌ Multi-Tenant
❌ Authentication via OAuth / SAML etc.

# 7. Systemkontext

Das System umfasst folgende Hauptakteure:

Endnutzer: greift auf das Dashboard zu

Administrator: führt Updates durch

Workflow-System (n8n): interagiert mit Cloud-Diensten

Self-Healing Engine: autonome Überwachung & Wiederherstellung

PostgreSQL: Telemetrie und Systemdaten

LLM Engine: KI-Chat

Embedding Engine: Dokumentenvektorisierung

MinIO: Dokumentenspeicher

Device Hardware: Jetson AGX Orin

# 8. High-Level Architecture Overview

Die Architektur besteht aus folgenden Schichten:

8.1 Schichtmodell
Schicht A: Hardware

Jetson AGX Orin

Betriebssystem: JetPack 6+

NVMe-Speicher

Schicht B: Core Runtime

Docker Engine

Docker Compose

NVIDIA Container Runtime

Schicht C: System Services

PostgreSQL

Metrics Collector

Self-Healing Engine

Reverse Proxy

Schicht D: AI Services

LLM Service (Ollama/LocalAI)

Embedding Model Service

Schicht E: Application Services

n8n (mit Internetzugriff)

MinIO (lokaler Objektspeicher)

Schicht F: Application Interface

Dashboard Backend API

Dashboard Frontend

# 9. Functional Requirements (komplett & detailliert)
9.1 Dashboard (Single Page)

zeigt Systemstatus

zeigt LLM Status

zeigt n8n Status

zeigt MinIO Status

zeigt Storage & CPU/GPU Utilization

zeigt Live-Metriken

zeigt 7-Tage-Trends

enthält Links zu:

n8n

MinIO

LLM Playground (optional)

hat ein Admin-Login (1 User)

hat eine Update-Seite

hat eine Self-Healing-Statusanzeige

9.2 LLM

Lokales Modell

Chatfunktion

API verfügbar unter /api/llm/chat

Token-Limits definiert

GPU-Beschleunigung aktiviert

9.3 Embeddings

separater Dienst

/api/embeddings

Input-Size-Constraints

Rückgabe: Vektor (768-d oder abhängig vom Modell)

9.4 Workflows

n8n kann externe Dienste ansteuern

Webhooks müssen erreichbar sein

lokaler Zugriff auf LLM + Embeddings

9.5 Self-Healing

erkennt Fehler

korrigiert autonom

dokumentiert jedes Event

eskaliert bei schweren Fehlern

rebootet im Worst Case

9.6 Updates

Dashboard Upload

USB Updates

Signaturprüfung

Rollback

# 10. Nicht-funktionale Anforderungen
10.1 Performance

LLM Antwortzeit: < 1.5s pro Token

Dashboard: < 200ms Antwortzeit

Datenbankzugriff: < 150ms

System muss > 30 Tage ohne Neustart stabil laufen

10.2 Sicherheit

1 Admin Account

Passwort-Hash

HTTPS optional

keine Exposition von Secrets

10.3 Zuverlässigkeit

Self-Healing

automatische Neustarts

Telemetrie vollständig

10.4 Wartbarkeit

Logs rotieren

Datenbank wird automatisch gepflegt

# 11. Architektur-Ziele aus dem neuen Architektur-Dokument

Aus deinem neuen Architektur-Dokument extrahiere ich nur die relevanten und korrekten Anforderungen für das MVP:

✅ klare Trennung von Runtime, Services, API, Frontend
✅ deterministische Deployment-Pfade
✅ gleichbleibende Systemzustände bei jedem Boot
✅ vollständig containerisierte Architektur
✅ robuste Fehlererkennung auf allen Ebenen
✅ minimierte externe Abhängigkeiten
✅ hardware-nahe Überwachung (Thermal, GPU Usage)
✅ intuitive Benutzeroberfläche
✅ agentic-ready API Layout
✅ langfristige Stabilität

# 12. High-Level Component Interaction
Endnutzer → Dashboard Frontend → Dashboard Backend →

→ AI, n8n, MinIO, Metrics Collector, PostgreSQL, Self-Healing

Self-Healing →

→ liest Telemetrie, startet Dienste, schreibt Audit-Log

n8n →

→ kann MinIO, Embeddings und LLM nutzen

LLM →

→ GPU-accelerated Inference

PostgreSQL →

→ speichert Metriken, Self-Healing-Ereignisse, Workflow-Statistiken

# 13. Deep Component Architecture

Die Arasul Platform besteht aus 12 Kernkomponenten, die vollständig in Containern laufen und über einen deterministischen Bootstrap orchestriert werden.

Folgende Prinzipien definieren die Gesamtarchitektur:

Alle Komponenten containerisiert (keine Host-modifikationen außer GPU/Treiber).

Strikte Komponententrennung (Self-Healing != Metrics != Dashboard).

Keine zirkulären Abhängigkeiten.

Alles ist ersetzbar (Austausch von LLM/Embeddings/minIO/n8n ohne Architekturbruch).

Keine dynamischen Ports (alle Ports statisch definierbar, in .env).

Jeder Service hat definierte Healthchecks + Restart-Logik.

Jede Komponente ist deterministisch reproduzierbar.

Kein Service darf im Fehlerfall unendlich Ressourcen konsumieren.

# 14. Container-Level Architecture

Die Plattform besteht aus folgenden Containern:

14.1 System/Core Layer
Container	Zweck	Anforderungen
reverse-proxy	Routing, TLS, API-Gateway	CPU < 2%, 30 MB RAM, statische Routen
dashboard-backend	REST + WebSocket API	≤ 300ms Response, führt Self-Healing-Calls aus
dashboard-frontend	Single Page App	Served über Proxy
metrics-collector	Systemmetriken sammeln	5s Interval live, 30s persistent
postgres-db	Telemetrie + Audit	WAL aktiv, 7-Tage Retention
self-healing-agent	Service-Recovery	10s Interval, Eskalationslogik
14.2 AI Layer
Container	Zweck	Anforderungen
llm-service	Chat LLM	GPU Enabled, NVML Monitoring, max. 40 GB RAM
embedding-service	Embedding Modell	getrennt vom LLM, vektorisierung < 80ms
ai-router (optional)	API-Abstraktion	Routing zwischen Modellen
14.3 Automation Layer
Container	Zweck	Anforderungen
n8n	Workflow Engine	Zugriff auf Internet optional
n8n-webhook-proxy (optional)	abgesicherte Webhook Eingänge	Reverse Proxy Unterstützung
14.4 Storage Layer
Container	Zweck	Anforderungen
minio	lokaler Objektspeicher	10–50GB Daten, persistente Volumes
# 15. Container-Grid: Zustände & Restart-Policies
15.1 Restart-Policy

Alle Services:

restart: always

15.2 Healthcheck-Typen pro Container
Container	Healthcheck	Threshold	Reaktion
reverse-proxy	GET /health	3s Timeout	Neustart
dashboard-backend	GET /api/health	1s	Neustart
dashboard-frontend	File Exist	-	Proxy-Fallback
metrics-collector	Internal ping	1s	Self-Healing Meldung
postgres-db	pg_isready	2s	Neustart
llm-service	/health	1–3s	Restart + GPU reset (falls nötig)
embedding-service	/health	1–3s	Restart
n8n	/healthz	2s	Restart
minio	/minio/health/live	1s	Restart
self-healing-agent	process heartbeat	-	sofortiger Neustart
# 16. Netzwerkarchitektur

Die Plattform nutzt ein statisch definiertes Netzwerk mit festen Service-Namen.

16.1 Netzwerk "arasul-net"

Subnet: 172.30.0.0/24

Jeder Container erhält einen festen Hostnamen

Interne Dienste nur über Reverse Proxy erreichbar (außer n8n Webhooks & MinIO)

16.2 Wichtige Ports (statisch)
Dienst	Port (intern)	Port (extern)
Dashboard API	3001	8080 (via Proxy)
Dashboard Frontend	3000	8080
LLM Service	11434	nicht extern
Embedding Service	11435	nicht extern
PostgreSQL	5432	nicht extern
Metrics Collector	9100	nicht extern
MinIO Console	9001	optional
MinIO API	9000	optional
n8n UI	5678	via Proxy /n8n
n8n Webhooks	5679	per Proxy weitergeleitet
# 17. Speicherarchitektur
17.1 Host Verzeichnisstruktur (persistente Daten)
/arasul
  /config
  /logs
  /data
      /postgres
      /minio
      /models
      /n8n
  /cache
  /updates
  /bootstrap

17.2 Persistente Volumes (Docker)
Volume	Beschreibung
arasul-postgres	PostgreSQL Telemetrie
arasul-minio	Objektspeicher
arasul-n8n	Workflow-Daten
arasul-llm-models	Modelle
arasul-embeddings-models	Embeddings
arasul-metrics	Buffered Telemetrie
# 18. Reverse Proxy Spezifikation

Der Reverse Proxy (Traefik oder Nginx) übernimmt:

Routing aller externen Anfragen

Pfadbasierte Weiterleitung

TLS Termination (optional)

WebSocket Upgrade

Forward Auth für Admin-Login

18.1 Routing-Tabelle
Pfad	Weiterleitung
/	dashboard-frontend
/api/*	dashboard-backend
/n8n/*	n8n
/minio/*	minio
/models/*	llm-service
/embeddings/*	embedding-service
18.2 Anforderungen

Muss WebSockets für Dashboard Live Metrics unterstützen

Muss Rate Limiting für Webhooks implementieren

Muss Timeout Limits definieren

Muss statische Routes verwenden (keine dynamische Discovery)

# 19. LLM Service – Technische Anforderungen

Der LLM-Service ist ein vollständig lokaler Container mit folgenden Eigenschaften:

19.1 Modellanforderungen

Sprache: Englisch/Deutsch

Parametergröße: 8B (z. B. Llama 3.1 8B)

Max Token: 2048

GPU-Nutzung: Ja

Speicherlimit: Max. 40GB GPU/Host combined

19.2 Endpoints

POST /api/llm/chat

Input: messages[], temperature, max_tokens

Output: tokens, metadata

POST /api/llm/embed (falls Embeddings integriert wären)
wird nicht genutzt → Embeddings-Service separat

19.3 Leistungsspezifikationen

Response Start < 800ms

Token Rate > 15 tok/s

Embedding Requests parallel erlauben

19.4 Betriebsanforderungen

Neustart ohne Modell-Neuladen → caching aktiv

GPU-Reset bei NVML-Error

Healthcheck = Modell einmal minimal antworten

# 20. Embedding Service – Spezifikation

Der Embeddings-Dienst führt hochperformante Text-Embedding-Anfragen aus.

20.1 Modellanforderungen

empfohlen: nomic-embed-text

Vektorgröße: 768 oder 1024

Max Input: 4096 tokens

20.2 API

POST /api/embeddings

Input:

{
   "text": "string or list<string>"
}


Output:

{ "vectors": [float[]] }

20.3 Performance

Latenz < 80ms pro Sample

Parallelisierbar

# 21. n8n Architecture Requirements
21.1 Funktion

Workflow Engine

lokale Workflows

Trigger durch externe Dienste (z.B. Google Forms → Webhook)

21.2 Anforderungen

Externe API-Keys speichern (über .env nicht erlaubt, nur über n8n UI)

Auto-Recovery bei abgebrochenen Workflows

Persistente Historie

21.3 Integrationsmatrix

n8n muss folgende Systeme lokal erreichen können:

Ziel	Zweck
LLM	Prompting aus Workflows
Embeddings	Vektorisierung
MinIO	Dateiablage
Dashboard API	Telemetrie-Report
# 22. MinIO Architecture
22.1 Anforderungen

Access Key + Secret aus .env

Persistente Ablage von:

Dokumenten

Workflow-Dateien

Logs

RAG-Dokumenten

22.2 Buckets

documents

workflow-data

llm-cache

embeddings-cache

# 23. PostgreSQL Requirements
23.1 Konfiguration

7 Tage Retention

Autovacuum aktiv

WAL aktiv

Page Size Default

Logging aktiviert

23.2 Nutzung pro Service

Metrics Collector → metrics_* Tabellen

Self-Healing → self_healing_events

Dashboard → system_snapshots

n8n → optional (Activity Logging)

# 24. Dashboard (Single Page) – Vollständige Funktions- und Layout-Spezifikation

Das Dashboard ist das Hauptbedienelement für Endnutzer.
Es besteht aus einer einzigen Seite, die alle wichtigen Systeminformationen abbildet.

Die Spezifikation orientiert sich an deiner UX-Spec, aber angepasst für MVP-Reife und technische Vollständigkeit.

# 24.1 Struktur der Seite

Die Seite besteht aus:

Kopfzeile – System Global Status

System Cards (4 Karten)

Live Chart – Performance

Workflow Activity Overview

Service Quick Links

Footer – Systeminformationen

# 24.2 Kopfzeile: Global Status
Ziel

Auf einen Blick erkennen: Ist das System OK?

Datenquelle

GET /api/system/status

Anzuzeigende Daten

System-Gesamtstatus (OK / Warning / Critical)

Letzte Aktualisierung (Timestamp)

Self-Healing Aktivität (falls aktiv → Spinner / Badge)

Status-Definition
Status	Kriterien
OK	keine kritischen Metriken, Services laufen
Warning	CPU > 80% für >5min, Disk > 80%, Service-Neustart in letzten 10min
Critical	Service down, Temperatur > 85°C, DB nicht erreichbar
# 24.3 System Cards (4 Karten)
Card 1 – System Performance

Felder:

CPU Utilization ( Prozent )

RAM Utilization ( Prozent )

GPU Utilization ( Prozent )

Temperatur (°C)

API: /api/metrics/live

Card 2 – Storage

Felder:

Gesamtspeicher

Freier Speicher

Prozentualer Verbrauch

Warnung ab 80%

Kritisch ab 90%

API: /api/metrics/live/storage

Card 3 – AI Services

Felder:

LLM Status (Healthy/Restarting/Error)

Embeddings Status

Letzter Token-Speed (tok/s)

GPU Load vom LLM Service

API: /api/services/ai

Card 4 – Netzwerk

Felder:

IP-Adresse(n)

mDNS Name: arasul.local

Internet erreichbar: true/false

n8n Webhook erreichbar: true/false

API: /api/system/network

# 24.4 Live Chart: 24h Performance

Anforderungen:

CPU / RAM / GPU / TEMP als Linien

Update alle 5 Sekunden via WebSocket

24 Stunden Historie über PostgreSQL

WS Endpoint:
ws://<host>/api/metrics/live-stream

# 24.5 Workflow Activity Overview

Felder:

Anzahl aktiver Workflows

Anzahl ausgeführter Workflows heute

Letzter Fehler (falls vorhanden)

Letzter erfolgreicher Workflow

API: /api/workflows/activity

# 24.6 Service Quick Links

Buttons zu:

n8n UI (/n8n/)

MinIO (/minio/)

LLM Playground (/ai/chat)

System Update (/update)

Logs (/logs)

# 24.7 Footer

Informationen:

Version des Systems

Build Hash

JetPack Version

Uptime

API: /api/system/info

# 25. Dashboard Backend – API Specification

Das Dashboard Backend ist die zentrale API für das gesamte System.

Alle Endpoints werden hier vollständig festgelegt.

Grundregeln:

JSON only

HTTP status codes vollständig korrekt

Immer deterministische Antworten

Keine dynamischen Strukturen

Alle Antworten enthalten timestamp

# 25.1 API: System Status
GET /api/system/status

Response:

{
  "status": "OK | WARNING | CRITICAL",
  "llm": "healthy | restarting | failed",
  "embeddings": "healthy | restarting | failed",
  "n8n": "healthy | restarting | failed",
  "minio": "healthy | restarting | failed",
  "postgres": "healthy | restarting | failed",
  "self_healing_active": true,
  "last_self_healing_event": "string|null",
  "timestamp": "iso8601"
}

# 25.2 API: Live Metrics
GET /api/metrics/live

Response:

{
  "cpu": 0.0,
  "ram": 0.0,
  "gpu": 0.0,
  "temperature": 0.0,
  "disk": {
    "total": 0,
    "free": 0,
    "used": 0,
    "percent": 0.0
  },
  "timestamp": "iso8601"
}

# 25.3 API: Metrics History
GET /api/metrics/history?range=24h

Response:

{
  "range": "24h",
  "cpu": [...],
  "ram": [...],
  "gpu": [...],
  "temperature": [...],
  "disk_used": [...],
  "timestamps": [...],
  "timestamp": "iso8601"
}

# 25.4 API: System Info
GET /api/system/info

Response:

{
  "version": "1.0.0",
  "build_hash": "string",
  "jetpack_version": "string",
  "uptime_seconds": 123456,
  "hostname": "arasul",
  "timestamp": "iso8601"
}

# 25.5 API: Netzwerk
GET /api/system/network

Response:

{
  "ip_addresses": ["192.168.1.50"],
  "mdns": "arasul.local",
  "internet_reachable": true,
  "n8n_webhook_reachable": true,
  "timestamp": "iso8601"
}

# 25.6 API: Services
GET /api/services

Response:

{
  "llm": { "status": "healthy", "gpu_load": 0.45 },
  "embeddings": { "status": "healthy", "load": 0.12 },
  "n8n": { "status": "healthy" },
  "minio": { "status": "healthy" },
  "postgres": { "status": "healthy" },
  "timestamp": "iso8601"
}

# 25.7 API: Workflows
GET /api/workflows/activity

Response:

{
  "active": 1,
  "executed_today": 17,
  "last_error": null,
  "last_success": "2025-11-10T12:45:00Z",
  "timestamp": "iso8601"
}

# 25.8 API: Update Upload
POST /api/update/upload

multipart/form-data, Feld: file

Validierungsregeln:

muss Datei-Endung .araupdate haben

Signaturprüfung obligatorisch

Version nicht kleiner als aktuelle Version

Response:

{
  "status": "validated",
  "version": "1.0.1",
  "size": 84219341,
  "timestamp": "iso8601"
}

# 25.9 WS: Live Metrics Stream
WebSocket /api/metrics/live-stream

Stream-Event:

{
  "cpu": 0.23,
  "ram": 0.51,
  "gpu": 0.11,
  "temperature": 63.2,
  "timestamp": "iso8601"
}


Intervall: 5 Sekunden

# 26. Data Model – Vollständige Definition

Hier definieren wir die Datenbanken und Strukturen so, dass Claude sie direkt generieren kann.

# 26.1 PostgreSQL Datenbankschema (Detail)
Tabelle: metrics_cpu
timestamp timestamptz PRIMARY KEY
value float

metrics_ram
timestamp timestamptz PRIMARY KEY
value float

metrics_gpu
timestamp timestamptz PRIMARY KEY
value float

metrics_temperature
timestamp timestamptz PRIMARY KEY
value float

metrics_disk
timestamp timestamptz PRIMARY KEY
used bigint
free bigint
percent float

workflow_activity
id bigserial PRIMARY KEY
workflow_name text
status text
timestamp timestamptz
duration_ms int
error text

self_healing_events
id bigserial PRIMARY KEY
event_type text
severity text
description text
timestamp timestamptz
action_taken text

# 27. Metrics Collector – Vollspezifikation

Der Metrics Collector ist ein separater Container, der:

jede 5 Sekunden Live-Daten liest,

jede 30 Sekunden persistente Daten an PostgreSQL schreibt,

alle Metriken in einem harmonisierten Schema publiziert.

27.1 Datenquellen
CPU

Quelle: /proc/stat

RAM

Quelle: /proc/meminfo

GPU

Quelle: NVML API

Temperatur

Quelle: /sys/class/thermal/thermal_zone*/temp

Disk

Quelle: statvfs

Netzwerk

Quelle: ip addr, ping für Internetcheck

27.2 Anforderungen an Metrics Collector

CPU Nutzung < 3%

RAM Nutzung < 150MB

Keine root-Abhängigkeiten

Fehlerfreie Telemetrie, auch wenn Datenbank kurzzeitig offline ist

Telemetrie zwischenspeichern bei PG-Ausfall

Daten müssen deterministisch aggregiert werden


# 28. Self-Healing Engine – Vollständige technische Spezifikation

Die Self-Healing Engine (SHE) ist ein dedizierter Container, der systemweit Zustände erkennt, bewertet und automatisiert behebt.
Sie ist entscheidend für den geforderten mehrjährigen, wartungsfreien Betrieb.

Die SHE führt drei wesentliche Funktionen aus:

Monitoring & Diagnose (permanent, 10-Sekunden-Intervalle)

Recovery Actions (Service restarts, cache cleaning, DB maintenance etc.)

Eskalationslogik (mehrstufig, bis hin zu System-Reboot)

# 28.1 Architektur & Ausführung

Die Self-Healing Engine:

läuft als isolierter Container

besitzt Lesezugriff auf:

Metrics Collector API

Docker Engine (via socket)

Systeminformationen (Thermal, GPU, Disk)

besitzt Schreibzugriff auf:

PostgreSQL (Tabelle: self_healing_events)

Docker Engine restart & inspect

/arasul/logs (nur für Self-Healing-Logs)

Sie ist nicht zuständig für:

automatisches Updaten

n8n Workflow-Korrekturen

LLM-Modelldownloads

Nutzeranmeldungen

API-Authentifizierung

# 28.2 Self-Healing Event Loop (Hauptalgorithmus)

Der Algorithmus läuft alle 10 Sekunden:

Metrics lesen (über Metrics Collector)

Aktuellen Zustand aller Services prüfen (Docker Healthcheck & Prozesszustände)

System-Level Parameter evaluieren (Temperatur, Disk, RAM)

Regelwerk anwenden (siehe unten)

Falls Handlungen notwendig → Maßnahmen ausführen

Action + Result in self_healing_events persistieren

# 28.3 Regelwerk (Heuristik)
Kategorie A – Services Down

Wenn ein Container den Healthcheck 3× hintereinander nicht besteht:

Beispiel:
llm-service: unhealthy 3/3


Maßnahmen:

restart container

nach 5 Sekunden erneut checken

wenn weiterhin unhealthy → stop + start

wenn weiterhin unhealthy → escalate to Category C (Critical)

Kategorie B – Überlast (Mid Severity)
Kriterien:

CPU > 90% für > 5min

RAM > 90% für > 2min

GPU > 95% für > 2min

Temperatur > 83°C für 1min

Maßnahmen (sequenziell):

Soft-Limits setzen (LLM cache clear)

n8n debug tasks pausieren

LLM Session-Reset

Wenn Temperaturproblem → GPU throttling über Jetson API

Wenn weiterhin kritisch → container restart

Wenn weiterhin kritisch → escalate to Category C

Kategorie C – Kritische Fehler
Kriterien:

Datenbankverbindung verloren

minIO corruption detected

Docker daemon nicht erreichbar

GPU Recoverable Error

Disk > 95%

3+ Servicefehler innerhalb 10min

Maßnahmen:

Hard Restart aller Applikationsservices

Disk Cleanup (nur definierte Pfade)

DB-Vakuum erzwingen

GPU Reset (nvidia-smi equivalent auf Jetson)

Wenn weiterhin kritisch → Full System Restart

Kategorie D – Ultima Ratio Reboot

Der Reboot wird ausgelöst wenn:

Disk > 97% und Cleanup nicht greift

Datenbank inkonsistent nach Recovery

GPU dauerhaft fehlerhaft

3 Full-Critical Events innerhalb 30min

Anforderung:
Reboot dauert < 90 Sekunden, danach starten alle Services automatisch.

# 28.4 Self-Healing Event Logging

Jede Aktion wird in PostgreSQL gespeichert:

Tabelle: self_healing_events

id bigserial PK
event_type text
severity text
description text
timestamp timestamptz
action_taken text

# 29. Health Checks – Definitionen für alle Services

Hier sind ALLE Healthchecks definiert, die Claude direkt implementieren MUSS.

# 29.1 Dashboard Backend
GET /api/health
Timeout: 1s
Response: { "status": "ok" }
Failure threshold: 3

# 29.2 Dashboard Frontend

Healthcheck = Check auf statische Datei:

/usr/share/nginx/html/index.html


Failure wenn Datei nicht existiert.

# 29.3 LLM Service
GET /health
Timeout: 3s
Checks:
 - Modell geladen?
 - GPU erreichbar?
 - Response minimal prompt (z.B. "ok") < 500ms?


Failure threshold: 2

# 29.4 Embedding Service
GET /health
Timeout: 3s
Check: einmal "test" vektorisieren < 50ms

# 29.5 PostgreSQL

Via pg_isready:

pg_isready -h localhost -p 5432
Timeout: 2s

# 29.6 n8n
GET /healthz
Timeout: 2s

# 29.7 MinIO
GET /minio/health/live
Timeout: 1s

# 29.8 Metrics Collector

Internes Heartbeat-Signal an Dashboard Backend:

GET /api/metrics/ping
Timeout: 1s

# 30. Bootstrap System – Vollständige Spezifikation

Das gesamte System wird über einen einzigen Befehl initialisiert:

./arasul bootstrap

# 30.1 Aufgaben des Bootstraps

Jetson Hardwareprofil validieren

JetPack Version validieren

Docker Engine installieren/prüfen

NVIDIA Container Runtime installieren/prüfen

Basisverzeichnisstruktur /arasul/* anlegen

Initiale .env Datei generieren (sofern nicht vorhanden)

Container Images laden oder bauen

Startreihenfolge orchestrieren

Datenbank initialisieren

Testing Sequence (Smoke Test) durchführen

Systemstatus prüfen

Abschlussbericht erzeugen

# 30.2 Smoke-Test Kriterien

Bootstrap ist erfolgreich, wenn:

Dashboard Backend antwortet

PostgreSQL Tabellen existieren

LLM Service mindestens eine Antwort erzeugt

Embedding Service vektorisiert

n8n Workflow Engine UI erreichbar ist

MinIO über API antwortet

Self-Healing pingbar ist

Fehler → Bootstrap bricht ab und gibt vollständigen Report im JSON-Format aus.

# 30.3 Startreihenfolge (Deterministisch)

Die Reihenfolge ist bindend, damit die Plattform deterministisch initiiert:

PostgreSQL

MinIO

Metrics Collector

LLM

Embeddings

Reverse Proxy

Dashboard Backend

Dashboard Frontend

n8n

Self-Healing Engine (startet zuletzt)

# 31. Deployment Workflow – Komplette Spezifikation

Ein vollständiges Deployment ist definiert als:

Schritt 1 — Gerät frisch aufgesetzt

JetPack 6.x installiert.

Schritt 2 — arasul-installer Paket laden

Enthält alle Container + Bootstrap.

Schritt 3 — .env generieren

Bootstrap fragt folgende Parameter ab:

ADMIN_PASSWORD

MINIO_ACCESS_KEY

MINIO_SECRET_KEY

LLM_MODEL

EMBEDDING_MODEL

SYSTEM_NAME

INTERNAL_IP

Schritt 4 — Bootstrap ausführen

siehe oben

Schritt 5 — Systemprüfung

Erfolgt automatisch.

Schritt 6 — Gerät ist betriebsbereit
# 32. Constraints & Operational Policies
32.1 CPU Constraints

LLM darf max. 50% CPU nutzen (hardcap per cgroup)

Embeddings max 30% CPU

Dashboard max 5% CPU

32.2 RAM Constraints

LLM: fix 32GB reserviert

Embeddings: fix 8GB

n8n: max 2GB

PostgreSQL: max 8GB

32.3 Disk Constraints

Aktionen bei Überschreiten:

Grenze	Verhalten
80%	Warnung
90%	Cleanup
95%	Critical Error
97%	Forced Reboot
32.4 Netzwerk Policies

Interne Services nur intern erreichtbar

Keine externen Ports außer 80/443

Webhooks → Proxy

Keine dynamischen Ports


# 33. Update-System – Vollständige technische Spezifikation

Das System unterstützt zwei vollständig gleichwertige Update-Methoden:

Update via Dashboard Upload

Update via USB-Stick Detection

Beide Wege verwenden identische Dateien, Signaturen, Validierungsregeln und Fortschrittslogik.

# 33.1 Update-Dateiformat

Dateiendung:

.araupdate

Inhalt des Update-Pakets:

/manifest.json

/payload/ (Docker Images, Migration Scripts, Frontend Bundles etc.)

/signature.sig

manifest.json Struktur:
{
  "version": "1.1.0",
  "min_version": "1.0.0",
  "build_hash": "string",
  "components": {
    "llm": "image:tag",
    "embeddings": "image:tag",
    "dashboard-backend": "image:tag",
    "dashboard-frontend": "image:tag",
    "n8n": "image:tag",
    "postgres-migrations": true,
    "self-healing-agent": "image:tag"
  },
  "requires_reboot": true,
  "timestamp": "2025-01-10T12:00:00Z"
}

# 33.2 Signaturprüfung

Jedes Update muss signiert sein mit:

privater Arasul Update Signing Key (extern)

im Gerät vorhandener public key (/arasul/config/public_update_key.pem)

Validierungsprozess:

Hash des Manifests berechnen

Signatur prüfen

Hash vergleichen

Version > aktuelle Version?

min_version <= aktuelle Version?

Fehler → Update abgebrochen.

# 33.3 Update via Dashboard

Endpoint:

POST /api/update/upload
multipart/form-data
file = update.araupdate

Ablauf:

Upload

vollständige Validierung

„Update Ready“ Status

Benutzer klickt auf „Update starten“

Services nacheinander gestoppt

neue Images eingespielt

Migrationsskripte ausgeführt

Services neu gestartet

Healthcheck Verification

optionaler Reboot

Update Log → PostgreSQL

# 33.4 Update via USB-Stick

USB-Stick Ordnerstruktur:

/updates/update.araupdate

Ablauf:

Self-Healing Agent erkennt Mount-Events via udev

prüft ob Datei vorhanden

Kopiert Datei nach /arasul/updates/usb/

führt denselben Validierungsprozess durch

startet Update automatisch

legt Ergebnis unter /arasul/logs/update_usb.log ab

Falls mehrere Dateien → nur die neuste nach Versionsnummer verwenden.

# 33.5 Rollback-Verfahren

Das System speichert:

vorherige Container-Versionen

vorherigen Datenbankzustand (Snapshot)

Statusdatei update_state.json

Rollback wird ausgelöst wenn:

Update nicht vollständig erfolgreich

Ein kritischer Service nach Update nicht healthy

Self-Healing mehr als 2 kritische Fehler erkennt

Rollback Schritte:

Stop aller neuen Container

Restore der vorherigen Container-Versionen

Restore DB Snapshot

Neustart aller Services

Eintrag in self_healing_events

# 34. Security & Access Control

Ziel: Einfach, robust, wartungsarm.

# 34.1 Benutzerverwaltung

MVP hat nur einen Admin-Account.

Benutzername: admin

Passwort-Hash in /arasul/config/admin.hash

Passwort wird bei Bootstrap erstellt

Passwortwechsel über Dashboard möglich

# 34.2 Zugriffsschutz
Dashboard:

Basic Auth über Reverse Proxy

Session Token (JWT Simple)

Token Validität: 24h

Logout löscht Token serverseitig

API:

Admin-Bereich: Authorization Header erforderlich

Endnutzer-Bereich: keine Auth erforderlich für reine Status-Anzeige

# 34.3 Geheimnisse

Alle Secrets liegen in:

/arasul/config/.env


Vorinstallierte Einträge:

MINIO_ACCESS_KEY

MINIO_SECRET_KEY

ADMIN_HASH

JWT_SECRET

UPDATE_PUBLIC_KEY

# 34.4 Netzwerk-Sicherheit

Nur Port 80/443 sind extern veröffentlicht

Alle anderen Dienste nur intern erreichbar

Webhooks von n8n über Reverse Proxy abgesichert

Rate Limits:

100 req/min für n8n Webhooks

10 req/s für LLM API

20 req/s für Metrics API

# 35. Logging & Auditing
35.1 Logging-Ziele

Erklärbarkeit der Self-Healing-Maßnahmen

Diagnose von Fehlern

Nachvollziehbare Systemhistorie

35.2 Logstruktur
/arasul/logs/system.log

Dashboard Backend

Reverse Proxy

Server-Errors

/arasul/logs/self_healing.log

alle Self-Healing Ereignisse

/arasul/logs/update.log

Update Upload

Validierung

Ergebnis

/arasul/logs/service/service.log

Logs pro Container

# 35.3 Log Rotation

Rotation:

max Größe pro Datei: 50MB

max 10 Dateien

gzip-Kompression älterer Dateien

# 35.4 Auditing (PostgreSQL)

Folgende Ereignisse werden in der Datenbank gespeichert:

Self-Healing Events

Update Events (start/end/result)

Service Restart Count

n8n Workflow Errors

Disk Cleanup Actions

Reboot Events

# 36. Long-Term Operation (multi-year)

Ziel: 3+ Jahre Betrieb ohne manuelle Eingriffe.

Das System stellt sicher:

automatische Logrotation

automatische Datenbankpflege

automatische Self-Healing Restart-Strategien

automatische Disk Cleanup

automatische LLM Cache Bereinigung

Update-Mechanismen für langfristige Weiterentwicklung

7-Tage Rolling Telemetrie für Health-Konsistenz

GPU-Reset-Strategie zur Fehlerprophylaxe

deterministisches Verhalten bei Reboot

# 37. Test- & Validierungsplan

Die Plattform gilt als produktionsbereit, wenn folgende Tests bestehen:

# 37.1 Smoke Tests
Test	Erwartung
Dashboard lädt	< 1.5s
LLM antwortet	< 2s
Embedding	< 80ms
n8n UI erreichbar	OK
PostgreSQL Tabellen	vollständig
MinIO Bucket Listing	OK
# 37.2 Load Tests

LLM: 30 parallel Requests → kein Crash

Embeddings: 50 parallel Requests → kein Crash

n8n Workflows: 20/s → System stabil

# 37.3 Restart Tests

Neustart einzelner Container

Neustart kompletter Services

Full System Reboot

Nach jedem Szenario:

Telemetrie vollständig

Dashboard erreichbar

Self-Healing aktiv

# 37.4 Long-Run Test (30 Tage)

Kriterien:

keine Memory Leaks > 5%

keine übermäßige Disknutzung

keine kritischen Fehler

LLM / Embeddings stabil

n8n stabil

# 37.5 Update Tests

Update via Dashboard

Update via USB

Rollback Test

Mischfälle (Stromausfall während Update)

# 38. Risikoanalyse (vollständig)
Risiko 1: Disk wird voll

Wahrscheinlichkeit: mittel
Lösungen:

automatische Cleanup

Self-Healing Severity-C

Reboot bei > 97%

Risiko 2: GPU Fehler

Wahrscheinlichkeit: gering
Lösung:

NVML Reset

Container Restart

Reboot bei hartem Fehler

Risiko 3: Datenbankkorruption

Lösung:

WAL

regelmäßige Vacuum

Snapshot für Rollback

Risiko 4: n8n hängt bei externen APIs

Lösung:

Timeout

Self-Healing pausiert Jobs

Risiko 5: LLM Modell beschädigt

Lösung:

Hashprüfung

automatische Wiederherstellung

# 39. Erweiterungspfade

Zukunftsfunktionen:

Multi-Device Fleet Management

Cloud Sync

Mobile Apps

Vision-Modelle

Auto-Scaling Layer

Multi-User Verwaltung

SSO / SAML

neue Workflowschnittstellen

# 40. Abschließende Übersicht & Checklisten
# 40.1 Deploy-Checkliste

JetPack installiert

Docker installiert

NVIDIA Container Runtime aktiv

/arasul Verzeichnis vollständig

Bootstrap erfolgreich

Dashboard erreichbar

LLM lädt Modell

n8n Workflows geladen

# 40.2 Update-Checkliste

Signatur valide

Version kompatibel

alle Services erfolgreich aktualisiert

keine kritischen Fehler nach Update

# 40.3 Produktionsfreigabe-Checkliste

30 Tage Laufzeit stabil

alle Tests bestanden

Logs unauffällig

Ressourcenverbrauch stabil

Self-Healing Events normalisiert