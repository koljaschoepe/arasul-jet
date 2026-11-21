# Abnahme Demo als geführter Weg (J51, M7), 21.11.2026

`apps/dashboard-frontend/demo/abnahme.mjs` gegen den lokalen Bau
(`dist-demo/`, Server mit den Regeln aus `vercel.json`): Deutsch und Englisch
bei 390, 768 und 1440 px, der ganze Weg in fünf Schritten, alle sechs Läufe
grün, kein Überlauf, keine fremde Herkunft, keine Anfrage an `/api/…` am
Server.

Bilder je Sprache und Breite: `1-weg-app` (Schritt 1, Startseite),
`2-weg-rueckmeldung` (Schritt 2 in Angebote), `3-markierung` (das Formular
mit Foto und Markierung), `4-weg-entwickler` (Schritt 3), `5-weg-eingang`
(Schritt 4 im Cockpit), `6-weg-live` (Schritt 5), `6-weg-geschafft` (der
Abschluss nach dem Live-Schalten), `7-rabatt` (Angebote 1.5.0 live),
`8-wartungsplan`, `8-urlaub`.

## Drei Durchsichten durch einen unbeteiligten Prüfer

Ein Subagent sah nur diese Bilder, als Fremder und als strenger Gestalter.

**Runde 1** (15 Befunde): Englisch mit deutschen Resten auf der Startseite;
der Hinweis verdeckte die Kachel daneben und die Kennzahlen; der KI-Schritt
war nicht erklärt; „Fertig“ stand neben einem nicht gedrückten „Live
schalten“; „in 1 Tagen“; Knopf in der Tabelle zu groß; Urlaub am Handy als
Zeichensalat; Band am Handy über den Rand. Alles behoben.

**Runde 2** (12 Befunde): Der Hinweis verdeckte weiter, was daneben erklärt
wird; unklar, ob „Weiter“ oder selbst klicken; deutsches Datum im Englischen;
Spalte Betreff bei 768 px gekürzt. Behoben: der Hinweis steht unten rechts,
der Ring zeigt die Stelle, die Knöpfe heißen nach dem, was sie tun
(„Angebote öffnen“, „Zum Entwickler“, „Live schalten“), Datum englisch als
21/11/2026, Betreff bricht um.

**Runde 3**: „Am Desktop darf die Demo so vor Fremde.“ Am Handy: der
Abschluss verdeckte „Zurück“, die Knöpfe im Band wirkten oben abgeschnitten
(die 44 px der Shell sprengten das Band), Zurücksetzen und Website fehlten.
Behoben: Abschluss unter der Meldung, eigene Trefferfläche im Band, „Von
vorn“ und „Zur Website“ im Abschluss.

Offen, weil sie das Produkt betreffen und nicht die Demo: die Leiste unten
bricht lange Namen am Handy auf zwei Zeilen; die Datumsfelder des Browsers
folgen seiner Sprache; die Zeilenhervorhebung der Tabelle hat Lücken
zwischen den Zellen; „Icon“ und „Symbol“ stehen im Cockpit nebeneinander.
