# Arasul Platform - Administrationshandbuch

> Ausführliche Dokumentation aller Funktionen der Arasul Platform.
> Für die Ersteinrichtung siehe: [Quick-Start-Guide](QUICK_START.md)

---

## Inhaltsverzeichnis

1. [Systemübersicht](#1-systemübersicht)
2. [System](#2-system)
3. [Einstellungen](#3-einstellungen)
4. [Services-Verwaltung](#4-services-verwaltung)
5. [Datensicherung](#5-datensicherung)
6. [System-Updates](#6-system-updates)
7. [Benutzerverwaltung](#7-benutzerverwaltung)
8. [Netzwerk & Fernzugriff](#8-netzwerk--fernzugriff)

---

## 1. Systemübersicht

Arasul läuft auf einem NVIDIA Jetson AGX Orin im Unternehmen und hostet dort
interne Apps. Die Apps baut ein Partner oder ein technisch versierter Mensch im
Unternehmen mit dem Ara-Kit und rollt sie auf das Gerät; Mitarbeiter melden
sich mit E-Mail und Passwort an und sehen die Apps, die ein Admin ihnen
freigegeben hat. Das Gerät bietet:

- **Lokale KI:** Sprachmodelle laufen auf dem Gerät, keine Cloud erforderlich
- **Flows:** Agentenflows mit Werkzeugen und nachvollziehbaren Läufen, Teil
  einer App, gestartet über die API
- **Automatische Sicherung:** Tägliche Backups aller Daten
- **Offline-fähig:** Funktioniert ohne Internetverbindung

Das App-Modell steht seit Phase C3 (27.08.2026): eine App bringt ein Manifest
`app.json` mit, liegt am Gerät unter `/arasul/apps/<id>/<version>/` und ist
unter `/apps/<id>/` erreichbar. Die Oberfläche dafür kommt mit den D-Phasen;
bis dahin ist der Weg die Schnittstelle, unten beschrieben.

### Zugriff

| Dienst         | Adresse                                              |
| -------------- | ---------------------------------------------------- |
| Web-Oberfläche | `https://arasul/` (Rückfall `https://arasul.local/`) |
| SSH-Zugang     | `ssh -p 2222 arasul@<ip>`                            |

Der nackte Name kommt vom DHCP-Hostnamen, den der Router auflöst; `.local`
ist der Rückfall über mDNS. Beide stehen im Zertifikat des Geräts, ebenso
jede seiner IP-Adressen. Heißt das Gerät anders, gilt sein Name.

### Die Oberfläche

Die Oberfläche nach der Anmeldung zeigt links eine schmale Leiste und daneben
genau eine Ansicht, in zwei Themes (Hell · Dunkel, Vorgabe Hell). Das Theme
wird unter **Einstellungen → Erscheinungsbild** gewählt und gehört dem
angemeldeten Menschen: es gilt an jedem Rechner, an dem er sich anmeldet, und
nicht nur in dem Browser, in dem er es umgestellt hat.

- **Aktivitätsleiste (links):** ganz oben das **Haus** zur Startseite, mit der
  Zahl der Freigaben, die bei Ihnen liegen. Darunter die
  freigegebenen **Apps** als Kürzel, der Name erscheint beim Überfahren; ein
  Teststand trägt einen Punkt und heißt „(Test)". Unten fest:
  **Verwaltung** (nur Administratoren), das **Zahnrad** (die persönlichen
  Einstellungen) und das **eigene Bild** (Name und Abmelden).
- **Ansicht:** immer genau eine — die Startseite, eine App, die Einstellungen
  oder die Verwaltung. Die **Startseite** grüßt mit dem Vornamen (ohne
  Vornamen mit dem Anzeigenamen) und zeigt jedem **Für Sie**: die Freigaben,
  die bei ihm liegen (siehe unten), darunter die eigenen Apps als Kacheln, an
  einer Kachel höchstens eine Zahl. Als Administrator steht darunter
  zusätzlich, **was Aufmerksamkeit braucht**: Sicherung fehlgeschlagen oder
  älter als ein Tag, eine neue Fassung bereit, eine App gestört, eine Fassung,
  die im Test auf Live wartet, Lizenz knapp (30 Tage oder 90 Prozent der
  Konten/Apps). Ein Klick führt in den Bereich der Verwaltung. Ist alles gut,
  steht dort nichts.
- **Verwaltung:** links eine eigene Leiste der Bereiche (Personen, Apps,
  Firmenordner, Modelle, System, Daten, Gerät), daneben der gewählte Bereich.
  Im Bereich **System** steht ein Satz zum Zustand („Alles läuft.“), darunter
  Prozessor, Speicher und Platte als drei Zahlen; Dienste und Selbstheilung
  klappen auf. Im Bereich **Daten** steht alles, was mit den Daten des Geräts
  geschieht: Sicherung, Auskunft und Export, darunter abgesetzt Person löschen
  und Werksreset (siehe Abschnitt 5). Im Bereich **Gerät** stehen Unternehmen,
  Aktualisierung, Lizenz, Fernzugriff und „Über Arasul“ (siehe Abschnitt 3).
  Jeder Bereich hat eine eigene Adresse, etwa `/workspace/verwaltung/geraet`;
  die alten Adressen (Allgemein, Sicherheit, Lizenz, Fernzugriff, Datenschutz,
  Sicherung, Werksreset) führen dorthin, wo die Funktion jetzt steht.
- **Statusleiste (unten), für jeden gleich:** dauerhaft Name, Datum und
  Uhrzeit (minutengenau), sonst nichts: kein Modell, kein Speicher, keine
  Verbindung, keine Fassung. Modelle, Downloads und Systemzustand stehen in
  der Verwaltung; die Zahl der Freigaben trägt das Haus.

**Was ein Mitarbeiter sieht.** Die Apps, die ein Administrator ihm freigegeben
hat, seine Einstellungen und sein Konto. Die Freigaben, die bei ihm liegen,
stehen auf seiner Startseite unter „Für Sie" (siehe unten), und an der Kachel
der App steht höchstens ihre Zahl. Keine Fassung, keine Verbindungsanzeige, keine Zahlen der
Technik; auch keine Meldung nennt einen Fehlercode oder englischen Text.
Modelle, Benutzer, Datensicherung und Einstellungen sind für ihn nicht da —
und zwar nicht nur unsichtbar: das Gerät weist ihn auf jedem dieser Wege ab,
auch wenn er die Adresse kennt.

### Eine Freigabe entscheiden

Ein Flow einer App kann anhalten und um eine Freigabe bitten (etwa: „Diesen
Wochenbericht versenden?"). Der Lauf steht dann still, bis ein Mensch
entscheidet.

Wo: auf der **Startseite** unter **Für Sie**, für jeden, aber nur die
Freigaben, die bei ihm liegen. Jede Anfrage ist eine Zeile mit dem
Gegenstand, der App (und Stufe) und seit wann sie wartet. **Ein Klick öffnet
die App beim Vorgang**; entschieden wird dort. Unter der Zeile steht, bei wem
sie liegt, und **Weitergeben an …**; zugeklappt darunter, was bei anderen
liegt, mit **Übernehmen**.

- **Bestätigen** — der Lauf läuft ab der angehaltenen Stelle weiter.
- **Ablehnen** — es klappt ein Feld auf; ohne Begründung geht der Knopf nicht.
  Der Lauf endet, und die Begründung wird sein Grund.
- **Nichts tun** — nach Ablauf der Frist endet der Lauf von selbst. Die Frist
  steht am Flow, in der Regel ein Tag.

**Wer darf entscheiden?** Jeder, dem die App freigegeben ist — Administrator
und Mitarbeiter gleichermaßen —, außer dem, der den Vorgang eingereicht hat.
Freigeben ist Arbeit, keine Verwaltung. Der Flow nennt keine Person; er
beschreibt die Sache.

**Bei wem liegt sie?** Ein Flow kann seine Freigaben in benannten Stufen
anfordern, etwa „Prüfung" und dann „Leitung". Für jede Stufe setzen Sie unter
**Verwaltung > Apps > (die App) > Freigabestufen** eine **Standardperson**:
jede neue Freigabe der Stufe liegt zuerst bei ihr. Jeder mit Zugang zur App
kann sie übernehmen oder an einen anderen mit Zugang weitergeben, etwa wenn
die Standardperson im Urlaub ist; entscheiden kann nur, bei dem sie gerade
liegt. Ohne Standardperson liegt eine neue Freigabe bei allen mit Zugang, und
die Verwaltung zeigt dazu einen Hinweis. Zur Wahl stehen nur Menschen mit
Zugang zur App; verliert die Standardperson den Zugang, fällt die Stufe auf
„alle mit Zugang" zurück.

**Ein Feld korrigieren statt ablehnen.** Hat ein Flow etwas erkannt, etwa einen
Beleg gelesen, und war er sich bei einem Feld nicht sicher, steht auf der Karte
**Prüfen** statt Bestätigen. Prüfen öffnet die Freigabe ganz: links das
Original (Bild oder PDF, mit Vergrössern und Verkleinern), rechts die erkannten
Felder, was zu prüfen ist oben mit dem Zeichen **prüfen**. Felder, die die App
zum Ändern freigibt, sind Eingabefelder mit dem Vorschlag der KI darin; ändern
Sie den Wert und bestätigen Sie, der Lauf arbeitet mit Ihrem Wert weiter. Oben
steht in einem Satz, was bisher geschah, etwa welche Stufe schon bestätigt hat;
die früheren Stufen klappen auf. Gespeichert wird beides, der Vorschlag der KI
und Ihre Änderung mit Ihrem Namen und der Zeit. Der Administrator liest es
unter **Verwaltung > Apps > (die App) > Läufe > (der Lauf)**: „Erkannte Felder
und Änderungen". Nach der Entscheidung steht wieder die Liste da.

**Nicht übergeben.** Nennt der Flow einer App eine Abschluss-Route, übergibt das
Gerät sein Ergebnis nach der letzten Stufe an die App; fertig ist der Lauf erst,
wenn die App den Empfang bestätigt hat. Antwortet sie nicht oder mit einem
Fehler, steht der Lauf unter **Verwaltung > Apps > (die App) > Läufe** auf
**nicht übergeben**, mit dem Grund, und daneben der Knopf **erneut** (auch im
Lauf selbst). „Erneut" schickt dasselbe Ergebnis noch einmal, ohne dass die
Schritte neu laufen, sobald die App wieder antwortet. Der Zustand hält über
einen Neustart des Geräts. Ein Lauf, den niemand mehr übergeben will, lässt
sich abbrechen. Eine App, die schon vor dieser Funktion eingespielt wurde, hat
das Geheimnis für die Route noch nicht: sie muss einmal neu eingespielt werden.

Die Karte verschwindet, sobald entschieden ist. Steht danach eine Meldung, dass
der Lauf nicht mehr fortgesetzt wird, wurde das Gerät zwischendurch neu
gestartet: die Entscheidung ist festgehalten, den Lauf muss jemand neu
anstoßen.

- **Modelle (nur Administrator):** **Verwaltung → Modelle**. Ganz oben eine
  Zeile **Speicher für KI** (belegt, Reserve, frei). Darunter eine Zeile je
  Modell am Gerät: Name, Größe, **Fähigkeiten** (Text, Bild, Werkzeuge,
  Kontext), **warm: ja** oder **nein** (liegt es gerade im Speicher) und die
  **Flows, die es nutzen** (Name und App). Laden und Entladen von Hand gibt es
  nicht: das Gerät hält ein Modell eine Weile nach der Nutzung und lädt es bei
  Bedarf selbst. Die Fähigkeiten stimmen Katalog und Ollama ab; bei
  Widerspruch gilt, was Ollama aus den Gewichten liest.
  **Entfernen** ist gesperrt, solange ein Flow das Modell nutzt oder es das
  Standardmodell ist; die Zeile nennt die Flows. Zum Entfernen erst die Flows
  auf ein anderes Modell umstellen (App → Flow → Schritt) oder ein anderes
  Modell zum Standard machen. **Modell hinzufügen** geht aus der geprüften
  Liste (die Modelle der Kurzliste, die noch nicht am Gerät liegen) oder per
  Name aus der Ollama-Bibliothek (`mistral:7b`) oder von Hugging Face
  (`hf.co/nutzer/repo:quant`). Vorher prüft das Gerät, ob Speicher und Platte
  reichen, und weist sonst mit zwei Sätzen ab. Was nicht in der Kurzliste
  steht, trägt die Kennzeichnung **ungemessen**.
- Die Shell ist die einzige Ansicht: `/` landet nach dem Login immer auf
  `/workspace`.

---

## 2. System

**Verwaltung → System** sagt in einem Satz, wie es dem Gerät geht. Ist alles
gut, steht dort „Alles läuft.“; sonst, was nicht stimmt, etwa „Die letzte
Sicherung ist 30 Stunden alt“ oder „Ein Dienst ist ausgefallen: Datenbank“.
Rot ist der Satz nur, wenn etwas gestört ist. Darunter drei Zahlen:
**Prozessor**, **Speicher** (Arbeitsspeicher) und **Platte**, je in Prozent.
Satz und Zahlen fragt die Seite alle 30 Sekunden neu.

Darunter klappen **Dienste** (die Teile des Geräts, die im Hintergrund laufen,
mit Neustart je Dienst) und **Selbstheilung** (was das Gerät selbst repariert
hat, und wann) auf.

---

## 3. Einstellungen

Die **Einstellungen** (Zahnrad unten in der Leiste) sind für alle gleich und
nur persönlich: Profil, Passwort, angemeldete Rechner, Erscheinungsbild. Was
das Gerät betrifft, steht in der **Verwaltung** (nur Administrator), in sieben
Bereichen:

| Bereich          | Inhalt                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| **Personen**     | Anlegen (Name, E-Mail), Startpasswort einmal, sperren, Schalter „Verwaltung“, Freigaben für Apps und Ordner |
| **Apps**         | Eine Seite je App: Zustand, Test und Live, Personen, Flows, Verbindungen                                    |
| **Firmenordner** | Ordnerbaum, Rechte je Person                                                                                |
| **Modelle**      | Modelle am Gerät, hinzufügen und entfernen                                                                  |
| **System**       | Ein Satz zum Zustand, drei Zahlen, Dienste und Selbstheilung (Abschnitt 2)                                  |
| **Daten**        | Sicherung, DSGVO-Auskunft und Export je Person, abgesetzt Person löschen und Werksreset                     |
| **Gerät**        | Unternehmen, Aktualisierung, Lizenz, Fernzugriff, „Über Arasul“                                             |

Die Bereiche Allgemein, KI, Sicherheit, Lizenz und Fernzugriff gibt es seit
dem 04.10.2026 nicht mehr; ihre Inhalte stehen im Bereich Gerät. Den Bereich
**KI** mit den Standardwerten der Sprachmodelle und dem Basis-Prompt gibt es
gar nicht mehr: der Administrator ändert keine Prompts, und Laden und Entladen
der Modelle regelt das Gerät selbst nach Nutzung.

> Alte Links funktionieren: `…/settings?tab=remote-access` öffnet den Bereich
> Gerät beim Fernzugriff, `?tab=selfhealing` das System mit aufgeklappter
> Selbstheilung.

### Gerät

- **Unternehmen:** der Name und das Logo Ihres Unternehmens, als Text. Erst
  „Bearbeiten“ öffnet das Formular. Der Name steht über dem Anmeldeformular,
  unter dem Maskottchen; ohne Namen steht dort der Produktname. Das Logo (PNG,
  JPEG oder WebP, höchstens 256 KB) steht oben in der Leiste links, für alle.
- **Aktualisierung:** welche Fassung hier läuft, und, wenn es eine neuere gibt,
  ein Knopf (Abschnitt 6).
- **Lizenz:** Stufe, Personen genutzt von erlaubt, gültig bis; „Einspielen“
  öffnet einen Dialog. Fingerabdruck und Apps klappen auf (Abschnitt 7).
- **Fernzugriff:** ein Schalter und die Adresse, unter der das Gerät unterwegs
  erreichbar ist, dazu die Adresse im Firmennetz und das Gerätezertifikat
  (Abschnitt 8). Die Technik (IP, Tailnet, Geräte im Tailnet, SSH) klappt auf.
- **Über Arasul:** die Fußzeile mit Gerätename, Laufzeit und Unterstützung;
  Versionskennung, Bau und JetPack klappen auf.

### Passwort und Gerätezertifikat

- **Passwort ändern:** **Einstellungen → Passwort**, für jeden selbst.
- **Passwort vergessen:** Es gibt bewusst keinen Self-Service-Reset. Ein ausgesperrter
  Administrator setzt das Passwort per Operator-CLI zurück: `scripts/security/reset-password.sh`
- **Gerätezertifikat herunterladen:** **Verwaltung → Gerät → Fernzugriff →
  Zertifikat herunterladen.** Die eine Aufgabe, die JEDER Admin einmal
  erledigen sollte. Das Gerät stellt sein TLS-Zertifikat selbst aus; solange
  seine CA im Haus niemand kennt, warnt jeder Browser. Die Datei einmal
  herunterladen und auf den Rechnern der Firma installieren, dann hört die
  Warnung auf. Anleitung für Windows, macOS, iOS und Android:
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

Das System überwacht alle Dienste automatisch:

- Abgestürzte Dienste werden automatisch neu gestartet
- Bei Ressourcen-Engpässen werden Maßnahmen ergriffen
- Alle Ereignisse stehen unter **Einstellungen → System → Selbstheilung**:
  vorn, was geschah und an welchem Dienst, darunter unter „Technische
  Angaben" Meldung und Maßnahme im Wortlaut. Seit dem 26.09.2026 schreibt die
  Selbstheilung diese Sätze deutsch; ältere Einträge bleiben englisch, bis
  sie nach 30 Tagen aus dem Protokoll fallen.

---

## 5. Datensicherung

### Automatische Backups

Das Gerät sichert jede Nacht um 02:00 Uhr **vier** Dinge (dazu die Datenbanken der Apps und den Firmenordner):

| Was             | Warum es fehlen würde                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Datenbank       | Mitarbeiter, Rollen, Apps und Stände, Freigaben, Flow-Läufe, Einstellungen                         |
| Pakete der Apps | Woraus das Gerät die App-Container baut. Ohne sie nennt die Datenbank Apps, die es nicht mehr gibt |
| Flow-Dateien    | Was jemand am Gerät selbst geschrieben hat                                                         |
| Konfiguration   | Ohne sie fährt auf einem leeren Gerät kein Container hoch                                          |

**Eine Kopie außerhalb des Geräts:** SSD oder Stick einfach anstecken --
ohne Einrichtung. Das Gerät erkennt den Datenträger, hängt ihn ein und legt
dort jede Nacht (und bei „Jetzt sichern“) die Sicherung ab, **außchließlich
verschlüsselt**: wer den Stick findet, kann nichts lesen. Unter **Einstellungen
→ Daten → Sicherung** stehen Name und freier Platz des Datenträgers. Das
Gerät formatiert nie etwas; ein neuer Datenträger sollte ext4 oder exFAT
haben. Kein Cloud-Ziel: die Daten bleiben im Haus.

**Der Wiederherstellungscode.** Bei der Einrichtung zeigt das Gerät einmal
einen Code (`ABCD-EFGH-…`, acht Gruppen zu vier Zeichen). Er ist der Schlüssel
der Sicherungen. **Aufschreiben und außerhalb des Geräts aufbewahren** (Safe).
Ohne ihn ist nach einem Werksreset oder bei Geräteverlust jede Sicherung
Papier; mit ihm nicht -- er wird beim Neu-Einrichten eingegeben
(`./install.sh --wiederherstellungscode …`) oder beim Zurückholen in der
Oberfläche. Der Werksreset fragt vor dem Löschen danach. Vergessen? Am
Gerät: `bash scripts/util/wiederherstellungscode.sh`.

Passt der Schlüssel dieses Geräts nicht zur letzten Sicherung, steht das ganz
oben auf der Seite Sicherung, und der Administrator bekommt eine Mitteilung.

### Manuelles Backup

**Verwaltung → Daten → Sicherung → Jetzt sichern.** Die Sicherung läuft
sofort und braucht am Gerät einige Minuten; danach steht die Meldung, dass sie
fertig ist, und die Liste darunter zeigt die neue Datei mit Datum und Grösse.
Solange sie läuft, lässt das Gerät nichts Zweites zu.

Auf derselben Seite steht außerdem:

- **Zustand:** ob das Gerät wirklich sichert (nicht „könnte", sondern „hat"),
  wann zuletzt und wie groß.
- **Kopie außerhalb:** Datum und Grösse der letzten Kopie AUSSER HAUS. Steht
  dort „noch nie", liegt jede Sicherung nur auf diesem Gerät und überlebt es
  nicht.
- **Wiederherstellungstest:** ein Knopf, der die neueste Sicherung in eine
  Wegwerf-Datenbank spielt und nachzählt, ohne den Betrieb anzufassen.

Über die Befehlszeile geht es weiterhin:

```bash
ssh -p 2222 arasul@<jetson-ip>
docker exec backup-service /usr/local/bin/backup.sh
```

### Backup wiederherstellen

Unter **Verwaltung → Daten → Sicherung → Zurückholen** geht es in drei
Schritten zurück, für alles dasselbe (seit M5):

1. **Was?** Eine App, einen Bereich des Firmenordners oder das ganze Gerät.
   Steckt ein Datenträger, darüber auch, woher (dieses Gerät oder der
   Datenträger).
2. **Auf welchen Stand?** Die Stände stehen nach Datum und Uhrzeit da
   („Gestern, 2:00 Uhr“), nur die, in denen die App oder der Bereich steht.
   Die Kennung steht unter „Technische Angaben“, gebraucht wird sie nicht.
3. **Bestätigen** mit dem eigenen Passwort, beim ganzen Gerät zusätzlich
   mit dem Wort `wiederherstellen`.

Vorher sichert das Gerät den **jetzigen Stand**. Er steht danach ganz oben in
der Liste, etwa „Heute, 23:41 Uhr · vor dem Zurückholen der App Belege“. **Wer
das Zurückholen rückgängig machen will, wählt genau diesen Stand und holt
dasselbe noch einmal zurück.** Ein Stand davor bleibt, bis das Ziel voll ist.

- **Eine App:** ihre Daten und ihr Programm kommen aus dem Stand, danach läuft
  sie wieder. Alles andere bleibt, wie es ist.
- **Ein Bereich des Firmenordners:** seine Dateien kommen auf den Stand von
  damals; was seitdem dazukam, wird entfernt. Andere Bereiche und alle Rechte
  bleiben. Den Bereich muss es geben (ein weggeworfener wird erst unter
  Firmenordner neu angelegt). Der Dateidienst läuft dabei weiter.
- **Das ganze Gerät** (Notfall, ersetzt ALLES: Personen, Apps, Freigaben,
  Firmenordner). Auf einem frisch eingerichteten Gerät reicht der
  Datenträger; passt der Schlüssel dieses Geräts nicht, im Dialog den
  **Wiederherstellungscode** der früheren Installation eingeben. Der ganze
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

Danach müssen die App-Container aus ihren Paketen neu gebaut werden. Über die
Oberfläche und die Schnittstelle macht das Gerät beides in einem Aufruf; der
Weg steht in [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md#der-weg-zurück).

**Was vorher da war, geht nicht verloren:** vor dem Zurückspielen legt das
Gerät einen Abzug des jetzigen Standes unter
`data/backups/vor_wiederherstellung/` ab.

### Aufbewahrung

| Typ         | Aufbewahrung |
| ----------- | ------------ |
| Täglich     | 30 Tage      |
| Wöchentlich | 12 Wochen    |

---

## 5b. Auskunft und Export, Person löschen

**Verwaltung → Daten → Auskunft und Export.** Eine Person wählen (vorgewählt
sind Sie selbst): darunter steht, was über sie gespeichert ist, nach Kategorie
gezählt (Profil, Flow-Läufe, Aktivitätsprotokoll, Freigaben). „Auskunft
herunterladen" liefert alles als JSON-Datei; ist eine SSD angesteckt, steht
daneben „Auf <Name>". Die Auskunft ist ein Vorgang des Hauses und steht
deshalb **nicht** in den Einstellungen der Person: diese sind nur persönlich
(Profil, Passwort, Rechner, Erscheinungsbild). Wer eine Auskunft über sich
verlangt (Art. 15), wendet sich an die Verwaltung.

**Person löschen** (Art. 17) steht im abgesetzten Teil darunter. Der Knopf
bleibt gesperrt, bis der Name der Person genau eingetippt ist. Gelöscht werden
Konto, Läufe, Schlüssel und Freigaben; Protokolle bleiben ohne Namen stehen.

## 5a. Werksreset

**Verwaltung → Daten**, ganz unten im abgesetzten Teil „Löschen und Zurücksetzen“
(dort ist als einzige Stelle der Oberfläche etwas rot). Bestätigt wird durch
Eintippen des Gerätenamens.

Zwei Stufen. Beide sind endgültig, es gibt kein Rückgängig. Was hier
verschwindet, steht danach nur noch in einer Sicherung (Abschnitt 5).

| Stufe                | Weg                                                   | Bleibt                                        |
| -------------------- | ----------------------------------------------------- | --------------------------------------------- |
| Inhalte zurücksetzen | Modell-Aufträge, Flow-Läufe                           | Zugang, Flows, Einstellungen, Modelle         |
| Auslieferungszustand | zusätzlich Zugangsdaten, Flows, Protokolle, Messwerte | nur der Werkskatalog (Modelle, Warnschwellen) |

Optional lässt sich zusätzlich ankreuzen, dass auch die heruntergeladenen
Modelle gelöscht werden. Ohne Modell kann das Gerät bis zum nächsten Download
nicht antworten.

**Ablauf**

1. Stufe wählen, dann **Vorschau anzeigen**. Die Vorschau zählt vorher ab, wie
   viele Zeilen je Bereich verschwinden. Erst danach erscheint der Auslöser.
2. Zum Bestätigen den **Gerätenamen** eintippen, der über dem Feld steht. Ein
   festes Wort wie LÖSCHEN tippt man im Zweifel auch auf dem falschen Gerät.
3. **Werksreset jetzt ausführen**.

Nach _Auslieferungszustand_ ist kein Zugang mehr hinterlegt: beim nächsten
Aufruf startet die Ersteinrichtung, so wie bei einem neuen Gerät. Das gilt auch
über einen Neustart hinweg. Das alte Passwort funktioniert danach nicht mehr,
auch nicht das aus der ersten Einrichtung des Geräts.

**Wenn der Werksreset gesperrt ist:** Die Vorschau meldet dann Tabellen, die er
nicht einordnen kann, und verweigert die Ausführung. Das ist Absicht. Ein
Werksreset, der etwas stehen lässt, wäre schlimmer als keiner, weil er
Vollständigkeit behauptet. In dem Fall gehört die neue Tabelle in
`src/services/werksreset/tabellen.js` eingeordnet.

---

## 6. System-Updates

**Verwaltung → Gerät → Aktualisierung.** Oben steht, welche Fassung
dieses Gerät trägt. Sie kommt aus dem Bau (Tag oder Datum plus Kurz-SHA);
sagt die Seite „Vorserie", kennt das Gerät seine eigene Fassung nicht, und
dann lässt sich auch nicht entscheiden, ob ein Paket neuer ist.

**Die nächste Fassung holt das Gerät selbst (seit J39).** Darunter
steht, ob es eine neuere gibt. Ein Klick auf „Auf … aktualisieren“ fragt einmal
nach; danach sichert das Gerät zuerst, holt
das Paket, prüft seine Prüfsumme und spielt es ein; der Fortschritt steht auf
der Seite, die Seite bitte offen lassen. Das Gerät ist dabei einige Minuten
nicht erreichbar, das ist erwartbar. Geht etwas schief, geht es von selbst auf die
vorige Fassung zurück und sagt es. Danach steht, solange der Ordner der vorigen
Fassung da ist, „Zurück auf ..." bereit: das holt das Programm zurück, nicht die
Daten; die Sicherung vom Einspielen liegt unter Verwaltung → Daten. Dasselbe geht ohne
Oberfläche mit einem Schlüssel im Bereich `system:update`
([AUSLIEFERUNG.md](AUSLIEFERUNG.md#das-geraet-aktualisiert-sich-selbst-j39)).

**Ein .araupdate-Paket von Hand einspielen geht nicht über die Oberfläche**
(seit 04.10.2026 steht der Weg dort nicht mehr). Er brauchte ein
`docker`-Programm im Backend-Container, das das ausgelieferte Gerät nicht hat,
und zeigte deshalb nur den Satz, dass er nicht geht. Ein Gerät ohne Netz
aktualisiert der Betreuer am Gerät (siehe unten).

**Nachts selbst einspielen (seit M5, aus als Vorgabe).** Unter dem Knopf steht
ein Schalter „Nachts selbst einspielen“. Ist er an und liegt in der Nacht eine
neuere Fassung bereit, spielt das Gerät sie von selbst ein, mit denselben
Sicherungen wie auf Knopfdruck:

- **Das Fenster** liegt fest zwischen **02:00 und 04:00 Uhr** in der Zeit des
  Geräts (Zeitzone `TZ`, Vorgabe `Europe/Berlin`; die Seite nennt sie und den
  nächsten Beginn). Es beginnt mit dem ersten Takt ab 02:00. Läuft das Gerät
  in dieser Zeit nicht, wird nicht nachgeholt, die nächste Nacht kommt.
  Zeigt die Uhr bei der Umstellung auf Winterzeit die Stunde zweimal, zählt
  es trotzdem nur einmal.
- **Vorher wird gesichert**, als eigener Stand mit dem Vermerk „vor dem
  Einspielen einer neuen Fassung“ (Verwaltung → Daten). **Scheitert die
  Sicherung, wird nichts eingespielt.**
- **Danach prüft das Gerät, ob alles gesund ist**, und geht bei einem Fehler
  von selbst auf die vorige Fassung zurück. Das holt das **Programm** zurück,
  nicht die Daten; sollen auch die zurück, ist es eine Wiederherstellung aus der
  Sicherung vom Einspielen.
- **Am Morgen steht auf der Startseite ein Hinweis** mit dem Ergebnis:
  eingespielt, übersprungen (mit Grund, zum Beispiel zu wenig Platz oder keine
  Verbindung ins Netz) oder zurückgefallen. Er bleibt bis „Gelesen“ unter
  Gerät → Aktualisierung, höchstens drei Tage. Eine Nacht, in der es nichts
  einzuspielen gab, meldet nichts.
- **„Ablauf prüfen“** unter dem Schalter ist ein Trockenlauf: er prüft, was
  eine Nacht vorher prüft (Weg frei, neuere Fassung da, Platz, letzte Sicherung
  gelungen), und berichtet. Er spielt nichts ein, sichert nichts und belegt das
  Fenster nicht.

Das Gerät ist beim Umschalten einige Minuten nicht erreichbar; wer um diese
Zeit arbeitet, merkt es. Wer das nicht will, lässt den Schalter aus und
aktualisiert zu einer Zeit seiner Wahl mit dem Knopf.

### Auf eine neue Fassung, am Gerät

Der Weg auf eine neue Fassung ist das Artefakt, und er sieht genauso aus wie
eine Erstinstallation:

```bash
tar xzf arasul-<neue Fassung>.tar.gz -C /home/arasul
cd /home/arasul/arasul-<neue Fassung>
./install.sh
```

`install.sh` sucht sich das vorhandene Gerät selbst, zieht seinen Zustand
herüber -- Geheimnisse, Geräte-CA, Datenbankzugang, Apps, Flows, Sicherungen,
Protokolle -- und fährt danach von hier. **Es wird nichts kopiert:** danach
gibt es das Gerät genau einmal, das alte Verzeichnis trägt `ABGEGEBEN.txt`
und darf weg, sobald die neue Fassung läuft.

Was dabei gleich bleibt: das Administratorpasswort, der Kit-Schlüssel, das
Zertifikat (kein Browser warnt neu) und die Datenbank. Was sich ändert: die
Fassung.

Die Images werden gebaut, **während das Gerät noch läuft**; abgeschaltet
wird erst danach, und der Wechsel kostet ein paar Minuten. Findet `install.sh`
etwas Zweideutiges -- Daten ohne auffindbares Gerät, oder zwei Verzeichnisse,
die beide das Gerät sein könnten --, hält es an und sagt, was zu tun ist.
Es installiert dann lieber nicht, als eine Datenbank unbrauchbar zu machen.

### Paket einspielen (wenn der Weg offen ist)

1. Stecken Sie den USB-Stick mit dem Paket ein, oder wählen Sie die
   `.araupdate`-Datei und die zugehörige `.sig` von Hand
2. **Hochladen und prüfen** — Signatur und Manifest werden geprüft
3. **Einspielen**, und die Seite offen lassen: das Gerät startet sich dabei
   selbst neu, und die Verbindung bricht kurz weg. Das ist erwartbar.

### Verlauf

Darunter steht, was bisher eingespielt wurde: Fassung vorher und nachher,
Ausgang, Datum, Quelle und Dauer.

### Hinweise

- Updates werden digital signiert und vor der Installation verifiziert
- Bei Problemen wird automatisch ein Rollback durchgeführt
- Vor dem Einspielen sichert das Gerät selbst (Abschnitt 5)

---

## 7. Benutzerverwaltung

### Zwei Rollen

Das Gerät kennt zwei Rollen. Der **Administrator** verwaltet Mitarbeiter,
Apps, Freigaben, Modelle und den Betrieb. Der **Mitarbeiter** meldet sich mit
E-Mail-Adresse oder Benutzername und Passwort an und sieht, was ihm freigegeben
ist, dazu seine eigenen Flow-Läufe. Alles andere beantwortet das Gerät mit
„Diese Funktion ist dem Administrator vorbehalten" (HTTP 403).

### Die Lizenz

**Verwaltung → Gerät → Lizenz** zeigt, was das Gerät trägt: die **Stufe**,
die **Personen** (genutzt von erlaubt) und bis wann sie **gültig** ist;
aufgeklappt die **Apps** (genutzt von erlaubt) und den Fingerabdruck. Ohne Lizenz steht das
Gerät auf **Community**: drei Konten, drei Apps. Der Administrator zählt mit,
ein stillgelegtes Konto nicht; bei den Apps zählt jede eingespielte App, Test-
und Livestand zusammen. Ist eine Grenze erreicht, lehnt das Gerät das vierte
Konto (und die vierte App) mit einem Satz ab, der hierher zeigt. Einen Platz
machen Sie frei, indem Sie ein Konto stilllegen oder eine App entfernen.

Mit einer gekauften Lizenz (**Professional**) gibt es keine Grenze. Die Lizenz
ist eine Zeile Text; „Einspielen“ öffnet einen Dialog mit einem Feld dafür,
und sie wird geprüft, bevor sie gilt. Ist sie an ein Gerät gebunden, braucht
der Aussteller dessen **Fingerabdruck** — er steht aufgeklappt unter
„Fingerabdruck und Apps“ zum Kopieren.

Ohne Anmeldung, per SSH am Gerät (so spielt das Ara-Kit sie ein):

```bash
~/arasul-<fassung>/scripts/util/lizenz-geraet.sh fingerabdruck
~/arasul-<fassung>/scripts/util/lizenz-geraet.sh status
~/arasul-<fassung>/scripts/util/lizenz-geraet.sh einspielen '<lizenz>'
~/arasul-<fassung>/scripts/util/lizenz-geraet.sh entfernen
```

`entfernen` nimmt die Lizenz wieder vom Gerät, wie **DELETE /api/license**:
danach steht es auf Community (Stand 25.09.2026).

### Benutzer anlegen, sperren und löschen

**In der Oberfläche: Verwaltung → Personen.** In der
Aktivitätsleiste links „Verwaltung", dann „Personen". Die Seite zeigt jeden Menschen am
Gerät mit Rolle, Zustand und der letzten Anmeldung. An jeder Zeile stehen zwei
Handgriffe: neues Startpasswort, stilllegen oder wieder zulassen. Löschen steht
nicht hier, sondern unter **Verwaltung → Daten → Person löschen** (Namen
eintippen); stilllegen kommt vor löschen. „Person anlegen" legt einen neuen an.

Die Spalte **Passwort** sagt „Startpasswort", solange das aktuelle Passwort von
einem Administrator gesetzt wurde. Der Mensch wechselt es beim nächsten
Anmelden, danach steht dort „eigenes". Sie sehen daran auch, ob er sich
überhaupt schon angemeldet hat.

Am eigenen Konto stehen keine Handgriffe. Ihr eigenes Passwort wechseln Sie
unter **Einstellungen → Passwort**; das Gerät lehnt beide Wege hier ohnehin ab.
Das eigene Konto lässt sich in der Oberfläche nicht löschen (die Schnittstelle
`DELETE /api/gdpr/me` gibt es weiter).

Dieselben Handgriffe über die Schnittstelle, angemeldet als Administrator:

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

**Stilllegen ist nicht löschen.** Wer stillgelegt ist, kommt nicht mehr herein
und seine offenen Sitzungen enden sofort; seine Läufe und Protokolle bleiben
stehen. Das ist der richtige erste Schritt, wenn jemand das Unternehmen
verlässt: was mit seinen Daten geschehen soll, entscheiden Sie danach in Ruhe.

Ein gesetztes Passwort beendet ebenfalls alle Sitzungen des Betroffenen. Er
meldet sich damit einmal an und wählt danach unter **Einstellungen →
Passwort** sein eigenes; erst dort gelten die Passwort-Anforderungen unten.

Für das EIGENE Konto ist dieser Weg gesperrt. Ihr eigenes Passwort wechseln
Sie unter **Einstellungen → Passwort**, und dort gelten die Anforderungen.

Der letzte aktive Administrator lässt sich weder löschen noch stilllegen; sein
Zugang bleibt, sonst wäre das Gerät unbedienbar. Sich selbst kann außerdem
niemand stilllegen.

### Apps für Mitarbeiter freigeben

Ein Mitarbeiter sieht nur, was ihm freigegeben ist. Eine Freigabe ist ein Paar
aus App-Kennung und Mitarbeiter.

**In der Oberfläche: Verwaltung → Personen, Abschnitt „Freigaben: Apps".**
Eine Zeile je Mensch, eine Spalte je App, in der Zelle ein Häckchen. Setzen
heißt freigeben, wegnehmen heißt zurücknehmen; beides wirkt sofort, ohne
Speichern-Knopf. Unter einem gesetzten Häckchen steht der Stand: „Live" ist
der Normalfall, ein Klick darauf macht den Menschen zum **Tester** („Test", er
sieht dann zusätzlich den Teststand), ein weiterer Klick zurück.

Die Matrix führt auch die Administratoren auf, und das ist kein Versehen: die
Rolle sagt, wer verwaltet, nicht wer arbeitet. Wer eine App benutzen will,
braucht sie freigegeben, auch als Administrator.

Dieselben Handgriffe über die Schnittstelle:

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
Löschen Sie einen Benutzer, fallen seine Freigaben mit ihm weg. Die
App-Kennung ist die `id` aus dem Manifest `app.json`; eine App, die es am Gerät
nicht gibt, lässt sich nicht freigeben.

**Tester.** Wer eine App vor allen anderen sehen soll, bekommt die Freigabe mit
`"stand":"test"` und sieht damit zusätzlich den Teststand unter
`/apps/<id>/test/`. Mit `"stand":"live"` wird er wieder normaler Nutzer; eine
zweite Freigabe entsteht dabei nicht.

Was ein Mitarbeiter selbst sieht, steht unter `GET /api/apps/meine` — das ist
die einzige App-Auskunft, die er selbst abrufen darf.

### Apps am Gerät

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

# spaeter die Version aus dem Teststand live -- vorher gesichert, mit Rueckfall
curl -sk -X POST https://<geraet>/api/apps/urlaub/schalten \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"ziel":"live"}'

# wenn eine App haengt: die letzten Zeilen ihres Backends
curl -sk "https://<geraet>/api/apps/urlaub/logs?stand=live&zeilen=100" \
  -H "authorization: Bearer $TOKEN"

# App entfernen (beide Staende, beide Container, alle Freigaben)
curl -sk -X DELETE https://<geraet>/api/apps/urlaub -H "authorization: Bearer $TOKEN"
```

`GET /api/apps/<id>` sagt Ihnen auch, was die App verlangt und was davon da ist:
welche Sprachmodelle sie braucht und welche Flows. Fehlt eines, läuft die App
trotzdem an — das Gerät installiert nichts von allein nach.

#### Dasselbe im Browser

Seit August 2026 müssen Sie dafür keine Befehlszeile mehr aufmachen.
**Verwaltung → Apps** zeigt jede App am Gerät mit einem Satz zu ihrem Zustand
und höchstens dem Hinweis „(Test)", wenn eine Testfassung da ist. Ein Klick
öffnet ihre **Seite**, mit eigener Adresse
(`/workspace/verwaltung/apps/<kennung>`). Seit Oktober 2026 (M5) steht dort
alles, was die App tut und darf, und nirgends sonst in der Oberfläche:

| Block              | Was dort steht                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zustand**        | Ein Satz („Läuft mit Fassung 1.0.0. Im Test wartet Fassung 1.1.0."), wie viele Personen Zugang haben und wie viele Flows aktiv sind. Rot nur, wenn die App deshalb nicht arbeiten kann: Fassung nicht lieferbar, Server-Teil steht, eingetragene Verbindung abgewiesen.                                                                        |
| **Fassungen**      | Test- und Livefassung nebeneinander, mit dem Zustand und dem, was der Entwickler zur Fassung schrieb („Neu"). Darunter **Live schalten** und **Zurück**. Fassungsnummern, Weg und Bibliothek unter „Technische Angaben" (aufklappen).                                                                                                          |
| **Personen**       | Jeder Mensch am Gerät mit einem Schalter für den Zugang; wer Zugang hat, kann **Testperson** werden. Eine Testperson sieht die App in ihrer Leiste zusätzlich als „(Test) Name" und landet dort in der Testfassung.                                                                                                                            |
| **Freigabestufen** | Wer je Stufe zuerst gefragt wird (Standardperson).                                                                                                                                                                                                                                                                                             |
| **Flows**          | Je Flow ein Schalter **aktiv**, die **Art**, ein Satz, wann er startet und wie viele Schritte er hat, und bei einem Zeitplan der nächste Lauf mit dem Knopf „Zeitplan pausieren". Schritte, Freigaben, Modell („Modell ändern") und die Datei mit dem Auftrag an das Modell klappen auf. Ein Flow auf „aus" startet nicht, das Gerät weist ab. |
| **Verbindungen**   | Wohin die App ins Internet darf, lesbar benannt („OpenAI"), mit „x× genutzt"; die Adresse klappt auf. Abgewiesene Adressen, die die App nicht eingetragen hat, stehen grau und zugeklappt darunter. Rot ist nur eine eingetragene Verbindung, die abgewiesen wird.                                                                             |
| **Läufe**          | Auf „Zeigen": was die App getan hat; ein Klick öffnet den Lauf mit seinen Schritten und dem Gedankengang.                                                                                                                                                                                                                                      |
| **KI-Aufrufe**     | Auf „Zeigen": jeder Modellaufruf der App, auch ohne Flow (etwa das Auslesen eines Belegs): wann, für wen, welches Modell, wie lange. Ohne Inhalt der Datei.                                                                                                                                                                                    |
| **Protokoll**      | Auf „Zeigen": die letzten 200 Zeilen des Server-Teils.                                                                                                                                                                                                                                                                                         |

**Einen Flow ausschalten.** Der Schalter **aktiv** in der Zeile des Flows. Aus
heißt: der Flow startet nicht, weder von Hand in der App noch nach Zeitplan;
die App bekommt beim Versuch die Antwort `409 FLOW_INAKTIV`. Ein Lauf, der
schon läuft oder auf eine Freigabe wartet, geht zu Ende. Die Wahl gilt für
Test und Live zugleich und bleibt über ein Update der App erhalten.

**Den Zeitplan eines Flows pausieren.** Nennt der Flow einen Zeitplan, steht
unter seinem Namen der **nächste Lauf in Worten** („morgen um 06:00 Uhr") und
ein Knopf **Zeitplan pausieren**. Pausiert startet der Flow nicht von allein;
der Schalter **aktiv** und der Start von Hand in der App bleiben, wie sie sind.
Termine, die in die Pause fallen, werden nach dem **Fortsetzen nicht
nachgeholt**. Der Zeitplan gilt in der Uhrzeit des Geräts (Europe/Berlin, mit
Sommer- und Winterzeit) und nur im **Livestand**; im Teststand läuft keiner. Wie
der Zeitplaner sich verhält, wenn etwas dazwischenkommt:

- **Genau einmal je Termin**, auch über einen Neustart des Geräts hinweg.
- **War das Gerät zur Zeit aus,** holt es den **letzten** verpassten Termin
  einmal nach, wenn er höchstens **eine Stunde** zurückliegt. Alles andere wird
  übersprungen; der Satz „Verpasst: Dienstag, 6. Oktober, 06:00 Uhr …" steht
  rot unter dem Flow, damit Sie es sehen.
- **Läuft oder wartet** (auf eine Freigabe) **schon ein Lauf** desselben Flows,
  startet kein zweiter; der Termin entfällt, und der Satz sagt, bei welchem
  Lauf es hing.
- Ein Lauf nach Zeitplan hat in der Liste der **Läufe** die Marke „Zeitplan"
  und keinen Menschen als Einreicher.

**Live schalten, und was passiert, wenn die neue Fassung nicht startet.** Ein
Klick auf **Live schalten** öffnet erst einen Dialog: welche Fassung welche
ersetzt und, unter „Was neu ist", was der Entwickler beim Ausrollen dazu
geschrieben hat. Bestätigen Sie dort, sichert Arasul zuerst die Daten der App
(ein Stand der Sicherung, in der Liste „vor dem Live-Schalten der App …"),
schaltet dann und wartet, bis die neue Fassung läuft. Das dauert um zwei
Minuten; der Knopf sagt „Sichert und schaltet…".

Bringt die neue Fassung eine Änderung an ihrer Datenbank mit, die scheitert,
startet sie nicht. Dann schaltet Arasul **selbst zurück**: auf die Fassung
von vorher und auf die Daten von vorher, so wie sie vor dem Klick waren. In der
Karte **Livefassung** steht danach ein Satz, was geschah, und ein zweiter, was Sie
tun können — meist: die **Technischen Angaben** (aufklappen) an den
Entwickler geben und die korrigierte Fassung abwarten. Der Teststand läuft
dabei weiter und bekommt nie Daten aus dem Livestand. Lässt sich vorher nichts
sichern, wird gar nicht erst geschaltet; die Karte sagt das ebenso.

Die **KI-Aufrufe** beantworten
das auch für Vorschläge, die kein Flow sind. Das Gerät schreibt die Zeile
selbst, bevor es das Modell fragt; die App muss dafür nichts tun, sie nennt nur
den Menschen (Kopfzeile `X-Arasul-User`). Gespeichert werden weder Dateiname
noch Text noch Antwort, nur Art und Grösse der Datei, die Nummer des Auftrags
und der sha256 der Antwort — hat die App den Vorschlag aufbewahrt, lässt er
sich damit genau diesem Aufruf zuordnen. Das Protokoll bleibt, auch wenn die
App entfernt wird, und geht erst mit dem Auslieferungszustand.

**Das Modell eines Flows umstellen.** Der Knopf „Modell" neben einem Flow
fragt, womit er rechnen soll: mit dem, was im Paket steht, mit einem Modell von
diesem Gerät, oder mit einem bei einem Anbieter draußen. Für den letzten Fall
brauchen Sie den Namen des Anbieters, den Modellnamen dort, die Adresse (die
OpenAI-kompatible Basis-Adresse, z. B. `https://api.openai.com/v1`) und
gegebenenfalls einen Schlüssel.

> **Der Prompt dieses Flows verlässt dann das Haus.** Alles andere an Arasul
> läuft lokal; ein Flow mit einem externen Modell ist die eine Ausnahme, und
> Sie treffen sie bewusst, je Flow. Wer sie zurücknehmen will, wählt wieder
> „Aus dem Paket" — das räumt auch den hinterlegten Schlüssel weg.

Der Schlüssel wird verschlüsselt abgelegt und danach nie wieder angezeigt;
sichtbar bleiben nur seine letzten vier Zeichen. Wollen Sie nur den Modellnamen
ändern, lassen Sie das Schlüsselfeld leer — der hinterlegte bleibt stehen.

### Firmenordner: Papierkorb und Adresse

Was ein Mitarbeiter im Firmenordner löscht, liegt im **Papierkorb** des
Hauptordners oder Bereichs, bis Sie ihn leeren. Unter **Einstellungen →
Firmenordner** steht in der Spalte **Papierkorb** je Hauptordner und Bereich
die Zahl der Einträge; ein Klick öffnet ihn. Je Eintrag können Sie

- **zurückholen** — er liegt danach wieder an seiner alten Stelle. Liegt dort
  inzwischen etwas anderes, sagt das Gerät es und überschreibt nichts;
- **endgültig entfernen** — nach einer Rückfrage.

**Papierkorb leeren** nimmt nach einer Rückfrage alles darin endgültig vom
Gerät. Zurück kommt es dann nur aus einer Sicherung, die älter ist. Jeder
dieser Handgriffe steht im Protokoll. Das ist der Weg, wenn versehentlich
etwas in einen Ordner ging, das dort nicht hingehört (etwa ein Schlüssel):
erst löschen, dann den Papierkorb leeren.

Ein Projekt hat keinen eigenen Papierkorb; was darin gelöscht wird, liegt im
Papierkorb seines Bereichs, mit dem Projekt im Ort.

Über der Ordnerliste steht, **unter welcher Adresse** der Firmenordner zu
erreichen ist — zuerst die, unter der Sie das Gerät gerade erreichen, dahinter
die weiteren im Netz der Firma (etwa `https://arasul.local:8443`). Löst
`https://arasul:8443` auf einem Rechner nicht auf, nimmt er eine der anderen.

### Firmenordner: wie viel ein Bereich aufnimmt

Jeder Hauptordner und jeder Bereich hat eine **Grenze**, wie viel er
aufnimmt. Unter **Einstellungen → Firmenordner** steht sie in der Spalte
**Platz**: belegt, Grenze und ein Balken, dazu „fast voll" ab 90 % der Grenze
oder wenn auf dem Gerät weniger als 10 GB frei sind, und „voll", wenn nichts
mehr hineinpasst. Dann steht über der Ordnerliste auch eine Warnung — ein
Abgleich, der mehr bringt, wird abgewiesen.

Ein Klick auf **Platz** stellt die Grenze ein: eine Zahl mit MB, GB oder TB,
oder **ohne Grenze** — dann nimmt der Bereich auf, bis das Gerät voll ist.
Unter das, was schon darin liegt, lässt sie sich nicht setzen. Ein Projekt
teilt sich die Grenze seines Bereichs.

**Neue Bereiche bekommen 100 GB.** Das reicht für den gewachsenen
Aktenbestand eines Büros und verhindert, dass ein einzelner Bereich, in den
versehentlich etwas sehr Großes gezogen wird, das Gerät vollschreibt.
Bereiche, die vor dem 28.09.2026 angelegt wurden, haben noch 1 GB — sehen Sie
dort nach und heben Sie die Grenze an, wo es nötig ist.

### Anmelden

Angemeldet wird mit **Benutzername oder E-Mail-Adresse** und Passwort. Beides
funktioniert; welches von beiden jemand eintippt, ist gleich.

Zehn Anmeldeversuche je Viertelstunde und Absender-IP. Wer diese Zahl reißt,
bekommt eine Meldung, die das sagt, und wartet eine Viertelstunde.

### Personen anlegen, Startpasswort, sperren

**Verwaltung → Personen → Person anlegen**: Vorname, Nachname, E-Mail und der
Schalter „Verwaltung“ (macht zum Administrator). Das Gerät erzeugt das
**Startpasswort** und zeigt es **einmal** — zum Kopieren oder als Zettel zum
Drucken. Danach steht es nirgends mehr; ein neues erzeugt der Schlüssel in der
Zeile. Angemeldet wird mit der E-Mail. Der letzte Administrator behält das
Recht „Verwaltung“; das Gerät weist es ab, auch wenn er selbst klickt.

**Sperren** nimmt den Zugang und meldet alle angemeldeten Rechner der Person ab;
ihre Entscheidungen und Läufe bleiben stehen. Löschen ist der zweite Schritt,
nicht der erste.

Wenn Sie einer Person ein Startpasswort **geben** (beim Anlegen oder über den
Schlüssel in der Zeile), kennen zwei Menschen es: die Person und Sie. Das
Gerät merkt sich das. Bei der nächsten Anmeldung kommt sie deshalb nicht in
die Oberfläche, sondern auf eine Seite, die ein neues Passwort verlangt — ohne
„Später"; der einzige Weg daneben ist Abmelden. Dort sieht sie auch Name und
Bild zum Prüfen. Danach kennt das Passwort nur noch sie.

Dasselbe gilt für das Startpasswort des Administrators, das die Installation
einmal auf dem Bildschirm zeigt.

Nach dem Wechsel sind **alle** Sitzungen des Betroffenen beendet; er meldet
sich einmal neu an. Das ist der Zweck: wer wechselt, weil ein Zweiter das alte
Passwort kannte, will genau das.

### Passwort ändern

1. Öffnen Sie **Einstellungen → Passwort**
2. Geben Sie das aktuelle Passwort ein
3. Geben Sie das neue Passwort ein (mindestens 12 Zeichen)
4. Bestätigen Sie das neue Passwort

### Passwort-Anforderungen

- Mindestens 12 Zeichen
- Großbuchstaben und Kleinbuchstaben
- Mindestens eine Zahl
- Mindestens ein Sonderzeichen

---

## 8. Netzwerk & Fernzugriff

> **Denkmodell:** LAN-Zugriff ist der Auslieferungs-Standard, Fernzugriff ist
> ein bewusstes Opt-in via Tailscale. In beiden Fällen erreichen Sie das Gerät
> über **einen Namen** (statt roher IP): im LAN `https://<hostname>.local`,
> unterwegs `https://<geraet>.<tailnet>.ts.net`.

### Lokaler Zugriff

Das System ist über das lokale Netzwerk erreichbar:

- **Web:** `https://<hostname>.local` (selbstsigniertes Zertifikat, Warnung beim ersten Aufruf bestätigen)
- **SSH:** `ssh -p 2222 arasul@<jetson-ip>`

### Fernzugriff mit Tailscale (Opt-in)

Tailscale ermöglicht sicheren Zugriff von überall - ohne Port-Forwarding oder VPN-Server.

**Einrichtung:**

1. Kostenloses Konto auf [tailscale.com](https://login.tailscale.com) erstellen
2. Tailscale-App auf Ihrem Laptop/Handy installieren
3. Auth-Key erstellen unter Admin > Settings > Keys
4. Im Dashboard unter **Verwaltung → Gerät → Fernzugriff** den Schalter
   einschalten und im Dialog den Schlüssel einfügen

**Nach der Einrichtung:**

- Dashboard: `https://<geraet>.<tailnet>.ts.net` oder `https://<tailscale-ip>`
  (beides von überall erreichbar). Es antwortet dasselbe Traefik mit demselben
  Zertifikat wie im Firmennetz; die Browserwarnung geht weg, sobald das
  Gerätezertifikat verteilt ist (Verwaltung → Gerät → Fernzugriff).
- SSH: `ssh arasul@<tailscale-ip>`

**Status prüfen:** Im Dashboard unter Verwaltung → Gerät → Fernzugriff steht
der Schalter (an oder aus) mit der Adresse für unterwegs und der Adresse im
Firmennetz. Aufgeklappt unter „Technik“: Tailscale-IP, Tailnet, die Geräte im
Tailnet und der SSH-Befehl. Ausschalten fragt nach, und warnt ausdrücklich,
wenn Sie gerade selbst über den Fernzugriff angemeldet sind.

Detaillierte Dokumentation: [REMOTE_MAINTENANCE.md](REMOTE_MAINTENANCE.md)

### Netzwerk-Anforderungen

| Port | Dienst    | Richtung  |
| ---- | --------- | --------- |
| 80   | HTTP      | Eingehend |
| 443  | HTTPS     | Eingehend |
| 2222 | SSH       | Eingehend |
| -    | Tailscale | Ausgehend |

Tailscale benötigt nur ausgehende Verbindungen (UDP Port 41641) - keine eingehenden Ports.
Alle anderen Ports sind durch die Firewall gesperrt.
