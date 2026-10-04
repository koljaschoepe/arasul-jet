# Abnahme: Apps im Hintergrund, Sortieren, Symbol (M5), 04.10.2026

Auftrag `apps-im-hintergrund-und-sortieren`, PR #890 (Funktion) und #891
(Korrektur). Gemessen am Orin nach dem Deploy 37194964890, alle Dienste gesund,
mit `scripts/test/leiste-abnahme.sh` und `leiste-bilder.mjs`. Vier Probe-Apps
`probe-leiste-1004-1` bis `-4` aus `tests/probe-leiste` (nur Frontend: ein
Eingabefeld, eine lange Seite, eine Marke je Laden). Konten: `probe-admin`,
`probe-j36-a`, keine neuen. Der Browser läuft auf dem Rechner (Chromium über
Playwright) und redet über den Tunnel mit dem Orin.

## Ergebnis

| Lauf | Ergebnis       | Anmerkung                                                                                                       |
| ---- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| 0    | 22 von 24 grün | **Befund:** Rahmen im Hintergrund luden neu. React hängt umsortierte Kinder um, ein umgehängter iframe lädt neu |
| 1    | 24 von 24 grün | nach #891: der Stapel zeichnet in der Reihenfolge des ersten Öffnens                                            |
| 2    | 24 von 24 grün |                                                                                                                 |
| 3    | 24 von 24 grün |                                                                                                                 |

(Lauf 0 meldete außerdem, dass das Fenster mit vier Apps nicht scrollt: der Test
nahm ein zu hohes Fenster, jetzt 220 px.)

Danach: keine Probe-App am Orin (`/arasul/apps`, `docker ps`, Tabelle `apps`),
Freigaben zurückgenommen, Reihenfolge von `probe-j36-a` und `probe-admin` wieder
leer (keine Zeile mit gesetzter Reihenfolge), Wegwerf-Schlüssel widerrufen,
Tunnel und Browser beendet.

## Zahlen

| Messung                                             | Wert                                                   |
| --------------------------------------------------- | ------------------------------------------------------ |
| Wechsel App → App aus dem Hintergrund, 10 je Lauf   | größter 31 bis 32 ms, Median 29 bis 30 ms (Grenze 200) |
| Wechsel Startseite ↔ App im Hintergrund, 20 je Lauf | größter 32 bis 44 ms, Median 29 ms                     |
| Browser (Summe RSS aller Prozesse), nur Startseite  | 303 bis 306 MB                                         |
| Browser mit drei Apps im Hintergrund                | 340 bis 341 MB, also **etwa 35 MB mehr**               |
| Browser nach den 30 Wechseln                        | 359 bis 363 MB                                         |
| Platz in der Leiste bei 720 px Fensterhöhe          | etwa 13 Apps, danach scrollt sie                       |

Gemessen wird bis zum zweiten Zeichnen nach dem Klick. Die Probe-Apps sind
klein (eine Seite ohne Skriptlast); eine echte App mit Tabellen und Diagrammen
kostet je Rahmen mehr, die Rechnung bleibt: drei Rahmen mehr als eine offene
App. Der Speicher ist Summe RSS, gemeinsam genutzte Seiten sind mehrfach
gezählt, der Wert ist eine obere Schätzung.

## Was gemessen wurde

- **Symbol:** `symbol` kommt mit `GET /api/apps/meine` an. `file-text` zeichnet
  das Lucide-Bild, `Q7` das Kürzel, ohne Symbol und bei unbekanntem Namen steht
  das Kürzel aus dem Namen (`GL`, `DL`). Bild: `symbol-leiste.png`.
- **Hintergrund:** vier Apps nacheinander geöffnet, je Eingabe und Scrollstand.
  Mit d offen sind a, b, c am Leben und behalten Eingabe, Scrollstand und die
  Marke des Ladens (kein Neuladen). Auf der Startseite leben genau drei
  verborgene Rahmen (a, d, c), b ist herausgefallen und fängt beim nächsten
  Öffnen von vorn an. Nach 30 Wechseln sind Eingabe und Scrollstand von c noch
  da. Bilder: `hintergrund-*.png`.
- **Sortieren:** Ziehen (HTML5, im Browser mit `dragTo`) ordnet die Leiste; die
  Reihenfolge steht am Gerät (`GET /api/apps/reihenfolge`), nicht im
  `localStorage`; eine frische zweite Sitzung derselben Person sieht sie, die
  von `probe-admin` bleibt leer. Alt+Pfeil runter/hoch ordnet mit der
  Tastatur, der Fokus bleibt auf dem Knopf, `aria-live` sagt den Platz an.
  Nach dem Neuladen derselbe Stand. In einem 220 px hohen Fenster scrollt die
  Leiste der Apps, Zahnrad und Konto bleiben im Bild. Bilder:
  `sortieren-*.png`.

## Festgelegt

- **„Die letzten drei im Hintergrund"** heißt: die offene App und drei weitere
  bleiben am Leben (vier Rahmen); auf der Startseite oder in einer anderen
  Ansicht sind es drei. Die am längsten nicht benutzte fällt heraus.
- Ziehen geht nur mit der Maus (HTML5-Drag); am Handy bleibt die Tastatur-
  Alternative, bis die Karte handy-und-notizen-weg die Leiste umbaut.
- Lucide-Namen kommen in einem eigenen Bündel (`icons-*.js`, 460 kB, 120 kB
  gzip), das erst geladen wird, wenn eine App einen Namen nennt.
