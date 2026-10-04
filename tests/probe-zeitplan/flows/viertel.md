---
name: viertel
beschreibung: Alle 15 Minuten; bei einem Ausfall von vier Stunden zählt nur der letzte Termin, die übrigen stehen als übersprungen (Abnahme M5, Zeitplaner).
ausloeser:
  - typ: zeitplan
    zeitplan: '*/15 * * * *'
grenzen:
  zeitlimit_s: 120
---

Antworte mit einem Wort.
