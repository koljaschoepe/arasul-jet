---
name: freigabe
beschreibung: Holt vor dem Versand des Wochenberichts eine Freigabe ein.
argumente:
  - name: woche
    typ: freitext
    pflicht: true
    beschreibung: Die Kalenderwoche, um die es geht
werkzeuge: [freigabe_anfordern]
schritte:
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Wochenbericht fuer KW {{woche}} versenden
      zusammenhang: >-
        Der Bericht fuer die Kalenderwoche {{woche}} ist fertig und soll an die
        Belegschaft gehen. Bitte bestaetigen, oder mit einem Grund ablehnen.
      frist_minuten: 60
grenzen:
  zeitlimit_s: 300
---

Der Wochenbericht fuer die Kalenderwoche {{woche}} ist freigegeben worden.
Schreibe genau einen Satz darueber, wer ihn freigegeben hat; der Schritt
„freigeben" nennt den Namen. Keine Anrede, keine Erfindungen.
