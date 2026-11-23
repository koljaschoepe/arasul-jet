# Demo, zweite Runde: Auswertungen und Stammdaten (J55, M7), 23.11.2026

Karte `demo-auswertungen-und-stammdaten`. Zwei Teile:

- **Teil 1, PR 978** (gemergt 23.11. vormittags, am Orin und auf
  `arasul-demo.vercel.app`): Reiter je Fach-App (Übersicht, Liste,
  Auswertung, bei Urlaub und Wartung Kalender), Auswertung mit Zeitraum, CSV
  und Drucken, Mehrfachauswahl mit Sammelaktion, Drucken und PDF an jedem
  Vorgang, Stammdaten (Kunden, Lieferanten, Maschinen, Personen) mit
  Einzelansicht und den Vorgängen aus allen Apps, „Für Sie" nennt einmal,
  dass alles bei Ihnen liegt, der Filter der Werkstatt am Handy so breit wie
  die Karten.
- **Teil 2, dieser PR**: Startseite mit zwei Diagrammen über alle fünf
  Fach-Apps („Offen je App", „Bewegung je Woche") und der Auslastung der
  Woche; dazu die Befunde aus sechs Durchsichten eines unbeteiligten Prüfers
  (Bestand wie ein Betrieb mit 62 Leuten, Aufträge in den Stammdaten,
  Nummern seit Einführung, Positionen mit Menge und Einheitspreis,
  Prüfungen in Fertigungsfolge).

## Abnahme

`apps/dashboard-frontend/demo/abnahme.mjs` gegen den lokalen Bau
(`dist-demo/`, Server mit den Regeln aus `vercel.json`): Deutsch und
Englisch bei 360, 390, 768 und 1440 px, **alle acht Läufe grün**. Je Lauf:
Startseite mit zwei Diagrammen und Auslastung, jede Fach-App mit Reitern,
Auswertung (vier oder fünf Teile), Mehrfachauswahl, Liste (Angebote 320,
Wareneingang 246, Prüfprotokolle 92, Wartung 40, Urlaub 40), ein Eintrag
angelegt, einer geändert, Datei und PDF geöffnet; Stammdaten mit 64 Kunden,
vom Kunden zum Angebot und zurück; Werkstatt; geführter Weg. Kein
waagrechter Überlauf, keine fremde Herkunft, keine Anfrage an `/api/…` am
Server, kein Fehler in der Konsole, im Englischen kein deutscher Satz.
Danach dieselbe Abnahme gegen die Auslieferung, Ergebnis unten.

## Durchsichten durch einen unbeteiligten Prüfer

Je Runde ein neuer Subagent, nur mit Bildern, als Geschäftsführer eines
Metallbauers mit rund 60 Leuten: Kulisse oder glaubwürdig?

Runden 1 bis 5 liefen vor einem Netzabbruch der Sitzung; ihre Urteile
wurden nicht mitgeschrieben, ihre Befunde stehen in den Commits:

1. Bestand wie ein Betrieb mit 60 Leuten (Mengen, Wochentage, Zeiten).
2. Aufträge als eigener Stamm, 62 Personen statt einer Handvoll.
3. Kunden je Vorhaben passend, Nummern seit Einführung statt ab 1,
   Positionen im Angebot mit Menge und Einheitspreis.
4. Auftragsnummern im Jahr ab 001, Montage pauschal (Menge mal Preis
   stimmt auf den Cent), Filter „davon abgelaufen".
5. Vorhaben passend zum Kunden, Maße im Betreff, Prüfungen erst ab
   Auftragsbeginn.

