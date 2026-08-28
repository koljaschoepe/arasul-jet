# Arasul Platform - Administrationshandbuch

> Ausfuehrliche Dokumentation aller Funktionen der Arasul Platform.
> Fuer die Ersteinrichtung siehe: [Quick-Start-Guide](QUICK_START.md)

---

## Inhaltsverzeichnis

1. [Systemuebersicht](#1-systemuebersicht)
2. [Auslastung](#2-auslastung)
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

Das App-Modell steht seit Phase C3 (27.08.2026): eine App bringt ein Manifest
`app.json` mit, liegt am Geraet unter `/arasul/apps/<id>/<version>/` und ist
unter `/apps/<id>/` erreichbar. Die Oberflaeche dafuer kommt mit den D-Phasen;
bis dahin ist der Weg die Schnittstelle, unten beschrieben.

### Zugriff

| Dienst          | Adresse                                               |
| --------------- | ----------------------------------------------------- |
| Web-Oberflaeche | `https://arasul/` (Rueckfall `https://arasul.local/`) |
| SSH-Zugang      | `ssh -p 2222 arasul@<ip>`                             |

Der nackte Name kommt vom DHCP-Hostnamen, den der Router aufloest; `.local`
ist der Rueckfall ueber mDNS. Beide stehen im Zertifikat des Geraets, ebenso
jede seiner IP-Adressen. Heisst das Geraet anders, gilt sein Name.

### Die Oberflaeche

Die Oberflaeche nach der Anmeldung ist ein Dreispalten-Raster in drei Themes
(Schwarz · Dunkel · Hell). Das Theme wird unter **Einstellungen →
Erscheinungsbild** gewaehlt. Alle Flaechen (Sidebar, Mitte, rechte Spalte)
teilen denselben Hintergrund; getrennt wird nur durch feine Linien. Links
stehen die Apps, in der Mitte die Uebersicht oder eine App, rechts die Notizen.

- **Activity Bar (ganz links):** schmale Icon-Leiste mit **Apps** ganz oben.
  Fuer Administratoren zusaetzlich **Modelle** und ganz unten
  **Einstellungen** (inkl. System-Status).
- **Sidebar (links):** zeigt die gewaehlte Ansicht: die eigenen Apps (Vorgabe),
  Modell-Filter oder die Bereiche der Einstellungen. Ein erneuter Klick auf die
  aktive Ansicht klappt sie ein (auch `Strg/⌘ + B`).
- **Mitte (Tab-Leiste):** mehrere Tabs parallel (Uebersicht, Apps, Modelle,
  Einstellungen), schliessbar, werden nach einem Neuladen wiederhergestellt.
  Eine App laeuft in ihrem eigenen Rahmen; Test- und Livestand sind zwei Tabs.
  Die **Uebersicht** zeigt oben die **Freigaben, die auf eine Entscheidung
  warten** (siehe unten), darunter die eigenen Apps als Kacheln. Eine Kachel
  mit dem Zeichen **Test** ist ein Teststand: diese Fassung ist noch nicht
  live.
- **Rechte Spalte:** die **Notizen** — ein Zettel je Mensch, der sich nach
  einer Sekunde Ruhe von selbst speichert. Ein- und ausblendbar.
- **Layout-Schalter (oben rechts):** **zwei** Symbole blenden die Sidebar und
  die Notizen unabhaengig ein/aus. Daneben das **Benutzermenue** (Name, Rolle,
  Abmelden) und — nur fuer Administratoren — die Einstellungen.
- **Statusleiste (unten):** Verbindung und Version, das aktuell geladene
  KI-Modell samt belegtem KI-RAM (klickbar: Standardmodell waehlen), laufende
  Modell-Downloads und rechts die Zahl der **Freigaben, die auf eine
  Entscheidung warten**.

**Was ein Mitarbeiter sieht.** Die Apps, die ein Administrator ihm freigegeben
hat, die Uebersicht mit seinen offenen Freigaben, seine Notizen und sein Konto.
Modelle, Benutzer, Datensicherung und Einstellungen sind fuer ihn nicht da —
und zwar nicht nur unsichtbar: das Geraet weist ihn auf jedem dieser Wege ab,
auch wenn er die Adresse kennt.

### Eine Freigabe entscheiden

Ein Flow einer App kann anhalten und um eine Freigabe bitten (etwa: „Diesen
Wochenbericht versenden?"). Der Lauf steht dann still, bis ein Mensch
entscheidet.

Wo: auf der **Uebersicht**, ganz oben. Jede Anfrage ist eine Karte mit dem
Titel, dem Zusammenhang, den der Flow mitgibt, und der verbleibenden Zeit.

- **Bestaetigen** — der Lauf laeuft ab der angehaltenen Stelle weiter.
- **Ablehnen** — es klappt ein Feld auf; ohne Begruendung geht der Knopf nicht.
  Der Lauf endet, und die Begruendung wird sein Grund.
- **Nichts tun** — nach Ablauf der Frist endet der Lauf von selbst. Die Frist
  steht am Flow, in der Regel ein Tag.

**Wer darf entscheiden?** Jeder, dem die App freigegeben ist — Administrator
und Mitarbeiter gleichermassen. Freigeben ist Arbeit, keine Verwaltung. Der
Flow nennt keine Person; er beschreibt die Sache.

Die Karte verschwindet, sobald entschieden ist. Steht danach eine Meldung, dass
der Lauf nicht mehr fortgesetzt wird, wurde das Geraet zwischendurch neu
gestartet: die Entscheidung ist festgehalten, den Lauf muss jemand neu
anstossen.

- **Modelle (nur Administrator):** in der Mitte die **Kurzliste** des Geraets,
  vier Modelle und keine Suche daneben: eines fuer die Flows
  (`hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS`, der Standard), ein kleines
  schnelles (`gemma4:e4b`), eines fuer Einbettungen (`nomic-embed-text`) und
  eines fuer Bilder und eingescannten Text (`llava-phi3`). Je Zeile steht,
  wofuer das Modell da ist, wie gross es ist und ob es am Geraet liegt; die
  Knoepfe sind **Laden**, **Standard**, **In den Speicher** bzw. **Aus dem
  Speicher** und **Entfernen**. Darueber vier Kacheln: KI-RAM, das Modell im
  Speicher, der Standard der Flows und wie viele der vier am Geraet liegen.
  Geladen wird nur, was in der Kurzliste steht; einen Weg daran vorbei gibt es
  nicht.
- Die Shell ist die einzige Ansicht: `/` landet nach dem Login immer auf
  `/workspace`.

---

## 2. Auslastung

**Einstellungen → System → Auslastung** zeigt auf einen Blick, was das Geraet
gerade tut:

- **Kacheln:** Arbeitsspeicher, Auslagerung, Speicherplatz und Temperatur, mit
  dem Hinweis, wie viel vom Arbeitsspeicher fuer KI-Modelle reserviert ist
- **Verlauf:** Arbeitsspeicher und Auslagerung in Prozent, Temperatur in Grad
  auf einer eigenen Achse, wahlweise ueber 1, 6, 12 oder 24 Stunden
- **System-Gesundheit:** eine Ampel aus letzter Sicherung,
  Wiederherstellungstest, Diensten und offenen Alarmen

### Status-Farben

| Farbe | Bedeutung                          |
| ----- | ---------------------------------- |
| Gruen | Alles in Ordnung                   |
| Gelb  | Warnung - System funktioniert noch |
| Rot   | Kritisch - Aktion erforderlich     |

---

## 3. Einstellungen

Die Einstellungen sind in **7 Reiter** gegliedert (frueher 9, verwandte Bereiche
wurden zusammengelegt, damit die Navigation uebersichtlich bleibt; „Mitarbeiter"
kam mit der neuen Oberflaeche dazu):

| Reiter          | Inhalt                                                          |
| --------------- | --------------------------------------------------------------- |
| **Allgemein**   | Systeminformationen, Theme                                      |
| **Mitarbeiter** | Konten anlegen, Startpasswort setzen, App-Freigaben             |
| **KI**          | Zwei Unterbereiche: _Firmenprofil & Kontext_ und _Sprachmodell_ |
| **Sicherheit**  | Passwort aendern, Abmelden / von allen Geraeten abmelden        |
| **Datenschutz** | DSGVO-Auskunft (Export) und Konto-Loeschung                     |
| **System**      | Drei Unterbereiche: _Services_, _Updates_, _Self-Healing_       |
| **Fernzugriff** | Tailscale-VPN und Remote-Zugriff                                |

Der Reiter **Mitarbeiter** ist in Kapitel 7 beschrieben, weil dort auch die
Wege ueber die Schnittstelle stehen.

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
- **Geraetezertifikat herunterladen:** Die eine Aufgabe, die JEDER Admin einmal
  erledigen sollte. Das Geraet stellt sein TLS-Zertifikat selbst aus; solange
  seine CA im Haus niemand kennt, warnt jeder Browser. Die Datei einmal
  herunterladen und auf den Rechnern der Firma installieren, dann hoert die
  Warnung auf. Anleitung fuer Windows, macOS, iOS und Android:
  [NETZNAME_UND_ZERTIFIKAT.md](NETZNAME_UND_ZERTIFIKAT.md)

---

## 4. Services-Verwaltung

### Dienste anzeigen

1. Navigieren Sie zu **Einstellungen → System → Dienste**
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

Das Geraet sichert jede Nacht um 02:00 Uhr **vier** Dinge:

| Was             | Warum es fehlen wuerde                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Datenbank       | Mitarbeiter, Rollen, Apps und Staende, Freigaben, Flow-Laeufe, Einstellungen                        |
| Pakete der Apps | Woraus das Geraet die App-Container baut. Ohne sie nennt die Datenbank Apps, die es nicht mehr gibt |
| Flow-Dateien    | Was jemand am Geraet selbst geschrieben hat                                                         |
| Konfiguration   | Ohne sie faehrt auf einem leeren Geraet kein Container hoch                                         |

**Eine Kopie ausserhalb des Geraets** (USB-Stick oder eine Freigabe im
Firmennetz) legt der Dienst dazu, sobald einer angesteckt ist. Kein Cloud-Ziel:
die Daten bleiben im Haus. Steckt keiner, sichert das Geraet weiter lokal und
sagt in der Uebersicht, wann zuletzt eine Kopie ausser Haus entstanden ist.

**Der Sicherungsschluessel gehoert nicht auf das Geraet.** Er liegt unter
`config/secrets/backup_encryption_key` und ist ausdruecklich NICHT im Archiv:
wer eine Sicherung oeffnen will, braucht ihn vorher. Eine Kopie davon gehoert
in den Safe. Ohne ihn ist nach einem Geraeteverlust jede Sicherung Papier.

### Manuelles Backup

**Einstellungen → System → Sicherung → Jetzt sichern.** Die Sicherung laeuft
sofort und braucht am Geraet einige Minuten; danach steht die Meldung, dass sie
fertig ist, und die Liste darunter zeigt die neue Datei mit Datum und Groesse.
Solange sie laeuft, laesst das Geraet nichts Zweites zu.

Auf derselben Seite steht ausserdem:

- **Zustand:** ob das Geraet wirklich sichert (nicht „koennte", sondern „hat"),
  wann zuletzt und wie gross.
- **Kopie ausserhalb:** Datum und Groesse der letzten Kopie AUSSER HAUS. Steht
  dort „noch nie", liegt jede Sicherung nur auf diesem Geraet und ueberlebt es
  nicht.
- **Wiederherstellungstest:** ein Knopf, der die neueste Sicherung in eine
  Wegwerf-Datenbank spielt und nachzaehlt, ohne den Betrieb anzufassen.

Ueber die Befehlszeile geht es weiterhin:

```bash
ssh -p 2222 arasul@<jetson-ip>
docker exec backup-service /usr/local/bin/backup.sh
```

### Backup wiederherstellen

Das Zurueckspielen ersetzt die ganze Datenbank und steht deshalb bewusst NICHT
als Knopf im Dashboard. Es geht ueber die Befehlszeile oder ueber
`POST /api/backup/wiederherstellung` mit ausdruecklicher Bestaetigung.

```bash
# Erst schauen, ob sich die neueste Sicherung lesen laesst — ohne etwas anzufassen:
docker exec backup-service /usr/local/bin/wiederherstellen.sh --probe

# Zurueckspielen: Datenbank, Pakete der Apps, Flow-Dateien
docker exec backup-service /usr/local/bin/wiederherstellen.sh

# Eine bestimmte Sicherung:
docker exec backup-service /usr/local/bin/wiederherstellen.sh \
  --datei arasul_db_20260827_020054.sql.gz
```

Danach muessen die App-Container aus ihren Paketen neu gebaut werden. Ueber die
Schnittstelle macht das Geraet beides in einem Aufruf; der Weg steht in
[BACKUP_SYSTEM.md](BACKUP_SYSTEM.md#der-weg-zurück).

**Was vorher da war, geht nicht verloren:** vor dem Zurueckspielen legt das
Geraet einen Abzug des jetzigen Standes unter
`data/backups/vor_wiederherstellung/` ab.

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

**Einstellungen → System → Aktualisierungen.** Ganz oben steht, welche Fassung
dieses Geraet traegt. Sie kommt aus dem Bau (Tag oder Datum plus Kurz-SHA);
sagt die Seite „Vorserie", kennt das Geraet seine eigene Fassung nicht, und
dann laesst sich auch nicht entscheiden, ob ein Paket neuer ist.

**Wenn dieses Geraet nicht ueber die Oberflaeche einspielen kann, sagt es das.**
Der Weg dahinter braucht ein `docker`-Programm im Backend-Container, und das
gibt es dort nicht; aktualisiert wird dann ueber den Deploy
(`scripts/deploy/deploy-local.sh`) oder `./arasul update` am Geraet selbst.
Statt Knoepfen, die zuverlaessig scheitern, steht der Grund da.

### Paket einspielen (wenn der Weg offen ist)

1. Stecken Sie den USB-Stick mit dem Paket ein, oder waehlen Sie die
   `.araupdate`-Datei und die zugehoerige `.sig` von Hand
2. **Hochladen und pruefen** — Signatur und Manifest werden geprueft
3. **Einspielen**, und die Seite offen lassen: das Geraet startet sich dabei
   selbst neu, und die Verbindung bricht kurz weg. Das ist erwartbar.

### Verlauf

Darunter steht, was bisher eingespielt wurde: Fassung vorher und nachher,
Ausgang, Datum, Quelle und Dauer.

### Hinweise

- Updates werden digital signiert und vor der Installation verifiziert
- Bei Problemen wird automatisch ein Rollback durchgefuehrt
- Vor dem Einspielen sichert das Geraet selbst (Abschnitt 5)

---

## 7. Benutzerverwaltung

### Zwei Rollen

Das Geraet kennt zwei Rollen. Der **Administrator** verwaltet Mitarbeiter,
Apps, Freigaben, Modelle und den Betrieb. Der **Mitarbeiter** meldet sich mit
E-Mail-Adresse oder Benutzername und Passwort an und sieht, was ihm freigegeben
ist, dazu seine eigenen Flow-Laeufe. Alles andere beantwortet das Geraet mit
„Diese Funktion ist dem Administrator vorbehalten" (HTTP 403).

### Benutzer anlegen, sperren und loeschen

**In der Oberflaeche: Einstellungen > Mitarbeiter.** Das Zahnrad unten in der
Aktivitaetsleiste links, dann in der Sektionsliste „Mitarbeiter". Die Seite
zeigt jeden Menschen am Geraet mit Rolle, Zustand und der letzten Anmeldung.
Rechts an jeder Zeile stehen drei Handgriffe: Startpasswort setzen, stilllegen
oder wieder zulassen, loeschen. Oben rechts legt „Menschen anlegen" einen
neuen an.

Die Spalte **Passwort** sagt „Startpasswort", solange das aktuelle Passwort von
einem Administrator gesetzt wurde. Der Mensch wechselt es beim naechsten
Anmelden, danach steht dort „eigenes". Sie sehen daran auch, ob er sich
ueberhaupt schon angemeldet hat.

Am eigenen Konto stehen keine Handgriffe. Ihr eigenes Passwort wechseln Sie
unter **Einstellungen > Sicherheit**, geloescht wird das eigene Konto ueber
**Einstellungen > Datenschutz**; das Geraet lehnt beide Wege hier ohnehin ab.

Dieselben Handgriffe ueber die Schnittstelle, angemeldet als Administrator:

```bash
# anlegen (Rolle admin oder mitarbeiter)
curl -sk -X POST https://<geraet>/api/benutzer \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"username":"mia","password":"Startpasswort1!","email":"mia@firma.de","rolle":"mitarbeiter"}'

# auflisten
curl -sk https://<geraet>/api/benutzer -H "authorization: Bearer $TOKEN"

# Passwort setzen, wenn jemand seines vergessen hat
curl -sk -X PUT https://<geraet>/api/benutzer/<id>/passwort \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"password":"Neues-Startpasswort1"}'

# stilllegen, spaeter wieder zulassen
curl -sk -X PUT https://<geraet>/api/benutzer/<id>/aktiv \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"aktiv":false}'

# loeschen (samt Flow-Laeufen, API-Schluesseln, Freigaben und Sitzungen)
curl -sk -X DELETE https://<geraet>/api/benutzer/<id> -H "authorization: Bearer $TOKEN"
```

**Stilllegen ist nicht loeschen.** Wer stillgelegt ist, kommt nicht mehr herein
und seine offenen Sitzungen enden sofort; seine Laeufe und Protokolle bleiben
stehen. Das ist der richtige erste Schritt, wenn jemand das Unternehmen
verlaesst: was mit seinen Daten geschehen soll, entscheiden Sie danach in Ruhe.

Ein gesetztes Passwort beendet ebenfalls alle Sitzungen des Betroffenen. Er
meldet sich damit einmal an und waehlt danach unter **Einstellungen >
Sicherheit** sein eigenes; erst dort gelten die Passwort-Anforderungen unten.

Fuer das EIGENE Konto ist dieser Weg gesperrt. Ihr eigenes Passwort wechseln
Sie unter **Einstellungen > Sicherheit**, und dort gelten die Anforderungen.

Der letzte aktive Administrator laesst sich weder loeschen noch stilllegen; sein
Zugang bleibt, sonst waere das Geraet unbedienbar. Sich selbst kann ausserdem
niemand stilllegen.

### Apps fuer Mitarbeiter freigeben

Ein Mitarbeiter sieht nur, was ihm freigegeben ist. Eine Freigabe ist ein Paar
aus App-Kennung und Mitarbeiter.

**In der Oberflaeche: Einstellungen > Mitarbeiter, Abschnitt „Freigaben".**
Eine Zeile je Mensch, eine Spalte je App, in der Zelle ein Haeckchen. Setzen
heisst freigeben, wegnehmen heisst zuruecknehmen; beides wirkt sofort, ohne
Speichern-Knopf. Unter einem gesetzten Haeckchen steht der Stand: „Live" ist
der Normalfall, ein Klick darauf macht den Menschen zum **Tester** („Test", er
sieht dann zusaetzlich den Teststand), ein weiterer Klick zurueck.

Die Matrix fuehrt auch die Administratoren auf, und das ist kein Versehen: die
Rolle sagt, wer verwaltet, nicht wer arbeitet. Wer eine App benutzen will,
braucht sie freigegeben, auch als Administrator.

Dieselben Handgriffe ueber die Schnittstelle:

```bash
# freigeben
curl -sk -X POST https://<geraet>/api/freigaben \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"app_id":"urlaub","benutzer_id":7}'

# sehen, wer welche App hat
curl -sk "https://<geraet>/api/freigaben?benutzer_id=7" -H "authorization: Bearer $TOKEN"

# zuruecknehmen
curl -sk -X DELETE https://<geraet>/api/freigaben/urlaub/7 -H "authorization: Bearer $TOKEN"
```

Dieselbe Freigabe zweimal zu setzen ist kein Fehler, sondern derselbe Zustand.
Loeschen Sie einen Benutzer, fallen seine Freigaben mit ihm weg. Die
App-Kennung ist die `id` aus dem Manifest `app.json`; eine App, die es am Geraet
nicht gibt, laesst sich nicht freigeben.

**Tester.** Wer eine App vor allen anderen sehen soll, bekommt die Freigabe mit
`"stand":"test"` und sieht damit zusaetzlich den Teststand unter
`/apps/<id>/test/`. Mit `"stand":"live"` wird er wieder normaler Nutzer; eine
zweite Freigabe entsteht dabei nicht.

Was ein Mitarbeiter selbst sieht, steht unter `GET /api/apps/meine` — das ist
die einzige App-Auskunft, die er selbst abrufen darf.

### Apps am Geraet

Eine App kommt vom Partner: er baut sie mit dem Ara-Kit und legt sie unter
`/arasul/apps/<id>/<version>/` ab. Danach bringen Sie eine Version in einen
Stand. Es gibt zwei je App:

| Stand  | Wer sieht ihn       | Adresse                            |
| ------ | ------------------- | ---------------------------------- |
| `live` | jeder Freigegebene  | `https://<geraet>/apps/<id>/`      |
| `test` | nur benannte Tester | `https://<geraet>/apps/<id>/test/` |

```bash
# was am Geraet liegt
curl -sk https://<geraet>/api/apps -H "authorization: Bearer $TOKEN"

# eine Version in den Teststand (ohne "stand" ist es der Teststand)
curl -sk -X POST https://<geraet>/api/apps/urlaub/einspielen \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"version":"1.2.0","stand":"test"}'

# spaeter dieselbe Version live
curl -sk -X POST https://<geraet>/api/apps/urlaub/einspielen \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"version":"1.2.0","stand":"live"}'

# wenn eine App haengt: die letzten Zeilen ihres Backends
curl -sk "https://<geraet>/api/apps/urlaub/logs?stand=live&zeilen=100" \
  -H "authorization: Bearer $TOKEN"

# App entfernen (beide Staende, beide Container, alle Freigaben)
curl -sk -X DELETE https://<geraet>/api/apps/urlaub -H "authorization: Bearer $TOKEN"
```

`GET /api/apps/<id>` sagt Ihnen auch, was die App verlangt und was davon da ist:
welche Sprachmodelle sie braucht und welche Flows. Fehlt eines, laeuft die App
trotzdem an — das Geraet installiert nichts von allein nach.

#### Dasselbe im Browser

Seit August 2026 muessen Sie dafuer keine Befehlszeile mehr aufmachen.
**Einstellungen → Apps** zeigt jede App am Geraet mit beiden Fassungen; ein
Klick darauf oeffnet ihre Ansicht:

| Abschnitt   | Was dort steht                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Staende** | Version je Stand, ob der Container laeuft und ob er sich gesund meldet. Darunter **Live schalten** (nimmt die Version aus dem Teststand) und **Zurueck** (die, die vorher live war). |
| **Tester**  | Wer diese App sieht, und wer davon zusaetzlich den Teststand bekommt.                                                                                                                |
| **Flows**   | Was die App kann, und mit welchem Modell. Ein Klick oeffnet die Flow-Datei samt Auftrag an das Modell.                                                                               |
| **Laeufe**  | Was die App getan hat. Ein Klick oeffnet den Lauf mit seinen Schritten und dem Gedankengang dazwischen.                                                                              |
| **Logs**    | Die letzten 200 Zeilen des Containers, auf Klick.                                                                                                                                    |

**Das Modell eines Flows umstellen.** Der Knopf „Modell" neben einem Flow
fragt, womit er rechnen soll: mit dem, was im Paket steht, mit einem Modell von
diesem Geraet, oder mit einem bei einem Anbieter draussen. Fuer den letzten Fall
brauchen Sie den Namen des Anbieters, den Modellnamen dort, die Adresse (die
OpenAI-kompatible Basis-Adresse, z. B. `https://api.openai.com/v1`) und
gegebenenfalls einen Schluessel.

> **Der Prompt dieses Flows verlaesst dann das Haus.** Alles andere an Arasul
> laeuft lokal; ein Flow mit einem externen Modell ist die eine Ausnahme, und
> Sie treffen sie bewusst, je Flow. Wer sie zuruecknehmen will, waehlt wieder
> „Aus dem Paket" — das raeumt auch den hinterlegten Schluessel weg.

Der Schluessel wird verschluesselt abgelegt und danach nie wieder angezeigt;
sichtbar bleiben nur seine letzten vier Zeichen. Wollen Sie nur den Modellnamen
aendern, lassen Sie das Schluesselfeld leer — der hinterlegte bleibt stehen.

### Anmelden

Angemeldet wird mit **Benutzername oder E-Mail-Adresse** und Passwort. Beides
funktioniert; welches von beiden jemand eintippt, ist gleich.

Zehn Anmeldeversuche je Viertelstunde und Absender-IP. Wer diese Zahl reisst,
bekommt eine Meldung, die das sagt, und wartet eine Viertelstunde.

### Startpasswort wechseln

Wenn Sie einem Mitarbeiter ein Passwort **setzen** (beim Anlegen oder ueber
**Benutzer > Passwort setzen**), kennen zwei Menschen es: er und Sie. Das
Geraet merkt sich das. Bei seiner naechsten Anmeldung kommt er deshalb nicht in
die Oberflaeche, sondern auf eine Seite, die ein neues Passwort verlangt — ohne
„Spaeter"; der einzige Weg daneben ist Abmelden. Danach kennt es nur noch er.

Dasselbe gilt fuer das Startpasswort des Administrators, das die Installation
einmal auf dem Bildschirm zeigt.

Nach dem Wechsel sind **alle** Sitzungen des Betroffenen beendet; er meldet
sich einmal neu an. Das ist der Zweck: wer wechselt, weil ein Zweiter das alte
Passwort kannte, will genau das.

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

- Dashboard: `https://<geraet>.<tailnet>.ts.net` oder `https://<tailscale-ip>`
  (beides von ueberall erreichbar). Es antwortet dasselbe Traefik mit demselben
  Zertifikat wie im Firmennetz; die Browserwarnung geht weg, sobald das
  Geraetezertifikat verteilt ist (Einstellungen > Sicherheit).
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
