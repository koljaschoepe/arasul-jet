# Abnahme Demo als Metallbauer mit sechs Apps (J54, M7), 22.11.2026

Karte `demo-metallbau-sechs-apps`. `apps/dashboard-frontend/demo/abnahme.mjs`
gegen den lokalen Bau (`dist-demo/`, Server mit den Regeln aus `vercel.json`),
Browser auf Englisch gestellt: Deutsch und Englisch bei 360, 390, 768 und
1440 px. **Alle acht Läufe grün**: Startseite mit Firma, Person und „Für
Sie", kein Band, nirgends „Sample"; in jeder der fünf Fach-Apps ein Eintrag
angelegt, einer geändert, eine Datei (PDF oder Zeichnung) geöffnet;
Werkstatt; Einstellungen; der geführte Weg beginnt nicht von selbst, geht
über fünf Schritte und schließt mit Escape; „Zurücksetzen" stellt die 42
Angebote wieder her. Kein waagrechter Überlauf, keine fremde Herkunft
(2996 Anfragen, eine Herkunft), keine Anfrage an `/api/…` am Server, kein
Fehler in der Konsole, im Englischen kein deutscher Satz in Shell und
Werkstatt.

Bilder: `<sprache>-<breite>-1-start`, `-2-<app>` (Liste),
`-3-<app>-angelegt` (Blatt nach der Anlage), `-4-<app>-datei` (Datei
geöffnet), `-5-werkstatt`, `-6-weg`, `-7-weg-werkstatt`. Eine Auswahl, der
volle Satz entsteht mit `--bilder`.

## Drei Durchsichten durch einen unbeteiligten Prüfer

Ein Subagent, je Runde neu, sah nur Bilder (14 oder 15), als Geschäftsführer
eines Metallbauers ohne Vorwissen: „Sieht das aus wie die echte Software
dieser Firma oder wie eine Kulisse? Was wirkt leer, unecht, unfertig?"

**Runde 1** („Kulisse"): Testeinträge „Abnahme wartungsplan" in den Bildern
(aus dem Prüfskript), Zeiten nachts und sonntags, genau vier Lieferungen je
Woche, Kennzahl „Nächste 14 Tage" passt nicht zur Liste, Miriam genehmigt
ihren eigenen Urlaub, Fassungsnummer im Seitenkopf, bei 768 px liegt die
Kapsel über „Prüfung erfassen", am Handy gekürzte Kacheln und abgeschnittene
Schnellzugriffe, PDF-Sollwert „>= 80 µm", 20 offene Freigaben.
Behoben: echte Texte im Prüfskript, Zeitpunkte nur werktags 7 bis 17 Uhr,
Lieferungen unregelmäßig, Fassung nur in der Testfassung, die Kapsel misst
beim Laden eines Rahmens sofort nach, Schnellzugriffe brechen um, kürzere
Beschriftungen, sieben Freigaben, Bildschirmfotos an drei Meldungen.

**Runde 2** („Kulisse, aber eine gute"): Sonntag als „heute" mit
Lieferungen, alle Zeiten auf derselben Minute, Urlaubsdiagramm zählt nur den
ersten Tag, „Liefertreue 100 %" neben drei Reklamationen, 600 Schutzgläser,
Rot für „wartet auf Ihre Freigabe", „1 warten", Wartungsdiagramm mit sechs
leeren Monaten, Meldung verdeckt am Handy Felder.
Behoben: am Wochenende zählt der nächste Werktag für das Tor, Minuten
gestreut, Abwesenheit über die ganze Dauer, verspätete Lieferungen, wartende
Freigaben blau, Grammatik, Wartung über sechs Monate, Meldung am Handy oben.

**Runde 3** („Kulisse, wenn auch eine gute"; die Fachlichkeit „stimmt"):
Briefkopf mit „.example", „Summe" und „Netto" doppelt ohne Rabatt,
„Prüfungen offen 3" neben „3 zur Freigabe, 3 in Nacharbeit", Wartungsplan
nicht nach Fälligkeit und mit einer Prüfung am 25.12., Achse „160k",
„Resturlaub im S…" am Handy, „Start, 7 offen" im Englischen, holprige Sätze.
Behoben: Briefkopf mit Telefon statt Adresse im Netz, Summe nur mit Rabatt,
Oberfläche eindeutig, Kennzahl „Prüfprotokolle · zur Freigabe", Wartungsplan
nach Fälligkeit, Feiertage um den Jahreswechsel frei, „Tsd.", kürzere
Beschriftungen, Wörterbuch ergänzt.

## Bewusst nicht übernommen

- **Die Demo-Zeile in der Kapsel** („Demo", „Zurücksetzen", „Zur Website"):
  alle drei Runden wollten sie weg. Die Karte verlangt sie als ruhige Zeile;
  sie ist am Rechner eine Zeile, am Handy ein Knopf „Demo".
- **Live und Test, „Werkstatt", „Test nach Live", „Icon"**: das ist das
  Produkt (Kapsel, mitgelieferte App seit J52), nicht die Demo. Für einen
  Metallbauer ist „Werkstatt" als Name des Rückmelde-Eingangs missverständlich
  (alle drei Runden); das gehört als Frage an das Produkt, nicht in diese Karte.
- **„Liegt bei Ihnen." in jeder Zeile von „Für Sie"** und **die Zahl der
  Freigaben, die erst nach bis zu zwei Minuten nachzieht**: Verhalten der
  Shell (`OffeneFreigaben`, Abruf alle zwei Minuten).
- **Leiste links ohne Beschriftung**: Entwurf (Name beim Überfahren).

## Gefunden am Produkt und behoben

**Der Seitenkopf quetschte am Handy den Titel** („G…" auf der Startseite,
sobald „Sieben Freigaben warten auf Sie" daneben stand). Bibliothek 5.11.1:
Werkzeuge und Aktionen brechen in die nächste Zeile um, der Titel behält
mindestens 12rem (`packages/marken/src/marken.css`). Am Rechner ändert sich
nichts.
