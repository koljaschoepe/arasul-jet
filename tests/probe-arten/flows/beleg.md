---
name: beleg
beschreibung: Liest einen Beleg und meldet fehlende oder unsichere Felder (Abnahme M5, erkennend).
argumente:
  # standard: "" bei datum und unsicher: ein leeres optionales Argument ohne
  # standard laesst seinen Platzhalter stehen (runFlow.resolveArguments), und
  # `"{{datum}}"`/`[{{unsicher}}]` waeren kein JSON mehr.
  - name: datum
    typ: freitext
    pflicht: false
    beschreibung: Was als Datum erkannt wurde, leer = nicht erkannt
    standard: ''
  - name: unsicher
    typ: freitext
    pflicht: false
    beschreibung: Feldnamen in Anführungszeichen, die unsicher sind, durch Komma getrennt
    standard: ''
arten: [autonom, ergebnis_bestaetigen]
werkzeuge: [subagent]
rollen:
  - name: leser
    ergebnis: { felder: [betrag, datum] }
    prompt: Du gibst die vorgegebenen Werte unverändert als JSON aus, ohne etwas zu ergänzen.
schritte:
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: 'Gib genau dieses JSON aus: <<<{"betrag": "12,50", "datum": "{{datum}}", "unsicher": [{{unsicher}}]}>>>'
    faehigkeiten: { text: true, bild: true }
grenzen:
  zeitlimit_s: 600
---

Nenne in einem Satz Betrag und Datum aus den Schritten. Keine Erfindungen.
