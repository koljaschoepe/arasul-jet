---
beschreibung: Holt eine Freigabe ein und schreibt danach einen Satz mit dem Modell.
argumente:
  - name: vorgang
    typ: freitext
    pflicht: true
    beschreibung: Der Vorgang, um den es geht
werkzeuge: [freigabe_anfordern]
schritte:
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Vorgang {{vorgang}} abschliessen
      zusammenhang: >-
        Der Vorgang {{vorgang}} ist fertig. Bitte bestaetigen, oder mit einem
        Grund ablehnen.
      frist_minuten: 60
grenzen:
  zeitlimit_s: 600
---

Der Vorgang {{vorgang}} ist freigegeben worden. Schreibe genau einen Satz
darueber, wer ihn freigegeben hat; der Schritt „freigeben" nennt den Namen.
Keine Anrede, keine Erfindungen.
