---
name: bei-eingang
beschreibung: Hört auf beleg.eingegangen, ruft eine Route der eigenen App und zwei der zweiten App (Abnahme M5, Ereignis und Routen).
argumente:
  - name: nummer
    typ: freitext
    pflicht: true
  - name: betrag
    typ: freitext
ausloeser:
  - typ: hand
  - typ: ereignis
    ereignis: beleg.eingegangen
werkzeuge: [route_aufrufen]
routen:
  - methode: GET
    pfad: /info
    zweck: Wer die eigene App ruft
  - app: __APP_B__
    methode: POST
    pfad: /eintrag
    zweck: Legt in der zweiten App einen Eintrag an
  - app: __APP_B__
    methode: GET
    pfad: /kunden/{nummer}
schritte:
  - name: eigene
    typ: werkzeug
    werkzeug: route_aufrufen
    parameter:
      methode: GET
      pfad: /info
  - name: eintragen
    typ: werkzeug
    werkzeug: route_aufrufen
    parameter:
      app: __APP_B__
      methode: POST
      pfad: /eintrag
      daten: ['nummer={{nummer}}', 'betrag={{betrag}}']
  - name: nachsehen
    typ: werkzeug
    werkzeug: route_aufrufen
    parameter:
      app: __APP_B__
      methode: GET
      pfad: /kunden/{{nummer}}
grenzen:
  zeitlimit_s: 120
---

Antworte mit einem Wort.
