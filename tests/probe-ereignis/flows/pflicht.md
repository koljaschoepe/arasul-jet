---
name: pflicht
beschreibung: Hört auf beleg.eingegangen, braucht aber ein Argument, das das Ereignis nicht mitbringt (Abnahme M5, Ereignis und Routen).
argumente:
  - name: kunde
    typ: freitext
    pflicht: true
ausloeser:
  - typ: ereignis
    ereignis: beleg.eingegangen
grenzen:
  zeitlimit_s: 120
---

Antworte mit einem Wort.
