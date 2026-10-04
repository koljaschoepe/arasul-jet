---
name: kaputt
beschreibung: Ruft eine Route, die sein Kopf nicht nennt, und endet deshalb als Fehler, ohne Modell (Abnahme M5, Verwaltung Läufe).
ausloeser:
  - typ: hand
werkzeuge: [route_aufrufen]
routen:
  - methode: GET
    pfad: /info
schritte:
  - name: loeschen
    typ: werkzeug
    werkzeug: route_aufrufen
    parameter:
      methode: POST
      pfad: /loeschen
grenzen:
  zeitlimit_s: 120
---

Antworte mit einem Wort.
