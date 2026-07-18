# Arasul Platform - Administrationshandbuch

> Ausfuehrliche Dokumentation aller Funktionen der Arasul Platform.
> Fuer die Ersteinrichtung siehe: [Quick-Start-Guide](QUICK_START.md)

---

## Inhaltsverzeichnis

1. [Systemuebersicht](#1-systemuebersicht)
2. [Dashboard](#2-dashboard)
3. [Chat / KI-Assistent](#3-chat--ki-assistent)
4. [Dokumente & RAG](#4-dokumente--rag)
5. [Workspace & Agenten](#5-workspace--agenten)
6. [Automation (n8n & Agenten per HTTP)](#6-automation)
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
- **Workspace-Agenten:** Eigene KI-Agenten anlegen, aus dem Chat (`@agent`) oder per HTTP/n8n starten
- **Automation (n8n):** Workflows bauen und Agenten in Abläufe einbinden
- **Automatische Sicherung:** Taegliche Backups aller Daten
- **Offline-faehig:** Funktioniert ohne Internetverbindung

### Zugriff

| Dienst          | Adresse                    |
| --------------- | -------------------------- |
| Web-Oberflaeche | `https://<hostname>.local` |
| SSH-Zugang      | `ssh -p 2222 arasul@<ip>`  |

### Workspace (IDE-Oberflaeche)

Die Standard-Oberflaeche nach der Anmeldung ist der **Workspace** — aufgebaut
wie eine Entwicklungsumgebung (Cursor/VS-Code-Raster), in drei Themes
(Schwarz · Dunkel · Hell). Das Theme wird ausschliesslich unter **Einstellungen →
Erscheinungsbild** gewaehlt (der fruehere Ansichtsmodus-Umschalter oben links
ist entfallen). Alle Flaechen (Sidebar, Mitte, rechtes Panel) teilen denselben
Hintergrund; getrennt wird nur durch feine Linien.

- **Activity Bar (ganz links):** schmale Icon-Leiste mit einer **festen
  Drei-Bereiche-Navigation** — **Chat** (Kommandozentrale, rechtes Panel),
  **Wissen** (Dateien/Explorer, linke Sidebar) und **Automation** (n8n) —
  darunter **Extensions**, ganz unten **Einstellungen** (inkl. System-Status).
  Chat und Terminal wohnen im rechten Panel, der Explorer in der Sidebar.
- **Sidebar (links, kontextabhaengig):** wechselt mit dem aktiven Tab —
  **Dashboard** zeigt den Dokumente-/Projekte-Explorer (Projekte → Ordner →
  Dateien als Baum; Upload per Drag & Drop oder Kontextmenue, Indexierung
  startet automatisch, Suchfeld filtert den Baum). **Extensions** zeigt links
  eine Verwaltung mit **nur den installierten/aktiven** Apps und KI-Modellen —
  mit Filter **Alle · Sprachmodelle · Apps** und Suchfeld; gestoebert und
  installiert wird im Katalog in der Mitte. Bei **Automation (n8n)** bleibt der
  Explorer stehen (n8n oeffnet als Tab im Hauptbereich). Der Auf-/Zu-Zustand
  bleibt ueber ein Neuladen erhalten.
- **Mitte (Tab-Leiste):** mehrere Tabs parallel (Extensions-Detail, Dokumente,
  Automation, Editor-Dateien, …), schliessbar, werden nach einem Neuladen
  wiederhergestellt. Chat und Terminal erscheinen nie als Tab.
- **Rechtes Panel (eine Flaeche mit Umschalter [Chat | Terminal]):** oben
  waehlt ein Segment-Schalter zwischen **Chat** und **Terminal**; der aktive
  Modus fuellt die ganze Flaeche (kein geteiltes Fenster mehr).
  - **Chat:** Fragen ans eigene Unternehmenswissen; Antworten kommen mit
    klickbaren Quellen (Dateinamen vollstaendig lesbar). Oben in der
    Statuszeile lebt das **Maskottchen** und zeigt sofort „denkt nach …";
    laufende Antworten streamen, ein aufklappbarer **Denkprozess** ist sichtbar,
    wenn das Modell ihn liefert. Dateien in den Chat ziehen erzeugt **Anhang-
    Chips** ueber dem Eingabefeld (mit Entfernen); Dateien/Ordner aus dem
    Explorer grenzen die Suche ein.
  - **Terminal:** Projekt-Terminals (Modi: Isoliert = DSGVO-Testumgebung ohne
    Netzzugriff, Intern = Zugriff auf das lokale LLM, Infrastruktur =
    Vollzugriff, nur Admins). In Terminals stehen `/claude`, `/codex`,
    `/gemini` und `open-ara` bereit (Erststart installiert das jeweilige CLI).
  - Der Wechsel zwischen Chat und Terminal unterbricht **nichts**: ein
    laufender Chat-Stream und eine laufende Terminal-Sitzung laufen im
    Hintergrund weiter; der zuletzt genutzte Modus wird nach einem Neuladen
    wiederhergestellt.
- **Layout-Schalter (oben rechts, neben Einstellungen):** **zwei** Symbole
  blenden die Sidebar und das rechte Panel unabhaengig ein/aus (mit Tooltip).
- **Statusleiste (unten):** aktive Terminal-Session, Systemstatus sowie das
  aktuell geladene KI-Modell samt belegtem KI-RAM (aus der tatsaechlichen
  Ollama-Auslastung — Details im Tooltip).
- **Extensions (Verwaltung + Katalog):** links die **installierten/aktiven**
  Eintraege (Filter Alle · Sprachmodelle · Apps), in der Mitte der durchsuchbare
  **Store** mit **zwei Reitern (Modelle · Erweiterungen)**; ein Klick oeffnet
  die Detailseite mit allen Aktionen — KI-Modelle installieren/aktivieren,
  Plattform-Apps (n8n) ein-/ausblenden. **Automation**
  oeffnet n8n direkt als Tab. Deaktivieren
  wirkt sofort (ohne Neuladen): das Symbol verschwindet aus der Activity Bar
  und offene Tabs der App werden geschlossen. (Alte Deep-Links auf die
  frueheren Unter-Tabs `/store/models` und `/store/apps` leiten automatisch um.)
- Die Workspace-Shell ist die einzige Ansicht: `/` landet nach dem Login
  immer auf `/workspace` (es gibt keine klassische Sidebar-Ansicht und keinen
  Umschalter mehr).

---

## 2. Dashboard

Das Dashboard ist bewusst schlank und zeigt auf einen Blick:

- **System-Status:** RAM, Swap, Speicherplatz, Temperatur (mit Verlauf) sowie
  ein Dienste-Health-Widget mit Ampel-Anzeige (gruen/gelb/rot)
- **Automatisierungen:** die letzten n8n-Workflow-Laeufe mit Status und
  Zeitpunkt; „n8n oeffnen" springt direkt in den Automation-Tab
- **Chat starten/Dokument hochladen/Projekt oeffnen** sind als Aktions-Kacheln
  entfallen — Chat lebt im rechten Panel, Upload im Explorer der Sidebar.

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

<a id="5-workspace--agenten"></a>

## 5. Workspace & Agenten

Ein **Workspace** ist die zentrale Arbeitsumgebung: ein Ordner plus ein
Container mit einem Besitzer und einem **Netzwerkmodus** („Was darf dieser
Workspace?"):

| Modus              | Zugriff                                           |
| ------------------ | ------------------------------------------------- |
| **Abgeschottet**   | Internet ja, Plattform nein (Standard)            |
| **Am System**      | interne Dienste: Datenbank / MinIO / Qdrant / RAG |
| **Voller Zugriff** | Infrastruktur — **nur Admins**                    |

Jeder Workspace hat genau einen unsichtbaren Wissensbereich („Ordner"): dort
geschriebene Dateien werden **automatisch indiziert** (kein manueller Upload).

### Agent anlegen

Ein Agent ist eine Markdown-Datei `agenten/<name>.md` im Workspace-Ordner mit
einem YAML-Kopf und einem System-Prompt:

```markdown
---
name: Texter
beschreibung: Schreibt und überarbeitet Texte im Workspace.
modell: qwen2.5:7b
werkzeuge: [dateien, rag]
---

Du bist ein präziser Lektor. Antworte auf Deutsch.
```

Werkzeuge: **dateien** (Dateien lesen/schreiben), **rag** (im Workspace-Wissen
suchen), **terminal** (Befehl im Workspace-Container ausführen).

### Agent starten

- **Aus dem Chat:** `@agentname <Eingabe>` — die Werkzeug-Schritte laufen live mit.
- **Per HTTP / n8n:** siehe [Abschnitt 6](#6-automation).

---

<a id="6-automation"></a>

## 6. Automation (n8n & Agenten per HTTP)

- **n8n:** Öffnen Sie **Automation** in der Activity Bar, um Workflows zu bauen.
- **Agent per HTTP starten:** Erzeugen Sie pro Workspace ein Token
  (_Agenten → Token_; das Token `arun_…` wird **nur einmal** angezeigt) und
  rufen Sie den Agenten aus n8n (HTTP-Request-Node) auf:

  ```
  POST /api/sandbox/projects/<workspace>/agenten/<agent>/run
  Authorization: Bearer arun_…

  { "input": "…" }
  ```

  Details: [docs/integrations/N8N.md](../integrations/N8N.md) und
  [docs/features/AGENTS.md](../features/AGENTS.md).

---

## 7. Einstellungen

Die Einstellungen sind in **6 Reiter** gegliedert (frueher 9 — verwandte Bereiche
wurden zusammengelegt, damit die Navigation uebersichtlich bleibt):

| Reiter          | Inhalt                                                       |
| --------------- | ------------------------------------------------------------ |
| **Allgemein**   | Systeminformationen, Theme                                   |
| **KI**          | Zwei Unterbereiche: _Firmenprofil & Kontext_ und _RAG & LLM_ |
| **Sicherheit**  | Passwort aendern, Abmelden / von allen Geraeten abmelden     |
| **Datenschutz** | DSGVO-Auskunft (Export) und Konto-Loeschung                  |
| **System**      | Drei Unterbereiche: _Services_, _Updates_, _Self-Healing_    |
| **Fernzugriff** | Tailscale-VPN und Remote-Zugriff                             |

> Deep-Links funktionieren: `…/settings?tab=system` oeffnet direkt den System-Reiter.
> Alte Links (z. B. `?tab=selfhealing`) werden automatisch auf den neuen Reiter umgeleitet.

### Allgemein

- **System-Name:** Name Ihrer Arasul-Installation
- **Sprache:** Standardmaessig Deutsch
- **Theme:** Dunkles Design (Standard)

### KI → Firmenprofil & Kontext

- **Standard-Modell:** Voreingestelltes KI-Modell
- **Temperatur:** Kreativitaet der Antworten (0.0-1.0)
- **Max Tokens:** Maximale Antwortlaenge

### KI → RAG & LLM (Experten-Tunables)

Der Unterbereich **Einstellungen → KI → „RAG & LLM"** (nur fuer Administratoren) macht die
Feinjustierung der Antwort-Pipeline ohne Neustart moeglich. Aenderungen wirken
sofort. Alle Werte haben sinnvolle Standardwerte — nur anpassen, wenn Sie die
Auswirkung kennen.

- **Generierung:** `Temperatur` (0–2, niedrig = quellentreu), `num_predict`
  (max. Antwortlaenge in Tokens).
- **Retrieval:** `final_k` (Anzahl Dokument-Abschnitte, die die KI erhaelt, 1–20),
  `MMR-Lambda` (1 = reine Relevanz, 0 = maximale Vielfalt), `Dedup pro Dokument`
  (max. Abschnitte je Quelldokument), `Hybrid-Suche` (dichte + BM25-Suche an/aus).
- **Space-Routing:** `Schwelle` (Mindest-Aehnlichkeit, damit ein Wissens-Space in
  die Anfrage einbezogen wird) und `max. Spaces` pro Anfrage.
- **Basis-System-Prompt:** frei editierbarer Grundtext, der jedem KI-Kontext
  vorangestellt wird. **Feld leeren = eingebauter Standard-Prompt.**

Die Standardwerte entsprechen exakt den bisher fest verdrahteten Werten; ein
frisch aufgesetztes System verhaelt sich also unveraendert, bis Sie hier etwas
aendern.

### Sicherheit

- **Passwort aendern:** Unter Einstellungen > Sicherheit (Dashboard- und MinIO-Passwort)
- **Passwort vergessen:** Es gibt bewusst keinen Self-Service-Reset. Ein ausgesperrter
  Administrator setzt das Passwort per Operator-CLI zurueck: `scripts/security/reset-password.sh`
- **Abmelden / Von allen Geraeten abmelden:** beide mit Sicherheitsabfrage
- **Session-Dauer:** Automatisches Abmelden nach Inaktivitaet

---

## 8. Services-Verwaltung

### Dienste anzeigen

1. Navigieren Sie zu **Einstellungen → System → "Services"**
2. Alle Dienste werden mit Status angezeigt (manueller Refresh-Button oben rechts)

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
./scripts/backup/backup.sh
```

### Backup wiederherstellen

```bash
# Letztes Backup wiederherstellen:
./scripts/backup/restore.sh --latest --all

# Bestimmtes Datum:
./scripts/backup/restore.sh --all --date 20260217

# Nur Datenbank:
./scripts/backup/restore.sh --postgres --latest
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
2. Oeffnen Sie **Einstellungen → System → Updates**
3. Das System erkennt den USB-Stick automatisch
4. Klicken Sie auf **"Update installieren"**
5. Warten Sie, bis das Update abgeschlossen ist
6. Das System startet bei Bedarf automatisch neu

### Update-Verlauf

Unter **Einstellungen → System → Updates → Verlauf** sehen Sie:

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

> **Denkmodell:** LAN-Zugriff ist der Auslieferungs-Standard, Fernzugriff ist
> ein bewusstes Opt-in via Tailscale. In beiden Faellen erreichen Sie das Gerät
> ueber **einen Namen** (statt roher IP): im LAN `https://<hostname>.local`,
> unterwegs `https://<geraet>.<tailnet>.ts.net`.

### Lokaler Zugriff

Das System ist ueber das lokale Netzwerk erreichbar:

- **Web:** `https://<hostname>.local` (selbstsigniertes Zertifikat — Warnung beim ersten Aufruf bestaetigen)
- **SSH:** `ssh -p 2222 arasul@<jetson-ip>`

### Fernzugriff mit Tailscale (Opt-in)

Tailscale ermoeglicht sicheren Zugriff von ueberall - ohne Port-Forwarding oder VPN-Server.

**Einrichtung:**

1. Kostenloses Konto auf [tailscale.com](https://login.tailscale.com) erstellen
2. Tailscale-App auf Ihrem Laptop/Handy installieren
3. Auth-Key erstellen unter Admin > Settings > Keys
4. Im Dashboard unter **Einstellungen > Fernzugriff** den Key eingeben

**Nach der Einrichtung:**

- Dashboard: `https://<geraet>.<tailnet>.ts.net` (von ueberall erreichbar,
  browser-vertrautes Schloss via `tailscale serve`). Ersatzweise
  `https://<tailscale-ip>` (mit Zertifikatswarnung), falls MagicDNS/HTTPS
  noch nicht in der Tailscale-Admin-Konsole aktiviert wurde.
- SSH: `ssh arasul@<tailscale-ip>`

**Status pruefen:** Im Dashboard unter Einstellungen > Fernzugriff werden angezeigt:

- Verbindungsstatus und Tailscale-IP
- Alle verbundenen Geraete im Netzwerk
- Schritt-fuer-Schritt Einrichtungsanleitung

Detaillierte Dokumentation: [REMOTE_MAINTENANCE.md](REMOTE_MAINTENANCE.md)

### Netzwerk-Anforderungen

| Port | Dienst    | Richtung  |
| ---- | --------- | --------- |
| 80   | HTTP      | Eingehend |
| 443  | HTTPS     | Eingehend |
| 2222 | SSH       | Eingehend |
| -    | Tailscale | Ausgehend |

Tailscale benoetigt nur ausgehende Verbindungen (UDP Port 41641) - keine eingehenden Ports.
Alle anderen Ports sind durch die Firewall gesperrt.
