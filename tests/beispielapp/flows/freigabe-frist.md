---
name: freigabe-frist
beschreibung: Dasselbe wie `freigabe`, aber mit einer sehr kurzen Frist.
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
      titel: Wochenbericht fuer KW {{woche}} versenden (kurze Frist)
      zusammenhang: >-
        Diese Freigabe laeuft absichtlich nach zwoelf Sekunden ab. Sie gehoert
        zur Abnahme (scripts/test/freigabe-abnahme.sh) und belegt, dass ein Lauf
        ohne Entscheidung als `abgelaufen` endet -- und nicht als Fehler.
      frist_minuten: 0.2
grenzen:
  zeitlimit_s: 300
---

Der Wochenbericht fuer die Kalenderwoche {{woche}} ist freigegeben worden.
Schreibe genau einen Satz darueber. Keine Anrede, keine Erfindungen.
