---
name: zwei-stufen
beschreibung: Ein Beleg geht durch zwei Freigabestufen, erst Pruefung, dann Leitung (Abnahme M5).
argumente:
  - name: beleg
    typ: freitext
    pflicht: true
    beschreibung: Die Nummer des Belegs
werkzeuge: [freigabe_anfordern]
stufen:
  - name: pruefung
    bezeichnung: Prüfung
  - name: leitung
    bezeichnung: Leitung
schritte:
  - name: pruefen
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Beleg {{beleg}} sachlich pruefen
      zusammenhang: Der Beleg {{beleg}} ist erfasst und wartet auf die sachliche Pruefung.
      stufe: pruefung
  - name: zeichnen
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Beleg {{beleg}} zeichnen
      zusammenhang: Der Beleg {{beleg}} ist geprueft und wartet auf die Zeichnung der Leitung.
      stufe: leitung
grenzen:
  zeitlimit_s: 600
---

Der Beleg {{beleg}} ist in beiden Stufen freigegeben. Schreibe genau einen Satz
darueber, wer geprueft und wer gezeichnet hat; die Schritte nennen die Namen.
Keine Anrede, keine Erfindungen.
