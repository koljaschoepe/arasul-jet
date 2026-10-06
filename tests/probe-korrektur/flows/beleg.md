---
name: beleg
beschreibung: Liest einen Beleg, laesst ein unsicheres Feld pruefen und korrigieren, bucht mit dem bestaetigten Wert und legt ihn der Leitung vor (Abnahme M5, Korrekturfelder).
argumente:
  # standard: "" bei datum und unsicher: ein leeres optionales Argument ohne
  # standard laesst seinen Platzhalter stehen (runFlow.resolveArguments), und
  # `"{{datum}}"`/`[{{unsicher}}]` waeren kein JSON mehr.
  - name: beleg
    typ: freitext
    pflicht: true
    beschreibung: Die Nummer des Belegs, zugleich der Name des Originals
  - name: datum
    typ: freitext
    pflicht: false
    beschreibung: Was als Datum erkannt wurde, leer = nicht erkannt
    standard: ''
  - name: unsicher
    typ: freitext
    pflicht: false
    beschreibung: Feldnamen in Anfuehrungszeichen, die unsicher sind, durch Komma getrennt
    standard: ''
arten: [autonom]
werkzeuge: [subagent, freigabe_anfordern]
stufen:
  - name: pruefung
    bezeichnung: Prüfung
  - name: leitung
    bezeichnung: Leitung
rollen:
  - name: leser
    ergebnis: { felder: [betrag, datum], aenderbar: [datum] }
    prompt: Du liest einen Beleg und gibst Betrag und Datum als JSON aus.
  - name: bucher
    ergebnis: { felder: [buchung] }
    prompt: Du buchst den Beleg mit genau den Feldern, die du bekommst.
schritte:
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: 'Lies den Beleg {{beleg}}. <<<{"betrag": "12,50", "datum": "{{datum}}", "unsicher": [{{unsicher}}]}>>>'
    faehigkeiten: { text: true, bild: true }
    original: 'api/belege/{{beleg}}.png'
  - name: buchen
    typ: subagent
    rolle: bucher
    auftrag: 'Buche: <<<{{lesen}}>>>'
  - name: zeichnen
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: 'Beleg {{beleg}} zeichnen'
      zusammenhang: '{{buchen}}'
      stufe: leitung
grenzen:
  zeitlimit_s: 600
---

Nenne in einem Satz, was gebucht wurde. Keine Erfindungen.
