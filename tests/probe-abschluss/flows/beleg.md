---
name: beleg
beschreibung: Liest einen Beleg, ein Mensch korrigiert das Datum, die App bekommt das Ergebnis mit den korrigierten Feldern (Abnahme M5, Abschluss).
argumente:
  # standard: "" -- ein leeres optionales Argument ohne standard laesst seinen
  # Platzhalter stehen, und `"{{datum}}"` waere kein JSON mehr.
  - name: datum
    typ: freitext
    pflicht: false
    beschreibung: Was als Datum erkannt wurde, leer = nicht erkannt
    standard: ''
arten: [autonom, ergebnis_bestaetigen]
abschluss:
  route: /abschluss/beleg
werkzeuge: [subagent]
rollen:
  - name: leser
    ergebnis: { felder: [betrag, datum], aenderbar: [datum] }
    prompt: Du gibst die vorgegebenen Werte unverändert als JSON aus, ohne etwas zu ergänzen.
schritte:
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: 'Gib genau dieses JSON aus: <<<{"betrag": "12,50", "datum": "{{datum}}"}>>>'
    faehigkeiten: { text: true, bild: true }
grenzen:
  zeitlimit_s: 600
---

Nenne in einem Satz Betrag und Datum aus den Schritten. Keine Erfindungen.
