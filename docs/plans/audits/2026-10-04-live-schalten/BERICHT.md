# Abnahme: Live schalten mit Sicherung und Rückfall (M5), 04.10.2026

Auftrag `live-schalten-mit-sicherung`, PR #879 (gemergt als `9e5a826e`). Gemessen
am Orin nach Deploy 37182489833 (Migration 199 angewendet, alle Dienste gesund),
mit `scripts/test/live-schalten-abnahme.sh` und der Probe-App `tests/probe-live`
(Stempel `probe-live-1004`, eigene Test- und Live-Datenbank). Die Apps
`abschluss`, `belege`, `probe-faktum-belege` und die Wegwerf-Apps des Kits
blieben unberührt. Konto: `probe-admin`, keine neuen.

## Ergebnis

| Lauf | Ergebnis       | kaputt (sichern, scheitern, zurück) | gut (sichern, schalten, gesund) | Live-Zeilen vorher / nach Rückfall / nach gut |
| ---- | -------------- | ----------------------------------- | ------------------------------- | --------------------------------------------- |
| 1    | 35 von 35 grün | 23 s                                | 17 s                            | 7 / 7 / 7                                     |
| 2    | 35 von 35 grün | 23 s                                | 16 s                            | 7 / 7 / 7                                     |
| 3    | 35 von 35 grün | 22 s                                | 17 s                            | 7 / 7 / 7                                     |

Drei Läufe in Folge grün, jeder im Browser mit Bildern (die Bilder hier sind
aus Lauf 3).

## Was gemessen wurde

- **Vorher gesichert:** Vor jedem Live-Schalten entsteht ein restic-Stand mit
  `fuer:live:probe-live-1004`; er steht in der Liste der Stände.
- **Kaputte Strukturänderung (2.0.0):** Im Test gelingt sie, live scheitert sie
  am doppelten Text mittendrin, der Prozess endet mit Exit 1. Das Gerät schaltet
  selbst zurück: Livestand wieder 1.0.0, sieben Einträge Text für Text gleich,
  keine Spalte `kostenstelle`, keine Tabelle `halb_angelegt`.
- **Ein Satz an den Admin:** „Die neue Fassung 2.0.0 ließ sich nicht starten,
  deshalb läuft Probe Live schalten wieder mit Fassung 1.0.0 und den Daten von
  vorher." Zweiter Satz: was er tun kann. Technik (Grund, Stand der Sicherung,
  letzte Zeilen) nur aufgeklappt (`kaputt-zurueckgeschaltet.png`,
  `kaputt-technik.png`).
- **Änderungstext:** Steht am Teststand, im Dialog vor dem Schalten
  (`kaputt-dialog.png`, `gut-dialog.png`) und wandert mit in den Livestand.
- **Gute Strukturänderung (3.0.0):** live in 16 bis 17 s, alle sieben Live-Zeilen
  erhalten, die neue Spalte da, kein Hinweis in der Livekarte (`gut-live.png`).
- **Test bekommt nie Live-Daten:** Die Testfassung lief durchgehend, die
  Testdatenbank hatte immer nur ihre zwei Einträge, keine Live-Zeile.
- **Aufräumen:** App samt Datenbanken entfernt, kein Ordner unter `/arasul/apps`,
  die zwei eigenen Stände je Lauf einzeln mit `restic forget`, kein fremder Stand
  entfallen.

## Nach dem Deploy am Gerät

Dreizehn Plattform-Dienste gesund, die Apps `abschluss`, `belege`,
`probe-faktum-belege` laufen unverändert weiter.

## Beobachtet, nicht Auftrag

- In der aufgeklappten Technik steht beim Rückfall „Exit-Code —": der Container
  startet wegen der Neustart-Regel neu, bevor der Exit-Code gelesen wird. Der Grund
  („abgestürzt und neu gestartet") und die letzten Zeilen nennen den Fehler trotzdem.
- Die erste CI von #879 war rot im Wächter Werksreset: `app_schaltungen` fehlte in
  `werksreset/tabellen.js`. Eingeordnet unter AUSLIEFERUNG (Nachweis wie
  `update_events`, hängt an `apps`).
