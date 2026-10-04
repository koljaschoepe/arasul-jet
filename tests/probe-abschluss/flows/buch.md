---
name: buch
beschreibung: Erzeugt einen kurzen Text und uebergibt ihn an die Route der App (Abnahme M5, Abschluss).
argumente:
  - name: thema
    typ: freitext
    pflicht: true
    beschreibung: Das Thema
abschluss:
  route: /abschluss/buch
werkzeuge: [subagent]
rollen:
  - name: schreiber
    ergebnis: { felder: [text] }
    prompt: Du schreibst genau einen kurzen Satz zum Thema. Antworte als JSON mit dem Feld text.
schritte:
  - name: schreiben
    typ: subagent
    rolle: schreiber
    auftrag: 'Schreibe einen Satz zum Thema {{thema}}. <<<{"text": "Ein Satz zum Thema {{thema}}."}>>>'
grenzen:
  zeitlimit_s: 600
---

Gib den Satz aus den Schritten unverändert wieder. Keine Anrede, keine Erfindungen.
