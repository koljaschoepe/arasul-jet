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

Die Oberflaeche nach der Anmeldung zeigt links eine schmale Leiste und daneben
genau eine Ansicht, in zwei Themes (Hell · Dunkel, Vorgabe Hell). Das Theme
wird unter **Einstellungen → Erscheinungsbild** gewaehlt und gehoert dem
angemeldeten Menschen: es gilt an jedem Rechner, an dem er sich anmeldet, und
nicht nur in dem Browser, in dem er es umgestellt hat.

- **Aktivitaetsleiste (links):** ganz oben das **Haus** zur Startseite, mit der
  Zahl der Freigaben, die bei Ihnen liegen. Darunter die
  freigegebenen **Apps** als Kuerzel, der Name erscheint beim Ueberfahren; ein
  Teststand traegt einen Punkt und heisst „(Test)". Unten fest:
  **Verwaltung** (nur Administratoren), das **Zahnrad** (die persoenlichen
  Einstellungen) und das **eigene Bild** (Name und Abmelden).
- **Ansicht:** immer genau eine — die Startseite, eine App, die Einstellungen
  oder die Verwaltung. Die **Startseite** zeigt jedem oben **Für Sie**: die
  Freigaben, die bei ihm liegen (siehe unten), darunter die eigenen Apps als
  Kacheln, an einer Kachel hoechstens eine Zahl.
- **Verwaltung:** links eine eigene Leiste der Bereiche (Allgemein, Apps,
  Personen, Firmenordner, Modelle, KI, Sicherheit, Datenschutz, System, Lizenz,
  Verbindungen, Fernzugriff), daneben der gewaehlte Bereich. Im Bereich
  **System** stehen Auslastung, Dienste, Aktualisierungen, Sicherung,
  Selbstheilung und Werksreset untereinander und klappen auf. Jeder Bereich hat
  eine eigene Adresse, etwa `/workspace/verwaltung/system/sicherung`.
- **Statusleiste (unten), fuer Administratoren:** Verbindung und Version, das
  aktuell geladene KI-Modell samt belegtem KI-RAM (klickbar: Standardmodell
  waehlen), laufende Modell-Downloads und rechts die Zahl der **Freigaben, die
  auf eine Entscheidung warten**. Ein Mitarbeiter sieht dort nichts, ausser
  einem Satz, wenn das Geraet nicht antwortet.

**Was ein Mitarbeiter sieht.** Die Apps, die ein Administrator ihm freigegeben
hat, seine Einstellungen und sein Konto. Die Freigaben, die bei ihm liegen,
stehen auf seiner Startseite unter „Für Sie" (siehe unten), und an der Kachel
der App steht hoechstens ihre Zahl. Keine Fassung, keine Verbindungsanzeige, keine Zahlen der
Technik; auch keine Meldung nennt einen Fehlercode oder englischen Text.
Modelle, Benutzer, Datensicherung und Einstellungen sind fuer ihn nicht da —
und zwar nicht nur unsichtbar: das Geraet weist ihn auf jedem dieser Wege ab,
auch wenn er die Adresse kennt.

### Eine Freigabe entscheiden

