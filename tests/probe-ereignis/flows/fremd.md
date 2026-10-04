---
name: fremd
beschreibung: Hört auf beleg.fremd und ruft eine Route der zweiten App, die sein Kopf nicht nennt (Abnahme M5, Ereignis und Routen).
ausloeser:
  - typ: ereignis
    ereignis: beleg.fremd
werkzeuge: [route_aufrufen]
routen:
  - app: __APP_B__
    methode: POST
    pfad: /eintrag
schritte:
  - name: loeschen
    typ: werkzeug
    werkzeug: route_aufrufen
    parameter:
      app: __APP_B__
      methode: POST
      pfad: /loeschen
grenzen:
  zeitlimit_s: 120
---

Antworte mit einem Wort.
