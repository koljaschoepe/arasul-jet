---
name: von-hand
beschreibung: Startet von Hand, ruft eine Route der eigenen App und rechnet mit der festen Antwort der Probe-App (Abnahme M5, Verwaltung Läufe).
ausloeser:
  - typ: hand
werkzeuge: [route_aufrufen]
routen:
  - methode: GET
    pfad: /info
    zweck: Wer die eigene App ruft
schritte:
  - name: eigene
    typ: werkzeug
    werkzeug: route_aufrufen
    parameter:
      methode: GET
      pfad: /info
grenzen:
  zeitlimit_s: 120
---

Antworte mit einem Wort.