Ein Flow einer App kann anhalten und um eine Freigabe bitten (etwa: „Diesen
Wochenbericht versenden?"). Der Lauf steht dann still, bis ein Mensch
entscheidet.

Wo: auf der **Startseite** unter **Für Sie**, fuer jeden, aber nur die
Freigaben, die bei ihm liegen. Jede Anfrage ist eine Karte mit der App, der
Stufe, dem Titel, dem Zusammenhang, den der Flow mitgibt, und der
verbleibenden Zeit. Darunter steht, bei wem sie liegt, und **Weitergeben an …**;
zugeklappt darunter, was bei anderen liegt, mit **Uebernehmen**.

- **Bestaetigen** — der Lauf laeuft ab der angehaltenen Stelle weiter.
- **Ablehnen** — es klappt ein Feld auf; ohne Begruendung geht der Knopf nicht.
  Der Lauf endet, und die Begruendung wird sein Grund.
- **Nichts tun** — nach Ablauf der Frist endet der Lauf von selbst. Die Frist
  steht am Flow, in der Regel ein Tag.

**Wer darf entscheiden?** Jeder, dem die App freigegeben ist — Administrator
und Mitarbeiter gleichermassen —, ausser dem, der den Vorgang eingereicht hat.
Freigeben ist Arbeit, keine Verwaltung. Der Flow nennt keine Person; er
beschreibt die Sache.

**Bei wem liegt sie?** Ein Flow kann seine Freigaben in benannten Stufen
anfordern, etwa „Pruefung" und dann „Leitung". Fuer jede Stufe setzen Sie unter
**Verwaltung > Apps > (die App) > Freigabestufen** eine **Standardperson**:
jede neue Freigabe der Stufe liegt zuerst bei ihr. Jeder mit Zugang zur App
kann sie uebernehmen oder an einen anderen mit Zugang weitergeben, etwa wenn
die Standardperson im Urlaub ist; entscheiden kann nur, bei dem sie gerade
liegt. Ohne Standardperson liegt eine neue Freigabe bei allen mit Zugang, und
die Verwaltung zeigt dazu einen Hinweis. Zur Wahl stehen nur Menschen mit
Zugang zur App; verliert die Standardperson den Zugang, faellt die Stufe auf
„alle mit Zugang" zurueck.

**Ein Feld korrigieren statt ablehnen.** Hat ein Flow etwas erkannt, etwa einen
Beleg gelesen, und war er sich bei einem Feld nicht sicher, steht auf der Karte
**Pruefen** statt Bestaetigen. Pruefen oeffnet die Freigabe ganz: links das
Original (Bild oder PDF, mit Vergroessern und Verkleinern), rechts die erkannten
Felder, was zu pruefen ist oben mit dem Zeichen **pruefen**. Felder, die die App
zum Aendern freigibt, sind Eingabefelder mit dem Vorschlag der KI darin; aendern
Sie den Wert und bestaetigen Sie, der Lauf arbeitet mit Ihrem Wert weiter. Oben
steht in einem Satz, was bisher geschah, etwa welche Stufe schon bestaetigt hat;
die frueheren Stufen klappen auf. Gespeichert wird beides, der Vorschlag der KI
und Ihre Aenderung mit Ihrem Namen und der Zeit. Der Administrator liest es
unter **Verwaltung > Apps > (die App) > Laeufe > (der Lauf)**: „Erkannte Felder
und Aenderungen". Nach der Entscheidung steht wieder die Liste da.

**Nicht uebergeben.** Nennt der Flow einer App eine Abschluss-Route, uebergibt das
Geraet sein Ergebnis nach der letzten Stufe an die App; fertig ist der Lauf erst,
wenn die App den Empfang bestaetigt hat. Antwortet sie nicht oder mit einem
Fehler, steht der Lauf unter **Verwaltung > Apps > (die App) > Laeufe** auf
**nicht uebergeben**, mit dem Grund, und daneben der Knopf **erneut** (auch im
Lauf selbst). „Erneut" schickt dasselbe Ergebnis noch einmal, ohne dass die
Schritte neu laufen, sobald die App wieder antwortet. Der Zustand haelt ueber
einen Neustart des Geraets. Ein Lauf, den niemand mehr uebergeben will, laesst
sich abbrechen. Eine App, die schon vor dieser Funktion eingespielt wurde, hat
das Geheimnis fuer die Route noch nicht: sie muss einmal neu eingespielt werden.

Die Karte verschwindet, sobald entschieden ist. Steht danach eine Meldung, dass
der Lauf nicht mehr fortgesetzt wird, wurde das Geraet zwischendurch neu
gestartet: die Entscheidung ist festgehalten, den Lauf muss jemand neu
anstossen.

- **Modelle (nur Administrator):** in der Mitte die **Kurzliste** des Geraets,
  vier Modelle und keine Suche daneben: eines fuer die Flows
  (`qwen3.8:27b-q4_K_M`, der Standard, aus der Ollama-Bibliothek), ein kleines
  schnelles (`gemma4:e4b`, das auch die Bilder liest, die eine App ohne
  Modellangabe schickt), eines fuer Einbettungen (`nomic-embed-text`) und ein
  kleines Bildmodell als Rueckfall (`llava-phi3`). Je Zeile steht,
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
wurden zusammengelegt, damit die Navigation uebersichtlich bleibt; „Personen" (frueher „Mitarbeiter")
kam mit der neuen Oberflaeche dazu):

