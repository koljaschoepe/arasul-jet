# Abnahme Entwickler-Cockpit am Orin (J44, M7), 20.11.2026

Karte `entwickler-cockpit`. Stand am Gerät: `f1b99884` (PR 946), Deploy
44742287347 grün. Skript: `scripts/test/entwickler-cockpit-abnahme.mjs`, als
`probe-admin` (Kennzeichen Entwickler) und `probe-j36-a` (Mitarbeiter ohne
Kennzeichen), Chromium und WebKit, 1440 und 390 px.

**Ergebnis: 70 von 70 grün** (dritter Lauf; der erste und zweite fanden zwei
Fehler im Skript selbst, siehe unten).

## Was belegt ist

| Teil der Karte                                             | Beleg                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sichtbar nur mit Kennzeichen, auch nicht über die Adresse  | Mitarbeiter und Administrator ohne Kennzeichen: kein Eintrag in `/api/apps/meine`, `/apps/entwickler-cockpit/` und `/apps/entwickler-cockpit/app.json` 403, `/api/entwickler/apps` 403, Stand setzen 403, keine Kachel in der Leiste; Mitarbeiter: live schalten 403                                  |
| Mitgeliefert, in der Aktivitätsleiste                      | Eintrag `leiste-app-entwickler-cockpit-live`, Seite aus dem Abbild des Backends                                                                                                                                                                                                                       |
| Eingang mit Text, Bild, Seite, Person, Stand; Stand setzen | die vier Meldungen „Abnahme J42“ in allen vier Browsern; Meldung offen mit geladenem Bild; „Abgelehnt“ ohne Grund gesperrt, mit Grund gespeichert, am Gerät nachgelesen, danach über dieselbe Route auf „neu“ zurückgesetzt                                                                           |
| Apps: Test, Live, zuletzt geändert, offene Meldungen       | `*-apps.png`                                                                                                                                                                                                                                                                                          |
| Test nach Live mit einem Klick, Sicherung vorher, Rückweg  | Probe-App `probe-cockpit-1120`: wartende Fassung mit Änderungstext, Klick und Rückfrage, live geschaltet, ein Stand „vor dem Live-Schalten“ (`fuer:live:probe-cockpit-1120`) neu in der Liste, Live-Daten erhalten; „Zurück“ setzt die Fassung davor live, am Ende steht die neue Fassung wieder live |
| Am Handy bedienbar                                         | 390 px in Chromium und WebKit: Leiste als Blatt, alle drei Ansichten, Meldung öffnen und schließen, kein seitliches Rollen                                                                                                                                                                            |
| Liste aus J42 entfällt                                     | Verwaltung ohne Bereich Rückmeldungen                                                                                                                                                                                                                                                                 |

## Gefunden und behoben

- **„Zurück“ auch für Belege.** `chromium-1440-zurueck-moeglich.png` zeigt unter
  „Zuletzt live geschaltet“ auch Belege (geschaltet am 07.10.). Ein Klick hätte
  nach der Rückfrage die echte App auf 0.3.0 gesetzt. Seit dem PR nach der
  Abnahme bietet das Cockpit den Rückweg nur in den 24 Stunden nach einer
  Schaltung an (`zurueckMoeglich`, Test in `logik.test.ts`); die Verwaltung
  behält ihren.
- Im Skript: das Bild wurde geprüft, bevor es geladen war; das Blatt der Leiste
  bei 390 px war beim zweiten Klick noch in Bewegung; die Maske von Playwright
  über dem iframe brach in Chromium ab (jetzt Unschärfe im Dokument); ein
  Abbruch ließ den Wegwerf-Schlüssel stehen (von Hand widerrufen, seither
  widerruft das Skript auch beim Abbruch).

## Was am Gerät bleibt

Gelöscht wurde nichts. Die Probe-App `probe-cockpit-1120` (Container,
Datenbank, Fassungen 1.0.0 bis 3.0.2, live 3.0.2) bleibt am Gerät, ebenso die
Stände der Sicherung, die ihr Live-Schalten angelegt hat. Entfernen, wenn
gewünscht: Verwaltung › Apps › Probe Cockpit › App entfernen. Die Wegwerf-Schlüssel
der drei Läufe sind widerrufen. Die Zeile einer App, deren Name einen
Kundennamen trägt, ist in den Bildern unscharf.

## Lauf

