---
name: texte
beschreibung: Erzeugt einen kurzen Text zu einem Thema (Abnahme M5, erzeugend).
argumente:
  - name: thema
    typ: freitext
    pflicht: true
    beschreibung: Das Thema
arten: [autonom, ergebnis_bestaetigen]
werkzeuge: [subagent]
rollen:
  - name: schreiber
    ergebnis: { felder: [text] }
    prompt: Du schreibst genau einen kurzen Satz zum Thema. Antworte als JSON mit dem Feld text.
schritte:
  - name: schreiben
    typ: subagent
    rolle: schreiber
    auftrag: Schreibe einen Satz zum Thema {{thema}}.
grenzen:
  zeitlimit_s: 600
---

Gib den Satz aus den Schritten unverändert wieder. Keine Anrede, keine Erfindungen.