| Reiter          | Inhalt                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| **Allgemein**   | Firmenname, Erscheinungsbild, Systeminformationen                                                           |
| **Personen**    | Anlegen (Name, E-Mail), Startpasswort einmal, sperren, Schalter „Verwaltung“, Freigaben für Apps und Ordner |
| **KI**          | Standardwerte der Sprachmodelle                                                                             |
| **Sicherheit**  | Passwort aendern, Abmelden / von allen Geraeten abmelden                                                    |
| **Datenschutz** | DSGVO-Auskunft (Export) und Konto-Loeschung                                                                 |
| **System**      | Drei Unterbereiche: _Services_, _Updates_, _Self-Healing_                                                   |
| **Fernzugriff** | Tailscale-VPN und Remote-Zugriff                                                                            |

Der Reiter **Mitarbeiter** ist in Kapitel 7 beschrieben, weil dort auch die
Wege ueber die Schnittstelle stehen.

> Deep-Links funktionieren: `…/settings?tab=system` oeffnet direkt den System-Reiter.
> Alte Links (z. B. `?tab=selfhealing`) werden automatisch auf den neuen Reiter umgeleitet.

### Allgemein

- **Firmenname:** der Name Ihres Unternehmens. Er steht ueber dem
  Anmeldeformular, unter dem Maskottchen; ohne Namen steht dort der
  Produktname. Einen Slogan zeigt die Anmeldeseite nicht (seit 30.08.2026).
- **Erscheinungsbild:** Hell (Vorgabe) oder Dunkel, gehoert dem angemeldeten
  Menschen (siehe oben).
- **Systeminformationen:** Version, Geraetename, JetPack, Build, Laufzeit.

### KI → Sprachmodell (Experten-Tunables)

Der Reiter **Einstellungen → KI** (nur fuer Administratoren) macht die
Feinjustierung der LLM-Standardwerte ohne Neustart moeglich. Aenderungen wirken
sofort. Alle Werte haben sinnvolle Standardwerte, nur anpassen, wenn Sie die
Auswirkung kennen.

- **LLM-Standardwerte:** `Max. Tokens (LLM-Default)` (max. Antwortlaenge),
  `Kontextfenster (LLM-Default)` (leer = Modell-Default) und `Keep-Alive`
  (wie lange ein geladenes Modell im Speicher bleibt).
- **Basis-System-Prompt:** frei editierbarer Grundtext, der jedem KI-Kontext
  vorangestellt wird. **Feld leeren = eingebauter Standard-Prompt.**

Den frueheren Unterbereich _Firmenprofil & Kontext_ gibt es seit dem
26.09.2026 nicht mehr: er gehoerte zum Chat und den Wissensraeumen, die mit dem
Umbau im August gefallen sind, und bekam am Geraet nur noch eine Fehlermeldung.

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
- Alle Ereignisse stehen unter **Einstellungen → System → Selbstheilung**:
  vorn, was geschah und an welchem Dienst, darunter unter „Technische
  Angaben" Meldung und Massnahme im Wortlaut. Seit dem 26.09.2026 schreibt die
  Selbstheilung diese Saetze deutsch; aeltere Eintraege bleiben englisch, bis
  sie nach 30 Tagen aus dem Protokoll fallen.

---

## 5. Datensicherung

### Automatische Backups

Das Geraet sichert jede Nacht um 02:00 Uhr **vier** Dinge (dazu die Datenbanken der Apps und den Firmenordner):

