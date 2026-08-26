# Arasul Platform - Administrationshandbuch

> Ausfuehrliche Dokumentation aller Funktionen der Arasul Platform.
> Fuer die Ersteinrichtung siehe: [Quick-Start-Guide](QUICK_START.md)

---

## Inhaltsverzeichnis

1. [Systemuebersicht](#1-systemuebersicht)
2. [Dashboard](#2-dashboard)
3. [Chat / KI-Assistent](#3-chat--ki-assistent)
4. [Dokumente & RAG](#4-dokumente--rag)
5. [Workspace](#5-workspace)
6. [Automation (n8n)](#6-automation)
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
- - **Workspace:** Eigener Arbeitsordner samt Container, mit Netzwerkmodus und
    automatisch indiziertem Wissensbereich
- **Automation (n8n):** Workflows bauen und Abläufe automatisieren
- **Automatische Sicherung:** Taegliche Backups aller Daten
- **Offline-faehig:** Funktioniert ohne Internetverbindung

### Zugriff

| Dienst          | Adresse                    |
| --------------- | -------------------------- |
| Web-Oberflaeche | `https://<hostname>.local` |
| SSH-Zugang      | `ssh -p 2222 arasul@<ip>`  |

### Workspace (Oberflaeche)

Die Standard-Oberflaeche nach der Anmeldung ist der **Workspace**, ein
Dreispalten-Raster in drei Themes (Schwarz · Dunkel · Hell). Das Theme wird
ausschliesslich unter **Einstellungen → Erscheinungsbild** gewaehlt. Alle
Flaechen (Sidebar, Mitte, rechte Spalte) teilen denselben Hintergrund;
getrennt wird nur durch feine Linien.

> **Stand 26.08.2026 (Phase B2 des Umbaus):** Datei-Explorer, Editor,
> Agent-Chat, Terminal und Sandbox-Ansichten sind aus der Oberflaeche
> entfernt. Die linke Spalte ist ohne gewaehlte Ansicht leer, die rechte
> Spalte ganz. Was dort kuenftig steht, legen die Phasen D1 und D2 fest.

- **Activity Bar (ganz links):** schmale Icon-Leiste mit den Ansichten
  **Modelle · Erweiterungen · Flows**, darunter die aktivierten
  App-Erweiterungen (z. B. Automation/n8n), ganz unten **Einstellungen**
  (inkl. System-Status).
- **Sidebar (links):** zeigt die gewaehlte Ansicht: Modell-Filter,
  Erweiterungs-Suche, Flow-Liste oder die Bereiche der Einstellungen. Ohne
  Auswahl bleibt sie leer. Ein erneuter Klick auf die aktive Ansicht klappt
  sie ein (auch `Strg/⌘ + B`).
- **Mitte (Tab-Leiste):** mehrere Tabs parallel (Modelle, Erweiterungen,
  Flow-Editor, Automation, Einstellungen), schliessbar, werden nach einem
  Neuladen wiederhergestellt.
- **Rechte Spalte:** leer, ein- und ausblendbar.
- **Layout-Schalter (oben rechts, neben Einstellungen):** **zwei** Symbole
  blenden die Sidebar und die rechte Spalte unabhaengig ein/aus.
- **Statusleiste (unten):** Verbindung und Version, das aktuell geladene
  KI-Modell samt belegtem KI-RAM (klickbar: Standardmodell waehlen), laufende
  Modell-Downloads.
- **Modelle und Erweiterungen:** in der Mitte der durchsuchbare **Store** mit
  zwei eigenen Tabs (Modelle · Erweiterungen); ein Klick oeffnet die
  Detailseite mit allen Aktionen, KI-Modelle installieren/aktivieren,
  Plattform-Apps (n8n) ein-/ausblenden. Ueber dem Modell-Raster steht ein
  **Modell-Dashboard**: KI-RAM-Balken (ein Segment je geladenem Modell),
  die aktuell im RAM geladenen Modelle mit **Entladen**, das **Standardmodell**
  und **In den RAM laden** mit Live-Statusmeldungen. Deaktivieren einer App
  wirkt sofort (ohne Neuladen): das Symbol verschwindet aus der Activity Bar
  und offene Tabs der App werden geschlossen.
- Die Workspace-Shell ist die einzige Ansicht: `/` landet nach dem Login
  immer auf `/workspace`.

---

## 2. Dashboard

Das Dashboard ist bewusst schlank und zeigt auf einen Blick:

- **System-Status:** RAM, Swap, Speicherplatz, Temperatur (mit Verlauf) sowie
  ein Dienste-Health-Widget mit Ampel-Anzeige (gruen/gelb/rot)
- **Automatisierungen:** die letzten n8n-Workflow-Laeufe mit Status und
  Zeitpunkt; „n8n oeffnen" springt direkt in den Automation-Tab
- **Chat starten/Dokument hochladen/Projekt oeffnen** sind als Aktions-Kacheln
  entfallen, Chat lebt im rechten Panel, Upload im Explorer der Sidebar.

### Status-Farben

| Farbe | Bedeutung                          |
| ----- | ---------------------------------- |
| Gruen | Alles in Ordnung                   |
| Gelb  | Warnung - System funktioniert noch |
| Rot   | Kritisch - Aktion erforderlich     |

---

## 3. Chat / KI-Assistent

Der Agent-Chat der Oberflaeche ist am 26.08.2026 (Phase B2 des Umbaus)
entfernt worden. Die Endpunkte `/api/chats` und `/api/llm/chat` laufen bis
Phase B4 bzw. B6 weiter, ohne Oberflaeche; die externe API bleibt
(siehe [API_REFERENCE.md](../api/API_REFERENCE.md)). Wie KI-Antworten im
Zielbild ueber Flows laufen, legt Phase D4 fest.

---

## 4. Dokumente & RAG

Dokumenten-Upload und Wissensraeume haben seit dem 26.08.2026 (Phase B2)
keine Oberflaeche mehr; der Datei-Explorer, ueber den hochgeladen wurde, ist
entfernt. Die Endpunkte unter `/api/documents` und `/api/spaces` laufen bis
Phase B3/B4 weiter. Es gibt kein Vektor-RAG; gesucht wird ueber den
Textlayer in PostgreSQL.

---

<a id="5-workspace"></a>

## 5. Workspace

Ein **Workspace** (Sandbox) ist im Backend ein Ordner plus ein Container mit
einem Besitzer und einem **Netzwerkmodus** („Was darf dieser Workspace?").
Seit dem 26.08.2026 (Phase B2) gibt es dafuer keine Oberflaeche mehr (kein
Terminal, kein Projekt-Umschalter); die Routen laufen bis B4 weiter:

| Modus              | Zugriff                                        |
| ------------------ | ---------------------------------------------- |
| **Abgeschottet**   | Internet ja, Plattform nein (Standard)         |
| **Am System**      | interne Dienste: Datenbank / MinIO / Textlayer |
| **Voller Zugriff** | Infrastruktur, **nur Admins**                  |

Jeder Workspace hat genau einen unsichtbaren Wissensbereich („Ordner"): dort
geschriebene Dateien werden **automatisch indiziert** (kein manueller Upload).

Details: [docs/features/WORKSPACE.md](../features/WORKSPACE.md).

---

<a id="6-automation"></a>

## 6. Automation (n8n)

Öffnen Sie **Automation** in der Activity Bar, um Workflows zu bauen.

Details: [docs/integrations/N8N.md](../integrations/N8N.md).

---

## 7. Einstellungen

Die Einstellungen sind in **6 Reiter** gegliedert (frueher 9, verwandte Bereiche
wurden zusammengelegt, damit die Navigation uebersichtlich bleibt):

| Reiter          | Inhalt                                                          |
| --------------- | --------------------------------------------------------------- |
| **Allgemein**   | Systeminformationen, Theme                                      |
| **KI**          | Zwei Unterbereiche: _Firmenprofil & Kontext_ und _Sprachmodell_ |
| **Sicherheit**  | Passwort aendern, Abmelden / von allen Geraeten abmelden        |
| **Datenschutz** | DSGVO-Auskunft (Export) und Konto-Loeschung                     |
| **System**      | Drei Unterbereiche: _Services_, _Updates_, _Self-Healing_       |
| **Fernzugriff** | Tailscale-VPN und Remote-Zugriff                                |

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

### KI → Sprachmodell (Experten-Tunables)

Der Unterbereich **Einstellungen → KI → „Sprachmodell"** (nur fuer Administratoren) macht die
Feinjustierung der LLM-Standardwerte ohne Neustart moeglich. Aenderungen wirken
sofort. Alle Werte haben sinnvolle Standardwerte, nur anpassen, wenn Sie die
Auswirkung kennen.

- **LLM-Standardwerte:** `Max. Tokens (LLM-Default)` (max. Antwortlaenge),
  `Kontextfenster (LLM-Default)` (leer = Modell-Default) und `Keep-Alive`
  (wie lange ein geladenes Modell im Speicher bleibt).
- **Basis-System-Prompt:** frei editierbarer Grundtext, der jedem KI-Kontext
  vorangestellt wird. **Feld leeren = eingebauter Standard-Prompt.**

> **Agentic RAG (Plan 021):** Die frueheren Retrieval-/Rerank-/Space-Routing-Regler
> sind entfernt, die Wissenssuche laeuft agentisch (die KI durchsucht die
> Projektdateien selbst mit `dateien_suchen`/`symbol_suche`; den Inhalt einer
> benannten PDF/DOCX holt sie ueber deren Textlayer). Es gibt daher keine
> Vektor-Suche mehr zu justieren.

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
- **Textlayer (PostgreSQL):** Der ausgelesene Text der Dokumente, in Abschnitten

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

## 9a. Werksreset

**Einstellungen → System → Werksreset**

Zwei Stufen. Beide sind endgueltig, es gibt kein Rueckgaengig. Was hier
verschwindet, steht danach nur noch in einer Sicherung (Abschnitt 9).

| Stufe                 | Weg                                                                                                             | Bleibt                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Inhalte zuruecksetzen | Chats, Dokumente, Wissensraeume, Projekte, Sandboxes, Flow-Laeufe                                               | Zugang, Erweiterungen, Flows, Einstellungen, Modelle |
| Auslieferungszustand  | zusaetzlich Zugangsdaten, Erweiterungen, Flows, n8n-Workflows, hinterlegte Fremdzugaenge, Protokolle, Messwerte | nur der Werkskatalog (Modelle, Warnschwellen)        |

Optional laesst sich zusaetzlich ankreuzen, dass auch die heruntergeladenen
Modelle geloescht werden. Ohne Modell kann das Geraet bis zum naechsten Download
weder antworten noch Dokumente durchsuchen.

**Ablauf**

1. Stufe waehlen, dann **Vorschau anzeigen**. Die Vorschau zaehlt vorher ab, wie
   viele Zeilen je Bereich verschwinden. Erst danach erscheint der Ausloeser.
2. Zum Bestaetigen den **Geraetenamen** eintippen, der ueber dem Feld steht. Ein
   festes Wort wie LOESCHEN tippt man im Zweifel auch auf dem falschen Geraet.
3. **Werksreset jetzt ausfuehren**.

Nach _Auslieferungszustand_ ist kein Zugang mehr hinterlegt: beim naechsten
Aufruf startet die Ersteinrichtung, so wie bei einem neuen Geraet. Das gilt auch
ueber einen Neustart hinweg. Das alte Passwort funktioniert danach nicht mehr,
auch nicht das aus der ersten Einrichtung des Geraets.

**Wenn der Werksreset gesperrt ist:** Die Vorschau meldet dann Tabellen, die er
nicht einordnen kann, und verweigert die Ausfuehrung. Das ist Absicht. Ein
Werksreset, der etwas stehen laesst, waere schlimmer als keiner, weil er
Vollstaendigkeit behauptet. In dem Fall gehoert die neue Tabelle in
`src/services/werksreset/tabellen.js` eingeordnet.

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

- **Web:** `https://<hostname>.local` (selbstsigniertes Zertifikat, Warnung beim ersten Aufruf bestaetigen)
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
