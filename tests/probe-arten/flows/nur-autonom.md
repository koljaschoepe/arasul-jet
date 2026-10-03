---
name: nur-autonom
beschreibung: Kann nur autonom, eine andere Art weist das Backend ab (Abnahme M5).
arten: [autonom]
werkzeuge: [subagent]
rollen:
  - name: schreiber
    ergebnis: { felder: [text] }
    prompt: Du schreibst genau einen kurzen Satz. Antworte als JSON mit dem Feld text.
schritte:
  - name: schreiben
    typ: subagent
    rolle: schreiber
    auftrag: Schreibe einen Satz über das Wetter.
grenzen:
  zeitlimit_s: 600
---

Gib den Satz aus den Schritten unverändert wieder.