| Was             | Warum es fehlen wuerde                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Datenbank       | Mitarbeiter, Rollen, Apps und Staende, Freigaben, Flow-Laeufe, Einstellungen                        |
| Pakete der Apps | Woraus das Geraet die App-Container baut. Ohne sie nennt die Datenbank Apps, die es nicht mehr gibt |
| Flow-Dateien    | Was jemand am Geraet selbst geschrieben hat                                                         |
| Konfiguration   | Ohne sie faehrt auf einem leeren Geraet kein Container hoch                                         |

**Eine Kopie ausserhalb des Geraets:** SSD oder Stick einfach anstecken --
ohne Einrichtung. Das Geraet erkennt den Datentraeger, haengt ihn ein und legt
dort jede Nacht (und bei „Jetzt sichern“) die Sicherung ab, **ausschliesslich
verschluesselt**: wer den Stick findet, kann nichts lesen. Unter **Einstellungen
→ System → Sicherung** stehen Name und freier Platz des Datentraegers. Das
Geraet formatiert nie etwas; ein neuer Datentraeger sollte ext4 oder exFAT
haben. Kein Cloud-Ziel: die Daten bleiben im Haus.

**Der Wiederherstellungscode.** Bei der Einrichtung zeigt das Geraet einmal
einen Code (`ABCD-EFGH-…`, acht Gruppen zu vier Zeichen). Er ist der Schluessel
der Sicherungen. **Aufschreiben und ausserhalb des Geraets aufbewahren** (Safe).
Ohne ihn ist nach einem Werksreset oder bei Geraeteverlust jede Sicherung
Papier; mit ihm nicht -- er wird beim Neu-Einrichten eingegeben
(`./install.sh --wiederherstellungscode …`) oder beim Zurueckholen in der
Oberflaeche. Der Werksreset fragt vor dem Loeschen danach. Vergessen? Am
Geraet: `bash scripts/util/wiederherstellungscode.sh`.

Passt der Schluessel dieses Geraets nicht zur letzten Sicherung, steht das ganz
oben auf der Seite Sicherung, und der Administrator bekommt eine Mitteilung.

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

Unter **Verwaltung → System → Sicherung → Zurueckholen** geht es in drei
Schritten zurueck, fuer alles dasselbe (seit M5):

1. **Was?** Eine App, einen Bereich des Firmenordners oder das ganze Geraet.
   Steckt ein Datentraeger, darueber auch, woher (dieses Geraet oder der
   Datentraeger).
2. **Auf welchen Stand?** Die Staende stehen nach Datum und Uhrzeit da
   („Gestern, 2:00 Uhr“), nur die, in denen die App oder der Bereich steht.
   Die Kennung steht unter „Technische Angaben“, gebraucht wird sie nicht.
3. **Bestaetigen** mit dem eigenen Passwort, beim ganzen Geraet zusaetzlich
   mit dem Wort `wiederherstellen`.

Vorher sichert das Geraet den **jetzigen Stand**. Er steht danach ganz oben in
der Liste, etwa „Heute, 23:41 Uhr · vor dem Zurueckholen der App Belege“. **Wer
das Zurueckholen rueckgaengig machen will, waehlt genau diesen Stand und holt
dasselbe noch einmal zurueck.** Ein Stand davor bleibt, bis das Ziel voll ist.

- **Eine App:** ihre Daten und ihr Programm kommen aus dem Stand, danach laeuft
  sie wieder. Alles andere bleibt, wie es ist.
- **Ein Bereich des Firmenordners:** seine Dateien kommen auf den Stand von
  damals; was seitdem dazukam, wird entfernt. Andere Bereiche und alle Rechte
  bleiben. Den Bereich muss es geben (ein weggeworfener wird erst unter
  Firmenordner neu angelegt). Der Dateidienst laeuft dabei weiter.
- **Das ganze Geraet** (Notfall, ersetzt ALLES: Personen, Apps, Freigaben,
  Firmenordner). Auf einem frisch eingerichteten Geraet reicht der
  Datentraeger; passt der Schluessel dieses Geraets nicht, im Dialog den
  **Wiederherstellungscode** der frueheren Installation eingeben. Der ganze
  Ablauf: [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md), Abschnitt 1.3.