```
gruen  Mitarbeiter probe-j36-a: kein Cockpit in /api/apps/meine
gruen  Mitarbeiter probe-j36-a: /apps/entwickler-cockpit/ ist zu  (403)
gruen  Mitarbeiter probe-j36-a: auch keine Datei aus der App  (403)
gruen  Mitarbeiter probe-j36-a: /api/entwickler/apps 403
gruen  Mitarbeiter probe-j36-a: Stand setzen 403
gruen  Mitarbeiter probe-j36-a: live schalten 403
gruen  Administrator ohne Kennzeichen: kein Cockpit in /api/apps/meine
gruen  Administrator ohne Kennzeichen: /apps/entwickler-cockpit/ ist zu  (403)
gruen  Administrator ohne Kennzeichen: auch keine Datei aus der App  (403)
gruen  Administrator ohne Kennzeichen: /api/entwickler/apps 403
gruen  Administrator ohne Kennzeichen: Stand setzen 403
gruen  Administrator ohne Kennzeichen: kein Cockpit in der Leiste
gruen  Kennzeichen Entwickler wieder gesetzt  (200)
gruen  Mit Kennzeichen: Cockpit in /api/apps/meine
gruen  Mit Kennzeichen: die Seite kommt
gruen  Wegwerf-Schlüssel mit app:deploy
—      probe-cockpit-1120 gibt es vom ersten Lauf, live 3.0.1; neu in den Test: 3.0.2
gruen  probe-cockpit-1120 3.0.2 in den Test, mit Änderungstext
gruen  Die Übersicht sagt: Test neuer als live  (3.0.1 / 3.0.2)
gruen  chromium 390px: der Eingang lädt im Rahmen
gruen  chromium 390px: die Meldungen „Abnahme J42“ stehen da  (4)
gruen  chromium 390px: kein seitliches Rollen im Eingang
gruen  chromium 390px: eine Meldung öffnet sich
gruen  chromium 390px: Apps zeigt die Probe-App
gruen  chromium 390px: kein seitliches Rollen in Apps
gruen  chromium 390px: Zeilen im Bild abgedeckt  (1)
gruen  chromium 390px: Test nach Live zeigt 3.0.2
gruen  chromium 390px: mit Änderungstext
gruen  chromium 390px: kein seitliches Rollen in Test nach Live
gruen  webkit 1440px: Cockpit in der Leiste
gruen  webkit 1440px: der Eingang lädt im Rahmen
gruen  webkit 1440px: die Meldungen „Abnahme J42“ stehen da  (4)
gruen  webkit 1440px: kein seitliches Rollen im Eingang
gruen  webkit 1440px: Apps zeigt die Probe-App
gruen  webkit 1440px: kein seitliches Rollen in Apps
gruen  webkit 1440px: Zeilen im Bild abgedeckt  (1)
gruen  webkit 1440px: Test nach Live zeigt 3.0.2
gruen  webkit 1440px: mit Änderungstext
gruen  webkit 1440px: kein seitliches Rollen in Test nach Live
gruen  webkit 390px: der Eingang lädt im Rahmen
gruen  webkit 390px: die Meldungen „Abnahme J42“ stehen da  (4)
gruen  webkit 390px: kein seitliches Rollen im Eingang
gruen  webkit 390px: eine Meldung öffnet sich
gruen  webkit 390px: Apps zeigt die Probe-App
gruen  webkit 390px: kein seitliches Rollen in Apps
gruen  webkit 390px: Zeilen im Bild abgedeckt  (1)
gruen  webkit 390px: Test nach Live zeigt 3.0.2
gruen  webkit 390px: mit Änderungstext
gruen  webkit 390px: kein seitliches Rollen in Test nach Live
gruen  chromium 1440px: Cockpit in der Leiste
gruen  chromium 1440px: der Eingang lädt im Rahmen
gruen  chromium 1440px: die Meldungen „Abnahme J42“ stehen da  (4)
gruen  chromium 1440px: kein seitliches Rollen im Eingang
gruen  chromium 1440px: Apps zeigt die Probe-App
gruen  chromium 1440px: kein seitliches Rollen in Apps
gruen  chromium 1440px: Zeilen im Bild abgedeckt  (1)
gruen  chromium 1440px: Test nach Live zeigt 3.0.2
gruen  chromium 1440px: mit Änderungstext
gruen  chromium 1440px: kein seitliches Rollen in Test nach Live
gruen  Verwaltung ohne Bereich Rückmeldungen
gruen  Meldung offen mit Bild
gruen  Abgelehnt ohne Grund: Speichern gesperrt
gruen  Stand und Grund stehen am Gerät
gruen  Stand der Meldung 1 wieder wie vorher  (neu)
gruen  Live geschaltet, Satz im Cockpit  (Probe Cockpit ist liveEs läuft jetzt Fassung 3.0.2.)
gruen  Live steht auf 3.0.2, nichts wartet
gruen  Sicherung vorher: ein Stand „vor dem Live-Schalten“  (d349432cde4f8eaffa4dd1431cc3bc7f1551d7670b32c01475c600cb543ecf0f)
gruen  Die Live-Daten sind noch da
gruen  Zurück: live wieder 3.0.1, 3.0.2 wartet wieder
gruen  Am Ende: 3.0.2 live, nichts wartet
gruen  Wegwerf-Schlüssel widerrufen  (200)
—      Die Probe-App probe-cockpit-1120 bleibt am Gerät (nichts wird gelöscht).

Alles grün.
```
