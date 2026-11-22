# Abnahme Werkstatt und Rechte am Orin (J52, M7), 22.11.2026

Karte `werkstatt-und-rechte`. Stand am Gerät: PR 970, Deploy 45059354633 grün,
Migration 218 angewendet, 25 Container, keiner krank. Skript:
`scripts/test/werkstatt-abnahme.mjs`, als `probe-admin` (mit dem Recht in der
Werkstatt) und `probe-j36-a` (Mitarbeiter ohne das Recht, ohne eine einzige
App-Freigabe), Chromium und WebKit, 1440 und 390 px.

**Ergebnis: 90 von 90 grün** (zweiter Lauf; der erste brach nach 32 grünen
Prüfungen ab, weil WebKit am Mac fehlte, nicht am Gerät).

## Was belegt ist

| Teil der Karte                                                    | Beleg                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Die App heißt Werkstatt, die alte Adresse leitet um               | `/apps/entwickler-cockpit/` antwortet 301 auf `/apps/werkstatt/`; Titel „Werkstatt“, Symbol `hammer` in `/api/apps/meine`, Abbild `mitgeliefert/werkstatt/`                                                                      |
| Steht jedem mit Zugriff offen                                     | beide Konten: Werkstatt in `/api/apps/meine` und in der Leiste, die Seite kommt; `probe-j36-a` hat keine App-Freigabe und meldet zur Werkstatt selbst                                                                            |
| Ohne das Recht nur eigene Meldungen mit Stand und Ablehnungsgrund | Schnittstelle: Sicht „eigene“, nur Meldungen der Person; im Browser „Meine Meldungen“, die eigene Meldung „Abgelehnt“ mit Satz und Grund, keine Seite Eingang, Apps, Live (`ohne-recht-*`)                                       |
| Nie Meldungen oder Bilder anderer                                 | keine fremde Meldung in Antwort und Oberfläche (alle Texte fremder Meldungen geprüft); fremdes Bild 404, eigenes 200; Apps, Stand setzen, Entfernen, Live schalten 403                                                           |
| Mit dem Recht alle samt Bildern, Stand setzen, Apps, Live         | Sicht „alle“; Eingang mit der Meldung des Mitarbeiters und Bild; „Abgelehnt“ ohne Grund gesperrt, mit Grund gespeichert und am Gerät nachgelesen; Probe-App 3.0.3 aus dem Test live geschaltet, Sicherung vorher (`mit-recht-*`) |
| Recht in der Verwaltung je Person, als Recht benannt              | Verwaltung › Personen: Spalte „Werkstatt“, keine Spalte „Entwickler“, Schalter „Recht in der Werkstatt für …“ (gemessen, nicht fotografiert: echte Namen)                                                                        |
| Kein seitliches Rollen                                            | in jeder Ansicht beider Sichten, beide Browser, beide Breiten                                                                                                                                                                    |

Die Kit-Schnittstelle ist unverändert (Wege und Felder; Einheitstests
`rueckmeldungenKit.test.js` unverändert grün).

## Bilder

`mit-recht-<browser>-<breite>-{eingang,apps,test-nach-live}.png`, dazu bei
Chromium 1440 `-meldung` (Stand setzen) und `-live-geschaltet`;
`ohne-recht-<browser>-<breite>-{meine,meldung}.png`. Eine Probe-App mit dem
Namen eines Kunden ist in der Shell ausgeblendet und in der Liste der Apps
unscharf; Kennung und Wort kamen nur aus der Umgebung des Laufs
(`ARASUL_AUSBLENDEN`, `ARASUL_ABDECKEN`), nicht aus dem Repo.

## Gefunden und behoben

- **Meldungen zur Werkstatt selbst trugen die Kennung als App-Namen**
  („werkstatt“ statt „Werkstatt“, sichtbar in `*-eingang.png` und
  `ohne-recht-*`): die mitgelieferte App steht nicht in der Tabelle `apps`.
  Seit dem PR dieser Abnahme kommt der Name aus `mitgeliefert.js`
  (Test in `rueckmeldungen.test.js`). Die Bilder zeigen den Stand vor dem Fix.
- **Die Demo wurde aus der CI nicht ausgeliefert**: dem Repo fehlt das
  Geheimnis `VERCEL_TOKEN`, der Lauf meldet das nur als Hinweis und bleibt
  grün. Von Hand ausgeliefert, wie in `docs/features/DEMO.md` beschrieben;
  die Abnahme der Demo gegen `https://arasul-demo.vercel.app` danach 6 von 6
  Wegen grün (de/en, 390/768/1440 px), samt eigener Sicht des Mitarbeiters.
- Im Skript: ein zweiter Lauf nimmt jetzt die Meldung und die wartende
  Testfassung des ersten, statt neue anzulegen.

## Was am Gerät bleibt

Gelöscht wurde nichts, keine Freigabe und kein Kennzeichen geändert. Es
bleiben: die Meldung 6 von `probe-j36-a` zur Werkstatt (Stand „abgelehnt“ mit
Grund „Abnahme J52: nur eine Probe …“), die Fassung 3.0.3 der Probe-App
`probe-cockpit-1120` (live) mit ihrem Stand der Sicherung vor dem Schalten.
Der Wegwerf-Schlüssel mit `app:deploy` ist widerrufen.