Ein Bericht bleibt stehen und nennt jeden Schritt.

Per Befehlszeile:

```bash
# Erst schauen, ob sich die neueste Sicherung lesen laesst — ohne etwas anzufassen:
docker exec backup-service /usr/local/bin/wiederherstellen.sh --probe

# Zurueckspielen: Datenbank, Pakete der Apps, Flow-Dateien (--quelle extern: vom Datentraeger)
docker exec backup-service /usr/local/bin/wiederherstellen.sh

# Eine bestimmte Sicherung:
docker exec backup-service /usr/local/bin/wiederherstellen.sh \
  --datei arasul_db_20260827_020054.sql.gz
```

Danach muessen die App-Container aus ihren Paketen neu gebaut werden. Ueber die
Oberflaeche und die Schnittstelle macht das Geraet beides in einem Aufruf; der
Weg steht in [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md#der-weg-zurück).

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

**Die naechste Fassung holt das Geraet selbst (seit J39).** Unter „Neue Fassung"
steht, ob es eine neuere gibt. Ein Klick auf „Aktualisieren" sichert zuerst, holt
das Paket, prueft seine Pruefsumme und spielt es ein; der Fortschritt steht auf
der Seite, die Seite bitte offen lassen. Das Geraet ist dabei einige Minuten
nicht erreichbar, das ist erwartbar. Geht etwas schief, geht es von selbst auf die
vorige Fassung zurueck und sagt es. Danach steht, solange der Ordner der vorigen
Fassung da ist, „Zurueck auf ..." bereit: das holt das Programm zurueck, nicht die
Daten; die Sicherung vom Einspielen liegt unter „Sicherung". Dasselbe geht ohne
Oberflaeche mit einem Schluessel im Bereich `system:update`
([AUSLIEFERUNG.md](AUSLIEFERUNG.md#das-geraet-aktualisiert-sich-selbst-j39)).

**Wenn dieses Geraet ein .araupdate-Paket nicht einspielen kann, sagt es das.**
Der Weg dahinter braucht ein `docker`-Programm im Backend-Container, und das
gibt es dort nicht. Statt Knoepfen, die zuverlaessig scheitern, steht der Grund
da.

### Auf eine neue Fassung, am Geraet

Der Weg auf eine neue Fassung ist das Artefakt, und er sieht genauso aus wie
eine Erstinstallation:

```bash
tar xzf arasul-<neue Fassung>.tar.gz -C /home/arasul
cd /home/arasul/arasul-<neue Fassung>
./install.sh
```

`install.sh` sucht sich das vorhandene Geraet selbst, zieht seinen Zustand
herueber -- Geheimnisse, Geraete-CA, Datenbankzugang, Apps, Flows, Sicherungen,
Protokolle -- und faehrt danach von hier. **Es wird nichts kopiert:** danach
gibt es das Geraet genau einmal, das alte Verzeichnis traegt `ABGEGEBEN.txt`
und darf weg, sobald die neue Fassung laeuft.

Was dabei gleich bleibt: das Administratorpasswort, der Kit-Schluessel, das
Zertifikat (kein Browser warnt neu) und die Datenbank. Was sich aendert: die
Fassung.

Die Images werden gebaut, **waehrend das Geraet noch laeuft**; abgeschaltet
wird erst danach, und der Wechsel kostet ein paar Minuten. Findet `install.sh`
etwas Zweideutiges -- Daten ohne auffindbares Geraet, oder zwei Verzeichnisse,
die beide das Geraet sein koennten --, haelt es an und sagt, was zu tun ist.
Es installiert dann lieber nicht, als eine Datenbank unbrauchbar zu machen.

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

### Die Lizenz

**Einstellungen > Lizenz** zeigt, was das Geraet traegt: die **Stufe**, die
**Konten** und die **Apps**, je mit „belegt von Grenze". Ohne Lizenz steht das
Geraet auf **Community**: drei Konten, drei Apps. Der Administrator zaehlt mit,
ein stillgelegtes Konto nicht; bei den Apps zaehlt jede eingespielte App, Test-
und Livestand zusammen. Ist eine Grenze erreicht, lehnt das Geraet das vierte
Konto (und die vierte App) mit einem Satz ab, der hierher zeigt. Einen Platz
machen Sie frei, indem Sie ein Konto stilllegen oder eine App entfernen.

Mit einer gekauften Lizenz (**Professional**) gibt es keine Grenze. Die Lizenz
ist eine Zeile Text; sie geht in das Feld **Lizenz einspielen** und wird
geprueft, bevor sie gilt. Ist sie an ein Geraet gebunden, braucht der
Aussteller dessen **Fingerabdruck** — er steht auf derselben Seite zum
Kopieren.

Ohne Anmeldung, per SSH am Geraet (so spielt das Ara-Kit sie ein):

```bash
~/arasul-<fassung>/scripts/util/lizenz-geraet.sh fingerabdruck
~/arasul-<fassung>/scripts/util/lizenz-geraet.sh status
~/arasul-<fassung>/scripts/util/lizenz-geraet.sh einspielen '<lizenz>'
~/arasul-<fassung>/scripts/util/lizenz-geraet.sh entfernen
```

`entfernen` nimmt die Lizenz wieder vom Geraet, wie **DELETE /api/license**:
danach steht es auf Community (Stand 25.09.2026).

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

| Abschnitt      | Was dort steht                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Staende**    | Version je Stand, ob der Container laeuft und ob er sich gesund meldet. Darunter **Live schalten** (nimmt die Version aus dem Teststand) und **Zurueck** (die, die vorher live war). |
| **Tester**     | Wer diese App sieht, und wer davon zusaetzlich den Teststand bekommt.                                                                                                                |
| **Flows**      | Was die App kann, und mit welchem Modell. Ein Klick oeffnet die Flow-Datei samt Auftrag an das Modell.                                                                               |
| **Laeufe**     | Was die App getan hat. Ein Klick oeffnet den Lauf mit seinen Schritten und dem Gedankengang dazwischen.                                                                              |
| **KI-Aufrufe** | Jeder Modellaufruf der App, auch ohne Flow (etwa das Auslesen eines Belegs): wann, fuer wen, welches Modell, wie lange, wie es ausging. Ohne Inhalt der Datei.                       |
| **Logs**       | Die letzten 200 Zeilen des Containers, auf Klick.                                                                                                                                    |

**Welches Modell hat diesen Vorschlag gemacht?** Die **KI-Aufrufe** beantworten
das auch fuer Vorschlaege, die kein Flow sind. Das Geraet schreibt die Zeile
selbst, bevor es das Modell fragt; die App muss dafuer nichts tun, sie nennt nur
den Menschen (Kopfzeile `X-Arasul-User`). Gespeichert werden weder Dateiname
noch Text noch Antwort, nur Art und Groesse der Datei, die Nummer des Auftrags
und der sha256 der Antwort — hat die App den Vorschlag aufbewahrt, laesst er
sich damit genau diesem Aufruf zuordnen. Das Protokoll bleibt, auch wenn die
App entfernt wird, und geht erst mit dem Auslieferungszustand.

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

### Firmenordner: Papierkorb und Adresse

Was ein Mitarbeiter im Firmenordner loescht, liegt im **Papierkorb** des
Hauptordners oder Bereichs, bis Sie ihn leeren. Unter **Einstellungen →
Firmenordner** steht in der Spalte **Papierkorb** je Hauptordner und Bereich
die Zahl der Eintraege; ein Klick oeffnet ihn. Je Eintrag koennen Sie

- **zurueckholen** — er liegt danach wieder an seiner alten Stelle. Liegt dort
  inzwischen etwas anderes, sagt das Geraet es und ueberschreibt nichts;
- **endgueltig entfernen** — nach einer Rueckfrage.

**Papierkorb leeren** nimmt nach einer Rueckfrage alles darin endgueltig vom
Geraet. Zurueck kommt es dann nur aus einer Sicherung, die aelter ist. Jeder
dieser Handgriffe steht im Protokoll. Das ist der Weg, wenn versehentlich
etwas in einen Ordner ging, das dort nicht hingehoert (etwa ein Schluessel):
erst loeschen, dann den Papierkorb leeren.

Ein Projekt hat keinen eigenen Papierkorb; was darin geloescht wird, liegt im
Papierkorb seines Bereichs, mit dem Projekt im Ort.

Ueber der Ordnerliste steht, **unter welcher Adresse** der Firmenordner zu
erreichen ist — zuerst die, unter der Sie das Geraet gerade erreichen, dahinter
die weiteren im Netz der Firma (etwa `https://arasul.local:8443`). Loest
`https://arasul:8443` auf einem Rechner nicht auf, nimmt er eine der anderen.

### Firmenordner: wie viel ein Bereich aufnimmt

Jeder Hauptordner und jeder Bereich hat eine **Grenze**, wie viel er
aufnimmt. Unter **Einstellungen → Firmenordner** steht sie in der Spalte
**Platz**: belegt, Grenze und ein Balken, dazu „fast voll" ab 90 % der Grenze
oder wenn auf dem Geraet weniger als 10 GB frei sind, und „voll", wenn nichts
mehr hineinpasst. Dann steht ueber der Ordnerliste auch eine Warnung — ein
Abgleich, der mehr bringt, wird abgewiesen.

Ein Klick auf **Platz** stellt die Grenze ein: eine Zahl mit MB, GB oder TB,
oder **ohne Grenze** — dann nimmt der Bereich auf, bis das Geraet voll ist.
Unter das, was schon darin liegt, laesst sie sich nicht setzen. Ein Projekt
teilt sich die Grenze seines Bereichs.

**Neue Bereiche bekommen 100 GB.** Das reicht fuer den gewachsenen
Aktenbestand eines Bueros und verhindert, dass ein einzelner Bereich, in den
versehentlich etwas sehr Grosses gezogen wird, das Geraet vollschreibt.
Bereiche, die vor dem 28.09.2026 angelegt wurden, haben noch 1 GB — sehen Sie
dort nach und heben Sie die Grenze an, wo es noetig ist.

### Anmelden

Angemeldet wird mit **Benutzername oder E-Mail-Adresse** und Passwort. Beides
funktioniert; welches von beiden jemand eintippt, ist gleich.

Zehn Anmeldeversuche je Viertelstunde und Absender-IP. Wer diese Zahl reisst,
bekommt eine Meldung, die das sagt, und wartet eine Viertelstunde.

### Personen anlegen, Startpasswort, sperren

**Einstellungen > Personen > Person anlegen**: Vorname, Nachname, E-Mail und der
Schalter „Verwaltung“ (macht zum Administrator). Das Geraet erzeugt das
**Startpasswort** und zeigt es **einmal** — zum Kopieren oder als Zettel zum
Drucken. Danach steht es nirgends mehr; ein neues erzeugt der Schluessel in der
Zeile. Angemeldet wird mit der E-Mail. Der letzte Administrator behaelt das
Recht „Verwaltung“; das Geraet weist es ab, auch wenn er selbst klickt.

**Sperren** nimmt den Zugang und meldet alle angemeldeten Rechner der Person ab;
ihre Entscheidungen und Laeufe bleiben stehen. Loeschen ist der zweite Schritt,
nicht der erste.

Wenn Sie einer Person ein Startpasswort **geben** (beim Anlegen oder ueber den
Schluessel in der Zeile), kennen zwei Menschen es: die Person und Sie. Das
Geraet merkt sich das. Bei der naechsten Anmeldung kommt sie deshalb nicht in
die Oberflaeche, sondern auf eine Seite, die ein neues Passwort verlangt — ohne
„Spaeter"; der einzige Weg daneben ist Abmelden. Dort sieht sie auch Name und
Bild zum Pruefen. Danach kennt das Passwort nur noch sie.

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
