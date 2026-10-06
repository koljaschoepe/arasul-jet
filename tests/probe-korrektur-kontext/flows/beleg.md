---
name: beleg
beschreibung: Liest Lieferant, Betrag und Datum aus dem Original eines Belegs; ein zweiter Schritt schreibt mit dem Modell einen Satz über die Buchung (Abnahme M5, Korrektur im Kontext).
argumente:
  - name: original
    typ: freitext
    pflicht: true
    beschreibung: Der Pfad des Originals relativ zur App, z. B. api/belege/2026-0815.png
arten: [ergebnis_bestaetigen]
werkzeuge: [subagent]
rollen:
  - name: leser
    ergebnis: { felder: [lieferant, betrag, datum], aenderbar: [betrag, datum] }
    prompt: >-
      Du liest einen Kassenbeleg oder eine Rechnung aus dem beigefügten Bild.
      lieferant ist der Name des Unternehmens, das den Beleg ausgestellt hat.
      betrag ist die Gesamtsumme mit Komma und zwei Nachkommastellen, ohne Währung.
      datum ist das Belegdatum in der Form TT.MM.JJJJ.
  - name: schreiber
    ergebnis: { felder: [text] }
    prompt: >-
      Du schreibst für die Buchhaltung genau einen deutschen Satz über eine Buchung.
      Nenne Lieferant, Betrag und Datum. Wurde ein Feld von einem Menschen geändert,
      nenne die Änderung mit altem und neuem Wert; wurde nichts geändert, sage das nicht. Antworte als JSON mit dem Feld text.
schritte:
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: Lies Lieferant, Betrag und Datum aus dem Beleg.
    faehigkeiten: { text: true, bild: true }
    original: '{{original}}'
  - name: satz
    typ: subagent
    rolle: schreiber
    auftrag: >-
      Schreibe einen Satz über die Buchung nach diesen Werten: {{lesen}}
grenzen:
  zeitlimit_s: 600
---

Gib den Satz des Schritts „satz" wörtlich wieder.