**Runde 6** (17 Bilder, Stand vor dem Commit „sechste Durchsicht"):
Urteil **„glaubwürdig"**, knapp. „Die Zahlen passen über die Bilder hinweg
erstaunlich gut zusammen. Ich habe nachgerechnet: Annahmequote,
Liefertreue, Lieferantennoten, Anwesenheit je Tag, die Positionen im
Angebot und die Fälligkeiten in Wartung und Urlaub stimmen."

Behoben aus Runde 6:

| Befund                                                  | Behebung                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| Edelstahl-Angebot mit „Material S235"                   | bei Edelstahl „Material 1.4301"                                  |
| Rathaus-Geländer an einen Bauträger                     | Betreff der Abnahme neutral („Treppenhaus Nord")                 |
| „Nach Rücksprache mit dem Kunden." im Feld Naht         | die Abnahme füllt die Naht mit „N7"                              |
| Abnahme vor Ort vor der Sichtprüfung desselben Auftrags | Prüfungen je Auftrag in Fertigungsfolge, Abnahme zuletzt         |
| „1 Aufträge", „1 orders"                                | Einzahl                                                          |
| Kachel „22 offen, 7 abgelaufen" liest sich als „davon"  | „22 offen, dazu 7 abgelaufen"                                    |
| Kästchen „Alle auswählen" sieht gewählt aus             | Bildfehler der Abnahme (Farbübergang mitten im Bild), sie wartet |
| „Meldungen 9, zu den Apps, noch offen" unklar           | „Rückmeldungen zu den Apps, offen"                               |
| „alle fünf Apps" bei sieben Kacheln                     | „alle fünf Fach-Apps"                                            |
| „steht gleich darunter unter ‚Für Sie‘"                 | „steht direkt darunter bei ‚Für Sie‘" (auch im Produkt)          |

**Bewusst offen** (keine siebte Runde, Auftrag: höchstens noch eine):

- Größenordnung: rund 3,1 Mio. € Auftragseingang im Jahr, 18 Lieferungen im
  Monat, 40 Urlaubsanträge; für 60 Leute eher das Doppelte bis Dreifache.
  Mehr Bestand macht die Demo langsamer im Browser und ändert die Aussage
  nicht; zu entscheiden, wenn die Demo vor Metallbauern läuft.
- Kundenarten unscharf („Kommune" neben „Öffentlicher Bau"), Planer mit
  eigenem Umsatz; Gemeinkosten (Mischgas, Trennscheiben) einem Auftrag
  zugeordnet; sich wiederholende Betreffs. Feinheiten des Bestands.
- Produktfrage: Prüfprotokolle nach EN 1090 gibt die Schweißaufsicht frei,
  nicht die Geschäftsführung; die Software sollte je Stufe festlegen, wer
  freigibt (kann sie: Freigabestufen je App, hier nur so eingestellt).

## Bilder

Stand nach Runde 6, lokaler Bau. `start-01-ganz-de.png` und
`start-01-ganz-en.png` zeigen die ganze Startseite bei 1440 px.

| Bild                                                                                           | zeigt                                                            |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `start-01-ganz-de.png`, `-en`                                                                  | Startseite ganz: Kennzahlen, Für Sie, zwei Diagramme, Auslastung |
| `de-1440-1-start.png`                                                                          | Startseite, erster Bildschirm                                    |
| `de-768-1-start.png`, `de-390-1-start.png`, `en-360-1-start.png`                               | Startseite schmal                                                |
| `de-1440-2-angebote-uebersicht.png`                                                            | Angebote, Reiter Übersicht                                       |
| `de-1440-2-angebote.png`, `de-390-2-angebote.png`                                              | Liste mit Mehrfachauswahl                                        |
| `de-1440-2-angebote-auswertung.png`                                                            | Auswertung                                                       |
| `de-1440-4-angebote-datei.png`                                                                 | Angebot als PDF mit Positionen                                   |
| `de-1440-2-wareneingang-auswertung.png`                                                        | Liefertreue, Lieferanten                                         |
| `de-1440-2-wartungsplan-kalender.png`, `de-1440-2-urlaub-kalender.png`                         | Kalender                                                         |
| `de-1440-2-pruefprotokolle.png`                                                                | Prüfungen in Fertigungsfolge                                     |
| `de-1440-2-stammdaten.png`, `de-1440-3-stammdaten-kunde.png`, `en-1440-3-stammdaten-kunde.png` | Stammdaten, Kunde mit Vorgängen                                  |

## Live

PR 979 gemergt am 23.11.2026, 21:27 UTC (`5309d56b`), CI Summary grün.
Deploy auf den Orin grün (Lauf 45269854112): `dashboard-frontend` und
`dashboard-backend` gesund, `/api/health` meldet `20261123-5309d56`, das
Bündel trägt den neuen Satz der Startseite; 22 Container gesund, keiner
krank.

Demo von `main` von Hand an das Vercel-Projekt `arasul-demo` ausgeliefert
(`dpl_3ak5WpsHayqMaV97nTXcVR3dRifH`). Die Abnahme gegen
`https://arasul-demo.vercel.app`: **alle acht Läufe grün**, Deutsch und
Englisch bei 360, 390, 768 und 1440 px. Bilder von dort:
`live-de-1440-1-start.png`, `live-en-390-1-start.png`.
