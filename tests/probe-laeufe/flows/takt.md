---
name: takt
beschreibung: Läuft jede Minute und rechnet mit der festen Antwort der Probe-App (Abnahme M5, Verwaltung Läufe).
ausloeser:
  - typ: zeitplan
    zeitplan: '* * * * *'
grenzen:
  zeitlimit_s: 120
---

Antworte mit einem Wort.
