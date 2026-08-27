---
name: wochenbericht
beschreibung: Fasst eine Kalenderwoche in wenigen Saetzen zusammen.
argumente:
  - name: woche
    typ: freitext
    pflicht: true
    beschreibung: Die Kalenderwoche, um die es geht
werkzeuge: [subagent]
rollen:
  - name: sammler
    beschreibung: Traegt zusammen, was in der Woche zu tun war.
    werkzeuge: []
    ergebnis:
      felder: [punkte]
      max_zeichen: 600
    runden: 1
    prompt: >-
      Du bekommst eine Kalenderwoche. Nenne drei kurze, allgemeine Punkte, die
      in einer Wochenzusammenfassung eines Handwerksbetriebs stehen koennten.
      Erfinde keine Namen und keine Zahlen. Antworte nur mit dem Ergebnis-JSON.
schritte:
  - name: sammeln
    typ: subagent
    rolle: sammler
    auftrag: Kalenderwoche {{woche}}.
grenzen:
  zeitlimit_s: 300
---

Schreibe aus den gesammelten Punkten einen Wochenbericht fuer die
Kalenderwoche {{woche}}: hoechstens fuenf Saetze, sachlich, ohne Anrede.
