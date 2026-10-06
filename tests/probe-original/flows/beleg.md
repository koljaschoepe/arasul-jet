---
name: beleg
beschreibung: Liest Lieferant, Betrag und Datum aus dem Original eines Belegs (Abnahme M5, Kontrakt 14). Der Auftrag nennt keinen dieser Werte; sie kommen nur aus dem Bild.
argumente:
  - name: original
    typ: freitext
    pflicht: true
    beschreibung: Der Pfad des Originals relativ zur App, z. B. api/belege/2026-0815.png
arten: [ergebnis_bestaetigen, autonom]
werkzeuge: [subagent]
rollen:
  - name: leser
    ergebnis: { felder: [lieferant, betrag, datum], aenderbar: [betrag, datum] }
    prompt: >-
      Du liest einen Kassenbeleg oder eine Rechnung aus dem beigefügten Bild.
      lieferant ist der Name des Unternehmens, das den Beleg ausgestellt hat.
      betrag ist die Gesamtsumme mit Komma und zwei Nachkommastellen, ohne Währung.
      datum ist das Belegdatum in der Form TT.MM.JJJJ.
schritte:
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: Lies Lieferant, Betrag und Datum aus dem Beleg.
    faehigkeiten: { text: true, bild: true }
    original: '{{original}}'
grenzen:
  zeitlimit_s: 600
---

Nenne in einem Satz Lieferant, Betrag und Datum des Belegs. Keine Erfindungen.
