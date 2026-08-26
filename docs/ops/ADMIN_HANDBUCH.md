# Arasul Platform - Administrationshandbuch

> Ausfuehrliche Dokumentation aller Funktionen der Arasul Platform.
> Fuer die Ersteinrichtung siehe: [Quick-Start-Guide](QUICK_START.md)

---

## Inhaltsverzeichnis

1. [Systemuebersicht](#1-systemuebersicht)
2. [Dashboard](#2-dashboard)
3. [Einstellungen](#3-einstellungen)
4. [Services-Verwaltung](#4-services-verwaltung)
5. [Datensicherung](#5-datensicherung)
6. [System-Updates](#6-system-updates)
7. [Benutzerverwaltung](#7-benutzerverwaltung)
8. [Netzwerk & Fernzugriff](#8-netzwerk--fernzugriff)

---

## 1. Systemuebersicht

Arasul laeuft auf einem NVIDIA Jetson AGX Orin im Unternehmen und hostet dort
interne Apps. Die Apps baut ein Partner oder ein technisch versierter Mensch im
Unternehmen mit dem Ara-Kit und rollt sie auf das Geraet; Mitarbeiter melden
sich mit E-Mail und Passwort an und sehen die Apps, die ein Admin ihnen
freigegeben hat. Das Geraet bietet:

- **Lokale KI:** Sprachmodelle laufen auf dem Geraet, keine Cloud erforderlich
- **Flows:** Agentenflows mit Werkzeugen und nachvollziehbaren Laeufen, Teil
  einer App, gestartet ueber die API
- **Automatische Sicherung:** Taegliche Backups aller Daten
- **Offline-faehig:** Funktioniert ohne Internetverbindung

Das App-Modell (Manifest, Zuweisung an Mitarbeiter, Freigaben) kommt mit den
Phasen C und D des Umbaus vom 26.08.2026; bis dahin zeigt die Oberflaeche
Modelle und Einstellungen.

### Zugriff

| Dienst          | Adresse                    |
| --------------- | -------------------------- |
| Web-Oberflaeche | `https://<hostname>.local` |
| SSH-Zugang      | `ssh -p 2222 arasul@<ip>`  |

### Die Oberflaeche

Die Oberflaeche nach der Anmeldung ist ein Dreispalten-Raster in drei Themes
(Schwarz · Dunkel · Hell). Das Theme wird unter **Einstellungen →
Erscheinungsbild** gewaehlt. Alle Flaechen (Sidebar, Mitte, rechte Spalte)
teilen denselben Hintergrund; getrennt wird nur durch feine Linien. Im
Zielbild stehen links die Apps, in der Mitte Dashboard oder App, rechts
Notizen (Phasen D1 und D2); heute ist die linke Spalte ohne gewaehlte Ansicht
leer, die rechte Spalte ganz.

- **Activity Bar (ganz links):** schmale Icon-Leiste mit der Ansicht
  **Modelle**, ganz unten **Einstellungen** (inkl. System-Status).
- **Sidebar (links):** zeigt die gewaehlte Ansicht: Modell-Filter oder die
  Bereiche der Einstellungen. Ohne Auswahl bleibt sie leer. Ein erneuter
  Klick auf die aktive Ansicht klappt sie ein (auch `Strg/⌘ + B`).
- **Mitte (Tab-Leiste):** mehrere Tabs parallel (Modelle, Einstellungen),
  schliessbar, werden nach einem Neuladen wiederhergestellt.
- **Rechte Spalte:** leer, ein- und ausblendbar.
- **Layout-Schalter (oben rechts, neben Einstellungen):** **zwei** Symbole
  blenden die Sidebar und die rechte Spalte unabhaengig ein/aus.
- **Statusleiste (unten):** Verbindung und Version, das aktuell geladene
  KI-Modell samt belegtem KI-RAM (klickbar: Standardmodell waehlen), laufende
  Modell-Downloads.
- **Modelle:** in der Mitte der durchsuchbare **Store**; ein Klick auf eine
  Karte oeffnet die Detailseite mit allen Aktionen (installieren, aktivieren,
  als Standard, loeschen). Ueber dem Modell-Raster steht ein
  **Modell-Dashboard**: KI-RAM-Balken (ein Segment je geladenem Modell),
  die aktuell im RAM geladenen Modelle mit **Entladen**, das **Standardmodell**
  und **In den RAM laden** mit Live-Statusmeldungen.
- Die Shell ist die einzige Ansicht: `/` landet nach dem Login immer auf
  `/workspace`.

---

## 2. Dashboard

Das Dashboard ist bewusst schlank und zeigt auf einen Blick:

- **System-Status:** RAM, Swap, Speicherplatz, Temperatur (mit Verlauf) sowie
  ein Dienste-Health-Widget mit Ampel-Anzeige (gruen/gelb/rot)

### Status-Farben

| Farbe | Bedeutung                          |
| ----- | ---------------------------------- |
| Gruen | Alles in Ordnung                   |
| Gelb  | Warnung - System funktioniert noch |
| Rot   | Kritisch - Aktion erforderlich     |

---

## 3. Einstellungen

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

### Sicherheit

- **Passwort aendern:** Unter Einstellungen > Sicherheit (Dashboard-Passwort)
- **Passwort vergessen:** Es gibt bewusst keinen Self-Service-Reset. Ein ausgesperrter
  Administrator setzt das Passwort per Operator-CLI zurueck: `scripts/security/reset-password.sh`
- **Abmelden / Von allen Geraeten abmelden:** beide mit Sicherheitsabfrage
- **Session-Dauer:** Automatisches Abmelden nach Inaktivitaet

---

## 4. Services-Verwaltung

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

## 5. Datensicherung

### Automatische Backups

Das System erstellt automatisch taegliche Backups um 02:00 Uhr:

- **PostgreSQL-Datenbank:** Alle Einstellungen, Benutzer, Flow-Laeufe
- **Flows:** Die Flow-Definitionen unter `data/flows/`

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

## 5a. Werksreset

**Einstellungen → System → Werksreset**

Zwei Stufen. Beide sind endgueltig, es gibt kein Rueckgaengig. Was hier
verschwindet, steht danach nur noch in einer Sicherung (Abschnitt 5).

| Stufe                 | Weg                                                    | Bleibt                                        |
| --------------------- | ------------------------------------------------------ | --------------------------------------------- |
| Inhalte zuruecksetzen | Modell-Auftraege, Flow-Laeufe                          | Zugang, Flows, Einstellungen, Modelle         |
| Auslieferungszustand  | zusaetzlich Zugangsdaten, Flows, Protokolle, Messwerte | nur der Werkskatalog (Modelle, Warnschwellen) |

Optional laesst sich zusaetzlich ankreuzen, dass auch die heruntergeladenen
Modelle geloescht werden. Ohne Modell kann das Geraet bis zum naechsten Download
nicht antworten.

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

## 6. System-Updates

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

## 7. Benutzerverwaltung

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

## 8. Netzwerk & Fernzugriff

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
